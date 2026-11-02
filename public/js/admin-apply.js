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

  document.addEventListener('DOMContentLoaded', () => {
    const applyForm = document.getElementById('admin-apply-form');
    const applyAlert = document.getElementById('apply-alert');
    const statusForm = document.getElementById('status-check-form');
    const statusResult = document.getElementById('status-result');
    const inviteForm = document.getElementById('invite-activate-form');
    const inviteAlert = document.getElementById('invite-alert');

    // Pre-fill invitation parameters if present in URL query string
    const params = new URLSearchParams(window.location.search);
    const inviteTokenParam = params.get('invite');
    const inviteEmailParam = params.get('email');
    if (inviteTokenParam && document.getElementById('invite-token')) {
      document.getElementById('invite-token').value = inviteTokenParam;
      const inviteSection = document.getElementById('invite-activation-section');
      if (inviteSection) inviteSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (inviteEmailParam && document.getElementById('invite-email')) {
      document.getElementById('invite-email').value = inviteEmailParam;
    }

    function showBanner(el, msg, isSuccess) {
      if (!el) return;
      el.className = isSuccess
        ? 'mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900'
        : 'mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900';
      el.innerHTML = msg;
      el.classList.remove('hidden');
    }

    if (applyForm) {
      applyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (applyAlert) applyAlert.classList.add('hidden');
        const btn = applyForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        const payload = {
          fullName: document.getElementById('app-fullName')?.value.trim(),
          email: document.getElementById('app-email')?.value.trim(),
          organisation: document.getElementById('app-organisation')?.value.trim(),
          designation: document.getElementById('app-designation')?.value.trim(),
          requestedRole: document.getElementById('app-role')?.value,
          reason: document.getElementById('app-reason')?.value.trim(),
          qualifications: document.getElementById('app-qualifications')?.value.trim(),
          policyAccepted: Boolean(document.getElementById('app-policy')?.checked),
        };

        try {
          const res = await apiFetch('/api/admin-applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showBanner(applyAlert, escapeHtml(data.error || 'Could not submit application. Please verify all fields.'), false);
            return;
          }

          showBanner(
            applyAlert,
            `<strong>Application submitted for review.</strong><br/>Application ID: <code class="font-mono font-semibold">${escapeHtml(data.applicationId)}</code><br/>Status: <span class="uppercase font-semibold">${escapeHtml(data.status)}</span>. Save your Application ID to check status below.`,
            true
          );
          applyForm.reset();
        } catch (err) {
          showBanner(applyAlert, 'Network error while submitting application. Please try again.', false);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    if (statusForm) {
      statusForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (statusResult) statusResult.classList.add('hidden');
        const email = document.getElementById('status-email')?.value.trim();
        const id = document.getElementById('status-id')?.value.trim();

        if (!email) return;

        try {
          const qs = new URLSearchParams({ email, ...(id && { id }) });
          const res = await apiFetch(`/api/admin-applications/status?${qs.toString()}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showBanner(statusResult, escapeHtml(data.error || 'Application not found.'), false);
            return;
          }

          const badgeMap = {
            submitted: 'bg-amber-100 text-amber-800',
            pending_review: 'bg-amber-100 text-amber-800',
            approved: 'bg-emerald-100 text-emerald-800',
            completed: 'bg-blue-100 text-blue-800',
            rejected: 'bg-red-100 text-red-800',
          };
          const cls = badgeMap[data.status] || 'bg-slate-100 text-slate-800';

          statusResult.className = 'mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800';
          statusResult.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span class="font-semibold text-slate-900">${escapeHtml(data.fullName)} (${escapeHtml(data.organisation)})</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${cls}">${escapeHtml(data.status.replace('_', ' '))}</span>
            </div>
            <p class="text-xs text-slate-600">Requested Role: <strong class="uppercase">${escapeHtml(data.requestedRole)}</strong> &middot; Submitted: ${new Date(data.submittedAt).toLocaleString()}</p>
            ${data.reviewedAt ? `<p class="text-xs text-slate-600 mt-1">Reviewed: ${new Date(data.reviewedAt).toLocaleString()}</p>` : ''}
            ${data.reviewNotes ? `<p class="text-xs text-slate-700 mt-2 bg-white p-2.5 rounded border border-slate-200"><strong>Reviewer Notes:</strong> ${escapeHtml(data.reviewNotes)}</p>` : ''}
          `;
          statusResult.classList.remove('hidden');
        } catch (err) {
          showBanner(statusResult, 'Network error while checking status.', false);
        }
      });
    }

    if (inviteForm) {
      inviteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (inviteAlert) inviteAlert.classList.add('hidden');
        const token = document.getElementById('invite-token')?.value.trim();
        const email = document.getElementById('invite-email')?.value.trim();
        const password = document.getElementById('invite-password')?.value;

        try {
          const res = await apiFetch('/api/admin-applications/accept-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, email, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showBanner(inviteAlert, escapeHtml(data.error || 'Could not activate invitation.'), false);
            return;
          }

          showBanner(
            inviteAlert,
            `<strong>Role Activated!</strong> Your account has been verified with role <strong class="uppercase">${escapeHtml(data.role)}</strong>. Redirecting...`,
            true
          );
          setTimeout(() => {
            window.location.href = data.role === 'responder' ? '/responder' : '/admin';
          }, 900);
        } catch (err) {
          showBanner(inviteAlert, 'Network error while activating invitation.', false);
        }
      });
    }
  });
})();

