const assert = require('assert');
const BD = require('../src/game.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL: ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); } }
function seeded(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const two = (b0, b1) => [{ id: 'a', name: 'A', side: 0, bot: b0 }, { id: 'b', name: 'B', side: 1, bot: b1 }];
function rallyFrom(m, id, x, y, z) { const p = BD.playerOf(m, id); p.x = x; p.y = y; p.energy = 100; p.swing = 0; m.phase = 'rally'; m.lastHitTeam = null; m.landed = null; m.shuttle = { x: x, y: y - BD.sgn(p.side) * 0.2, z: z, vx: 0, vy: 0, vz: 0 }; return p; }
function runUntilPoint(m, rng) { const before = m.score[0] + m.score[1]; for (let i = 0; i < 2000 && m.score[0] + m.score[1] === before && m.phase !== 'over'; i++) BD.step(m, 1 / 60, rng); }
/* play a whole match with bots on every spot */
function botMatch(players, seed, cfg) {
  const rng = seeded(seed);
  const m = BD.newMatch({ players, rng, cfg });
  const mem = {};
  let steps = 0, maxRally = 0;
  while (m.phase !== 'over' && steps < 60 * 60 * 30) {
    m.players.forEach(p => {
      if (!p.bot || p.left) return;
      const th = BD.botThink(m, p, rng, mem[p.id] || (mem[p.id] = {}));
      BD.botMove(m, p, th, 1 / 60);
      if (th.hit) BD.swing(m, p.id, th.hit.button, th.hit.aim, rng, []);
    });
    BD.step(m, 1 / 60, rng);
    maxRally = Math.max(maxRally, m.rallyHits);
    steps++;
  }
  return { m, secs: steps / 60, maxRally };
}

test('shuttle falls at a real shuttle’s terminal speed (about 6.7 m/s)', () => {
  const s = { x: 0, y: 0, z: 40, vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 1500; i++) BD.stepShuttle(s, BD.DT);
  assert.ok(Math.abs(Math.abs(s.vz) - 6.67) < 0.05, s.vz);
});
test('a hard hit slows down fast: drag, not a straight line', () => {
  const f = BD.fly(BD.launch({ x: 0, y: 5, z: 2 }, 0, -1, 50, 0.6));
  const s = { x: 0, y: 5, z: 2, vx: 0, vy: -50 * Math.cos(0.6), vz: 50 * Math.sin(0.6) };
  for (let i = 0; i < 120; i++) BD.stepShuttle(s, BD.DT);
  assert.ok(Math.hypot(s.vx, s.vy, s.vz) < 12, 'after 1 s a 50 m/s hit is much slower');
  assert.ok(f.t > 1.5 && f.t < 4);
});
test('shots land where they are aimed and clear the net', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(1) });
  const cases = [['clear', 'clear', 0, 5.8, 2.0, [5.3, 6.5]], ['lift', 'clear', 0, 1.2, 0.5, [4.8, 6.4]], ['drop', 'drop', 0, 5.5, 2.1, [1.7, 3.3]], ['net', 'drop', 0.5, 0.9, 0.5, [0.6, 1.8]], ['smash', 'smash', -1, 4, 2.6, [2.5, 5.4]], ['drive', 'smash', 1, 3.5, 1.3, [3.5, 5.7]]];
  for (const [kind, btn, x, y, z, range] of cases) {
    rallyFrom(m, 'a', x, y, z);
    const r = BD.swing(m, 'a', btn, [0, 0], () => 0.5, []);
    assert.strictEqual(r.kind, kind, btn + ' at z ' + z + ' should be a ' + kind);
    const f = BD.fly(m.shuttle);
    assert.ok(f.y < -range[0] && f.y > -range[1], kind + ' landed at ' + f.y.toFixed(2));
    assert.ok(f.netZ > BD.C.net, kind + ' clears the net (' + f.netZ.toFixed(2) + ')');
    assert.ok(Math.abs(f.x) < BD.halfW(m), kind + ' lands inside the sidelines');
  }
});
test('smashes are fast and steep, clears are high and slow', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(2) });
  rallyFrom(m, 'a', 0, 4, 2.6); const sm = BD.swing(m, 'a', 'smash', [0, 0], () => 0.5, []); const fs = BD.fly(m.shuttle);
  rallyFrom(m, 'a', 0, 5.5, 2.0); BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []); const fc = BD.fly(m.shuttle);
  assert.ok(sm.speed * 3.6 > 110, 'smash ' + (sm.speed * 3.6).toFixed(0) + ' km/h');
  assert.ok(fs.t < 0.9 && fs.apex <= 2.65, 'smash goes down fast');
  assert.ok(fc.apex > 4.5 && fc.t > 1.6, 'clear goes high (' + fc.apex.toFixed(1) + ' m, ' + fc.t.toFixed(1) + ' s)');
});
test('aiming: pushing left or right sends it cross-court or down the line', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(3) });
  rallyFrom(m, 'a', 0, 5, 2.0); BD.swing(m, 'a', 'clear', [-1, 0], () => 0.5, []); const L = BD.fly(m.shuttle).x;
  rallyFrom(m, 'a', 0, 5, 2.0); BD.swing(m, 'a', 'clear', [1, 0], () => 0.5, []); const R = BD.fly(m.shuttle).x;
  assert.ok(L < -1.5 && R > 1.5, 'left ' + L.toFixed(2) + ' right ' + R.toFixed(2));
  // the top side sees the court rotated: their "right" is world left
  rallyFrom(m, 'b', 0, -5, 2.0); BD.swing(m, 'b', 'clear', [1, 0], () => 0.5, []); assert.ok(BD.fly(m.shuttle).x < -1.5);
});
test('reach: too far away or too low is a miss; one hit per side', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(4) });
  const p = rallyFrom(m, 'a', 0, 4, 1.5);
  m.shuttle.x = 2.5;
  assert.strictEqual(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).kind, 'air');
  rallyFrom(m, 'a', 0, 4, 0.01);
  assert.strictEqual(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).kind, 'air');
  rallyFrom(m, 'a', 0, 4, 1.5);
  assert.ok(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).kind === 'clear');
  p.swing = 0; m.shuttle.x = p.x; m.shuttle.y = p.y; m.shuttle.z = 1.5;
  assert.strictEqual(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).kind, 'air', 'can’t hit twice');
});
test('a press just after the shuttle lands still saves it (network grace)', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(5) });
  const p = rallyFrom(m, 'a', 0, 4, 0.3);
  m.lastHitTeam = 1; m.lastHitBy = 'b'; m.rallyHits = 3;
  m.shuttle.vz = -5; m.shuttle.y = 3.9; m.shuttle.x = 0;
  const past = [];
  for (let i = 0; i < 20 && !m.landed; i++) { past.unshift(Object.assign({}, m.shuttle)); BD.step(m, 1 / 60); }
  assert.ok(m.landed, 'it landed');
  BD.step(m, 0.05);
  const r = BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, past.slice(0, 6));
  assert.strictEqual(r.kind, 'lift', 'the late press connects with where the shuttle was');
  assert.strictEqual(m.landed, null);
  assert.strictEqual(m.score[1], 0, 'no point given');
  void p;
});
test('scoring: rally points, out, net, serve faults, landing on your own side', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(6) });
  // a hit that lands in the opponent's court wins the point
  rallyFrom(m, 'a', 0, 4, 1.5); BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []); runUntilPoint(m);
  assert.deepStrictEqual(m.score, [1, 0]); assert.strictEqual(m.lastPoint.reason, 'in');
  // out: past the back line
  rallyFrom(m, 'a', 0, 4, 1.5); m.lastHitBy = 'a'; m.lastHitTeam = 0; m.rallyHits = 2; m.shuttle = { x: 0, y: -2, z: 3, vx: 0, vy: -9, vz: 2 }; runUntilPoint(m);
  assert.deepStrictEqual(m.score, [1, 1]); assert.strictEqual(m.lastPoint.reason, 'out');
  // into the net: drops on the hitter's side
  rallyFrom(m, 'a', 0, 2, 1.0); m.lastHitBy = 'a'; m.lastHitTeam = 0; m.rallyHits = 2; m.shuttle = { x: 0, y: 1, z: 1.0, vx: 0, vy: -6, vz: 0 }; runUntilPoint(m);
  assert.deepStrictEqual(m.score, [1, 2]); assert.strictEqual(m.lastPoint.reason, 'net');
});
test('serve: from the right on even scores, into the diagonal box; short serves must pass the short line', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(7) });
  m.serveSide = 0; m.score = [0, 0]; BD.startServe(m);
  const a = BD.playerOf(m, 'a');
  assert.ok(a.x > 0, 'side 0 serves from its right (world +x) at 0');
  m.score = [3, 0]; BD.startServe(m); assert.ok(BD.playerOf(m, 'a').x < 0, 'odd score: from the left');
  m.score = [0, 0]; BD.startServe(m);
  assert.ok(BD.inBounds(m, -1, -4, 'a'), 'diagonal box is in');
  assert.ok(!BD.inBounds(m, 1, -4, 'a'), 'same-side box is out');
  assert.ok(!BD.inBounds(m, -1, -1.2, 'a'), 'in front of the short line is out');
  assert.ok(BD.inBounds(m, 1, -4), 'any rally shot inside the court is in');
  BD.swing(m, 'a', 'drop', [0, 0], () => 0.5, []);
  const f = BD.fly(m.shuttle);
  assert.ok(BD.inBounds(m, f.x, f.y, 'a'), 'a short serve lands in the box (' + f.x.toFixed(2) + ', ' + f.y.toFixed(2) + ')');
  m.score = [0, 0]; m.serveSide = 0; BD.startServe(m);
  BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []);
  const f2 = BD.fly(m.shuttle);
  assert.ok(BD.inBounds(m, f2.x, f2.y, 'a') && f2.y < -5.5, 'a high serve lands deep in the box');
});
test('first to 10, win by 2, capped at 15', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(8) });
  const win = (side) => { const loser = side === 0 ? 'b' : 'a', winner = side === 0 ? 'a' : 'b'; const pw = BD.playerOf(m, winner); rallyFrom(m, winner, 0, BD.sgn(pw.side) * 4, 1.5); BD.swing(m, winner, 'smash', [0, 0], () => 0.5, []); runUntilPoint(m); void loser; };
  for (let i = 0; i < 9; i++) { win(0); win(1); }
  assert.deepStrictEqual(m.score, [9, 9]); assert.notStrictEqual(m.phase, 'over');
  win(0); assert.deepStrictEqual(m.score, [10, 9]); assert.notStrictEqual(m.phase, 'over', '10–9 is not enough');
  win(0); assert.strictEqual(m.phase, 'over'); assert.strictEqual(m.winner, 0);
  const m2 = BD.newMatch({ players: two(), rng: seeded(9) });
  m2.score = [14, 14];
  rallyFrom(m2, 'b', 0, -4, 1.5); BD.swing(m2, 'b', 'smash', [0, 0], () => 0.5, []); runUntilPoint(m2);
  assert.strictEqual(m2.phase, 'over', '15 is sudden death'); assert.strictEqual(m2.winner, 1);
  const m3 = BD.newMatch({ players: two(), rng: seeded(9), cfg: { target: 21 } }); assert.strictEqual(m3.cfg.target, 21); assert.strictEqual(BD.capFor(21), 26);
});
test('energy: sprinting and smashing tire you, standing recovers, tired players are slower', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(10) });
  m.phase = 'rally'; m.shuttle = { x: 0, y: -3, z: 5, vx: 0, vy: 0, vz: 0 }; m.lastHitTeam = 0;
  const a = BD.playerOf(m, 'a'); a.x = 0; a.y = 4;
  for (let i = 0; i < 300; i++) { BD.moveTo(m, 'a', a.x + (i % 120 < 60 ? 1 : -1) * BD.MAX_SPEED / 60, a.y, 1 / 60); m.shuttle.z = 5; BD.step(m, 1 / 60); }
  assert.ok(a.energy < 80, 'running drains energy: ' + a.energy.toFixed(0));
  const fresh = BD.speedCap(m, Object.assign({}, a, { energy: 100 })), tired = BD.speedCap(m, Object.assign({}, a, { energy: 5 }));
  assert.ok(tired < fresh * 0.8);
  const e0 = a.energy; for (let i = 0; i < 120; i++) { BD.moveTo(m, 'a', a.x, a.y, 1 / 60); m.shuttle.z = 5; BD.step(m, 1 / 60); }
  assert.ok(a.energy > e0 + 10, 'standing recovers');
  rallyFrom(m, 'a', 0, 4, 2.6); a.energy = 50; BD.swing(m, 'a', 'smash', [0, 0], () => 0.5, []);
  assert.ok(a.energy <= 35, 'a jump smash costs energy');
  const m2 = BD.newMatch({ players: [{ id: 's', name: 'S', side: 0 }, { id: 'x', name: 'X', side: 1 }, { id: 'y', name: 'Y', side: 1 }], rng: seeded(11) });
  assert.strictEqual(m2.mode, '1v2');
  assert.ok(BD.speedCap(m2, BD.playerOf(m2, 's')) > BD.speedCap(m2, BD.playerOf(m2, 'x')), 'the solo player in 1 v 2 is a little quicker');
});
test('positions: players stay on their side and can’t teleport', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(12) });
  m.phase = 'rally'; m.shuttle = { x: 0, y: -3, z: 5, vx: 0, vy: 0, vz: 0 };
  const a = BD.playerOf(m, 'a'); a.x = 0; a.y = 3;
  BD.moveTo(m, 'a', 0, -3, 1 / 60);
  assert.ok(a.y > 2.8 && a.y > 0, 'one report can only move a step');
  for (let i = 0; i < 200; i++) BD.moveTo(m, 'a', 0, -3, 1 / 60);
  assert.ok(a.y >= 0.35, 'can’t cross the net');
});
test('match setup: 1v1, 1v2, 2v2 only', () => {
  assert.throws(() => BD.newMatch({ players: [{ id: 'a', side: 0 }] }));
  assert.throws(() => BD.newMatch({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 0 }] }), /1 v 1/);
  assert.strictEqual(BD.newMatch({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 0 }, { id: 'c', side: 1 }, { id: 'd', side: 1 }] }).mode, '2v2');
  assert.throws(() => BD.newMatch({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 0 }, { id: 'c', side: 0 }, { id: 'd', side: 1 }] }));
});
test('bots play whole matches with real rallies, in every format', () => {
  const lines = [];
  for (const [players, label] of [
    [two('normal', 'normal'), '1v1 normal'],
    [[{ id: 'a', name: 'A', side: 0, bot: 'hard' }, { id: 'b', name: 'B', side: 1, bot: 'normal' }, { id: 'c', name: 'C', side: 1, bot: 'normal' }], '1v2'],
    [[{ id: 'a', name: 'A', side: 0, bot: 'normal' }, { id: 'b', name: 'B', side: 0, bot: 'normal' }, { id: 'c', name: 'C', side: 1, bot: 'normal' }, { id: 'd', name: 'D', side: 1, bot: 'normal' }], '2v2']]) {
    let hits = 0, rallies = 0, maxR = 0;
    for (let k = 0; k < 4; k++) {
      const r = botMatch(players, 100 + k);
      assert.strictEqual(r.m.phase, 'over', label + ' match finished');
      const sum = BD.summary(r.m);
      hits += sum.rows.reduce((a, x) => a + x.hits, 0); rallies += r.m.rally; maxR = Math.max(maxR, r.m.longest);
    }
    lines.push(label + ': ' + (hits / rallies).toFixed(1) + ' shots per rally, longest ' + maxR);
    assert.ok(hits / rallies >= 3, label + ' rallies average at least 3 shots (' + (hits / rallies).toFixed(1) + ')');
    assert.ok(maxR >= 8, label + ' some long rallies (' + maxR + ')');
  }
  console.log('  ' + lines.join('; '));
});
test('hard bots beat easy bots most of the time', () => {
  let hard = 0, n = 16;
  for (let k = 0; k < n; k++) { const r = botMatch(k % 2 ? two('hard', 'easy') : two('easy', 'hard'), 300 + k); if (r.m.winner === (k % 2 ? 0 : 1)) hard++; }
  console.log('  hard beat easy ' + hard + '/' + n);
  assert.ok(hard >= 12, 'hard won ' + hard + '/' + n);
});
test('shot variety in bot rallies: smashes, drops, clears all happen', () => {
  const r = botMatch(two('hard', 'hard'), 77);
  const kinds = {}; r.m.events.forEach(e => { if (e.k === 'hit') kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
  // events are trimmed; replay a few matches to count
  const all = {};
  for (let k = 0; k < 3; k++) {
    const rng = seeded(500 + k); const m = BD.newMatch({ players: two('hard', 'normal'), rng }); const mem = {};
    let steps = 0;
    while (m.phase !== 'over' && steps < 60 * 60 * 20) {
      m.players.forEach(p => { const th = BD.botThink(m, p, rng, mem[p.id] || (mem[p.id] = {})); BD.botMove(m, p, th, 1 / 60); if (th.hit) { const res = BD.swing(m, p.id, th.hit.button, th.hit.aim, rng, []); if (res && res.kind !== 'air') all[res.kind] = (all[res.kind] || 0) + 1; } });
      BD.step(m, 1 / 60, rng); steps++;
    }
  }
  console.log('  shot mix: ' + JSON.stringify(all));
  ['smash', 'clear', 'drop'].forEach(k => assert.ok(all[k] > 3, k + ' used'));
  assert.ok((all.serveLong || 0) + (all.serveShort || 0) > 10);
});
test('summary and awards', () => {
  const r = botMatch(two('hard', 'normal'), 900);
  const s = BD.summary(r.m);
  assert.strictEqual(s.rows.length, 2);
  assert.strictEqual(s.rows[0].side, r.m.winner, 'winner listed first');
  assert.ok(s.rallies === r.m.score[0] + r.m.score[1]);
  const ids = s.awards.map(a => a.id); assert.strictEqual(new Set(ids).size, ids.length);
});
test('height zones: a smash from too low goes into the net; buttons preview the risk', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(20) });
  const p = BD.playerOf(m, 'a');
  assert.deepStrictEqual(BD.preview(m, Object.assign({}, p, { y: 4 }), 'smash', 2.6), { kind: 'smash', risk: 'ok' });
  assert.strictEqual(BD.preview(m, Object.assign({}, p, { y: 4 }), 'smash', 1.5).kind, 'drive');
  assert.strictEqual(BD.preview(m, Object.assign({}, p, { y: 4 }), 'smash', 1.0).risk, 'risky');
  assert.strictEqual(BD.preview(m, Object.assign({}, p, { y: 4 }), 'smash', 0.5).risk, 'net');
  assert.strictEqual(BD.preview(m, Object.assign({}, p, { y: 4 }), 'clear', 0.5).kind, 'lift');
  assert.strictEqual(BD.preview(m, Object.assign({}, p, { y: 1 }), 'drop', 0.5).kind, 'net');
  // pressing smash with the shuttle at knee height: it hits the tape
  let netted = 0;
  for (let k = 0; k < 10; k++) { rallyFrom(m, 'a', 0, 3.5, 0.45); BD.swing(m, 'a', 'smash', [0, 0], seeded(k), []); const f = BD.fly(m.shuttle); if (f.netZ === null || f.netZ < BD.C.net || f.y > 0) netted++; }
  assert.ok(netted >= 8, 'low smashes go into the net (' + netted + '/10)');
  // lifting the same shuttle is safe
  rallyFrom(m, 'a', 0, 3.5, 0.45); BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []); assert.ok(BD.fly(m.shuttle).netZ > BD.C.net);
});
test('perfect contact: close and high makes a faster, truer smash', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(21) });
  rallyFrom(m, 'a', 0, 4, 2.7); m.shuttle.y = 4 - 0.1; const a = BD.swing(m, 'a', 'smash', [0, 0], () => 0.5, []);
  rallyFrom(m, 'a', 0, 4, 2.0); m.shuttle.x = 0.95; const b = BD.swing(m, 'a', 'smash', [0, 0], () => 0.5, []);
  assert.ok(a.perfect && !b.perfect);
  assert.ok(a.speed > b.speed, 'perfect smash is faster');
});
test('bot rallies feel like real badminton: about 4 to 9 shots on average', () => {
  for (const ps of [two('normal', 'normal'), two('hard', 'hard')]) {
    let hits = 0, ral = 0;
    for (let k = 0; k < 4; k++) { const r = botMatch(ps, 600 + k); hits += BD.summary(r.m).rows.reduce((a, x) => a + x.hits, 0); ral += r.m.rally; }
    assert.ok(hits / ral >= 3.5 && hits / ral <= 10, (hits / ral).toFixed(1) + ' shots per rally');
  }
});
test('serves: forehand high, backhand short, backhand flick', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(31) });
  const out = {};
  for (const [btn, kind] of [['clear', 'serveLong'], ['drop', 'serveShort'], ['smash', 'serveFlick']]) {
    m.score = [0, 0]; m.serveSide = 0; m.nextServer = [0, 0]; BD.startServe(m);
    const r = BD.swing(m, 'a', btn, [0, 0], () => 0.5, []);
    assert.strictEqual(r.kind, kind);
    const f = BD.fly(m.shuttle);
    assert.ok(BD.inBounds(m, f.x, f.y, 'a'), kind + ' lands in the service box (' + f.x.toFixed(2) + ', ' + f.y.toFixed(2) + ')');
    out[kind] = f;
  }
  assert.strictEqual(BD.playerOf(m, 'a').hand, 'back');
  assert.ok(out.serveLong.apex > 4 && -out.serveLong.y > 5.5, 'high serve goes high and deep');
  assert.ok(out.serveShort.apex < 2.3 && -out.serveShort.y < 3, 'short serve stays low and short');
  assert.ok(out.serveFlick.apex < out.serveLong.apex - 1 && -out.serveFlick.y > 4.5 && out.serveFlick.t < out.serveLong.t, 'flick is flatter and quicker but still deep');
});
test('forehand on your right, backhand on your left (and for the far side, mirrored)', () => {
  const m = BD.newMatch({ players: two(), rng: seeded(32) });
  rallyFrom(m, 'a', 0, 4, 1.6); m.shuttle.x = 0.6; assert.strictEqual(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).hand, 'fore');
  rallyFrom(m, 'a', 0, 4, 1.6); m.shuttle.x = -0.6; assert.strictEqual(BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []).hand, 'back');
  rallyFrom(m, 'b', 0, -4, 1.6); m.shuttle.x = -0.6; assert.strictEqual(BD.swing(m, 'b', 'clear', [0, 0], () => 0.5, []).hand, 'fore');
  // a backhand clear from the back falls shorter than a forehand one
  rallyFrom(m, 'a', 0, 5.5, 1.8); m.shuttle.x = 0.5; BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []); const fore = BD.fly(m.shuttle).y;
  rallyFrom(m, 'a', 0, 5.5, 1.8); m.shuttle.x = -0.5; BD.swing(m, 'a', 'clear', [0, 0], () => 0.5, []); const back = BD.fly(m.shuttle).y;
  assert.ok(back > fore + 0.3, 'backhand clear shorter (' + back.toFixed(2) + ' vs ' + fore.toFixed(2) + ')');
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
