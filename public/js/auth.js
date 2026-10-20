/* Login + Register behaviour. Shared file: each function only activates if
   the relevant form exists on the page. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^\+[0-9]{8,15}$/;

  // ---------- Auth mode state for Login Page only ----------
  let authMode = 'user'; // 'user' or 'admin'
  const isLoginPage = !!$('login-form');

  if (isLoginPage) {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        authMode = btn.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        onLoginModeChange();
      });
    });
  }

  function onLoginModeChange() {
    const title = document.querySelector('[data-auth-title]');
    const sub = document.querySelector('[data-auth-sub]');

    if (authMode === 'admin') {
      if (title) title.textContent = 'Admin Sign In';
      if (sub) sub.textContent = 'Sign in with administrator credentials to access the dashboard.';
    } else {
      if (title && title.dataset.default) title.textContent = title.dataset.default;
      if (sub && sub.dataset.default) sub.textContent = sub.dataset.default;
    }

    const adminHelp = $('admin-login-help');
    if (adminHelp) adminHelp.classList.toggle('hidden', authMode !== 'admin');
  }

  // ---------- Error and Status Helpers ----------
  function setError(form, field, message) {
    const slot = form.querySelector(`.field-error[data-for="${field}"]`);
    const input = form.querySelector(`[name="${field}"]`);
    if (!slot) return;
    slot.textContent = message || '';
    slot.classList.toggle('hidden', !message);
    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message) input.setAttribute('aria-describedby', `err-${field}`);
    }
    slot.id = `err-${field}`;
  }

  function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((s) => { s.textContent = ''; s.classList.add('hidden'); });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.setAttribute('aria-invalid', 'false'));
  }

  function showStatus(kind, message) {
    const box = $('form-status');
    if (!box) return;
    box.textContent = message;
    box.classList.remove('hidden', 'bg-crisis-bg', 'text-crisis-ink', 'bg-primary-tint', 'text-primary');
    if (kind === 'error') box.classList.add('bg-crisis-bg', 'text-crisis-ink');
    else box.classList.add('bg-primary-tint', 'text-primary');
  }

  function setBusy(busy, idleHtml) {
    const btn = $('submit-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('opacity-70', busy);
    btn.innerHTML = busy ? 'Please wait&hellip;' : idleHtml;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- Show/hide Password ----------
  const toggle = $('toggle-pw');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const pw = $('password');
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  // ---------- Password Strength Meter ----------
  function strengthOf(pw) {
    if (!pw) return { score: 0, label: 'Enter a password' };
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
    score = Math.min(score, 4);
    const label = ['Too short', 'Weak password', 'Fair password', 'Good password', 'Strong password'][score];
    return { score, label: pw.length < 8 ? 'Too short' : label };
  }

  // ---------- Registration Form ----------
  const regForm = $('register-form');
  if (regForm) {
    const pw = $('password');
    const confirm = $('confirm');
    const countrySelect = $('country');
    const bars = document.querySelectorAll('#strength-bars .strength-bar');
    const sText = $('strength-text');
    const matchIcon = $('match-icon');

    // Populate country dropdown from /api/countries
    fetch('/api/countries')
      .then((res) => res.json())
      .then((countries) => {
        if (!Array.isArray(countries) || !countrySelect) return;
        countries.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.code;
          opt.textContent = `${c.name} (${c.code})`;
          countrySelect.appendChild(opt);
        });
      })
      .catch((err) => {
        console.error('Failed to load countries:', err);
      });

    if (pw && bars.length) {
      pw.addEventListener('input', () => {
        const { score, label } = strengthOf(pw.value);
        bars.forEach((b, i) => b.classList.toggle('on', i < score));
        sText.textContent = label;
        sText.className = score >= 3 ? 'text-primary flex items-center gap-1' : 'text-ink-mute';
        checkMatch();
      });
    }

    function checkMatch() {
      if (!confirm || !matchIcon) return;
      const ok = confirm.value.length > 0 && confirm.value === pw.value;
      matchIcon.classList.toggle('hidden', !ok);
    }
    if (confirm) confirm.addEventListener('input', checkMatch);

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(regForm);
      $('form-status').classList.add('hidden');

      const name = $('fullname').value.trim();
      const email = $('email').value.trim();
      const password = pw.value;
      const phone = $('phone').value.trim();
      const ageRaw = $('age').value.trim();
      const ageNum = parseInt(ageRaw, 10);
      const country = $('country').value.trim();
      const consentChecked = $('consent').checked;
      let valid = true;

      if (name.length < 2 || name.length > 100) {
        setError(regForm, 'fullname', 'Enter your full name (2 to 100 characters).');
        valid = false;
      }
      if (!EMAIL_RE.test(email)) {
        setError(regForm, 'email', 'Enter a valid email address.');
        valid = false;
      }
      if (!PHONE_RE.test(phone)) {
        setError(regForm, 'phone', 'Enter international phone starting with "+" and 8-15 digits (e.g. +14155552671).');
        valid = false;
      }
      if (isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
        setError(regForm, 'age', 'Enter a valid age between 13 and 120.');
        valid = false;
      }
      if (!country) {
        setError(regForm, 'country', 'Select your country from the list.');
        valid = false;
      }
      if (password.length < 8) {
        setError(regForm, 'password', 'Use at least 8 characters.');
        valid = false;
      }
      if (confirm.value !== password) {
        setError(regForm, 'confirm', 'Passwords do not match.');
        valid = false;
      }
      if (!consentChecked) {
        setError(regForm, 'consent', 'You must provide consent to store your registration details.');
        valid = false;
      }

      if (!valid) {
        const firstBad = regForm.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      const idle = 'Create Account <span aria-hidden="true">&rarr;</span>';
      setBusy(true, idle);
      try {
        // Public registration NEVER sends or trusts role
        const { ok, status, data } = await postJSON('/api/register', {
          name,
          email,
          password,
          phone,
          age: ageNum,
          country,
          consent: consentChecked,
        });

        if (ok) {
          if (data.token) {
            localStorage.setItem('unburden_token', data.token);
            showStatus('info', `Welcome${data.name ? ', ' + data.name.split(' ')[0] : ''}! Your account is ready. Redirecting…`);
            setTimeout(() => { window.location.href = '/assessment'; }, 700);
          } else {
            showStatus('info', 'Account created successfully. Redirecting you to log in…');
            setTimeout(() => { window.location.href = '/login'; }, 900);
          }
          return;
        }

        if (data.field) {
          setError(regForm, data.field, data.error);
        } else {
          showStatus('error', data.error || `Registration failed (error ${status}). Please check your entries.`);
        }
      } catch (_) {
        showStatus('error', 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false, idle);
    });
  }

  // ---------- Login Form ----------
  const logForm = $('login-form');
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(logForm);
      $('form-status').classList.add('hidden');

      const email = $('email').value.trim();
      const password = $('password').value;
      let valid = true;

      if (!EMAIL_RE.test(email)) {
        setError(logForm, 'email', 'Enter a valid email address.');
        valid = false;
      }
      if (!password) {
        setError(logForm, 'password', 'Enter your password.');
        valid = false;
      }
      if (!valid) {
        const firstBad = logForm.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      const idle = 'Log In <span aria-hidden="true">&rarr;</span>';
      setBusy(true, idle);
      try {
        const { ok, status, data } = await postJSON('/api/login', {
          email,
          password,
          role: authMode,
        });

        if (ok) {
          localStorage.setItem('unburden_token', data.token);

          if (data.role === 'admin') {
            showStatus('info', `Welcome, admin ${data.name ? data.name.split(' ')[0] : ''}. Redirecting to dashboard…`);
            setTimeout(() => { window.location.href = '/admin'; }, 700);
            return;
          }
          showStatus('info', `Welcome back${data.name ? ', ' + data.name.split(' ')[0] : ''}. Redirecting…`);
          setTimeout(() => { window.location.href = '/assessment'; }, 700);
          return;
        }
        showStatus('error', data.error || `Login failed (error ${status}). Check your credentials.`);
      } catch (_) {
        showStatus('error', 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false, idle);
    });
  }
})();