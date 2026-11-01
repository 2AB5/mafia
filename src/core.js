/* ===== core: helpers, copy, sound, shared state ===== */
const E = Engine;
const MINP = E.MIN_PLAYERS, MAXP = E.MAX_PLAYERS;

function h(tag, props) {
  const el = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
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
  }
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
function secureRng() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  catch (e) { return Math.random(); }
}
function randId(n) {
  const abc = 'abcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(secureRng() * abc.length)];
  return s;
}
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function newRoomCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_ABC[Math.floor(secureRng() * CODE_ABC.length)]; return s; }
function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('mafia.' + k);
    if (v === null) localStorage.removeItem('mafia.' + k); else localStorage.setItem('mafia.' + k, v);
  } catch (e) { /* storage unavailable */ }
  return null;
}
function storeJSON(k, v) {
  if (v === undefined) { try { return JSON.parse(store(k) || 'null'); } catch (e) { return null; } }
  store(k, v === null ? null : JSON.stringify(v));
  return null;
}
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function cleanText(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 300); }
function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15;
  return x >>> 0;
}
function hue(id) { return (hash(String(id)) % 24) * 15; }

/* ---------- avatars ---------- */
const AVATARS = ['🦊', '🐺', '🦉', '🐱', '🦝', '🐍', '🦅', '🐻', '🐼', '🦁', '🐯', '🐸', '🐙', '🦇', '🐢', '🦜'];
function validAv(a) { return AVATARS.indexOf(a) !== -1; }

/* ---------- icons ---------- */
const ICON = {
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  mafia: '<path d="M3 16.5h18"/><path d="M6.5 16.5c0-5.2 1.6-9 5.5-9s5.5 3.8 5.5 9"/><path d="M6.9 13h10.2"/>',
  doctor: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
  police: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6L3.3 9.3l6.1-.7z"/>',
  prankster: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01"/><path d="M8 14.5c1 1.8 2.4 2.5 4 2.5s3-.7 4-2.5"/>',
  civilian: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
  vol: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0"/><path d="M12 19h.01"/>'
};
function icon(name, size) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  const n = size || 20;
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  return s;
}

/* ---------- copy ---------- */
const ROLE_TXT = {
  mafia:     { title: 'Mafia',     blurb: 'Each night your family picks someone to eliminate. By day, blend in and point fingers elsewhere.' },
  doctor:    { title: 'Doctor',    blurb: 'Each night, protect one player from the Mafia. You may protect yourself, but not the same person two nights in a row.' },
  police:    { title: 'Police',    blurb: 'Each night, investigate one player to learn whether they are Mafia. Share what you know carefully, or the Mafia will come for you.' },
  prankster: { title: 'Prankster', blurb: 'Each night, prank one player. Whatever power they tried to use that night fails. You are on the town’s side.' },
  civilian:  { title: 'Civilian',  blurb: 'No night power. Your voice and your vote are your weapons. Watch who lies.' }
};
const KIND_TXT = {
  kill:  { title: 'Choose a target', prompt: 'Pick who the Mafia eliminates tonight. If your family splits, the target is chosen at random between the picks.', btn: 'Lock in target' },
  save:  { title: 'Protect someone', prompt: 'Pick who you protect tonight.', btn: 'Lock in protection' },
  check: { title: 'Investigate', prompt: 'Pick who you investigate tonight. You learn the truth at dawn.', btn: 'Lock in investigation' },
  prank: { title: 'Pull a prank', prompt: 'Pick who you prank tonight. Their night action will fail.', btn: 'Lock in prank' },
  vote:  { title: 'Cast your vote', prompt: 'Pick who should be voted out, or skip. Players who do not vote count as skipping.', btn: 'Cast vote' }
};
const HOW = [
  ['Goal', 'Town wins when every Mafia member is out. Mafia wins once it has as many players left as the town.'],
  ['Night', 'Everyone acts in secret at the same time. The Mafia picks a victim, the Doctor protects, the Police investigate, the Prankster blocks one player. Civilians tap Sleep, so nobody can tell who has a role.'],
  ['Day', 'The night’s victim is revealed. Talk it out, then vote. A player is voted out only with more votes than any other option. Skips and missing votes count together, and ties send nobody out.'],
  ['Setup', 'One person creates a room and shares the code. Everyone joins on their own phone. 4 to 8 players. Play in the same room or on a voice call.']
];
const DEATH_LINES = [
  'was found face down by the harbour.',
  'never made it home from the card game.',
  'was last seen walking into the fog.',
  'was found with a single red rose on their chest.',
  'took a late-night phone call and never came back.',
  'was discovered in the empty theatre.',
  'went out for cigarettes. The cigarettes came back alone.',
  'was found sleeping with the fishes.'
];
const SAVED_LINES = [
  'The town wakes to a quiet morning. Everyone is still here.',
  'A scream in the night, but by morning everyone is accounted for.',
  'Someone came close to dying last night. Not close enough.'
];
const NIGHT_LINES = [
  'Close your eyes. The Mafia is awake.',
  'The streetlights flicker. Somebody is making a decision.',
  'The town sleeps. Not everyone will wake up.'
];
function pickLine(list, seed) { return list[hash(seed) % list.length]; }

