/* ===== net: peer-to-peer rooms. The host's browser is the referee; players only ever receive their own private view. ===== */
const PEER_PREFIX = 'mafia-night-table-v1-';
function hostPeerId(code) { return PEER_PREFIX + code.toLowerCase(); }
function peerOptions() {
  const o = {
    debug: 0,
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ] }
  };
  let q = null;
  try { q = new URLSearchParams(location.search).get('peer'); } catch (e) { q = null; }
  if (q && /^[a-z0-9.\-]+:\d+$/i.test(q)) {           // self-hosted / test signalling server
    const parts = q.split(':');
    o.host = parts[0]; o.port = Number(parts[1]); o.secure = location.protocol === 'https:'; o.path = '/';
  }
  return o;
}
function hasPeer() { return typeof window.Peer === 'function'; }

/* ================= HOST ================= */
const H = {
  peer: null, room: '', myId: '', myToken: '', roster: [], cfg: E.defaultConfig(), gameId: '', st: null, chat: [],
  conns: new Map(), sendT: null, saveT: null, tick: null, hb: null, attempt: 0, fresh: true, wake: null
};

function hostRosterEntry(id) { return H.roster.find(function (r) { return r.id === id; }) || null; }
function hostUniqueName(nm, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.name.toLowerCase()] = true; });
  let base = cleanName(nm) || 'Player', out = base, i = 2;
  while (taken[out.toLowerCase()]) { out = base.slice(0, 13) + ' ' + i; i++; }
  return out;
}
function hostUniqueAv(av, exceptId) {
  const taken = {};
  H.roster.forEach(function (r) { if (r.id !== exceptId) taken[r.av] = true; });
  if (validAv(av) && !taken[av]) return av;
  for (let i = 0; i < AVATARS.length; i++) if (!taken[AVATARS[i]]) return AVATARS[i];
  return AVATARS[0];
}

