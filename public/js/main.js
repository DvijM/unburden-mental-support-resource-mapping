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

  // Signed-in state: replace Log In / Register with avatar, first name and Log out
  const token = localStorage.getItem('unburden_token');
  if (token) {
    try {
      const res = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('expired');
      const me = await res.json();
      const first = String(me.name || 'Account').trim().split(/\s+/)[0];
      const targets = [...document.querySelectorAll(
        'header a[href="/login"], header a[href="/register"], [data-auth-link], [data-auth-prompt]'
      )];
      if (targets.length) {
        const box = document.createElement('div');
        box.className = 'flex items-center gap-2.5';
        const avatar = document.createElement('span');
        avatar.className = 'w-7 h-7 rounded-full bg-primary text-white grid place-items-center text-[12px] font-semibold flex-none';
        avatar.textContent = first.charAt(0).toUpperCase();
        avatar.setAttribute('aria-hidden', 'true');
        const nameEl = me.role === 'admin' ? document.createElement('a') : document.createElement('span');
        nameEl.className = 'hidden sm:inline text-[12px] font-medium text-ink';
        nameEl.textContent = first;
        if (me.role === 'admin') nameEl.href = '/admin';
        const out = document.createElement('button');
        out.type = 'button';
        out.className = 'text-[12px] text-primary font-medium hover:underline';
        out.textContent = 'Log out';
        out.addEventListener('click', async () => {
          try {
            await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          } catch (_) { /* ignore */ }
          localStorage.removeItem('unburden_token');
          window.location.href = '/';
        });
        box.append(avatar, nameEl, out);
        targets[0].before(box);
        targets.forEach((t) => t.remove());
      }
    } catch (_) {
      localStorage.removeItem('unburden_token');
    }
  }


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
