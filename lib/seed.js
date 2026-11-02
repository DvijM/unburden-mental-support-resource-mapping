'use strict';

const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Consent = require('../models/Consent');
const Helpline = require('../models/Helpline');
const Content = require('../models/Content');
const ContentStat = require('../models/ContentStat');
const { hashPassword } = require('./password');
const { cached } = require('../db');

const helplinesData = require('../data/helplines.json');
const resourcesData = require('../data/resources.json');
const soundsData = require('../data/sounds.json');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function seedHelplines() {
  const count = await Helpline.countDocuments();
  if (count > 0) return;

  const list = helplinesData;

  const docs = list.map((h) => ({
    helplineId: h.id,
    organisationName: h.organisationName || h.name,
    countryName: h.countryName || 'International',
    countryCode: h.countryCode || 'GLOBAL',
    regions: Array.isArray(h.regions) ? h.regions : ['global'],
    categories: Array.isArray(h.categories) ? h.categories : ['crisis'],
    badge: h.badge || '24/7 Free & Confidential',
    designation: h.designation || '',
    phone: h.phone || '',
    smsAvailable: Boolean(h.smsAvailable),
    smsDetails: h.smsDetails || '',
    website: h.website || (h.secondary && h.secondary.href) || '',
    channels: Array.isArray(h.channels) ? h.channels : [],
    primaryAction: h.primary || { label: 'Contact Helpline', icon: 'phone', href: '' },
    secondaryAction: h.secondary || { label: 'Official Website', href: '', external: true },
    languages: Array.isArray(h.languages) ? h.languages : ['English'],
    operatingHours: h.operatingHours || '24/7',
    eligibility: h.eligibility || 'General public',
    description: h.description || '',
    sourceUrl: h.sourceUrl || (h.secondary && h.secondary.href) || 'https://findahelpline.com/',
    lastVerifiedAt: h.lastVerifiedAt ? new Date(h.lastVerifiedAt) : new Date('2026-01-15T00:00:00.000Z'),
    verificationStatus: h.verificationStatus || 'verified',
  }));

  await Helpline.insertMany(docs, { ordered: false }).catch(() => {});
}

async function seedContent() {
  const count = await Content.countDocuments();
  if (count > 0) return;

  const resources = resourcesData;
  const sounds = soundsData;

  const resourceDocs = resources.map((r) => ({
    itemId: r.slug,
    slug: r.slug,
    kind: 'resource',
    category: r.category,
    categoryLabel: r.categoryLabel || '',
    badge: r.badge || 'Educational Guide',
    format: r.format || 'Full Publication',
    readTime: r.readTime || '10 min read',
    title: r.title,
    author: r.author || '',
    institution: r.institution || '',
    citation: r.citation || '',
    summary: r.summary || '',
    takeaways: Array.isArray(r.takeaways) ? r.takeaways : [],
    sections: Array.isArray(r.sections) ? r.sections : [],
    published: true,
  }));

  const soundDocs = sounds.map((s) => ({
    itemId: s.id,
    slug: `sound-${s.id}`,
    kind: 'soundtrack',
    category: s.category,
    categoryLabel: s.categoryLabel || s.category,
    title: s.name,
    summary: s.description || '',
    file: s.file,
    defaultVolume: typeof s.defaultVolume === 'number' ? s.defaultVolume : 0.7,
    palette: s.palette || '',
    accent: s.accent || '',
    published: true,
  }));

  await Content.insertMany([...resourceDocs, ...soundDocs], { ordered: false }).catch(() => {});

  // Ensure initial zero-count ContentStat rows exist so analytics always list all items cleanly
  const statDocs = [
    ...resources.map((r) => ({
      itemType: 'resource',
      itemId: r.slug,
      title: r.title,
      totalCount: 0,
      dailyCounts: [],
    })),
    ...sounds.map((s) => ({
      itemType: 'soundtrack',
      itemId: s.id,
      title: s.name,
      totalCount: 0,
      dailyCounts: [],
    })),
  ];

  for (const st of statDocs) {
    await ContentStat.updateOne(
      { itemType: st.itemType, itemId: st.itemId },
      { $setOnInsert: st },
      { upsert: true }
    );
  }
}

async function provisionInitialSuperAdmin() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
  const name = (process.env.INITIAL_ADMIN_NAME || process.env.ADMIN_NAME || 'Super Administrator').trim();

  if (!email || !EMAIL_RE.test(email) || !password || password.length < 8) {
    return null;
  }

  // Idempotent: never overwrite an existing administrator's credentials
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'super_admin') {
      existing.role = 'super_admin';
      await existing.save();
    }
    return existing;
  }

  const { salt, hash } = await hashPassword(password);
  const adminUser = await User.create({
    name,
    email,
    role: 'super_admin',
    accountStatus: 'active',
    emailVerified: true,
    salt,
    hash,
    consentSummary: {
      account: true,
      assessment_storage: false,
      mood_tracking: false,
      activity_history: false,
      responder_sharing: false,
      research_analytics: false,
    },
    consentAt: new Date(),
  });

  await Consent.create({
    user: adminUser._id,
    category: 'account',
    status: 'granted',
    policyVersion: '2.0',
    disclosureText: 'Initial super_admin account provisioning via environment configuration.',
  });

  return adminUser;
}

async function ensureSeeded() {
  if (cached.seeded) return;
  await Promise.all([seedHelplines(), seedContent(), provisionInitialSuperAdmin()]);
  cached.seeded = true;
}

module.exports = {
  seedHelplines,
  seedContent,
  provisionInitialSuperAdmin,
  ensureSeeded,
};

