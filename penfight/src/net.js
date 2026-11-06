/* ===== net: rooms. The host's browser runs the physics and streams it; players send flicks. ===== */
const PEER_PREFIX = 'penfight-desk-v1-';
function hostPeerId(code) { return PEER_PREFIX + code.toLowerCase(); }
function peerOptions() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };
  let q = null;
  try { q = new URLSearchParams(location.search).get('peer'); } catch (e) { q = null; }
  if (q && /^[a-z0-9.\-]+:\d+$/i.test(q)) { const p = q.split(':'); o.host = p[0]; o.port = Number(p[1]); o.secure = location.protocol === 'https:'; o.path = '/'; }
  return o;
}
function hasPeer() { return typeof window.Peer === 'function'; }

/* ================= HOST (also runs one-device games) ================= */
const H = {
  local: false, peer: null, room: '', myId: '', myToken: '', roster: [], cfg: PF.defaultConfig(), match: null,
  sim: null, preShot: null, simClock: 0, frameClock: 0, deadline: 0, nextRoundAt: 0, offlineSince: {},
  conns: new Map(), sendT: null, loop: null, hb: null, attempt: 0, fresh: true, aim: null
};
function hostUniqueName(nm, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.name.toLowerCase()] = true; });
  let base = cleanName(nm) || 'Player', out = base, i = 2;
  while (taken[out.toLowerCase()]) { out = base.slice(0, 11) + ' ' + i; i++; }
  return out;
}
function hostUniqueSkin(skin, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.skin] = true; });
  if (validSkin(skin) && !taken[skin]) return skin;
  for (let i = 0; i < PF.SKINS.length; i++) if (!taken[PF.SKINS[i].id]) return PF.SKINS[i].id;
  return PF.SKINS[0].id;
}
function hostEnsureLoop() {
  if (!H.loop) { H.simClock = performance.now(); H.loop = setInterval(hostLoop, 16); }
  if (!H.hb && !H.local) H.hb = setInterval(hostHeartbeat, 5000);
}
function hostCreate(name, skin) {
  H.local = false;
  H.room = newRoomCode(); H.myToken = randId(16); H.myId = 'p' + randId(7);
  H.roster = [{ id: H.myId, token: H.myToken, name: cleanName(name) || 'Host', skin: validSkin(skin) ? skin : PF.SKINS[0].id }];
  H.cfg = PF.defaultConfig(); H.match = null; H.sim = null; H.fresh = true; H.attempt = 0;
  hostBoot();
}
function hostResume(saved) {
  H.local = false;
  H.room = saved.room; H.myId = saved.myId; H.myToken = saved.myToken; H.roster = saved.roster || [];
  H.cfg = PF.normalizeConfig(saved.cfg); H.match = saved.match || null; H.sim = null; H.fresh = false; H.attempt = 0;
  if (H.match && H.match.phase === 'roll') H.match.phase = 'aim';
  H.deadline = Date.now() + (H.cfg.turnSecs ? H.cfg.turnSecs * 1000 + 10000 : 0);
  H.nextRoundAt = Date.now() + 3000;
  hostBoot();
}
function hostBoot() {
  S.isHost = true; S.screen = 'room'; S.room = H.room; S.me = H.myId; S.conn = 'connecting'; S.connMsg = '';
  setHash(H.room);
  hostSave();
  hostEnsureLoop();
  hostPublish();
  hostStartPeer();
}
function localBegin(players, cfg) {
  H.local = true; H.peer = null; H.conns.clear();
  H.room = ''; H.myId = ''; H.roster = players.map(function (p, i) { return { id: 'L' + i, token: '', name: cleanName(p.name) || 'Player ' + (i + 1), skin: p.skin, team: p.team }; });
  H.cfg = PF.normalizeConfig(cfg);
  S.isHost = true; S.screen = 'local'; S.room = ''; S.conn = 'open';
  hostEnsureLoop();
  hostStart();
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
  const rec = { conn: conn, token: null, pid: null, last: Date.now(), lastReact: 0, lastAim: 0 };
  const key = conn.connectionId || (conn.peer + ':' + Math.random());
  H.conns.set(key, rec);
  conn.on('data', function (d) { rec.last = Date.now(); try { hostHandle(rec, d); } catch (e) { console.warn(e); } });
  const drop = function () { if (H.conns.get(key) === rec) { H.conns.delete(key); hostPublishSoon(); } };
  conn.on('close', drop);
  conn.on('error', function () { try { conn.close(); } catch (e) { /* ignore */ } drop(); });
}
function hostSend(rec, msg) { try { if (rec.conn.open) rec.conn.send(msg); } catch (e) { /* dropped */ } }
function hostBroadcast(msg, exceptPid) { H.conns.forEach(function (rec) { if (rec.token && rec.pid !== exceptPid) hostSend(rec, msg); }); }
function hostHeartbeat() {
  const now = Date.now();
  H.conns.forEach(function (rec, key) { if (now - rec.last > 20000) { try { rec.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(key); hostPublishSoon(); } });
}
function hostHandle(rec, d) {
  if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
  if (d.t === 'ping') { hostSend(rec, { t: 'pong' }); return; }
  if (d.t === 'hello') {
    const tok = typeof d.token === 'string' ? d.token.slice(0, 40) : '';
    if (tok.length < 8) return;
    H.conns.forEach(function (o, k) { if (o !== rec && o.token === tok) { hostSend(o, { t: 'replaced' }); try { o.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(k); } });
    rec.token = tok;
    const r = H.roster.find(function (x) { return x.token === tok; });
    rec.pid = r ? r.id : null;
    hostSend(rec, hostSnapshot(rec.pid));
    hostPublishSoon();
    return;
  }
  if (!rec.token) return;
  if (d.t === 'sit') {
    if (H.match) { hostSend(rec, { t: 'err', msg: 'A match is on. You can sit down when it ends.' }); return; }
    let r = H.roster.find(function (x) { return x.token === rec.token; });
    if (r) { r.name = hostUniqueName(d.name, r.id); r.skin = hostUniqueSkin(d.skin, r.id); }
    else {
      if (H.roster.length >= PF.MAX_PLAYERS) { hostSend(rec, { t: 'err', msg: 'The desk is full. Five players is the limit.' }); return; }
      r = { id: 'p' + randId(7), token: rec.token, name: '', skin: '' };
      r.name = hostUniqueName(d.name, r.id); r.skin = hostUniqueSkin(d.skin, r.id);
      H.roster.push(r);
      hostRebalance();
      SFX.join();
    }
    rec.pid = r.id;
    hostChanged();
    return;
  }
  if (d.t === 'leave') {
    if (H.match || !rec.pid || rec.pid === H.myId) return;
    H.roster = H.roster.filter(function (x) { return x.id !== rec.pid; });
    rec.pid = null; hostChanged();
    return;
  }
  if (!rec.pid) return;
  if (d.t === 'shoot') { hostShoot(rec.pid, d.s); return; }
  if (d.t === 'aim') { const now = Date.now(); if (now - rec.lastAim < 40) return; rec.lastAim = now; hostAim(rec.pid, d.a); return; }
  if (d.t === 'react') { const now = Date.now(); if (now - rec.lastReact < 600) return; rec.lastReact = now; hostReact(rec.pid, d.e); }
}

/* ---------- host game control ---------- */
function hostSetCfg(patch) {
  if (H.match) return;
  H.cfg = PF.normalizeConfig(Object.assign({}, H.cfg, patch));
  hostRebalance();
  hostChanged();
}
/* keep every seated player on a team (teams mode), balanced, honouring choices already made */
function hostRebalance() {
  if (!H.cfg.teams) return;
  const map = PF.balanceTeams(H.roster.map(function (r) { return { id: r.id, team: r.team }; }));
  H.roster.forEach(function (r) { r.team = map[r.id]; });
}
function hostSetTeam(id, team) {
  if (H.match || !H.cfg.teams || (team !== 0 && team !== 1)) return;
  const r = H.roster.find(function (x) { return x.id === id; });
  if (!r) return;
  const others = H.roster.filter(function (x) { return x.id !== id; });
  if (others.length && others.every(function (x) { return x.team === team; })) { toast('Each team needs at least one player.'); return; }
  r.team = team;
  hostChanged();
}
function hostArmTurn() { H.deadline = H.cfg.turnSecs ? Date.now() + H.cfg.turnSecs * 1000 : 0; H.aim = null; }
function hostStart() {
  const n = H.roster.length;
  if (n < PF.MIN_PLAYERS || n > PF.MAX_PLAYERS) { setErr('You need ' + PF.MIN_PLAYERS + ' to ' + PF.MAX_PLAYERS + ' players.'); return; }
  if (H.cfg.teams && n < 3) { setErr('Teams need at least 3 players.'); return; }
  hostRebalance();
  try {
    H.match = PF.newMatch({ players: H.roster.map(function (r) { return { id: r.id, name: r.name, skin: r.skin, team: r.team }; }), cfg: H.cfg, rng: secureRng });
  } catch (e) { setErr(e.message); return; }
  H.sim = null; H.offlineSince = {};
  hostArmTurn();
  hostChanged();
}
function hostShoot(pid, shot) {
  const m = H.match;
  if (!m || m.phase !== 'aim' || H.sim) return;
  const pre = clone(m);
  const sim = PF.beginShot(m, pid, shot);
  if (!sim) return;
  H.preShot = pre;
  H.sim = sim; H.simClock = performance.now(); H.frameClock = 0; H.aim = null;
  hostBroadcast({ t: 'aim', a: null });
  hostChanged();
}
function hostAim(pid, a) {
  const m = H.match;
  if (!m || m.phase !== 'aim' || m.turn !== pid) return;
  if (a) {
    const lx = Number(a.lx), dx = Number(a.dx), dy = Number(a.dy);
    if (!isFinite(lx) || !isFinite(dx) || !isFinite(dy)) return;
    a = { k: m.turnNo, lx: Math.max(-1, Math.min(1, lx)), dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)) };
  } else a = null;
  H.aim = a;
  if (!H.local) hostBroadcast({ t: 'aim', a: a }, pid);
  if (pid !== H.myId && !H.local) { S.aim = a; }
}
const REACTIONS = ['😂', '😱', '🔥', '👏', '😤', '💀'];
function hostReact(pid, e) {
  if (REACTIONS.indexOf(e) === -1) return;
  const msg = { t: 'react', f: pid, e: e };
  hostBroadcast(msg);
  showReaction(pid, e);
}
function hostSkip() {
  const m = H.match;
  if (!m || m.phase !== 'aim') return;
  PF.skipTurn(m, ' was skipped.');
  hostArmTurn(); hostChanged();
}
function hostRemove(id) {
  if (id === H.myId) return;
  if (H.match) {
    if (H.sim) return;                       // wait for the shot to settle
    const r = PF.forfeit(H.match, id);
    if (!r) return;
    if (r.roundOver) H.nextRoundAt = Date.now() + 3500;
    hostArmTurn();
  } else {
    H.roster = H.roster.filter(function (x) { return x.id !== id; });
    H.conns.forEach(function (rec) { if (rec.pid === id) { rec.pid = null; hostSend(rec, { t: 'kicked' }); } });
  }
  hostChanged();
}
function hostRematch() { if (!H.match || H.match.phase !== 'over') return; hostStart(); }
function hostToLobby() {
  if (H.local) { H.match = null; H.sim = null; hostStop(); S.isHost = false; S.st = null; S.screen = 'home'; render(); return; }
  H.match = null; H.sim = null; hostChanged();
}
function hostStop() { clearInterval(H.loop); clearInterval(H.hb); H.loop = null; H.hb = null; }
function hostClose() {
  try { if (H.peer) H.peer.destroy(); } catch (e) { /* ignore */ }
  H.peer = null; H.conns.clear(); H.match = null; H.sim = null;
  hostStop();
  storeJSON('host', null);
  S.isHost = false;
  resetRoomState();
}
function hostOnline() {
  const on = {};
  if (H.local) { H.roster.forEach(function (r) { on[r.id] = true; }); return on; }
  on[H.myId] = true;
  H.conns.forEach(function (rec) { if (rec.pid && rec.conn.open) on[rec.pid] = true; });
  return on;
}
function hostLoop() {
  const m = H.match;
  const now = performance.now();
  if (H.sim && m && m.phase === 'roll') {
    let steps = Math.floor((now - H.simClock) / (PF.DT * 1000));
    if (steps > 90) { steps = 90; H.simClock = now - 90 * PF.DT * 1000; }
    let fellAny = [];
    for (let i = 0; i < steps; i++) {
      const f = H.sim.step();
      if (f.length) fellAny = fellAny.concat(f);
      H.simClock += PF.DT * 1000;
      H.frameClock += PF.DT;
      if (H.sim.settled()) break;
    }
    const hits = H.sim.takeHits();
    if (H.frameClock >= 1 / 30 || fellAny.length || H.sim.settled()) {
      H.frameClock = 0;
      const poses = H.sim.poses(m).map(function (p) { return [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, Math.round(p.a * 1000) / 1000, p.out ? 1 : 0]; });
      const fr = { t: 'f', k: m.turnNo, p: poses, h: Math.round(hits * 100) / 100, fall: fellAny };
      if (!H.local) hostBroadcast(fr);
      onFrameEvents(fr);
    }
    if (H.sim.settled()) {
      const res = PF.settle(m, H.sim.poses(m));
      H.sim = null; H.preShot = null;
      if (res.roundOver) H.nextRoundAt = Date.now() + 3800;
      hostArmTurn();
      hostChanged();
    }
    return;
  }
  if (!m) return;
  const t = Date.now();
  if (m.phase === 'aim') {
    const on = hostOnline();
    if (!on[m.turn]) { if (!H.offlineSince[m.turn]) H.offlineSince[m.turn] = t; }
    else delete H.offlineSince[m.turn];
    const offFor = H.offlineSince[m.turn] ? t - H.offlineSince[m.turn] : 0;
    if ((H.deadline && t >= H.deadline) || offFor > 12000) {
      PF.skipTurn(m, offFor > 12000 ? ' is offline, so their turn was skipped.' : ' ran out of time.');
      hostArmTurn(); hostChanged();
    }
  } else if (m.phase === 'roundover' && t >= H.nextRoundAt) {
    PF.startRound(m, secureRng);
    hostArmTurn(); hostChanged();
  }
}
function hostChanged() { hostSave(); hostPublishSoon(); }
function hostSave() {
  if (H.local) return;
  if (!S.isHost || !H.room) return;
  storeJSON('host', { room: H.room, myId: H.myId, myToken: H.myToken, roster: H.roster, cfg: H.cfg, match: H.preShot || H.match, savedAt: Date.now() });
}
function hostPublishSoon() { if (!H.sendT) H.sendT = setTimeout(hostPublish, 0); }
function hostSnapshot(pid) {
  const on = hostOnline();
  const m = H.match;
  return {
    t: 'state', you: pid || null, local: H.local, room: H.room, hostId: H.myId,
    roster: H.roster.map(function (r) { return { id: r.id, name: r.name, skin: r.skin, team: H.cfg.teams ? r.team : null, on: !!on[r.id] }; }),
    cfg: H.cfg, match: m,
    deadlineIn: m && m.phase === 'aim' && H.deadline ? Math.max(0, H.deadline - Date.now()) : null,
    nextRoundIn: m && m.phase === 'roundover' ? Math.max(0, H.nextRoundAt - Date.now()) : null
  };
}
function hostPublish() {
  H.sendT = null;
  if (!H.local) H.conns.forEach(function (rec) { if (rec.token) hostSend(rec, hostSnapshot(rec.pid)); });
  const mine = hostSnapshot(H.local ? (H.match ? H.match.turn : null) : H.myId);
  if (mine.match) mine.match = clone(mine.match);       // a snapshot, so the screen can compare before/after
  applyState(mine);
}

