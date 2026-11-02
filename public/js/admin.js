/* Admin Dashboard: RBAC Analytics, Admin Application Review, Helpline Management & Audit Logs */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Safe HTML escaper with /[&<>'"]/g
  const esc = (s) =>
    String(s ?? '').replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[c]));

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (_) {
      return '—';
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (_) {
      return '—';
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)unburden_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  // Fixed apiFetch: spreads opts BEFORE setting merged headers so opts.headers never clobbers merged headers
  async function apiFetch(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const csrf = getCsrfToken();
    const baseHeaders = {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { 'X-CSRF-Token': csrf } : {}),
    };
    const mergedHeaders = { ...baseHeaders, ...(opts.headers || {}) };
    try {
      const res = await fetch(url, {
        ...opts,
        method,
        credentials: 'same-origin',
        headers: mergedHeaders,
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {}
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { error: err.message || 'Network error' } };
    }
  }

  // Standardized PHQ-9 score badge helper (consistent 0-4, 5-9, 10-14, 15-19, 20-27 thresholds)
  function getPhq9ScoreBadge(score) {
    if (score === null || score === undefined || isNaN(score)) {
      return '<span class="score-badge score-pending">No score</span>';
    }
    if (score <= 4) return `<span class="score-badge score-minimal">Minimal (${score})</span>`;
    if (score <= 9) return `<span class="score-badge score-mild">Mild (${score})</span>`;
    if (score <= 14) return `<span class="score-badge score-moderate">Moderate (${score})</span>`;
    if (score <= 19) return `<span class="score-badge score-moderate">Moderately severe (${score})</span>`;
    return `<span class="score-badge score-severe">Severe (${score})</span>`;
  }
  window.getPhq9ScoreBadge = getPhq9ScoreBadge;

  let currentSession = null;
  let userPage = 1;
  const userLimit = 10;
  let userSearchQuery = '';
  let searchTimeout = null;
  let activeDaysFilter = '';

  async function init() {
    const { ok, data } = await apiFetch('/api/session');
    const allowedRoles = ['super_admin', 'admin', 'analyst', 'content_editor'];
    if (!ok || !allowedRoles.includes(data.role)) {
      window.location.href = '/login';
      return;
    }
    currentSession = data;

    if ($('admin-greeting')) {
      const roleLabel = data.role === 'super_admin' ? 'Super Admin' : data.role.replace('_', ' ');
      $('admin-greeting').textContent = `${roleLabel}: ${(data.name || 'Admin').split(' ')[0]}`;
      $('admin-greeting').classList.remove('hidden');
    }

    const isSuperAdmin = data.role === 'super_admin' || data.role === 'admin';
    document.querySelectorAll('[data-super-admin-only]').forEach((el) => {
      el.classList.toggle('hidden', !isSuperAdmin);
    });

    const tasks = [loadStats()];
    if (isSuperAdmin) {
      tasks.push(loadUsers(), loadAdminApplications(), loadAuditLogs());
    } else {
      const tbody = $('user-table-body');
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="text-center py-6 text-ink-mute">User account directory requires super_admin role.</td></tr>';
      }
    }

    await Promise.all(tasks);

    // Date filter for aggregate analytics
    const daysSelect = $('analytics-days-filter');
    if (daysSelect) {
      daysSelect.addEventListener('change', () => {
        activeDaysFilter = daysSelect.value;
        loadStats();
      });
    }

    // Search input with debounce
    const searchInput = $('user-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          userSearchQuery = e.target.value.trim();
          userPage = 1;
          loadUsers();
        }, 300);
      });
    }

    // User Directory Pagination
    const prevUserBtn = $('btn-prev-page');
    const nextUserBtn = $('btn-next-page');
    if (prevUserBtn) {
      prevUserBtn.addEventListener('click', () => {
        if (userPage > 1) {
          userPage -= 1;
          loadUsers();
        }
      });
    }
    if (nextUserBtn) {
      nextUserBtn.addEventListener('click', () => {
        userPage += 1;
        loadUsers();
      });
    }

    // Helpline management form
    const helplineForm = $('admin-helpline-form');
    if (helplineForm) {
      helplineForm.addEventListener('submit', handleHelplineUpsert);
    }

    // Modal controls
    const modal = $('details-modal');
    const closeBtn = $('btn-close-modal');
    const dismissBtn = $('btn-dismiss-modal');

    function closeModal() {
      if (modal) modal.classList.add('hidden');
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (dismissBtn) dismissBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Logout
    const logoutBtn = $('admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiFetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }
  }

  // ---------- Graphical Visualizations ----------
  const AGE_COLORS = ['#1E3A2F', '#2E5A44', '#4A8568', '#7E9F8E', '#C59B27', '#D97706'];

  function drawAgePieChart(ageData) {
    const canvas = $('age-pie-chart');
    const legendEl = $('age-pie-legend');
    const emptyEl = $('age-chart-empty');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 224;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const slices = ageData.map((d, i) => {
      const val = typeof d.rawCount === 'number' ? d.rawCount : typeof d.count === 'number' ? d.count : 0;
      return {
        label: d.band,
        displayCount: d.count,
        value: Math.max(val, 0),
        color: AGE_COLORS[i % AGE_COLORS.length],
      };
    });

    const totalVal = slices.reduce((sum, s) => sum + s.value, 0);

    if (totalVal === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (legendEl) legendEl.innerHTML = '<p class="text-ink-mute text-[12px]">No age data recorded yet.</p>';
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 8;
    const innerRadius = radius * 0.52;

    let startAngle = -Math.PI / 2;
    slices.forEach((slice) => {
      if (slice.value === 0) return;
      const sliceAngle = (slice.value / totalVal) * (2 * Math.PI);
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle = endAngle;
    });

    ctx.fillStyle = '#1A1C1D';
    ctx.font = 'bold 15px "Noto Serif", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${totalVal}`, centerX, centerY - 8);
    ctx.fillStyle = '#6F7972';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('USERS', centerX, centerY + 10);

    if (legendEl) {
      legendEl.innerHTML = slices
        .map(
          (s) => `
        <div class="flex items-center justify-between py-1 border-b border-surface-low/80">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full flex-none shadow-sm" style="background-color: ${s.color};"></span>
            <span class="text-ink-soft text-[12px]">${esc(s.label)}</span>
          </div>
          <span class="font-medium text-ink text-[12px]">${esc(s.displayCount)}</span>
        </div>`
        )
        .join('');
    }
  }

  let assessmentStats = null;
  let lastBands = null;

  function drawScoreDistributionChart(bands) {
    const canvas = $('score-dist-chart');
    if (!canvas) return;
    lastBands = bands;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(Math.round((canvas.parentElement && canvas.parentElement.clientWidth) || canvas.clientWidth || 400), 260);
    const h = 190;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padLeft = 10;
    const padRight = 10;
    const padBottom = 40;
    const padTop = 18;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    const bars = bands.map((d) => ({
      color: d.color,
      name: d.band.split(' (')[0],
      range: `${d.min}\u2013${d.max}`,
      displayCount: d.count,
      value: typeof d.rawCount === 'number' ? d.rawCount : 0,
    }));

    const maxVal = Math.max(...bars.map((b) => b.value), 4);
    const slot = chartW / bars.length;
    const barWidth = Math.min(slot - 24, 90);

    ctx.strokeStyle = '#E4E9E5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    ctx.textAlign = 'center';
    bars.forEach((bar, idx) => {
      const x = padLeft + idx * slot + (slot - barWidth) / 2;
      const barH = (bar.value / maxVal) * chartH;
      const y = h - padBottom - barH;

      if (bar.value > 0) {
        ctx.fillStyle = bar.color;
        ctx.beginPath();
        const r = Math.min(3, barH / 2);
        if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barH, [r, r, 0, 0]);
        else ctx.rect(x, y, barWidth, barH);
        ctx.fill();

        ctx.fillStyle = '#1A1C1D';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(String(bar.displayCount), x + barWidth / 2, y - 4);
      }

      ctx.fillStyle = '#44474E';
      ctx.font = '11px Inter, sans-serif';
      const words = bar.name.split(' ');
      const mid = Math.ceil(words.length / 2);
      const lines =
        words.length > 1 && bar.name.length > 10
          ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
          : [bar.name];
      lines.forEach((ln, i) => ctx.fillText(ln, x + barWidth / 2, h - padBottom + 13 + i * 11));
      ctx.fillStyle = '#74777F';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(bar.range, x + barWidth / 2, h - padBottom + 13 + lines.length * 11);
    });

    if (bars.every((b) => b.value === 0)) {
      ctx.fillStyle = '#6F7972';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('No responses recorded yet for this assessment', w / 2, padTop + chartH / 2);
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => lastBands && drawScoreDistributionChart(lastBands), 150);
  });

  function updateAverageGauge(a) {
    const valEl = $('gauge-score-value');
    const bandEl = $('gauge-band-name');
    const pinEl = $('gauge-pin');
    const pinBadge = $('gauge-pin-badge');
    const barEl = $('gauge-bar');
    const labelsEl = $('gauge-labels');
    if (!valEl) return;

    if ($('gauge-max')) $('gauge-max').textContent = a.max;

    if (barEl) {
      barEl.innerHTML = a.bands
        .map((b) => `<div style="flex:${b.max - b.min + 1};background:${b.color}" title="${esc(b.band)}"></div>`)
        .join('');
    }
    if (labelsEl) {
      labelsEl.innerHTML = a.bands.map((b) => `<span>${b.min}</span>`).join('') + `<span>${a.max}</span>`;
    }

    const avgScore = a.avgScore;
    if (avgScore === null || avgScore === undefined) {
      valEl.textContent = '\u2014';
      if (bandEl) bandEl.textContent = '(No screenings completed)';
      if (pinEl) pinEl.style.left = '0%';
      if (pinBadge) pinBadge.textContent = 'Avg';
      return;
    }

    valEl.textContent = avgScore.toFixed(1);
    const band = a.bands.find((b) => avgScore <= b.max + 0.999) || a.bands[a.bands.length - 1];
    if (bandEl) bandEl.textContent = `\u00B7 ${band.band.split(' (')[0]}`;
    if (pinBadge) pinBadge.textContent = `Avg: ${avgScore.toFixed(1)}`;

    const pct = Math.min(Math.max((avgScore / a.max) * 100, 2), 98);
    if (pinEl) pinEl.style.left = `${pct}%`;
  }

  function renderAssessment(id) {
    const a = assessmentStats && assessmentStats[id];
    if (!a) return;
    drawScoreDistributionChart(a.bands);
    updateAverageGauge(a);
    if ($('dist-total')) $('dist-total').textContent = `\u00B7 ${a.name} \u00B7 n = ${a.total}`;

    const sevList = $('severity-list');
    if (sevList) {
      sevList.innerHTML = a.bands
        .map(
          (item) => `
        <li class="flex items-center justify-between py-1 border-b border-surface-low">
          <span class="flex items-center gap-2 text-ink-soft"><span class="w-2.5 h-2.5 rounded-full flex-none" style="background:${item.color}"></span>${esc(item.band)}</span>
          <span class="font-medium text-ink">${esc(item.count)}</span>
        </li>`
        )
        .join('');
    }
  }

  // ---------- Geographic heat map ----------
  const GEO_STOPS = ['#D6E8DE', '#7DB89C', '#3B6E59', '#14382B'];
  const GEO_EMPTY = '#E7EBE8';
  let geoSvg = null;
  let geoLoading = null;

  function geoColor(t) {
    const x = Math.min(Math.max(t, 0), 1) * (GEO_STOPS.length - 1);
    const i = Math.min(Math.floor(x), GEO_STOPS.length - 2);
    const f = x - i;
    const a = GEO_STOPS[i].match(/\w\w/g).map((h) => parseInt(h, 16));
    const b = GEO_STOPS[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
  }

  async function ensureGeoMap() {
    if (geoSvg) return geoSvg;
    if (!geoLoading) {
      geoLoading = fetch('/images/world-map.svg')
        .then((r) => r.text())
        .then((txt) => {
          const host = $('geo-map');
          if (!host) return null;
          const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
          const svg = document.importNode(doc.documentElement, true);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.setAttribute('style', 'width:100%;height:auto;display:block');
          svg.querySelectorAll('path').forEach((p) => {
            p.style.fill = GEO_EMPTY;
            p.style.stroke = '#FFFFFF';
            p.style.strokeWidth = '0.4';
          });
          const loadingEl = $('geo-map-loading');
          if (loadingEl) loadingEl.remove();
          host.insertBefore(svg, host.firstChild);
          geoSvg = svg;
          return svg;
        })
        .catch(() => {
          const loadingEl = $('geo-map-loading');
          if (loadingEl) loadingEl.textContent = 'Map could not be loaded.';
          return null;
        });
    }
    return geoLoading;
  }

  async function renderGeoMap(dist) {
    const svg = await ensureGeoMap();
    if (!svg) return;
    const tip = $('geo-tooltip');
    const host = $('geo-map');
    const max = Math.max(...dist.map((d) => d.rawCount), 1);

    dist.forEach((d) => {
      const node = svg.querySelector('#' + CSS.escape(d.code.toLowerCase()));
      if (!node) return;
      const paths = node.tagName.toLowerCase() === 'path' ? [node] : node.querySelectorAll('path');
      const t = max === 1 ? 0.7 : 0.2 + 0.8 * (d.rawCount / max);
      paths.forEach((p) => {
        p.style.fill = geoColor(t);
        p.style.cursor = 'pointer';
      });
      const ageTxt = d.avgAge !== null ? d.avgAge : '\u2014';
      node.onmousemove = (e) => {
        const r = host.getBoundingClientRect();
        tip.innerHTML = `<p class="font-semibold text-[12px] mb-0.5">${esc(d.name)}</p>
          <p>Users: <strong>${d.rawCount}</strong></p>
          <p>Share: <strong>${d.percent}%</strong></p>
          <p>Avg age: <strong>${ageTxt}</strong></p>`;
        tip.classList.remove('hidden');
        const x = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 6);
        const y = Math.min(e.clientY - r.top + 14, r.height - tip.offsetHeight - 6);
        tip.style.left = Math.max(x, 4) + 'px';
        tip.style.top = Math.max(y, 4) + 'px';
      };
      node.onmouseleave = () => tip.classList.add('hidden');
    });
  }

  // ---------- Load Aggregated Metrics & Charts ----------
  async function loadStats() {
    const query = activeDaysFilter ? `?days=${encodeURIComponent(activeDaysFilter)}` : '';
    const { ok, data } = await apiFetch(`/api/admin/stats${query}`);
    if (!ok) return;

    if ($('stat-total')) $('stat-total').textContent = data.totalUsers ?? 0;
    if ($('stat-active-users')) $('stat-active-users').textContent = data.activeUsers ?? 0;
    if ($('stat-scores')) $('stat-scores').textContent = data.totalScreenings ?? 0;
    if ($('stat-avg')) $('stat-avg').textContent = data.avgScore !== null ? data.avgScore : '—';
    if ($('stat-mood-checkins')) $('stat-mood-checkins').textContent = data.totalMoodCheckins ?? 0;
    if ($('stat-pending-apps')) $('stat-pending-apps').textContent = data.pendingAdminApps ?? 0;

    // Soundtrack & Resource Popularity Overview
    if ($('stat-top-sound')) {
      $('stat-top-sound').textContent =
        data.soundtracks && data.soundtracks.mostPlayed
          ? `${data.soundtracks.mostPlayed.title} (${data.soundtracks.mostPlayed.plays})`
          : 'No plays yet';
    }
    if ($('stat-top-resource')) {
      $('stat-top-resource').textContent =
        data.resources && data.resources.mostViewed
          ? `${data.resources.mostViewed.title} (${data.resources.mostViewed.views})`
          : 'No views yet';
    }

    // Render Soundtracks Rankings
    const soundList = $('soundtrack-rankings-list');
    if (soundList && data.soundtracks) {
      if ($('sound-trends-summary')) {
        const t = data.soundtracks.trends || { daily: 0, weekly: 0, monthly: 0 };
        $('sound-trends-summary').textContent = `Today: ${t.daily} · 7d: ${t.weekly} · 30d: ${t.monthly} · Total: ${data.soundtracks.totalPlays}`;
      }
      soundList.innerHTML = (data.soundtracks.rankings || [])
        .slice(0, 8)
        .map(
          (s) => `
          <li class="flex items-center justify-between py-1.5 border-b border-surface-low text-[12.5px]">
            <span class="text-ink-soft truncate pr-3">${esc(s.title)}</span>
            <span class="font-mono font-semibold text-primary flex-none">${esc(s.plays)} plays</span>
          </li>`
        )
        .join('');
    }

    // Render Resources Rankings
    const resList = $('resource-rankings-list');
    if (resList && data.resources) {
      if ($('resource-trends-summary')) {
        const t = data.resources.trends || { daily: 0, weekly: 0, monthly: 0 };
        $('resource-trends-summary').textContent = `Today: ${t.daily} · 7d: ${t.weekly} · 30d: ${t.monthly} · Total: ${data.resources.totalViews}`;
      }
      resList.innerHTML = (data.resources.rankings || [])
        .slice(0, 8)
        .map(
          (r) => `
          <li class="flex items-center justify-between py-1.5 border-b border-surface-low text-[12.5px]">
            <span class="text-ink-soft truncate pr-3">${esc(r.title)}</span>
            <span class="font-mono font-semibold text-primary flex-none">${esc(r.views)} views</span>
          </li>`
        )
        .join('');
    }

    if (Array.isArray(data.ageDistribution)) {
      drawAgePieChart(data.ageDistribution);
    }

    if (data.assessments) {
      assessmentStats = data.assessments;
      const sel = $('assessment-select');
      renderAssessment(sel ? sel.value : 'phq9');
      if (sel && !sel.dataset.bound) {
        sel.dataset.bound = '1';
        sel.addEventListener('change', () => renderAssessment(sel.value));
      }
    }

    const ageList = $('age-list');
    if (ageList && Array.isArray(data.ageDistribution)) {
      ageList.innerHTML = data.ageDistribution
        .map(
          (item) => `
        <li class="flex items-center justify-between py-1 border-b border-surface-low">
          <span class="text-ink-soft">${esc(item.band)}</span>
          <span class="font-medium text-ink">${esc(item.count)}</span>
        </li>`
        )
        .join('');
    }

    const countryList = $('country-list');
    if (countryList && Array.isArray(data.countryDistribution)) {
      renderGeoMap(data.countryDistribution);
      if (data.countryDistribution.length === 0) {
        countryList.innerHTML = '<li class="text-ink-mute text-[12px]">No country data recorded yet.</li>';
      } else {
        countryList.innerHTML = data.countryDistribution
          .map(
            (item) => `
          <li class="flex items-center justify-between py-1 border-b border-surface-low">
            <span class="text-ink-soft min-w-0 pr-3">${esc(item.name)} <span class="text-ink-mute text-[11px]">(${esc(item.code)})</span></span>
            <span class="font-medium flex-none text-ink">${esc(item.rawCount)} <span class="text-ink-mute font-normal text-[11px]">${esc(item.percent)}%</span></span>
          </li>`
          )
          .join('');
      }
    }

    if ($('last-updated')) {
      $('last-updated').textContent = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  // ---------- Load & Review Admin Applications ----------
  async function loadAdminApplications() {
    const tbody = $('applications-table-body');
    const countEl = $('applications-count');
    if (!tbody) return;

    const { ok, data } = await apiFetch('/api/admin/applications');
    if (!ok) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-6 text-crisis-ink">Could not load role applications.</td></tr>';
      return;
    }

    const apps = data.applications || [];
    if (countEl) {
      countEl.textContent = `${apps.length} total role ${apps.length === 1 ? 'application' : 'applications'}`;
    }

    if (apps.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-6 text-ink-mute">No role applications submitted yet.</td></tr>';
      return;
    }

    tbody.innerHTML = apps
      .map((a) => {
        const isPending = a.status === 'submitted' || a.status === 'pending_review';
        const statusBadge =
          a.status === 'approved' || a.status === 'completed'
            ? `<span class="score-badge score-minimal">${esc(a.status)}</span>`
            : a.status === 'rejected'
              ? `<span class="score-badge score-severe">rejected</span>`
              : `<span class="score-badge score-mild">pending review</span>`;

        return `
        <tr class="hover:bg-surface-low/50 transition">
          <td class="text-ink-mute text-[12px] whitespace-nowrap">${formatDate(a.submittedAt)}</td>
          <td>
            <p class="font-medium text-ink">${esc(a.fullName)}</p>
            <p class="text-[11.5px] text-ink-mute">${esc(a.email)}</p>
          </td>
          <td class="text-[12px] text-ink-soft">
            <p class="font-medium text-ink">${esc(a.organisation)}</p>
            <p class="text-[11px] text-ink-mute">${esc(a.designation)}</p>
          </td>
          <td><span class="bg-primary-tint text-primary text-[11px] font-semibold rounded px-2 py-0.5 uppercase">${esc(a.requestedRole)}</span></td>
          <td>${statusBadge}</td>
          <td class="text-right space-x-1.5">
            ${
              isPending
                ? `<button type="button" class="btn-primary px-2.5 py-1 text-[11px] approve-app-btn" data-id="${esc(a.id)}" data-email="${esc(a.email)}">Approve</button>
                   <button type="button" class="btn-secondary px-2.5 py-1 text-[11px] text-crisis reject-app-btn" data-id="${esc(a.id)}">Reject</button>`
                : `<span class="text-[11px] text-ink-mute">${a.reviewer ? 'By ' + esc(a.reviewer) : 'Reviewed'}</span>`
            }
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.approve-app-btn').forEach((btn) => {
      btn.addEventListener('click', () => reviewApplication(btn.dataset.id, 'approved'));
    });
    tbody.querySelectorAll('.reject-app-btn').forEach((btn) => {
      btn.addEventListener('click', () => reviewApplication(btn.dataset.id, 'rejected'));
    });
  }

  async function reviewApplication(id, decision) {
    const notes = window.prompt(
      decision === 'approved'
        ? 'Optional review note for approving this application (an invitation link will be generated):'
        : 'Reason / review note for rejecting this application:',
      decision === 'approved' ? 'Credentials verified.' : 'Insufficient institutional verification.'
    );
    if (notes === null) return;

    const { ok, data } = await apiFetch(`/api/admin/applications/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewNotes: notes }),
    });

    const inviteBox = $('admin-invite-result');
    if (!ok) {
      alert(data.error || 'Could not process application review.');
      return;
    }

    if (decision === 'approved' && data.invitationUrl && inviteBox) {
      const fullUrl = window.location.origin + data.invitationUrl;
      inviteBox.innerHTML = `
        <p class="font-semibold text-ink">Application Approved — Single-Use Invitation Generated</p>
        <p class="text-[12px] text-ink-soft mt-1">Share this single-use activation link or token with the applicant (expires ${formatDateTime(data.inviteExpiresAt)}):</p>
        <div class="mt-2 bg-white border border-surface-mid rounded p-2.5 font-mono text-[11.5px] select-all break-all">${esc(fullUrl)}</div>
        <p class="mt-1 text-[11.5px] text-ink-mute">Token: <code class="font-mono select-all text-ink">${esc(data.invitationToken)}</code></p>`;
      inviteBox.classList.remove('hidden');
    }

    await Promise.all([loadAdminApplications(), loadStats(), loadAuditLogs()]);
  }

  // ---------- Helpline Management ----------
  async function handleHelplineUpsert(e) {
    e.preventDefault();
    const statusEl = $('helpline-admin-status');
    const payload = {
      helplineId: $('hl-id') ? $('hl-id').value.trim() : '',
      organisationName: $('hl-org') ? $('hl-org').value.trim() : '',
      countryName: $('hl-country-name') ? $('hl-country-name').value.trim() : '',
      countryCode: $('hl-country-code') ? $('hl-country-code').value.trim().toUpperCase() : '',
      phone: $('hl-phone') ? $('hl-phone').value.trim() : '',
      website: $('hl-website') ? $('hl-website').value.trim() : '',
      sourceUrl: $('hl-source') ? $('hl-source').value.trim() : '',
      operatingHours: $('hl-hours') ? $('hl-hours').value.trim() : '24/7',
      description: $('hl-desc') ? $('hl-desc').value.trim() : '',
    };

    const { ok, data } = await apiFetch('/api/admin/helplines', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (statusEl) {
      statusEl.className = 'mt-2 text-[12px] ' + (ok ? 'text-ok font-medium' : 'text-crisis');
      statusEl.textContent = ok
        ? `Saved verified helpline "${data.helpline.organisationName}" (${data.helpline.countryCode}).`
        : data.error || 'Could not save helpline.';
      statusEl.classList.remove('hidden');
    }
    if (ok) {
      e.target.reset();
      loadAuditLogs();
    }
  }

  // ---------- Load Audit Logs ----------
  async function loadAuditLogs() {
    const tbody = $('audit-logs-body');
    if (!tbody) return;
    const { ok, data } = await apiFetch('/api/admin/audit-logs');
    if (!ok) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-crisis-ink">Could not load audit logs.</td></tr>';
      return;
    }
    const logs = data.logs || [];
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-ink-mute">No audit events recorded yet.</td></tr>';
      return;
    }
    tbody.innerHTML = logs
      .slice(0, 25)
      .map(
        (l) => `
      <tr class="hover:bg-surface-low/50 transition text-[12px]">
        <td class="text-ink-mute whitespace-nowrap">${formatDateTime(l.timestamp)}</td>
        <td class="font-medium text-ink">${esc(l.actor)}</td>
        <td><span class="bg-surface-mid text-ink-soft rounded px-2 py-0.5 text-[11px] font-mono">${esc(l.action)}</span></td>
        <td class="text-ink-soft">${esc(l.dataCategory)}</td>
        <td class="text-ink-soft">${esc(l.details || l.target)}</td>
      </tr>`
      )
      .join('');
  }

  // ---------- Load Paginated User Directory Listings ----------
  async function loadUsers() {
    const tbody = $('user-table-body');
    const countEl = $('user-count');
    const pageInfo = $('page-info');
    const pageNumDisplay = $('page-number-display');
    const prevBtn = $('btn-prev-page');
    const nextBtn = $('btn-next-page');

    const params = new URLSearchParams({
      page: String(userPage),
      limit: String(userLimit),
      ...(userSearchQuery && { q: userSearchQuery }),
    });

    const { ok, data } = await apiFetch(`/api/admin/users?${params.toString()}`);
    if (!ok) {
      if (countEl) countEl.textContent = 'Unavailable';
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="text-center py-6 text-crisis-ink">Could not load users.</td></tr>';
      }
      return;
    }

    const { users = [], total = 0, page = 1, totalPages = 1 } = data;

    if (countEl) {
      countEl.textContent = `Showing ${users.length} of ${total} registered ${total === 1 ? 'account' : 'accounts'}`;
    }
    if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages || 1}`;
    if (pageNumDisplay) pageNumDisplay.textContent = String(page);
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-ink-mute">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = users
      .map(
        (u) => `
      <tr class="hover:bg-surface-low/50 transition">
        <td class="font-medium text-ink">${esc(u.name)}</td>
        <td class="text-ink-soft">${esc(u.email)}</td>
        <td><span class="bg-surface-mid text-ink rounded px-2 py-0.5 text-[11px] uppercase">${esc(u.role)}</span></td>
        <td class="text-ink-soft">${esc(u.country)}</td>
        <td class="text-ink-mute text-[12px]">${formatDate(u.createdAt)}</td>
        <td class="text-right">
          <button type="button" class="btn-secondary px-2.5 py-1 text-[11px] uppercase view-details-btn" data-id="${esc(u.id)}">
            Metadata
          </button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('.view-details-btn').forEach((btn) => {
      btn.addEventListener('click', () => revealUserDetails(btn.dataset.id));
    });
  }

  async function revealUserDetails(userId) {
    const modal = $('details-modal');
    if (!modal) return;

    ['detail-name', 'detail-email', 'detail-phone', 'detail-age', 'detail-country', 'detail-date'].forEach((id) => {
      if ($(id)) $(id).textContent = 'Loading…';
    });

    modal.classList.remove('hidden');

    const { ok, data } = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (!ok) {
      alert(data.error || 'Could not fetch user metadata.');
      modal.classList.add('hidden');
      return;
    }

    if ($('detail-name')) $('detail-name').textContent = data.name;
    if ($('detail-email')) $('detail-email').textContent = data.email;
    if ($('detail-phone')) $('detail-phone').textContent = data.phone || 'Not provided';
    if ($('detail-age')) $('detail-age').textContent = data.age !== null ? String(data.age) : 'Not provided';
    if ($('detail-country')) $('detail-country').textContent = data.country || 'Not provided';
    if ($('detail-date')) $('detail-date').textContent = formatDate(data.createdAt);
    loadAuditLogs();
  }

  init();
})();
