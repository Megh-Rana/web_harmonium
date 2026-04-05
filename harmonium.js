// ── Constants ──────────────────────────────────────────────────────────────

const SAMPLE_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples/harmonium/';

// All 12 chromatic notes (Western)
const CHROMATIC = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];

// Indian sargam: Sa Re Ga Ma Pa Dha Ni (natural + komal/tivra variants)
// We map the 7 shuddha swaras to chromatic offsets from Sa (root)
// Sa=0, Re=2, Ga=4, Ma=5, Pa=7, Dha=9, Ni=11
// Komal: Re=1, Ga=3, Dha=8, Ni=10  |  Tivra: Ma=6
const SWARAS = [
  { name: 'Sa',  key: 's', offset: 0,  isBlack: false },
  { name: 'Re♭', key: 'e', offset: 1,  isBlack: true  },
  { name: 'Re',  key: 'r', offset: 2,  isBlack: false },
  { name: 'Ga♭', key: 'w', offset: 3,  isBlack: true  },
  { name: 'Ga',  key: 'g', offset: 4,  isBlack: false },
  { name: 'Ma',  key: 'm', offset: 5,  isBlack: false },
  { name: 'Ma#', key: 'q', offset: 6,  isBlack: true  },
  { name: 'Pa',  key: 'p', offset: 7,  isBlack: false },
  { name: 'Dha♭',key: 'u', offset: 8,  isBlack: true  },
  { name: 'Dha', key: 'd', offset: 9,  isBlack: false },
  { name: 'Ni♭', key: 'y', offset: 10, isBlack: true  },
  { name: 'Ni',  key: 'n', offset: 11, isBlack: false },
];

// Indian scale names → root note (chromatic index)
const SCALES = {
  'Sa (C)': 0, 'Sa (C#)': 1, 'Sa (D)': 2, 'Sa (D#)': 3,
  'Sa (E)': 4, 'Sa (F)': 5, 'Sa (F#)': 6, 'Sa (G)': 7,
  'Sa (G#)': 8, 'Sa (A)': 9, 'Sa (A#)': 10, 'Sa (B)': 11,
};

// Available samples on the CDN (octave 2–4, some 5)
const AVAILABLE_SAMPLES = new Set([
  'A2','As2','B2','C2','Cs2','D2','Ds2','E2','F2','Fs2','G2','Gs2',
  'A3','As3','B3','C3','Cs3','D3','Ds3','E3','F3','Fs3','G3','Gs3',
  'A4','As4','B4','C4','Cs4','D4','Ds4','E4','F4','G4','Gs4',
  'C5','Cs5','D5',
]);

// ── State ──────────────────────────────────────────────────────────────────

let audioCtx = null;
let reverbNode = null;
let gainNode = null;
let reverbEnabled = false;
let volume = 0.8;
let currentOctave = 3;
let currentScaleRoot = 0; // C
let bufferCache = {};
let activeNodes = {}; // key → { source, gain }
let pressedKeys = new Set();

// ── Audio Init ─────────────────────────────────────────────────────────────

async function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  gainNode.connect(audioCtx.destination);

  reverbNode = await buildReverb();
  reverbNode.connect(gainNode);
}

async function buildReverb() {
  const convolver = audioCtx.createConvolver();
  const len = audioCtx.sampleRate * 2.5;
  const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  convolver.buffer = ir;
  return convolver;
}

// ── Sample Loading ─────────────────────────────────────────────────────────

// Find nearest available sample for a given MIDI note
function nearestSample(midiNote) {
  let best = null, bestDist = Infinity;
  for (const name of AVAILABLE_SAMPLES) {
    const midi = sampleNameToMidi(name);
    const dist = Math.abs(midi - midiNote);
    if (dist < bestDist) { bestDist = dist; best = name; }
  }
  return best;
}

function sampleNameToMidi(name) {
  // e.g. "Cs3" → C#3
  const noteMap = { C:0, Cs:1, D:2, Ds:3, E:4, F:5, Fs:6, G:7, Gs:8, A:9, As:10, B:11 };
  const match = name.match(/^([A-G]s?)(\d)$/);
  return noteMap[match[1]] + (parseInt(match[2]) + 1) * 12;
}

async function loadBuffer(sampleName) {
  if (bufferCache[sampleName]) return bufferCache[sampleName];
  const url = SAMPLE_BASE + sampleName + '.mp3';
  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
  bufferCache[sampleName] = audioBuf;
  return audioBuf;
}

// ── Note Calculation ───────────────────────────────────────────────────────

