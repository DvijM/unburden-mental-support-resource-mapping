/* Resources page: filter the catalog cards by category chip. */
(function () {
  'use strict';

  const chips = document.getElementById('res-chips');
  const cards = document.querySelectorAll('article[data-cat]');
  const empty = document.getElementById('res-empty');
  const count = document.getElementById('res-count');

  function apply(cat) {
    let shown = 0;
    cards.forEach((card) => {
      const match = cat === 'all' || card.dataset.cat === cat;
      card.classList.toggle('hidden', !match);
      if (match) shown += 1;
    });
    empty.classList.toggle('hidden', shown > 0);
    count.textContent = cat === 'all' ? '3 Core Formats Aligned' : `${shown} ${shown === 1 ? 'Resource' : 'Resources'}`;
  }

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    chips.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    apply(btn.dataset.cat);
  });
})();
