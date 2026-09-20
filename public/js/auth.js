/* Login + Register behaviour. Shared file: each function only activates if
   the relevant form exists on the page. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ---------- helpers ----------
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

  // ---------- show/hide password ----------
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

  // ---------- SSO placeholders ----------
  document.querySelectorAll('.sso-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showStatus('info', `${btn.dataset.provider} sign-in is not configured in this build. Please use email and password.`);
    });
  });

  // ---------- password strength ----------
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

  const regForm = $('register-form');
  if (regForm) {
    const pw = $('password');
    const confirm = $('confirm');
    const bars = document.querySelectorAll('#strength-bars .strength-bar');
    const sText = $('strength-text');
    const matchIcon = $('match-icon');

    pw.addEventListener('input', () => {
      const { score, label } = strengthOf(pw.value);
      bars.forEach((b, i) => b.classList.toggle('on', i < score));
      sText.textContent = label;
      sText.className = score >= 3 ? 'text-primary flex items-center gap-1' : 'text-ink-mute';
      checkMatch();
    });

    function checkMatch() {
      const ok = confirm.value.length > 0 && confirm.value === pw.value;
      matchIcon.classList.toggle('hidden', !ok);
    }
    confirm.addEventListener('input', checkMatch);

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(regForm);
      $('form-status').classList.add('hidden');

      const name = $('fullname').value.trim();
      const email = $('email').value.trim();
      const password = pw.value;
      let valid = true;

      if (name.length < 2) { setError(regForm, 'fullname', 'Enter your full name.'); valid = false; }
      if (!EMAIL_RE.test(email)) { setError(regForm, 'email', 'Enter a valid email address, like name@example.com.'); valid = false; }
      if (password.length < 8) { setError(regForm, 'password', 'Use at least 8 characters.'); valid = false; }
      if (confirm.value !== password) { setError(regForm, 'confirm', 'Passwords do not match.'); valid = false; }
      if (!$('terms').checked) { setError(regForm, 'terms', 'Accept the Terms of Service and Privacy Policy to continue.'); valid = false; }
      if (!valid) {
        const firstBad = regForm.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      const idle = 'Register Account <span aria-hidden="true">&rarr;</span>';
      setBusy(true, idle);
      try {
        const { ok, status, data } = await postJSON('/api/register', { name, email, password });
        if (ok) {
          showStatus('info', 'Account created. Redirecting you to log in\u2026');
          setTimeout(() => { window.location.href = '/login'; }, 900);
          return;
        }
        if (data.field) setError(regForm, data.field, data.error);
        else showStatus('error', data.error || `Something went wrong (error ${status}). Try again.`);
      } catch (_) {
        showStatus('error', 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false, idle);
    });
  }

  // ---------- login ----------
  const logForm = $('login-form');
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(logForm);
      $('form-status').classList.add('hidden');

      const email = $('email').value.trim();
      const password = $('password').value;
      let valid = true;

      if (!EMAIL_RE.test(email)) { setError(logForm, 'email', 'Enter a valid email address, like name@example.com.'); valid = false; }
      if (!password) { setError(logForm, 'password', 'Enter your password.'); valid = false; }
      if (!valid) {
        const firstBad = logForm.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      const idle = 'Log In <span aria-hidden="true">&rarr;</span>';
      setBusy(true, idle);
      try {
        const { ok, status, data } = await postJSON('/api/login', { email, password, remember: $('remember').checked });
        if (ok) {
          showStatus('info', `Welcome back${data.name ? ', ' + data.name.split(' ')[0] : ''}. Redirecting\u2026`);
          setTimeout(() => { window.location.href = '/assessment'; }, 700);
          return;
        }
        showStatus('error', data.error || `Something went wrong (error ${status}). Try again.`);
      } catch (_) {
        showStatus('error', 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false, idle);
    });
  }
})();