/* ---------- sound ---------- */
let actx = null;
function tone(freq, dur, type, vol, delay) {
  if (!S.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* audio is optional */ }
}
const SFX = {
  click: function () { tone(520, 0.07, 'triangle', 0.04); },
  join:  function () { tone(660, 0.1, 'triangle', 0.05); tone(880, 0.12, 'triangle', 0.05, 0.08); },
  night: function () { tone(196, 0.6, 'sine', 0.08); tone(147, 0.9, 'sine', 0.07, 0.3); tone(110, 1.1, 'sine', 0.05, 0.6); },
  day:   function () { tone(392, 0.25, 'triangle', 0.07); tone(523, 0.4, 'triangle', 0.07, 0.18); tone(659, 0.5, 'triangle', 0.06, 0.36); },
  kill:  function () { tone(110, 0.5, 'sawtooth', 0.05); tone(82, 0.8, 'sawtooth', 0.045, 0.2); tone(55, 1, 'sine', 0.06, 0.4); },
  vote:  function () { tone(330, 0.12, 'square', 0.035); tone(247, 0.2, 'square', 0.035, 0.1); },
  flip:  function () { tone(300, 0.08, 'triangle', 0.05); tone(600, 0.25, 'triangle', 0.05, 0.08); },
  win:   function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.07, i * 0.14); }); },
  lose:  function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.35, 'sawtooth', 0.045, i * 0.18); }); }
};
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* optional */ } }

/* ---------- shared client state ---------- */
const S = {
  screen: 'home',            // 'home' | 'room' | 'local'
  isHost: false,
  room: '',
  conn: 'idle',              // 'idle' | 'connecting' | 'open' | 'lost' | 'failed'
  connMsg: '',
  me: null,                  // my player id in this room (null = not seated)
  pub: null, pubAt: 0,
  view: null,
  chat: [],
  err: '', toast: '',
  name: store('name') || '',
  av: validAv(store('av')) ? store('av') : '',
  joinCode: '',
  sel: null, sent: null,
  confirm: null, rmSel: '',
  sound: store('sound') !== '0',
  overlay: null, lastKey: '', lastGame: '', revealFor: '',
  wantSeat: false
};
let render = function () {};
let renderDock = function () {};
function setErr(e) {
  S.err = typeof e === 'string' ? e : ((e && e.message) || 'Something went wrong.');
  try { console.warn(e); } catch (x) { /* ignore */ }
  render();
}
let toastTimer = null;
function toast(t) {
  S.toast = t; render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { S.toast = ''; render(); }, 2600);
}
