const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const MoodCheckin = require('../models/MoodCheckin');
const Consent = require('../models/Consent');
const ShareGrant = require('../models/ShareGrant');
const AuditLog = require('../models/AuditLog');
const AdminApplication = require('../models/AdminApplication');
const Session = require('../models/Session');
const { resetCache } = require('../db');
const { provisionInitialSuperAdmin } = require('../lib/seed');

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.INITIAL_ADMIN_EMAIL = 'superadmin@unburden.test';
  process.env.INITIAL_ADMIN_PASSWORD = 'SuperSecretPassword!2026';
  process.env.NODE_ENV = 'test';

  resetCache();
  app = require('../server');

  // Trigger health check to ensure DB connection + initial seed + super_admin provisioning
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test('1. Security Headers & Initial Super-Admin Idempotent Provisioning', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
  assert.ok(!res.headers['content-security-policy'].includes('unsafe-eval'));

  // Verify initial super_admin exists
  const admin = await User.findOne({ email: 'superadmin@unburden.test' });
  assert.ok(admin);
  assert.equal(admin.role, 'super_admin');

  // Verify idempotency: running provisionInitialSuperAdmin again with different password does NOT overwrite existing super_admin
  process.env.INITIAL_ADMIN_PASSWORD = 'DifferentPassword999!';
  const secondRun = await provisionInitialSuperAdmin();
  assert.equal(String(secondRun._id), String(admin._id));
  process.env.INITIAL_ADMIN_PASSWORD = 'SuperSecretPassword!2026';

  // Original password still works
  const loginCheck = await request(app)
    .post('/api/login')
    .send({ email: 'superadmin@unburden.test', password: 'SuperSecretPassword!2026' });
  assert.equal(loginCheck.status, 200);
});

test('2. Authentication, Duplicate Rejection, Session Cookie & Privilege Escalation Prevention', async () => {
  // Attempt privilege escalation by sending role: "super_admin" in public registration
  const regRes = await request(app)
    .post('/api/register')
    .send({
      name: 'Alice Learner',
      email: 'alice@example.com',
      password: 'AliceStrongPassword123!',
      country: 'IN',
      age: 22,
      consent: true,
      role: 'super_admin', // Must be ignored by server!
      optionalConsents: {
        assessment_storage: false,
        mood_tracking: false,
      },
    });

  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.ok, true);
  assert.equal(regRes.body.role, 'user', 'Public registration must always assign role=user');
  const setCookie = regRes.headers['set-cookie'] || [];
  assert.ok(setCookie.some((c) => c.includes('unburden_sid=') && c.includes('HttpOnly')));

  // Duplicate email rejection
  const dupRes = await request(app)
    .post('/api/register')
    .send({
      name: 'Alice Duplicate',
      email: 'alice@example.com',
      password: 'AliceStrongPassword123!',
      consent: true,
    });
  assert.equal(dupRes.status, 409);

  // Invalid login rejected
  const badLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'WrongPassword!' });
  assert.equal(badLogin.status, 401);

  // NoSQL injection login payload rejected safely
  const nosqlLogin = await request(app)
    .post('/api/login')
    .send({ email: { $gt: '' }, password: { $gt: '' } });
  assert.equal(nosqlLogin.status, 400);

  // Valid login succeeds
  const loginRes = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceStrongPassword123!' });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.role, 'user');

  // Password reset lifecycle (single-use token)
  const resetReq = await request(app)
    .post('/api/password/request-reset')
    .send({ email: 'alice@example.com' });
  assert.equal(resetReq.status, 200);
  assert.ok(resetReq.body.resetToken);

  const resetComplete = await request(app)
    .post('/api/password/reset')
    .send({ token: resetReq.body.resetToken, newPassword: 'AliceUpdatedPassword456!' });
  assert.equal(resetComplete.status, 200);

  // Token reuse must fail
  const resetReuse = await request(app)
    .post('/api/password/reset')
    .send({ token: resetReq.body.resetToken, newPassword: 'AnotherPassword789!' });
  assert.equal(resetReuse.status, 400);
});