function hostCreate(name, av) {
  H.room = newRoomCode();
  H.myToken = randId(16);
  H.myId = 'p' + randId(7);
  H.roster = [{ id: H.myId, token: H.myToken, name: cleanName(name) || 'Host', av: validAv(av) ? av : AVATARS[0] }];
  H.cfg = E.defaultConfig();
  H.gameId = randId(8);
  H.st = null; H.chat = [];
  H.fresh = true; H.attempt = 0;
  hostBoot();
}
function hostResume(saved) {
  H.room = saved.room; H.myId = saved.myId; H.myToken = saved.myToken; H.roster = saved.roster || [];
  H.cfg = E.normalizeConfig(saved.cfg); H.gameId = saved.gameId || randId(8); H.st = saved.st || null; H.chat = saved.chat || [];
  if (H.st && H.st.dl) H.st.dl = Math.max(H.st.dl, Date.now() + 15000);   // grace period after a reload
  H.fresh = false; H.attempt = 0;
  hostBoot();
}
function hostBoot() {
  S.isHost = true; S.screen = 'room'; S.room = H.room; S.me = H.myId; S.conn = 'connecting'; S.connMsg = '';
  setHash(H.room);
  hostSave(true);
  hostPublish();
  if (!H.tick) H.tick = setInterval(hostTick, 1000);
  if (!H.hb) H.hb = setInterval(hostHeartbeat, 5000);
  hostStartPeer();
}
function hostStartPeer() {
  if (!hasPeer()) { S.conn = 'failed'; S.connMsg = 'The online library did not load. Check your connection and reload.'; render(); return; }
  if (H.peer) { try { H.peer.destroy(); } catch (e) { /* ignore */ } }
  const peer = new Peer(hostPeerId(H.room), peerOptions());
  H.peer = peer;
  peer.on('open', function () {
    if (peer !== H.peer) return;
    H.attempt = 0; H.fresh = false;
    S.conn = 'open'; S.connMsg = '';
    render();
  });
  peer.on('connection', function (conn) { if (peer === H.peer) hostAttach(conn); });
  peer.on('disconnected', function () {
    if (peer !== H.peer || peer.destroyed) return;
    S.connMsg = 'Reconnecting to the lobby server… Players already in the room stay connected.';
    render();
    setTimeout(function () { if (peer === H.peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* retry later */ } } }, 2000);
  });
  peer.on('error', function (e) {
    if (peer !== H.peer) return;
    const type = e && e.type;
    if (type === 'unavailable-id') {
      if (H.fresh && !H.st && H.roster.length <= 1 && H.attempt < 4) {
        H.attempt++;
        H.room = newRoomCode(); S.room = H.room; setHash(H.room); hostSave(true);
        hostStartPeer();
        return;
      }
      H.attempt++;
      S.connMsg = 'Reclaiming room ' + H.room + '… This can take up to a minute after a reload.';
      render();
      setTimeout(function () { if (peer === H.peer) hostStartPeer(); }, 4000);
      return;
    }
    if (type === 'browser-incompatible') { S.conn = 'failed'; S.connMsg = 'This browser cannot host online games. Try Chrome, Safari or Firefox.'; render(); return; }
    if (type === 'peer-unavailable') return;
    S.connMsg = 'Cannot reach the lobby server. Retrying…';
    render();
    setTimeout(function () {
      if (peer !== H.peer) return;
      if (peer.destroyed) hostStartPeer();
      else if (peer.disconnected) { try { peer.reconnect(); } catch (x) { hostStartPeer(); } }
    }, 4000);
  });
}
function hostAttach(conn) {
  const rec = { conn: conn, token: null, pid: null, last: Date.now(), lastChat: 0 };
  const key = conn.connectionId || (conn.peer + ':' + Math.random());
  H.conns.set(key, rec);
  conn.on('data', function (d) { rec.last = Date.now(); try { hostHandle(rec, d); } catch (e) { console.warn(e); } });
  const drop = function () { if (H.conns.get(key) === rec) { H.conns.delete(key); hostPublishSoon(); } };
  conn.on('close', drop);
  conn.on('error', function () { try { conn.close(); } catch (e) { /* ignore */ } drop(); });
}
function hostSend(rec, msg) { try { if (rec.conn.open) rec.conn.send(msg); } catch (e) { /* dropped */ } }
function hostHeartbeat() {
  const now = Date.now();
  H.conns.forEach(function (rec, key) {
    if (now - rec.last > 20000) { try { rec.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(key); hostPublishSoon(); }
  });
}
function hostHandle(rec, d) {
  if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
  if (d.t === 'ping') { hostSend(rec, { t: 'pong' }); return; }
  if (d.t === 'hello') {
    const tok = typeof d.token === 'string' ? d.token.slice(0, 40) : '';
    if (tok.length < 8) return;
    H.conns.forEach(function (other, k) {
      if (other !== rec && other.token === tok) { hostSend(other, { t: 'replaced' }); try { other.conn.close(); } catch (e) { /* ignore */ } H.conns.delete(k); }
    });
    rec.token = tok;
    const r = H.roster.find(function (x) { return x.token === tok; });
    rec.pid = r ? r.id : null;
    hostSendState(rec);
    hostPublishSoon();
    return;
  }
  if (!rec.token) return;
  if (d.t === 'sit') {
    if (H.st) { hostSend(rec, { t: 'err', msg: 'A game is in progress. You can take a seat when the next game starts.' }); return; }
    let r = H.roster.find(function (x) { return x.token === rec.token; });
    if (r) {
      r.name = hostUniqueName(d.name, r.id); r.av = hostUniqueAv(d.av, r.id);
    } else {
      if (H.roster.length >= MAXP) { hostSend(rec, { t: 'err', msg: 'The table is full. Eight players is the limit.' }); return; }
      r = { id: 'p' + randId(7), token: rec.token, name: '', av: '' };
      r.name = hostUniqueName(d.name, r.id); r.av = hostUniqueAv(d.av, r.id);
      H.roster.push(r);
      SFX.join();
    }
    rec.pid = r.id;
    hostChanged();
    return;
  }
  if (d.t === 'leave') {
    if (H.st || !rec.pid || rec.pid === H.myId) return;
    H.roster = H.roster.filter(function (x) { return x.id !== rec.pid; });
    rec.pid = null;
    hostChanged();
    return;
  }
  if (!rec.pid) return;
  if (d.t === 'act') { hostAct(rec.pid, d); return; }
  if (d.t === 'chat' || d.t === 'mchat') {
    const now = Date.now();
    if (now - rec.lastChat < 350) return;
    rec.lastChat = now;
    if (d.t === 'chat') hostChat(rec.pid, d.x); else hostMchat(rec.pid, d.x);
  }
}
function hostAct(pid, d) {
  const st = H.st;
  if (!st || st.phase === 'over' || !d || !d.a) return;
  if (d.key !== st.gameId + ':' + E.phaseKey(st)) return;
  const a = { t: typeof d.a.t === 'string' ? d.a.t : '', to: typeof d.a.to === 'string' ? d.a.to : undefined };
  if (!E.submit(st, pid, a).ok) return;
  if (E.ready(st)) E.advance(st, secureRng, Date.now());
  hostChanged();
}
function hostChat(pid, x) {
  x = cleanText(x, 300);
  if (!x) return;
  let g = 0;
  const st = H.st;
  if (st) {
    const p = E.P(st, pid);
    if (!p) return;
    if (st.phase !== 'over') {
      if (!p.alive) g = 1;
      else if (st.phase === 'night') return;
    }
  } else if (!hostRosterEntry(pid)) return;
  H.chat.push({ f: pid, t: Date.now(), x: x, g: g });
  if (H.chat.length > 160) H.chat.splice(0, H.chat.length - 160);
  hostChanged();
}
function hostMchat(pid, x) {
  x = cleanText(x, 300);
  const st = H.st;
  if (!x || !st || st.phase !== 'night') return;
  const p = E.P(st, pid);
  if (!p || !p.alive || p.role !== 'mafia') return;
  st.mafiaChat.push({ f: pid, t: Date.now(), x: x });
  if (st.mafiaChat.length > 80) st.mafiaChat.splice(0, st.mafiaChat.length - 80);
  hostChanged();
}
function hostTick() {
  const st = H.st;
  if (!st || st.phase === 'over' || !st.dl) return;
  if (Date.now() >= st.dl) { E.advance(st, secureRng, Date.now()); hostChanged(); }
}

/* host commands (called from the host's own screen) */
function hostSetCfg(patch) {
  if (H.st) return;
  H.cfg = E.normalizeConfig(Object.assign({}, H.cfg, patch));
  hostChanged();
}
function hostStart() {
  if (H.st) return;
  const n = H.roster.length;
  if (n < MINP || n > MAXP) { setErr('You need ' + MINP + ' to ' + MAXP + ' players.'); return; }
  H.st = E.newGame({ gameId: H.gameId, players: H.roster.map(function (r) { return { id: r.id, name: r.name }; }), cfg: H.cfg, rng: secureRng, now: Date.now() });
  H.roster.forEach(function (r) { const p = E.P(H.st, r.id); if (p) r.name = p.name; });
  H.chat = [];
  hostChanged();
}
function hostForce() {
  const st = H.st;
  if (!st || st.phase === 'over') return;
  E.advance(st, secureRng, Date.now());
  hostChanged();
}
function hostRemove(id) {
  if (id === H.myId) return;
  if (H.st) {
    if (!E.removePlayer(H.st, id)) return;
    if (H.st.phase !== 'over' && E.ready(H.st)) E.advance(H.st, secureRng, Date.now());
  } else {
    H.roster = H.roster.filter(function (r) { return r.id !== id; });
    H.conns.forEach(function (rec) { if (rec.pid === id) { rec.pid = null; hostSend(rec, { t: 'kicked' }); } });
  }
  hostChanged();
}
function hostToLobby() {
  if (H.st) {
    const inGame = {};
    H.st.players.forEach(function (p) { inGame[p.id] = true; });
    H.roster = H.roster.filter(function (r) { return inGame[r.id] && (r.id === H.myId || E.P(H.st, r.id).out === null || E.P(H.st, r.id).out.ph !== 'X'); });
  }
  H.st = null; H.gameId = randId(8); H.chat = [];
  hostChanged();
}
function hostClose() {
  try { if (H.peer) H.peer.destroy(); } catch (e) { /* ignore */ }
  H.peer = null;
  H.conns.clear();
  clearInterval(H.tick); clearInterval(H.hb); H.tick = null; H.hb = null;
  storeJSON('host', null);
  S.isHost = false;
  resetRoomState();
}

function hostChanged() { hostSave(true); hostPublishSoon(); }
function hostSave(now) {
  const write = function () {
    clearTimeout(H.saveT);
    H.saveT = null;
    if (!S.isHost || !H.room) return;
    storeJSON('host', { room: H.room, myId: H.myId, myToken: H.myToken, roster: H.roster, cfg: H.cfg, gameId: H.gameId, st: H.st, chat: H.chat, savedAt: Date.now() });
  };
  if (now) { write(); return; }
  if (!H.saveT) H.saveT = setTimeout(write, 250);
}
function hostPublishSoon() { if (!H.sendT) H.sendT = setTimeout(hostPublish, 0); }
function hostOnlineIds() {
  const on = {};
  on[H.myId] = true;
  H.conns.forEach(function (rec) { if (rec.pid && rec.conn.open) on[rec.pid] = true; });
  return on;
}
function hostSnapshot(pid) {
  const st = H.st, on = hostOnlineIds();
  const roster = H.roster.map(function (r) { return { id: r.id, name: r.name, av: r.av, on: !!on[r.id] }; });
  let pub;
  if (!st) {
    pub = { v: 1, phase: 'lobby', round: 0, key: 'L0', gameId: H.gameId, cfg: H.cfg,
      players: H.roster.map(function (r) { return { id: r.id, name: r.name, alive: true, rv: null }; }),
      pending: [], log: [], ballot: null, winner: null, recap: null, seq: 0, dl: null };
  } else {
    pub = E.publicView(st);
  }
  pub.room = H.room; pub.hostId = H.myId; pub.roster = roster;
  pub.dlIn = st && st.dl && st.phase !== 'over' ? Math.max(0, st.dl - Date.now()) : null;
  delete pub.dl;
  const seated = pid && (st ? !!E.P(st, pid) : !!hostRosterEntry(pid));
  const view = st && seated ? E.playerView(st, pid) : null;
  let chat;
  const me = st && seated ? E.P(st, pid) : null;
  const seeGhosts = !!(me && !me.alive) || !!(st && st.phase === 'over');
  chat = H.chat.filter(function (m) { return !m.g || seeGhosts; }).slice(-80);
  return { t: 'state', you: seated ? pid : null, pub: pub, view: view, chat: chat };
}
function hostSendState(rec) { hostSend(rec, hostSnapshot(rec.pid)); }
function hostPublish() {
  H.sendT = null;
  H.conns.forEach(function (rec) { if (rec.token) hostSendState(rec); });
  applySnapshot(hostSnapshot(H.myId));
}

/* ================= PLAYER ================= */
const C = { peer: null, conn: null, token: '', attempts: 0, everOpen: false, lastMsg: 0, retryT: null, openT: null, hb: null };

function clientJoin(code, name, av) {
  S.isHost = false; S.screen = 'room'; S.room = code; S.conn = 'connecting'; S.connMsg = 'Finding room ' + code + '…';
  S.name = cleanName(name); S.av = validAv(av) ? av : '';
  store('name', S.name); if (S.av) store('av', S.av);
  C.token = store('tok.' + code) || randId(16);
  store('tok.' + code, C.token);
  store('lastRoom', code);
  C.attempts = 0; C.everOpen = false;
  S.wantSeat = true;
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
    setTimeout(function () { if (peer === C.peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* retry later */ } } }, 1500);
  });
  peer.on('error', function (e) {
    if (peer !== C.peer || S.conn === 'failed') return;
    const type = e && e.type;
    if (type === 'browser-incompatible') { clientFail('This browser cannot play online. Try Chrome, Safari or Firefox.'); return; }
    if (type === 'peer-unavailable') {
      if (!C.everOpen && C.attempts >= 3) { clientFail('Room ' + S.room + ' was not found. Check the code, and make sure the host still has the game open.'); return; }
      S.connMsg = C.everOpen ? 'The host went offline. Waiting for them to come back…' : 'Looking for room ' + S.room + '…';
      clientRetry(3000);
      return;
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
  try { conn = C.peer.connect(hostPeerId(S.room), { reliable: true, serialization: 'json' }); }
  catch (e) { clientRetry(3000, true); return; }
  C.conn = conn;
  clearTimeout(C.openT);
  C.openT = setTimeout(function () {
    if (conn === C.conn && !conn.open) {
      try { conn.close(); } catch (e) { /* ignore */ }
      C.conn = null;
      if (!C.everOpen && C.attempts >= 4) {
        clientFail('Could not connect to room ' + S.room + '. Some networks block direct connections: try switching between Wi-Fi and mobile data, then tap Try again.');
        return;
      }
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
  conn.on('data', function (d) {
    if (conn !== C.conn) return;
    C.lastMsg = Date.now();
    try { clientHandle(d); } catch (e) { console.warn(e); }
  });
  const lost = function () {
    if (conn !== C.conn) return;
    C.conn = null;
    if (S.conn === 'failed' || S.screen !== 'room' || S.isHost) return;
    S.conn = C.everOpen ? 'lost' : 'connecting';
    S.connMsg = 'Connection lost. Reconnecting…';
    render();
    clientRetry(1500);
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
    if (freshPeer || !C.peer || C.peer.destroyed) clientStartPeer();
    else clientConnect();
  }, ms);
}
function clientFail(msg) {
  clientCleanup();
  S.conn = 'failed'; S.connMsg = msg;
  render();
}
function clientRetryNow() {
  C.attempts = 0;
  S.conn = 'connecting'; S.connMsg = 'Trying again…';
  clientStartPeer();
  render();
}
function clientHeartbeat() {
  if (S.isHost || S.screen !== 'room') return;
  if (S.conn === 'open' && C.conn && C.conn.open) {
    try { C.conn.send({ t: 'ping' }); } catch (e) { /* ignore */ }
    if (Date.now() - C.lastMsg > 15000) { try { C.conn.close(); } catch (e) { /* ignore */ } }
  }
}
function clientSend(msg) {
  if (C.conn && C.conn.open) { try { C.conn.send(msg); return true; } catch (e) { /* fall through */ } }
  toast('Not connected yet. Hang on a second.');
  return false;
}
function clientHandle(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'state') {
    applySnapshot(d);
    if (S.me) S.wantSeat = false;
    if (S.wantSeat && S.pub && S.pub.phase === 'lobby' && !S.me && S.name) {
      S.wantSeat = false;
      clientSend({ t: 'sit', name: S.name, av: S.av });
    }
    return;
  }
  if (d.t === 'err') { toast(String(d.msg || 'The host refused that.').slice(0, 200)); return; }
  if (d.t === 'kicked') { S.wantSeat = false; toast('The host removed you from the table.'); return; }
  if (d.t === 'replaced') { clientFail('You opened this room in another tab or device. Continue there, or tap Try again to move back here.'); return; }
}
function clientLeave() {
  if (S.pub && S.pub.phase === 'lobby' && S.me) clientSend({ t: 'leave' });
  setTimeout(function () { clientCleanup(); }, 150);
  clearInterval(C.hb); C.hb = null;
  resetRoomState();
}

/* ================= shared ================= */
function setHash(code) {
  try { history.replaceState(null, '', code ? '#' + code : location.pathname + location.search); } catch (e) { /* ignore */ }
}
function resetRoomState() {
  S.screen = 'home'; S.room = ''; S.conn = 'idle'; S.connMsg = ''; S.me = null; S.pub = null; S.view = null; S.chat = [];
  S.overlay = null; S.lastKey = ''; S.lastGame = ''; S.sel = null; S.sent = null; S.wantSeat = false;
  setHash('');
  render();
}
let onSnapshotHook = function () {};
function applySnapshot(d) {
  const pub = d.pub;
  pub.dl = pub.dlIn !== null && pub.dlIn !== undefined ? Date.now() + pub.dlIn : null;
  S.pub = pub; S.pubAt = Date.now();
  S.me = d.you || null;
  S.view = d.view || null;
  S.chat = Array.isArray(d.chat) ? d.chat : [];
  onSnapshotHook();
  render();
}

/* unified actions used by the screens */
const Net = {
  act: function (view, a) {
    const msg = { t: 'act', key: view.gameId + ':' + view.key, a: { t: a.t, to: a.to } };
    if (S.isHost) { hostAct(H.myId, msg); return true; }
    return clientSend(msg);
  },
  chat: function (x) {
    x = cleanText(x, 300);
    if (!x) return;
    if (S.isHost) hostChat(H.myId, x); else clientSend({ t: 'chat', x: x });
  },
  mchat: function (x) {
    x = cleanText(x, 300);
    if (!x) return;
    if (S.isHost) hostMchat(H.myId, x); else clientSend({ t: 'mchat', x: x });
  },
  sit: function (name, av) {
    S.name = cleanName(name); S.av = av; store('name', S.name); if (validAv(av)) store('av', av);
    if (S.isHost) return;
    clientSend({ t: 'sit', name: S.name, av: av });
  },
  leave: function () { if (S.isHost) hostClose(); else clientLeave(); }
};
