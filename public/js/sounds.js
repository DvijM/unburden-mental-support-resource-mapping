/* Calming Sounds & Ambient Soundscape Mixer
   Written as a strict-mode IIFE matching Unburden patterns.
   Utilizes Web Audio API for gapless seamless looping, independent multi-track mixing,
   and smooth gain ramps to avoid clicks. */
(function () {
  'use strict';

  // SVG Illustrative Panels for each sound card (pure inline SVG, zero external assets)
  const ILLUSTRATIONS = {
    rainforest: `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#405338] via-[#2F3F29] to-[#1E291A]" role="img" aria-label="Illustration: Tropical rainforest canopy with broad foliage">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(200,230,180,.25),transparent_60%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#5F7B54]/40" viewBox="0 0 200 125" fill="currentColor" aria-hidden="true">
          <path d="M-10 135 C30 70 80 50 140 135 Z" opacity="0.6"/>
          <path d="M60 135 C110 60 160 40 220 135 Z" opacity="0.8"/>
          <path d="M20 130 C45 90 90 85 110 130" stroke="#8CAE7E" stroke-width="2" fill="none" opacity="0.5"/>
          <circle cx="155" cy="45" r="3" fill="#D3E6C8" opacity="0.6"/>
        </svg>
      </div>`,
    'gentle-rain': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#5B7588] via-[#415666] to-[#2B3B47]" role="img" aria-label="Illustration: Soft rain falling diagonally against windowpane">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(210,230,245,.2),transparent_55%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#9EB5C7]/30" viewBox="0 0 200 125" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <line x1="30" y1="20" x2="18" y2="50" opacity="0.5"/>
          <line x1="75" y1="15" x2="63" y2="45" opacity="0.7"/>
          <line x1="120" y1="25" x2="108" y2="55" opacity="0.4"/>
          <line x1="165" y1="18" x2="153" y2="48" opacity="0.6"/>
          <line x1="45" y1="65" x2="33" y2="95" opacity="0.6"/>
          <line x1="95" y1="60" x2="83" y2="90" opacity="0.8"/>
          <line x1="140" y1="70" x2="128" y2="100" opacity="0.5"/>
          <line x1="180" y1="62" x2="168" y2="92" opacity="0.7"/>
        </svg>
      </div>`,
    thunderstorm: `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#3B4052] via-[#262A38] to-[#181B24]" role="img" aria-label="Illustration: Distant rolling thunderstorm clouds">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_35%,rgba(175,185,230,.22),transparent_60%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#8E99B8]/40" viewBox="0 0 200 125" fill="currentColor" aria-hidden="true">
          <circle cx="65" cy="55" r="35" opacity="0.6"/>
          <circle cx="110" cy="45" r="42" opacity="0.8"/>
          <circle cx="155" cy="60" r="32" opacity="0.5"/>
          <path d="M102 72 L94 90 L104 90 L98 108" stroke="#E2E7FF" stroke-width="2" fill="none" opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`,
    'ocean-waves': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#4E7F8C] via-[#355B66] to-[#223E46]" role="img" aria-label="Illustration: Calming rhythmic ocean swells">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(210,245,250,.25),transparent_55%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#A1D1DC]/40" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M-10 65 Q25 45 60 65 T130 65 T200 65" opacity="0.6"/>
          <path d="M0 85 Q35 65 70 85 T140 85 T210 85" opacity="0.8"/>
          <path d="M-20 105 Q15 85 50 105 T120 105 T190 105" opacity="0.5"/>
        </svg>
      </div>`,
    'flowing-stream': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#5F8278] via-[#425F57] to-[#2B3F39]" role="img" aria-label="Illustration: Mountain brook winding through rounded stones">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_40%_25%,rgba(200,240,230,.25),transparent_55%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#A4CFC3]/40" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M10 20 C60 50 40 80 100 115" opacity="0.7"/>
          <path d="M40 15 C90 45 70 75 130 110" opacity="0.9"/>
          <circle cx="50" cy="85" r="10" fill="#2B3F39" stroke="none" opacity="0.5"/>
          <circle cx="120" cy="65" r="7" fill="#2B3F39" stroke="none" opacity="0.4"/>
          <circle cx="145" cy="90" r="12" fill="#2B3F39" stroke="none" opacity="0.6"/>
        </svg>
      </div>`,
    fireplace: `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#7D4538] via-[#562C22] to-[#361A13]" role="img" aria-label="Illustration: Hearth with glowing embers and warm flame">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%,rgba(255,185,130,.4),transparent_65%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#EAA68C]/50" viewBox="0 0 200 125" fill="currentColor" aria-hidden="true">
          <path d="M85 105 C85 80 95 65 100 50 C105 65 115 80 115 105 Z" fill="#FCE0BE" opacity="0.9"/>
          <path d="M72 108 C75 90 85 80 90 70 C94 82 98 94 95 108 Z" opacity="0.7"/>
          <circle cx="92" cy="42" r="1.8" fill="#FFDAAF"/>
          <circle cx="108" cy="38" r="1.5" fill="#FFDAAF"/>
          <circle cx="118" cy="52" r="1.5" fill="#FFDAAF"/>
        </svg>
      </div>`,
    crickets: `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#31364F] via-[#212437] to-[#141624]" role="img" aria-label="Illustration: Night meadow beneath a crescent moon and stars">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(200,215,255,.2),transparent_55%)]"></div>
        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 200 125" fill="currentColor" aria-hidden="true">
          <path d="M150 25 A12 12 0 1 1 138 37 A10 10 0 0 0 150 25 Z" fill="#F0EDD8" opacity="0.9"/>
          <circle cx="45" cy="35" r="1.2" fill="#D2D6EE"/>
          <circle cx="95" cy="22" r="1.5" fill="#D2D6EE"/>
          <circle cx="115" cy="48" r="1" fill="#D2D6EE"/>
          <circle cx="70" cy="58" r="1.2" fill="#D2D6EE"/>
          <path d="M-10 130 C40 100 80 105 130 130 Z" fill="#1A1D2D" opacity="0.8"/>
          <path d="M90 130 C130 105 160 108 210 130 Z" fill="#141624" opacity="0.9"/>
        </svg>
      </div>`,
    'wind-trees': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#53654E] via-[#3A4936] to-[#253023]" role="img" aria-label="Illustration: Soft wind blowing through forest treetops">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_40%_20%,rgba(210,235,200,.22),transparent_55%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#B1C9AB]/40" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M20 40 Q80 25 150 45" opacity="0.7"/>
          <path d="M40 60 Q100 45 180 65" opacity="0.8"/>
          <path d="M10 80 Q70 65 140 85" opacity="0.6"/>
          <path d="M60 135 L60 85 L75 100" stroke-width="2" opacity="0.5"/>
          <path d="M130 135 L130 75 L145 92" stroke-width="2" opacity="0.6"/>
        </svg>
      </div>`,
    birdsong: `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#7D7053] via-[#5C5139] to-[#3C3423]" role="img" aria-label="Illustration: Morning light horizon with birds in flight">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,rgba(255,230,170,.35),transparent_65%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#F2DFB8]/50" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M50 45 Q55 38 60 45 Q65 38 70 45" opacity="0.8"/>
          <path d="M110 35 Q116 27 122 35 Q128 27 134 35" opacity="0.9"/>
          <path d="M145 52 Q149 46 153 52 Q157 46 161 52" opacity="0.7"/>
          <circle cx="100" cy="115" r="45" fill="#E8D19F" stroke="none" opacity="0.3"/>
        </svg>
      </div>`,
    'brown-noise': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#615149] via-[#463933] to-[#2D231E]" role="img" aria-label="Illustration: Deep low-frequency acoustic soundwave ribbon">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(235,215,200,.2),transparent_60%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#C8B2A6]/45" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M-10 62 C30 30 50 94 90 62 C130 30 150 94 190 62 C210 46 220 54 230 62"/>
          <path d="M-10 62 C30 45 50 79 90 62 C130 45 150 79 190 62" stroke-width="1.2" opacity="0.5"/>
        </svg>
      </div>`,
    'singing-bowls': `
      <div class="relative rounded overflow-hidden aspect-[16/10] bg-gradient-to-br from-[#77643E] via-[#554628] to-[#362C17]" role="img" aria-label="Illustration: Resonant concentric acoustic harmonic rings">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,230,160,.3),transparent_65%)]"></div>
        <svg class="absolute inset-0 w-full h-full text-[#DFCB9B]/40" viewBox="0 0 200 125" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <circle cx="100" cy="62" r="16" opacity="0.9"/>
          <circle cx="100" cy="62" r="30" opacity="0.7"/>
          <circle cx="100" cy="62" r="46" opacity="0.5"/>
          <circle cx="100" cy="62" r="62" opacity="0.3"/>
          <circle cx="100" cy="62" r="3" fill="#FFE29E" stroke="none"/>
        </svg>
      </div>`
  };

  // Safe HTML escaper (same implementation as support.js)
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // DOM elements
  const grid = document.getElementById('sounds-grid');
  const loading = document.getElementById('sounds-loading');
  const empty = document.getElementById('sounds-empty');
  const chips = document.getElementById('sound-chips');
  const countLabel = document.getElementById('sounds-count');
  const activeCountLabel = document.getElementById('active-count');
  const masterVolumeInput = document.getElementById('master-volume');
  const masterVolNum = document.getElementById('master-vol-num');
  const stopAllBtn = document.getElementById('stop-all');
  const sleepTimerSelect = document.getElementById('sleep-timer');
  const timerCountdown = document.getElementById('timer-countdown');

  // Application State
  let allSounds = [];
  let currentCategory = 'all';

  // Web Audio Context & Graph
  let audioCtx = null;
  let masterGainNode = null;
  let masterVolumeValue = 0.8; // default 80%

  // Decoded AudioBuffer cache: url -> AudioBuffer
  const bufferCache = new Map();

  // Active track state map: soundId -> { sound, gainNode, sourceNode, isPlaying, isLoading, volume, hasError }
  const tracks = new Map();

  // Sleep timer state
  let timerInterval = null;
  let timerRemainingSeconds = 0;

  /**
   * Initializes or resumes the Web Audio API AudioContext.
   * Defers creation until the first user interaction to comply with browser autoplay policies.
   */
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.setValueAtTime(masterVolumeValue, audioCtx.currentTime);
      masterGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Fetches and decodes an audio file lazily.
   */
  async function loadAudioBuffer(url) {
    if (bufferCache.has(url)) {
      return bufferCache.get(url);
    }
    const ctx = getAudioContext();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - Could not load ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(url, audioBuffer);
    return audioBuffer;
  }

  /**
   * Updates the "Your Soundscape" active sounds counter & Stop All button state.
   */
  function updateSoundscapeStatus() {
    let active = 0;
    tracks.forEach((t) => {
      if (t.isPlaying) active += 1;
    });

    if (activeCountLabel) {
      activeCountLabel.textContent = active === 1 ? '1 sound playing' : `${active} sounds playing`;
    }
    if (stopAllBtn) {
      stopAllBtn.disabled = active === 0;
    }
  }

  /**
   * Starts playback for a given track with a smooth fade-in.
   */
  async function startTrack(id) {
    const track = tracks.get(id);
    if (!track) return;

    const ctx = getAudioContext();
    const cardEl = document.querySelector(`.sound-card[data-id="${id}"]`);
    const btn = cardEl ? cardEl.querySelector('.sound-play-btn') : null;
    const errEl = cardEl ? cardEl.querySelector('.sound-error') : null;
    const eqEl = cardEl ? cardEl.querySelector('.eq-bars') : null;

    if (errEl) errEl.classList.add('hidden');

    // Loading state
    track.isLoading = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <span>Loading...</span>`;
    }

    try {
      const buffer = await loadAudioBuffer(track.sound.file);

      // Verify track wasn't cancelled or errored while awaiting
      track.isLoading = false;

      // Ensure prior source is cleaned
      if (track.sourceNode) {
        try { track.sourceNode.stop(); track.sourceNode.disconnect(); } catch (e) {}
      }

      // Create looping buffer source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Per-sound GainNode
      if (!track.gainNode) {
        track.gainNode = ctx.createGain();
        track.gainNode.connect(masterGainNode);
      }

      // Smooth fade-in over 200ms to eliminate clicks
      const now = ctx.currentTime;
      track.gainNode.gain.cancelScheduledValues(now);
      track.gainNode.gain.setValueAtTime(0.0001, now);
      track.gainNode.gain.exponentialRampToValueAtTime(Math.max(track.volume, 0.0001), now + 0.2);

      source.connect(track.gainNode);
      source.start(0);

      track.sourceNode = source;
      track.isPlaying = true;
      track.hasError = false;

      // Update card UI to active playing state
      if (cardEl) {
        cardEl.dataset.playing = 'true';
        cardEl.classList.add('ring-1', 'ring-primary/40');
      }
      if (btn) {
        btn.disabled = false;
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', `Pause ${track.sound.name}`);
        btn.className = 'sound-play-btn btn-primary w-full py-2.5 mt-3 text-[11.5px] tracking-[.06em] uppercase flex items-center justify-center gap-2';
        btn.innerHTML = `
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1"/>
            <rect x="14" y="5" width="4" height="14" rx="1"/>
          </svg>
          <span>Pause</span>`;
      }
      if (eqEl) {
        eqEl.classList.remove('hidden');
      }

      updateSoundscapeStatus();
    } catch (err) {
      console.error(`Error playing sound "${track.sound.name}":`, err);
      track.isLoading = false;
      track.isPlaying = false;
      track.hasError = true;

      if (btn) {
        btn.disabled = false;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `Play ${track.sound.name}`);
        btn.className = 'sound-play-btn btn-secondary w-full py-2.5 mt-3 text-[11.5px] tracking-[.06em] uppercase flex items-center justify-center gap-2';
        btn.innerHTML = `
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4"/>
          </svg>
          <span>Play</span>`;
      }
      if (cardEl) {
        cardEl.dataset.playing = 'false';
        cardEl.classList.remove('ring-1', 'ring-primary/40');
      }
      if (errEl) {
        errEl.textContent = 'Audio file currently unavailable. Please try again later.';
        errEl.classList.remove('hidden');
      }
      if (eqEl) {
        eqEl.classList.add('hidden');
      }
      updateSoundscapeStatus();
    }
  }

  /**
   * Pauses playback for a given track with a smooth fade-out.
   */
  function pauseTrack(id) {
    const track = tracks.get(id);
    if (!track || !track.isPlaying) return;

    const ctx = getAudioContext();
    const cardEl = document.querySelector(`.sound-card[data-id="${id}"]`);
    const btn = cardEl ? cardEl.querySelector('.sound-play-btn') : null;
    const eqEl = cardEl ? cardEl.querySelector('.eq-bars') : null;

    track.isPlaying = false;

    // Smooth fade-out over 200ms
    if (track.gainNode) {
      const now = ctx.currentTime;
      track.gainNode.gain.cancelScheduledValues(now);
      track.gainNode.gain.setValueAtTime(Math.max(track.gainNode.gain.value, 0.0001), now);
      track.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    }

    setTimeout(() => {
      if (!track.isPlaying && track.sourceNode) {
        try {
          track.sourceNode.stop();
          track.sourceNode.disconnect();
        } catch (e) {}
        track.sourceNode = null;
      }
    }, 220);

    // Update Card UI
    if (cardEl) {
      cardEl.dataset.playing = 'false';
      cardEl.classList.remove('ring-1', 'ring-primary/40');
    }
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', `Play ${track.sound.name}`);
      btn.className = 'sound-play-btn btn-secondary w-full py-2.5 mt-3 text-[11.5px] tracking-[.06em] uppercase flex items-center justify-center gap-2';
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4"/>
        </svg>
        <span>Play</span>`;
    }
    if (eqEl) {
      eqEl.classList.add('hidden');
    }

    updateSoundscapeStatus();
  }

  /**
   * Stops all currently playing tracks.
   */
  function stopAllSounds() {
    tracks.forEach((track, id) => {
      if (track.isPlaying) {
        pauseTrack(id);
      }
    });
    updateSoundscapeStatus();
  }

  /**
   * Sets per-sound volume.
   */
  function setTrackVolume(id, vol) {
    const track = tracks.get(id);
    if (!track) return;
    track.volume = vol;
    if (track.gainNode && track.isPlaying && audioCtx) {
      const now = audioCtx.currentTime;
      track.gainNode.gain.cancelScheduledValues(now);
      track.gainNode.gain.setValueAtTime(Math.max(vol, 0.0001), now);
    }
  }

  /**
   * Sets master soundscape volume.
   */
  function setMasterVolume(vol) {
    masterVolumeValue = vol;
    if (masterGainNode && audioCtx) {
      const now = audioCtx.currentTime;
      masterGainNode.gain.cancelScheduledValues(now);
      masterGainNode.gain.setValueAtTime(Math.max(vol, 0.0001), now);
    }
    if (masterVolNum) {
      masterVolNum.textContent = `${Math.round(vol * 100)}%`;
    }
  }

  /**
   * Sleep timer: gently fades everything out when timer expires.
   */
  function handleTimerChange() {
    const minutes = parseInt(sleepTimerSelect.value, 10);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (minutes <= 0) {
      timerCountdown.classList.add('hidden');
      timerCountdown.textContent = '';
      return;
    }

    timerRemainingSeconds = minutes * 60;
    timerCountdown.classList.remove('hidden');

    function updateTimerDisplay() {
      const m = Math.floor(timerRemainingSeconds / 60);
      const s = timerRemainingSeconds % 60;
      timerCountdown.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timerRemainingSeconds -= 1;
      if (timerRemainingSeconds <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        timerCountdown.textContent = 'Fading out...';

        // Gentle master fade-out over 3.5 seconds
        if (masterGainNode && audioCtx) {
          const now = audioCtx.currentTime;
          masterGainNode.gain.cancelScheduledValues(now);
          masterGainNode.gain.setValueAtTime(Math.max(masterGainNode.gain.value, 0.0001), now);
          masterGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
        }

        setTimeout(() => {
          stopAllSounds();
          // Restore master volume back to slider setting
          if (masterGainNode && audioCtx) {
            masterGainNode.gain.setValueAtTime(masterVolumeValue, audioCtx.currentTime);
          }
          sleepTimerSelect.value = '0';
          timerCountdown.classList.add('hidden');
          timerCountdown.textContent = '';
        }, 3600);
      } else {
        updateTimerDisplay();
      }
    }, 1000);
  }

  /**
   * Generates HTML markup for a sound card.
   */
  function renderCard(s) {
    const defaultPercent = Math.round((s.defaultVolume || 0.7) * 100);
    const illustration = ILLUSTRATIONS[s.id] || ILLUSTRATIONS.rainforest;

    return `
      <article data-id="${esc(s.id)}" data-cat="${esc(s.category)}" data-playing="false"
        class="sound-card bg-white rounded-editorial shadow-card p-4 sm:p-5 flex flex-col border border-transparent transition-all duration-200">
        <!-- Visual illustration -->
        ${illustration}

        <!-- Eyebrow & Live Equalizer Indicator -->
        <div class="mt-4 flex items-center justify-between">
          <p class="text-[9.5px] tracking-[.12em] uppercase font-medium text-primary">
            ${esc(s.categoryLabel || s.category)}
          </p>
          <div class="eq-bars text-primary hidden" aria-hidden="true" title="Playing">
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
          </div>
        </div>

        <!-- Title & Description -->
        <h3 class="font-display font-bold text-[18px] leading-snug mt-1.5 text-ink">${esc(s.name)}</h3>
        <p class="text-[12px] text-ink-soft leading-relaxed mt-2 flex-grow">${esc(s.description)}</p>

        <!-- Visible Error Container (hidden by default) -->
        <div class="sound-error hidden mt-3 bg-crisis-bg text-crisis-ink rounded px-3 py-2 text-[11px] leading-snug" role="alert"></div>

        <!-- Volume Slider Control -->
        <div class="mt-4 pt-3.5 border-t border-surface-mid flex items-center justify-between gap-3">
          <label for="vol-${esc(s.id)}" class="text-[10px] tracking-[.1em] uppercase text-ink-mute flex items-center gap-1.5 cursor-pointer flex-none">
            <svg class="w-3.5 h-3.5 text-ink-mute" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <span class="sr-only">Volume for ${esc(s.name)}</span>
          </label>
          <input id="vol-${esc(s.id)}" type="range" min="0" max="100" value="${defaultPercent}"
            class="sound-vol-slider w-full h-1.5 bg-surface-mid rounded-lg appearance-none cursor-pointer accent-primary"
            aria-label="Volume for ${esc(s.name)}" />
          <span class="vol-label text-[10.5px] font-mono text-ink-mute w-8 text-right flex-none">${defaultPercent}%</span>
        </div>

        <!-- Play / Pause Action Button -->
        <button type="button" class="sound-play-btn btn-secondary w-full py-2.5 mt-3 text-[11.5px] tracking-[.06em] uppercase flex items-center justify-center gap-2"
          data-id="${esc(s.id)}" aria-pressed="false" aria-label="Play ${esc(s.name)}">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4"/>
          </svg>
          <span>Play</span>
        </button>
      </article>`;
  }

  /**
   * Filters displayed cards by category chip.
   */
  function applyFilter(cat) {
    currentCategory = cat;
    let visibleCount = 0;
    const cards = grid.querySelectorAll('.sound-card');

    cards.forEach((card) => {
      const match = cat === 'all' || card.dataset.cat === cat;
      card.classList.toggle('hidden', !match);
      if (match) visibleCount += 1;
    });

    if (empty) {
      empty.classList.toggle('hidden', visibleCount > 0);
    }
    if (countLabel) {
      countLabel.textContent = cat === 'all'
        ? `${allSounds.length} Sounds Available`
        : `${visibleCount} ${visibleCount === 1 ? 'Sound' : 'Sounds'} in ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    }
  }

  /**
   * Attaches event listeners for card interactions.
   */
  function bindEvents() {
    // Category Chips
    if (chips) {
      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        chips.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        applyFilter(btn.dataset.cat);
      });
    }

    // Master Volume Control
    if (masterVolumeInput) {
      masterVolumeInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) / 100;
        setMasterVolume(val);
      });
    }

    // Stop All Button
    if (stopAllBtn) {
      stopAllBtn.addEventListener('click', stopAllSounds);
    }

    // Sleep Timer
    if (sleepTimerSelect) {
      sleepTimerSelect.addEventListener('change', handleTimerChange);
    }

    // Grid Delegation: Play/Pause toggles and Volume sliders
    if (grid) {
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.sound-play-btn');
        if (!btn) return;
        const id = btn.dataset.id;
        const track = tracks.get(id);
        if (!track) return;

        if (track.isPlaying) {
          pauseTrack(id);
        } else {
          startTrack(id);
        }
      });

      grid.addEventListener('input', (e) => {
        const slider = e.target.closest('.sound-vol-slider');
        if (!slider) return;
        const card = slider.closest('.sound-card');
        if (!card) return;
        const id = card.dataset.id;
        const volVal = parseInt(slider.value, 10);
        const label = card.querySelector('.vol-label');
        if (label) label.textContent = `${volVal}%`;
        setTrackVolume(id, volVal / 100);
      });
    }
  }

  /**
   * Initializes the sounds catalog by fetching from /api/sounds.
   */
  function init() {
    bindEvents();

    fetch('/api/sounds')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        allSounds = data;
        if (loading) loading.classList.add('hidden');

        // Populate track registry
        data.forEach((sound) => {
          tracks.set(sound.id, {
            sound,
            gainNode: null,
            sourceNode: null,
            isPlaying: false,
            isLoading: false,
            volume: typeof sound.defaultVolume === 'number' ? sound.defaultVolume : 0.7,
            hasError: false
          });
        });

        // Render card markup
        grid.innerHTML = data.map(renderCard).join('');
        applyFilter('all');
      })
      .catch((err) => {
        console.error('Could not load sound library:', err);
        if (loading) loading.classList.add('hidden');
        grid.innerHTML = `
          <div class="col-span-full bg-crisis-bg text-crisis-ink rounded-editorial p-6 text-[13px] leading-relaxed shadow-card" role="alert">
            <strong class="font-semibold">Unable to load sound library.</strong> The ambient audio catalog is temporarily unavailable. If you are experiencing distress, reach out to free 24/7 crisis support via <a class="underline font-semibold" href="tel:988">988</a> or explore our <a class="underline font-semibold" href="/find-support">helpline directory</a>.
          </div>`;
      });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
