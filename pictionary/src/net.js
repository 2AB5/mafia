/* ===== net: rooms. The host's browser runs the game clock and relays drawing and chat; guessers never receive the word. ===== */
const PEER_PREFIX = 'pictionary-room-v1-';
function hostPeerId(code) { return PEER_PREFIX + code.toLowerCase(); }
function peerOptions() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };
  let q = null;
  try { q = new URLSearchParams(location.search).get('peer'); } catch (e) { q = null; }
  if (q && /^[a-z0-9.\-]+:\d+$/i.test(q)) { const p = q.split(':'); o.host = p[0]; o.port = Number(p[1]); o.secure = location.protocol === 'https:'; o.path = '/'; }
  return o;
}
function hasPeer() { return typeof window.Peer === 'function'; }
const REACTIONS = ['😂', '😮', '🔥', '👏', '🤔', '💀'];
const MAX_OPS = 8000, MAX_POINTS = 120000;

/* ================= HOST ================= */
const H = {
  peer: null, room: '', myId: '', myToken: '', roster: [], cfg: PC.defaultConfig(), game: null,
  ops: [], opsKey: '', points: 0, chat: [], chatId: 0, offlineSince: {},
  conns: new Map(), sendT: null, loop: null, hb: null, attempt: 0, fresh: true
};
function hostUniqueName(nm, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.name.toLowerCase()] = true; });
  let base = cleanName(nm) || 'Player', out = base, i = 2;
  while (taken[out.toLowerCase()]) { out = base.slice(0, 11) + ' ' + i; i++; }
  return out;
}
function hostEnsureLoop() {
  if (!H.loop) H.loop = setInterval(hostLoop, 200);
  if (!H.hb) H.hb = setInterval(hostHeartbeat, 5000);
}
function hostCreate(name) {
  H.room = newRoomCode(); H.myToken = randId(16); H.myId = 'p' + randId(7);
  H.roster = [{ id: H.myId, token: H.myToken, name: cleanName(name) || 'Host', team: 0 }];
  H.cfg = PC.defaultConfig(); H.game = null; H.ops = []; H.opsKey = ''; H.chat = []; H.fresh = true; H.attempt = 0;
  hostBoot();
}
function hostResume(saved) {
  H.room = saved.room; H.myId = saved.myId; H.myToken = saved.myToken; H.roster = saved.roster || [];
  H.cfg = PC.normalizeConfig(saved.cfg); H.game = saved.game || null; H.ops = saved.ops || []; H.opsKey = saved.opsKey || '';
  H.points = H.ops.reduce(function (a, o) { return a + (o.p ? o.p.length / 2 : 0); }, 0);
  H.chat = saved.chat || []; H.chatId = H.chat.length ? H.chat[H.chat.length - 1].id : 0;
  H.fresh = false; H.attempt = 0;
  // the clock kept running while the page was closed: give everyone a fresh deadline
  if (H.game && H.game.turn && H.game.phase !== 'over') {
    const t = H.game.turn, now = Date.now();
    if (H.game.phase === 'choose') t.chooseUntil = now + 20000;
    if (H.game.phase === 'draw') { const left = Math.max(20000, (t.drawUntil - t.drawStart) / 2); t.drawStart = now - ((t.drawUntil - t.drawStart) - left); t.drawUntil = now + left; }
    if (H.game.phase === 'reveal') t.revealUntil = now + 3000;
  }
  hostBoot();
}
function hostBoot() {
  S.isHost = true; S.screen = 'room'; S.room = H.room; S.me = H.myId; S.conn = 'connecting'; S.connMsg = '';
  S.chat = H.chat.filter(function (m) { return chatVisibleTo(m, H.myId); });
  setHash(H.room);
  hostSave();
  hostEnsureLoop();
  hostPublish();
  hostStartPeer();
  Board.load(H.opsKey, H.ops);
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
      if (H.fresh && !H.game && H.roster.length <= 1 && H.attempt < 4) { H.attempt++; H.room = newRoomCode(); S.room = H.room; setHash(H.room); hostSave(); hostStartPeer(); return; }
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
  const rec = { conn: conn, token: null, pid: null, vname: '', last: Date.now(), lastReact: 0, lastSay: 0, says: 0 };
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
function inGame(pid) { return !!(H.game && pid && H.game.players.some(function (p) { return p.id === pid && !p.left; })); }
function hostHandle(rec, d) {
  if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
  if (d.t === 'ping') { hostSend(rec, { t: 'pong' }); return; }
  if (d.t === 'hello') {
    const tok = typeof d.token === 'string' ? d.token.slice(0, 40) : '';
    if (tok.length < 8) return;
    H.conns.forEach(function (o, k) { if (o !== rec && o.token === tok) { hostSend(o, { t: 'replaced' }); try { o.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(k); } });
    rec.token = tok;
    rec.vname = cleanName(d.name) || 'Guest';
    const r = H.roster.find(function (x) { return x.token === tok; });
    rec.pid = r ? r.id : null;
    if (r) rec.vname = r.name;
    hostSend(rec, hostSnapshot(rec.pid));
    hostSend(rec, { t: 'chatlog', list: H.chat.filter(function (m) { return chatVisibleTo(m, rec.pid); }) });
    hostSend(rec, { t: 'ops', k: H.opsKey, o: H.ops });
    hostPublishSoon();
    return;
  }
  if (!rec.token) return;
  if (d.t === 'sync') { hostSend(rec, { t: 'ops', k: H.opsKey, o: H.ops }); return; }
  if (d.t === 'sit') {
    if (H.game && H.game.phase !== 'over') { hostSend(rec, { t: 'err', msg: 'A game is on. You can join when it ends.' }); return; }
    let r = H.roster.find(function (x) { return x.token === rec.token; });
    if (r) r.name = hostUniqueName(d.name, r.id);
    else {
      if (H.roster.length >= PC.MAX_PLAYERS) { hostSend(rec, { t: 'err', msg: 'The room is full (12 players), so you’re watching. A spot opens if someone leaves.' }); return; }
      r = { id: 'p' + randId(7), token: rec.token, name: '', team: d.team === 0 || d.team === 1 ? d.team : undefined };
      r.name = hostUniqueName(d.name, r.id);
      H.roster.push(r);
      hostRebalance();
      SFX.join();
    }
    rec.pid = r.id; rec.vname = r.name;
    hostChanged();
    return;
  }
  if (d.t === 'leave') {
    if ((H.game && H.game.phase !== 'over') || !rec.pid || rec.pid === H.myId) return;
    const gone = rec.pid;
    H.roster = H.roster.filter(function (x) { return x.id !== gone; });
    H.conns.forEach(function (o) { if (o.pid === gone) o.pid = null; });
    hostChanged();
    return;
  }
  if (d.t === 'react') { const now = Date.now(); if (now - rec.lastReact < 700) return; rec.lastReact = now; hostReact(rec.pid || null, rec.vname, d.e); return; }
  if (d.t === 'say') {
    const now = Date.now();
    if (now - rec.lastSay < 350) return;
    rec.lastSay = now;
    hostSay(rec.pid, rec.vname, d.x, !!d.team, rec);
    return;
  }
  if (!rec.pid) return;
  if (d.t === 'team') { hostSetTeam(rec.pid, d.team); return; }
  if (d.t === 'word') { hostWord(rec.pid, d.w, rec); return; }
  if (d.t === 'veto') { hostVeto(rec.pid, rec); return; }
  if (d.t === 'd') { hostDraw(rec.pid, d.k, d.o); }
}

/* ---------- host game control ---------- */
function hostRebalance() {
  const map = PC.balanceTeams(H.roster.map(function (r) { return { id: r.id, team: r.team }; }));
  H.roster.forEach(function (r) { r.team = map[r.id]; });
}
function hostSetCfg(patch) {
  if (H.game && H.game.phase !== 'over') return;
  H.cfg = PC.normalizeConfig(Object.assign({}, H.cfg, patch));
  hostChanged();
}
function hostSetTeam(id, team) {
  if ((H.game && H.game.phase !== 'over') || (team !== 0 && team !== 1)) return;
  const r = H.roster.find(function (x) { return x.id === id; });
  if (!r || r.team === team) return;
  r.team = team;
  hostChanged();
}
function hostShuffleTeams() {
  if (H.game && H.game.phase !== 'over') return;
  const ids = H.roster.map(function (r) { return r.id; });
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(secureRng() * (i + 1)); const x = ids[i]; ids[i] = ids[j]; ids[j] = x; }
  ids.forEach(function (id, i) { H.roster.find(function (r) { return r.id === id; }).team = i % 2; });
  hostChanged();
}
function teamCounts() { const c = [0, 0]; H.roster.forEach(function (r) { if (r.team === 0 || r.team === 1) c[r.team]++; }); return c; }
function startProblem() {
  const n = H.roster.length, c = teamCounts();
  if (n < PC.MIN_PLAYERS) return 'You need at least ' + PC.MIN_PLAYERS + ' players: 2 on each team.';
  if (c[0] < 2 || c[1] < 2) return 'Each team needs at least 2 players.';
  return '';
}
function hostStart() {
  const why = startProblem();
  if (why) { setErr(why); return; }
  try {
    H.game = PC.newGame({ players: H.roster.map(function (r) { return { id: r.id, name: r.name, team: r.team }; }), cfg: H.cfg, rng: secureRng, now: Date.now() });
  } catch (e) { setErr(e.message); return; }
  H.offlineSince = {};
  H.chat = []; H.chatId = 0;
  hostSys('Game on! ' + PC.TEAMS[H.game.turn.team].name + ' draws first.');
  hostNewBoard();
  hostChanged();
  hostEach(function (rec) { hostSend(rec, { t: 'chatlog', list: H.chat.filter(function (m) { return chatVisibleTo(m, rec.pid); }) }); });
  S.chat = H.chat.filter(function (m) { return chatVisibleTo(m, H.myId); });
}
function boardKey() { const g = H.game; return g && g.turn ? g.id + ':' + g.turn.n + ':' + (g.turn.vetoed ? 'v' : 'a') : ''; }
function hostNewBoard() {
  H.ops = []; H.points = 0; H.opsKey = boardKey();
  hostEach(function (rec) { hostSend(rec, { t: 'ops', k: H.opsKey, o: [] }); });
  Board.load(H.opsKey, []);
}
function hostWord(pid, w, rec) {
  const g = H.game;
  if (!g || !w || typeof w !== 'object') return;
  const err = PC.setWord(g, pid, { word: String(w.word || '').slice(0, 40), category: String(w.category || '').slice(0, 24), hint: String(w.hint || '').slice(0, 80) }, Date.now());
  if (err) { if (rec) hostSend(rec, { t: 'err', msg: err }); else toast(err); return; }
  hostSys(PC.nameOf(g, pid) + ' set the word. ' + PC.nameOf(g, g.turn.drawer) + ', start drawing!');
  hostNewBoard();
  hostChanged();
}
function hostVeto(pid, rec) {
  const g = H.game; if (!g) return;
  const err = PC.veto(g, pid, Date.now());
  if (err) { if (rec) hostSend(rec, { t: 'err', msg: err }); else toast(err); return; }
  hostSys(PC.nameOf(g, pid) + ' passed on that word. The ' + PC.TEAMS[g.turn.setTeam].name + ' picks another.');
  hostNewBoard();
  hostChanged();
}
function hostDraw(pid, key, ops) {
  const g = H.game;
  if (!g || g.phase !== 'draw' || g.turn.drawer !== pid || key !== H.opsKey || !Array.isArray(ops) || !ops.length) return;
  const clean = [];
  for (let i = 0; i < ops.length && i < 200; i++) { const o = Board.cleanOp(ops[i]); if (o) clean.push(o); }
  if (!clean.length) return;
  if (H.ops.length + clean.length > MAX_OPS || H.points > MAX_POINTS) return;
  const at = H.ops.length;
  clean.forEach(function (o) { H.ops.push(o); if (o.p) H.points += o.p.length / 2; });
  const msg = { t: 'd', k: H.opsKey, i: at, o: clean };
  hostEach(function (rec) { if (rec.pid !== pid) hostSend(rec, msg); });
  if (pid !== H.myId) Board.remote(H.opsKey, at, clean);
  H.dirtySave = true;
}
function hostReact(pid, vname, e) {
  if (REACTIONS.indexOf(e) === -1) return;
  const name = pid ? (H.roster.find(function (r) { return r.id === pid; }) || {}).name || vname : vname;
  const msg = { t: 'react', f: pid, n: name, e: e };
  hostEach(function (rec) { hostSend(rec, msg); });
  showReaction(name, e);
}

/* ---------- chat ---------- */
// audience: 'all', or a team number for team-only messages, or a player id for private notes
function chatVisibleTo(m, pid) {
  if (m.to === undefined || m.to === 'all') return true;
  if (typeof m.to === 'number') { const r = H.roster.find(function (x) { return x.id === pid; }); return !!r && r.team === m.to; }
  return m.to === pid;
}
function hostPush(m) {
  m.id = ++H.chatId; m.at = Date.now();
  if (m.to === undefined || typeof m.to === 'number') { H.chat.push(m); if (H.chat.length > 150) H.chat.splice(0, H.chat.length - 150); }
  hostEach(function (rec) { if (chatVisibleTo(m, rec.pid)) hostSend(rec, { t: 'chat', m: m }); });
  if (chatVisibleTo(m, H.myId)) onChat(m);
  H.dirtySave = true;
}
function hostSys(x, kind) { hostPush({ k: kind || 'sys', x: x }); }
function hostSay(pid, vname, text, teamOnly, rec) {
  const g = H.game, x = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!x) return;
  const r = pid ? H.roster.find(function (q) { return q.id === pid; }) : null;
  const playing = inGame(pid);
  const live = g && g.phase !== 'over';
  if (live && !playing) {
    const note = { k: 'note', x: 'Viewers can’t chat during a game, but reactions work!', to: pid || ('v:' + (rec ? rec.token : '')) };
    if (rec) hostSend(rec, { t: 'chat', m: Object.assign({ id: 0, at: Date.now() }, note) }); else onChat(note);
    return;
  }
  const name = r ? r.name : vname;
  const team = r ? r.team : null;
  if (!live) { hostPush({ k: 'chat', f: pid, n: name, tt: team, x: x, to: teamOnly && team !== null ? team : undefined }); return; }
  const before = g.phase, turn = g.turn;
  const res = PC.say(g, pid, x, Date.now());
  const priv = function (m) { m.to = pid; m.id = 0; m.at = Date.now(); if (rec) hostSend(rec, { t: 'chat', m: m }); else onChat(m); };
  if (res.kind === 'ignored') return;
  if (res.kind === 'blocked') { priv({ k: 'blocked', f: pid, n: name, tt: team, x: x, why: res.why }); return; }
  if (res.kind === 'correct') {
    hostPush({ k: 'correct', f: pid, n: name, tt: team, x: name + ' guessed the word! +' + res.points + ' to the ' + PC.TEAMS[turn.team].name + ' (' + res.secs + ' s)' });
    hostChanged();
    return;
  }
  if (res.kind === 'close') {
    hostPush({ k: 'guess', f: pid, n: name, tt: team, x: x });
    priv({ k: 'close', x: '“' + x + '” is really close!' });
    return;
  }
  if (res.kind === 'guess') { hostPush({ k: 'guess', f: pid, n: name, tt: team, x: x }); return; }
  // plain chat: the setting team (and anyone during "choose") can keep it to their team
  const opp = turn && team === turn.setTeam && before !== 'reveal';
  hostPush({ k: 'chat', f: pid, n: name, tt: team, opp: !!opp, x: x, to: teamOnly && team !== null ? team : undefined });
}

