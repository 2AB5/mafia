(function () {
'use strict';
const E = Engine;
const MINP = E.MIN_PLAYERS, MAXP = E.MAX_PLAYERS;

/* ================= helpers ================= */
function h(tag, props) {
  const el = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
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
const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function secureRng() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  catch (e) { return Math.random(); }
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('mafia.' + k);
    if (v === null) localStorage.removeItem('mafia.' + k); else localStorage.setItem('mafia.' + k, v);
  } catch (e) { /* storage may be unavailable */ }
  return null;
}
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
function hue(id) {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++) { x ^= id.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15;
  return ((x >>> 0) % 24) * 15;
}
function errText(e) {
  const c = e && e.code;
  if (c === 'invalid_argument') return 'That change was not allowed. You may need contributor access to this page.';
  if (c === 'resource_exhausted') return 'Too many requests at once. Wait a moment and try again.';
  if (c === 'quota_exceeded') return 'This page’s storage is full.';
  if (c === 'revoked') return 'Your access to this page changed. Reload to continue.';
  return 'Something went wrong. ' + ((e && e.message) || '');
}

/* ================= icons ================= */
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
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9"/><path d="M12 17h.01"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  skull: '<path d="M12 3.5c-4.3 0-7 2.8-7 6.4 0 2.2 1 3.7 2.5 4.6V18h9v-3.5c1.5-.9 2.5-2.4 2.5-4.6 0-3.6-2.7-6.4-7-6.4z"/><path d="M9.2 11h.01M14.8 11h.01M10.5 18v2M13.5 18v2"/>'
};
function icon(name, size) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  const n = size || 20;
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  return s;
}

/* ================= copy ================= */
const ROLE_TXT = {
  mafia:     { title: 'Mafia',     blurb: 'Each night your team picks someone to eliminate. By day, blend in and stay out of trouble.' },
  doctor:    { title: 'Doctor',    blurb: 'Each night, protect one player from the Mafia. You may protect yourself, but not the same person two nights in a row.' },
  police:    { title: 'Police',    blurb: 'Each night, investigate one player to learn whether they are Mafia. Use what you learn carefully.' },
  prankster: { title: 'Prankster', blurb: 'Each night, prank one player. Whatever power they tried to use that night fails.' },
  civilian:  { title: 'Civilian',  blurb: 'You have no night power. Your voice and your vote are your weapons.' }
};
const KIND_TXT = {
  kill:  { title: 'Choose a target', prompt: 'Pick who the Mafia eliminates tonight. If your team splits, the target is chosen at random between the picks.', btn: 'Lock in target' },
  save:  { title: 'Protect someone', prompt: 'Pick who you protect tonight.', btn: 'Lock in protection' },
  check: { title: 'Investigate', prompt: 'Pick who you investigate tonight. You learn whether they are Mafia at dawn.', btn: 'Lock in investigation' },
  prank: { title: 'Pull a prank', prompt: 'Pick who you prank tonight. Their night action will fail.', btn: 'Lock in prank' },
  vote:  { title: 'Cast your vote', prompt: 'Pick who should be voted out, or skip. Players who do not vote count as skipping.', btn: 'Cast vote' }
};
const HOW = [
  ['Goal', 'Town wins when every Mafia member is out. Mafia wins when it has as many players left as the town.'],
  ['Night', 'Everyone acts in secret at the same time. Mafia picks a victim, the Doctor protects, Police investigate, the Prankster blocks one player. Civilians just sleep, so nobody can tell who has a role.'],
  ['Day', 'The night’s result is announced. Talk it out, then vote. A player is voted out only if they have more votes than any other option. Skip and abstentions count together. Ties send nobody out.'],
  ['Roles', 'Mafia, Doctor, Police, Prankster and Civilians. The host picks which special roles are in play and what is revealed when someone is out.']
];

/* ================= sound ================= */
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
  night: function () { tone(196, 0.5, 'sine', 0.08); tone(147, 0.8, 'sine', 0.07, 0.25); },
  day:   function () { tone(392, 0.25, 'triangle', 0.07); tone(523, 0.4, 'triangle', 0.07, 0.18); },
  kill:  function () { tone(110, 0.45, 'sawtooth', 0.05); tone(82, 0.6, 'sawtooth', 0.04, 0.15); },
  vote:  function () { tone(330, 0.12, 'square', 0.035); tone(247, 0.2, 'square', 0.035, 0.1); },
  win:   function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.07, i * 0.14); }); },
  lose:  function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.35, 'sawtooth', 0.045, i * 0.18); }); }
};

