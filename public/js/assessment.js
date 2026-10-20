/* Clinical Self-Assessment: Standardized Multi-Inventory Screener
   Supports PHQ-9 (Depression), GAD-7 (Anxiety), and WHO-5 (Well-Being Index).
   Everything runs locally in the browser; only the total score of the active screener
   is submitted if the user is authenticated. */
(function () {
  'use strict';

  const INVENTORIES = {
    phq9: {
      name: 'General Well-Being & Mood Assessment (PHQ-9)',
      badge: 'Standardized Depression Screener',
      scaleMax: 27,
      questions: [
        { domain: 'Domain: Anhedonia & Interest', text: 'Over the last two weeks, how often have you had little interest or pleasure in doing things?' },
        { domain: 'Domain: Mood Dysphoria', text: 'Over the last two weeks, how often have you been bothered by feeling down, depressed, or hopeless?' },
        { domain: 'Domain: Sleep Regulation', text: 'Over the last two weeks, how often have you had trouble falling or staying asleep, or sleeping too much?' },
        { domain: 'Domain: Energy & Fatigue', text: 'Over the last two weeks, how often have you been bothered by feeling tired or having little energy?' },
        { domain: 'Domain: Appetite', text: 'Over the last two weeks, how often have you had a poor appetite or been overeating?' },
        { domain: 'Domain: Self-Worth', text: 'Over the last two weeks, how often have you felt bad about yourself, or that you are a failure or have let yourself or your family down?' },
        { domain: 'Domain: Concentration', text: 'Over the last two weeks, how often have you had trouble concentrating on things, such as reading or watching television?' },
        { domain: 'Domain: Psychomotor Change', text: 'Over the last two weeks, how often have you moved or spoken so slowly that others noticed, or been so fidgety or restless that you were moving around more than usual?' },
        { domain: 'Domain: Safety', text: 'Over the last two weeks, how often have you had thoughts that you would be better off dead, or of hurting yourself in some way?' },
      ],
      options: [
        { label: 'Not at all', hint: 'Absent or zero days during this observation window', points: 0 },
        { label: 'Several days', hint: 'Intermittent episodes across 2–6 separate days', points: 1 },
        { label: 'More than half the days', hint: 'Persistent symptoms present across 7–11 days', points: 2 },
        { label: 'Nearly every day', hint: 'Chronic or daily presence throughout the last 14 days', points: 3 },
      ],
      bands: [
        { max: 4, name: 'Minimal symptoms', text: 'Your responses suggest few or no depressive symptoms over the last two weeks. Keep up the routines that support you, and revisit this screener if things change.' },
        { max: 9, name: 'Mild symptoms', text: 'Your responses suggest mild symptoms. Self-care, sleep, movement, and talking with someone you trust can help. Consider checking in again in a couple of weeks.' },
        { max: 14, name: 'Moderate symptoms', text: 'Your responses suggest moderate symptoms. It is worth speaking with a clinician or counselor about how you have been feeling.' },
        { max: 19, name: 'Moderately severe symptoms', text: 'Your responses suggest moderately severe symptoms. We encourage you to contact a licensed professional soon to discuss support options.' },
        { max: 27, name: 'Severe symptoms', text: 'Your responses suggest severe symptoms. Please reach out to a licensed professional promptly. You do not have to manage this alone.' },
      ],
      hasSafetyItem: true,
      safetyIndex: 8,
    },

    gad7: {
      name: 'Generalized Anxiety Screener (GAD-7)',
      badge: 'Clinical Anxiety Inventory',
      scaleMax: 21,
      questions: [
        { domain: 'Domain: Tension & Hyperarousal', text: 'Over the last two weeks, how often have you been bothered by feeling nervous, anxious, or on edge?' },
        { domain: 'Domain: Uncontrolled Worry', text: 'Over the last two weeks, how often have you been bothered by not being able to stop or control worrying?' },
        { domain: 'Domain: Generalized Worry', text: 'Over the last two weeks, how often have you been bothered by worrying too much about different things?' },
        { domain: 'Domain: Somatic Tension', text: 'Over the last two weeks, how often have you had trouble relaxing?' },
        { domain: 'Domain: Psychomotor Agitation', text: 'Over the last two weeks, how often have you been so restless that it is hard to sit still?' },
        { domain: 'Domain: Irritability', text: 'Over the last two weeks, how often have you become easily annoyed or irritable?' },
        { domain: 'Domain: Anticipatory Dread', text: 'Over the last two weeks, how often have you felt afraid, as if something awful might happen?' },
      ],
      options: [
        { label: 'Not at all', hint: 'Absent across the last 14 days', points: 0 },
        { label: 'Several days', hint: 'Present on 2–6 separate days', points: 1 },
        { label: 'More than half the days', hint: 'Persistent across 7–11 days', points: 2 },
        { label: 'Nearly every day', hint: 'Daily or near-daily presence', points: 3 },
      ],
      bands: [
        { max: 4, name: 'Minimal anxiety', text: 'Your responses reflect minimal or no anxiety symptoms over the past two weeks. Continue regular stress management and restorative routines.' },
        { max: 9, name: 'Mild anxiety', text: 'Your responses reflect mild anxiety symptoms. Mindful breathing, physical activity, and sleep hygiene can help ground your nervous system.' },
        { max: 14, name: 'Moderate anxiety', text: 'Your responses reflect moderate anxiety. Consider consulting a therapist or licensed counselor for coping strategies and support.' },
        { max: 21, name: 'Severe anxiety', text: 'Your responses reflect severe anxiety. We encourage you to seek evaluation from a licensed psychologist or healthcare provider.' },
      ],
      hasSafetyItem: false,
    },

    who5: {
      name: 'WHO-5 Well-Being Index',
      badge: 'Psychological Vitality Screener',
      scaleMax: 25,
      questions: [
        { domain: 'Domain: Positive Mood', text: 'Over the last two weeks, I have felt cheerful and in good spirits.' },
        { domain: 'Domain: Emotional Serenity', text: 'Over the last two weeks, I have felt calm and relaxed.' },
        { domain: 'Domain: Physical Vitality', text: 'Over the last two weeks, I have felt active and vigorous.' },
        { domain: 'Domain: Restorative Sleep', text: 'Over the last two weeks, I woke up feeling fresh and rested.' },
        { domain: 'Domain: Daily Meaning & Interest', text: 'Over the last two weeks, my daily life has been filled with things that interest me.' },
      ],
      options: [
        { label: 'All of the time', hint: 'Continuous presence throughout observation period', points: 5 },
        { label: 'Most of the time', hint: 'Present more often than not', points: 4 },
        { label: 'More than half the time', hint: 'Moderate regularity', points: 3 },
        { label: 'Less than half the time', hint: 'Infrequent presence', points: 2 },
        { label: 'Some of the time', hint: 'Rare or brief moments', points: 1 },
        { label: 'At no time', hint: 'Completely absent over the last 14 days', points: 0 },
      ],
      bands: [
        { max: 13, name: 'Reduced well-being (Clinical threshold)', text: 'A raw score of 13 or lower (<=50%) indicates reduced psychological well-being. In clinical practice, this is the recognized screening threshold warranting further evaluation for mood or depressive symptoms.' },
        { max: 19, name: 'Moderate well-being', text: 'Your responses indicate moderate psychological well-being. Focusing on supportive social connections, hobbies, and balanced rest can help maintain your vitality.' },
        { max: 25, name: 'High well-being', text: 'Your responses reflect high psychological well-being and positive emotional vitality. Keep practicing the healthy habits that nurture your mind.' },
      ],
      hasSafetyItem: false,
    },
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    typeSelect: $('screener-type'),
    quizTitle: $('quiz-title'), quizBadge: $('quiz-badge'),
    counter: $('q-counter'), percent: $('q-percent'),
    fill: $('progress-fill'), track: $('progress-track'),
    domain: $('q-domain'), text: $('q-text'), options: $('options'),
    prev: $('btn-prev'), next: $('btn-next'), save: $('btn-save'), saveNote: $('save-note'),
    qView: $('question-view'), rView: $('result-view'),
    total: $('score-total'), max: $('score-max'), band: $('score-band'), scoreText: $('score-text'),
    safety: $('safety-flag'), restart: $('btn-restart'),
  };

  let activeType = 'phq9';
  let activeInv = INVENTORIES.phq9;
  let answers = [];
  let index = 0;

  function initInventory(type) {
    activeType = type;
    activeInv = INVENTORIES[type] || INVENTORIES.phq9;
    answers = new Array(activeInv.questions.length).fill(null);
    index = 0;

    if (el.quizTitle) el.quizTitle.textContent = activeInv.name;
    if (el.quizBadge) el.quizBadge.textContent = activeInv.badge;
    if (el.max) el.max.textContent = ` / ${activeInv.scaleMax}`;

    loadFromStorage();
    renderQuestion();
  }

  function storageKey() {
    return `unburden.assessment.${activeType}`;
  }

  function loadFromStorage() {
    try {
      const raw = sessionStorage.getItem(storageKey());
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.answers) && saved.answers.length === activeInv.questions.length) {
        answers = saved.answers;
        index = Math.min(Math.max(saved.index | 0, 0), activeInv.questions.length - 1);
      }
    } catch (_) {}
  }

  function persist() {
    try { sessionStorage.setItem(storageKey(), JSON.stringify({ answers, index })); } catch (_) {}
  }

  function clearStore() {
    try { sessionStorage.removeItem(storageKey()); } catch (_) {}
  }

  function renderProgress() {
    const totalQ = activeInv.questions.length;
    const pct = Math.round((index / totalQ) * 100);
    if (el.counter) el.counter.textContent = `Question ${index + 1} of ${totalQ}`;
    if (el.percent) el.percent.textContent = `(${pct}% Complete)`;
    if (el.fill) el.fill.style.width = `${pct}%`;
    if (el.track) el.track.setAttribute('aria-valuenow', String(pct));
  }

  function renderQuestion() {
    const q = activeInv.questions[index];
    if (!q) return;

    if (el.domain) el.domain.textContent = q.domain;
    if (el.text) el.text.textContent = q.text;
    if (el.options) el.options.innerHTML = '';

    activeInv.options.forEach((opt, i) => {
      const selected = answers[index] === opt.points;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'option-row w-full text-left rounded-editorial bg-surface-low px-4 py-3 flex items-center gap-3';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(selected));
      row.dataset.selected = String(selected);
      row.dataset.points = String(opt.points);
      row.tabIndex = selected || (answers[index] === null && i === 0) ? 0 : -1;
      row.innerHTML = `
        <span class="radio-dot" aria-hidden="true"></span>
        <span class="flex-1 min-w-0">
          <span class="option-title block text-[13.5px] text-ink">${opt.label}</span>
          <span class="block text-[10.5px] text-ink-mute mt-0.5">${opt.hint}</span>
        </span>
        <span class="option-points flex-none text-[10px] bg-surface-high text-ink-soft rounded px-2 py-0.5">${opt.points} ${opt.points === 1 ? 'point' : 'points'}</span>`;
      row.addEventListener('click', () => select(opt.points));
      if (el.options) el.options.appendChild(row);
    });

    if (el.prev) el.prev.disabled = index === 0;
    if (el.next) {
      el.next.disabled = answers[index] === null;
      el.next.innerHTML = index === activeInv.questions.length - 1 ? 'See Summary &rarr;' : 'Next Question &rarr;';
    }
    renderProgress();
  }

  function select(points) {
    answers[index] = points;
    persist();
    renderQuestion();
    const chosen = el.options.querySelector('[data-selected="true"]');
    if (chosen) chosen.focus();
  }

  function next() {
    if (answers[index] === null) return;
    if (index < activeInv.questions.length - 1) {
      const quizCard = document.getElementById('quiz');
      const cardTop = quizCard ? quizCard.getBoundingClientRect().top + window.scrollY : 0;

      index += 1;
      persist();
      renderQuestion();

      if (cardTop > 0) {
        const html = document.documentElement;
        const prevBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, cardTop - 80);
        html.style.scrollBehavior = prevBehavior;
      }
    } else {
      showResult();
    }
  }

  function prev() {
    if (index === 0) return;
    index -= 1;
    persist();
    renderQuestion();
  }

  async function submitScore(total) {
    const token = localStorage.getItem('unburden_token');
    if (!token) return;

    try {
      await fetch('/api/assessment/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ score: total, type: activeType }),
      });
    } catch (_) {}
  }

  function showResult() {
    const total = answers.reduce((sum, v) => sum + (v || 0), 0);
    const band = activeInv.bands.find((b) => total <= b.max) || activeInv.bands[activeInv.bands.length - 1];

    if (el.total) el.total.textContent = String(total);
    if (el.max) el.max.textContent = ` / ${activeInv.scaleMax}`;
    if (el.band) el.band.textContent = band.name;
    if (el.scoreText) el.scoreText.textContent = band.text;

    // Safety notice only on PHQ-9 item 9
    if (el.safety) {
      const showSafety = activeInv.hasSafetyItem && answers[activeInv.safetyIndex] > 0;
      el.safety.classList.toggle('hidden', !showSafety);
    }

    if (el.fill) el.fill.style.width = '100%';
    if (el.percent) el.percent.textContent = '(100% Complete)';
    if (el.counter) el.counter.textContent = 'Complete';
    if (el.track) el.track.setAttribute('aria-valuenow', '100');
    if (el.qView) el.qView.classList.add('hidden');
    if (el.rView) {
      el.rView.classList.remove('hidden');
      el.rView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    clearStore();
    submitScore(total);
  }

  function restart() {
    answers = new Array(activeInv.questions.length).fill(null);
    index = 0;
    clearStore();
    if (el.rView) el.rView.classList.add('hidden');
    if (el.qView) el.qView.classList.remove('hidden');
    if (el.safety) el.safety.classList.add('hidden');
    renderQuestion();
  }

  function saveForLater() {
    persist();
    if (el.saveNote) {
      el.saveNote.textContent = 'Progress saved in this browser tab only. Closing the tab will clear it.';
      el.saveNote.classList.remove('hidden');
    }
  }

  // Keyboard navigation
  if (el.options) {
    el.options.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const opts = activeInv.options;
      const current = answers[index] === null ? (dir === 1 ? -1 : opts.length) : answers[index];
      const nextPoints = Math.min(Math.max(current + dir, 0), opts.length - 1);
      select(nextPoints);
    });
  }

  if (el.typeSelect) {
    el.typeSelect.addEventListener('change', (e) => {
      const newType = e.target.value;
      if (newType !== activeType) {
        if (el.rView) el.rView.classList.add('hidden');
        if (el.qView) el.qView.classList.remove('hidden');
        if (el.saveNote) el.saveNote.classList.add('hidden');
        initInventory(newType);
      }
    });
  }

  if (el.next) el.next.addEventListener('click', next);
  if (el.prev) el.prev.addEventListener('click', prev);
  if (el.save) el.save.addEventListener('click', saveForLater);
  if (el.restart) el.restart.addEventListener('click', restart);

  // Account management
  async function initAccount() {
    const token = localStorage.getItem('unburden_token');
    if (!token) return;

    try {
      const res = await fetch('/api/session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const session = await res.json();
      const accountCard = $('account-card');
      const accountEmail = $('account-email');
      const deleteBtn = $('btn-delete-account');

      if (accountCard && accountEmail) {
        accountEmail.textContent = session.email;
        accountCard.classList.remove('hidden');
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          const confirmed = window.confirm(
            'Are you sure you want to permanently delete your account and all associated data? This action cannot be undone.'
          );
          if (!confirmed) return;

          try {
            const delRes = await fetch('/api/account', {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (delRes.ok) {
              localStorage.removeItem('unburden_token');
              alert('Your account has been deleted.');
              window.location.href = '/';
            } else {
              alert('Failed to delete account. Please try again.');
            }
          } catch (_) {
            alert('Could not reach the server. Please try again.');
          }
        });
      }
    } catch (_) {}
  }

  initInventory('phq9');
  initAccount();
})();
