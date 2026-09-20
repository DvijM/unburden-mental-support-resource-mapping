/* Unburden — shared behaviour.
   Pages declare <div data-include="header|header-auth|footer" data-active="..."></div>
   and this script fetches the matching partial from /partials/. */
(async function () {
  'use strict';

  const slots = document.querySelectorAll('[data-include]');

  await Promise.all(
    [...slots].map(async (slot) => {
      const name = slot.dataset.include;
      try {
        const res = await fetch(`/partials/${name}.html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        slot.innerHTML = await res.text();
      } catch (err) {
        console.error(`Could not load partial "${name}":`, err);
      }
    })
  );

  // Highlight the current page in the main nav
  const active = document.body.dataset.page;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === active) {
      a.classList.add('text-primary', 'font-medium', 'border-b', 'border-primary');
      a.setAttribute('aria-current', 'page');
    }
  });

  // Auth header: swap the prompt depending on which auth page we are on
  const authLink = document.querySelector('[data-auth-link]');
  const authPrompt = document.querySelector('[data-auth-prompt]');
  if (authLink && document.body.dataset.page === 'login') {
    authLink.textContent = 'Register';
    authLink.setAttribute('href', '/register');
    if (authPrompt) authPrompt.textContent = 'New here?';
  }

  // Mobile menu toggle
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
})();
