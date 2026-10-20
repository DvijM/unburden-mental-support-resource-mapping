/* Admin Dashboard: Data Minimisation & Visual Demographic Analytics
   - Pie chart of user ages that used the site
   - Assessment severity distribution graph & average score placement
   - Crisis & Helpline Support Inquiries intake table
   - Data-minimised User Directory with on-demand audited reveal */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

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

  async function apiFetch(url, opts = {}) {
    const token = localStorage.getItem('unburden_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
    const res = await fetch(url, {
      headers: { ...headers, ...opts.headers },
      ...opts,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  }

  // Dashboard State
  let userPage = 1;
  const userLimit = 10;
  let userSearchQuery = '';
  let searchTimeout = null;

  let inquiryPage = 1;
  const inquiryLimit = 10;

  async function init() {
    const { ok, data } = await apiFetch('/api/session');
    if (!ok || data.role !== 'admin') {
      window.location.href = '/login';
      return;
    }

    if (data.name && $('admin-greeting')) {
      $('admin-greeting').textContent = `Admin: ${data.name.split(' ')[0]}`;
      $('admin-greeting').classList.remove('hidden');
    }

    await Promise.all([loadStats(), loadUsers(), loadInquiries()]);

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

    // Support Inquiries Pagination
    const prevInqBtn = $('btn-prev-inquiries');
    const nextInqBtn = $('btn-next-inquiries');
    if (prevInqBtn) {
      prevInqBtn.addEventListener('click', () => {
        if (inquiryPage > 1) {
          inquiryPage -= 1;
          loadInquiries();
        }
      });
    }
    if (nextInqBtn) {
      nextInqBtn.addEventListener('click', () => {
        inquiryPage += 1;
        loadInquiries();
      });
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
        localStorage.removeItem('unburden_token');
        window.location.href = '/';
      });
    }
  }

  // ---------- Graphical Visualizations ----------
  const AGE_COLORS = [
    '#1E3A2F', // Forest (Under 18)
    '#2E5A44', // Pine Green (18 to 24)
    '#4A8568', // Muted Sage (25 to 34)
    '#7E9F8E', // Soft Teal (35 to 44)
    '#C59B27', // Gold (45 to 54)
    '#D97706', // Warm Amber (55 and over)
  ];

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

    // Filter valid positive slices
    const slices = ageData.map((d, i) => {
      // Use raw count or numerical count (or 1 if non-zero under 5)
      let val = 0;
      if (typeof d.rawCount === 'number') val = d.rawCount;
      else if (typeof d.count === 'number') val = d.count;
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
      if (legendEl) legendEl.innerHTML = '<p class="text-ink-mute text-[11px]">No age data recorded yet.</p>';
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 8;
    const innerRadius = radius * 0.52; // Doughnut hole

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

      // Border outline between slices
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle = endAngle;
    });

    // Center doughnut text
    ctx.fillStyle = '#1A1C1D';
    ctx.font = 'bold 15px "Noto Serif", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${totalVal}`, centerX, centerY - 8);
    ctx.fillStyle = '#6F7972';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText('USERS', centerX, centerY + 10);

    // Render legend
    if (legendEl) {
      legendEl.innerHTML = slices
        .map(
          (s) => `
        <div class="flex items-center justify-between py-1 border-b border-surface-low/80">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full flex-none shadow-sm" style="background-color: ${s.color};"></span>
            <span class="text-ink-soft text-[11.5px]">${esc(s.label)}</span>
          </div>
          <span class="font-medium text-ink text-[11px]">${esc(s.displayCount)}</span>
        </div>`
        )
        .join('');
    }
  }

  // ---------- Assessment (per-inventory) charts ----------
  let assessmentStats = null;

  let lastBands = null;

  function drawScoreDistributionChart(bands) {
    const canvas = $('score-dist-chart');
    if (!canvas) return;
    lastBands = bands;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    // Draw at the actual displayed width so the bitmap is never stretched (blurry)
    const w = Math.max(Math.round(canvas.parentElement.clientWidth || canvas.clientWidth || 400), 260);
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
        ctx.roundRect(x, y, barWidth, barH, [r, r, 0, 0]);
        ctx.fill();

        ctx.fillStyle = '#1A1C1D';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(String(bar.displayCount), x + barWidth / 2, y - 4);
      }

      ctx.fillStyle = '#6F7972';
      ctx.font = '11px Inter, sans-serif';
      const words = bar.name.split(' ');
      const mid = Math.ceil(words.length / 2);
      const lines = words.length > 1 && bar.name.length > 10
        ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
        : [bar.name];
      lines.forEach((ln, i) => ctx.fillText(ln, x + barWidth / 2, h - padBottom + 13 + i * 11));
      ctx.fillStyle = '#9AA39D';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(bar.range, x + barWidth / 2, h - padBottom + 13 + lines.length * 11);
    });

    if (bars.every((b) => b.value === 0)) {
      ctx.fillStyle = '#6F7972';
      ctx.font = '11px Inter, sans-serif';
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

    // Spectrum bar built from this inventory's bands
    if (barEl) {
      barEl.innerHTML = a.bands
        .map((b) => `<div style="flex:${b.max - b.min + 1};background:${b.color}" title="${esc(b.band)}"></div>`)
        .join('');
    }
    if (labelsEl) {
      labelsEl.innerHTML =
        a.bands.map((b) => `<span>${b.min}</span>`).join('') + `<span>${a.max}</span>`;
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
    const sub = $('severity-title') && $('severity-title').nextElementSibling;
    if (sub) sub.textContent = `Aggregated ${a.name} bands`;
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


  // Load Aggregated Metrics & Charts
  async function loadStats() {
    const { ok, data } = await apiFetch('/api/admin/stats');
    if (!ok) return;

    if ($('stat-total')) $('stat-total').textContent = data.totalUsers ?? 0;
    if ($('stat-scores')) $('stat-scores').textContent = data.totalScreenings ?? 0;
    if ($('stat-avg')) $('stat-avg').textContent = data.avgScore !== null ? data.avgScore : '—';
    if ($('stat-requests')) $('stat-requests').textContent = data.totalSupportRequests ?? 0;

    // Render Demographic Age Pie Chart
    if (Array.isArray(data.ageDistribution)) {
      drawAgePieChart(data.ageDistribution);
    }

    // Per-assessment graph (dropdown switchable) & severity list
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
        countryList.innerHTML = '<li class="text-ink-mute text-[11px]">No country data recorded yet.</li>';
      } else {
        countryList.innerHTML = data.countryDistribution
          .map(
            (item) => `
          <li class="flex items-center justify-between py-1 border-b border-surface-low">
            <span class="text-ink-soft min-w-0 pr-3">${esc(item.name)} <span class="text-ink-mute text-[10px]">(${esc(item.code)})</span></span>
            <span class="font-medium flex-none text-ink">${esc(item.rawCount)} <span class="text-ink-mute font-normal text-[10px]">${esc(item.percent)}%</span></span>
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

  // ---------- Load Crisis / Helpline Inquiries ----------
  async function loadInquiries() {
    const tbody = $('inquiries-table-body');
    const countEl = $('inquiries-count');
    const pageInfo = $('inquiries-page-info');
    const pageDisplay = $('inquiries-page-display');
    const prevBtn = $('btn-prev-inquiries');
    const nextBtn = $('btn-next-inquiries');

    const params = new URLSearchParams({
      page: String(inquiryPage),
      limit: String(inquiryLimit),
    });

    const { ok, data } = await apiFetch(`/api/admin/support-requests?${params.toString()}`);
    if (!ok) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-crisis-ink">Could not load support requests.</td></tr>';
      }
      return;
    }

    const { requests, total, page, totalPages } = data;

    if (countEl) {
      countEl.textContent = `${total} helpline ${total === 1 ? 'inquiry' : 'inquiries'} recorded &middot; Page ${page} of ${totalPages || 1}`;
    }
    if (pageInfo) {
      pageInfo.textContent = `Page ${page} of ${totalPages || 1}`;
    }
    if (pageDisplay) {
      pageDisplay.textContent = String(page);
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (!tbody) return;

    if (requests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-ink-mute">No helpline inquiries recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = requests
      .map(
        (r) => `
      <tr class="hover:bg-surface-low/50 transition">
        <td class="text-ink-mute text-[11px] whitespace-nowrap">${formatDateTime(r.createdAt)}</td>
        <td class="font-medium text-ink">${esc(r.name)}</td>
        <td class="font-mono text-primary font-medium text-[11.5px]">${esc(r.phone)}</td>
        <td class="text-ink-soft text-[11.5px]">${esc(r.email)}</td>
        <td class="text-ink-soft text-[11.5px]">${esc(r.age)} yrs &middot; ${esc(r.country)}</td>
        <td>
          <span class="bg-primary-tint text-primary text-[10.5px] font-medium rounded px-2 py-0.5 inline-block">
            ${esc(r.helplineName)}
          </span>
        </td>
        <td class="text-ink-soft text-[11px]">${r.notes && r.notes.trim()
          ? `<button type="button" class="btn-secondary px-2.5 py-1 text-[10.5px] tracking-[.06em] uppercase view-note-btn" data-id="${esc(r.id)}">View note</button>`
          : '-'}</td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('.view-note-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = requests.find((x) => x.id === btn.dataset.id);
        if (r) openNoteModal(r);
      });
    });
  }

  function openNoteModal(r) {
    const modal = $('note-modal');
    if (!modal) return;
    $('note-from').textContent = `${r.name} \u00B7 ${formatDateTime(r.createdAt)}`;
    $('note-body').textContent = r.notes;
    modal.classList.remove('hidden');
  }

  function closeNoteModal() {
    const modal = $('note-modal');
    if (modal) modal.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    const modal = $('note-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (e.target === modal || e.target.closest('[data-close-note]')) closeNoteModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNoteModal();
  });

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
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-crisis-ink">Could not load users.</td></tr>';
      }
      return;
    }

    const { users, total, page, totalPages } = data;

    if (countEl) {
      countEl.textContent = `Showing ${users.length} of ${total} registered ${total === 1 ? 'user' : 'users'}`;
    }
    if (pageInfo) {
      pageInfo.textContent = `Page ${page} of ${totalPages || 1}`;
    }
    if (pageNumDisplay) {
      pageNumDisplay.textContent = String(page);
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-ink-mute">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = users
      .map(
        (u) => `
      <tr class="hover:bg-surface-low/50 transition">
        <td class="font-medium text-ink">${esc(u.name)}</td>
        <td class="text-ink-soft">${esc(u.email)}</td>
        <td class="text-ink-soft">${esc(u.country)}</td>
        <td class="text-ink-mute text-[11px]">${formatDate(u.createdAt)}</td>
        <td class="text-right">
          <button type="button" class="btn-secondary px-2.5 py-1 text-[10.5px] tracking-[.06em] uppercase view-details-btn" data-id="${esc(u.id)}">
            View details
          </button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('.view-details-btn').forEach((btn) => {
      btn.addEventListener('click', () => revealUserDetails(btn.dataset.id));
    });
  }

  // Single User Details Reveal (Audit Logged)
  async function revealUserDetails(userId) {
    const modal = $('details-modal');
    if (!modal) return;

    if ($('detail-name')) $('detail-name').textContent = 'Loading…';
    if ($('detail-email')) $('detail-email').textContent = 'Loading…';
    if ($('detail-phone')) $('detail-phone').textContent = 'Loading…';
    if ($('detail-age')) $('detail-age').textContent = 'Loading…';
    if ($('detail-country')) $('detail-country').textContent = 'Loading…';
    if ($('detail-date')) $('detail-date').textContent = 'Loading…';

    modal.classList.remove('hidden');

    const { ok, data } = await apiFetch(`/api/admin/users/${userId}`);
    if (!ok) {
      alert('Could not fetch user details.');
      modal.classList.add('hidden');
      return;
    }

    if ($('detail-name')) $('detail-name').textContent = data.name;
    if ($('detail-email')) $('detail-email').textContent = data.email;
    if ($('detail-phone')) $('detail-phone').textContent = data.phone || 'Not provided';
    if ($('detail-age')) $('detail-age').textContent = data.age !== null ? String(data.age) : 'Not provided';
    if ($('detail-country')) $('detail-country').textContent = data.country || 'Not provided';
    if ($('detail-date')) $('detail-date').textContent = formatDate(data.createdAt);
  }

  init();
})();