/* ================= state ================= */
const S = {
  boot: true,
  online: false,
  db: null, user: null, me: null,
  canEdit: false, canWrite: null,
  mode: 'auto',               // 'auto' | 'local'
  pub: null, pubAt: 0, pubLoaded: false,
  roster: [],
  view: null,
  chats: {},
  err: '',
  name: store('name') || '',
  nameDraft: store('name') || '',
  sel: null, sent: null,
  roleOpen: true, roleSeenFor: '',
  confirm: null, rmSel: '',
  sound: store('sound') !== '0',
  lastKey: '',
  hostLost: false,
  busy: false
};
const L = { data: null };      // local pass-and-play game container (set in app2)
let render = function () {};   // assigned in app2
let renderDock = function () {}; // assigned in app2

function setErr(e) {
  S.err = typeof e === 'string' ? e : errText(e);
  try { console.error(e); } catch (x) { /* ignore */ }
  render();
}

/* ================= online layer ================= */
const H = { state: null, actions: {}, outbox: {}, q: Promise.resolve(), written: new Map(), loading: false, tick: null };

function isHost() { return !!(S.pub && S.me && S.pub.hostId === S.me); }
function inGame() { return !!(S.pub && S.pub.players && S.pub.players.some(function (p) { return p.id === S.me; })); }
function pubPlayer(id) { return S.pub && S.pub.players ? S.pub.players.find(function (p) { return p.id === id; }) : null; }
function nameOf(id) {
  const p = pubPlayer(id);
  if (p) return p.name;
  const r = S.roster.find(function (x) { return x.id === id; });
  if (r) return r.name || 'Player';
  return 'Player';
}

async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === 'unavailable') { await sleep(300 + Math.random() * 500); return await fn(); }
    throw e;
  }
}

async function initOnline() {
  let db = null, user = null;
  try {
    if (window.claude && window.claude.use) {
      const r = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      db = r[0]; user = r[1];
    }
  } catch (e) { db = null; }
  S.db = db; S.user = user;
  try {
    if (user) {
      S.me = await user.id();
      S.canEdit = !!(await user.canEdit());
      S.canWrite = await user.can('data.write');
    }
  } catch (e) { /* identity unavailable */ }
  S.online = !!(db && S.me);
  S.boot = false;
  if (!S.online) { render(); return; }

  const onErr = function (e) { setErr(e); };
  db.doc('game/public').onSnapshot(function (snap) {
    S.pub = snap.exists ? snap.data() : null;
    S.pubAt = Date.now();
    S.pubLoaded = true;
    onPub();
    render();
  }, onErr);
  db.collection('players').onSnapshot(function (snap) {
    S.roster = snap.docs.map(function (d) { const v = d.data() || {}; return { id: d.id, name: v.name || 'Player', ts: v.ts || 0 }; })
      .sort(function (a, b) { return a.ts - b.ts || (a.id < b.id ? -1 : 1); });
    render();
  }, onErr);
  db.doc('views/' + S.me).onSnapshot(function (snap) {
    S.view = snap.exists ? snap.data() : null;
    render();
  }, onErr);
  db.collection('chat').onSnapshot(function (snap) {
    const m = {};
    snap.docs.forEach(function (d) { m[d.id] = d.data(); });
    S.chats = m;
    renderDock();
  }, onErr);
  if (S.canEdit) {
    db.collection('actions').onSnapshot(function (snap) {
      const m = {};
      snap.docs.forEach(function (d) { m[d.id] = d.data(); });
      H.actions = m;
      if (isHost() && H.state) hostEnqueue(hostIngest);
    }, onErr);
    db.collection('outbox').onSnapshot(function (snap) {
      const m = {};
      snap.docs.forEach(function (d) { m[d.id] = d.data(); });
      H.outbox = m;
      if (isHost() && H.state) hostEnqueue(hostIngest);
    }, onErr);
  }
  render();
}

function onPub() {
  if (!isHost()) { H.state = null; return; }
  if (!H.tick) H.tick = setInterval(hostTick, 1000);
  if (S.pub.phase === 'lobby') { H.state = null; return; }
  if (!H.state && !H.loading) {
    H.loading = true;
    hostEnqueue(loadHostState);
  }
}

