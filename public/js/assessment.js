/* Self-Assessment Screening Tool (PHQ-9, GAD-7, WHO-5)
   - Plain language, no invented frequency hints, no visible point values beside options.
   - Immediate Item 9 support notice upon selection (> 0), before completing remaining questions.
   - Includes functional-impairment question for PHQ-9.
   - Server-side score calculation and explicit consent check before storage. */
(function () {
  'use strict';

  const INVENTORIES = {
    phq9: {
      name: 'Patient Health Questionnaire (PHQ-9)',
      badge: 'Mood & Depression Screening Tool (Not a Diagnosis)',
      scaleMax: 27,
      hasImpairmentQuestion: true,
      questions: [
        { topic: 'Question 1 of 9 · Interest & Pleasure', text: 'Over the last two weeks, how often have you been bothered by having little interest or pleasure in doing things?' },
        { topic: 'Question 2 of 9 · Feeling Down', text: 'Over the last two weeks, how often have you been bothered by feeling down, depressed, or hopeless?' },
        { topic: 'Question 3 of 9 · Sleep', text: 'Over the last two weeks, how often have you been bothered by trouble falling or staying asleep, or sleeping too much?' },
        { topic: 'Question 4 of 9 · Energy', text: 'Over the last two weeks, how often have you been bothered by feeling tired or having little energy?' },
        { topic: 'Question 5 of 9 · Appetite', text: 'Over the last two weeks, how often have you been bothered by poor appetite or overeating?' },
        { topic: 'Question 6 of 9 · Self-View', text: 'Over the last two weeks, how often have you been bothered by feeling bad about yourself — or that you are a failure or have let yourself or your family down?' },
        { topic: 'Question 7 of 9 · Concentration', text: 'Over the last two weeks, how often have you been bothered by trouble concentrating on things, such as reading the newspaper or watching television?' },
        { topic: 'Question 8 of 9 · Movement & Restlessness', text: 'Over the last two weeks, how often have you been bothered by moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual?' },
        { topic: 'Question 9 of 9 · Personal Safety', text: 'Over the last two weeks, how often have you been bothered by thoughts that you would be better off dead, or of hurting yourself in some way?' },
      ],
      options: [
        { label: 'Not at all', points: 0 },
        { label: 'Several days', points: 1 },
        { label: 'More than half the days', points: 2 },
        { label: 'Nearly every day', points: 3 },
      ],
      bands: [
        { max: 4, key: 'minimal', name: 'Minimal (0–4)', text: 'Your responses suggest minimal or no depressive symptoms over the past two weeks. Continue supportive daily routines and revisit this screening tool whenever helpful.' },
        { max: 9, key: 'mild', name: 'Mild (5–9)', text: 'Your responses suggest mild symptoms. Gentle routines, rest, movement, and talking with someone you trust can be helpful. Consider speaking with a healthcare professional if these feelings persist.' },
        { max: 14, key: 'moderate', name: 'Moderate (10–14)', text: 'Your responses suggest moderate symptoms. We encourage speaking with a doctor, counselor, or mental health professional to discuss how you have been feeling.' },
        { max: 19, key: 'moderately_severe', name: 'Moderately severe (15–19)', text: 'Your responses suggest moderately severe symptoms. Connecting with a qualified healthcare or mental health professional is strongly recommended.' },
        { max: 27, key: 'severe', name: 'Severe (20–27)', text: 'Your responses suggest severe symptoms. Please consider reaching out to a healthcare professional or support service soon. You do not have to navigate this alone.' },
      ],
      hasSafetyItem: true,
      safetyIndex: 8,
    },

    gad7: {
      name: 'Generalized Anxiety Disorder Screener (GAD-7)',
      badge: 'Anxiety Screening Tool (Not a Diagnosis)',
      scaleMax: 21,
      hasImpairmentQuestion: false,
      questions: [
        { topic: 'Question 1 of 7 · Feeling Nervous', text: 'Over the last two weeks, how often have you been bothered by feeling nervous, anxious, or on edge?' },
        { topic: 'Question 2 of 7 · Controlling Worry', text: 'Over the last two weeks, how often have you been bothered by not being able to stop or control worrying?' },
        { topic: 'Question 3 of 7 · Worrying About Different Things', text: 'Over the last two weeks, how often have you been bothered by worrying too much about different things?' },
        { topic: 'Question 4 of 7 · Relaxing', text: 'Over the last two weeks, how often have you been bothered by trouble relaxing?' },
        { topic: 'Question 5 of 7 · Restlessness', text: 'Over the last two weeks, how often have you been bothered by being so restless that it is hard to sit still?' },
        { topic: 'Question 6 of 7 · Irritability', text: 'Over the last two weeks, how often have you been bothered by becoming easily annoyed or irritable?' },
        { topic: 'Question 7 of 7 · Feeling Afraid', text: 'Over the last two weeks, how often have you been bothered by feeling afraid, as if something awful might happen?' },
      ],
      options: [
        { label: 'Not at all', points: 0 },
        { label: 'Several days', points: 1 },
        { label: 'More than half the days', points: 2 },
        { label: 'Nearly every day', points: 3 },
      ],
      bands: [
        { max: 4, key: 'minimal', name: 'Minimal (0–4)', text: 'Your responses reflect minimal or no anxiety symptoms over the past two weeks.' },
        { max: 9, key: 'mild', name: 'Mild (5–9)', text: 'Your responses reflect mild anxiety symptoms. Grounding exercises, rest, and talking with someone you trust may help.' },
        { max: 14, key: 'moderate', name: 'Moderate (10–14)', text: 'Your responses reflect moderate anxiety symptoms. Consider speaking with a counselor or healthcare provider for support.' },
        { max: 21, key: 'severe', name: 'Severe (15–21)', text: 'Your responses reflect severe anxiety symptoms. We encourage consulting a qualified mental health professional or physician.' },
      ],
      hasSafetyItem: false,
    },

    who5: {
      name: 'WHO-5 Well-Being Index',
      badge: 'General Well-Being Screening Tool (Not a Diagnosis)',
      scaleMax: 25,
      hasImpairmentQuestion: false,
      questions: [
        { topic: 'Question 1 of 5 · Good Spirits', text: 'Over the last two weeks, I have felt cheerful and in good spirits.' },
        { topic: 'Question 2 of 5 · Calmness', text: 'Over the last two weeks, I have felt calm and relaxed.' },
        { topic: 'Question 3 of 5 · Energy', text: 'Over the last two weeks, I have felt active and vigorous.' },
        { topic: 'Question 4 of 5 · Rest', text: 'Over the last two weeks, I woke up feeling fresh and rested.' },
        { topic: 'Question 5 of 5 · Daily Interest', text: 'Over the last two weeks, my daily life has been filled with things that interest me.' },
      ],
      options: [
        { label: 'All of the time', points: 5 },
        { label: 'Most of the time', points: 4 },
        { label: 'More than half of the time', points: 3 },
        { label: 'Less than half of the time', points: 2 },
        { label: 'Some of the time', points: 1 },
        { label: 'At no time', points: 0 },
      ],
      bands: [
        { max: 13, key: 'reduced', name: 'Reduced well-being (0–13)', text: 'A score of 13 or lower suggests reduced emotional well-being over the past two weeks. Consider checking in with a healthcare provider.' },
        { max: 19, key: 'moderate', name: 'Moderate well-being (14–19)', text: 'Your responses suggest moderate emotional well-being.' },
        { max: 25, key: 'high', name: 'High well-being (20–25)', text: 'Your responses reflect positive emotional well-being over the past two weeks.' },
      ],
      hasSafetyItem: false,
    },
  };

  const EMERGENCY_BY_COUNTRY = {
    US: 'Call or text 988 (Suicide & Crisis Lifeline) or dial 911 for immediate emergency services.',
    CA: 'Call or text 988 (Suicide Crisis Helpline) or dial 911 for immediate emergency services.',
    GB: 'Call 116 123 (Samaritans) or dial 999 / 111 for immediate emergency services.',
    IE: 'Call 116 123 (Samaritans) or dial 112 / 999 for immediate emergency services.',
    IN: 'Call 14416 or 1800-599-0019 (Tele-MANAS / KIRAN 24/7 Helpline) or dial 112 for emergency services.',
    AU: 'Call 13 11 14 (Lifeline Australia) or dial 000 for immediate emergency services.',
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    typeSelect: $('screener-type'),
    quizTitle: $('quiz-title'),
    quizBadge: $('quiz-badge'),
    counter: $('q-counter'),
    percent: $('q-percent'),
    fill: $('progress-fill'),
    track: $('progress-track'),
    domain: $('q-domain'),
    text: $('q-text'),
    options: $('options'),
    immediateSafetyBanner: $('immediate-safety-banner'),
    immediateSafetyCountryText: $('immediate-safety-country-text'),
    impairmentBox: $('impairment-box'),
    impairmentSelect: $('functional-impairment'),
    prev: $('btn-prev'),
    next: $('btn-next'),
    save: $('btn-save'),
    saveNote: $('save-note'),
    qView: $('question-view'),
    rView: $('result-view'),
    total: $('score-total'),
    max: $('score-max'),
    band: $('score-band'),
    scoreText: $('score-text'),
    safety: $('safety-flag'),
    submitStatus: $('assessment-submit-status'),
    consentPromptBox: $('assessment-consent-prompt'),
    grantSaveBtn: $('btn-grant-and-save'),
    restart: $('btn-restart'),
  };

  let activeType = 'phq9';
  let activeInv = INVENTORIES.phq9;
  let answers = [];
  let index = 0;

  function getSelectedCountry() {
    return (
      localStorage.getItem('unburden_selected_country') ||
      (window.unburdenSession && window.unburdenSession.country) ||
      'GLOBAL'
    );
  }

  function updateCountrySafetyGuidance() {
    const code = getSelectedCountry();
    const msg =
      EMERGENCY_BY_COUNTRY[code] ||
      'If you are in immediate danger, please contact your local emergency services (such as 112, 911, or 999) or connect with a free helpline in your country.';
    if (el.immediateSafetyCountryText) {
      el.immediateSafetyCountryText.textContent = msg;
    }
  }

  function checkImmediateSafetyNotice() {
    const isItem9Positive =
      activeInv.hasSafetyItem &&
      typeof answers[activeInv.safetyIndex] === 'number' &&
      answers[activeInv.safetyIndex] > 0;
    if (el.immediateSafetyBanner) {
      updateCountrySafetyGuidance();
      el.immediateSafetyBanner.classList.toggle('hidden', !isItem9Positive);
    }
  }

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
    checkImmediateSafetyNotice();
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
    try {
      sessionStorage.setItem(storageKey(), JSON.stringify({ answers, index }));
    } catch (_) {}
  }

  function clearStore() {
    try {
      sessionStorage.removeItem(storageKey());
    } catch (_) {}
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

    if (el.domain) el.domain.textContent = q.topic;
    if (el.text) el.text.textContent = q.text;
    if (el.options) el.options.innerHTML = '';

    // Notice: No invented frequency hints and no visible point badges beside answer options
    activeInv.options.forEach((opt, i) => {
      const selected = answers[index] === opt.points;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'option-row w-full text-left rounded-editorial bg-surface-low px-4 py-3.5 flex items-center gap-3.5';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(selected));
      row.dataset.selected = String(selected);
      row.dataset.points = String(opt.points);
      row.tabIndex = selected || (answers[index] === null && i === 0) ? 0 : -1;
      row.innerHTML = `
        <span class="radio-dot" aria-hidden="true"></span>
        <span class="flex-1 min-w-0">
          <span class="option-title block text-[14.5px] font-medium text-ink">${opt.label}</span>
        </span>`;
      row.addEventListener('click', () => select(opt.points));
      if (el.options) el.options.appendChild(row);
    });

    // Show functional impairment follow-up on the final question of PHQ-9 if any symptom > 0
    if (el.impairmentBox) {
      const anySymptom = answers.some((a) => typeof a === 'number' && a > 0);
      const showImpairment =
        activeInv.hasImpairmentQuestion && index === activeInv.questions.length - 1 && anySymptom;
      el.impairmentBox.classList.toggle('hidden', !showImpairment);
    }

    if (el.prev) el.prev.disabled = index === 0;
    if (el.next) {
      el.next.disabled = answers[index] === null;
      el.next.innerHTML =
        index === activeInv.questions.length - 1 ? 'See Screening Summary &rarr;' : 'Next Question &rarr;';
    }
    renderProgress();
  }

  function select(points) {
    answers[index] = points;
    persist();
    renderQuestion();
    // Immediately check Item 9 safety notice as soon as the user selects an option (without waiting for summary)
    checkImmediateSafetyNotice();
    const chosen = el.options && el.options.querySelector('[data-selected="true"]');
    if (chosen) chosen.focus();
  }

  function next() {
    if (answers[index] === null) return;
    if (index < activeInv.questions.length - 1) {
      index += 1;
      persist();
      renderQuestion();
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

  function showSubmissionMessage(kind, text) {
    if (!el.submitStatus) return;
    el.submitStatus.textContent = text;
    el.submitStatus.classList.remove(
      'hidden',
      'bg-crisis-bg',
      'text-crisis-ink',
      'bg-primary-tint',
      'text-primary',
      'bg-surface-mid',
      'text-ink-soft'
    );
    if (kind === 'error') {
      el.submitStatus.classList.add('bg-crisis-bg', 'text-crisis-ink');
    } else if (kind === 'success') {
      el.submitStatus.classList.add('bg-primary-tint', 'text-primary');
    } else {
      el.submitStatus.classList.add('bg-surface-mid', 'text-ink-soft');
    }
  }

  async function submitAssessmentToServer(storeConsentOverride = false) {
    const apiFetch = window.unburdenApiFetch;
    if (!apiFetch) return;

    const sessionRes = await apiFetch('/api/session');
    if (!sessionRes.ok) {
      showSubmissionMessage(
        'neutral',
        'You are viewing this summary privately in your browser. Log in and opt into Assessment Storage if you wish to save your history.'
      );
      return;
    }

    const impairment = el.impairmentSelect ? el.impairmentSelect.value : 'not_applicable';

    try {
      const { ok, status, data } = await apiFetch('/api/assessment/submit', {
        method: 'POST',
        body: JSON.stringify({
          type: activeType,
          responses: answers,
          functionalImpairment: impairment,
          storeConsent: storeConsentOverride,
        }),
      });

      if (ok && data.saved) {
        if (el.consentPromptBox) el.consentPromptBox.classList.add('hidden');
        showSubmissionMessage(
          'success',
          `Saved to your account history (${data.severityCategory} · Score ${data.score}). You can view or delete this record anytime in your Privacy Dashboard.`
        );
        return;
      }

      if (status === 403 && data.requiresConsent === 'assessment_storage') {
        showSubmissionMessage(
          'neutral',
          'Your result was not stored on the server because "Assessment Result Storage" consent is currently off for your account.'
        );
        if (el.consentPromptBox) el.consentPromptBox.classList.remove('hidden');
        return;
      }

      showSubmissionMessage(
        'error',
        data.error || `Could not save assessment result (HTTP ${status}). Your result is still displayed above.`
      );
    } catch (_) {
      showSubmissionMessage(
        'error',
        'Network error: Could not reach the server to save your assessment score. Please check your connection and try again.'
      );
    }
  }

  function showResult() {
    const total = answers.reduce((sum, v) => sum + (v || 0), 0);
    const band = activeInv.bands.find((b) => total <= b.max) || activeInv.bands[activeInv.bands.length - 1];

    if (el.total) el.total.textContent = String(total);
    if (el.max) el.max.textContent = ` / ${activeInv.scaleMax}`;
    if (el.band) el.band.textContent = band.name;
    if (el.scoreText) el.scoreText.textContent = band.text;

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
    submitAssessmentToServer(false);
  }

  function restart() {
    answers = new Array(activeInv.questions.length).fill(null);
    index = 0;
    clearStore();
    if (el.rView) el.rView.classList.add('hidden');
    if (el.qView) el.qView.classList.remove('hidden');
    if (el.safety) el.safety.classList.add('hidden');
    if (el.immediateSafetyBanner) el.immediateSafetyBanner.classList.add('hidden');
    if (el.submitStatus) el.submitStatus.classList.add('hidden');
    if (el.consentPromptBox) el.consentPromptBox.classList.add('hidden');
    renderQuestion();
  }

  function saveForLater() {
    persist();
    if (el.saveNote) {
      el.saveNote.textContent = 'Progress saved in this browser tab only. Closing the tab will clear it.';
      el.saveNote.classList.remove('hidden');
    }
  }

  if (el.grantSaveBtn) {
    el.grantSaveBtn.addEventListener('click', () => {
      submitAssessmentToServer(true);
    });
  }

  // Keyboard navigation
  if (el.options) {
    el.options.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const opts = activeInv.options;
      const currentIdx = opts.findIndex((o) => o.points === answers[index]);
      const nextIdx = Math.min(Math.max((currentIdx === -1 ? 0 : currentIdx) + dir, 0), opts.length - 1);
      select(opts[nextIdx].points);
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

  initInventory('phq9');
})();
