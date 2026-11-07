/* ===== net: the host's browser runs the shuttle and the rules at 120 Hz and streams 30 frames a second.
   Each player moves their own figure locally (no lag) and sends positions and swings. ===== */
const PEER_PREFIX = 'badminton-court-v1-';
function hostPeerId(code) { return PEER_PREFIX + code.toLowerCase(); }
function peerOptions() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };
  let q = null;
  try { q = new URLSearchParams(location.search).get('peer'); } catch (e) { q = null; }
  if (q && /^[a-z0-9.\-]+:\d+$/i.test(q)) { const p = q.split(':'); o.host = p[0]; o.port = Number(p[1]); o.secure = location.protocol === 'https:'; o.path = '/'; }
  return o;
}
function hasPeer() { return typeof window.Peer === 'function'; }
const REACTIONS = ['😂', '😮', '🔥', '👏', '😤', '💀'];
const FRAME_MS = 33;
const KIND_CODE = ['', 'air', 'clear', 'lift', 'drop', 'net', 'smash', 'drive', 'push', 'serveLong', 'serveShort', 'serveFlick'];

/* ================= HOST ================= */
const H = {
  local: false, peer: null, room: '', myId: '', myToken: '', roster: [], cfg: BD.defaultConfig(),
  conns: new Map(), loop: null, hb: null, sendT: null, attempt: 0, fresh: true,
  acc: 0, last: 0, mvAt: {},
  // tournaments: two courts can run at once; quick matches use court 1
  mode: 'quick', tcfg: { kind: 'singles', format: 'knockout', target: 10 }, teams: [], tour: null, view: 1, courts: null
};
const RESULT_MS = 8000, CALL_MS = 8000;
function newCourt(n) { return { n: n, match: null, hist: [], evSent: 0, botMem: {}, frameAt: 0, key: '', fid: null, callAt: 0, reported: false, freeAt: 0 }; }
H.courts = [null, newCourt(1), newCourt(2)];
// H.match is the match on the court this screen is showing (court 1 for quick matches)
Object.defineProperty(H, 'match', { get: function () { const c = H.courts[H.view]; return c ? c.match : null; }, set: function (v) { H.courts[1].match = v; H.view = 1; } });
function courtOf(pid) { for (let c = 1; c <= 2; c++) { const m = H.courts[c].match; if (m && m.phase !== 'over' && m.players.some(function (p) { return p.id === pid && !p.left; })) return H.courts[c]; } return null; }
function matchOf(pid) { const c = courtOf(pid); return c ? c.match : null; }
function busyNow() { return H.tour ? !H.tour.done : !!(H.courts[1].match && H.courts[1].match.phase !== 'over'); }
function seatLimit() { return H.mode === 'tour' ? TR.MAX_ENTRIES : 4; }
/* which court a connection sees: the one they're playing on, else what they picked (0 = the bracket) */
function viewOf(pid, chosen) { const c = courtOf(pid); if (c) return c.n; if (!H.tour) return 1; return chosen === 1 || chosen === 2 ? chosen : 0; }
function hostUniqueName(nm, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.name.toLowerCase()] = true; });
  let base = cleanName(nm) || 'Player', out = base, i = 2;
  while (taken[out.toLowerCase()]) { out = base.slice(0, 11) + ' ' + i; i++; }
  return out;
}
function hostEnsureLoop() {
  if (!H.loop) { H.last = performance.now(); H.acc = 0; H.loop = setInterval(hostTick, 8); }
  if (!H.hb && !H.local) H.hb = setInterval(hostHeartbeat, 5000);
}
function hostCreate(name) {
  H.local = false; S.local = false;
  H.room = newRoomCode(); H.myToken = randId(16); H.myId = 'p' + randId(7);
  H.roster = [{ id: H.myId, token: H.myToken, name: cleanName(name) || 'Host', side: 0 }];
  H.cfg = BD.defaultConfig(); H.match = null; H.fresh = true; H.attempt = 0;
  hostBoot();
}
function hostResume(saved) {
  H.local = false; S.local = false;
  H.room = saved.room; H.myId = saved.myId; H.myToken = saved.myToken; H.roster = saved.roster || [];
  H.cfg = BD.normalizeConfig(saved.cfg); H.fresh = false; H.attempt = 0;
  H.mode = saved.mode === 'tour' ? 'tour' : 'quick'; H.tcfg = saved.tcfg || H.tcfg; H.teams = saved.teams || [];
  H.courts = [null, newCourt(1), newCourt(2)]; H.view = 1;
  H.tour = saved.tour || null;
  if (H.tour && saved.courts) saved.courts.forEach(function (sc, i) { const c = H.courts[i + 1]; c.fid = sc.fid; c.reported = sc.reported; c.match = sc.match; c.callAt = Date.now() + 3000; c.freeAt = Date.now() + 3000; c.evSent = sc.match ? sc.match.evN || 0 : 0; });
  else H.courts[1].match = saved.match || null;
  if (H.tour) H.view = 0;
  // pick each rally up again with a fresh serve
  [1, 2].forEach(function (n) { const m = H.courts[n].match; if (m && m.phase !== 'over') { m.phase = 'point'; m.phaseT = BD.POINT_PAUSE - 1.5; m.paused = null; } });
  hostBoot();
}
/* practice: you plus computer players, all on this phone */
function localBegin(name, format, level) {
  H.local = true; S.local = true; H.peer = null; H.conns.clear();
  H.room = ''; H.myToken = ''; H.myId = 'p' + randId(7);
  const names = BD.BOT_NAMES.slice().sort(function () { return secureRng() - 0.5; });
  const me = { id: H.myId, token: '', name: cleanName(name) || 'You', side: 0 };
  const bot = function (i, side) { return { id: 'b' + randId(6), token: '', name: names[i], side: side, bot: level }; };
  H.roster = format === '2v2' ? [me, bot(0, 0), bot(1, 1), bot(2, 1)] : format === '1v2' ? [me, bot(0, 1), bot(1, 1)] : [me, bot(0, 1)];
  H.cfg = BD.normalizeConfig(S.practiceCfg || { target: 10 });
  S.isHost = true; S.screen = 'room'; S.room = ''; S.me = H.myId; S.conn = 'open'; S.connMsg = '';
  hostEnsureLoop();
  hostStart();
}
function hostBoot() {
  S.isHost = true; S.screen = 'room'; S.room = H.room; S.me = H.myId; S.conn = 'connecting'; S.connMsg = '';
  setHash(H.room);
  hostSave();
  hostEnsureLoop();
  hostPublish();
  hostStartPeer();
}
function hostStartPeer() {
  if (!hasPeer()) { S.conn = 'failed'; S.connMsg = 'The online library did not load. Check your connection and reload.'; render(); return; }
  if (H.peer) { try { H.peer.destroy(); } catch (e) { /* ignore */ } }
  const peer = new Peer(hostPeerId(H.room), peerOptions());
  H.peer = peer;
  peer.on('open', function () { if (peer !== H.peer) return; H.attempt = 0; H.fresh = false; S.conn = 'open'; S.connMsg = ''; render(); });
  peer.on('connection', function (conn) { if (peer === H.peer) hostAttach(conn); });
  peer.on('disconnected', function () {
    if (peer !== H.peer || peer.destroyed) return;
    S.connMsg = 'Reconnecting to the lobby server… Players already here stay connected.'; render();
    setTimeout(function () { if (peer === H.peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* retry later */ } } }, 2000);
  });
  peer.on('error', function (e) {
    if (peer !== H.peer) return;
    const type = e && e.type;
    if (type === 'unavailable-id') {
      if (H.fresh && !H.match && H.roster.length <= 1 && H.attempt < 4) { H.attempt++; H.room = newRoomCode(); S.room = H.room; setHash(H.room); hostSave(); hostStartPeer(); return; }
      H.attempt++; S.connMsg = 'Reclaiming room ' + H.room + '… This can take up to a minute after a reload.'; render();
      setTimeout(function () { if (peer === H.peer) hostStartPeer(); }, 4000);
      return;
    }
    if (type === 'browser-incompatible') { S.conn = 'failed'; S.connMsg = 'This browser cannot host online games. Try Chrome, Safari or Firefox.'; render(); return; }
    if (type === 'peer-unavailable') return;
    S.connMsg = 'Cannot reach the lobby server. Retrying…'; render();
    setTimeout(function () { if (peer !== H.peer) return; if (peer.destroyed) hostStartPeer(); else if (peer.disconnected) { try { peer.reconnect(); } catch (x) { hostStartPeer(); } } }, 4000);
  });
}
function hostAttach(conn) {
  const rec = { conn: conn, token: null, pid: null, vname: '', last: Date.now(), lastReact: 0 };
  const key = conn.connectionId || (conn.peer + ':' + Math.random());
  H.conns.set(key, rec);
  conn.on('data', function (d) { rec.last = Date.now(); try { hostHandle(rec, d); } catch (e) { console.warn(e); } });
  const drop = function () { if (H.conns.get(key) === rec) { H.conns.delete(key); hostPublishSoon(); } };
  conn.on('close', drop);
  conn.on('error', function () { try { conn.close(); } catch (e) { /* ignore */ } drop(); });
}
function hostSend(rec, msg) { try { if (rec.conn.open) rec.conn.send(msg); } catch (e) { /* dropped */ } }
function hostEach(fn) { H.conns.forEach(function (rec) { if (rec.token) fn(rec); }); }
function hostHeartbeat() {
  const now = Date.now();
  H.conns.forEach(function (rec, key) { if (now - rec.last > 20000) { try { rec.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(key); hostPublishSoon(); } });
}
function inMatch(pid) { return !!(pid && courtOf(pid)); }
function hostHandle(rec, d) {
  if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
  if (d.t === 'ping') { hostSend(rec, { t: 'pong', c: d.c, h: H.match ? H.match.t : 0 }); return; }
  if (d.t === 'hello') {
    const tok = typeof d.token === 'string' ? d.token.slice(0, 40) : '';
    if (tok.length < 8) return;
    H.conns.forEach(function (o, k) { if (o !== rec && o.token === tok) { hostSend(o, { t: 'replaced' }); try { o.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(k); } });
    rec.token = tok; rec.vname = cleanName(d.name) || 'Guest';
    const r = H.roster.find(function (x) { return x.token === tok; });
    rec.pid = r ? r.id : null; if (r) rec.vname = r.name;
    hostSend(rec, hostSnapshot(rec.pid));
    hostPublishSoon();
    return;
  }
  if (!rec.token) return;
  if (d.t === 'sit') {
    if (busyNow()) { hostSend(rec, { t: 'err', msg: H.tour ? 'A tournament is on. You can watch, and join the next one.' : 'A game is on. You can join when it ends.' }); return; }
    let r = H.roster.find(function (x) { return x.token === rec.token; });
    if (r) r.name = hostUniqueName(d.name, r.id);
    else {
      if (H.roster.length >= seatLimit()) { hostSend(rec, { t: 'err', msg: H.mode === 'tour' ? 'The tournament is full (16 players).' : 'The court is full (4 players), so you’re watching. You can join when a spot opens.' }); return; }
      const c = sideCounts();
      r = { id: 'p' + randId(7), token: rec.token, name: '', side: c[0] <= c[1] ? 0 : 1 };
      if ((d.side === 0 || d.side === 1) && c[d.side] < 2) r.side = d.side;
      r.name = hostUniqueName(d.name, r.id);
      H.roster.push(r);
      SFX.join();
    }
    rec.pid = r.id; rec.vname = r.name;
    hostChanged();
    return;
  }
  if (d.t === 'view') { rec.view = Number(d.c) || 0; hostSend(rec, hostSnapshot(rec.pid, rec)); return; }
  if (d.t === 'leave') {
    if (busyNow() || !rec.pid || rec.pid === H.myId) return;
    const gone = rec.pid;
    H.roster = H.roster.filter(function (x) { return x.id !== gone; });
    H.conns.forEach(function (o) { if (o.pid === gone) o.pid = null; });
    hostChanged();
    return;
  }
  if (d.t === 'react') { const now = Date.now(); if (now - rec.lastReact < 700) return; rec.lastReact = now; hostReact(rec.pid ? (H.roster.find(function (r) { return r.id === rec.pid; }) || {}).name : rec.vname, d.e); return; }
  if (!rec.pid) return;
  if (d.t === 'side') { hostSetSide(rec.pid, d.side); return; }
  if (d.t === 'mv') { hostMove(rec.pid, Number(d.x), Number(d.y)); return; }
  if (d.t === 'brk') { const m = matchOf(rec.pid); if (m && BD.callBreak(m, rec.pid)) hostChanged(); return; }
  if (d.t === 'res') { const m = matchOf(rec.pid); if (m && BD.resumeBreak(m, rec.pid)) hostChanged(); return; }
  if (d.t === 'hit') { hostMove(rec.pid, Number(d.x), Number(d.y)); hostHit(rec.pid, d.b, d.a, Number(d.vt)); }
}
function sideCounts() { const c = [0, 0]; H.roster.forEach(function (r) { c[r.side]++; }); return c; }

/* ---------- lobby control ---------- */
function hostSetCfg(patch) { if (busyNow()) return; H.cfg = BD.normalizeConfig(Object.assign({}, H.cfg, patch)); hostChanged(); }
function hostSetMode(mode) { if (busyNow()) return; H.mode = mode === 'tour' ? 'tour' : 'quick'; if (H.tour && H.tour.done) H.tour = null; hostChanged(); }
function hostSetT(patch) {
  if (busyNow()) return;
  const t = Object.assign({}, H.tcfg, patch);
  H.tcfg = { kind: t.kind === 'doubles' ? 'doubles' : 'singles', format: t.format === 'league' ? 'league' : 'knockout', target: [2, 3, 5, 10, 15, 21].indexOf(t.target) !== -1 ? t.target : 10 };
  hostChanged();
}
/* doubles teams: kept pairs, plus anyone new paired up in the order they joined */
function teamsNow() {
  const ids = H.roster.map(function (r) { return r.id; }), used = {}, pairs = [];
  (H.teams || []).forEach(function (t) { if (t.length === 2 && ids.indexOf(t[0]) !== -1 && ids.indexOf(t[1]) !== -1 && !used[t[0]] && !used[t[1]]) { pairs.push(t.slice()); used[t[0]] = used[t[1]] = true; } });
  const rest = ids.filter(function (id) { return !used[id]; });
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return { pairs: pairs, spare: rest.length % 2 ? rest[rest.length - 1] : null };
}
function hostShuffleTeams() { if (busyNow()) return; H.teams = TR.pairUp(H.roster.map(function (r) { return r.id; }), secureRng).teams; hostChanged(); }
function hostSwapPlayers(a, b) {
  if (busyNow() || a === b) return;
  const t = teamsNow(); H.teams = t.pairs.map(function (p) { return p.map(function (x) { return x === a ? b : x === b ? a : x; }); });
  if (t.spare === a || t.spare === b) H.teams = H.teams.map(function (p) { return p.map(function (x) { return x === (t.spare === a ? b : a) ? t.spare : x; }); });
  hostChanged();
}
function hostSetSide(id, side) {
  if (busyNow() || (side !== 0 && side !== 1)) return;
  const r = H.roster.find(function (x) { return x.id === id; });
  if (!r || r.side === side) return;
  if (sideCounts()[side] >= 2) { if (id === H.myId) toast('That side already has 2 players.'); return; }
  r.side = side; hostChanged();
}
function hostAddBot(level) {
  if (busyNow() || H.roster.length >= seatLimit()) return;
  const used = {}; H.roster.forEach(function (r) { used[r.name] = true; });
  const free = BD.BOT_NAMES.filter(function (n) { return !used[n]; });
  const c = sideCounts();
  H.roster.push({ id: 'b' + randId(6), token: '', name: free.length ? free[Math.floor(secureRng() * free.length)] : hostUniqueName('Bot'), side: c[0] <= c[1] ? 0 : 1, bot: BD.LEVELS[level] ? level : 'normal' });
  hostChanged();
}
function hostCycleBot(id) {
  if (busyNow()) return;
  const r = H.roster.find(function (x) { return x.id === id && x.bot; }); if (!r) return;
  const order = ['easy', 'normal', 'hard']; r.bot = order[(order.indexOf(r.bot) + 1) % 3]; hostChanged();
}
function startProblem() {
  const c = sideCounts();
  if (H.roster.length < 2) return 'You need at least 2 players (or add a computer player).';
  if (!c[0] || !c[1]) return 'Both sides need a player.';
  if (c[0] > 2 || c[1] > 2) return 'Two players per side at most.';
  return '';
}
function tourProblem() {
  const n = H.roster.length;
  if (H.tcfg.kind === 'doubles') {
    if (n < 4) return 'Doubles needs at least 4 players (2 teams).';
    if (n % 2) return 'Odd number of players: add a computer player so everyone has a partner.';
  } else if (n < 2) return 'You need at least 2 players.';
  return '';
}
function hostStartTour() {
  const why = tourProblem(); if (why) { setErr(why); return; }
  const nm = function (id) { const r = H.roster.find(function (x) { return x.id === id; }); return r ? r.name : 'Player'; };
  const entries = H.tcfg.kind === 'doubles'
    ? teamsNow().pairs.map(function (p, i) { return { id: 'e' + i + p[0], name: nm(p[0]) + ' & ' + nm(p[1]), members: p }; })
    : H.roster.map(function (r) { return { id: 'e' + r.id, name: r.name, members: [r.id] }; });
  try { H.tour = TR.create({ entries: entries, format: H.tcfg.format, kind: H.tcfg.kind, courts: 2, rng: secureRng }); } catch (e) { setErr(e.message); return; }
  H.courts = [null, newCourt(1), newCourt(2)]; H.view = 0; H.mvAt = {};
  View.reset();
  hostTourAssign(3000);
  hostChanged();
}
/* put the next matches on free courts, with a short "you're up" countdown */
function hostTourAssign(delay) {
  const t = H.tour; if (!t || t.done) return;
  TR.assign(t).forEach(function (f) { const c = H.courts[f.court]; c.fid = f.id; c.callAt = Date.now() + (delay === undefined ? CALL_MS : delay); c.reported = false; });
}
function hostTourCreateMatch(c) {
  const t = H.tour, f = TR.byId(t, c.fid);
  const rosterOf = function (id) { return H.roster.find(function (r) { return r.id === id; }) || { id: id, name: 'Player' }; };
  const side = function (eid, s) { return TR.entry(t, eid).members.map(function (id) { const r = rosterOf(id); return { id: r.id, name: r.name, side: s, bot: r.bot }; }); };
  try { c.match = BD.newMatch({ players: side(f.a, 0).concat(side(f.b, 1)), cfg: { target: H.tcfg.target, games: 3 }, rng: secureRng }); }
  catch (e) { console.warn(e); TR.walkover(t, f.id, f.a); c.fid = null; return; }
  c.match.fid = f.id; c.match.court = c.n; c.match.round = f.roundName;
  c.hist = []; c.evSent = c.match.evN || 0; c.botMem = {}; c.key = '';
  const ids = c.match.players.map(function (p) { return p.id; });
  if (ids.indexOf(H.myId) !== -1) { H.view = c.n; View.reset(); }
  hostEach(function (rec) { if (ids.indexOf(rec.pid) !== -1) rec.view = c.n; });
}
function hostWalkover(fid, winner) {
  const t = H.tour; if (!t) return;
  const f = TR.byId(t, fid); if (!f || f.status === 'done') return;
  const c = f.court ? H.courts[f.court] : null;
  if (c && c.fid === fid && c.match && c.match.phase !== 'over') { c.match.phase = 'over'; c.match.winner = winner === f.a ? 0 : 1; c.match.walkover = true; }
  TR.walkover(t, fid, winner);
  if (c && c.fid === fid) { c.reported = true; c.freeAt = Date.now() + 2000; }
  hostChanged();
}
function hostEndTour() { H.tour = null; H.courts = [null, newCourt(1), newCourt(2)]; H.view = 1; View.reset(); hostChanged(); }
function hostView(c) { if (courtOf(H.myId)) return; H.view = c; View.reset(); hostPublish(); }
function hostStart() {
  if (H.mode === 'tour' && !H.local) { hostStartTour(); return; }
  const why = startProblem(); if (why) { setErr(why); return; }
  try {
    H.match = BD.newMatch({ players: H.roster.map(function (r) { return { id: r.id, name: r.name, side: r.side, bot: r.bot }; }), cfg: H.cfg, rng: secureRng });
  } catch (e) { setErr(e.message); return; }
  const c1 = H.courts[1]; c1.hist = []; c1.evSent = H.match.evN || 0; c1.botMem = {}; c1.key = ''; c1.fid = null;
  H.acc = 0; H.last = performance.now(); H.mvAt = {};
  View.reset();
  hostChanged();
}
function hostRematch() { if (H.tour || !H.match || H.match.phase !== 'over') return; hostStart(); }
function hostToLobby() { if (H.local) { hostClose(); return; } if (H.tour) { if (H.tour.done) hostEndTour(); return; } H.match = null; hostChanged(); }
function hostRemove(id) {
  if (id === H.myId) return;
  const pm = matchOf(id);
  if (pm) { BD.leave(pm, id); }
  else if (busyNow()) return;
  else {
    H.roster = H.roster.filter(function (x) { return x.id !== id; });
    H.conns.forEach(function (rec) { if (rec.pid === id) { rec.pid = null; hostSend(rec, { t: 'kicked' }); } });
  }
  hostChanged();
}
function hostEndGame() { if (H.tour) return; const m = H.courts[1].match; if (!m || m.phase === 'over') return; m.phase = 'over'; m.winner = m.score[0] === m.score[1] ? null : m.score[0] > m.score[1] ? 0 : 1; hostChanged(); }
function hostReact(name, e) {
  if (REACTIONS.indexOf(e) === -1) return;
  hostEach(function (rec) { hostSend(rec, { t: 'react', n: name, e: e }); });
  showReaction(name, e);
}

/* ---------- the real-time part ---------- */
function hostMove(pid, x, y) {
  const m = matchOf(pid); if (!m) return;
  const now = performance.now(), dt = Math.min(0.25, (now - (H.mvAt[pid] || now - 33)) / 1000);
  H.mvAt[pid] = now;
  BD.moveTo(m, pid, x, y, dt);
}
function hostHit(pid, button, aim, vt) {
  const c = courtOf(pid); if (!c) return;
  const m = c.match;
  if (['clear', 'drop', 'smash'].indexOf(button) === -1) return;
  const a = Array.isArray(aim) ? [Number(aim[0]) || 0, Number(aim[1]) || 0] : [0, 0];
  // rewind: try the shuttle as the player saw it (up to 0.3 s ago), newest first
  const from = isFinite(vt) ? Math.max(m.t - 0.3, vt - 0.06) : m.t - 0.12;
  const past = c.hist.filter(function (h) { return h.t >= from; }).map(function (h) { return h.s; }).reverse();
  BD.swing(m, pid, button, a, secureRng, past);
}
function hostTick() {
  const now = performance.now();
  if (H.local && S.paused) { H.last = now; return; }
  const wall = Date.now();
  // tournament bookkeeping: start called matches, report finished ones, free courts
  if (H.tour) for (let n = 1; n <= 2; n++) {
    const c = H.courts[n];
    if (c.fid && !c.reported && (!c.match || c.match.fid !== c.fid) && wall >= c.callAt) { hostTourCreateMatch(c); hostChanged(); }
    if (c.match && c.match.fid === c.fid && c.match.phase === 'over' && !c.reported) {
      c.reported = true; c.freeAt = wall + RESULT_MS;
      const f = TR.byId(H.tour, c.fid);
      if (f && f.status !== 'done') TR.report(H.tour, f.id, c.match.winner === 0 ? f.a : f.b, c.match.games || []);
      hostChanged();
    }
    if (c.reported && c.fid && wall >= c.freeAt) { c.fid = null; hostTourAssign(); hostChanged(); }
  }
  let dtAcc = H.acc + Math.min(250, now - H.last); H.last = now;
  let steps = 0;
  while (dtAcc >= BD.DT * 1000 && steps < 40) {
    dtAcc -= BD.DT * 1000; steps++;
    for (let n = 1; n <= 2; n++) {
      const c = H.courts[n], m = c.match;
      if (!m || m.phase === 'over') continue;
      // the host's own figure follows its joystick
      { const me = BD.playerOf(m, H.myId); if (me && !me.left && !window.__bdAuto) { const t = Input.target(m, me, BD.DT); if (t) BD.moveTo(m, H.myId, t[0], t[1], BD.DT); } }
      if (steps % 2 === 1) m.players.forEach(function (p) {
        const auto = p.id === H.myId && window.__bdAuto;
        if ((!p.bot && !auto) || p.left) return;
        if (auto) p.bot = window.__bdAuto;
        const th = BD.botThink(m, p, secureRng, c.botMem[p.id] || (c.botMem[p.id] = {}));
        BD.botMove(m, p, th, BD.DT * 2);
        if (th.hit) BD.swing(m, p.id, th.hit.button, th.hit.aim, secureRng, []);
        if (auto) p.bot = null;
      });
      BD.step(m, BD.DT, secureRng);
      if (m.shuttle) { c.hist.push({ t: m.t, s: { x: m.shuttle.x, y: m.shuttle.y, z: m.shuttle.z, vx: m.shuttle.vx, vy: m.shuttle.vy, vz: m.shuttle.vz, held: m.shuttle.held } }); if (c.hist.length > 60) c.hist.splice(0, c.hist.length - 60); }
    }
  }
  H.acc = steps >= 40 ? 0 : dtAcc;
  // stream each court's frames to whoever is on or watching it
  for (let n = 1; n <= 2; n++) {
    const c = H.courts[n], m = c.match;
    if (!m) continue;
    if (now - c.frameAt >= FRAME_MS) {
      c.frameAt = now;
      const fr = hostFrame(m, c);
      if (!H.local) hostEach(function (rec) { if (viewOf(rec.pid, rec.view) === n) hostSend(rec, fr); });
      if (hostViewNow() === n) View.frame(fr, true);
    }
    const key = m.phase + ':' + m.score.join('-') + ':' + m.resetNo + ':' + (m.paused ? 'p' + (m.paused.count === null ? '' : 'c') : '') + ':' + (m.gameNo || 1);
    if (key !== c.key) { c.key = key; hostChanged(); }
  }
}
function hostViewNow() { const c = courtOf(H.myId); if (c) { H.view = c.n; return c.n; } return H.view; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function hostFrame(m, c) {
  const evs = m.events.filter(function (e) { return e.n > c.evSent; });
  if (evs.length) c.evSent = evs[evs.length - 1].n;
  const s = m.shuttle || { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  return {
    t: 'f', c: c.n, ts: r3(m.t), ph: m.phase, r: m.resetNo, sv: m.server, lh: m.lastHitTeam, rh: m.rallyHits,
    pz: m.paused ? [m.paused.by, Math.max(0, Math.round(m.paused.left)), m.paused.count === null ? -1 : Math.ceil(m.paused.count)] : null,
    s: [r3(s.x), r3(s.y), r3(s.z), r3(s.vx), r3(s.vy), r3(s.vz), s.held ? 1 : 0, m.landed ? 1 : 0],
    p: m.players.map(function (p) { return [r3(p.x), r3(p.y), Math.round(p.energy), Math.round(p.swing * 100), KIND_CODE.indexOf(p.swingKind || ''), p.hand === 'back' ? 1 : 0]; }),
    e: evs
  };
}
function hostChanged() { hostSaveSoon(); hostPublishSoon(); }
let saveT = null;
function hostSaveSoon() { if (!saveT) saveT = setTimeout(function () { saveT = null; hostSave(); }, 600); }
function hostSave() {
  if (!S.isHost || !H.room || H.local) return;
  const m = H.tour ? null : (H.courts[1].match ? Object.assign({}, H.courts[1].match, { events: [] }) : null);
  storeJSON('host', { room: H.room, myId: H.myId, myToken: H.myToken, roster: H.roster, cfg: H.cfg, match: m, mode: H.mode, tcfg: H.tcfg, teams: H.teams,
    tour: H.tour, courts: H.tour ? [1, 2].map(function (n) { const c = H.courts[n]; return { fid: c.fid, reported: c.reported, match: c.match ? Object.assign({}, c.match, { events: [] }) : null }; }) : null, savedAt: Date.now() });
}
function hostPublishSoon() { if (!H.sendT) H.sendT = setTimeout(hostPublish, 0); }
function hostOnline() {
  const on = {}; on[H.myId] = true;
  H.roster.forEach(function (r) { if (r.bot) on[r.id] = true; });
  H.conns.forEach(function (rec) { if (rec.pid && rec.conn.open) on[rec.pid] = true; });
  return on;
}
function hostViewers() {
  const seen = {}, out = [];
  H.conns.forEach(function (rec) {
    if (!rec.token || rec.pid || !rec.conn.open || seen[rec.token]) return;
    if (H.roster.some(function (r) { return r.token === rec.token; })) return;
    seen[rec.token] = true; out.push(rec.vname || 'Guest');
  });
  return out.slice(0, 50);
}
function slimMatch(m) {
  if (!m) return null;
  const c = Object.assign({}, m); c.events = []; c.log = m.log.slice(-6); return JSON.parse(JSON.stringify(c));
}
function tourSummary() {
  const t = H.tour; if (!t) return null;
  const courts = [1, 2].map(function (n) {
    const c = H.courts[n], m = c.match, f = c.fid ? TR.byId(t, c.fid) : null;
    return { n: n, fid: c.fid, round: f ? f.roundName : '', a: f ? f.a : null, b: f ? f.b : null, callIn: c.fid && (!m || m.fid !== c.fid) ? Math.max(0, c.callAt - Date.now()) : 0,
      live: m && f && m.fid === f.id ? { score: m.score.slice(), gamesWon: (m.gamesWon || [0, 0]).slice(), gameNo: m.gameNo || 1, phase: m.phase, winner: m.winner } : null };
  });
  return { t: JSON.parse(JSON.stringify(t)), courts: courts, standings: t.format === 'league' ? TR.standings(t) : null };
}
function hostSnapshot(pid, rec) {
  const on = hostOnline();
  const view = rec ? viewOf(pid, rec.view) : hostViewNow();
  const vm = view ? H.courts[view].match : null;
  return {
    t: 'state', you: pid || null, room: H.room, hostId: H.myId, local: H.local,
    roster: H.roster.map(function (r) { return { id: r.id, name: r.name, side: r.side, bot: r.bot || null, on: !!on[r.id] }; }),
    cfg: H.cfg, match: slimMatch(vm), view: view, viewers: H.local ? [] : hostViewers(),
    mode: H.mode, tcfg: H.tcfg, teams: H.mode === 'tour' && H.tcfg.kind === 'doubles' ? teamsNow() : null, tour: tourSummary()
  };
}
function hostPublish() {
  H.sendT = null;
  if (!H.local) H.conns.forEach(function (rec) { if (rec.token) hostSend(rec, hostSnapshot(rec.pid, rec)); });
  applyState(hostSnapshot(H.myId));
}
function hostClose() {
  try { if (H.peer) H.peer.destroy(); } catch (e) { /* ignore */ }
  H.peer = null; H.conns.clear(); H.courts = [null, newCourt(1), newCourt(2)]; H.view = 1; H.tour = null; H.mode = 'quick';
  clearInterval(H.loop); clearInterval(H.hb); H.loop = null; H.hb = null;
  if (!H.local) storeJSON('host', null);
  H.local = false; S.local = false; S.isHost = false;
  resetRoomState();
}

/* ================= PLAYER ================= */
const C = { peer: null, conn: null, token: '', attempts: 0, everOpen: false, lastMsg: 0, retryT: null, openT: null, hb: null, mvT: null };
function clientJoin(code, name, watch) {
  S.isHost = false; S.local = false; S.screen = 'room'; S.room = code; S.conn = 'connecting'; S.connMsg = 'Finding court ' + code + '…';
  S.name = cleanName(name); store('name', S.name);
  C.token = store('tok.' + code) || randId(16); store('tok.' + code, C.token);
  C.attempts = 0; C.everOpen = false; S.wantSeat = !watch; S.watchOnly = !!watch; store('watch.' + code, watch ? '1' : '');
  setHash(code);
  if (!C.hb) C.hb = setInterval(clientHeartbeat, 2000);
  if (!C.mvT) C.mvT = setInterval(clientSendMove, FRAME_MS);
  clientStartPeer();
  render();
}
function clientCleanup() {
  clearTimeout(C.retryT); clearTimeout(C.openT);
  try { if (C.conn) C.conn.close(); } catch (e) { /* ignore */ }
  try { if (C.peer) C.peer.destroy(); } catch (e) { /* ignore */ }
  C.conn = null; C.peer = null;
}
function clientStartPeer() {
  if (!hasPeer()) { clientFail('The online library did not load. Check your connection and reload.'); return; }
  clientCleanup();
  const peer = new Peer(peerOptions());
  C.peer = peer;
  peer.on('open', function () { if (peer === C.peer) clientConnect(); });
  peer.on('disconnected', function () { if (peer !== C.peer || peer.destroyed) return; setTimeout(function () { if (peer === C.peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* later */ } } }, 1500); });
  peer.on('error', function (e) {
    if (peer !== C.peer || S.conn === 'failed') return;
    const type = e && e.type;
    if (type === 'browser-incompatible') { clientFail('This browser cannot play online. Try Chrome, Safari or Firefox.'); return; }
    if (type === 'peer-unavailable') {
      if (!C.everOpen && C.attempts >= 3) { clientFail('Court ' + S.room + ' was not found. Check the code, and make sure the host still has the game open.'); return; }
      S.connMsg = C.everOpen ? 'The host went offline. Waiting for them to come back…' : 'Looking for court ' + S.room + '…';
      clientRetry(3000); return;
    }
    S.connMsg = 'Cannot reach the lobby server. Retrying…';
    clientRetry(3500, true);
  });
}
function clientConnect() {
  if (!C.peer || C.peer.destroyed || S.conn === 'failed') return;
  if (C.peer.disconnected) { try { C.peer.reconnect(); } catch (e) { /* ignore */ } clientRetry(2000); return; }
  C.attempts++;
  let conn;
  // unreliable, unordered channel: a late position is worthless, a fresh one is what matters
  try { conn = C.peer.connect(hostPeerId(S.room), { reliable: true, serialization: 'json' }); } catch (e) { clientRetry(3000, true); return; }
  C.conn = conn;
  clearTimeout(C.openT);
  C.openT = setTimeout(function () {
    if (conn === C.conn && !conn.open) {
      try { conn.close(); } catch (e) { /* ignore */ }
      C.conn = null;
      if (!C.everOpen && C.attempts >= 4) { clientFail('Could not connect to court ' + S.room + '. Some networks block direct connections: try switching between Wi-Fi and mobile data, then tap Try again.'); return; }
      S.connMsg = 'Still trying to reach the host…'; clientRetry(1000, true);
    }
  }, 15000);
  conn.on('open', function () {
    if (conn !== C.conn) return;
    clearTimeout(C.openT);
    C.everOpen = true; C.attempts = 0; C.lastMsg = Date.now();
    S.conn = 'open'; S.connMsg = '';
    conn.send({ t: 'hello', token: C.token, v: 1, name: S.name || '' });
    render();
  });
  conn.on('data', function (d) { if (conn !== C.conn) return; C.lastMsg = Date.now(); try { clientHandle(d); } catch (e) { console.warn(e); } });
  const lost = function () {
    if (conn !== C.conn) return;
    C.conn = null;
    if (S.conn === 'failed' || S.screen !== 'room' || S.isHost) return;
    S.conn = C.everOpen ? 'lost' : 'connecting'; S.connMsg = 'Connection lost. Reconnecting…';
    render(); clientRetry(1500);
  };
  conn.on('close', lost); conn.on('error', lost);
}
function clientRetry(ms, freshPeer) {
  clearTimeout(C.retryT);
  if (S.conn === 'open' && C.conn && C.conn.open) return;
  if (S.conn !== 'failed') { if (S.conn === 'open') S.conn = 'lost'; render(); }
  C.retryT = setTimeout(function () {
    if (S.conn === 'failed' || S.screen !== 'room' || S.isHost) return;
    if (freshPeer || !C.peer || C.peer.destroyed) clientStartPeer(); else clientConnect();
  }, ms);
}
function clientFail(msg) { clientCleanup(); S.conn = 'failed'; S.connMsg = msg; render(); }
function clientRetryNow() { C.attempts = 0; S.conn = 'connecting'; S.connMsg = 'Trying again…'; clientStartPeer(); render(); }
function clientHeartbeat() {
  if (S.isHost || S.screen !== 'room') return;
  if (S.conn === 'open' && C.conn && C.conn.open) {
    try { C.conn.send({ t: 'ping', c: performance.now() }); } catch (e) { /* ignore */ }
    if (Date.now() - C.lastMsg > 15000) { try { C.conn.close(); } catch (e) { /* ignore */ } }
  }
}
function clientSend(msg) {
  if (C.conn && C.conn.open) { try { C.conn.send(msg); return true; } catch (e) { /* fall through */ } }
  if (msg.t !== 'mv' && msg.t !== 'hit') toast('Not connected yet. Hang on a second.');
  return false;
}
function clientSendMove() {
  if (S.isHost || S.conn !== 'open' || !View.me) return;
  const me = View.me;
  if (me.x === C.sentX && me.y === C.sentY) return;
  C.sentX = me.x; C.sentY = me.y;
  clientSend({ t: 'mv', x: r3(me.x), y: r3(me.y) });
}
function clientHandle(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'f') { if (S.st && S.st.tour && d.c && d.c !== S.st.view) return; View.frame(d, false); return; }
  if (d.t === 'state') {
    applyState(d);
    if (S.me) S.wantSeat = false;
    if (S.wantSeat && (!d.match || d.match.phase === 'over') && !S.me && S.name) { S.wantSeat = false; clientSend({ t: 'sit', name: S.name }); }
    return;
  }
  if (d.t === 'pong') { View.pong(d); return; }
  if (d.t === 'react') { showReaction(d.n, d.e); return; }
  if (d.t === 'err') { toast(String(d.msg || 'The host refused that.').slice(0, 200)); return; }
  if (d.t === 'kicked') { S.wantSeat = false; toast('The host removed you from the court.'); return; }
  if (d.t === 'replaced') { clientFail('You opened this court in another tab or device. Continue there, or tap Try again to move back here.'); }
}
function clientLeave() {
  if (S.st && (!S.st.match || S.st.match.phase === 'over') && S.me) clientSend({ t: 'leave' });
  setTimeout(clientCleanup, 150);
  clearInterval(C.hb); C.hb = null; clearInterval(C.mvT); C.mvT = null;
  resetRoomState();
}

/* ================= shared ================= */
function setHash(code) { try { history.replaceState(null, '', code ? '#' + code : location.pathname + location.search); } catch (e) { /* ignore */ } }
function resetRoomState() {
  S.screen = 'home'; S.room = ''; S.conn = 'idle'; S.connMsg = ''; S.me = null; S.st = null; S.wantSeat = false;
  View.reset(); setHash(''); render();
}
let onStateHook = function () {};
function applyState(d) { const prev = S.st; S.st = d; S.me = d.you || null; View.state(d); onStateHook(prev, d); render(); }
const Net = {
  swing: function (button, aimIn) {
    const m = View.m, me = View.me; if (!m || (!me && !S.isHost)) return;
    const aim = aimIn || Input.aim();
    if (S.isHost) { hostHit(H.myId, button, aim, View.renderTs()); return; }
    clientSend({ t: 'hit', b: button, a: [r3(aim[0]), r3(aim[1])], x: r3(me.x), y: r3(me.y), vt: r3(View.renderTs()) });
  },
  pause: function () { if (S.isHost) { const m = matchOf(H.myId); if (m && BD.callBreak(m, H.myId)) hostChanged(); } else clientSend({ t: 'brk' }); },
  resume: function () { if (S.isHost) { const m = matchOf(H.myId); if (m && BD.resumeBreak(m, H.myId)) hostChanged(); } else clientSend({ t: 'res' }); },
  view: function (c) { if (S.isHost) hostView(c); else clientSend({ t: 'view', c: c }); },
  react: function (e) { if (S.isHost) hostReact(S.name || 'Host', e); else clientSend({ t: 'react', e: e }); },
  side: function (s) { if (S.isHost) hostSetSide(H.myId, s); else clientSend({ t: 'side', side: s }); },
  watch: function () { S.wantSeat = false; S.watchOnly = true; if (S.room) store('watch.' + S.room, '1'); if (!S.isHost) clientSend({ t: 'leave' }); },
  sit: function (name) { S.wantSeat = false; S.watchOnly = false; if (S.room) store('watch.' + S.room, ''); S.name = cleanName(name); store('name', S.name); if (!S.isHost) clientSend({ t: 'sit', name: S.name }); },
  leave: function () { if (S.isHost) hostClose(); else clientLeave(); }
};
