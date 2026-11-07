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
  assert.deepStrictEqual(PF.normalizeConfig({}), { target: 3, turnSecs: 30, teams: false });
  assert.deepStrictEqual(PF.normalizeConfig({ target: 5, turnSecs: 0, teams: 1 }), { target: 5, turnSecs: 0, teams: true });
  assert.deepStrictEqual(PF.normalizeConfig({ target: 9, turnSecs: 7 }), { target: 3, turnSecs: 30, teams: false });
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
    const T = PF.tableFor(n);
    const pos = PF.startPositions(n, seeded(s * 13 + n), T);
    pos.forEach(p => {
      for (let k = -1; k <= 1; k += 2) {
        const ex = p.x + Math.cos(p.a) * k * PF.PEN.len / 2, ey = p.y + Math.sin(p.a) * k * PF.PEN.len / 2;
        assert.ok(Math.abs(ex) < T.w / 2 - 0.2 && Math.abs(ey) < T.h / 2 - 0.2, 'pen end near edge n=' + n);
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
    const sim = PF.beginShot(m, 'p0', { lx: lx, ix: nx * 1.5, iy: ny * 1.5 });
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
function runShot(m, pid, shot) { const sim = PF.beginShot(m, pid, shot); let n = 0; while (!sim.settled() && n++ < 2000) sim.step(); return PF.settle(m, sim.poses(m)); }
function pushTrial(gap, s, endOn) {
  const m = PF.newMatch({ players: P(4), rng: seeded(1) });      // full 8x12 desk
  m.pens.forEach((p, i) => { if (i > 1) { p.x = -2.5 - i * 0.4; p.y = -m.table.h / 2 + 1; p.a = Math.PI / 2; } });
  const ty = m.table.h / 2 - gap;
  // broadside: target lies across the push (it rolls); end-on: target points along the push (it slides)
  const ta = endOn ? Math.PI / 2 : 0;
  m.pens[1].x = 0; m.pens[1].y = ty; m.pens[1].a = ta;
  m.pens[0].x = (s % 5 - 2) * 0.12; m.pens[0].y = ty - (endOn ? 2.0 : 1.0); m.pens[0].a = Math.PI / 2;
  runShot(m, 'p0', { lx: (s % 3 - 1) * 0.3, ix: 0, iy: PF.impulseForPull(1), turnNo: m.turnNo });
  return PF.penOf(m, 'p1').out;
}
test('edge pushes knock pens off; broadside hits roll further than end-on hits; the middle resists', () => {
  let near = 0, broad = 0, end = 0, mid = 0;
  for (let s = 0; s < 40; s++) { if (pushTrial(1, s)) near++; if (pushTrial(3, s)) broad++; if (pushTrial(3, s, true)) end++; if (pushTrial(5.5, s, true)) mid++; }
  assert.ok(near >= 34, 'near edge knocked ' + near + '/40');
  assert.ok(broad > end + 8, 'broadside ' + broad + ' vs end-on ' + end);
  assert.strictEqual(mid, 0, 'end-on push from the middle knocked ' + mid + '/40');
  console.log('  full push from 1 off the edge: ' + near + '/40; from 3 off: broadside ' + broad + '/40, end-on ' + end + '/40; middle ' + mid + '/40');
});
test('pen types are balanced: each one beats the ballpoint in 30-70% of duels', () => {
  const { duel } = require('./duel-bot.js');
  for (const sk of PF.SKINS) {
    if (sk.id === 'blue') continue;
    const r = duel(sk.id, 'blue', 30, 2);
    assert.ok(r.rate >= 0.3 && r.rate <= 0.7, sk.id + ' beat the ballpoint ' + Math.round(r.rate * 100) + '%');
  }
});
test('a 2-player opening flick almost never wins outright (you must approach)', () => {
  let wins = 0, tries = 0;
  for (const sk of PF.SKINS) for (let s = 1; s <= 20; s++) {
    const m = PF.newMatch({ players: [{ id: 'p0', name: 'A', skin: sk.id }, { id: 'p1', name: 'B', skin: PF.SKINS[s % 7].id }], rng: seeded(300 + s) });
    const a = PF.penOf(m, 'p0'), b = PF.penOf(m, 'p1'), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), J = PF.impulseForPull(1, sk.id);
    runShot(m, 'p0', { lx: ((s % 5) - 2) * 0.2, ix: dx / d * J, iy: dy / d * J, turnNo: m.turnNo });
    tries++; if (PF.penOf(m, 'p1').out && !PF.penOf(m, 'p0').out) wins++;
  }
  assert.ok(wins / tries <= 0.06, 'opening wins ' + wins + '/' + tries);
  console.log('  2-player opening full flick wins outright ' + wins + '/' + tries);
});
test('flicks stop quickly and the landing ghost is accurate', () => {
  for (const [pull, lx] of [[0.25, 0], [0.6, 0.3], [1, 0.75], [1, -0.6]]) {
    const m = PF.newMatch({ players: P(2), rng: seeded(9) });
    m.table = { w: 40, h: 40 }; m.pens[0].x = 0; m.pens[0].y = -1; m.pens[0].a = 0.3; m.pens[1].x = 15; m.pens[1].y = 15;
    const shot = { lx, ix: PF.impulseForPull(pull) * 0.2, iy: PF.impulseForPull(pull) * 0.98, turnNo: m.turnNo };
    const pred = PF.predict({ x: 0, y: -1, a: 0.3 }, shot);
    const sim = PF.beginShot(m, 'p0', shot); let t = 0;
    while (!sim.settled()) { sim.step(); t += PF.DT; }
    const p = sim.poses(m)[0];
    assert.ok(t < 2.6, 'stopped in ' + t.toFixed(2) + ' s');
    assert.ok(Math.hypot(p.x - pred.x, p.y - pred.y) < 0.15, 'ghost position off by ' + Math.hypot(p.x - pred.x, p.y - pred.y).toFixed(3));
    assert.ok(Math.abs(PF.normAngle(p.a - pred.a)) < 0.35, 'ghost angle off');
  }
  for (const sk of PF.SKINS) for (const dir of [0, Math.PI / 2]) {
    const d = pull => PF.predict({ x: 0, y: 0, a: dir }, { lx: 0, ix: PF.impulseForPull(pull, sk.id), iy: 0 }, sk.id).dist;
    assert.ok(Math.abs(d(0.5) / d(1) - 0.5) < 0.03, 'pull maps linearly to distance for ' + sk.id);
  }
  // a lengthwise full flick goes the pen's reach; sideways it rolls further unless it is the pencil
  for (const sk of PF.SKINS) {
    const along = PF.predict({ x: 0, y: 0, a: 0 }, { lx: 0, ix: PF.impulseForPull(1, sk.id), iy: 0 }, sk.id).dist;
    const side = PF.predict({ x: 0, y: 0, a: 0 }, { lx: 0, ix: 0, iy: PF.impulseForPull(1, sk.id) }, sk.id).dist;
    assert.ok(Math.abs(along - sk.reach) < 0.15, sk.id + ' reach ' + along.toFixed(2));
    if (sk.roll < 1) assert.ok(side > along * 1.05, sk.id + ' should roll further sideways'); else assert.ok(Math.abs(side - along) < 0.1, 'pencil does not roll');
  }
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
      const r = rng() < 0.08 ? PF.skipTurn(m, ' skipped.') : PF.simulateShot(m, m.turn, aimAt(m, m.turn, target.id, 0.8 + rng() * 0.2, (rng() - 0.5) * 1.4));
      assert.ok(r, 'legal shot rejected');
      shots++;
      m.pens.forEach(p => { if (!p.out) assert.ok(PF.onTable(p.x, p.y, m.table), 'live pen off the desk'); });
    }
    matches++;
    const w = m.players.find(p => p.id === m.winner);
    assert.ok(w && w.score === 2, 'winner has target score');
    assert.ok(m.players.every(p => p.score <= 2));
  }
  console.log('  simulated ' + matches + ' matches, ' + rounds + ' rounds, ' + shots + ' shots');
});