test('3. Admin Application Workflow: Submit, Unauthorized Review Blocked, Super Admin Approve, Single-Use Invite, Expiry & Rejection', async () => {
  const aliceLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceUpdatedPassword456!' });
  const aliceToken = aliceLogin.body.token;

  // Submit application for Responder role
  const appRes = await request(app)
    .post('/api/admin-applications')
    .send({
      fullName: 'Dr. Ravi Sharma',
      email: 'ravi.responder@clinic.org',
      organisation: 'Community Mental Health Clinic',
      designation: 'Licensed Psychiatric Counselor',
      requestedRole: 'responder',
      reason: 'Provide consent-gated crisis follow-up and support coordination for consenting users.',
      qualifications: 'M.Phil Clinical Psychology, 8 years crisis helpline supervision.',
      policyAccepted: true,
    });
  assert.equal(appRes.status, 201);
  const applicationId = appRes.body.applicationId;
  assert.equal(appRes.body.status, 'pending_review');

  // Check application status publicly
  const statusRes = await request(app)
    .get(`/api/admin-applications/status?email=ravi.responder@clinic.org&id=${applicationId}`);
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.status, 'pending_review');

  // Ordinary user CANNOT review or approve admin applications
  const unauthReview = await request(app)
    .post(`/api/admin/applications/${applicationId}/review`)
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ decision: 'approved', reviewNotes: 'Self approval attempt' });
  assert.equal(unauthReview.status, 403);

  // Login as Super Admin
  const adminLogin = await request(app)
    .post('/api/login')
    .send({ email: 'superadmin@unburden.test', password: 'SuperSecretPassword!2026' });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.role, 'super_admin');
  const superAdminToken = adminLogin.body.token;

  // Super Admin approves Ravi's Responder application
  const approveRes = await request(app)
    .post(`/api/admin/applications/${applicationId}/review`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ decision: 'approved', reviewNotes: 'Credentials verified with institution.' });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.status, 'approved');
  const inviteToken = approveRes.body.invitationToken;
  assert.ok(inviteToken && inviteToken.length === 64);

  // Approval does NOT create the user account before email + password verification
  const preInviteUser = await User.findOne({ email: 'ravi.responder@clinic.org' });
  assert.equal(preInviteUser, null);

  // Wrong email with valid token must fail verification
  const wrongEmailInvite = await request(app)
    .post('/api/admin-applications/accept-invite')
    .send({
      token: inviteToken,
      email: 'wrong@clinic.org',
      password: 'RaviResponderPassword123!',
    });
  assert.equal(wrongEmailInvite.status, 400);

  // Valid invitation activation creates verified Responder account
  const activateRes = await request(app)
    .post('/api/admin-applications/accept-invite')
    .send({
      token: inviteToken,
      email: 'ravi.responder@clinic.org',
      password: 'RaviResponderPassword123!',
    });
  assert.equal(activateRes.status, 201);
  assert.equal(activateRes.body.role, 'responder');

  // Reusing the single-use invitation token must be rejected
  const reuseRes = await request(app)
    .post('/api/admin-applications/accept-invite')
    .send({
      token: inviteToken,
      email: 'ravi.responder@clinic.org',
      password: 'RaviResponderPassword123!',
    });
  assert.equal(reuseRes.status, 400);

  // Test rejection workflow (must not create account or token)
  const rejectApp = await request(app)
    .post('/api/admin-applications')
    .send({
      fullName: 'Unverified Applicant',
      email: 'rejected@example.org',
      organisation: 'Unknown Org',
      designation: 'Observer',
      requestedRole: 'analyst',
      reason: 'Want to look at platform data without institutional backing.',
      qualifications: 'None provided for verification.',
      policyAccepted: true,
    });
  const rejectReview = await request(app)
    .post(`/api/admin/applications/${rejectApp.body.applicationId}/review`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ decision: 'rejected', reviewNotes: 'Insufficient institutional credentials.' });
  assert.equal(rejectReview.status, 200);
  assert.equal(rejectReview.body.status, 'rejected');
  assert.equal(rejectReview.body.invitationToken, undefined);

  // Test expired invitation token rejection
  const expiredApp = await request(app)
    .post('/api/admin-applications')
    .send({
      fullName: 'Expired Applicant',
      email: 'expired@clinic.org',
      organisation: 'Test Clinic',
      designation: 'Analyst',
      requestedRole: 'analyst',
      reason: 'Testing expired token handling for SDG 3.4 analytics.',
      qualifications: 'Public health researcher.',
      policyAccepted: true,
    });
  const expiredApprove = await request(app)
    .post(`/api/admin/applications/${expiredApp.body.applicationId}/review`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ decision: 'approved' });
  await AdminApplication.findByIdAndUpdate(expiredApp.body.applicationId, {
    inviteExpiresAt: new Date(Date.now() - 60000),
  });
  const expiredAccept = await request(app)
    .post('/api/admin-applications/accept-invite')
    .send({
      token: expiredApprove.body.invitationToken,
      email: 'expired@clinic.org',
      password: 'ValidPassword123!',
    });
  assert.equal(expiredAccept.status, 400);
});

