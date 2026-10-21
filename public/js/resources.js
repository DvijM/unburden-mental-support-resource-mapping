/* Resources page: loads curated publications from /api/resources
   and filters by category chip (All, Anxiety & Mood, Mindfulness & Coping, Policy & Community). */
(function () {
  'use strict';

  const chips = document.getElementById('res-chips');
  const grid = document.getElementById('res-grid');
  const empty = document.getElementById('res-empty');
  const count = document.getElementById('res-count');

  let allResources = [];
  let activeCategory = 'all';

  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[c]));

  // Visual gradients for the 3 categories matching the site's palette
  const GRADIENTS = {
    anxiety: 'from-[#CFC5B4] via-[#A99C86] to-[#5C554A]',
    mindfulness: 'from-[#EDE4D3] via-[#DCCFB8] to-[#B8A98D]',
    policy: 'from-[#D8CBB2] via-[#B8A27E] to-[#6E5F45]',
  };

  const CATEGORY_TAGS = {
    anxiety: 'Anxiety &amp; Mood',
    mindfulness: 'Mindfulness &amp; Coping',
    policy: 'Policy &amp; Community',
  };

  function cardHtml(r) {
    const gradient = GRADIENTS[r.category] || GRADIENTS.anxiety;
    return `
      <article data-cat="${esc(r.category)}" class="relative bg-white rounded-editorial shadow-card p-4 flex flex-col hover:-translate-y-1 hover:shadow-lg cursor-pointer transition duration-200 focus-within:ring-2 focus-within:ring-primary">
        <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br ${gradient} p-4 flex flex-col justify-between" role="img" aria-label="${esc(r.title)}">
         <img src="/images/resources/${esc(r.slug)}.png" alt="" loading="lazy" width="800" height="500"
               class="absolute inset-0 w-full h-full object-cover"
               onerror="this.remove()">
          <div class="relative flex items-start justify-between gap-2">
            <span class="bg-white/95 text-ink text-[9.5px] font-medium rounded px-2 py-0.5 shadow-sm">${esc(r.badge)}</span>
            <span class="bg-white/90 text-ink-mute text-[9.5px] rounded px-2 py-0.5">${esc(r.readTime)}</span>
          </div>
        </div>

        <p class="mt-4 text-[9.5px] tracking-[.12em] uppercase">
          <span class="text-primary font-medium">${CATEGORY_TAGS[r.category] || esc(r.categoryLabel)}</span>
          <span class="text-ink-mute">&bull; By ${esc(r.author || r.source)}</span>
        </p>

        <h3 class="font-display font-bold text-[17px] leading-snug mt-1.5 text-ink">
          ${esc(r.title)}
        </h3>

        <p class="text-[12px] text-ink-soft leading-relaxed mt-2 line-clamp-3">
          ${esc(r.summary)}
        </p>

        <div class="mt-auto pt-5 flex items-center justify-between text-[11px] border-t border-surface-mid">
          <a href="/resources/${esc(r.slug)}" class="text-primary font-medium hover:underline inline-flex items-center gap-1 after:content-[''] after:absolute after:inset-0">
            Read Full Article &rarr;
          </a>
          <span class="text-[10px] text-ink-mute font-medium">
            ${esc(r.readTime)}
          </span>
        </div>
      </article>`;
  }

  function render() {
    if (!grid) return;

    const filtered = allResources.filter(
      (r) => activeCategory === 'all' || r.category === activeCategory
    );

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
    } else {
      if (empty) empty.classList.add('hidden');
      grid.innerHTML = filtered.map(cardHtml).join('');
    }

    if (count) {
      count.textContent =
        activeCategory === 'all'
          ? `Showing all ${filtered.length} verified publications`
          : `Showing ${filtered.length} ${filtered.length === 1 ? 'publication' : 'publications'} in ${activeCategory === 'anxiety' ? 'Anxiety & Mood' : activeCategory === 'mindfulness' ? 'Mindfulness & Coping' : 'Policy & Community'}`;
    }
  }

  if (chips) {
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      activeCategory = btn.dataset.cat;
      chips.querySelectorAll('[data-cat]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn))
      );
      render();
    });
  }

  async function loadResources() {
    try {
      const res = await fetch('/api/resources');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allResources = await res.json();
      render();
    } catch (err) {
      console.error('Could not load resources:', err);
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full bg-crisis-bg text-crisis-ink rounded-editorial p-5 text-[13px]" role="alert">
            Could not load curated publications. Please refresh the page or explore our <a class="underline font-semibold" href="/find-support">crisis directory</a>.
          </div>`;
      }
    }
  }

  loadResources();
})();
