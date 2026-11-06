/* ===== core: helpers, sound, shared state ===== */
function h(tag, props) {
  const el = document.createElement(tag);
  if (props) Object.keys(props).forEach(function (k) {
    const v = props[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  });
  for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el) {
  for (let i = 1; i < arguments.length; i++) {
    const kid = arguments[i];
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(el, k); }); continue; }
    el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  }
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function secureRng() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }
function randId(n) { const abc = 'abcdefghijkmnopqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < n; i++) s += abc[Math.floor(secureRng() * abc.length)]; return s; }
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function newRoomCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_ABC[Math.floor(secureRng() * CODE_ABC.length)]; return s; }
function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('penfight.' + k);
    if (v === null) localStorage.removeItem('penfight.' + k); else localStorage.setItem('penfight.' + k, v);
  } catch (e) { /* storage unavailable */ }
  return null;
}
function storeJSON(k, v) {
  if (v === undefined) { try { return JSON.parse(store(k) || 'null'); } catch (e) { return null; } }
  store(k, v === null ? null : JSON.stringify(v));
  return null;
}
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14); }
function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return x >>> 0; }
function validSkin(id) { return PF.SKINS.some(function (s) { return s.id === id; }); }

const ICON = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  vol: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>'
};
function icon(name, size) {
  const s = document.createElement('span');
  s.className = 'ico'; s.setAttribute('aria-hidden', 'true');
  const n = size || 20;
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  return s;
}

/* ---------- sound (synthesised, no files) ---------- */
let actx = null;
function ac() {
  if (!S.sound) return null;
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; }
}
function tone(freq, dur, type, vol, delay, slideTo) {
  const a = ac(); if (!a) return;
  try {
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* optional */ }
}
function clack(strength) {
  const a = ac(); if (!a) return;
  try {
    const t = a.currentTime, len = 0.05;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.4;
    const g = a.createGain(); g.gain.value = Math.min(0.5, 0.06 + strength * 0.5);
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
  } catch (e) { /* optional */ }
}
const SFX = {
  click: function () { tone(620, 0.05, 'triangle', 0.035); },
  join: function () { tone(660, 0.08, 'triangle', 0.05); tone(990, 0.1, 'triangle', 0.05, 0.07); },
  flick: function (p) { tone(220 + p * 260, 0.12, 'triangle', 0.05 + p * 0.05, 0, 900 + p * 600); clack(0.2 + p * 0.3); },
  hit: function (s) { clack(Math.min(1, s)); },
  fall: function () { tone(520, 0.45, 'sine', 0.07, 0, 90); tone(70, 0.25, 'triangle', 0.09, 0.42); },
  turn: function () { tone(880, 0.09, 'sine', 0.06); tone(1320, 0.14, 'sine', 0.05, 0.08); },
  round: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.06, i * 0.11); }); },
  win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.07, i * 0.12); }); }
};
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* optional */ } }

/* ---------- shared client state ---------- */
const S = {
  screen: 'home',          // 'home' | 'room' | 'local'
  isHost: false,
  room: '', conn: 'idle', connMsg: '',
  me: null,
  st: null,                // latest state snapshot (room, roster, cfg, match, deadline)
  frames: [],              // streamed poses while a shot is rolling
  aim: null,               // someone else's live aim
  err: '', toast: '',
  name: store('name') || '',
  skin: validSkin(store('skin')) ? store('skin') : '',
  joinCode: '',
  confirm: null,
  sound: store('sound') !== '0',
  floats: [],
  wantSeat: false
};
let render = function () {};
function setErr(e) { S.err = typeof e === 'string' ? e : ((e && e.message) || 'Something went wrong.'); try { console.warn(e); } catch (x) { /* ignore */ } render(); }
let toastTimer = null;
function toast(t) { S.toast = t; render(); clearTimeout(toastTimer); toastTimer = setTimeout(function () { S.toast = ''; render(); }, 2600); }
