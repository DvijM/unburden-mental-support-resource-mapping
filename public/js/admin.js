/* Admin dashboard: fetches user data and statistics from /api/admin/* endpoints.
   The HTML for /admin is deliberately public so the browser can fetch the page;
   any server-side role checks happen during the subsequent API calls.
   Unauthenticated or non‑admin requests are redirected to /login. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  async function apiFetch(url, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('unburden_token') && {
        'Authorization': `Bearer ${localStorage.getItem('unburden_token')}`, // for authenticated admin requests
      }),
    };
    const res = await fetch(url, {
      headers: { ...headers, ...opts.headers },
      ...opts,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  }

  // Simple formatter for display
  const esc = (s) => String(s || '').replace(/[&<>'"\]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) { return '—'; }
  }

  function scoreBadge(score) {
    if (score === null || score === undefined) {
      return '<span class="score-badge score-pending">Not Completed</span>';
    }
    let cls = 'score-minimal';
    if (score >= 20) cls = 'score-severe';
    else if (score >= 15) cls = 'score-moderate';
    else if (score >= 10) cls = 'score-mild';
    return `<span class="score-badge ${cls}">${score} / 27</span>`;
  }

  async function init() {
    // Redirect if not logged in as admin
    const { ok, data } = await apiFetch('/api/session');
    if (!ok || data.role !== 'admin') {
      window.location.href = '/login';
      return;
    }

    // Show admin greeting (first name)
    if (data.name) {
      $('admin-greeting').textContent = `Admin: ${data.name.split(' ')[0]}`;
      $('admin-greeting').classList.remove('hidden');
    }

    // Load stats and user tables in parallel
    await Promise.all([loadStats(), loadUsers()]);

    // Search filter for the user table
    if ($('user-search')) {
      $('user-search').addEventListener('input', renderUserTable);
    }

    // Logout button
    if ($('admin-logout')) {
      $('admin-logout').addEventListener('click', async () => {
        await apiFetch('/api/logout', { method: 'POST' });
        localStorage.removeItem('unburden_token');
        window.location.href = '/';
      });
    }
  }

  async function loadStats() {
    const { ok, data } = await apiFetch('/api/admin/stats');
    if (!ok) return;
    $('stat-total').textContent = data.totalUsers;
    $('stat-scores').textContent = data.usersWithScores;
    $('stat-avg').textContent = data.avgScore !== null ? data.avgScore : '—';
    renderRecentSignups(data.recentSignups || []);
  }

  async function loadUsers() {
    const { ok, data } = await apiFetch('/api/admin/users');
    if (!ok) {
      $('user-table-body').innerHTML = '<tr><td colspan="5" class="text-center py-6 text-crisis-ink">Could not load users. Please try again.</td></tr>';
      return;
    }
    allUsers = data;
    renderUserTable();
    $('last-updated').textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  let allUsers = [];

  function renderUserTable() {
    if (!$('user-search')) return;
    const q = $('user-search').value.trim().toLowerCase();
    const rows = allUsers.filter((u) => {
      if (!q) return true;
      return [u.name, u.email, u.phone || ''].join(' ').toLowerCase().includes(q);
    });

    $('user-count').textContent = `${rows.length} user${rows.length === 1 ? '' : 's'}`;

    const tbody = $('user-table-body');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-ink-mute">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((u) => `
      <tr>
        <td class="font-medium text-ink">${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td>${u.phone ? esc(u.phone) : '<span class="text-ink-mute">—</span>'}</td>
        <td class="text-center">${scoreBadge(u.screeningScore)}</td>
        <td class="text-ink-mute text-[11px]">${formatDate(u.createdAt)}</td>
      </tr>`).join('');
  }

  function renderRecentSignups(users) {
    const el = $('recent-list');
    if (!el) return;
    if (users.length === 0) {
      el.innerHTML = '<li class="text-ink-mute text-[11px]">No recent signups yet.</li>';
      return;
    }
    el.innerHTML = users.map((u) => `
      <li class="text-[11px]">
        <div class="flex items-center justify-between">
          <span class="font-medium text-ink">
            ${esc(u.name)}${u.role === 'admin' ? ` <span class="ml-1 text-[9px] bg-primary-tint text-primary rounded px-1 py-0.5">Admin</span>` : ''}
          </span>
          <span class="text-ink-mute">${formatDate(u.createdAt)}</span>
        </div>
        <p class="text-ink-mute mt-0.5">${esc(u.email)}</p>
      </li>`).join('');
  }

  init();
})();