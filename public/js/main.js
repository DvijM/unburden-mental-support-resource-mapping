/* Unburden — shared behaviour.
   Pages declare <div data-include="header|header-auth|footer"></div>
   and this script fetches the matching partial from /partials/, manages
   navigation state, mobile menu, and cookie-based session display. */
(async function () {
  'use strict';

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)unburden_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  window.unburdenApiFetch = async function (url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const csrf = getCsrfToken();
    const mergedHeaders = {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { 'X-CSRF-Token': csrf } : {}),
      ...(opts.headers || {}),
    };
    const fetchOpts = {
      ...opts,
      method,
      credentials: 'same-origin',
      headers: mergedHeaders,
    };
    const res = await fetch(url, fetchOpts);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  };

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
        if (name === 'header' || name === 'header-auth') {
          slot.innerHTML = `
            <div class="bg-crisis-bg text-crisis-ink px-4 py-2 text-[12px]">
              <strong>Crisis Support:</strong> <a href="/find-support" class="underline font-semibold">Global Helplines Directory</a> &middot; <a href="/" class="underline ml-2">Home</a>
            </div>`;
        }
      }
    })
  );

  // Ensure main element has #main-content for skip-to-content link
  const mainEl = document.querySelector('main');
  if (mainEl && !mainEl.id) {
    mainEl.id = 'main-content';
  }

  // Highlight the current page in the main nav
  const active = document.body.dataset.page;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === active) {
      a.classList.add('text-primary', 'font-semibold', 'border-b-2', 'border-primary');
      a.setAttribute('aria-current', 'page');
    }
  });

  // Auth header: swap the prompt depending on which auth page we are on
  const authLink = document.querySelector('[data-auth-link]');
  const authPrompt = document.querySelector('[data-auth-prompt]');
  if (authLink && active === 'login') {
    authLink.textContent = 'Register';
    authLink.setAttribute('href', '/register');
    if (authPrompt) authPrompt.textContent = 'New here?';
  }

  // Check server-side session via HTTP-only cookie
  try {
    const { ok, data: me } = await window.unburdenApiFetch('/api/session');
    if (ok && me && me.id) {
      window.unburdenSession = me;
      const first = String(me.name || 'Account').trim().split(/\s+/)[0];
      const targets = [
        ...document.querySelectorAll(
          'header a[href="/login"], header a[href="/register"], [data-auth-link], [data-auth-prompt]'
        ),
      ];
      if (targets.length) {
        const box = document.createElement('div');
        box.className = 'flex items-center gap-3';

        const avatar = document.createElement('span');
        avatar.className =
          'w-7 h-7 rounded-full bg-primary text-white grid place-items-center text-[12px] font-semibold flex-none';
        avatar.textContent = first.charAt(0).toUpperCase();
        avatar.setAttribute('aria-hidden', 'true');

        const dashLink = document.createElement('a');
        dashLink.className = 'text-[12.5px] font-medium text-ink hover:text-primary';
        if (['super_admin', 'admin', 'analyst', 'content_editor'].includes(me.role)) {
          dashLink.href = '/admin';
          dashLink.textContent = `Admin (${first})`;
        } else if (me.role === 'responder') {
          dashLink.href = '/responder';
          dashLink.textContent = `Responder (${first})`;
        } else {
          dashLink.href = '/dashboard';
          dashLink.textContent = `${first} · Dashboard`;
        }

        const out = document.createElement('button');
        out.type = 'button';
        out.className = 'text-[12px] text-primary font-medium hover:underline';
        out.textContent = 'Log out';
        out.addEventListener('click', async () => {
          try {
            await window.unburdenApiFetch('/api/logout', { method: 'POST' });
          } catch (_) {}
          window.location.href = '/';
        });

        box.append(avatar, dashLink, out);
        targets[0].before(box);
        targets.forEach((t) => t.remove());
      }
    }
  } catch (_) {}

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