/* ---------- clock ---------- */
function hostOnline() {
  const on = {};
  on[H.myId] = true;
  H.conns.forEach(function (rec) { if (rec.pid && rec.conn.open) on[rec.pid] = true; });
  return on;
}
function hostLoop() {
  const g = H.game;
  if (H.dirtySave) { H.dirtySave = false; hostSaveSoon(); }
  if (!g || g.phase === 'over') return;
  const now = Date.now(), on = hostOnline();
  const online = {}; g.players.forEach(function (p) { online[p.id] = !!on[p.id]; });
  // a drawer who has been offline for a while loses the turn
  const t = g.turn;
  if (t && (g.phase === 'choose' || g.phase === 'draw')) {
    if (!on[t.drawer]) { if (!H.offlineSince[t.drawer]) H.offlineSince[t.drawer] = now; }
    else delete H.offlineSince[t.drawer];
    if (H.offlineSince[t.drawer] && now - H.offlineSince[t.drawer] > 15000) {
      PC.skipTurn(g, now, ' is offline, so the turn was skipped.');
      delete H.offlineSince[t.drawer];
      hostSys(PC.nameOf(g, t.drawer) + ' is offline, so the turn was skipped. The word was “' + t.word + '”.');
      hostChanged();
      return;
    }
  }
  const prevTurn = g.turnNo, prevPhase = g.phase;
  const ev = PC.tick(g, now, secureRng, online);
  if (!ev.length) return;
  ev.forEach(function (e) {
    if (e.k === 'auto') hostSys('Time’s up for the ' + PC.TEAMS[g.turn.setTeam].name + ', so the game picked a word. ' + PC.nameOf(g, g.turn.drawer) + ', start drawing!');
    else if (e.k === 'hint') hostSys('💡 Hint unlocked: ' + e.hint, 'hint');
    else if (e.k === 'letter') { /* the masked word updates by itself */ }
    else if (e.k === 'stumped') hostSys('⏰ Time’s up! Nobody got it. The word was “' + g.turn.word + '”. +' + PC.STUMP_POINTS + ' to the ' + PC.TEAMS[g.turn.setTeam].name + '.', 'stumped');
    else if (e.k === 'turn') hostSys('Turn ' + g.turnNo + ' of ' + g.totalTurns + ': ' + PC.nameOf(g, g.turn.drawer) + ' draws for the ' + PC.TEAMS[g.turn.team].name + '. The ' + PC.TEAMS[g.turn.setTeam].name + ' is choosing the word…', 'turn');
    else if (e.k === 'over') hostSys(g.winner === 'tie' ? 'Game over. It’s a tie!' : 'Game over. The ' + PC.TEAMS[g.winner].name + ' wins!', 'over');
  });
  if (g.turnNo !== prevTurn || (prevPhase === 'choose' && g.phase === 'draw')) hostNewBoard();
  hostChanged();
}
function hostSkip() {
  const g = H.game; if (!g) return;
  const t = g.turn;
  if (!PC.skipTurn(g, Date.now(), '’s turn was skipped by the host.')) return;
  hostSys('The host skipped ' + PC.nameOf(g, t.drawer) + '’s turn.' + (t.word ? ' The word was “' + t.word + '”.' : ''));
  hostChanged();
}
function hostRemove(id) {
  if (id === H.myId) return;
  if (H.game && H.game.phase !== 'over') {
    if (!PC.leave(H.game, id, Date.now())) return;
    hostSys(PC.nameOf(H.game, id) + ' was removed from the game.');
  } else {
    H.roster = H.roster.filter(function (x) { return x.id !== id; });
    H.conns.forEach(function (rec) { if (rec.pid === id) { rec.pid = null; hostSend(rec, { t: 'kicked' }); } });
  }
  hostChanged();
}
function hostEndGame() {
  const g = H.game; if (!g || g.phase === 'over') return;
  PC.finish(g, 'The host ended the game.');
  hostSys('The host ended the game.', 'over');
  hostChanged();
}
function hostRematch() { if (!H.game || H.game.phase !== 'over') return; hostStart(); }
function hostToLobby() { H.game = null; H.ops = []; H.opsKey = ''; hostChanged(); }
function hostClose() {
  try { if (H.peer) H.peer.destroy(); } catch (e) { /* ignore */ }
  H.peer = null; H.conns.clear(); H.game = null;
  clearInterval(H.loop); clearInterval(H.hb); H.loop = null; H.hb = null;
  storeJSON('host', null);
  S.isHost = false;
  resetRoomState();
}
function hostChanged() { hostSaveSoon(); hostPublishSoon(); }
let saveT = null;
function hostSaveSoon() { if (!saveT) saveT = setTimeout(function () { saveT = null; hostSave(); }, 400); }
function hostSave() {
  if (!S.isHost || !H.room) return;
  storeJSON('host', { room: H.room, myId: H.myId, myToken: H.myToken, roster: H.roster, cfg: H.cfg, game: H.game, ops: H.ops, opsKey: H.opsKey, chat: H.chat.slice(-60), savedAt: Date.now() });
}
function hostPublishSoon() { if (!H.sendT) H.sendT = setTimeout(hostPublish, 0); }
function hostViewers() {
  const seen = {}, out = [];
  H.conns.forEach(function (rec) {
    if (!rec.token || rec.pid || !rec.conn.open || seen[rec.token]) return;
    if (H.roster.some(function (r) { return r.token === rec.token; })) return;
    seen[rec.token] = true; out.push(rec.vname || 'Guest');
  });
  return out.slice(0, 50);
}
function hostSnapshot(pid) {
  const on = hostOnline(), g = H.game, now = Date.now();
  const spectator = !inGame(pid) && !(g && g.players.some(function (p) { return p.id === pid; }));
  const v = g ? PC.viewFor(g, pid, spectator) : null;
  let clock = null;
  if (g && g.turn && g.phase !== 'over') {
    const t = g.turn;
    clock = g.phase === 'choose' ? { left: Math.max(0, t.chooseUntil - now), total: (t.vetoed ? 25000 : g.cfg.chooseSecs * 1000) }
      : g.phase === 'draw' ? { left: Math.max(0, t.drawUntil - now), total: t.drawUntil - t.drawStart, el: now - t.drawStart }
      : { left: Math.max(0, t.revealUntil - now), total: PC.REVEAL_MS };
  }
  return {
    t: 'state', you: pid || null, room: H.room, hostId: H.myId,
    roster: H.roster.map(function (r) { return { id: r.id, name: r.name, team: r.team, on: !!on[r.id] }; }),
    cfg: H.cfg, game: v, clock: clock, viewers: hostViewers(), opsKey: H.opsKey
  };
}
function hostPublish() {
  H.sendT = null;
  H.conns.forEach(function (rec) { if (rec.token) hostSend(rec, hostSnapshot(rec.pid)); });
  applyState(hostSnapshot(H.myId));
}

