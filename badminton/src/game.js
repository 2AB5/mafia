/* ===== Badminton rules and physics. Pure logic (no DOM, no clock): the host calls step(), tests run it in Node. =====
   Court axes (metres): x across (left/right), y along the court, z height. Net at y = 0.
   Side 0 plays on y > 0 (the bottom of their screen), side 1 on y < 0. */
const BD = (function () {
  const C = { half: 6.7, wD: 3.05, wS: 2.59, short: 1.98, longD: 5.94, net: 1.55 };
  const G = 9.8, K = 0.22;                     // shuttle drag: terminal speed sqrt(G/K) ≈ 6.7 m/s, like a real feather shuttle
  const DT = 1 / 120;
  const REACH = 1.05, LUNGE = 0.3, Z_MIN = 0.05, Z_MAX = 2.45, Z_JUMP = 2.95, SMASH_Z = 1.9;
  const ZONES = { low: 0.9, smash: SMASH_Z, jump: 2.5 };           // the height meter's bands
  const MAX_SPEED = 5.0;
  const GRACE = 0.16;                          // a landing is final only after this long: covers network delay on late saves
  const POINT_PAUSE = 1.7, SERVE_WAIT = 8;
  const LEVELS = {
    // easy bots also take a moment to get going (accel, m/s²) and misjudge the flight a little (miss, metres)
    easy: { react: 0.48, speed: 0.64, accel: 10, miss: 0.3, noise: 0.6, smash: 0.25, smart: 0.2, eager: 0.25, err: 0.13, fool: 0.9 },
    normal: { react: 0.24, speed: 0.88, noise: 0.32, smash: 0.5, smart: 0.6, eager: 0.4, err: 0.06, fool: 0.6 },
    hard: { react: 0.13, speed: 1.0, noise: 0.17, smash: 0.72, smart: 0.9, eager: 0.55, err: 0.03, fool: 0.4 }
  };
  const BOT_NAMES = ['Saina', 'Sindhu', 'Lakshya', 'Srikanth', 'Prannoy', 'Satwik', 'Chirag', 'Gopi'];

  function defaultConfig() { return { target: 10 }; }
  function normalizeConfig(c) { c = c || {}; return { target: [5, 10, 15, 21].indexOf(c.target) !== -1 ? c.target : 10 }; }
  function capFor(target) { return target + 5; }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 14) || 'Player'; }
  const sgn = function (side) { return side === 0 ? 1 : -1; };
  function halfW(m) { return m.mode === '1v1' ? C.wS : C.wD; }

  /* ---------- shuttle physics ---------- */
  function stepShuttle(s, dt) {
    const v = Math.hypot(s.vx, s.vy, s.vz);
    s.vx += -K * v * s.vx * dt;
    s.vy += -K * v * s.vy * dt;
    s.vz += (-G - K * v * s.vz) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  }
  /* fly a copy until it lands; reports where, when, the apex and the height at the net */
  function fly(s0, maxT) {
    const s = { x: s0.x, y: s0.y, z: s0.z, vx: s0.vx, vy: s0.vy, vz: s0.vz };
    let t = 0, apex = s.z, netZ = null;
    const path = [];
    while (t < (maxT || 8)) {
      const py = s.y;
      stepShuttle(s, DT); t += DT;
      if (s.z > apex) apex = s.z;
      if (netZ === null && (py > 0) !== (s.y > 0)) netZ = s.z;
      if (path.length < 2000 && Math.round(t / DT) % 2 === 0) path.push({ t: t, x: s.x, y: s.y, z: s.z });
      if (s.z <= 0) break;
    }
    return { x: s.x, y: s.y, t: t, apex: apex, netZ: netZ, path: path };
  }
  function launch(from, dirX, dirY, speed, elev) {
    const h = Math.hypot(dirX, dirY) || 1;
    const c = Math.cos(elev), sn = Math.sin(elev);
    return { x: from.x, y: from.y, z: from.z, vx: dirX / h * speed * c, vy: dirY / h * speed * c, vz: speed * sn };
  }
  /* speed needed to land at the target for a given launch angle (bisection on the real drag flight) */
  function speedFor(from, tx, ty, elev) {
    const dx = tx - from.x, dy = ty - from.y, want = Math.hypot(dx, dy);
    let lo = 1, hi = 70;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2, f = fly(launch(from, dx, dy, mid, elev), 10);
      const got = Math.hypot(f.x - from.x, f.y - from.y);
      if (got < want) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /* angle needed at a fixed speed (smashes): steepest angle that still reaches the target */
  function angleFor(from, tx, ty, speed) {
    const dx = tx - from.x, dy = ty - from.y, want = Math.hypot(dx, dy);
    let lo = -0.75, hi = 0.25;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2, f = fly(launch(from, dx, dy, speed, mid), 6);
      const got = Math.hypot(f.x - from.x, f.y - from.y);
      if (got < want) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ---------- players and match ---------- */
  function modeFor(players) {
    const c = [0, 0]; players.forEach(function (p) { c[p.side]++; });
    if (c[0] === 1 && c[1] === 1) return '1v1';
    if (c[0] === 2 && c[1] === 2) return '2v2';
    if ((c[0] === 1 && c[1] === 2) || (c[0] === 2 && c[1] === 1)) return '1v2';
    return null;
  }
  function newMatch(opts) {
    const rng = opts.rng || Math.random;
    const players = opts.players || [];
    if (players.length < 2 || players.length > 4) throw new Error('Badminton needs 2 to 4 players.');
    const seen = {};
    players.forEach(function (p) { if (seen[p.id]) throw new Error('Duplicate player id.'); seen[p.id] = true; if (p.side !== 0 && p.side !== 1) throw new Error('Every player needs a side.'); });
    const mode = modeFor(players);
    if (!mode) throw new Error('Sides must be 1 v 1, 1 v 2 or 2 v 2.');
    const cfg = normalizeConfig(opts.cfg);
    const m = {
      v: 1, id: opts.id || ('m' + Math.floor(rng() * 1e9).toString(36)), cfg: cfg, mode: mode,
      players: players.map(function (p) { return { id: p.id, name: cleanName(p.name), side: p.side, bot: LEVELS[p.bot] ? p.bot : null, x: 0, y: 0, vx: 0, vy: 0, energy: 100, swing: 0, swingKind: '', left: false }; }),
      score: [0, 0], phase: 'serve', t: 0, phaseT: 0,
      server: null, serveSide: rng() < 0.5 ? 0 : 1, nextServer: [0, 0],
      shuttle: null, lastHitTeam: null, lastHitBy: null, rallyHits: 0, landed: null,
      rally: 0, longest: 0, lastPoint: null, winner: null, resetNo: 0,
      stats: {}, events: [], log: []
    };
    m.players.forEach(function (p) { m.stats[p.id] = { hits: 0, smashes: 0, winners: 0, errors: 0, fastest: 0, aces: 0 }; });
    startServe(m, rng);
    return m;
  }
  function playerOf(m, id) { return m.players.find(function (p) { return p.id === id; }) || null; }
  function nameOf(m, id) { const p = playerOf(m, id); return p ? p.name : 'Player'; }
  function teamOf(m, side) { return m.players.filter(function (p) { return p.side === side && !p.left; }); }
  function solo(m, p) { return m.mode === '1v2' && teamOf(m, p.side).length === 1; }
  function addLog(m, x) { m.log.push(x); if (m.log.length > 30) m.log.splice(0, m.log.length - 30); }
  function ev(m, e) { e.n = m.evN = (m.evN || 0) + 1; m.events.push(e); if (m.events.length > 60) m.events.splice(0, m.events.length - 60); }

  /* where everyone stands for a serve */
  function startServe(m, rng) {
    const side = m.serveSide, team = teamOf(m, side);
    if (!team.length) return;
    const idx = m.nextServer[side] % team.length;
    const server = team[idx];
    m.server = server.id;
    const right = m.score[side] % 2 === 0;                 // even score: serve from the right court
    const s = sgn(side), lateral = (right ? 1 : -1) * s;    // "right" as the server sees it
    const W = halfW(m);
    server.x = lateral * W * 0.32; server.y = s * 3.1;
    const mates = team.filter(function (p) { return p !== server; });
    mates.forEach(function (p) { p.x = -lateral * W * 0.45; p.y = s * 4.6; });
    const recv = teamOf(m, 1 - side), rs = sgn(1 - side);
    // the receiver stands in the diagonal court; a partner covers the other half further back
    recv.forEach(function (p, i) { if (i === 0) { p.x = -lateral * W * 0.32; p.y = rs * 3.3; } else { p.x = lateral * W * 0.45; p.y = rs * 4.6; } });
    m.players.forEach(function (p) { p.vx = 0; p.vy = 0; p.swing = 0; });
    m.shuttle = { x: server.x + 0.25 * (right ? 1 : -1) * s, y: server.y - s * 0.35, z: 1.0, vx: 0, vy: 0, vz: 0, held: true };
    m.phase = 'serve'; m.phaseT = 0; m.lastHitTeam = null; m.lastHitBy = null; m.rallyHits = 0; m.landed = null;
    m.resetNo++;
    ev(m, { k: 'serve', by: server.id });
  }

  /* ---------- moving ---------- */
  function speedCap(m, p) {
    const e = p.energy;
    return MAX_SPEED * (solo(m, p) ? 1.08 : 1) * (0.68 + 0.32 * Math.min(1, e / 40));
  }
  function clampToSide(m, p) {
    const s = sgn(p.side), W = halfW(m) + 1.2;
    p.x = Math.max(-W, Math.min(W, p.x));
    const yy = Math.max(0.35, Math.min(C.half + 1.4, p.y * s));
    p.y = yy * s;
  }
  /* a human's position report: trusted, but capped at what their legs and energy allow */
  function moveTo(m, id, x, y, dt) {
    const p = playerOf(m, id);
    if (!p || p.left || !isFinite(x) || !isFinite(y)) return;
    if (m.phase === 'serve' && p.id === m.server) return;        // the server holds still until they serve
    dt = Math.max(dt || DT, 1e-3);
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), cap = speedCap(m, p) * 1.25 * dt + 0.02;
    const k = d > cap ? cap / d : 1;
    p.vx = dx * k / dt; p.vy = dy * k / dt;
    p.x += dx * k; p.y += dy * k;
    clampToSide(m, p);
  }
  /* energy: running hard and smashing tire you; standing still recovers */
  function tire(m, dt) {
    m.players.forEach(function (p) {
      const sp = Math.hypot(p.vx, p.vy), f = solo(m, p) ? [0.75, 1.6] : [1, 1];
      const run = Math.min(1.3, sp / MAX_SPEED);
      if (sp > 1.0) p.energy -= run * run * 6.5 * f[0] * dt;
      else p.energy += 9 * f[1] * dt;
      if (m.phase !== 'rally') p.energy += 6 * f[1] * dt;
      p.energy = Math.max(0, Math.min(100, p.energy));
      if (p.swing > 0) p.swing = Math.max(0, p.swing - dt);
    });
  }

  /* ---------- hitting ---------- */
  function hittable(m, p, s) {
    if (!s || s.held) return null;
    if (m.lastHitTeam === p.side) return null;                    // one hit per side
    if ((p.side === 0 && s.y < -0.12) || (p.side === 1 && s.y > 0.12)) return null;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    const reach = REACH + (p.energy > 10 ? LUNGE : 0);
    if (d > reach) return null;
    const top = p.energy >= 15 ? Z_JUMP : Z_MAX;
    if (s.z < Z_MIN || s.z > top) return null;
    return { d: d, z: s.z, reach: reach };
  }
  // which shot a button makes, given the shuttle height and where you stand
  function classify(m, p, button, z) {
    const nearNet = Math.abs(p.y) < 2.3;
    if (button === 'smash') return z >= SMASH_Z ? 'smash' : z >= 1.2 ? 'drive' : 'push';
    if (button === 'drop') return nearNet && z < 1.45 ? 'net' : 'drop';
    return z >= 1.0 ? 'clear' : 'lift';
  }
  /* what a button would do right now, for the on-screen labels: kind and how risky it is */
  function preview(m, p, button, z) {
    const kind = classify(m, p, button, z);
    let risk = 'ok';
    if (button === 'smash' && z < ZONES.low) risk = 'net';
    else if (button === 'smash' && z < 1.2) risk = 'risky';
    else if (kind === 'smash' && Math.abs(p.y) > 5.2 && z < 2.3) risk = 'risky';
    return { kind: kind, risk: risk };
  }
  const NAMES = { smash: 'Smash', drive: 'Drive', push: 'Push', net: 'Net shot', drop: 'Drop', clear: 'Clear', lift: 'Lift', serveLong: 'Forehand high serve', serveShort: 'Backhand short serve', serveFlick: 'Backhand flick serve' };
  /* aim: lateral (-1 left … 1 right as the hitter sees it) and depth (-1 shorter … 1 deeper) */
  function targetFor(m, p, kind, aim) {
    const s = sgn(p.side), o = -s, W = halfW(m);
    const lat = Math.max(-1, Math.min(1, aim && isFinite(aim[0]) ? aim[0] : 0)) * s;   // to world x
    const dep = Math.max(-1, Math.min(1, aim && isFinite(aim[1]) ? aim[1] : 0));
    const backLine = C.half;
    let D, x;
    switch (kind) {
      case 'clear': D = 5.75 + dep * 0.5; x = lat * (W - 0.45) + p.x * 0.15; break;
      case 'lift': D = 5.4 + dep * 0.6; x = lat * (W - 0.5) + p.x * 0.2; break;
      case 'drop': D = 2.5 + dep * 0.6; x = lat * (W - 0.6) + p.x * 0.2; break;
      case 'net': D = 1.05 + dep * 0.3; x = p.x * 0.7 + lat * 1.2; break;
      case 'smash': D = 4.0 + dep * 1.2; x = lat * (W - 0.5) + p.x * 0.3; break;
      case 'drive': D = 4.6 + dep * 0.8; x = lat * (W - 0.5) + p.x * 0.3; break;
      case 'push': D = 3.2 + dep * 0.8; x = lat * (W - 0.6) + p.x * 0.3; break;
      default: D = 4; x = 0;
    }
    D = Math.min(backLine - 0.2, Math.max(0.7, D));
    x = Math.max(-(W - 0.2), Math.min(W - 0.2, x));
    return { x: x, y: o * D };
  }
  function aimNoise(m, p, q, level, rng) {
    const L = level ? LEVELS[level] : null;
    let sd = L ? L.noise : 0.14;
    sd += (q ? q.d / (q.reach || REACH) : 0) * 0.3;
    if (p.energy < 25) sd += (25 - p.energy) / 25 * 0.35;
    const g = function () { let u = 0; for (let i = 0; i < 4; i++) u += rng(); return (u - 2) / 0.58; };
    return [g() * sd, g() * sd * 1.3];
  }
  function shotVelocity(m, p, kind, from, tgt, perfect, hand) {
    const dx = tgt.x - from.x, dy = tgt.y - from.y;
    const clearNet = function (elev, speed) { const f = fly(launch(from, dx, dy, speed, elev), 8); return f.netZ === null || f.netZ > C.net + 0.08; };
    if (kind === 'smash') {
      const power = 24 + 11 * Math.min(1, p.energy / 50) + (from.z > 2.5 ? 3 : 0) + (perfect ? 3 : 0) - (hand === 'back' ? 4 : 0);
      let a = angleFor(from, tgt.x, tgt.y, power);
      // a smash is hit downwards: it can flatten out a little, but from too low or too deep it clips the tape
      for (let i = 0; i < 6 && !clearNet(a, power); i++) a += 0.02;
      return { v: launch(from, dx, dy, power, a), speed: power };
    }
    if (kind === 'push' && from.z < 1.2) {
      // a flat hit from below the tape: only a small upward angle is possible, so low ones go into the net
      const maxA = from.z < ZONES.low ? 0.06 : 0.22;
      for (let a = 0.02; a <= maxA + 1e-6; a += 0.04) { const sp = speedFor(from, tgt.x, tgt.y, a); if (clearNet(a, sp)) return { v: launch(from, dx, dy, sp, a), speed: sp }; }
      const sp = speedFor(from, tgt.x, tgt.y, maxA);
      return { v: launch(from, dx, dy, sp, maxA), speed: sp };
    }
    const prefs = { clear: [0.62, 0.72, 0.52], lift: [0.85, 0.75, 1.0], drop: [0.3, 0.45, 0.6, 0.15], net: [1.0, 1.2, 1.35, 0.8], drive: [0.06, 0.12, 0.2], push: [0.2, 0.3, 0.45], serveLong: [0.8, 0.7, 0.9], serveShort: [0.5, 0.65, 0.8], serveFlick: [0.42, 0.52, 0.34, 0.62] }[kind] || [0.5];
    const ok = function (elev) { const sp = speedFor(from, tgt.x, tgt.y, elev); return sp < 69 && clearNet(elev, sp) ? sp : 0; };
    for (let i = 0; i < prefs.length; i++) { const sp = ok(prefs[i]); if (sp) return { v: launch(from, dx, dy, sp, prefs[i]), speed: sp }; }
    // nothing preferred works: take the angle nearest the preferred one that clears the net and reaches
    let best = null;
    for (let a = 0.05; a <= 1.45; a += 0.1) { const sp = ok(a); if (sp && (!best || Math.abs(a - prefs[0]) < Math.abs(best.a - prefs[0]))) best = { a: a, sp: sp }; }
    if (best) return { v: launch(from, dx, dy, best.sp, best.a), speed: best.sp };
    const sp = speedFor(from, tgt.x, tgt.y, 0.7);
    return { v: launch(from, dx, dy, sp, 0.7), speed: sp };
  }
  /* a swing. `past` are recent shuttle snapshots (newest first) so a slightly late press still connects. */
  function swing(m, id, button, aim, rng, past) {
    rng = rng || Math.random;
    const p = playerOf(m, id);
    if (!p || p.left || (m.phase !== 'rally' && m.phase !== 'serve')) return null;
    if (p.swing > 0.18) return null;                               // still finishing the last swing
    p.swing = 0.32;
    if (m.phase === 'serve') {
      if (id !== m.server) { p.swingKind = 'air'; return { kind: 'air' }; }
      return serve(m, p, button === 'drop' ? 'serveShort' : button === 'smash' ? 'serveFlick' : 'serveLong', aim, rng);
    }
    const cands = [m.shuttle].concat(past || []);
    let q = null, s = null;
    for (let i = 0; i < cands.length && !q; i++) { q = hittable(m, p, cands[i]); s = q ? cands[i] : null; }
    if (!q) { p.swingKind = 'air'; ev(m, { k: 'whiff', by: id }); return { kind: 'air' }; }
    // hit from where the shuttle is now (if it already landed, from where it was caught)
    const from = m.landed ? { x: s.x, y: s.y, z: Math.max(0.2, s.z) } : { x: m.shuttle.x, y: m.shuttle.y, z: Math.max(0.1, m.shuttle.z) };
    const kind = classify(m, p, button, q.z);
    if (kind === 'smash' && p.energy < 12) return hitWith(m, p, 'drive', aim, from, q, rng);
    return hitWith(m, p, kind, aim, from, q, rng);
  }
  // clean contact: close to the body, at a good height for the shot
  function isPerfect(kind, q) {
    if (!q || q.d > 0.5) return false;
    if (kind === 'smash') return q.z >= ZONES.jump - 0.2;
    if (kind === 'clear' || kind === 'drop') return q.z >= 1.5;
    if (kind === 'net') return q.z >= 0.6;
    return q.z >= 0.9 && q.z <= 1.9;
  }
  /* right-handed: the shuttle on your right is a forehand, on your left a backhand */
  function handFor(p, s) { return (s.x - p.x) * sgn(p.side) >= -0.1 ? 'fore' : 'back'; }
  function hitWith(m, p, kind, aim, from, q, rng) {
    const hand = handFor(p, from);
    const tgt = targetFor(m, p, kind, aim);
    if (hand === 'back' && (kind === 'clear' || kind === 'lift')) tgt.y -= sgn(1 - p.side) * 0.6;   // backhand clears fall shorter
    const perfect = isPerfect(kind, q);
    const n = aimNoise(m, p, q, p.bot, rng);
    const k = (perfect ? 0.4 : 1) * (hand === 'back' ? 1.25 : 1);
    tgt.x += n[0] * k; tgt.y += n[1] * k;
    const sv = shotVelocity(m, p, kind, from, tgt, perfect, hand);
    m.shuttle = { x: from.x, y: from.y, z: from.z, vx: sv.v.vx, vy: sv.v.vy, vz: sv.v.vz, held: false };
    m.landed = null;
    m.lastHitTeam = p.side; m.lastHitBy = p.id; m.rallyHits++;
    p.swingKind = kind; p.hand = hand;
    const cost = { smash: from.z > 2.5 ? 20 : 15, clear: 4, lift: 3, drive: 3, drop: 2, net: 2, push: 2 }[kind] || 2;
    p.energy = Math.max(0, p.energy - cost * (solo(m, p) ? 0.75 : 1));
    const st = m.stats[p.id]; st.hits++;
    if (kind === 'smash') { st.smashes++; const kmh = Math.round(sv.speed * 3.6); if (kmh > st.fastest) st.fastest = kmh; }
    ev(m, { k: 'hit', by: p.id, kind: kind, hand: hand, speed: Math.round(sv.speed * 3.6), jump: kind === 'smash' && from.z > 2.5, perfect: perfect });
    return { kind: kind, speed: sv.speed, perfect: perfect, hand: hand };
  }
  function serve(m, p, kind, aim, rng) {
    const s = sgn(p.side), W = halfW(m);
    const right = m.score[p.side] % 2 === 0;
    const boxX = -(right ? 1 : -1) * s;               // diagonal court, in world x sign
    const lat = Math.max(-1, Math.min(1, aim && isFinite(aim[0]) ? aim[0] : 0)) * s;
    // forehand high serve: deep; backhand short: just past the short line; backhand flick: fast and flat over the receiver
    const D = kind === 'serveLong' ? (m.mode === '1v1' ? 6.2 : 5.55) : kind === 'serveFlick' ? (m.mode === '1v1' ? 5.7 : 5.3) : C.short + 0.55;
    let x = boxX * W * 0.5 + lat * W * 0.25;
    x = boxX > 0 ? Math.max(0.3, Math.min(W - 0.3, x)) : Math.min(-0.3, Math.max(-(W - 0.3), x));
    const tgt = { x: x, y: -s * D };
    const n = aimNoise(m, p, null, p.bot, rng);
    tgt.x += n[0] * 0.5; tgt.y += n[1] * 0.4 * -s;
    const from = { x: m.shuttle.x, y: m.shuttle.y, z: m.shuttle.z };
    const sv = shotVelocity(m, p, kind, from, tgt);
    m.shuttle = { x: from.x, y: from.y, z: from.z, vx: sv.v.vx, vy: sv.v.vy, vz: sv.v.vz, held: false };
    m.phase = 'rally'; m.phaseT = 0;
    m.lastHitTeam = p.side; m.lastHitBy = p.id; m.rallyHits = 1; m.landed = null;
    p.swingKind = kind; p.hand = kind === 'serveLong' ? 'fore' : 'back';
    m.stats[p.id].hits++;
    ev(m, { k: 'hit', by: p.id, kind: kind, hand: p.hand, speed: Math.round(sv.speed * 3.6) });
    return { kind: kind, hand: p.hand };
  }

  /* ---------- the clock ---------- */
  function inBounds(m, x, y, serveBy) {
    const W = halfW(m), e = 0.02;
    if (Math.abs(x) > W + e || Math.abs(y) > C.half + e) return false;
    if (serveBy) {
      const sp = playerOf(m, serveBy), s = sgn(sp.side);
      const right = m.score[sp.side] % 2 === 0;
      const boxX = -(right ? 1 : -1) * s;
      const dist = -s * y;                                         // distance past the net on the receiver's side
      if (dist < C.short - e) return false;
      if (m.mode !== '1v1' && dist > C.longD + e) return false;
      if (x * boxX < -e) return false;
    }
    return true;
  }
  function point(m, winSide, reason, at, rng) {
    m.score[winSide]++;
    const hitter = m.lastHitBy, hp = playerOf(m, hitter);
    if (hp) {
      if (hp.side === winSide) { m.stats[hitter].winners++; if (m.rallyHits === 1) m.stats[hitter].aces++; }
      else if (reason !== 'in') m.stats[hitter].errors++;
    }
    m.longest = Math.max(m.longest, m.rallyHits);
    m.rally++;
    m.lastPoint = { side: winSide, reason: reason, at: at, by: hitter, hits: m.rallyHits };
    ev(m, { k: 'point', side: winSide, reason: reason, at: at, by: hitter });
    const why = reason === 'net' ? 'into the net' : reason === 'out' ? 'out' : reason === 'serve' ? 'a serve fault' : reason === 'in' ? 'a winner' : reason;
    addLog(m, 'Point ' + (winSide === 0 ? 'Bottom' : 'Top') + ' side (' + why + '). ' + m.score[0] + '–' + m.score[1]);
    const w = m.score[winSide], l = m.score[1 - winSide];
    if ((w >= m.cfg.target && w - l >= 2) || w >= capFor(m.cfg.target)) {
      m.phase = 'over'; m.winner = winSide; m.phaseT = 0;
      ev(m, { k: 'over', side: winSide });
      addLog(m, 'Game over: ' + m.score[0] + '–' + m.score[1]);
      return;
    }
    // the rally winner serves; a team that wins the serve back rotates its server
    if (winSide !== m.serveSide) { m.serveSide = winSide; m.nextServer[winSide]++; }
    m.phase = 'point'; m.phaseT = 0;
  }
  function step(m, dt, rng) {
    rng = rng || Math.random;
    if (m.phase === 'over') return;
    m.t += dt; m.phaseT += dt;
    tire(m, dt);
    if (m.phase === 'point') { if (m.phaseT >= POINT_PAUSE) startServe(m, rng); return; }
    if (m.phase === 'serve') {
      const sp = playerOf(m, m.server);
      if (sp) { const s = sgn(sp.side), right = m.score[sp.side] % 2 === 0; m.shuttle.x = sp.x + 0.25 * (right ? 1 : -1) * s; m.shuttle.y = sp.y - s * 0.35; m.shuttle.z = 1.0; }
      if (m.phaseT >= SERVE_WAIT && sp) { sp.swing = 0; swing(m, sp.id, 'drop', [0, 0], rng); ev(m, { k: 'autoserve', by: sp.id }); }
      return;
    }
    const s = m.shuttle;
    if (m.landed) {
      if (m.t - m.landed.t >= GRACE) {
        const L = m.landed;
        const serveBy = m.rallyHits === 1 ? m.lastHitBy : null;
        const hp = playerOf(m, m.lastHitBy);
        const landSide = L.y > 0 ? 0 : 1;
        if (L.net) point(m, 1 - hp.side, 'net', [L.x, L.y], rng);
        else if (!inBounds(m, L.x, L.y, serveBy)) point(m, 1 - hp.side, serveBy ? 'serve' : 'out', [L.x, L.y], rng);
        else if (landSide === hp.side) point(m, 1 - hp.side, 'net', [L.x, L.y], rng);
        else point(m, hp.side, 'in', [L.x, L.y], rng);
      }
      return;
    }
    const n = Math.max(1, Math.round(dt / DT)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const py = s.y;
      stepShuttle(s, h);
      if ((py > 0) !== (s.y > 0) && s.z < C.net) {
        // clipped the tape: it drops back on the hitter's side
        s.y = py > 0 ? 0.05 : -0.05; s.vy = -s.vy * 0.08; s.vx *= 0.2; s.vz = Math.min(0, s.vz) * 0.3;
        s.netHit = true; ev(m, { k: 'net' });
      }
      if (s.z <= 0) { s.z = 0; m.landed = { t: m.t, x: s.x, y: s.y, net: !!s.netHit }; s.vx = s.vy = s.vz = 0; ev(m, { k: 'land', at: [s.x, s.y] }); break; }
    }
  }
  function leave(m, id) {
    const p = playerOf(m, id);
    if (!p || p.left || m.phase === 'over') return false;
    p.left = true;
    if (!teamOf(m, p.side).length) { m.phase = 'over'; m.winner = 1 - p.side; ev(m, { k: 'over', side: m.winner }); addLog(m, p.name + ' left. Game over.'); return true; }
    if (m.server === id) startServe(m);
    addLog(m, p.name + ' left the court.');
    return true;
  }

  /* ---------- computer players ---------- */
  function predict(m) {
    const s = m.shuttle;
    if (!s || s.held || m.landed) return null;
    return fly(s, 6);
  }
  function homeSpot(m, p) {
    const s = sgn(p.side), team = teamOf(m, p.side);
    if (team.length === 2) {
      const i = team.indexOf(p);
      return m.lastHitTeam === p.side ? { x: (i ? 1 : -1) * 1.4, y: s * 3.6 } : { x: 0, y: s * (i ? 4.6 : 2.2) };
    }
    return { x: 0, y: s * 3.7 };
  }
  /* returns { mx, my } (where to run, as a velocity) and maybe { hit: { button, aim } } */
  function botThink(m, p, rng, mem) {
    const L = LEVELS[p.bot] || LEVELS.normal;
    rng = rng || Math.random;
    mem = mem || {};
    const out = { mx: 0, my: 0, hit: null };
    const go = function (tx, ty) { const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); if (d < 0.05) return; const sp = speedCap(m, p) * L.speed * Math.min(1, d / 0.5); out.mx = dx / d * sp; out.my = dy / d * sp; };
    if (m.phase === 'serve') {
      if (m.server === p.id) {
        if (!mem.serveAt) mem.serveAt = m.t + 0.9 + rng() * 1.6;
        if (m.t >= mem.serveAt) {
          mem.serveAt = 0;
          const r = rng(), hi = m.mode === '1v1' ? 0.5 : 0.25;
          out.hit = { button: r < hi ? 'clear' : r < hi + (L.smart > 0.5 ? 0.15 : 0.07) ? 'smash' : 'drop', aim: [rng() * 2 - 1, 0] };
        }
      }
      return out;
    }
    mem.serveAt = 0;
    if (m.phase !== 'rally') { const h = homeSpot(m, p); go(h.x, h.y); return out; }
    const s = m.shuttle;
    const incoming = m.lastHitTeam !== p.side && !m.landed;
    if (!incoming) { const h = homeSpot(m, p); go(h.x, h.y); return out; }
    // read the flight (after a short reaction) and run to where it can be hit
    if (!mem.plan || mem.plan.hit !== m.rallyHits) {
      // fast smashes and shots placed far away are harder to read: sometimes the bot is late or guesses wrong
      const sp = Math.hypot(s.vx, s.vy, s.vz), f0 = predict(m);
      const far = f0 ? Math.hypot(f0.x - p.x, f0.y - p.y) : 0;
      const hard = Math.max(0, (sp - 16) / 26) + Math.max(0, (far - 2.2) / 5) + (m.rallyHits > 6 ? 0.03 * (m.rallyHits - 6) : 0);
      const fooled = rng() < L.err + hard * L.fool;
      mem.plan = { hit: m.rallyHits, at: m.t + L.react * (0.7 + rng() * 0.6) + (fooled ? 0.35 + rng() * 0.5 : 0), path: null, spot: null, fooled: fooled };
    }
    const plan = mem.plan;
    if (m.t < plan.at) return out;
    if (!plan.path) {
      const f = predict(m);
      if (!f) return out;
      const mine = f.path.filter(function (q) { return (p.side === 0 ? q.y > 0.1 : q.y < -0.1) && q.z > 0.15 && q.z < Z_MAX + 0.2; });
      // the partner closer to the landing spot takes it
      const team = teamOf(m, p.side);
      if (team.length === 2) {
        const other = team.find(function (o) { return o !== p; });
        const d1 = Math.hypot(f.x - p.x, f.y - p.y), d2 = Math.hypot(f.x - other.x, f.y - other.y);
        if (d2 + 0.3 < d1) { plan.path = []; plan.spot = homeSpot(m, p); }
      }
      if (!plan.path) {
        plan.path = mine;
        const sp = speedCap(m, p) * L.speed;
        const t0 = m.t;
        let best = null;
        for (let i = 0; i < mine.length; i++) {
          const q = mine[i], need = Math.max(0, Math.hypot(q.x - p.x, q.y - p.y) - REACH * 0.6) / sp;
          // prefer hitting it high (smash/clear) when there's time
          if (need <= q.t - 0.05) { best = q; if (q.z < 2.3) break; }
        }
        plan.spot = best ? { x: best.x, y: best.y } : mine.length ? { x: mine[mine.length - 1].x, y: mine[mine.length - 1].y } : { x: f.x, y: f.y };
        if (plan.fooled) { plan.spot.x += (rng() - 0.5) * 2.4; plan.spot.y += (rng() - 0.5) * 2.0; }
        else if (L.miss) { plan.spot.x += (rng() + rng() - 1) * L.miss; plan.spot.y += (rng() + rng() - 1) * L.miss; }
        plan.t0 = t0;
      }
    }
    const spot = plan.spot;
    // stand a little behind and to the side of the shuttle's line
    go(spot.x - (spot.x - p.x) * 0, spot.y + sgn(p.side) * 0.35);
    const q = hittable(m, p, s);
    if (q) {
      const leaving = s.z < 0.6 || q.d > REACH * 0.85;
      if (leaving || rng() < L.eager) {
        // decide the shot
        let button = 'clear';
        const opp = teamOf(m, 1 - p.side);
        if (q.z >= SMASH_Z && p.energy > 25 && rng() < L.smash) button = 'smash';
        else if (Math.abs(p.y) < 2.3 && q.z < 1.4) button = rng() < 0.65 ? 'drop' : 'clear';
        else button = rng() < 0.4 ? 'drop' : rng() < 0.15 ? 'smash' : 'clear';
        // aim away from the nearest opponent (smart bots), or anywhere
        let lat = rng() * 2 - 1;
        if (rng() < L.smart && opp.length) {
          const ox = opp.reduce(function (a, o) { return a + o.x; }, 0) / opp.length;
          const worldSide = -Math.sign(ox || (rng() - 0.5));
          lat = worldSide * sgn(p.side) * (0.6 + rng() * 0.4);
        }
        let dep = rng() * 2 - 1;
        if (rng() < L.err) dep += (rng() < 0.5 ? 1 : -1) * 3;                 // the odd unforced error
        out.hit = { button: button, aim: [lat, dep] };
      }
    }
    return out;
  }
  /* apply a bot's movement for one step (bots are simulated on the host) */
  function botMove(m, p, think, dt) {
    if (m.phase === 'serve' && p.id === m.server) return;
    const L = LEVELS[p.bot] || LEVELS.normal;
    if (L.accel) {
      // easy bots can't start or stop instantly
      const ax = think.mx - (p.vx || 0), ay = think.my - (p.vy || 0), a = Math.hypot(ax, ay), lim = L.accel * dt;
      const k = a > lim ? lim / a : 1;
      p.vx = (p.vx || 0) + ax * k; p.vy = (p.vy || 0) + ay * k;
    } else { p.vx = think.mx; p.vy = think.my; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    clampToSide(m, p);
  }

  /* ---------- summary ---------- */
  function summary(m) {
    const rows = m.players.map(function (p) { const s = m.stats[p.id]; return { id: p.id, name: p.name, side: p.side, bot: p.bot, hits: s.hits, smashes: s.smashes, winners: s.winners, errors: s.errors, fastest: s.fastest, aces: s.aces }; });
    rows.sort(function (a, b) { return (a.side === m.winner ? -1 : 0) - (b.side === m.winner ? -1 : 0) || (b.winners - a.winners) || (a.errors - b.errors); });
    const awards = [];
    const top = function (val, ok) { const c = rows.filter(ok); if (!c.length) return null; c.sort(function (a, b) { return val(b) - val(a); }); if (c.length > 1 && val(c[0]) === val(c[1])) return null; return c[0]; };
    let r;
    r = top(function (x) { return x.fastest; }, function (x) { return x.fastest > 0; });
    if (r) awards.push({ id: 'fast', icon: '💥', title: 'Fastest smash', who: r.id, text: r.fastest + ' km/h' });
    r = top(function (x) { return x.winners; }, function (x) { return x.winners >= 1; });
    if (r) awards.push({ id: 'win', icon: '🎯', title: 'Most winners', who: r.id, text: r.winners + ' points won with their own shot' });
    r = top(function (x) { return x.hits; }, function (x) { return x.hits >= 3; });
    if (r) awards.push({ id: 'wall', icon: '🧱', title: 'The wall', who: r.id, text: r.hits + ' shots returned' });
    r = top(function (x) { return x.aces; }, function (x) { return x.aces >= 1; });
    if (r) awards.push({ id: 'ace', icon: '🚀', title: 'Ace server', who: r.id, text: r.aces + ' serve' + (r.aces === 1 ? '' : 's') + ' they couldn’t return' });
    return { rows: rows, awards: awards.slice(0, 4), score: m.score.slice(), winner: m.winner, longest: m.longest, rallies: m.rally };
  }

  return {
    C: C, ZONES: ZONES, preview: preview, G: G, K: K, DT: DT, REACH: REACH, MAX_SPEED: MAX_SPEED, GRACE: GRACE, POINT_PAUSE: POINT_PAUSE, SERVE_WAIT: SERVE_WAIT, SMASH_Z: SMASH_Z, LEVELS: LEVELS, BOT_NAMES: BOT_NAMES, NAMES: NAMES,
    defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, capFor: capFor, modeFor: modeFor, halfW: halfW, sgn: sgn,
    stepShuttle: stepShuttle, fly: fly, launch: launch, speedFor: speedFor, angleFor: angleFor,
    newMatch: newMatch, playerOf: playerOf, nameOf: nameOf, teamOf: teamOf, solo: solo, startServe: startServe,
    moveTo: moveTo, speedCap: speedCap, clampToSide: clampToSide, hittable: hittable, classify: classify, targetFor: targetFor, swing: swing, step: step, inBounds: inBounds, leave: leave,
    handFor: handFor, predict: predict, botThink: botThink, botMove: botMove, summary: summary
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BD;