test('4. Granular Consent Enforcement: Assessment & Mood Storage Blocked Without Consent, Allowed With Consent', async () => {
  const aliceLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceUpdatedPassword456!' });
  const aliceToken = aliceLogin.body.token;

  // Attempt to save PHQ-9 assessment without assessment_storage consent -> must return 403
  const blockedAssessment = await request(app)
    .post('/api/assessment/submit')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({
      type: 'phq9',
      responses: [1, 1, 2, 1, 0, 1, 1, 0, 2], // Item 9 = 2 (> 0)
      functionalImpairment: 'somewhat_difficult',
    });
  assert.equal(blockedAssessment.status, 403);
  assert.equal(blockedAssessment.body.requiresConsent, 'assessment_storage');
  assert.equal(blockedAssessment.body.item9Positive, true);

  // Attempt to save Mood check-in without mood_tracking consent -> must return 403
  const blockedMood = await request(app)
    .post('/api/mood')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ rating: 4, note: 'Feeling calmer today' });
  assert.equal(blockedMood.status, 403);
  assert.equal(blockedMood.body.requiresConsent, 'mood_tracking');

  // Grant assessment_storage and mood_tracking consents explicitly
  const grantAss = await request(app)
    .post('/api/consents')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ category: 'assessment_storage', granted: true });
  assert.equal(grantAss.status, 200);

  const grantMood = await request(app)
    .post('/api/consents')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ category: 'mood_tracking', granted: true });
  assert.equal(grantMood.status, 200);

  // Now submit PHQ-9 assessment -> must succeed and persist in MongoDB
  const savedAssessment = await request(app)
    .post('/api/assessment/submit')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({
      type: 'phq9',
      responses: [1, 1, 2, 1, 0, 1, 1, 0, 2], // Total = 9 (Mild), Item 9 = 2 (Positive)
      functionalImpairment: 'somewhat_difficult',
    });
  assert.equal(savedAssessment.status, 200);
  assert.equal(savedAssessment.body.saved, true);
  assert.equal(savedAssessment.body.score, 9);
  assert.equal(savedAssessment.body.severityCategory, 'Mild');
  assert.equal(savedAssessment.body.item9Positive, true);

  // Submit a second historical PHQ-9 assessment to verify longitudinal history (not overwritten)
  const secondAssessment = await request(app)
    .post('/api/assessment/submit')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({
      type: 'phq9',
      responses: [0, 1, 1, 0, 0, 1, 0, 0, 0], // Total = 3 (Minimal)
      functionalImpairment: 'not_difficult',
    });
  assert.equal(secondAssessment.status, 200);

  const myHistory = await request(app)
    .get('/api/assessments/my')
    .set('Authorization', `Bearer ${aliceToken}`);
  assert.equal(myHistory.status, 200);
  assert.equal(myHistory.body.assessments.length, 2);

  // Save Mood check-in -> must succeed
  const savedMood = await request(app)
    .post('/api/mood')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ rating: 4, note: 'Evening walk helped' });
  assert.equal(savedMood.status, 201);
  assert.equal(savedMood.body.checkin.label, 'Good');
});

