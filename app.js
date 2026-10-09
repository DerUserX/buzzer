'use strict';

/* =========================================================
   Settings
   ========================================================= */
const DEFAULTS = {
  a: { name: 'Daniel', color: '#e53935', key: 'a' },
  b: { name: 'Dennis', color: '#1e88e5', key: '#' },
  seconds: 5,
  tick: true,
  volume: 0.8,
};
const STORAGE_KEY = 'buzzer.settings.v1';

let settings = loadSettings();

function loadSettings() {
  const base = structuredClone(DEFAULTS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      ...base, ...s,
      a: { ...base.a, ...(s.a || {}) },
      b: { ...base.b, ...(s.b || {}) },
    };
  } catch {
    return base;
  }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

/* =========================================================
   Audio
   ========================================================= */
const SOUNDS = [
  { id: 'buzzA', title: 'Buzzer A' },
  { id: 'buzzB', title: 'Buzzer B' },
  { id: 'tick', title: 'Sekunden-Tick' },
  { id: 'timeup', title: 'Zeit abgelaufen' },
];

const AudioCtx = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioCtx();
const master = ctx.createGain();
master.connect(ctx.destination);

const customBuffers = {}; // id -> AudioBuffer
const customNames = {};   // id -> filename

function applyVolume() { master.gain.value = settings.volume; }

function unlockAudio() {
  if (ctx.state === 'suspended') ctx.resume();
  document.getElementById('start-hint').classList.add('gone');
}

function tone({ type = 'sine', freq, freqEnd, start = 0, dur, gain = 0.3, attack = 0.005, filter }) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const SYNTH = {
  buzzA() {
    tone({ type: 'sawtooth', freq: 220, freqEnd: 180, dur: 0.45, gain: 0.28, filter: 2500 });
    tone({ type: 'square', freq: 110, freqEnd: 90, dur: 0.45, gain: 0.12, filter: 1200 });
  },
  buzzB() {
    tone({ type: 'sawtooth', freq: 330, freqEnd: 270, dur: 0.45, gain: 0.26, filter: 3000 });
    tone({ type: 'square', freq: 165, freqEnd: 135, dur: 0.45, gain: 0.11, filter: 1500 });
  },
  tick() {
    tone({ type: 'sine', freq: 1000, dur: 0.06, gain: 0.35, attack: 0.002 });
  },
  timeup() {
    tone({ type: 'square', freq: 150, dur: 1.1, gain: 0.22, filter: 1100 });
    tone({ type: 'square', freq: 155, dur: 1.1, gain: 0.22, filter: 1100 });
    tone({ type: 'sawtooth', freq: 75, dur: 1.1, gain: 0.15, filter: 600 });
  },
};

function playSound(id) {
  if (ctx.state === 'suspended') ctx.resume();
  const buf = customBuffers[id];
  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start();
  } else {
    SYNTH[id]();
  }
}

/* ---------- IndexedDB for custom sound files ---------- */
const DB_NAME = 'buzzer-sounds';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('sounds');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }
  return dbPromise;
}

