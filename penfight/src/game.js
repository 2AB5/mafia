/* ===== Pen Fight engine: desk physics (planck.js) + match rules. No DOM. ===== */
const PF = (function () {
  'use strict';
  const pl = (typeof planck !== 'undefined') ? planck : require('planck');

  const TABLE = { w: 6, h: 9 };                 // desk, centred on 0,0 (world units ~ 5 cm)
  const PEN = { len: 1.6, wid: 0.17 };
  function PEN_LEN_FOR_FRICTION() { return PEN.len; }
  const MAX_IMPULSE = 3.5;
  // Desk friction. Sliding (Coulomb) friction removes a fixed amount of speed every second, so a pen
  // slows steadily and then stops dead, the way it does on a real desk (plain damping makes it creep on ice).
  const SLIDE_DECEL = 6.0;                    // units/s^2
  const SPIN_DECEL = 3 * SLIDE_DECEL * 3 / PEN_LEN_FOR_FRICTION(); // rad/s^2: a spinning pen grips the desk along its whole length, so spin dies quickly
  const MIN_PLAYERS = 2, MAX_PLAYERS = 5;
  const DT = 1 / 60;
  const MAX_ROLL_SECS = 12;

  const SKINS = [
    { id: 'blue',   name: 'Blue ballpoint', body: '#2f66d0', cap: '#18388a', band: '#c9d6f5', tip: '#d8d8d8', clear: true },
    { id: 'black',  name: 'Black gel',      body: '#2a2a30', cap: '#0f0f12', band: '#8f8f9a', tip: '#cfcfcf' },
    { id: 'red',    name: 'Red ballpoint',  body: '#cf2c2c', cap: '#7f1414', band: '#f3c1c1', tip: '#d8d8d8', clear: true },
    { id: 'green',  name: 'Green gel',      body: '#2c9a55', cap: '#145e31', band: '#bfe9cf', tip: '#cfcfcf' },
    { id: 'gold',   name: 'Fountain pen',   body: '#1f2130', cap: '#1f2130', band: '#d9b049', tip: '#d9b049' },
    { id: 'pencil', name: 'Pencil',         body: '#f0bd22', cap: '#e889a2', band: '#c0c4c8', tip: '#3b3127', pencil: true },
    { id: 'pink',   name: 'Highlighter',    body: '#ff5fa8', cap: '#d01f72', band: '#ffd1e6', tip: '#ffffff' }
  ];
  function skinById(id) { return SKINS.find(function (s) { return s.id === id; }) || SKINS[0]; }

  function defaultConfig() { return { target: 3, turnSecs: 30 }; }
  function normalizeConfig(c) {
    c = c || {};
    const t = Number(c.target), s = Number(c.turnSecs);
    return {
      target: [1, 2, 3, 5].indexOf(t) !== -1 ? t : 3,
      turnSecs: [0, 20, 30, 45].indexOf(s) !== -1 ? s : 30
    };
  }

  /* ---------- placement ---------- */
  function startPositions(n, rng) {
    const out = [];
    const rot = rng() * Math.PI * 2;
    const rx = n === 2 ? 0 : 1.75, ry = n === 2 ? 2.7 : 2.75;
    for (let i = 0; i < n; i++) {
      const th = rot + (i / n) * Math.PI * 2;
      let x = rx * Math.cos(th), y = ry * Math.sin(th);
      if (n === 2) { x = (rng() - 0.5) * 1.2; y = i === 0 ? -2.7 : 2.7; }
      // pens lie roughly sideways to the centre, with a little randomness
      const facing = Math.atan2(-y, -x);
      const a = facing + Math.PI / 2 + (rng() - 0.5) * 0.9;
      out.push({ x: round3(x), y: round3(y), a: round3(normAngle(a)) });
    }
    return out;
  }
  function normAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function onTable(x, y) { return Math.abs(x) <= TABLE.w / 2 && Math.abs(y) <= TABLE.h / 2; }

  /* ---------- match ---------- */
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 14) || 'Player'; }
  function newMatch(opts) {
    const rng = opts.rng || Math.random;
    const n = opts.players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('Pen Fight needs ' + MIN_PLAYERS + ' to ' + MAX_PLAYERS + ' players.');
    const seen = {};
    opts.players.forEach(function (p) { if (seen[p.id]) throw new Error('Duplicate player id.'); seen[p.id] = true; });
    const m = {
      v: 1,
      id: opts.id || ('m' + Math.floor(rng() * 1e9).toString(36)),
      cfg: normalizeConfig(opts.cfg),
      players: opts.players.map(function (p) { return { id: p.id, name: cleanName(p.name), skin: skinById(p.skin).id, score: 0 }; }),
      round: 0,
      phase: 'aim',          // 'aim' | 'roll' | 'roundover' | 'over'
      pens: [],
      turn: null,
      turnNo: 0,
      starter: 0,
      roundWinner: null,
      winner: null,
      lastShot: null,
      log: []
    };
    startRound(m, rng);
    return m;
  }
  function startRound(m, rng) {
    rng = rng || Math.random;
    m.round++;
    const pos = startPositions(m.players.length, rng);
    m.pens = m.players.map(function (p, i) { return { id: p.id, x: pos[i].x, y: pos[i].y, a: pos[i].a, out: false }; });
    m.starter = (m.round - 1) % m.players.length;
    m.turn = m.players[m.starter].id;
    m.turnNo++;
    m.phase = 'aim';
    m.roundWinner = null;
    m.lastShot = null;
    addLog(m, 'Round ' + m.round + '. ' + nameOf(m, m.turn) + ' flicks first.');
    return m;
  }
  function nameOf(m, id) { const p = m.players.find(function (q) { return q.id === id; }); return p ? p.name : 'Player'; }
  function penOf(m, id) { return m.pens.find(function (q) { return q.id === id; }) || null; }
  function alivePens(m) { return m.pens.filter(function (p) { return !p.out; }); }
  function addLog(m, x) { m.log.push(x); if (m.log.length > 40) m.log.splice(0, m.log.length - 40); }

  function nextTurn(m) {
    const order = m.players.map(function (p) { return p.id; });
    let i = order.indexOf(m.turn);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(i + k) % order.length];
      const pen = penOf(m, id);
      if (pen && !pen.out) { m.turn = id; m.turnNo++; m.phase = 'aim'; return id; }
    }
    return null;
  }

  /* validate + normalise a shot request; returns null if illegal */
  function checkShot(m, pid, shot) {
    if (!m || m.phase !== 'aim' || m.turn !== pid || !shot) return null;
    if (shot.turnNo !== undefined && shot.turnNo !== m.turnNo) return null;
    const pen = penOf(m, pid);
    if (!pen || pen.out) return null;
    let lx = Number(shot.lx), ix = Number(shot.ix), iy = Number(shot.iy);
    if (!isFinite(lx) || !isFinite(ix) || !isFinite(iy)) return null;
    lx = Math.max(-PEN.len / 2, Math.min(PEN.len / 2, lx));
    let mag = Math.hypot(ix, iy);
    if (mag < 0.02) return null;
    if (mag > MAX_IMPULSE) { ix = ix / mag * MAX_IMPULSE; iy = iy / mag * MAX_IMPULSE; mag = MAX_IMPULSE; }
    return { lx: lx, ix: ix, iy: iy, power: mag / MAX_IMPULSE };
  }

  /* skip the current player (time ran out / left) */
  function skipTurn(m, why) {
    if (m.phase !== 'aim') return false;
    addLog(m, nameOf(m, m.turn) + (why || ' skipped their turn.'));
    nextTurn(m);
    return true;
  }

  /* after a shot settles: write poses back, eliminate, decide round / match */
  function settle(m, poses) {
    const fell = [];
    m.pens.forEach(function (pen, i) {
      if (pen.out) return;
      const p = poses[i];
      if (p) { pen.x = round3(p.x); pen.y = round3(p.y); pen.a = round3(normAngle(p.a)); }
      if (p && p.out) { pen.out = true; fell.push(pen.id); }
    });
    const shooter = m.lastShot ? m.lastShot.by : m.turn;
    if (fell.length) {
      fell.forEach(function (id) { addLog(m, id === shooter ? nameOf(m, id) + ' flicked themselves off the desk!' : nameOf(m, id) + ' was knocked off by ' + nameOf(m, shooter) + '.'); });
    }
    const alive = alivePens(m);
    if (alive.length <= 1) {
      m.phase = 'roundover';
      if (alive.length === 1) {
        const w = m.players.find(function (p) { return p.id === alive[0].id; });
        w.score++;
        m.roundWinner = w.id;
        addLog(m, w.name + ' wins round ' + m.round + '.');
        if (w.score >= m.cfg.target) { m.phase = 'over'; m.winner = w.id; addLog(m, w.name + ' wins the match!'); }
      } else {
        m.roundWinner = null;
        addLog(m, 'Every pen fell. Round ' + m.round + ' is a draw.');
      }
      return { fell: fell, roundOver: true };
    }
    nextTurn(m);
    return { fell: fell, roundOver: false };
  }

  /* remove a player who left mid-match: their pen leaves the desk */
  function forfeit(m, pid) {
    const pen = penOf(m, pid);
    if (!pen || pen.out || m.phase === 'over') return false;
    pen.out = true;
    addLog(m, nameOf(m, pid) + ' left the desk.');
    const alive = alivePens(m);
    if (m.phase === 'aim' && alive.length > 1 && m.turn === pid) nextTurn(m);
    if (alive.length <= 1 && (m.phase === 'aim' || m.phase === 'roll')) {
      return settle(m, m.pens.map(function (p) { return { x: p.x, y: p.y, a: p.a, out: p.out }; }));
    }
    return { fell: [pid], roundOver: false };
  }

  /* ---------- physics ---------- */
  function Sim(m) {
    this.world = new pl.World({ gravity: pl.Vec2(0, 0) });
    this.bodies = [];
    this.hits = 0;
    this.t = 0;
    const self = this;
    m.pens.forEach(function (pen, i) {
      if (pen.out) { self.bodies.push(null); return; }
      const b = self.world.createBody({ type: 'dynamic', position: pl.Vec2(pen.x, pen.y), angle: pen.a, linearDamping: 0.12, angularDamping: 0.2, bullet: true });
      b.createFixture(pl.Box(PEN.len / 2, PEN.wid / 2), { density: 1, friction: 0.25, restitution: 0.6 });
      b.setUserData(i);
      self.bodies.push(b);
    });
    this.out = m.pens.map(function (p) { return !!p.out; });
    this.fellNow = [];
    this.world.on('post-solve', function (contact, imp) {
      const n = imp.normalImpulses[0] || 0;
      if (n > self.hits) self.hits = n;
    });
  }
  Sim.prototype.shoot = function (penIndex, shot) {
    const b = this.bodies[penIndex];
    if (!b) return;
    b.applyLinearImpulse(pl.Vec2(shot.ix, shot.iy), b.getWorldPoint(pl.Vec2(shot.lx, 0)), true);
  };
  Sim.prototype.step = function () {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b) continue;
      const v = b.getLinearVelocity(), sp = Math.hypot(v.x, v.y), dv = SLIDE_DECEL * DT;
      if (sp <= dv) { if (sp > 0) b.setLinearVelocity(pl.Vec2(0, 0)); }
      else b.setLinearVelocity(pl.Vec2(v.x * (1 - dv / sp), v.y * (1 - dv / sp)));
      const w = b.getAngularVelocity(), dw = SPIN_DECEL * DT;
      if (Math.abs(w) <= dw) { if (w !== 0) b.setAngularVelocity(0); }
      else b.setAngularVelocity(w - Math.sign(w) * dw);
    }
    this.world.step(DT, 8, 3);
    this.t += DT;
    const fell = [];
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b || this.out[i]) continue;
      const p = b.getPosition();
      if (!onTable(p.x, p.y)) {
        this.out[i] = true;
        fell.push(i);
        this.lastPose = this.lastPose || {};
        this.lastPose[i] = { x: p.x, y: p.y, a: b.getAngle(), vx: b.getLinearVelocity().x, vy: b.getLinearVelocity().y };
        this.world.destroyBody(b);
        this.bodies[i] = null;
      }
    }
    return fell;
  };
  Sim.prototype.settled = function () {
    if (this.t >= MAX_ROLL_SECS) return true;
    if (this.t < 0.1) return false;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b) continue;
      const v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 0.03 || Math.abs(b.getAngularVelocity()) > 0.06) return false;
    }
    return true;
  };
  Sim.prototype.poses = function (m) {
    const self = this;
    return m.pens.map(function (pen, i) {
      const b = self.bodies[i];
      if (b) { const p = b.getPosition(); return { x: p.x, y: p.y, a: b.getAngle(), out: false }; }
      const lp = self.lastPose && self.lastPose[i];
      if (lp) return { x: lp.x, y: lp.y, a: lp.a, out: true };
      return { x: pen.x, y: pen.y, a: pen.a, out: true };
    });
  };
  Sim.prototype.takeHits = function () { const h = this.hits; this.hits = 0; return h; };

  /* begin a shot on a match: returns the running Sim */
  function beginShot(m, pid, shot) {
    const s = checkShot(m, pid, shot);
    if (!s) return null;
    const idx = m.pens.findIndex(function (p) { return p.id === pid; });
    const sim = new Sim(m);
    sim.shoot(idx, s);
    m.phase = 'roll';
    m.lastShot = { by: pid, lx: round3(s.lx), ix: round3(s.ix), iy: round3(s.iy), power: round3(s.power), turnNo: m.turnNo };
    return sim;
  }

  /* run a whole shot instantly (tests, and fallback) */
  function simulateShot(m, pid, shot) {
    const sim = beginShot(m, pid, shot);
    if (!sim) return null;
    let steps = 0;
    while (!sim.settled() && steps++ < MAX_ROLL_SECS / DT + 5) sim.step();
    return settle(m, sim.poses(m));
  }

  function standings(m) {
    return m.players.slice().sort(function (a, b) { return b.score - a.score; });
  }

  return {
    TABLE: TABLE, PEN: PEN, MAX_IMPULSE: MAX_IMPULSE, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, DT: DT, SKINS: SKINS,
    skinById: skinById, defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, startPositions: startPositions, onTable: onTable,
    newMatch: newMatch, startRound: startRound, nextTurn: nextTurn, checkShot: checkShot, skipTurn: skipTurn, settle: settle, forfeit: forfeit,
    Sim: Sim, beginShot: beginShot, simulateShot: simulateShot, penOf: penOf, alivePens: alivePens, nameOf: nameOf, standings: standings, normAngle: normAngle
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PF;
