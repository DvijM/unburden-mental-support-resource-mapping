'use strict';

const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

const SAMPLE_RATE = 22050;
const DURATION_SEC = 4;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SEC;

function createWavHeader(numSamples, sampleRate) {
  const byteRate = sampleRate * 2; // 1 channel, 16-bit = 2 bytes/sample
  const blockAlign = 2;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function writeAudioFile(filename, sampleGenerator) {
  const samples = new Float32Array(TOTAL_SAMPLES);
  sampleGenerator(samples, TOTAL_SAMPLES, SAMPLE_RATE);

  // Seamless loop crossfade at the boundaries (last 0.25s crossfaded into beginning)
  const fadeLength = Math.floor(SAMPLE_RATE * 0.25);
  for (let i = 0; i < fadeLength; i++) {
    const t = i / fadeLength;
    const endIdx = TOTAL_SAMPLES - fadeLength + i;
    samples[i] = samples[i] * t + samples[endIdx] * (1 - t);
  }

  // Convert to 16-bit PCM Buffer
  const pcmBuffer = Buffer.alloc(TOTAL_SAMPLES * 2);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const intVal = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
    pcmBuffer.writeInt16LE(intVal, i * 2);
  }

  const header = createWavHeader(TOTAL_SAMPLES, SAMPLE_RATE);
  const fullBuffer = Buffer.concat([header, pcmBuffer]);
  const destPath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(destPath, fullBuffer);
  console.log(`Generated: ${filename} (${fullBuffer.length} bytes)`);
}

// 1. Gentle Rain
writeAudioFile('gentle-rain.mp3', (samples, count, sr) => {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < count; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + white * 0.05;
    b1 = 0.95 * b1 + white * 0.1;
    b2 = 0.85 * b2 + white * 0.15;
    let rain = (b0 + b1 + b2) * 0.25;
    // Occasional gentle drops
    if (Math.random() < 0.002) {
      rain += (Math.random() * 0.3) * Math.sin((i / sr) * 1200 * 2 * Math.PI);
    }
    samples[i] = rain * 0.7;
  }
});

// 2. Rainforest
writeAudioFile('rainforest.mp3', (samples, count, sr) => {
  let low = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    low = 0.92 * low + white * 0.08;
    const canopyRustle = Math.sin(t * 0.8) * 0.15 + 0.85;
    let s = low * canopyRustle * 0.4;
    // Distant bird note
    if (t > 1.2 && t < 1.6) {
      s += Math.sin((t - 1.2) * 2200 * 2 * Math.PI) * Math.sin((t - 1.2) / 0.4 * Math.PI) * 0.12;
    }
    samples[i] = s;
  }
});

// 3. Thunderstorm
writeAudioFile('thunderstorm.mp3', (samples, count, sr) => {
  let rumble = 0;
  let rain = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    rumble = 0.985 * rumble + white * 0.02;
    rain = 0.9 * rain + white * 0.1;
    const thunderSwell = 0.4 + 0.6 * Math.max(0, Math.sin(t * (Math.PI / 2)));
    samples[i] = (rumble * 1.5 * thunderSwell + rain * 0.15) * 0.6;
  }
});

// 4. Ocean Waves
writeAudioFile('ocean-waves.mp3', (samples, count, sr) => {
  let p = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    p = 0.94 * p + white * 0.06;
    // Slow swell: sine wave envelope around 0.25 Hz
    const swell = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * (2 * Math.PI / DURATION_SEC)), 2);
    samples[i] = p * swell * 0.75;
  }
});

// 5. Flowing Stream
writeAudioFile('flowing-stream.mp3', (samples, count, sr) => {
  let b = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    b = 0.88 * b + white * 0.12;
    // Babble modulation
    const ripple = 0.8 + 0.2 * (Math.sin(t * 7.3) * Math.cos(t * 3.1));
    samples[i] = b * ripple * 0.45;
  }
});

// 6. Fireplace
writeAudioFile('fireplace.mp3', (samples, count, sr) => {
  let low = 0;
  for (let i = 0; i < count; i++) {
    const white = Math.random() * 2 - 1;
    low = 0.97 * low + white * 0.03;
    let s = low * 0.35;
    // Crackles and pops
    if (Math.random() < 0.0015) {
      s += (Math.random() * 0.7) * (Math.random() > 0.5 ? 1 : -1);
    }
    samples[i] = s;
  }
});

// 7. Crickets
writeAudioFile('crickets.mp3', (samples, count, sr) => {
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    // Cricket chirp cadence ~ 4 pulses per burst
    const cadence = Math.sin(t * 18 * 2 * Math.PI);
    const envelope = Math.max(0, Math.sin(t * 3 * 2 * Math.PI)) * (cadence > 0.3 ? 1 : 0);
    const carrier = Math.sin(t * 4600 * 2 * Math.PI) + 0.3 * Math.sin(t * 9200 * 2 * Math.PI);
    samples[i] = carrier * envelope * 0.2;
  }
});

// 8. Wind Through Trees
writeAudioFile('wind-trees.mp3', (samples, count, sr) => {
  let filtered = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    filtered = 0.96 * filtered + white * 0.04;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.5 * 2 * Math.PI);
    samples[i] = filtered * gust * 0.65;
  }
});

// 9. Birdsong
writeAudioFile('birdsong.mp3', (samples, count, sr) => {
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    let chirp = 0;
    // Discrete morning phrases
    if ((t > 0.4 && t < 0.9) || (t > 2.0 && t < 2.5)) {
      const phraseT = t > 1.5 ? t - 2.0 : t - 0.4;
      const freq = 2800 + 900 * Math.sin(phraseT * 18);
      chirp = Math.sin(phraseT * freq * 2 * Math.PI) * Math.sin((phraseT / 0.5) * Math.PI) * 0.25;
    }
    samples[i] = chirp;
  }
});

// 10. Soft Brown Noise
writeAudioFile('brown-noise.mp3', (samples, count) => {
  let last = 0;
  for (let i = 0; i < count; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + (0.02 * white)) / 1.02;
    samples[i] = last * 1.8;
  }
});

// 11. Singing Bowls
writeAudioFile('singing-bowls.mp3', (samples, count, sr) => {
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    // Harmonic frequencies: 216 Hz, 432 Hz, 648 Hz
    const f1 = Math.sin(t * 216 * 2 * Math.PI);
    const f2 = Math.sin(t * 432 * 2 * Math.PI) * 0.4;
    const f3 = Math.sin(t * 648 * 2 * Math.PI) * 0.15;
    // Subtle beat frequency
    const beat = 0.8 + 0.2 * Math.sin(t * 1.5 * 2 * Math.PI);
    samples[i] = (f1 + f2 + f3) * beat * 0.35;
  }
});

console.log('All 11 sound files successfully synthesized!');