/* ================= PLAYER ================= */
const C = { peer: null, conn: null, token: '', attempts: 0, everOpen: false, lastMsg: 0, retryT: null, openT: null, hb: null };
function clientJoin(code, name, skin) {
  S.isHost = false; S.screen = 'room'; S.room = code; S.conn = 'connecting'; S.connMsg = 'Finding room ' + code + '…';
  S.name = cleanName(name); S.skin = validSkin(skin) ? skin : '';
  store('name', S.name); if (S.skin) store('skin', S.skin);
  C.token = store('tok.' + code) || randId(16); store('tok.' + code, C.token); store('lastRoom', code);
  C.attempts = 0; C.everOpen = false; S.wantSeat = true;
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
    conn.send({ t: 'hello', token: C.token, v: 1 });
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
  if (msg.t !== 'aim') toast('Not connected yet. Hang on a second.');
  return false;
}
function clientHandle(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'state') {
    applyState(d);
    if (S.me) S.wantSeat = false;
    if (S.wantSeat && !d.match && !S.me && S.name) { S.wantSeat = false; clientSend({ t: 'sit', name: S.name, skin: S.skin }); }
    return;
  }
  if (d.t === 'f') { onFrame(d); return; }
  if (d.t === 'aim') { S.aim = d.a || null; return; }
  if (d.t === 'react') { showReaction(d.f, d.e); return; }
  if (d.t === 'err') { toast(String(d.msg || 'The host refused that.').slice(0, 200)); return; }
  if (d.t === 'kicked') { S.wantSeat = false; toast('The host removed you from the desk.'); return; }
  if (d.t === 'replaced') { clientFail('You opened this room in another tab or device. Continue there, or tap Try again to move back here.'); }
}
function clientLeave() {
  if (S.st && !S.st.match && S.me) clientSend({ t: 'leave' });
  setTimeout(clientCleanup, 150);
  clearInterval(C.hb); C.hb = null;
  resetRoomState();
}

