'use strict';

/* =========================================================
   Settings
   ========================================================= */
const DEFAULTS = {
  a: { name: 'Daniel', color: '#e53935', key: 'a' },
  b: { name: 'Dennis', color: '#1e88e5', key: '#' },
  seconds: 5,
  target: 5,
  tick: true,
  volume: 0.8,
};
const NAME_SUGGESTIONS = ['Daniel', 'Dennis', 'Monika', 'Volker'];
const RESERVED_KEYS = ['Escape', 'Enter', 'Backspace', 'Tab', ' ', '0', '1'];
const STORAGE_KEY = 'buzzer.settings.v1';
const SCORE_KEY = 'buzzer.score.v1';

let settings = loadSettings();
let score = loadScore();

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

function freshScore() {
  return { a: 0, b: 0, revealed: false, history: [] };
}

function loadScore() {
  try {
    const s = JSON.parse(localStorage.getItem(SCORE_KEY));
    if (s && typeof s.a === 'number') return { ...freshScore(), ...s };
  } catch { /* ignore */ }
  return freshScore();
}

function saveScore() {
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(score)); } catch { /* ignore */ }
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

let state = 'idle';    // idle | locked | won
let pending = null;    // player whose buzz still awaits a verdict (0/1)
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
  renderScore();
}

function renderScore(newFor) {
  document.body.classList.toggle('score-on', score.revealed);
  const total = Math.max(settings.target, score.a, score.b);
  for (const p of ['a', 'b']) {
    const el = $('score-' + p);
    el.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('span');
      d.className = 'pt' + (i < score[p] ? ' on' : '');
      if (p === newFor && i === score[p] - 1) d.classList.add('new');
      el.appendChild(d);
    }
  }
  const line = $('s-score');
  if (line) line.textContent = `${settings.a.name} ${score.a} : ${score.b} ${settings.b.name}`;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function buzz(player) {
  if (state !== 'idle' || dialog.open) return;
  unlockAudio();
  state = 'locked';
  pending = player;
  const p = settings[player];

  playSound(player === 'a' ? 'buzzA' : 'buzzB');

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
      dots[n - i].classList.add('off', 'fading');
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
  if (overlay.classList.contains('show')) {
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    timers.push(setTimeout(() => overlay.classList.remove('hide'), 400));
  }
  if (state === 'locked') state = 'idle';
}

function judge(correct) {
  if (!pending || state === 'won') return;
  const p = pending;
  pending = null;
  release();

  score.revealed = true;
  score.history.push({ p, correct });
  if (correct) score[p]++;
  saveScore();
  renderScore(correct ? p : null);

  if (correct && score[p] >= settings.target) {
    timers.push(setTimeout(() => showWin(p), 900));
  }
}

function undo() {
  const last = score.history.pop();
  if (!last) return;
  if (last.correct) score[last.p]--;
  if (state === 'won') hideWin();
  release();
  pending = last.p; // allow re-judging that buzz
  saveScore();
  renderScore();
}

function showWin(p) {
  state = 'won';
  const w = $('win');
  w.style.setProperty('--win', settings[p].color);
  $('win-name').textContent = settings[p].name;
  w.classList.add('show');
}

function hideWin() {
  $('win').classList.remove('show');
  state = 'idle';
}

function newGame() {
  clearTimers();
  release();
  hideWin();
  pending = null;
  score = freshScore();
  saveScore();
  renderScore();
}

/* ---------- Input ---------- */
let listeningFor = null; // player id while recording a new key

document.addEventListener('keydown', e => {
  if (listeningFor) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopListening(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (RESERVED_KEYS.includes(k)) return;
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

  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  switch (k) {
    case 'Escape': e.preventDefault(); openSettings(); return;
    case '1': e.preventDefault(); judge(true); return;
    case '0': e.preventDefault(); judge(false); return;
    case 'Backspace': e.preventDefault(); undo(); return;
    case 'Enter': if (state === 'won') { e.preventDefault(); newGame(); } return;
  }
  if (k === settings.a.key) { e.preventDefault(); buzz('a'); }
  else if (k === settings.b.key) { e.preventDefault(); buzz('b'); }
}, true);

document.addEventListener('pointerdown', unlockAudio);

/* ---------- Hide mouse cursor when idle ---------- */
let cursorTimer = null;
function hideCursorSoon() {
  document.body.classList.remove('no-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    if (!dialog.open) document.body.classList.add('no-cursor');
  }, 1500);
}
document.addEventListener('mousemove', hideCursorSoon);
hideCursorSoon();

/* =========================================================
   Settings dialog
   ========================================================= */
function openSettings() {
  if (state === 'locked') release();
  fillForm();
  document.body.classList.remove('no-cursor');
  dialog.showModal();
}

function fillForm() {
  for (const p of ['a', 'b']) {
    $('s-name-' + p).value = settings[p].name;
    $('s-color-' + p).value = settings[p].color;
    $('s-key-' + p).textContent = keyLabel(settings[p].key);
  }
  $('s-seconds').value = settings.seconds;
  $('s-target').value = settings.target;
  $('s-tick').checked = settings.tick;
  $('s-volume').value = settings.volume;
  renderChips();
  renderScore();
  renderSoundList();
}

function setName(p, name) {
  settings[p].name = name.trim() || DEFAULTS[p].name;
  saveSettings();
  applyUi();
  renderChips();
}

function renderChips() {
  document.querySelectorAll('.chips').forEach(box => {
    const p = box.dataset.player;
    box.innerHTML = '';
    for (const n of NAME_SUGGESTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      if (settings[p].name === n) b.classList.add('active');
      b.addEventListener('click', () => { $('s-name-' + p).value = n; setName(p, n); });
      box.appendChild(b);
    }
  });
}

function stopListening() {
  if (!listeningFor) return;
  const btn = $('s-key-' + listeningFor);
  btn.classList.remove('listening');
  btn.textContent = keyLabel(settings[listeningFor].key);
  listeningFor = null;
}

$('settings-btn').addEventListener('click', openSettings);

dialog.addEventListener('cancel', e => { if (listeningFor) e.preventDefault(); });
dialog.addEventListener('close', () => { stopListening(); hideCursorSoon(); });

for (const p of ['a', 'b']) {
  $('s-name-' + p).addEventListener('input', e => setName(p, e.target.value));
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

function bindNumber(id, prop, min, max) {
  $(id).addEventListener('change', e => {
    const v = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || DEFAULTS[prop]));
    e.target.value = v;
    settings[prop] = v;
    saveSettings();
    renderScore();
  });
}
bindNumber('s-seconds', 'seconds', 1, 30);
bindNumber('s-target', 'target', 1, 20);
$('s-tick').addEventListener('change', e => { settings.tick = e.target.checked; saveSettings(); });
$('s-volume').addEventListener('input', e => { settings.volume = +e.target.value; saveSettings(); applyVolume(); });
$('new-game').addEventListener('click', newGame);

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