/* ================= PLAYER ================= */
const C = { peer: null, conn: null, token: '', attempts: 0, everOpen: false, lastMsg: 0, retryT: null, openT: null, hb: null };
function clientJoin(code, name, watch) {
  S.isHost = false; S.screen = 'room'; S.room = code; S.conn = 'connecting'; S.connMsg = 'Finding room ' + code + '…';
  S.name = cleanName(name); store('name', S.name);
  C.token = store('tok.' + code) || randId(16); store('tok.' + code, C.token); store('lastRoom', code);
  C.attempts = 0; C.everOpen = false; S.wantSeat = !watch; S.watchOnly = !!watch; store('watch.' + code, watch ? '1' : '');
  setHash(code);
  if (!C.hb) C.hb = setInterval(clientHeartbeat, 4000);
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
  peer.on('disconnected', function () {
    if (peer !== C.peer || peer.destroyed) return;
    setTimeout(function () { if (peer === C.peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* later */ } } }, 1500);
  });
  peer.on('error', function (e) {
    if (peer !== C.peer || S.conn === 'failed') return;
    const type = e && e.type;
    if (type === 'browser-incompatible') { clientFail('This browser cannot play online. Try Chrome, Safari or Firefox.'); return; }
    if (type === 'peer-unavailable') {
      if (!C.everOpen && C.attempts >= 3) { clientFail('Room ' + S.room + ' was not found. Check the code, and make sure the host still has the game open.'); return; }
      S.connMsg = C.everOpen ? 'The host went offline. Waiting for them to come back…' : 'Looking for room ' + S.room + '…';
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
  try { conn = C.peer.connect(hostPeerId(S.room), { reliable: true, serialization: 'json' }); } catch (e) { clientRetry(3000, true); return; }
  C.conn = conn;
  clearTimeout(C.openT);
  C.openT = setTimeout(function () {
    if (conn === C.conn && !conn.open) {
      try { conn.close(); } catch (e) { /* ignore */ }
      C.conn = null;
      if (!C.everOpen && C.attempts >= 4) { clientFail('Could not connect to room ' + S.room + '. Some networks block direct connections: try switching between Wi-Fi and mobile data, then tap Try again.'); return; }
      S.connMsg = 'Still trying to reach the host…';
      clientRetry(1000, true);
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
  conn.on('close', lost);
  conn.on('error', lost);
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
    try { C.conn.send({ t: 'ping' }); } catch (e) { /* ignore */ }
    if (Date.now() - C.lastMsg > 15000) { try { C.conn.close(); } catch (e) { /* ignore */ } }
  }
}
function clientSend(msg) {
  if (C.conn && C.conn.open) { try { C.conn.send(msg); return true; } catch (e) { /* fall through */ } }
  if (msg.t !== 'd') toast('Not connected yet. Hang on a second.');
  return false;
}
function clientHandle(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'state') {
    applyState(d);
    if (S.me) S.wantSeat = false;
    if (S.wantSeat && (!d.game || d.game.phase === 'over') && !S.me && S.name) { S.wantSeat = false; clientSend({ t: 'sit', name: S.name }); }
    return;
  }
  if (d.t === 'd') { if (!Board.remote(d.k, d.i, d.o)) clientSend({ t: 'sync' }); return; }
  if (d.t === 'ops') { Board.load(d.k, d.o || []); return; }
  if (d.t === 'chat') { onChat(d.m); return; }
  if (d.t === 'chatlog') { S.chat = Array.isArray(d.list) ? d.list : []; Chat.redraw(); return; }
  if (d.t === 'react') { showReaction(d.n, d.e); return; }
  if (d.t === 'err') { toast(String(d.msg || 'The host refused that.').slice(0, 200)); return; }
  if (d.t === 'kicked') { S.wantSeat = false; toast('The host removed you from the room.'); return; }
  if (d.t === 'replaced') { clientFail('You opened this room in another tab or device. Continue there, or tap Try again to move back here.'); }
}
function clientLeave() {
  if (S.st && (!S.st.game || S.st.game.phase === 'over') && S.me) clientSend({ t: 'leave' });
  setTimeout(clientCleanup, 150);
  clearInterval(C.hb); C.hb = null;
  resetRoomState();
}

/* ================= shared ================= */
function setHash(code) { try { history.replaceState(null, '', code ? '#' + code : location.pathname + location.search); } catch (e) { /* ignore */ } }
function resetRoomState() {
  S.screen = 'home'; S.room = ''; S.conn = 'idle'; S.connMsg = ''; S.me = null; S.st = null; S.wantSeat = false; S.chat = [];
  Board.load('', []);
  setHash(''); render();
}
let onStateHook = function () {};
function applyState(d) {
  const prev = S.st;
  d.clockAt = Date.now();
  S.st = d; S.me = d.you || null;
  onStateHook(prev, d);
  render();
}
function onChat(m) {
  if (!m) return;
  S.chat.push(m); if (S.chat.length > 200) S.chat.splice(0, S.chat.length - 200);
  Chat.add(m);
}
const Net = {
  say: function (x, team) { if (S.isHost) hostSay(H.myId, S.name, x, team, null); else clientSend({ t: 'say', x: x, team: !!team }); },
  react: function (e) { if (S.isHost) hostReact(H.myId, S.name, e); else clientSend({ t: 'react', e: e }); },
  word: function (w) { if (S.isHost) hostWord(H.myId, w, null); else clientSend({ t: 'word', w: w }); },
  veto: function () { if (S.isHost) hostVeto(H.myId, null); else clientSend({ t: 'veto' }); },
  draw: function (key, ops) { if (S.isHost) hostDraw(H.myId, key, ops); else clientSend({ t: 'd', k: key, o: ops }); },
  team: function (t) { if (S.isHost) hostSetTeam(H.myId, t); else clientSend({ t: 'team', team: t }); },
  watch: function () { S.wantSeat = false; S.watchOnly = true; if (S.room) store('watch.' + S.room, '1'); if (!S.isHost) clientSend({ t: 'leave' }); },
  sit: function (name) {
    S.wantSeat = false; S.watchOnly = false; if (S.room) store('watch.' + S.room, '');
    S.name = cleanName(name); store('name', S.name);
    if (!S.isHost) clientSend({ t: 'sit', name: S.name });
  },
  leave: function () { if (S.isHost) hostClose(); else clientLeave(); }
};
