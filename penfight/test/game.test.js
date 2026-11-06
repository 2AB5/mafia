const assert = require('assert');
const PF = require('../src/game.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL: ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n  ')); } }
function seeded(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const P = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'N' + i, skin: PF.SKINS[i].id }));
function segDist(a, b) {
  // min distance between two pen centre-lines (approx, sampled)
  let best = Infinity;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const s = (i / 10 - 0.5) * PF.PEN.len, t = (j / 10 - 0.5) * PF.PEN.len;
    const x1 = a.x + Math.cos(a.a) * s, y1 = a.y + Math.sin(a.a) * s, x2 = b.x + Math.cos(b.a) * t, y2 = b.y + Math.sin(b.a) * t;
    best = Math.min(best, Math.hypot(x1 - x2, y1 - y2));
  }
  return best;
}
function aimAt(m, from, to, power, lx) {
  const a = PF.penOf(m, from), b = PF.penOf(m, to);
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  return { lx: lx || 0, ix: dx / d * PF.MAX_IMPULSE * power, iy: dy / d * PF.MAX_IMPULSE * power, turnNo: m.turnNo };
}

test('config normalisation', () => {
  assert.deepStrictEqual(PF.normalizeConfig({}), { target: 3, turnSecs: 30 });
  assert.deepStrictEqual(PF.normalizeConfig({ target: 5, turnSecs: 0 }), { target: 5, turnSecs: 0 });
  assert.deepStrictEqual(PF.normalizeConfig({ target: 9, turnSecs: 7 }), { target: 3, turnSecs: 30 });
});
test('player count limits', () => {
  assert.throws(() => PF.newMatch({ players: P(1) }));
  assert.throws(() => PF.newMatch({ players: P(6).map((p, i) => ({ ...p, skin: 'blue' })) }));
  for (let n = 2; n <= 5; n++) assert.doesNotThrow(() => PF.newMatch({ players: P(n) }));
  const d = P(3); d[1].id = 'p0';
  assert.throws(() => PF.newMatch({ players: d }));
});
test('start positions: on the desk, not touching, settled', () => {
  for (let n = 2; n <= 5; n++) for (let s = 1; s <= 200; s++) {
    const pos = PF.startPositions(n, seeded(s * 13 + n));
    pos.forEach(p => {
      for (let k = -1; k <= 1; k += 2) {
        const ex = p.x + Math.cos(p.a) * k * PF.PEN.len / 2, ey = p.y + Math.sin(p.a) * k * PF.PEN.len / 2;
        assert.ok(Math.abs(ex) < PF.TABLE.w / 2 - 0.2 && Math.abs(ey) < PF.TABLE.h / 2 - 0.2, 'pen end near edge n=' + n);
      }
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(segDist(pos[i], pos[j]) > 0.45, 'pens too close n=' + n + ' seed=' + s);
  }
});
test('first round setup', () => {
  const m = PF.newMatch({ players: P(4), rng: seeded(1) });
  assert.strictEqual(m.round, 1);
  assert.strictEqual(m.phase, 'aim');
  assert.strictEqual(m.turn, 'p0');
  assert.strictEqual(m.pens.length, 4);
  assert.ok(m.pens.every(p => !p.out));
});
test('shot validation', () => {
  const m = PF.newMatch({ players: P(3), rng: seeded(2) });
  assert.strictEqual(PF.checkShot(m, 'p1', { lx: 0, ix: 1, iy: 0 }), null, 'not your turn');
  assert.strictEqual(PF.checkShot(m, 'p0', { lx: 0, ix: 0, iy: 0 }), null, 'zero');
  assert.strictEqual(PF.checkShot(m, 'p0', { lx: 'x', ix: 1, iy: 0 }), null, 'NaN');
  assert.strictEqual(PF.checkShot(m, 'p0', { lx: 0, ix: 1, iy: 0, turnNo: m.turnNo + 1 }), null, 'stale turn');
  const s = PF.checkShot(m, 'p0', { lx: 99, ix: 100, iy: 0 });
  assert.ok(s && s.lx === PF.PEN.len / 2 && Math.abs(Math.hypot(s.ix, s.iy) - PF.MAX_IMPULSE) < 1e-9 && s.power === 1, 'clamped');
  m.phase = 'roll';
  assert.strictEqual(PF.checkShot(m, 'p0', { lx: 0, ix: 1, iy: 0 }), null, 'mid roll');
});
test('a soft shot moves the pen and passes the turn', () => {
  const m = PF.newMatch({ players: P(3), rng: seeded(3) });
  const before = { ...PF.penOf(m, 'p0') };
  const r = PF.simulateShot(m, 'p0', { lx: 0, ix: 0.8, iy: 0.3, turnNo: m.turnNo });
  assert.ok(r && !r.roundOver);
  const after = PF.penOf(m, 'p0');
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.2, 'pen moved');
  assert.strictEqual(m.turn, 'p1');
  assert.strictEqual(m.phase, 'aim');
});
test('off-centre hits spin the pen, centre hits barely do', () => {
  const spin = lx => {
    const m = PF.newMatch({ players: P(2), rng: seeded(4) });
    const pen = PF.penOf(m, 'p0'), a0 = pen.a;
    const nx = -Math.sin(a0), ny = Math.cos(a0);              // push sideways
    const sim = PF.beginShot(m, 'p0', { lx: lx, ix: nx * 0.5, iy: ny * 0.5 });
    for (let i = 0; i < 30; i++) sim.step();
    return Math.abs(sim.poses(m)[0].a - a0);
  };
  assert.ok(spin(0.75) > 0.4, 'tip hit spins');
  assert.ok(spin(0) < 0.05, 'centre hit does not');
});
test('flicking yourself off the edge eliminates you; 2-player round ends', () => {
  const m = PF.newMatch({ players: P(2), rng: seeded(5) });
  const pen = PF.penOf(m, 'p0');
  const dir = pen.y < 0 ? -1 : 1;
  const r = PF.simulateShot(m, 'p0', { lx: 0, ix: 0, iy: dir * PF.MAX_IMPULSE, turnNo: m.turnNo });
  assert.ok(PF.penOf(m, 'p0').out, 'own pen fell');
  assert.ok(r.roundOver);
  assert.strictEqual(m.roundWinner, 'p1');
  assert.strictEqual(m.players[1].score, 1);
  assert.ok(m.log.some(l => /themselves off/.test(l)));
});
test('knocking an opponent off works often with direct full-power hits', () => {
  let knocked = 0, tries = 0;
  for (let s = 1; s <= 60; s++) {
    const m = PF.newMatch({ players: P(2), rng: seeded(100 + s) });
    tries++;
    PF.simulateShot(m, 'p0', aimAt(m, 'p0', 'p1', 1));
    if (PF.penOf(m, 'p1').out) knocked++;
  }
  assert.ok(knocked >= 40, 'knocked ' + knocked + '/' + tries);
  console.log('  direct full-power hit knocks the opponent off ' + knocked + '/' + tries + ' times');
});
test('round over -> next round resets pens, rotates the starter, keeps scores', () => {
  const m = PF.newMatch({ players: P(3), rng: seeded(6), cfg: { target: 2 } });
  PF.penOf(m, 'p1').out = true; PF.penOf(m, 'p2').out = true;
  PF.settle(m, m.pens.map(p => ({ x: p.x, y: p.y, a: p.a, out: p.out })));
  assert.strictEqual(m.phase, 'roundover');
  assert.strictEqual(m.players[0].score, 1);
  PF.startRound(m, seeded(7));
  assert.strictEqual(m.round, 2);
  assert.strictEqual(m.turn, 'p1');
  assert.ok(m.pens.every(p => !p.out));
  assert.strictEqual(m.players[0].score, 1);
});
test('reaching the target ends the match', () => {
  const m = PF.newMatch({ players: P(2), rng: seeded(8), cfg: { target: 1 } });
  PF.penOf(m, 'p0').out = true;
  PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.strictEqual(m.phase, 'over');
  assert.strictEqual(m.winner, 'p1');
});
test('all pens falling in one shot is a draw (no point)', () => {
  const m = PF.newMatch({ players: P(2), rng: seeded(9) });
  m.pens.forEach(p => p.out = true);
  const r = PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.ok(r.roundOver);
  assert.strictEqual(m.roundWinner, null);
  assert.ok(m.players.every(p => p.score === 0));
});
test('turn order skips pens that are out', () => {
  const m = PF.newMatch({ players: P(5), rng: seeded(10) });
  PF.penOf(m, 'p1').out = true; PF.penOf(m, 'p2').out = true;
  PF.nextTurn(m);
  assert.strictEqual(m.turn, 'p3');
  PF.nextTurn(m); PF.nextTurn(m);
  assert.strictEqual(m.turn, 'p0');
});
test('skip and forfeit', () => {
  const m = PF.newMatch({ players: P(3), rng: seeded(11) });
  const t = m.turnNo;
  assert.ok(PF.skipTurn(m, ' ran out of time.'));
  assert.strictEqual(m.turn, 'p1');
  assert.ok(m.turnNo > t);
  PF.forfeit(m, 'p1');
  assert.ok(PF.penOf(m, 'p1').out);
  assert.strictEqual(m.turn, 'p2');
  const r = PF.forfeit(m, 'p2');
  assert.ok(r.roundOver);
  assert.strictEqual(m.roundWinner, 'p0');
});
test('state is plain JSON', () => {
  const m = PF.newMatch({ players: P(4), rng: seeded(12) });
  PF.simulateShot(m, 'p0', aimAt(m, 'p0', 'p1', 0.8, 0.3));
  const c = JSON.parse(JSON.stringify(m));
  assert.deepStrictEqual(c, m);
});
test('random full matches 2..5 players terminate with consistent results', () => {
  let matches = 0, rounds = 0, shots = 0;
  for (let n = 2; n <= 5; n++) for (let s = 1; s <= 40; s++) {
    const rng = seeded(n * 1000 + s);
    const m = PF.newMatch({ players: P(n), rng: rng, cfg: { target: 2 } });
    let guard = 0;
    while (m.phase !== 'over') {
      assert.ok(guard++ < 2000, 'match did not end');
      if (m.phase === 'roundover') { rounds++; PF.startRound(m, rng); continue; }
      assert.strictEqual(m.phase, 'aim');
      const me = PF.penOf(m, m.turn);
      assert.ok(me && !me.out, 'turn belongs to a live pen');
      const others = PF.alivePens(m).filter(p => p.id !== m.turn);
      const target = others[Math.floor(rng() * others.length)];
      const r = rng() < 0.08 ? PF.skipTurn(m, ' skipped.') : PF.simulateShot(m, m.turn, aimAt(m, m.turn, target.id, 0.55 + rng() * 0.45, (rng() - 0.5) * 1.4));
      assert.ok(r, 'legal shot rejected');
      shots++;
      m.pens.forEach(p => { if (!p.out) assert.ok(PF.onTable(p.x, p.y), 'live pen off the desk'); });
    }
    matches++;
    const w = m.players.find(p => p.id === m.winner);
    assert.ok(w && w.score === 2, 'winner has target score');
    assert.ok(m.players.every(p => p.score <= 2));
  }
  console.log('  simulated ' + matches + ' matches, ' + rounds + ' rounds, ' + shots + ' shots');
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