test('5. Responder Access Control, ShareGrants, Super-Admin Privacy Boundary & Mandatory Audit Trail', async () => {
  const aliceLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceUpdatedPassword456!' });
  const aliceToken = aliceLogin.body.token;
  const aliceUser = await User.findOne({ email: 'alice@example.com' });

  const raviLogin = await request(app)
    .post('/api/login')
    .send({ email: 'ravi.responder@clinic.org', password: 'RaviResponderPassword123!' });
  const raviToken = raviLogin.body.token;

  const adminLogin = await request(app)
    .post('/api/login')
    .send({ email: 'superadmin@unburden.test', password: 'SuperSecretPassword!2026' });
  const superAdminToken = adminLogin.body.token;

  // 1. Responder CANNOT access Alice's record before she grants permission
  const deniedBeforeGrant = await request(app)
    .get(`/api/responder/clients/${aliceUser._id}`)
    .set('Authorization', `Bearer ${raviToken}`);
  assert.equal(deniedBeforeGrant.status, 403);

  // 2. Super Admin CANNOT access individual user records via the Responder endpoint
  const superAdminDenied = await request(app)
    .get(`/api/responder/clients/${aliceUser._id}`)
    .set('Authorization', `Bearer ${superAdminToken}`);
  assert.equal(superAdminDenied.status, 403);

  // 3. Super Admin user metadata endpoint (/api/admin/users/:id) must NOT leak individual mental health scores
  const adminUserDetail = await request(app)
    .get(`/api/admin/users/${aliceUser._id}`)
    .set('Authorization', `Bearer ${superAdminToken}`);
  assert.equal(adminUserDetail.status, 200);
  assert.equal(adminUserDetail.body.screeningScore, undefined);
  assert.equal(adminUserDetail.body.assessments, undefined);

  // 4. Alice grants Responder access to Dr. Ravi for latest assessment + mood check-ins (but NOT activity_history)
  const grantRes = await request(app)
    .post('/api/share-grants')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({
      responderEmail: 'ravi.responder@clinic.org',
      expiresInDays: 14,
      enableConsent: true,
      categories: {
        basic_profile: true,
        assessment_results: true,
        assessment_history: false,
        mood_checkins: true,
        activity_history: false,
      },
    });
  assert.equal(grantRes.status, 201);
  const grantId = grantRes.body.grant.id;

  // 5. Responder Dr. Ravi can now view Alice's shared categories
  const allowedView = await request(app)
    .get(`/api/responder/clients/${aliceUser._id}`)
    .set('Authorization', `Bearer ${raviToken}`);
  assert.equal(allowedView.status, 200);
  assert.equal(allowedView.body.profile.email, 'alice@example.com');
  assert.equal(allowedView.body.assessments.length, 1, 'Only latest assessment shared when assessment_history=false');
  assert.equal(allowedView.body.moodCheckins.length, 1);
  assert.equal(allowedView.body.activityHistory, undefined);

  // 6. Verify Alice's personal Audit Log recorded Dr. Ravi's access
  const aliceAudit = await request(app)
    .get('/api/audit-logs/my')
    .set('Authorization', `Bearer ${aliceToken}`);
  assert.equal(aliceAudit.status, 200);
  assert.ok(aliceAudit.body.logs.some((l) => l.action === 'RESPONDER_VIEW_ASSESSMENT_RESULTS' && l.actorRole === 'responder'));
  assert.ok(aliceAudit.body.logs.some((l) => l.action === 'RESPONDER_VIEW_MOOD_CHECKINS' && l.actorRole === 'responder'));

  // 7. Alice revokes the ShareGrant -> Dr. Ravi is immediately blocked
  const revokeRes = await request(app)
    .post(`/api/share-grants/${grantId}/revoke`)
    .set('Authorization', `Bearer ${aliceToken}`);
  assert.equal(revokeRes.status, 200);

  const deniedAfterRevoke = await request(app)
    .get(`/api/responder/clients/${aliceUser._id}`)
    .set('Authorization', `Bearer ${raviToken}`);
  assert.equal(deniedAfterRevoke.status, 403);
});

