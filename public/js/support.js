/* Find Support & Global Helpline Directory
   - Searchable country selector using the full ISO country list
   - Direct access to telephone, SMS, and web links (never blocked by mandatory intake forms)
   - Verified source URL, last-verified date, and verification status on every entry
   - International fallback directories (Find A Helpline, Befrienders Worldwide, IASP)
   - Report Incorrect Information modal for user feedback */
(function () {
  'use strict';

  const ICONS = {
    phone: '<path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.6 3.5 1 1 0 01-.25 1z" fill="currentColor" stroke="none"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    globe: '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"/></g>',
  };
  const icon = (name, cls = 'w-3.5 h-3.5') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.globe}</svg>`;

  const $ = (id) => document.getElementById(id);
  const list = $('dir-list');
  const empty = $('dir-empty');
  const count = $('result-count');
  const countrySelect = $('region');
  const countryFilterInput = $('country-filter-input');
  const search = $('search');
  const chips = $('chips');
  const fallbackNotice = $('country-fallback-notice');

  // Report modal elements
  const reportModal = $('report-modal');
  const reportForm = $('report-form');
  const reportTargetName = $('report-target-name');
  const reportReason = $('report-reason');
  const reportDetails = $('report-details');
  const reportStatus = $('report-status');
  const reportCloseBtn = $('report-close-btn');
  const reportCancelBtn = $('report-cancel-btn');

  let allHelplines = [];
  let allCountries = [];
  let category = 'all';
  let reportingHelplineId = null;

  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function formatVerifiedDate(iso) {
    if (!iso) return 'Verified';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (_) {
      return 'Verified';
    }
  }

  function card(h) {
    const ext = h.secondary && h.secondary.external ? ' <span aria-hidden="true">&#8599;</span>' : ' <span aria-hidden="true">&rarr;</span>';
    const langs = Array.isArray(h.languages) && h.languages.length ? h.languages.join(', ') : 'English';
    const hours = h.operatingHours || '24/7';
    const verifiedBadge =
      h.verificationStatus === 'verified'
        ? `<span class="bg-primary-tint text-primary text-[11px] font-medium rounded px-2 py-0.5">Verified &middot; ${esc(formatVerifiedDate(h.lastVerifiedAt))}</span>`
        : `<span class="bg-surface-mid text-ink-soft text-[11px] font-medium rounded px-2 py-0.5">Under Review</span>`;

    const primaryHref = (h.primary && h.primary.href) || h.website || h.sourceUrl || '#';
    const primaryLabel = (h.primary && h.primary.label) || 'Contact Helpline';
    const primaryIcon = (h.primary && h.primary.icon) || 'phone';
    const primaryExternal = !primaryHref.startsWith('tel:') && !primaryHref.startsWith('sms:');

    const secondaryHref = (h.secondary && h.secondary.href) || h.sourceUrl || h.website || '#';
    const secondaryLabel = (h.secondary && h.secondary.label) || 'Official Source';

    return `
      <article class="bg-white rounded-editorial shadow-card p-5 sm:p-6 grid md:grid-cols-[1fr_230px] gap-6 items-start border border-surface-mid">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="bg-surface-mid text-ink font-semibold text-[11px] rounded px-2 py-0.5">${esc(h.countryName || h.countryCode || 'Global')}</span>
            <span class="bg-primary-tint text-primary text-[11px] font-medium rounded px-2 py-0.5">${esc(h.badge)}</span>
            ${verifiedBadge}
          </div>

          <h3 class="font-display font-bold text-[20px] leading-snug mt-2.5 text-ink">${esc(h.organisationName || h.name)}</h3>
          <p class="text-[12px] text-ink-mute mt-0.5">${esc(h.designation || '')}</p>
          <p class="text-[14px] text-ink-soft leading-relaxed mt-2.5 max-w-2xl">${esc(h.description)}</p>

          <dl class="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-ink-soft">
            <div><dt class="inline font-semibold text-ink">Hours:</dt> <dd class="inline">${esc(hours)}</dd></div>
            <div><dt class="inline font-semibold text-ink">Languages:</dt> <dd class="inline">${esc(langs)}</dd></div>
            ${h.eligibility ? `<div class="sm:col-span-2"><dt class="inline font-semibold text-ink">Eligibility:</dt> <dd class="inline">${esc(h.eligibility)}</dd></div>` : ''}
          </dl>

          <ul class="mt-3.5 flex flex-wrap gap-2">
            ${(h.channels || []).map((c) => `<li class="bg-surface-low rounded px-2.5 py-1.5 text-[12px] text-ink-soft flex items-center gap-1.5">${icon(c.icon, 'w-3.5 h-3.5 text-primary')}${esc(c.label)}</li>`).join('')}
          </ul>

          <div class="mt-4 pt-3 border-t border-surface-low flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-mute">
            <span>Official Source: <a href="${esc(h.sourceUrl || secondaryHref)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${esc(h.sourceUrl || secondaryHref)}</a></span>
            <button type="button" class="text-ink-soft hover:text-crisis underline report-helpline-btn" data-id="${esc(h.id)}" data-name="${esc(h.organisationName || h.name)}">
              Report incorrect info
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2.5 w-full">
          <a href="${esc(primaryHref)}" ${primaryExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}
            class="btn-primary px-4 py-3 text-[13px] inline-flex items-center justify-center gap-2 text-center">
            ${icon(primaryIcon)}${esc(primaryLabel)}
          </a>
          <a href="${esc(secondaryHref)}" target="_blank" rel="noopener noreferrer"
            class="btn-secondary px-4 py-2.5 text-[12px] inline-flex items-center justify-center gap-1.5 text-center">
            ${esc(secondaryLabel)}${ext}
          </a>
        </div>
      </article>`;
  }

  function render() {
    if (!list) return;
    const q = search ? search.value.trim().toLowerCase() : '';
    const selectedCountry = countrySelect ? countrySelect.value : 'ALL';

    if (selectedCountry && selectedCountry !== 'ALL') {
      localStorage.setItem('unburden_selected_country', selectedCountry);
    }

    let localMatches = 0;

    const rows = allHelplines.filter((h) => {
      const code = (h.countryCode || 'GLOBAL').toUpperCase();
      let inCountry = true;
      if (selectedCountry && selectedCountry !== 'ALL') {
        const isLocal = code === selectedCountry || (Array.isArray(h.regions) && h.regions.includes(selectedCountry));
        const isGlobalFallback = code === 'GLOBAL';
        if (isLocal) localMatches += 1;
        inCountry = isLocal || isGlobalFallback;
      }

      const inCat = category === 'all' || (Array.isArray(h.categories) && h.categories.includes(category));
      const hay = [
        h.organisationName,
        h.name,
        h.countryName,
        h.countryCode,
        h.badge,
        h.designation,
        h.description,
        ...(h.languages || []),
        ...(h.channels || []).map((c) => c.label),
      ]
        .join(' ')
        .toLowerCase();
      const inText = !q || hay.includes(q);
      return inCountry && inCat && inText;
    });

    // Sort local entries ahead of GLOBAL fallback directories
    rows.sort((a, b) => {
      const aGlobal = (a.countryCode || 'GLOBAL') === 'GLOBAL' ? 1 : 0;
      const bGlobal = (b.countryCode || 'GLOBAL') === 'GLOBAL' ? 1 : 0;
      return aGlobal - bGlobal;
    });

    list.innerHTML = rows.map(card).join('');
    if (empty) empty.classList.toggle('hidden', rows.length > 0);

    if (fallbackNotice) {
      const showFallback = selectedCountry && selectedCountry !== 'ALL' && localMatches === 0;
      fallbackNotice.classList.toggle('hidden', !showFallback);
    }

    if (count) {
      count.textContent = `Showing ${rows.length} verified ${rows.length === 1 ? 'entry' : 'entries'}`;
    }
  }

  function populateCountryOptions(filterText = '') {
    if (!countrySelect) return;
    const currentVal = countrySelect.value || localStorage.getItem('unburden_selected_country') || 'ALL';
    const q = filterText.trim().toLowerCase();

    const baseOpts = [
      { code: 'ALL', label: 'All Countries & International Directories' },
      { code: 'GLOBAL', label: 'International Directories Only (Find A Helpline, Befrienders, IASP)' },
    ];

    const matchingCountries = allCountries.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );

    countrySelect.innerHTML = '';
    baseOpts.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.code;
      opt.textContent = b.label;
      countrySelect.appendChild(opt);
    });

    matchingCountries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = `${c.name} (${c.code})`;
      countrySelect.appendChild(opt);
    });

    if ([...countrySelect.options].some((o) => o.value === currentVal)) {
      countrySelect.value = currentVal;
    } else if (matchingCountries.length === 1) {
      countrySelect.value = matchingCountries[0].code;
    }
  }

  async function loadCountries() {
    try {
      const res = await fetch('/api/countries');
      if (!res.ok) return;
      allCountries = await res.json();
      populateCountryOptions();
      const savedCountry = localStorage.getItem('unburden_selected_country');
      if (savedCountry && countrySelect && [...countrySelect.options].some((o) => o.value === savedCountry)) {
        countrySelect.value = savedCountry;
      }
      render();
    } catch (_) {}
  }

  // Report Incorrect Information Modal
  function openReportModal(id, name) {
    reportingHelplineId = id;
    if (reportTargetName) reportTargetName.textContent = name;
    if (reportReason) reportReason.value = '';
    if (reportDetails) reportDetails.value = '';
    if (reportStatus) reportStatus.classList.add('hidden');
    if (reportModal) reportModal.classList.remove('hidden');
  }

  function closeReportModal() {
    reportingHelplineId = null;
    if (reportModal) reportModal.classList.add('hidden');
  }

  if (list) {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.report-helpline-btn');
      if (!btn) return;
      openReportModal(btn.dataset.id, btn.dataset.name);
    });
  }

  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!reportingHelplineId) return;
      const reason = reportReason ? reportReason.value.trim() : '';
      const details = reportDetails ? reportDetails.value.trim() : '';
      if (reason.length < 3) {
        if (reportStatus) {
          reportStatus.textContent = 'Please provide a brief reason (at least 3 characters).';
          reportStatus.className = 'mt-2 text-[12px] text-crisis';
        }
        return;
      }
      try {
        const res = await fetch(`/api/helplines/${encodeURIComponent(reportingHelplineId)}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, details }),
        });
        const data = await res.json();
        if (reportStatus) {
          reportStatus.textContent = data.message || data.error || 'Report submitted.';
          reportStatus.className = 'mt-2 text-[12px] ' + (res.ok ? 'text-primary font-medium' : 'text-crisis');
        }
        if (res.ok) {
          setTimeout(closeReportModal, 1200);
        }
      } catch (_) {
        if (reportStatus) {
          reportStatus.textContent = 'Could not submit report. Please try again.';
          reportStatus.className = 'mt-2 text-[12px] text-crisis';
        }
      }
    });
  }

  if (reportCloseBtn) reportCloseBtn.addEventListener('click', closeReportModal);
  if (reportCancelBtn) reportCancelBtn.addEventListener('click', closeReportModal);

  if (chips) {
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      category = btn.dataset.cat;
      chips.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      render();
    });
  }

  if (countryFilterInput) {
    countryFilterInput.addEventListener('input', (e) => {
      populateCountryOptions(e.target.value);
      render();
    });
  }
  if (countrySelect) countrySelect.addEventListener('change', render);
  if (search) search.addEventListener('input', render);
  if ($('refine')) $('refine').addEventListener('click', render);

  loadCountries();

  fetch('/api/helplines')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      allHelplines = data;
      render();
    })
    .catch((err) => {
      console.error('Could not load helplines:', err);
      if (list) {
        list.innerHTML = `
          <div class="bg-crisis-bg text-crisis-ink rounded-editorial p-5 text-[14px]" role="alert">
            The interactive directory could not be loaded. If you need help right now, please use the emergency numbers below or visit <a class="underline font-semibold" href="https://findahelpline.com/" target="_blank" rel="noopener noreferrer">Find A Helpline</a>.
          </div>`;
      }
    });
})();