async function dbOp(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sounds', mode);
    const req = fn(tx.objectStore('sounds'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function setCustomSound(id, file) {
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  customBuffers[id] = buf;
  customNames[id] = file.name;
  try { await dbOp('readwrite', s => s.put({ name: file.name, blob: file }, id)); } catch { /* not persisted */ }
}

async function clearCustomSound(id) {
  delete customBuffers[id];
  delete customNames[id];
  try { await dbOp('readwrite', s => s.delete(id)); } catch { /* ignore */ }
}

async function loadCustomSounds() {
  for (const { id } of SOUNDS) {
    try {
      const rec = await dbOp('readonly', s => s.get(id));
      if (rec && rec.blob) {
        customBuffers[id] = await ctx.decodeAudioData(await rec.blob.arrayBuffer());
        customNames[id] = rec.name;
      }
    } catch { /* ignore broken entries */ }
  }
}

/* =========================================================
   UI / game state
   ========================================================= */
const $ = id => document.getElementById(id);
const overlay = $('overlay');
const dotsEl = $('dots');
const dialog = $('settings');

let state = 'idle'; // idle | locked
let timers = [];

function keyLabel(k) {
  if (k === ' ') return 'Leertaste';
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function applyUi() {
  const root = document.documentElement.style;
  root.setProperty('--color-a', settings.a.color);
  root.setProperty('--color-b', settings.b.color);
  for (const p of ['a', 'b']) {
    $('name-' + p).textContent = settings[p].name;
    $('key-' + p).textContent = keyLabel(settings[p].key);
  }
  applyVolume();
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function buzz(player) {
  if (state !== 'idle' || dialog.open) return;
  unlockAudio();
  state = 'locked';
  const p = settings[player];

  playSound(player === 'a' ? 'buzzA' : 'buzzB');
  $('side-' + player).classList.add('pressed');

  overlay.style.setProperty('--win', p.color);
  overlay.style.setProperty('--ox', player === 'a' ? '25%' : '75%');
  $('overlay-name').textContent = p.name;

  const n = Math.max(1, Math.min(30, settings.seconds | 0));
  dotsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    dotsEl.appendChild(d);
  }

  overlay.classList.remove('hide', 'show');
  void overlay.offsetWidth; // restart animation
  overlay.classList.add('show');

  // one dot goes out per second, from right to left
  const dots = [...dotsEl.children];
  for (let i = 1; i <= n; i++) {
    timers.push(setTimeout(() => {
      const d = dots[n - i];
      d.classList.add('off', 'fading');
      if (i < n) {
        if (settings.tick) playSound('tick');
      } else {
        playSound('timeup');
        timers.push(setTimeout(release, 900));
      }
    }, i * 1000));
  }
}

function release() {
  clearTimers();
  document.querySelectorAll('.side.pressed').forEach(el => el.classList.remove('pressed'));
  if (overlay.classList.contains('show')) {
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    timers.push(setTimeout(() => overlay.classList.remove('hide'), 400));
  }
  state = 'idle';
}

/* ---------- Input ---------- */
let listeningFor = null; // player id while recording a new key

document.addEventListener('keydown', e => {
  if (listeningFor) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopListening(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ') return; // reserved for reset
    const other = listeningFor === 'a' ? 'b' : 'a';
    if (settings[other].key === k) return;
    settings[listeningFor].key = k;
    saveSettings();
    stopListening();
    applyUi();
    return;
  }

  if (dialog.open) return;
  unlockAudio();
  if (e.repeat) return;

  if (e.key === 'Escape') { e.preventDefault(); openSettings(); return; }
  if (e.key === ' ') { e.preventDefault(); release(); return; }

  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === settings.a.key) { e.preventDefault(); buzz('a'); }
  else if (k === settings.b.key) { e.preventDefault(); buzz('b'); }
}, true);

for (const p of ['a', 'b']) {
  $('side-' + p).addEventListener('pointerdown', () => buzz(p));
}
document.addEventListener('pointerdown', unlockAudio);

/* =========================================================
   Settings dialog
   ========================================================= */
function openSettings() {
  release();
  fillForm();
  dialog.showModal();
}

function fillForm() {
  for (const p of ['a', 'b']) {
    $('s-name-' + p).value = settings[p].name;
    $('s-color-' + p).value = settings[p].color;
    $('s-key-' + p).textContent = keyLabel(settings[p].key);
  }
  $('s-seconds').value = settings.seconds;
  $('s-tick').checked = settings.tick;
  $('s-volume').value = settings.volume;
  renderSoundList();
}

function stopListening() {
  if (!listeningFor) return;
  const btn = $('s-key-' + listeningFor);
  btn.classList.remove('listening');
  btn.textContent = keyLabel(settings[listeningFor].key);
  listeningFor = null;
}

$('settings-btn').addEventListener('click', e => { e.stopPropagation(); openSettings(); });
$('settings-btn').addEventListener('pointerdown', e => e.stopPropagation());

dialog.addEventListener('cancel', e => { if (listeningFor) e.preventDefault(); });
dialog.addEventListener('close', stopListening);

for (const p of ['a', 'b']) {
  $('s-name-' + p).addEventListener('input', e => {
    settings[p].name = e.target.value.trim() || DEFAULTS[p].name;
    saveSettings(); applyUi();
  });
  $('s-color-' + p).addEventListener('input', e => {
    settings[p].color = e.target.value;
    saveSettings(); applyUi();
  });
  $('s-key-' + p).addEventListener('click', e => {
    stopListening();
    listeningFor = p;
    e.target.classList.add('listening');
    e.target.textContent = 'Taste drücken…';
  });
}

$('s-seconds').addEventListener('change', e => {
  const v = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || DEFAULTS.seconds));
  e.target.value = v;
  settings.seconds = v;
  saveSettings();
});
$('s-tick').addEventListener('change', e => { settings.tick = e.target.checked; saveSettings(); });
$('s-volume').addEventListener('input', e => { settings.volume = +e.target.value; saveSettings(); applyVolume(); });

function renderSoundList() {
  const list = $('sound-list');
  list.innerHTML = '';
  for (const { id, title } of SOUNDS) {
    const row = document.createElement('div');
    row.className = 'sound-row';
    row.innerHTML = `
      <div>
        <div class="title">${title}</div>
        <div class="src">${customNames[id] ? 'Eigene Datei: ' + escapeHtml(customNames[id]) : 'Standard'}</div>
      </div>
      <div class="actions">
        <button type="button" data-act="play">▶ Test</button>
        <label>Datei wählen…<input type="file" accept="audio/*"></label>
        ${customNames[id] ? '<button type="button" data-act="reset">Standard</button>' : ''}
      </div>`;
    row.querySelector('[data-act=play]').addEventListener('click', () => { unlockAudio(); playSound(id); });
    row.querySelector('input[type=file]').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await setCustomSound(id, file);
        playSound(id);
      } catch {
        alert('Diese Datei konnte nicht als Audio gelesen werden.');
      }
      renderSoundList();
    });
    const resetBtn = row.querySelector('[data-act=reset]');
    if (resetBtn) resetBtn.addEventListener('click', async () => { await clearCustomSound(id); renderSoundList(); });
    list.appendChild(row);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('reset-all').addEventListener('click', async () => {
  if (!confirm('Alle Einstellungen und eigenen Sounds zurücksetzen?')) return;
  settings = structuredClone(DEFAULTS);
  saveSettings();
  for (const { id } of SOUNDS) await clearCustomSound(id);
  applyUi();
  fillForm();
});

/* =========================================================
   Init
   ========================================================= */
applyUi();
loadCustomSounds();
