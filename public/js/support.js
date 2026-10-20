/* Find Support directory: loads listings from /api/helplines and filters
   by region, free-text search, and category chip.
   Helpline Intake: forces visitors to submit contact details before accessing helpline numbers,
   storing support requests on the server for admin visibility. */
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
  const region = $('region');
  const search = $('search');
  const chips = $('chips');

  // Intake Elements
  const modal = $('intake-modal');
  const form = $('intake-form');
  const targetNameEl = $('intake-target-name');
  const closeBtn = $('intake-close-btn');
  const cancelBtn = $('intake-cancel-btn');
  const countrySelect = $('intake-country');
  const generalError = $('intake-general-error');

  const fields = {
    name: $('intake-name'),
    email: $('intake-email'),
    phone: $('intake-phone'),
    age: $('intake-age'),
    country: $('intake-country'),
    notes: $('intake-notes'),
  };

  const errors = {
    name: $('intake-name-error'),
    email: $('intake-email-error'),
    phone: $('intake-phone-error'),
    age: $('intake-age-error'),
    country: $('intake-country-error'),
  };

  let all = [];
  let category = 'all';
  let pendingHelpline = null;

  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function card(h) {
    const ext = h.secondary.external ? ' <span aria-hidden="true">&#8599;</span>' : ' <span aria-hidden="true">&rarr;</span>';
    return `
      <article class="bg-white rounded-editorial shadow-card p-5 sm:p-6 grid md:grid-cols-[1fr_220px] gap-6 items-center">
        <div>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="bg-primary-tint text-primary text-[9.5px] font-medium rounded px-2 py-0.5">${esc(h.badge)}</span>
            <span class="text-[9.5px] tracking-[.1em] uppercase text-ink-mute">${esc(h.designation)}</span>
          </p>
          <h3 class="font-display font-bold text-[19px] leading-snug mt-2">${esc(h.name)}</h3>
          <p class="text-[12.5px] text-ink-soft leading-relaxed mt-2 max-w-2xl">${esc(h.description)}</p>
          <ul class="mt-4 flex flex-wrap gap-2">
            ${h.channels.map((c) => `<li class="bg-surface-low rounded px-2.5 py-1.5 text-[10.5px] text-ink-soft flex items-center gap-1.5">${icon(c.icon, 'w-3 h-3 text-ink-mute')}${esc(c.label)}</li>`).join('')}
          </ul>
        </div>
        <div class="flex flex-col gap-2.5">
          <button type="button" class="btn-primary px-4 py-3 text-[12px] inline-flex items-center justify-center gap-2 helpline-action-btn"
            data-href="${esc(h.primary.href)}" data-name="${esc(h.name)}" data-target="primary">
            ${icon(h.primary.icon)}${esc(h.primary.label)}
          </button>
          <button type="button" class="btn-secondary px-4 py-2.5 text-[10px] tracking-[.1em] uppercase inline-flex items-center justify-center gap-1.5 helpline-action-btn"
            data-href="${esc(h.secondary.href)}" data-name="${esc(h.name)}" data-target="secondary">
            ${esc(h.secondary.label)}${ext}
          </button>
        </div>
      </article>`;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const r = region.value;

    const rows = all.filter((h) => {
      const inRegion = h.regions.includes(r);
      const inCat = category === 'all' || h.categories.includes(category);
      const hay = [h.name, h.badge, h.designation, h.description, ...h.channels.map((c) => c.label)].join(' ').toLowerCase();
      const inText = !q || hay.includes(q);
      return inRegion && inCat && inText;
    });

    list.innerHTML = rows.map(card).join('');
    empty.classList.toggle('hidden', rows.length > 0);
    count.textContent = `Showing ${rows.length} certified global & national ${rows.length === 1 ? 'hub' : 'hubs'}`;
  }

  // ---------- Country Dropdown Population ----------
  async function loadCountries() {
    try {
      const res = await fetch('/api/countries');
      if (!res.ok) return;
      const countries = await res.json();
      if (!countrySelect) return;
      countries.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = `${c.name} (${c.code})`;
        countrySelect.appendChild(opt);
      });
    } catch (_) {}
  }

  // ---------- Intake Modal Logic ----------
  function openIntake(helplineName, href) {
    pendingHelpline = { name: helplineName, href: href };
    if (targetNameEl) targetNameEl.textContent = helplineName;

    // Check pre-saved intake details
    const saved = sessionStorage.getItem('unburden_helpline_intake');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (fields.name) fields.name.value = parsed.name || '';
        if (fields.email) fields.email.value = parsed.email || '';
        if (fields.phone) fields.phone.value = parsed.phone || '';
        if (fields.age) fields.age.value = parsed.age || '';
        if (fields.country) fields.country.value = parsed.country || '';
      } catch (_) {}
    }

    // Clear previous errors
    clearErrors();
    if (modal) modal.classList.remove('hidden');
    if (fields.name) fields.name.focus();
  }

  function closeIntake() {
    if (modal) modal.classList.add('hidden');
    pendingHelpline = null;
    clearErrors();
  }

  function clearErrors() {
    if (generalError) {
      generalError.textContent = '';
      generalError.classList.add('hidden');
    }
    Object.values(errors).forEach((el) => {
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
  }

  function setFieldError(field, msg) {
    const el = errors[field];
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function executeHelplineLink(href) {
    if (!href) return;
    if (href.startsWith('tel:') || href.startsWith('sms:')) {
      window.location.href = href;
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }

  async function handleIntakeSubmit(e) {
    e.preventDefault();
    clearErrors();

    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const phone = fields.phone.value.trim();
    const age = parseInt(fields.age.value, 10);
    const country = fields.country.value.trim();
    const notes = fields.notes ? fields.notes.value.trim() : '';

    let hasError = false;

    if (!name || name.length < 2) {
      setFieldError('name', 'Full name must be at least 2 characters.');
      hasError = true;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('email', 'Please enter a valid email address.');
      hasError = true;
    }
    if (!phone || phone.length < 7) {
      setFieldError('phone', 'Please enter a valid phone number (e.g. +14155550199).');
      hasError = true;
    }
    if (isNaN(age) || age < 13 || age > 120) {
      setFieldError('age', 'Please enter an age between 13 and 120.');
      hasError = true;
    }
    if (!country) {
      setFieldError('country', 'Please select your country.');
      hasError = true;
    }

    if (hasError) return;

    const payload = {
      name,
      email,
      phone,
      age,
      country,
      helplineName: pendingHelpline ? pendingHelpline.name : 'Unknown Helpline',
      helplineContact: pendingHelpline ? pendingHelpline.href : '',
      notes,
    };

    const submitBtn = $('intake-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting & Connecting…';
    }

    try {
      const token = localStorage.getItem('unburden_token');
      const res = await fetch('/api/support-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.field) {
          setFieldError(data.field, data.error);
        } else if (generalError) {
          generalError.textContent = data.error || 'Could not record intake details. Please try again.';
          generalError.classList.remove('hidden');
        }
        return;
      }

      // Save to sessionStorage so subsequent clicks in this session don't re-prompt
      sessionStorage.setItem('unburden_helpline_intake', JSON.stringify({ name, email, phone, age, country }));

      const target = pendingHelpline ? pendingHelpline.href : null;
      closeIntake();
      executeHelplineLink(target);
    } catch (err) {
      if (generalError) {
        generalError.textContent = 'Connection error. Please try again or dial your local emergency services.';
        generalError.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Proceed to Helpline</span> <span aria-hidden="true">&rarr;</span>';
      }
    }
  }

  // Intercept click on helpline cards
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.helpline-action-btn');
    if (!btn) return;
    e.preventDefault();

    const href = btn.dataset.href;
    const name = btn.dataset.name;

    // Check if user already submitted intake in this session
    const saved = sessionStorage.getItem('unburden_helpline_intake');
    if (saved) {
      executeHelplineLink(href);
    } else {
      openIntake(name, href);
    }
  });

  // Also intercept any emergency notice link if clicked
  document.querySelectorAll('a[href^="tel:"], a[href^="sms:"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const saved = sessionStorage.getItem('unburden_helpline_intake');
      if (!saved) {
        e.preventDefault();
        openIntake(link.textContent.trim() || 'Crisis Helpline', link.getAttribute('href'));
      }
    });
  });

  if (form) form.addEventListener('submit', handleIntakeSubmit);
  if (closeBtn) closeBtn.addEventListener('click', closeIntake);
  if (cancelBtn) cancelBtn.addEventListener('click', closeIntake);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeIntake();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeIntake();
    }
  });

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    category = btn.dataset.cat;
    chips.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render();
  });

  region.addEventListener('change', render);
  search.addEventListener('input', render);
  $('refine').addEventListener('click', render);

  // Try pre-filling if user is logged in
  async function prefillLoggedInUser() {
    const token = localStorage.getItem('unburden_token');
    if (!token) return;
    try {
      const res = await fetch('/api/session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const session = await res.json();
        if (fields.name && !fields.name.value) fields.name.value = session.name || '';
        if (fields.email && !fields.email.value) fields.email.value = session.email || '';
      }
    } catch (_) {}
  }

  loadCountries();
  prefillLoggedInUser();

  fetch('/api/helplines')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => { all = data; render(); })
    .catch((err) => {
      console.error('Could not load helplines:', err);
      list.innerHTML = `
        <div class="bg-crisis-bg text-crisis-ink rounded-editorial p-5 text-[13px]" role="alert">
          The directory could not be loaded. If you need help now, call or text <a class="underline font-semibold" href="tel:988">988</a> (US/Canada) or contact your local emergency services.
        </div>`;
    });
})();
