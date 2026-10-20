/* Resource Detail Viewer: Loads article content from /api/resources/:slug
   Follows strict mode IIFE convention without front-end frameworks. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[c]));

  // Extract slug from URL pathname (e.g. /resources/nimh-generalized-anxiety-guide) or search param ?id=...
  function getSlug() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) return params.get('id');
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length > 1 && parts[0] === 'resources') {
      return parts[1];
    }
    return '';
  }

  async function loadResource() {
    const slug = getSlug();
    const container = $('article-container');
    const errorEl = $('article-error');

    if (!slug) {
      if (errorEl) errorEl.classList.remove('hidden');
      if (container) container.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/resources/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        if (errorEl) errorEl.classList.remove('hidden');
        if (container) container.classList.add('hidden');
        return;
      }

      const r = await res.json();

      // Page Title & Meta
      document.title = `${r.title} — Unburden Resource`;
      const meta = $('meta-description');
      if (meta) meta.setAttribute('content', r.summary);

      // Hero Elements
      if ($('page-title')) $('page-title').textContent = `${r.title} — Unburden`;
      if ($('breadcrumb-category')) $('breadcrumb-category').textContent = r.categoryLabel;
      if ($('article-badge')) $('article-badge').textContent = r.badge;
      if ($('article-read-time')) $('article-read-time').textContent = r.readTime;
      if ($('article-title')) $('article-title').textContent = r.title;
      if ($('article-summary')) $('article-summary').textContent = `“${r.summary}”`;

      // Author & Institution Credits
      const authorText = r.author || r.source || 'Authoring Clinician / Health Organization';
      if ($('article-author')) $('article-author').textContent = authorText;
      if ($('article-source')) $('article-source').textContent = authorText;
      if ($('article-institution')) {
        $('article-institution').textContent = r.institution || 'Verified Clinical & Public Health Institution';
      }

      // Academic Citation
      if ($('article-citation')) {
        $('article-citation').textContent = r.citation || `${authorText}. Comprehensive Clinical Guide. Unburden Resource Archive.`;
      }

      // Takeaways
      const takeawaysEl = $('article-takeaways');
      if (takeawaysEl && Array.isArray(r.takeaways)) {
        takeawaysEl.innerHTML = r.takeaways
          .map(
            (t) => `
          <li class="flex items-start gap-2.5">
            <svg class="w-4 h-4 text-primary flex-none mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7"/></svg>
            <span class="flex-1">${esc(t)}</span>
          </li>`
          )
          .join('');
      }

      // Full Sections: Render comprehensive multi-paragraph content
      const sectionsEl = $('article-sections');
      if (sectionsEl && Array.isArray(r.sections)) {
        sectionsEl.innerHTML = r.sections
          .map((sec) => {
            const paragraphs = String(sec.content || '')
              .split(/\n\n+/)
              .filter(Boolean)
              .map(
                (p) =>
                  `<p class="text-[14.5px] text-ink-soft leading-relaxed mt-4 font-sans">${esc(p)}</p>`
              )
              .join('');

            return `
          <section class="bg-white rounded-editorial shadow-card p-6 sm:p-8 border border-surface-mid">
            <h2 class="font-display font-bold text-[21px] text-ink border-b border-surface-mid pb-3">${esc(sec.heading)}</h2>
            ${paragraphs || `<p class="text-[14.5px] text-ink-soft leading-relaxed mt-4 font-sans">${esc(sec.content)}</p>`}
          </section>`;
          })
          .join('');
      }
    } catch (err) {
      console.error('Failed to load resource publication:', err);
      if (errorEl) errorEl.classList.remove('hidden');
      if (container) container.classList.add('hidden');
    }
  }

  loadResource();
})();
