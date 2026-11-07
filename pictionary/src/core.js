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
    if (v === undefined) return localStorage.getItem('pictionary.' + k);
    if (v === null) localStorage.removeItem('pictionary.' + k); else localStorage.setItem('pictionary.' + k, v);
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

const ICON = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  vol: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  pen: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="M14 7.5l2.5 2.5"/>',
  eraser: '<path d="M8.5 20h11"/><path d="M5 15.5l9.5-9.5a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L13 18.5l-1.5 1.5h-3z"/><path d="M9.5 11l5.5 5.5"/>',
  fill: '<path d="M5 11.5l6.5-6.5 7 7-6.5 6.5a2 2 0 0 1-2.8 0L5 14.3a2 2 0 0 1 0-2.8z"/><path d="M4.5 12h14"/><path d="M20 15.5s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3z"/>',
  undo: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'
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
const SFX = {
  click: function () { tone(620, 0.05, 'triangle', 0.035); },
  join: function () { tone(660, 0.08, 'triangle', 0.05); tone(990, 0.1, 'triangle', 0.05, 0.07); },
  turn: function () { tone(880, 0.09, 'sine', 0.06); tone(1320, 0.14, 'sine', 0.05, 0.08); },
  msg: function () { tone(1200, 0.04, 'sine', 0.025); },
  close: function () { tone(700, 0.08, 'triangle', 0.05); tone(760, 0.1, 'triangle', 0.05, 0.08); },
  hint: function () { tone(990, 0.12, 'sine', 0.05); tone(1480, 0.18, 'sine', 0.04, 0.1); },
  correct: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.06, i * 0.08); }); },
  stumped: function () { tone(400, 0.25, 'sawtooth', 0.04, 0, 200); tone(260, 0.35, 'sawtooth', 0.04, 0.22, 140); },
  tick: function () { tone(1600, 0.03, 'square', 0.02); },
  win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.07, i * 0.12); }); }
};
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* optional */ } }

/* ---------- shared client state ---------- */
const S = {
  screen: 'home',          // 'home' | 'room'
  isHost: false,
  room: '', conn: 'idle', connMsg: '',
  me: null,
  st: null,                // latest state snapshot (room, roster, cfg, game view, deadlines)
  err: '', toast: '',
  name: store('name') || '',
  joinCode: '',
  confirm: null,
  sound: store('sound') !== '0',
  wantSeat: false, watchOnly: false,
  chat: [], chatTeam: false, form: { word: '', category: '', custom: '', hint: '', sugg: null, key: '' },
  gallery: { gameId: '', list: [] }
};
let render = function () {};
function setErr(e) { S.err = typeof e === 'string' ? e : ((e && e.message) || 'Something went wrong.'); try { console.warn(e); } catch (x) { /* ignore */ } render(); }
let toastTimer = null;
function toast(t) { S.toast = t; render(); clearTimeout(toastTimer); toastTimer = setTimeout(function () { S.toast = ''; render(); }, 2600); }
