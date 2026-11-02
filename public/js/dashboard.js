(function () {
  function apiFetch(url, options = {}) {
    if (window.unburdenApiFetch) return window.unburdenApiFetch(url, options);
    return fetch(url, { credentials: 'same-origin', ...options });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[c]);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  let currentSession = null;

  async function initDashboard() {
    try {
      const res = await apiFetch('/api/session');
      if (!res.ok) {
        window.location.href = '/login?next=/dashboard';
        return;
      }
      currentSession = await res.json();
      renderProfileSummary(currentSession);
      await Promise.all([
        loadConsents(),
        loadAssessments(),
        loadMoodCheckins(),
        loadRespondersAndGrants(),
        loadMyAuditLogs(),
      ]);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }

  function renderProfileSummary(session) {
    const nameEl = document.getElementById('dash-user-name');
    const emailEl = document.getElementById('dash-user-email');
    const roleEl = document.getElementById('dash-user-role');
    const countryEl = document.getElementById('dash-user-country');
    if (nameEl) nameEl.textContent = session.name || 'User';
    if (emailEl) emailEl.textContent = session.email || '';
    if (roleEl) roleEl.textContent = (session.role || 'user').replace('_', ' ').toUpperCase();
    if (countryEl) countryEl.textContent = session.country || 'Not set';
  }

  async function loadConsents() {
    try {
      const res = await apiFetch('/api/consents');
      if (!res.ok) return;
      const data = await res.json();
      const summary = data.summary || {};

      const categories = [
        'assessment_storage',
        'mood_tracking',
        'activity_history',
        'responder_sharing',
        'research_analytics',
      ];
      categories.forEach((cat) => {
        const toggle = document.querySelector(`input[data-consent-category="${cat}"]`);
        if (toggle) toggle.checked = Boolean(summary[cat]);
      });

      const historyBody = document.getElementById('consent-history-body');
      if (historyBody) {
        const list = data.history || [];
        if (list.length === 0) {
          historyBody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-500 text-xs">No consent changes recorded yet.</td></tr>';
        } else {
          historyBody.innerHTML = list
            .slice(0, 15)
            .map(
              (c) => `
            <tr class="border-b border-slate-100 text-xs">
              <td class="py-2 pr-3 font-medium text-slate-800">${escapeHtml(c.category.replace(/_/g, ' '))}</td>
              <td class="py-2 pr-3">
                <span class="px-2 py-0.5 rounded-full font-semibold ${c.status === 'granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
                  ${escapeHtml(c.status)}
                </span>
              </td>
              <td class="py-2 pr-3 text-slate-500">v${escapeHtml(c.policyVersion || '2.0')}</td>
              <td class="py-2 text-slate-500">${escapeHtml(fmtDate(c.timestamp))}</td>
            </tr>`
            )
            .join('');
        }
      }
    } catch (err) {
      console.error('Error loading consents:', err);
    }
  }

  async function handleConsentToggle(e) {
    const input = e.target;
    const category = input.getAttribute('data-consent-category');
    if (!category) return;
    const granted = input.checked;
    const statusMsg = document.getElementById('consent-save-status');

    try {
      const res = await apiFetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, granted }),
      });
      if (!res.ok) {
        input.checked = !granted;
        return;
      }
      if (statusMsg) {
        statusMsg.textContent = `Updated "${category.replace(/_/g, ' ')}" preference to ${granted ? 'Granted' : 'Revoked'}.`;
        statusMsg.classList.remove('hidden');
        setTimeout(() => statusMsg.classList.add('hidden'), 4000);
      }
      await Promise.all([loadConsents(), loadRespondersAndGrants(), loadMyAuditLogs()]);
    } catch (err) {
      input.checked = !granted;
    }
  }

  async function loadAssessments() {
    const tbody = document.getElementById('dash-assessments-body');
    if (!tbody) return;
    try {
      const res = await apiFetch('/api/assessments/my');
      if (!res.ok) return;
      const data = await res.json();
      const items = data.assessments || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500 text-sm">No saved assessment records. Complete a self-check with storage consent enabled to track your history.</td></tr>';
        return;
      }
      tbody.innerHTML = items
        .map(
          (a) => `
        <tr class="border-b border-slate-100 text-sm">
          <td class="py-3 pr-3 font-semibold uppercase text-slate-900">${escapeHtml(a.type)}</td>
          <td class="py-3 pr-3 font-bold text-teal-800">${escapeHtml(a.totalScore)}</td>
          <td class="py-3 pr-3">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">${escapeHtml(a.severityCategory)}</span>
            ${a.item9Positive ? '<span class="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">Item 9 Flag</span>' : ''}
          </td>
          <td class="py-3 pr-3 text-xs text-slate-500">${escapeHtml(fmtDate(a.completedAt))}</td>
          <td class="py-3 text-right">
            <button type="button" data-delete-assessment="${escapeHtml(a.id)}" class="text-xs font-semibold text-red-600 hover:text-red-800">Delete</button>
          </td>
        </tr>`
        )
        .join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-red-600 text-sm">Could not load assessment history.</td></tr>';
    }
  }

  async function loadMoodCheckins() {
    const listEl = document.getElementById('dash-mood-list');
    if (!listEl) return;
    try {
      const res = await apiFetch('/api/mood/my');
      if (!res.ok) return;
      const data = await res.json();
      const items = data.checkins || [];
      if (items.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-slate-500 py-4 text-center">No mood check-ins saved yet.</p>';
        return;
      }
      listEl.innerHTML = items
        .slice(0, 15)
        .map(
          (m) => `
        <div class="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">${escapeHtml(m.rating)}</span>
              <span class="font-semibold text-sm text-slate-900">${escapeHtml(m.label)}</span>
              <span class="text-xs text-slate-500">&middot; ${escapeHtml(fmtDate(m.timestamp))}</span>
            </div>
            ${m.note ? `<p class="mt-1 text-xs text-slate-600">${escapeHtml(m.note)}</p>` : ''}
          </div>
          <button type="button" data-delete-mood="${escapeHtml(m.id)}" class="text-xs font-semibold text-red-600 hover:text-red-800">Delete</button>
        </div>`
        )
        .join('');
    } catch (err) {
      listEl.innerHTML = '<p class="text-sm text-red-600">Failed to load mood check-ins.</p>';
    }
  }

  async function loadRespondersAndGrants() {
    const responderSelect = document.getElementById('share-responder-select');
    const grantsContainer = document.getElementById('active-grants-list');

    try {
      const [dirRes, grantsRes] = await Promise.all([
        apiFetch('/api/responders/directory'),
        apiFetch('/api/share-grants/my'),
      ]);

      if (dirRes.ok && responderSelect) {
        const dirData = await dirRes.json();
        const responders = dirData.responders || [];
        responderSelect.innerHTML =
          '<option value="">Select a verified responder (or enter email below)...</option>' +
          responders
            .map(
              (r) =>
                `<option value="${escapeHtml(r.email)}">${escapeHtml(r.name)} — ${escapeHtml(r.designation)} (${escapeHtml(r.organisation)})</option>`
            )
            .join('');
      }

      if (grantsRes.ok && grantsContainer) {
        const grantsData = await grantsRes.json();
        const grants = grantsData.grants || [];
        if (grants.length === 0) {
          grantsContainer.innerHTML = '<p class="text-sm text-slate-500 py-3">You have not shared your records with any responders.</p>';
        } else {
          grantsContainer.innerHTML = grants
            .map((g) => {
              const r = g.responder || { name: 'Responder', email: '', organisation: '' };
              const activeCats = Object.entries(g.categories || {})
                .filter(([, val]) => val)
                .map(([k]) => k.replace(/_/g, ' '))
                .join(', ');
              const badgeCls =
                g.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-700';

              return `
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-sm text-slate-900">${escapeHtml(r.name)}</span>
                      <span class="text-xs text-slate-500">(${escapeHtml(r.email)})</span>
                      <span class="px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${badgeCls}">${escapeHtml(g.status)}</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-1">Shared categories: <strong>${escapeHtml(activeCats || 'None')}</strong></p>
                    <p class="text-xs text-slate-500 mt-0.5">Expires: ${escapeHtml(fmtDate(g.expiresAt))} &middot; Last accessed: ${escapeHtml(fmtDate(g.lastAccessedAt))}</p>
                  </div>
                  ${
                    g.status === 'active'
                      ? `<button type="button" data-revoke-grant="${escapeHtml(g.id)}" class="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Revoke Access</button>`
                      : ''
                  }
                </div>`;
            })
            .join('');
        }
      }
    } catch (err) {
      console.error('Failed loading responders/grants:', err);
    }
  }

  async function loadMyAuditLogs() {
    const tbody = document.getElementById('my-audit-logs-body');
    if (!tbody) return;
    try {
      const res = await apiFetch('/api/audit-logs/my');
      if (!res.ok) return;
      const data = await res.json();
      const logs = data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-500 text-xs">No external accesses or audit events recorded for your account.</td></tr>';
        return;
      }
      tbody.innerHTML = logs
        .slice(0, 25)
        .map(
          (l) => `
        <tr class="border-b border-slate-100 text-xs">
          <td class="py-2.5 pr-3 font-medium text-slate-900">${escapeHtml(l.actorName || l.actorRole)} <span class="text-slate-500">(${escapeHtml(l.actorRole)})</span></td>
          <td class="py-2.5 pr-3 text-slate-700">${escapeHtml(l.action)}</td>
          <td class="py-2.5 pr-3 text-slate-600">${escapeHtml((l.dataCategory || '').replace(/_/g, ' '))}</td>
          <td class="py-2.5 text-slate-500">${escapeHtml(fmtDate(l.timestamp))}</td>
        </tr>`
        )
        .join('');
    } catch (err) {
      console.error('Failed loading personal audit logs:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initDashboard();

    // Consent toggles
    document.querySelectorAll('input[data-consent-category]').forEach((input) => {
      input.addEventListener('change', handleConsentToggle);
    });

    // Mood check-in form
    const moodForm = document.getElementById('mood-checkin-form');
    const moodStatus = document.getElementById('mood-status-msg');
    if (moodForm) {
      moodForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (moodStatus) moodStatus.classList.add('hidden');
        const ratingEl = moodForm.querySelector('input[name="mood-rating"]:checked');
        const noteEl = document.getElementById('mood-note');
        const consentEl = document.getElementById('mood-inline-consent');

        if (!ratingEl) {
          if (moodStatus) {
            moodStatus.textContent = 'Select a mood rating from 1 to 5.';
            moodStatus.className = 'mt-2 text-xs font-medium text-red-600';
            moodStatus.classList.remove('hidden');
          }
          return;
        }

        const res = await apiFetch('/api/mood', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating: Number(ratingEl.value),
            note: noteEl ? noteEl.value.trim() : '',
            storeConsent: consentEl ? consentEl.checked : false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (moodStatus) {
            moodStatus.textContent = data.error || 'Could not save mood check-in.';
            moodStatus.className = 'mt-2 text-xs font-medium text-red-600';
            moodStatus.classList.remove('hidden');
          }
          return;
        }

        moodForm.reset();
        if (moodStatus) {
          moodStatus.textContent = `Saved mood check-in: ${data.checkin.label} (${data.checkin.rating}/5).`;
          moodStatus.className = 'mt-2 text-xs font-medium text-emerald-700';
          moodStatus.classList.remove('hidden');
        }
        await Promise.all([loadConsents(), loadMoodCheckins()]);
      });
    }

    // Share grant form
    const shareForm = document.getElementById('share-grant-form');
    const shareStatus = document.getElementById('share-grant-status');
    if (shareForm) {
      shareForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (shareStatus) shareStatus.classList.add('hidden');
        const selectVal = document.getElementById('share-responder-select')?.value.trim();
        const manualEmail = document.getElementById('share-responder-email')?.value.trim();
        const responderEmail = manualEmail || selectVal;

        if (!responderEmail) {
          if (shareStatus) {
            shareStatus.textContent = 'Select a responder from the directory or enter their verified email.';
            shareStatus.className = 'mt-2 text-xs font-medium text-red-600';
            shareStatus.classList.remove('hidden');
          }
          return;
        }

        const payload = {
          responderEmail,
          expiresInDays: Number(document.getElementById('share-expiry-days')?.value || 14),
          enableConsent: true,
          categories: {
            basic_profile: Boolean(document.getElementById('share-cat-profile')?.checked),
            assessment_results: Boolean(document.getElementById('share-cat-latest')?.checked),
            assessment_history: Boolean(document.getElementById('share-cat-history')?.checked),
            mood_checkins: Boolean(document.getElementById('share-cat-mood')?.checked),
            activity_history: Boolean(document.getElementById('share-cat-activity')?.checked),
          },
        };

        const res = await apiFetch('/api/share-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (shareStatus) {
            shareStatus.textContent = data.error || 'Could not grant sharing permission.';
            shareStatus.className = 'mt-2 text-xs font-medium text-red-600';
            shareStatus.classList.remove('hidden');
          }
          return;
        }

        if (shareStatus) {
          shareStatus.textContent = `Access granted to ${data.grant.responder.name}. You can revoke this at any time.`;
          shareStatus.className = 'mt-2 text-xs font-medium text-emerald-700';
          shareStatus.classList.remove('hidden');
        }
        await Promise.all([loadConsents(), loadRespondersAndGrants(), loadMyAuditLogs()]);
      });
    }

    // Delegated actions (delete assessment, delete mood, revoke grant)
    document.body.addEventListener('click', async (e) => {
      const delAssBtn = e.target.closest('[data-delete-assessment]');
      if (delAssBtn) {
        const id = delAssBtn.getAttribute('data-delete-assessment');
        const res = await apiFetch(`/api/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) await loadAssessments();
        return;
      }

      const delMoodBtn = e.target.closest('[data-delete-mood]');
      if (delMoodBtn) {
        const id = delMoodBtn.getAttribute('data-delete-mood');
        const res = await apiFetch(`/api/mood/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) await loadMoodCheckins();
        return;
      }

      const revokeBtn = e.target.closest('[data-revoke-grant]');
      if (revokeBtn) {
        const id = revokeBtn.getAttribute('data-revoke-grant');
        const res = await apiFetch(`/api/share-grants/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
        if (res.ok) await Promise.all([loadRespondersAndGrants(), loadMyAuditLogs()]);
      }
    });

    // Export personal data
    const exportBtn = document.getElementById('btn-export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        const res = await apiFetch('/api/account/export');
        if (!res.ok) return;
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `unburden-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    // Change password
    const pwForm = document.getElementById('change-password-form');
    const pwStatus = document.getElementById('change-pw-status');
    if (pwForm) {
      pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('current-password')?.value;
        const newPassword = document.getElementById('new-password')?.value;
        const res = await apiFetch('/api/password/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json().catch(() => ({}));
        if (pwStatus) {
          pwStatus.textContent = res.ok ? data.message : data.error || 'Could not update password.';
          pwStatus.className = res.ok ? 'mt-2 text-xs font-medium text-emerald-700' : 'mt-2 text-xs font-medium text-red-600';
          pwStatus.classList.remove('hidden');
        }
        if (res.ok) pwForm.reset();
      });
    }

    // Delete My Data & Account
    const deleteForm = document.getElementById('delete-account-form');
    const deleteStatus = document.getElementById('delete-account-status');
    if (deleteForm) {
      deleteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const confirmCheck = document.getElementById('confirm-delete-checkbox');
        if (!confirmCheck || !confirmCheck.checked) {
          if (deleteStatus) {
            deleteStatus.textContent = 'Please check the confirmation box before deleting your account and personal records.';
            deleteStatus.className = 'mt-2 text-xs font-semibold text-red-600';
            deleteStatus.classList.remove('hidden');
          }
          return;
        }

        const res = await apiFetch('/api/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          window.location.href = '/?deleted=1';
        } else if (deleteStatus) {
          deleteStatus.textContent = data.error || 'Could not delete account.';
          deleteStatus.className = 'mt-2 text-xs font-semibold text-red-600';
          deleteStatus.classList.remove('hidden');
        }
      });
    }
  });
})();

