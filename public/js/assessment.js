/* PHQ-9 screener. Everything runs in the browser; nothing is sent to the server.
   Progress is kept in sessionStorage only so "Save & View Summary Later" works
   within the same browser tab session. */
(function () {
  'use strict';

  const QUESTIONS = [
    { domain: 'Domain: Anhedonia & Interest', text: 'Over the last two weeks, how often have you had little interest or pleasure in doing things?' },
    { domain: 'Domain: Mood Dysphoria', text: 'Over the last two weeks, how often have you been bothered by feeling down, depressed, or hopeless?' },
    { domain: 'Domain: Sleep Regulation', text: 'Over the last two weeks, how often have you had trouble falling or staying asleep, or sleeping too much?' },
    { domain: 'Domain: Energy & Fatigue', text: 'Over the last two weeks, how often have you been bothered by feeling tired or having little energy?' },
    { domain: 'Domain: Appetite', text: 'Over the last two weeks, how often have you had a poor appetite or been overeating?' },
    { domain: 'Domain: Self-Worth', text: 'Over the last two weeks, how often have you felt bad about yourself, or that you are a failure or have let yourself or your family down?' },
    { domain: 'Domain: Concentration', text: 'Over the last two weeks, how often have you had trouble concentrating on things, such as reading or watching television?' },
    { domain: 'Domain: Psychomotor Change', text: 'Over the last two weeks, how often have you moved or spoken so slowly that others noticed, or been so fidgety or restless that you were moving around more than usual?' },
    { domain: 'Domain: Safety', text: 'Over the last two weeks, how often have you had thoughts that you would be better off dead, or of hurting yourself in some way?' },
  ];

  const OPTIONS = [
    { label: 'Not at all', hint: 'Absent or zero days during this observation window', points: 0 },
    { label: 'Several days', hint: 'Intermittent episodes across 2\u20136 separate days', points: 1 },
    { label: 'More than half the days', hint: 'Persistent symptoms present across 7\u201311 days', points: 2 },
    { label: 'Nearly every day', hint: 'Chronic or daily presence throughout the last 14 days', points: 3 },
  ];

  // Kroenke, Spitzer & Williams (2001) severity bands
  const BANDS = [
    { max: 4, name: 'Minimal symptoms', text: 'Your responses suggest few or no depressive symptoms over the last two weeks. Keep up the routines that support you, and revisit this screener if things change.' },
    { max: 9, name: 'Mild symptoms', text: 'Your responses suggest mild symptoms. Self-care, sleep, movement, and talking with someone you trust can help. Consider checking in again in a couple of weeks.' },
    { max: 14, name: 'Moderate symptoms', text: 'Your responses suggest moderate symptoms. It is worth speaking with a clinician or counselor about how you have been feeling.' },
    { max: 19, name: 'Moderately severe symptoms', text: 'Your responses suggest moderately severe symptoms. We encourage you to contact a licensed professional soon to discuss support options.' },
    { max: 27, name: 'Severe symptoms', text: 'Your responses suggest severe symptoms. Please reach out to a licensed professional promptly. You do not have to manage this alone.' },
  ];

  const STORE_KEY = 'unburden.phq9';

  const $ = (id) => document.getElementById(id);
  const el = {
    counter: $('q-counter'), percent: $('q-percent'),
    fill: $('progress-fill'), track: $('progress-track'),
    domain: $('q-domain'), text: $('q-text'), options: $('options'),
    prev: $('btn-prev'), next: $('btn-next'), save: $('btn-save'), saveNote: $('save-note'),
    qView: $('question-view'), rView: $('result-view'),
    total: $('score-total'), band: $('score-band'), scoreText: $('score-text'),
    safety: $('safety-flag'), restart: $('btn-restart'),
  };

  // answers[i] is a points value (0-3) or null
  let answers = new Array(QUESTIONS.length).fill(null);
  let index = 0;

  function load() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.answers) && saved.answers.length === QUESTIONS.length) {
        answers = saved.answers;
        index = Math.min(Math.max(saved.index | 0, 0), QUESTIONS.length - 1);
      }
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
  }

  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ answers, index })); } catch (_) {}
  }

  function clearStore() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (_) {}
  }

  function renderProgress() {
    // Progress reflects questions completed before the current one, matching "Question 3 of 9 (33% Complete)"
    const pct = Math.round((index / QUESTIONS.length) * 100);
    el.counter.textContent = `Question ${index + 1} of ${QUESTIONS.length}`;
    el.percent.textContent = `(${pct}% Complete)`;
    el.fill.style.width = `${pct}%`;
    el.track.setAttribute('aria-valuenow', String(pct));
  }

  function renderQuestion() {
    const q = QUESTIONS[index];
    el.domain.textContent = q.domain;
    el.text.textContent = q.text;
    el.options.innerHTML = '';

    OPTIONS.forEach((opt, i) => {
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
      el.options.appendChild(row);
    });

    el.prev.disabled = index === 0;
    el.next.disabled = answers[index] === null;
    el.next.innerHTML = index === QUESTIONS.length - 1 ? 'See Summary &rarr;' : 'Next Question &rarr;';
    renderProgress();
  }

  function select(points) {
    answers[index] = points;
    persist();
    renderQuestion();
    // Keep focus on the chosen option so keyboard users do not lose their place
    const chosen = el.options.querySelector('[data-selected="true"]');
    if (chosen) chosen.focus();
  }

  function next() {
    if (answers[index] === null) return;
    if (index < QUESTIONS.length - 1) {
      index += 1;
      persist();
      renderQuestion();
      el.text.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  function showResult() {
    const total = answers.reduce((sum, v) => sum + (v || 0), 0);
    const band = BANDS.find((b) => total <= b.max) || BANDS[BANDS.length - 1];

    el.total.textContent = String(total);
    el.band.textContent = band.name;
    el.scoreText.textContent = band.text;

    // Item 9 (safety) triggers a support notice regardless of total score
    el.safety.classList.toggle('hidden', !(answers[8] > 0));

    el.fill.style.width = '100%';
    el.percent.textContent = '(100% Complete)';
    el.counter.textContent = 'Complete';
    el.track.setAttribute('aria-valuenow', '100');
    el.qView.classList.add('hidden');
    el.rView.classList.remove('hidden');
    clearStore();
    el.rView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function restart() {
    answers = new Array(QUESTIONS.length).fill(null);
    index = 0;
    clearStore();
    el.rView.classList.add('hidden');
    el.qView.classList.remove('hidden');
    el.safety.classList.add('hidden');
    renderQuestion();
  }

  function saveForLater() {
    persist();
    el.saveNote.textContent = 'Progress saved in this browser tab only. Closing the tab will clear it.';
    el.saveNote.classList.remove('hidden');
  }

  // Arrow-key navigation within the radio group
  el.options.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const current = answers[index] === null ? (dir === 1 ? -1 : OPTIONS.length) : answers[index];
    const nextPoints = Math.min(Math.max(current + dir, 0), OPTIONS.length - 1);
    select(nextPoints);
  });

  el.next.addEventListener('click', next);
  el.prev.addEventListener('click', prev);
  el.save.addEventListener('click', saveForLater);
  el.restart.addEventListener('click', restart);

  load();
  renderQuestion();
})();
