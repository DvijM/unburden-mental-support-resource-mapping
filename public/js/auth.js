/* Login, Registration, and Password Reset behaviour.
   Uses secure HTTP-only cookies and server-side RBAC. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^\+[0-9]{8,15}$/;

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
    form.querySelectorAll('.field-error').forEach((s) => {
      s.textContent = '';
      s.classList.add('hidden');
    });
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
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  }

  // Show/hide password toggle
  const toggle = $('toggle-pw');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const pw = $('password');
      if (!pw) return;
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  // Password strength meter
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

  // ---------- Registration Form (Public: always creates ordinary user account) ----------
  const regForm = $('register-form');
  if (regForm) {
    const pw = $('password');
    const confirm = $('confirm');
    const countrySelect = $('country');
    const bars = document.querySelectorAll('#strength-bars .strength-bar');
    const sText = $('strength-text');
    const matchIcon = $('match-icon');

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
      .catch(() => {});

    if (pw && bars.length) {
      pw.addEventListener('input', () => {
        const { score, label } = strengthOf(pw.value);
        bars.forEach((b, i) => b.classList.toggle('on', i < score));
        if (sText) {
          sText.textContent = label;
          sText.className = score >= 3 ? 'text-primary flex items-center gap-1' : 'text-ink-mute';
        }
        checkMatch();
      });
    }

    function checkMatch() {
      if (!confirm || !matchIcon || !pw) return;
      const ok = confirm.value.length > 0 && confirm.value === pw.value;
      matchIcon.classList.toggle('hidden', !ok);
    }
    if (confirm) confirm.addEventListener('input', checkMatch);

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(regForm);
      if ($('form-status')) $('form-status').classList.add('hidden');

      const name = $('fullname') ? $('fullname').value.trim() : '';
      const email = $('email') ? $('email').value.trim() : '';
      const password = pw ? pw.value : '';
      const phone = $('phone') ? $('phone').value.trim() : '';
      const ageRaw = $('age') ? $('age').value.trim() : '';
      const country = $('country') ? $('country').value.trim() : '';
      const consentChecked = $('consent') ? $('consent').checked : false;

      const optionalConsents = {
        assessment_storage: Boolean($('consent-assessments') && $('consent-assessments').checked),
        mood_tracking: Boolean($('consent-mood') && $('consent-mood').checked),
        activity_history: Boolean($('consent-activity') && $('consent-activity').checked),
        responder_sharing: Boolean($('consent-responder') && $('consent-responder').checked),
        research_analytics: Boolean($('consent-research') && $('consent-research').checked),
      };

      let valid = true;

      if (name.length < 2 || name.length > 100) {
        setError(regForm, 'fullname', 'Enter your full name (2 to 100 characters).');
        valid = false;
      }
      if (!EMAIL_RE.test(email)) {
        setError(regForm, 'email', 'Enter a valid email address.');
        valid = false;
      }
      if (phone && !PHONE_RE.test(phone)) {
        setError(regForm, 'phone', 'Enter international phone starting with "+" and 8–15 digits (e.g. +14155552671), or leave blank.');
        valid = false;
      }
      let ageNum = null;
      if (ageRaw !== '') {
        ageNum = parseInt(ageRaw, 10);
        if (isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
          setError(regForm, 'age', 'Enter a valid age between 13 and 120.');
          valid = false;
        }
      }
      if (password.length < 8) {
        setError(regForm, 'password', 'Use at least 8 characters.');
        valid = false;
      }
      if (confirm && confirm.value !== password) {
        setError(regForm, 'confirm', 'Passwords do not match.');
        valid = false;
      }
      if (!consentChecked) {
        setError(regForm, 'consent', 'You must agree to the essential account storage consent to create an account.');
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
        const { ok, status, data } = await postJSON('/api/register', {
          name,
          email,
          password,
          phone: phone || null,
          age: ageNum,
          country: country || null,
          consent: consentChecked,
          optionalConsents,
        });

        if (ok) {
          showStatus(
            'info',
            `Welcome${data.name ? ', ' + data.name.split(' ')[0] : ''}! Your user account is ready. Redirecting to your dashboard…`
          );
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 700);
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
      if ($('form-status')) $('form-status').classList.add('hidden');

      const email = $('email').value.trim();
      const password = $('password').value;
      const remember = Boolean($('remember') && $('remember').checked);
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
          remember,
        });

        if (ok) {
          const firstName = data.name ? data.name.split(' ')[0] : '';
          if (['super_admin', 'admin', 'analyst', 'content_editor'].includes(data.role)) {
            showStatus('info', `Signed in as ${data.role.replace('_', ' ')}${firstName ? ' (' + firstName + ')' : ''}. Redirecting to Admin Dashboard…`);
            setTimeout(() => {
              window.location.href = '/admin';
            }, 600);
            return;
          }
          if (data.role === 'responder') {
            showStatus('info', `Signed in as Responder${firstName ? ' (' + firstName + ')' : ''}. Redirecting to Responder Portal…`);
            setTimeout(() => {
              window.location.href = '/responder';
            }, 600);
            return;
          }
          showStatus('info', `Welcome back${firstName ? ', ' + firstName : ''}. Redirecting to your dashboard…`);
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 600);
          return;
        }
        showStatus('error', data.error || `Login failed (error ${status}). Check your credentials.`);
      } catch (_) {
        showStatus('error', 'Could not reach the server. Check your connection and try again.');
      }
      setBusy(false, idle);
    });
  }

  // ---------- Password Reset Modal / Section on Login Page ----------
  const forgotToggleBtn = $('forgot-pw-toggle');
  const resetPanel = $('reset-pw-panel');
  const requestResetForm = $('request-reset-form');
  const completeResetForm = $('complete-reset-form');

  if (forgotToggleBtn && resetPanel) {
    forgotToggleBtn.addEventListener('click', () => {
      const hidden = resetPanel.classList.toggle('hidden');
      forgotToggleBtn.setAttribute('aria-expanded', String(!hidden));
    });
  }

  if (requestResetForm) {
    requestResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = $('reset-email');
      const statusBox = $('reset-status');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!EMAIL_RE.test(email)) {
        if (statusBox) {
          statusBox.textContent = 'Please enter a valid email address.';
          statusBox.className = 'mt-2 text-[12px] text-crisis';
        }
        return;
      }
      const { ok, data } = await postJSON('/api/password/request-reset', { email });
      if (statusBox) {
        statusBox.className = 'mt-2 text-[12px] ' + (ok ? 'text-primary' : 'text-crisis');
        statusBox.textContent = data.message || (ok ? 'Reset token generated.' : data.error || 'Error requesting reset.');
        if (data.resetToken && $('reset-token-input')) {
          $('reset-token-input').value = data.resetToken;
          if ($('complete-reset-form')) $('complete-reset-form').classList.remove('hidden');
        }
      }
    });
  }

  if (completeResetForm) {
    completeResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = $('reset-token-input') ? $('reset-token-input').value.trim() : '';
      const newPassword = $('reset-new-password') ? $('reset-new-password').value : '';
      const statusBox = $('reset-status');
      const { ok, data } = await postJSON('/api/password/reset', { token, newPassword });
      if (statusBox) {
        statusBox.className = 'mt-2 text-[12px] ' + (ok ? 'text-ok font-medium' : 'text-crisis');
        statusBox.textContent = data.message || data.error || 'Password reset attempt completed.';
      }
      if (ok) {
        completeResetForm.reset();
      }
    });
  }
})();