/* ================= shared ================= */
function setHash(code) { try { history.replaceState(null, '', code ? '#' + code : location.pathname + location.search); } catch (e) { /* ignore */ } }
function resetRoomState() {
  S.screen = 'home'; S.room = ''; S.conn = 'idle'; S.connMsg = ''; S.me = null; S.st = null; S.frames = []; S.aim = null; S.wantSeat = false;
  setHash(''); render();
}
let onStateHook = function () {};
let onFrameEvents = function () {};
function applyState(d) {
  const prev = S.st;
  d.deadline = d.deadlineIn !== null && d.deadlineIn !== undefined ? Date.now() + d.deadlineIn : null;
  d.nextRound = d.nextRoundIn !== null && d.nextRoundIn !== undefined ? Date.now() + d.nextRoundIn : null;
  S.st = d; S.me = d.you || null;
  if (!d.match || d.match.phase !== 'roll') S.frames = [];
  if (!d.match || d.match.phase !== 'aim') S.aim = null;
  onStateHook(prev, d);
  render();
}
function onFrame(d) {
  const m = S.st && S.st.match;
  if (!m || d.k !== m.turnNo || !Array.isArray(d.p)) return;
  S.frames.push({ at: performance.now(), p: d.p });
  if (S.frames.length > 40) S.frames.splice(0, S.frames.length - 40);
  onFrameEvents(d);
}
const Net = {
  shoot: function (shot) {
    const m = S.st && S.st.match;
    if (!m) return false;
    shot.turnNo = m.turnNo;
    if (S.isHost) { hostShoot(H.local ? m.turn : H.myId, shot); return true; }
    return clientSend({ t: 'shoot', s: shot });
  },
  aim: function (a) {
    if (S.isHost) { if (!H.local) hostAim(H.myId, a); return; }
    clientSend({ t: 'aim', a: a });
  },
  react: function (e) { if (S.isHost) { if (!H.local) hostReact(H.myId, e); } else clientSend({ t: 'react', e: e }); },
  sit: function (name, skin) {
    S.name = cleanName(name); S.skin = skin; store('name', S.name); if (validSkin(skin)) store('skin', skin);
    if (!S.isHost) clientSend({ t: 'sit', name: S.name, skin: skin });
  },
  leave: function () { if (S.isHost && !H.local) hostClose(); else if (H.local && S.isHost) hostToLobby(); else clientLeave(); }
};