/* ---------- player-side writes ---------- */
async function joinTable(rawName) {
  let nm = cleanName(rawName);
  if (!nm) { setErr('Enter a name to take a seat.'); return; }
  const taken = {};
  S.roster.forEach(function (r) { if (r.id !== S.me) taken[r.name.toLowerCase()] = true; });
  let base = nm, i = 2;
  while (taken[nm.toLowerCase()]) { nm = base.slice(0, 13) + ' ' + i; i++; }
  S.name = nm; S.nameDraft = nm; store('name', nm);
  try {
    await withRetry(function () { return S.db.doc('players/' + S.me).set({ name: nm, ts: Date.now() }); });
  } catch (e) { setErr(e); }
}
async function leaveTable() {
  try { await withRetry(function () { return S.db.doc('players/' + S.me).delete(); }); }
  catch (e) { setErr(e); }
}
async function sendAction(view, a) {
  const key = view.gameId + ':' + view.key;
  const body = { key: key, t: a.t, ts: Date.now() };
  if (a.to) body.to = a.to;
  await withRetry(function () { return S.db.doc('actions/' + S.me).set(body); });
}

const chatQ = {};
function chatWrite(path, field, msg, cap) {
  const prev = chatQ[path] || Promise.resolve();
  const next = prev.catch(function () {}).then(function () {
    return S.db.doc(path).get().then(function (snap) {
      const cur = snap.exists && Array.isArray((snap.data() || {})[field]) ? snap.data()[field].slice() : [];
      cur.push(msg);
      const body = { name: S.name || 'Player' };
      body[field] = cur.slice(-cap);
      return S.db.doc(path).set(body);
    });
  });
  chatQ[path] = next;
  return next;
}
async function sendChat(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text || !S.online) return;
  const dead = inGame() && pubPlayer(S.me) && !pubPlayer(S.me).alive;
  const msg = { t: Date.now(), x: text };
  if (dead) msg.g = 1;
  try { await chatWrite('chat/' + S.me, 'msgs', msg, 60); } catch (e) { setErr(e); }
}
async function sendMafiaChat(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text || !S.online) return;
  try { await chatWrite('outbox/' + S.me, 'msgs', { t: Date.now(), x: text }, 30); } catch (e) { setErr(e); }
}