function noteForSwara(swara, octave) {
  const total = currentScaleRoot + swara.offset;
  const chromIdx = total % 12;
  const octaveShift = Math.floor(total / 12);
  // MIDI: C4 = 60, so C(octave) = (octave+1)*12
  return (octave + 1) * 12 + chromIdx + octaveShift * 12;
}

// ── Playback ───────────────────────────────────────────────────────────────

async function playNote(swara, octave) {
  if (!audioCtx) await initAudio();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const midiNote = noteForSwara(swara, octave);
  const noteId = `${swara.key}_${octave}`;

  if (activeNodes[noteId]) return; // already playing

  const sampleName = nearestSample(midiNote);
  const sampleMidi = sampleNameToMidi(sampleName);
  const detune = (midiNote - sampleMidi) * 100; // cents

  const buffer = await loadBuffer(sampleName);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.detune.value = detune;
  source.loop = true;
  source.loopStart = 0.5;
  source.loopEnd = buffer.duration;

  const noteGain = audioCtx.createGain();
  noteGain.gain.value = 0;
  noteGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.02);

  source.connect(noteGain);
  const dest = reverbEnabled ? reverbNode : gainNode;
  noteGain.connect(dest);
  if (reverbEnabled) noteGain.connect(gainNode); // dry signal too

  source.start();
  activeNodes[noteId] = { source, gain: noteGain };
}

