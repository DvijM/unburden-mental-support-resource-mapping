/* Find Support directory: loads listings from /api/helplines and filters
   by region, free-text search, and category chip. */
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

  let all = [];
  let category = 'all';

  // Escape text before putting it in innerHTML. Data comes from our own server,
  // but escaping keeps this safe if the source ever changes.
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function card(h) {
    const ext = h.secondary.external ? ' <span aria-hidden="true">&#8599;</span>' : ' <span aria-hidden="true">&rarr;</span>';
    const rel = h.secondary.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
    const primaryRel = h.primary.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
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
          <a href="${esc(h.primary.href)}"${primaryRel} class="btn-primary px-4 py-3 text-[12px] inline-flex items-center justify-center gap-2">${icon(h.primary.icon)}${esc(h.primary.label)}</a>
          <a href="${esc(h.secondary.href)}"${rel} class="btn-secondary px-4 py-2.5 text-[10px] tracking-[.1em] uppercase inline-flex items-center justify-center gap-1.5">${esc(h.secondary.label)}${ext}</a>
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