/* ---------- teams ---------- */
const TP = (n, teams) => P(n).map((p, i) => ({ ...p, team: teams ? teams[i] : (i % 2) }));
test('team balancing', () => {
  const b4 = PF.balanceTeams(P(4)); assert.deepStrictEqual([0, 1].map(t => Object.values(b4).filter(x => x === t).length), [2, 2]);
  const b5 = PF.balanceTeams(P(5)); const c5 = [0, 1].map(t => Object.values(b5).filter(x => x === t).length); assert.ok(Math.abs(c5[0] - c5[1]) === 1);
  const keep = PF.balanceTeams([{ id: 'a', team: 1 }, { id: 'b', team: 0 }, { id: 'c' }, { id: 'd' }]); assert.strictEqual(keep.a, 1); assert.strictEqual(keep.b, 0);
  const fix = PF.balanceTeams([{ id: 'a', team: 0 }, { id: 'b', team: 0 }, { id: 'c', team: 0 }, { id: 'd', team: 0 }]);
  assert.deepStrictEqual([0, 1].map(t => Object.values(fix).filter(x => x === t).length), [2, 2]);
});
test('team match validation', () => {
  assert.throws(() => PF.newMatch({ players: TP(2), cfg: { teams: true } }));
  assert.throws(() => PF.newMatch({ players: TP(3, [0, 0, 0]), cfg: { teams: true } }));
  assert.throws(() => PF.newMatch({ players: P(4), cfg: { teams: true } }));
  assert.doesNotThrow(() => PF.newMatch({ players: TP(3, [0, 1, 1]), cfg: { teams: true } }));
  assert.doesNotThrow(() => PF.newMatch({ players: TP(5), cfg: { teams: true } }));
});
test('teams sit alternately and take turns alternately, rotating members', () => {
  const m = PF.newMatch({ players: TP(4, [0, 0, 1, 1]), cfg: { teams: true }, rng: seeded(21) });
  // seats go A,B,A,B around the desk: each pen's two nearest neighbours are opponents
  m.pens.forEach(pen => {
    const others = m.pens.filter(q => q.id !== pen.id).sort((a, b) => Math.hypot(a.x - pen.x, a.y - pen.y) - Math.hypot(b.x - pen.x, b.y - pen.y));
    assert.ok(PF.teamOf(m, others[0].id) !== PF.teamOf(m, pen.id), 'nearest pen is an opponent');
  });
  const seq = [m.turn];
  for (let i = 0; i < 7; i++) { PF.skipTurn(m); seq.push(m.turn); }
  assert.deepStrictEqual(seq.map(id => PF.teamOf(m, id)), [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.deepStrictEqual(seq.slice(0, 4), ['p0', 'p2', 'p1', 'p3']);
});
test('3 v 2: the smaller team still alternates; out members are skipped', () => {
  const m = PF.newMatch({ players: TP(5, [0, 0, 0, 1, 1]), cfg: { teams: true }, rng: seeded(22) });
  PF.penOf(m, 'p3').out = true;
  const seq = [m.turn];
  for (let i = 0; i < 5; i++) { PF.skipTurn(m); seq.push(m.turn); }
  assert.ok(seq.filter((id, i) => i % 2 === 1).every(id => id === 'p4'), 'only p4 left on red: ' + seq.join(','));
  assert.deepStrictEqual(seq.map(id => PF.teamOf(m, id)), [0, 1, 0, 1, 0, 1]);
});
test('a team wins the round when every opponent is off, even with losses', () => {
  const m = PF.newMatch({ players: TP(4, [0, 0, 1, 1]), cfg: { teams: true, target: 2 }, rng: seeded(23) });
  PF.penOf(m, 'p0').out = true; PF.penOf(m, 'p2').out = true;
  let r = PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.ok(!r.roundOver, 'both teams still have a pen');
  PF.penOf(m, 'p3').out = true;
  r = PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.ok(r.roundOver);
  assert.strictEqual(m.roundTeam, 0);
  assert.deepStrictEqual(m.teamScore, [1, 0]);
  PF.startRound(m, seeded(24));
  assert.strictEqual(PF.teamOf(m, m.turn), 1, 'the other team starts round 2');
  m.pens.filter(p => PF.teamOf(m, p.id) === 1).forEach(p => p.out = true);
  PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.strictEqual(m.phase, 'over');
  assert.strictEqual(m.winnerTeam, 0);
});
test('teams: everyone falling is a draw; forfeits end rounds', () => {
  const m = PF.newMatch({ players: TP(3, [0, 1, 1]), cfg: { teams: true }, rng: seeded(25) });
  m.pens.forEach(p => p.out = true);
  PF.settle(m, m.pens.map(p => ({ ...p })));
  assert.strictEqual(m.roundTeam, null); assert.deepStrictEqual(m.teamScore, [0, 0]);
  PF.startRound(m, seeded(26));
  const r = PF.forfeit(m, 'p0');
  assert.ok(r.roundOver); assert.strictEqual(m.roundTeam, 1);
});
test('knocking your own teammate off is logged as friendly fire', () => {
  const m = PF.newMatch({ players: TP(4, [0, 1, 0, 1]), cfg: { teams: true }, rng: seeded(27) });
  m.lastShot = { by: 'p0' };
  PF.penOf(m, 'p2').out = false;
  const poses = m.pens.map(p => ({ ...p, out: p.id === 'p2' }));
  PF.settle(m, poses);
  assert.ok(m.log.some(l => /own teammate/.test(l)), m.log.join(' | '));
});
test('random team matches finish with the winning team at the target', () => {
  let n = 0;
  for (const split of [[0, 1, 1], [0, 0, 1, 1], [0, 1, 0, 1, 0]]) for (let s = 1; s <= 12; s++) {
    const rng = seeded(7000 + s * 17 + split.length);
    const m = PF.newMatch({ players: TP(split.length, split), rng, cfg: { teams: true, target: 2 } });
    let guard = 0;
    while (m.phase !== 'over') {
      if (guard++ >= 3000) { console.log('    stuck: split ' + split.join('') + ' seed ' + s + ' round ' + m.round + ' score ' + m.teamScore + ' pens ' + JSON.stringify(m.pens.map(p => [p.id, PF.teamOf(m, p.id), p.out, +p.x.toFixed(1), +p.y.toFixed(1)]))); assert.fail('team match did not end'); }
      if (m.phase === 'roundover') { PF.startRound(m, rng); continue; }
      const myTeam = PF.teamOf(m, m.turn);
      const foes = PF.alivePens(m).filter(p => PF.teamOf(m, p.id) !== myTeam);
      assert.ok(foes.length > 0, 'it is never a turn when no opponent is left');
      // like a real player: go for the rival with the shortest push line to an edge
      const me = PF.penOf(m, m.turn);
      const edgeDist = q => { const dx = q.x - me.x, dy = q.y - me.y, dd = Math.hypot(dx, dy), ux = dx / dd, uy = dy / dd;
        const ex = ux > 0 ? (m.table.w / 2 - q.x) / ux : ux < 0 ? (-m.table.w / 2 - q.x) / ux : 1e9;
        const ey = uy > 0 ? (m.table.h / 2 - q.y) / uy : uy < 0 ? (-m.table.h / 2 - q.y) / uy : 1e9;
        return Math.min(ex, ey) + dd * 0.35; };
      const t = rng() < 0.7 ? foes.slice().sort((a, b) => edgeDist(a) - edgeDist(b))[0] : foes[Math.floor(rng() * foes.length)];
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      const J = PF.impulseForPull(rng() < 0.5 ? 1 : Math.min(1, d / PF.MAX_TRAVEL + 0.45));
      const wob = (rng() - 0.5) * 0.18, cw = Math.cos(wob), sw = Math.sin(wob);          // human aim wobble (about ±5°)
      const ux = (t.x - me.x) / d, uy = (t.y - me.y) / d;
      PF.simulateShot(m, m.turn, { lx: (rng() - 0.5) * 0.6, ix: (ux * cw - uy * sw) * J, iy: (ux * sw + uy * cw) * J, turnNo: m.turnNo });
    }
    n++;
    assert.strictEqual(m.teamScore[m.winnerTeam], 2);
  }
  console.log('  simulated ' + n + ' team matches (2v1, 2v2, 3v2)');
});

/* ---------- computer players ---------- */
test('bots make legal, varied shots and never act out of turn', () => {
  const m = PF.newMatch({ players: P(4).map((p, i) => ({ ...p, bot: i ? 'normal' : undefined })), rng: seeded(31) });
  assert.strictEqual(PF.botPlan(m, 'p1', 'normal', seeded(1)), null, 'not its turn');
  const dirs = [];
  for (let k = 0; k < 10; k++) {
    const plan = PF.botPlan(m, 'p0', 'normal', seeded(50 + k));
    assert.ok(plan && PF.checkShot(m, 'p0', plan), 'legal plan');
    assert.ok(plan.think >= 700 && plan.think <= 1800, 'thinks like a person');
    dirs.push(plan.dir);
  }
  const mean = dirs.reduce((a, b) => a + b, 0) / dirs.length;
  const sd = Math.sqrt(dirs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / dirs.length);
  assert.ok(sd > 0.15, 'same position, different plans (spread ' + sd.toFixed(2) + ' rad)');
  assert.ok(m.pens.every(p => !p.out) && m.phase === 'aim' && m.turnNo === 1, 'planning does not touch the real match');
});
test('harder bots win more, and bot matches always finish', () => {
  let hard = 0, games = 24;
  for (let g = 0; g < games; g++) {
    const rng = seeded(900 + g);
    const lv = g % 2 ? ['hard', 'easy'] : ['easy', 'hard'];
    const m = PF.newMatch({ players: [{ id: 'a', name: 'A', skin: PF.SKINS[g % 7].id, bot: lv[0] }, { id: 'b', name: 'B', skin: PF.SKINS[(g + 3) % 7].id, bot: lv[1] }], rng, cfg: { target: 1 } });
    let guard = 0;
    while (m.phase !== 'over') {
      assert.ok(guard++ < 300, 'bot match did not finish');
      if (m.phase === 'roundover') { PF.startRound(m, rng); continue; }
      const me = m.players.find(p => p.id === m.turn);
      assert.ok(PF.simulateShot(m, m.turn, PF.botPlan(m, m.turn, me.bot, rng)), 'bot shot rejected');
    }
    if (m.players.find(p => p.id === m.winner).bot === 'hard') hard++;
  }
  assert.ok(hard / games >= 0.7, 'hard beat easy ' + hard + '/' + games);
  console.log('  hard bot beat easy bot ' + hard + '/' + games);
});
test('bots play team matches and avoid knocking teammates', () => {
  const rng = seeded(77);
  const m = PF.newMatch({ players: [0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'N' + i, skin: PF.SKINS[i].id, team: i % 2, bot: 'hard' })), cfg: { teams: true, target: 1 }, rng });
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 300) { if (m.phase === 'roundover') { PF.startRound(m, rng); continue; } PF.simulateShot(m, m.turn, PF.botPlan(m, m.turn, 'hard', rng)); }
  assert.strictEqual(m.phase, 'over');
  const mates = Object.values(m.stats).reduce((a, s) => a + s.mate, 0), kos = Object.values(m.stats).reduce((a, s) => a + s.ko, 0);
  assert.ok(kos > mates, 'knock-offs ' + kos + ' vs teammates hit ' + mates);
});
test('match stats count every shot, hit, knock-off and skip', () => {
  for (const [seed, n, teams] of [[5, 3, false], [9, 2, false], [13, 4, true], [21, 5, false]]) {
    const rng = seeded(seed);
    const players = P(n).map((p, i) => teams ? { ...p, team: i % 2 } : p);
    const m = PF.newMatch({ players, cfg: { target: 2, teams }, rng });
    let shots = {}, skips = 0, guard = 0, rounds = 0, aliveEnds = 0;
    players.forEach(p => shots[p.id] = 0);
    while (m.phase !== 'over' && guard++ < 600) {
      if (m.phase === 'roundover') { PF.startRound(m, rng); continue; }
      if (rng() < 0.05) { PF.skipTurn(m); skips++; continue; }
      const who = m.turn, k0 = m.round;
      const res = PF.simulateShot(m, who, PF.botPlan(m, who, 'normal', rng));
      assert.ok(res, 'shot accepted');
      shots[who]++;
      if (res.roundOver) { rounds++; aliveEnds += PF.alivePens(m).length; }
    }
    assert.strictEqual(m.phase, 'over');
    const sum = PF.matchSummary(m);
    assert.strictEqual(sum.rows.length, n);
    let tot = 0, ko = 0, fellByOthers = 0, mate = 0, skipT = 0, alive = 0;
    sum.rows.forEach(r => {
      assert.strictEqual(r.shots, shots[r.id], 'shots for ' + r.name);
      assert.ok(r.hit <= r.shots && r.hitPct >= 0 && r.hitPct <= 100);
      assert.ok(r.best <= r.ko && r.power >= 0 && r.power <= 100);
      tot += r.shots; ko += r.ko; mate += r.mate; fellByOthers += r.fell; skipT += r.skip; alive += r.alive;
    });
    assert.strictEqual(sum.totalShots, tot);
    assert.strictEqual(ko + mate, fellByOthers, 'every pen knocked off by someone else is counted once');
    assert.strictEqual(skipT, skips);
    assert.strictEqual(alive, aliveEnds);
    if (!teams) assert.strictEqual(sum.rows[0].id, m.winner, 'winner listed first');
    else assert.strictEqual(sum.rows[0].team, m.winnerTeam, 'winning team listed first');
    const ids = sum.awards.map(a => a.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    sum.awards.forEach(a => assert.ok(players.some(p => p.id === a.who) && a.title && a.text));
  }
});
test('a pen that touches another counts as a hit, a miss does not', () => {
  const m = PF.newMatch({ players: P(2), rng: seeded(3) });
  m.pens[0].x = 0; m.pens[0].y = -2; m.pens[0].a = 0;
  m.pens[1].x = 0; m.pens[1].y = 0; m.pens[1].a = 0;
  m.turn = 'p0';
  PF.simulateShot(m, 'p0', { lx: 0, ix: 0, iy: PF.MAX_IMPULSE * 0.5, turnNo: m.turnNo });
  assert.strictEqual(m.stats.p0.shots, 1); assert.strictEqual(m.stats.p0.hit, 1);
  m.turn = 'p1'; m.phase = 'aim';
  const b = PF.penOf(m, 'p1'), a = PF.penOf(m, 'p0');
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  PF.simulateShot(m, 'p1', { lx: 0, ix: dx / d * PF.MAX_IMPULSE * 0.15, iy: dy / d * PF.MAX_IMPULSE * 0.15, turnNo: m.turnNo });
  assert.strictEqual(m.stats.p1.shots, 1); assert.strictEqual(m.stats.p1.hit, 0, 'flick away from the other pen is a miss');
});
test('old saved matches without new stat fields still summarise', () => {
  const m = PF.newMatch({ players: P(3), rng: seeded(4) });
  m.stats = { p0: { ko: 1, self: 0, mate: 0 } };
  const s = PF.matchSummary(m);
  assert.strictEqual(s.rows.length, 3); assert.strictEqual(s.totalShots, 0);
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