function stopNote(swara, octave) {
  const noteId = `${swara.key}_${octave}`;
  const node = activeNodes[noteId];
  if (!node) return;
  const { source, gain } = node;
  gain.gain.cancelScheduledValues(audioCtx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
  source.stop(audioCtx.currentTime + 0.35);
  delete activeNodes[noteId];
}

// ── Keyboard UI ────────────────────────────────────────────────────────────

function buildKeyboard() {
  const kb = document.getElementById('keyboard');
  kb.innerHTML = '';

  // White keys first (for layout), black keys positioned absolutely
  const whiteKeys = SWARAS.filter(s => !s.isBlack);
  const totalWidth = whiteKeys.length * 54; // 52px + 2px margin
  kb.style.width = totalWidth + 'px';

  // Place white keys
  whiteKeys.forEach((swara, i) => {
    const el = document.createElement('div');
    el.className = 'white-key';
    el.dataset.key = swara.key;
    el.dataset.octaveOffset = '0';
    el.innerHTML = `
      <span class="sargam-label">${swara.name}</span>
      <span class="key-label">${swara.key.toUpperCase()}</span>
    `;
    el.addEventListener('mousedown', e => { e.preventDefault(); triggerPress(swara, 0); });
    el.addEventListener('mouseup', () => triggerRelease(swara, 0));
    el.addEventListener('mouseleave', () => triggerRelease(swara, 0));
    kb.appendChild(el);
  });

  // Place black keys absolutely
  // Black key positions relative to white keys
  // White key order: Sa Re Ga Ma Pa Dha Ni
  // Black keys sit between: Sa-Re, Re-Ga, Ma-Pa, Pa-Dha, Dha-Ni
  const blackKeyPositions = {
    'e': 0,  // between Sa(0) and Re(1) → after white[0]
    'w': 1,  // between Re(1) and Ga(2) → after white[1]
    'q': 3,  // between Ma(3) and Pa(4) → after white[3]
    'u': 4,  // between Pa(4) and Dha(5) → after white[4]
    'y': 5,  // between Dha(5) and Ni(6) → after white[5]
  };

  SWARAS.filter(s => s.isBlack).forEach(swara => {
    const whiteIdx = blackKeyPositions[swara.key];
    const el = document.createElement('div');
    el.className = 'black-key';
    el.dataset.key = swara.key;
    // Position: after white key at whiteIdx, centered between it and next
    const leftPos = 4 + whiteIdx * 54 + 36; // 4px padding + offset
    el.style.left = leftPos + 'px';
    el.style.top = '0';
    el.innerHTML = `
      <span class="sargam-label">${swara.name}</span>
      <span class="key-label">${swara.key.toUpperCase()}</span>
    `;
    el.addEventListener('mousedown', e => { e.preventDefault(); triggerPress(swara, 0); });
    el.addEventListener('mouseup', () => triggerRelease(swara, 0));
    el.addEventListener('mouseleave', () => triggerRelease(swara, 0));
    kb.appendChild(el);
  });
}

function setKeyPressed(swaraKey, pressed) {
  const el = document.querySelector(`[data-key="${swaraKey}"]`);
  if (el) el.classList.toggle('pressed', pressed);
}

// ── Key Legend ─────────────────────────────────────────────────────────────

function buildLegend() {
  const row = document.getElementById('sargamRow');
  row.innerHTML = '';
  const mainSwaras = SWARAS.filter(s => !s.isBlack);
  mainSwaras.forEach(s => {
    const badge = document.createElement('div');
    badge.className = 'sargam-badge';
    badge.innerHTML = `
      <span class="note-name">${s.name}</span>
      <span class="key-hint">${s.key.toUpperCase()}</span>
    `;
    row.appendChild(badge);
  });
}

// ── Input Handling ─────────────────────────────────────────────────────────
// Shift = higher octave (+1), Z = lower octave (-1)  [Ctrl avoided — browser conflicts]

function triggerPress(swara, octaveOffset) {
  const octave = currentOctave + octaveOffset;
  const id = `${swara.key}_${octaveOffset}`;
  if (pressedKeys.has(id)) return;
  pressedKeys.add(id);
  setKeyPressed(swara.key, true);
  playNote(swara, octave);
}

function triggerRelease(swara, octaveOffset) {
  const octave = currentOctave + octaveOffset;
  const id = `${swara.key}_${octaveOffset}`;
  if (!pressedKeys.has(id)) return;
  pressedKeys.delete(id);
  setKeyPressed(swara.key, false);
  stopNote(swara, octave);
}

const keyMap = {};
SWARAS.forEach(s => { keyMap[s.key] = s; });

// Keyed by e.code (physical key) so modifier state at keyup can't confuse us
const keyPressedOffset = {};
let modLower = false;   // Z held
let modHigher = false;  // Shift held

document.addEventListener('keydown', e => {
  if (e.code === 'KeyZ') { modLower = true; e.preventDefault(); return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { modHigher = true; return; }
  if (e.repeat) return;

  const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
  const swara = keyMap[key];
  if (!swara) return;
  e.preventDefault();

  const octaveOffset = modHigher ? 1 : modLower ? -1 : 0;
  keyPressedOffset[e.code] = octaveOffset;
  triggerPress(swara, octaveOffset);
});

document.addEventListener('keyup', e => {
  if (e.code === 'KeyZ') { modLower = false; return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { modHigher = false; return; }

  const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
  const swara = keyMap[key];
  if (!swara) return;

  const octaveOffset = keyPressedOffset[e.code] ?? 0;
  delete keyPressedOffset[e.code];
  triggerRelease(swara, octaveOffset);
});

// ── Controls ───────────────────────────────────────────────────────────────

function initControls() {
  // Scale select
  const sel = document.getElementById('scaleSelect');
  Object.keys(SCALES).forEach(name => {
    const opt = document.createElement('option');
    opt.value = SCALES[name];
    opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    currentScaleRoot = parseInt(sel.value);
  });

  // Reverb
  document.getElementById('reverbToggle').addEventListener('change', e => {
    reverbEnabled = e.target.checked;
  });

  // Volume
  document.getElementById('volumeSlider').addEventListener('input', e => {
    volume = parseFloat(e.target.value);
    if (gainNode) gainNode.gain.value = volume;
  });
}

// ── Preload core samples ───────────────────────────────────────────────────

async function preload() {
  await initAudio();
  // Preload all 3 playable octaves (lower, current, higher) to avoid delay on shift
  const toLoad = [];
  for (const oct of [currentOctave - 1, currentOctave, currentOctave + 1]) {
    for (let offset = 0; offset < 12; offset++) {
      const midiNote = (oct + 1) * 12 + offset;
      toLoad.push(nearestSample(midiNote));
    }
  }
  await Promise.all([...new Set(toLoad)].map(loadBuffer));
}

// ── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  buildKeyboard();
  buildLegend();
  initControls();

  const overlay = document.getElementById('loading-overlay');
  try {
    await preload();
  } catch (err) {
    console.warn('Preload failed, will load on demand:', err);
  }
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);
}

window.addEventListener('blur', () => {
  modLower = false; modHigher = false;
  Object.keys(keyPressedOffset).forEach(code => {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : null;
    const swara = key ? keyMap[key] : null;
    if (swara) triggerRelease(swara, keyPressedOffset[code] ?? 0);
  });
  Object.keys(activeNodes).forEach(noteId => {
    const { source, gain } = activeNodes[noteId];
    try { gain.gain.setValueAtTime(0, audioCtx.currentTime); source.stop(); } catch(_) {}
    delete activeNodes[noteId];
  });
  pressedKeys.clear();
  document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
});

boot();