/* ---------- host runtime ---------- */
function hostEnqueue(fn) {
  H.q = H.q.then(fn).catch(function (e) { setErr(e); });
  return H.q;
}
async function hostWrite(path, obj, force) {
  const json = JSON.stringify(obj);
  if (!force && H.written.get(path) === json) return;
  await withRetry(function () { return S.db.doc(path).set(JSON.parse(json)); });
  H.written.set(path, json);
}
async function hostCommit(force) {
  const st = H.state;
  if (!st) return;
  await hostWrite('hoststate/s', st, force);
  for (let i = 0; i < st.players.length; i++) {
    await hostWrite('views/' + st.players[i].id, E.playerView(st, st.players[i].id), force);
  }
  const pv = E.publicView(st);
  pv.hostId = S.me;
  pv.hostName = S.name || '';
  pv.at = Date.now();
  await hostWrite('game/public', pv, true);
}
async function loadHostState() {
  try {
    const snap = await withRetry(function () { return S.db.doc('hoststate/s').get(); });
    if (snap.exists && isHost()) {
      H.state = clone(snap.data());
      S.hostLost = false;
      H.written.clear();
      await hostCommit(true);
      await hostIngest();
    } else if (isHost()) {
      S.hostLost = true;
    }
  } finally {
    H.loading = false;
    render();
  }
}
async function deleteAll(coll) {
  const snap = await withRetry(function () { return S.db.collection(coll).get(); });
  for (let i = 0; i < snap.docs.length; i++) {
    const id = snap.docs[i].id;
    await withRetry(function () { return S.db.doc(coll + '/' + id).delete(); });
  }
}
function hostOpenLobby(keepCfg) {
  return hostEnqueue(async function () {
    H.state = null;
    H.written.clear();
    S.hostLost = false;
    const cfg = keepCfg && S.pub ? S.pub.cfg : null;
    const pub = {
      v: 1, gameId: newId(), hostId: S.me, hostName: S.name || '', phase: 'lobby', round: 0, key: 'L0',
      cfg: E.normalizeConfig(cfg), players: [], pending: [], dl: null, log: [], ballot: null,
      winner: null, recap: null, seq: 0, at: Date.now()
    };
    // Close the old table first so nobody keeps acting on stale data.
    await withRetry(function () { return S.db.doc('game/public').set(pub); });
    await deleteAll('actions');
    await deleteAll('views');
    await deleteAll('outbox');
    await deleteAll('chat');
    await withRetry(function () { return S.db.doc('hoststate/s').delete(); });
    S.view = null; S.sent = null; S.sel = null;
  });
}
function hostSetCfg(patch) {
  return hostEnqueue(async function () {
    if (!S.pub || S.pub.phase !== 'lobby' || !isHost()) return;
    const cfg = E.normalizeConfig(Object.assign({}, S.pub.cfg, patch));
    await withRetry(function () { return S.db.doc('game/public').update({ cfg: cfg, at: Date.now() }); });
  });
}
function hostStart() {
  return hostEnqueue(async function () {
    if (!S.pub || S.pub.phase !== 'lobby' || !isHost()) return;
    const roster = S.roster.slice();
    if (roster.length < MINP) { S.err = 'You need at least ' + MINP + ' players.'; render(); return; }
    if (roster.length > MAXP) { S.err = 'The table holds ' + MAXP + ' players. Remove ' + (roster.length - MAXP) + '.'; render(); return; }
    const st = E.newGame({
      gameId: S.pub.gameId,
      players: roster.map(function (r) { return { id: r.id, name: r.name }; }),
      cfg: S.pub.cfg, rng: secureRng, now: Date.now()
    });
    H.state = st;
    H.written.clear();
    S.hostLost = false;
    await hostCommit(true);
    await hostIngest();
  });
}
async function hostIngest() {
  const st = H.state;
  if (!st || st.phase === 'over' || !isHost()) return;
  const key = st.gameId + ':' + E.phaseKey(st);
  let subChanged = false, chatChanged = false;
  st.players.forEach(function (p) {
    if (!p.alive) return;
    const a = H.actions[p.id];
    if (!a || a.key !== key) return;
    const cur = st.sub[p.id];
    if (cur && cur.t === a.t && (cur.to || null) === (a.to || null)) return;
    if (E.submit(st, p.id, { t: a.t, to: a.to }).ok) subChanged = true;
  });
  st.players.forEach(function (m) {
    if (m.role !== 'mafia' || !m.alive) return;
    const d = H.outbox[m.id];
    if (!d || !Array.isArray(d.msgs)) return;
    const last = st.relay[m.id] || 0;
    let maxT = last;
    d.msgs.forEach(function (x) {
      if (!x || typeof x.x !== 'string' || typeof x.t !== 'number' || x.t <= last) return;
      if (x.t > maxT) maxT = x.t;
      if (st.phase !== 'night') return;
      const txt = x.x.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (txt) { st.mafiaChat.push({ f: m.id, t: x.t, x: txt }); chatChanged = true; }
    });
    if (maxT !== last) { st.relay[m.id] = maxT; chatChanged = true; }
  });
  if (st.mafiaChat.length > 80) st.mafiaChat.splice(0, st.mafiaChat.length - 80);
  if (subChanged && E.ready(st)) E.advance(st, secureRng, Date.now());
  if (subChanged || chatChanged) await hostCommit();
}
function hostForce() {
  return hostEnqueue(async function () {
    const st = H.state;
    if (!st || st.phase === 'over' || !isHost()) return;
    E.advance(st, secureRng, Date.now());
    await hostCommit();
  });
}
function hostTick() {
  const st = H.state;
  if (!st || !isHost() || st.phase === 'over' || !st.dl) return;
  if (Date.now() >= st.dl) {
    hostEnqueue(async function () {
      const s = H.state;
      if (!s || s.phase === 'over' || !s.dl || Date.now() < s.dl) return;
      E.advance(s, secureRng, Date.now());
      await hostCommit();
    });
  }
}
function hostRemove(id) {
  return hostEnqueue(async function () {
    if (!isHost()) return;
    const st = H.state;
    if (!st) {
      await withRetry(function () { return S.db.doc('players/' + id).delete(); });
      return;
    }
    if (!E.removePlayer(st, id)) return;
    if (st.phase !== 'over' && E.ready(st)) E.advance(st, secureRng, Date.now());
    await hostCommit();
  });
}