test('6. Soundtrack & Resource Analytics: Counting, Deduplication & Admin Preview Exclusion', async () => {
  const aliceLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceUpdatedPassword456!' });
  const aliceToken = aliceLogin.body.token;

  const adminLogin = await request(app)
    .post('/api/login')
    .send({ email: 'superadmin@unburden.test', password: 'SuperSecretPassword!2026' });
  const superAdminToken = adminLogin.body.token;

  // 1. User soundtrack play is counted
  const play1 = await request(app)
    .post('/api/analytics/sound-play')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ itemId: 'rainforest-rain', title: 'Rainforest Rain', sessionId: 'test-session-1' });
  assert.equal(play1.status, 200);
  assert.equal(play1.body.counted, true);

  // 2. Duplicate play in same session is deduplicated
  const playDup = await request(app)
    .post('/api/analytics/sound-play')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ itemId: 'rainforest-rain', title: 'Rainforest Rain', sessionId: 'test-session-1' });
  assert.equal(playDup.status, 200);
  assert.equal(playDup.body.counted, false);
  assert.equal(playDup.body.reason, 'duplicate_session_event');

  // 3. Admin preview is excluded from analytics
  const adminPlay = await request(app)
    .post('/api/analytics/sound-play')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ itemId: 'rainforest-rain', title: 'Rainforest Rain', sessionId: 'admin-session' });
  assert.equal(adminPlay.status, 200);
  assert.equal(adminPlay.body.counted, false);
  assert.equal(adminPlay.body.reason, 'admin_preview_excluded');

  // 4. Resource view counting
  const view1 = await request(app)
    .post('/api/analytics/resource-view')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ itemId: 'cognitive-grounding-techniques', title: 'Cognitive Grounding', sessionId: 'test-session-1' });
  assert.equal(view1.status, 200);
  assert.equal(view1.body.counted, true);

  // 5. Verify Admin Stats endpoint returns ranked soundtrack & resource analytics
  const statsRes = await request(app)
    .get('/api/admin/stats?days=7')
    .set('Authorization', `Bearer ${superAdminToken}`);
  assert.equal(statsRes.status, 200);
  assert.ok(statsRes.body.soundtracks.mostPlayed);
  assert.equal(statsRes.body.soundtracks.mostPlayed.id, 'rainforest-rain');
  assert.ok(statsRes.body.resources.mostViewed);
  assert.equal(statsRes.body.resources.mostViewed.id, 'cognitive-grounding-techniques');
});

test('7. Global Helpline Directory, Issue Reporting, Data Export & Delete My Data Erasure', async () => {
  // 1. Helpline directory query
  const hlRes = await request(app).get('/api/helplines?country=IN');
  assert.equal(hlRes.status, 200);
  assert.ok(Array.isArray(hlRes.body) && hlRes.body.length > 0);
  const teleManas = hlRes.body.find((h) => h.id === 'tele-manas');
  assert.ok(teleManas);
  assert.ok(teleManas.sourceUrl);

  // 2. Report incorrect helpline info
  const reportRes = await request(app)
    .post('/api/helplines/tele-manas/report')
    .send({ reason: 'Operating hours check', details: 'Verified 24/7 availability' });
  assert.equal(reportRes.status, 201);

  // 3. Alice exports her personal data archive
  const aliceLogin = await request(app)
    .post('/api/login')
    .send({ email: 'alice@example.com', password: 'AliceUpdatedPassword456!' });
  const aliceToken = aliceLogin.body.token;
  const aliceId = (await User.findOne({ email: 'alice@example.com' }))._id;

  const exportRes = await request(app)
    .get('/api/account/export')
    .set('Authorization', `Bearer ${aliceToken}`);
  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.body.profile.email, 'alice@example.com');
  assert.equal(exportRes.body.assessments.length, 2);
  assert.equal(exportRes.body.moodCheckins.length, 1);
  assert.ok(exportRes.body.consents.length >= 3);

  // 4. Alice executes "Delete My Data" (DELETE /api/account)
  const delRes = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ confirm: true });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.ok, true);

  // 5. Verify complete erasure across all personal collections and audit log anonymization
  assert.equal(await User.findById(aliceId), null);
  assert.equal(await Assessment.countDocuments({ user: aliceId }), 0);
  assert.equal(await MoodCheckin.countDocuments({ user: aliceId }), 0);
  assert.equal(await Consent.countDocuments({ user: aliceId }), 0);
  assert.equal(await ShareGrant.countDocuments({ user: aliceId }), 0);
  assert.equal(await Session.countDocuments({ user: aliceId }), 0);
  assert.equal(await AuditLog.countDocuments({ targetUserId: aliceId }), 0, 'Audit log targetUserId references must be anonymized');
});
