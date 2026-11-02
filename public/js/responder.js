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

  async function initResponderPortal() {
    const authGate = document.getElementById('responder-auth-gate');
    const portalMain = document.getElementById('responder-portal-main');

    try {
      const sessionRes = await apiFetch('/api/session');
      if (!sessionRes.ok) {
        if (authGate) authGate.classList.remove('hidden');
        return;
      }
      const session = await sessionRes.json();
      if (session.role !== 'responder') {
        if (authGate) {
          authGate.innerHTML = `
            <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-slate-900">
              <h2 class="text-lg font-bold mb-2">Responder Role Required</h2>
              <p class="text-sm text-slate-700 mb-4">
                You are currently signed in as <strong class="uppercase">${escapeHtml(session.role)}</strong>. To protect user privacy, individual mental health records are strictly restricted to verified Responders who have received explicit user sharing permissions (not even Super Admins have automatic access to individual records).
              </p>
              <div class="flex flex-wrap gap-3">
                <a href="/admin-apply" class="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Apply for Responder Role</a>
                <a href="/dashboard" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Go to My Privacy Dashboard</a>
              </div>
            </div>`;
          authGate.classList.remove('hidden');
        }
        return;
      }

      if (portalMain) portalMain.classList.remove('hidden');
      const nameBadge = document.getElementById('responder-name-badge');
      if (nameBadge) nameBadge.textContent = `${session.name} (${session.email})`;

      await loadConsentedClients();
    } catch (err) {
      console.error('Responder portal init error:', err);
    }
  }

  async function loadConsentedClients() {
    const listEl = document.getElementById('responder-clients-list');
    if (!listEl) return;

    try {
      const res = await apiFetch('/api/responder/clients');
      if (!res.ok) {
        listEl.innerHTML = '<p class="text-sm text-red-600 p-4">Failed to load consenting users.</p>';
        return;
      }
      const data = await res.json();
      const clients = data.clients || [];

      if (clients.length === 0) {
        listEl.innerHTML = `
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
            <p class="text-sm font-semibold text-slate-800 mb-1">No active user share grants</p>
            <p class="text-xs text-slate-600">Users must explicitly opt into "Responder Data Sharing" and nominate your email address from their Privacy Dashboard before any records appear here.</p>
          </div>`;
        return;
      }

      listEl.innerHTML = clients
        .map((c) => {
          const cats = Object.entries(c.categories || {})
            .filter(([, v]) => v)
            .map(([k]) => k.replace(/_/g, ' '))
            .join(', ');
          return `
            <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 class="font-bold text-slate-900 text-sm">${escapeHtml(c.name)}</h3>
                <p class="text-xs text-slate-600">${escapeHtml(c.email || 'Contact details restricted')} &middot; Country: ${escapeHtml(c.country || '—')}</p>
                <p class="text-xs text-teal-800 mt-1">Authorized categories: <strong>${escapeHtml(cats)}</strong></p>
                <p class="text-xs text-slate-500 mt-0.5">Grant expires: ${escapeHtml(fmtDate(c.expiresAt))}</p>
              </div>
              <button type="button" data-view-client="${escapeHtml(c.userId)}" class="shrink-0 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800">
                View Shared Records (Audit Logged)
              </button>
            </div>`;
        })
        .join('');
    } catch (err) {
      listEl.innerHTML = '<p class="text-sm text-red-600 p-4">Network error loading clients.</p>';
    }
  }

  async function viewClientRecord(userId) {
    const detailPanel = document.getElementById('responder-client-detail');
    if (!detailPanel) return;

    detailPanel.classList.remove('hidden');
    detailPanel.innerHTML = '<p class="text-sm text-slate-600 p-4">Loading consented records and recording audit log...</p>';

    try {
      const res = await apiFetch(`/api/responder/clients/${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        detailPanel.innerHTML = `<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">${escapeHtml(data.error || 'Access denied.')}</div>`;
        return;
      }

      const p = data.profile || {};
      const assessments = data.assessments || [];
      const moods = data.moodCheckins || [];

      detailPanel.innerHTML = `
        <div class="rounded-2xl border border-teal-200 bg-white p-6 space-y-6">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-teal-700">Consented Client Record</span>
              <h3 class="text-xl font-bold text-slate-900">${escapeHtml(p.name || 'User')}</h3>
              <p class="text-xs text-slate-600">Email: ${escapeHtml(p.email || 'Not shared')} &middot; Phone: ${escapeHtml(p.phone || 'Not shared')} &middot; Country: ${escapeHtml(p.country || 'Not shared')}</p>
            </div>
            <div class="text-right text-xs text-slate-500">
              <div>Access logged to user's Audit Trail</div>
              <div>Grant Expires: ${escapeHtml(fmtDate(data.expiresAt))}</div>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-bold text-slate-900 mb-2">Shared Assessment Results</h4>
            ${
              assessments.length === 0
                ? '<p class="text-xs text-slate-500">No assessment records shared or available.</p>'
                : `<div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr class="border-b border-slate-200 text-slate-500 uppercase">
                        <th class="py-2 pr-3">Instrument</th>
                        <th class="py-2 pr-3">Total Score</th>
                        <th class="py-2 pr-3">Severity Band</th>
                        <th class="py-2 pr-3">Functional Impact</th>
                        <th class="py-2">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${assessments
                        .map(
                          (a) => `
                        <tr class="border-b border-slate-100">
                          <td class="py-2 pr-3 font-semibold uppercase">${escapeHtml(a.type)}</td>
                          <td class="py-2 pr-3 font-bold">${escapeHtml(a.totalScore)}</td>
                          <td class="py-2 pr-3">${escapeHtml(a.severityCategory)} ${a.item9Positive ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">Item 9 &gt; 0</span>' : ''}</td>
                          <td class="py-2 pr-3">${escapeHtml((a.functionalImpairment || 'not_applicable').replace(/_/g, ' '))}</td>
                          <td class="py-2 text-slate-500">${escapeHtml(fmtDate(a.completedAt))}</td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table></div>`
            }
          </div>

          <div>
            <h4 class="text-sm font-bold text-slate-900 mb-2">Shared Mood Check-Ins</h4>
            ${
              moods.length === 0
                ? '<p class="text-xs text-slate-500">No mood check-in records shared or available.</p>'
                : `<div class="space-y-2">
                    ${moods
                      .map(
                        (m) => `
                      <div class="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs flex justify-between">
                        <span><strong>${escapeHtml(m.rating)}/5 (${escapeHtml(m.label)})</strong> ${m.note ? `— ${escapeHtml(m.note)}` : ''}</span>
                        <span class="text-slate-500">${escapeHtml(fmtDate(m.timestamp))}</span>
                      </div>`
                      )
                      .join('')}
                  </div>`
            }
          </div>
        </div>`;
    } catch (err) {
      detailPanel.innerHTML = '<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Network error loading client record.</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initResponderPortal();

    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view-client]');
      if (btn) {
        const userId = btn.getAttribute('data-view-client');
        if (userId) viewClientRecord(userId);
      }
    });
  });
})();

