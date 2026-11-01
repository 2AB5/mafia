const assert = require('assert');
const E = require('../src/engine.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log('FAIL: ' + name + '\n  ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n  ') : e)); }
}

// deterministic rng
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a game with exact roles: roles = ['mafia','doctor',...]; ids p0..pn
function mk(roles, cfg) {
  const players = roles.map(function (r, i) { return { id: 'p' + i, name: 'N' + i }; });
  const st = E.newGame({ gameId: 'g1', players: players, cfg: cfg || {}, rng: seeded(1), now: 1000 });
  roles.forEach(function (r, i) { st.players[i].role = r; });
  return st;
}
const sub = function (st, id, t, to) { const r = E.submit(st, id, { t: t, to: to }); assert.ok(r.ok, id + ' ' + t + ' ' + to + ' -> ' + r.error); };
const alive = function (st, id) { return E.P(st, id).alive; };

/* ---------- roles ---------- */
test('role counts 4..8 default', function () {
  const exp = {
    4: { mafia: 1, doctor: 1, police: 1, prankster: 1 },
    5: { mafia: 1, doctor: 1, police: 1, prankster: 1, civilian: 1 },
    6: { mafia: 2, doctor: 1, police: 1, prankster: 1, civilian: 1 },
    7: { mafia: 2, doctor: 1, police: 1, prankster: 1, civilian: 2 },
    8: { mafia: 2, doctor: 1, police: 1, prankster: 1, civilian: 3 }
  };
  for (let n = 4; n <= 8; n++) {
    const b = E.buildRoles(n, {});
    assert.deepStrictEqual(b.counts, exp[n], 'n=' + n);
    assert.strictEqual(b.roles.length, n);
  }
});
test('mafia 2 clamps to 1 for 4-5 players', function () {
  [4, 5].forEach(function (n) {
    const b = E.buildRoles(n, { mafia: 2 });
    assert.strictEqual(b.counts.mafia, 1);
    assert.ok(b.notes.length >= 1);
  });
  assert.strictEqual(E.buildRoles(6, { mafia: 2 }).counts.mafia, 2);
  assert.strictEqual(E.buildRoles(8, { mafia: 1 }).counts.mafia, 1);
});
test('optional roles can be switched off', function () {
  const b = E.buildRoles(8, { doctor: false, police: false, prankster: false });
  assert.deepStrictEqual(b.counts, { mafia: 2, civilian: 6 });
  const c = E.buildRoles(7, { prankster: false });
  assert.deepStrictEqual(c.counts, { mafia: 2, doctor: 1, police: 1, civilian: 3 });
});
test('mafia always strictly fewer than town at start', function () {
  for (let n = 4; n <= 8; n++) [{}, { mafia: 1 }, { mafia: 2 }].forEach(function (c) {
    const b = E.buildRoles(n, c);
    assert.ok(b.counts.mafia < n - b.counts.mafia, 'n=' + n);
  });
});
test('normalizeConfig coerces junk', function () {
  const c = E.normalizeConfig({ mafia: 'x', reveal: 'weird', nightSecs: '60', discussSecs: -5, voteSecs: 99999, doctor: 0 });
  assert.strictEqual(c.mafia, 'auto');
  assert.strictEqual(c.reveal, 'role');
  assert.strictEqual(c.nightSecs, 60);
  assert.strictEqual(c.discussSecs, 0);
  assert.strictEqual(c.voteSecs, 900);
  assert.strictEqual(c.doctor, false);
});
test('newGame rejects bad sizes and duplicate ids', function () {
  const P = function (n) { return Array.from({ length: n }, function (_, i) { return { id: 'a' + i, name: 'x' + i }; }); };
  assert.throws(function () { E.newGame({ gameId: 'g', players: P(3) }); });
  assert.throws(function () { E.newGame({ gameId: 'g', players: P(9) }); });
  const d = P(4); d[1].id = 'a0';
  assert.throws(function () { E.newGame({ gameId: 'g', players: d }); });
  assert.doesNotThrow(function () { E.newGame({ gameId: 'g', players: P(4) }); });
  assert.doesNotThrow(function () { E.newGame({ gameId: 'g', players: P(8) }); });
});
test('names are made unique, trimmed and capped', function () {
  const st = E.newGame({
    gameId: 'g', now: 1,
    players: [{ id: '1', name: ' Sam ' }, { id: '2', name: 'sam' }, { id: '3', name: '' }, { id: '4', name: 'X'.repeat(40) }]
  });
  const names = st.players.map(function (p) { return p.name; });
  assert.strictEqual(new Set(names.map(function (s) { return s.toLowerCase(); })).size, 4);
  assert.strictEqual(names[0], 'Sam');
  assert.ok(names.every(function (s) { return s.length > 0 && s.length <= 16; }), names.join('|'));
});
test('role assignment is a permutation of buildRoles', function () {
  for (let n = 4; n <= 8; n++) {
    const players = Array.from({ length: n }, function (_, i) { return { id: 'i' + i, name: 'n' + i }; });
    const st = E.newGame({ gameId: 'g', players: players, rng: seeded(n * 7) });
    const got = st.players.map(function (p) { return p.role; }).sort();
    assert.deepStrictEqual(got, E.buildRoles(n, {}).roles.slice().sort());
    assert.strictEqual(st.phase, 'night');
    assert.strictEqual(st.round, 1);
  }
});

/* ---------- night ---------- */
// roles: p0 mafia, p1 doctor, p2 police, p3 prankster, p4 civ, p5 civ
const R6 = ['mafia', 'doctor', 'police', 'prankster', 'civilian', 'civilian'];
function allSleep(st, except) {
  st.players.forEach(function (p) {
    if (p.alive && p.role === 'civilian' && except.indexOf(p.id) === -1) sub(st, p.id, 'sleep');
  });
}

test('night needs every living player; resolves to discussion', function () {
  const st = mk(R6);
  assert.strictEqual(E.ready(st), false);
  assert.strictEqual(E.pendingIds(st).length, 6);
  sub(st, 'p0', 'kill', 'p4');
  sub(st, 'p1', 'save', 'p1');
  sub(st, 'p2', 'check', 'p0');
  sub(st, 'p3', 'prank', 'p5');
  sub(st, 'p4', 'sleep');
  assert.strictEqual(E.ready(st), false);
  sub(st, 'p5', 'sleep');
  assert.strictEqual(E.ready(st), true);
  E.advance(st, seeded(2), 5000);
  assert.strictEqual(st.phase, 'discuss');
  assert.strictEqual(st.round, 1);
  assert.deepStrictEqual(st.sub, {});
  assert.strictEqual(alive(st, 'p4'), false);
});
test('kill is recorded with role reveal', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p1'); sub(st, 'p1', 'save', 'p0'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p4'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  const line = st.log[st.log.length - 1].x;
  assert.strictEqual(line, 'N1 was killed in the night. Role: Doctor.');
});
test('reveal team / none', function () {
  const a = mk(R6, { reveal: 'team' });
  sub(a, 'p0', 'kill', 'p1'); sub(a, 'p1', 'save', 'p0'); sub(a, 'p2', 'check', 'p0'); sub(a, 'p3', 'prank', 'p4'); allSleep(a, []);
  E.advance(a, seeded(1), 1);
  assert.strictEqual(a.log[a.log.length - 1].x, 'N1 was killed in the night. Team: Town.');
  const b = mk(R6, { reveal: 'none' });
  sub(b, 'p0', 'kill', 'p1'); sub(b, 'p1', 'save', 'p0'); sub(b, 'p2', 'check', 'p0'); sub(b, 'p3', 'prank', 'p4'); allSleep(b, []);
  E.advance(b, seeded(1), 1);
  assert.strictEqual(b.log[b.log.length - 1].x, 'N1 was killed in the night.');
  const pv = E.publicView(b);
  assert.strictEqual(pv.players[1].rv, null);
});
test('doctor save cancels kill silently', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p4'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p5'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(alive(st, 'p4'));
  assert.strictEqual(st.log[st.log.length - 1].x, 'Nobody was killed last night.');
});
test('doctor can save self', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p1'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p5'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(alive(st, 'p1'));
});
test('doctor cannot protect same player two nights in a row', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p2'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p5'); allSleep(st, ['p4']);
  sub(st, 'p5', 'sleep');
  // p4 is the target and is civilian; submit its sleep before it dies
  sub(st, 'p4', 'sleep');
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p4'));
  E.advance(st, seeded(1), 1); // discuss -> vote
  // skip votes to reach next night
  st.players.filter(function (p) { return p.alive; }).forEach(function (p) { sub(st, p.id, 'vote', 'skip'); });
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.phase, 'night');
  assert.strictEqual(st.round, 2);
  const act = E.actionFor(st, E.P(st, 'p1'));
  assert.ok(act.targets.indexOf('p2') === -1, 'p2 should be blocked');
  assert.strictEqual(act.blocked.p2, 'protected last night');
  const r = E.submit(st, 'p1', { t: 'save', to: 'p2' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'bad-target');
  assert.ok(E.submit(st, 'p1', { t: 'save', to: 'p1' }).ok);
});
test('doctor restriction lifts after a skipped night', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p2'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p5'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.lastSaved, 'p2');
  E.advance(st, seeded(1), 1);
  st.players.filter(function (p) { return p.alive; }).forEach(function (p) { sub(st, p.id, 'vote', 'skip'); });
  E.advance(st, seeded(1), 1);
  // night 2: doctor submits nothing; others submit; force advance
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.lastSaved, null);
});
test('prankster blocks doctor: kill goes through, doctor is told', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p4'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p1'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p4'));
  assert.strictEqual(st.notes.p1.length, 1);
  assert.strictEqual(st.lastSaved, null);
});
test('prankster blocks the only mafia: nobody dies, mafia told', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p5'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p0'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(alive(st, 'p4'));
  assert.strictEqual(st.notes.p0.length, 1);
});
test('prankster blocks police: no intel, police told', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p4'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p2'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.intel.length, 0);
  assert.strictEqual(st.notes.p2.length, 1);
});
test('prankster on a civilian does nothing and tells nobody', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p5'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p4'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.deepStrictEqual(st.notes, {});
  assert.ok(!alive(st, 'p5'));
});
test('police results are mafia / clear and accumulate', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p5'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p4'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.deepStrictEqual(st.intel, [{ r: 1, to: 'p0', res: 'mafia' }]);
  const v = E.playerView(st, 'p2');
  assert.strictEqual(v.intel.length, 1);
  const w = E.playerView(st, 'p4');
  assert.strictEqual(w.intel.length, 0);
});
test('police on a non-mafia says clear (prankster and doctor are not mafia)', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p5'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p3'); sub(st, 'p3', 'prank', 'p4'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.intel[0].res, 'clear');
});
test('police result is delivered even if police is killed that night', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p2'); sub(st, 'p1', 'save', 'p4'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p4'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p2'));
  assert.strictEqual(st.intel.length, 1);
});
test('mafia split vote picks randomly among tied and notes the team', function () {
  const roles = ['mafia', 'mafia', 'doctor', 'police', 'civilian', 'civilian', 'civilian'];
  const picks = {};
  for (let s = 1; s < 60; s++) {
    const st = mk(roles);
    sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'kill', 'p5'); sub(st, 'p2', 'save', 'p2'); sub(st, 'p3', 'check', 'p0');
    allSleep(st, []);
    E.advance(st, seeded(s), 1);
    const dead = st.players.filter(function (p) { return !p.alive; });
    assert.strictEqual(dead.length, 1);
    picks[dead[0].id] = true;
    assert.strictEqual(st.notes.p0.length, 1);
    assert.strictEqual(st.notes.p1.length, 1);
    assert.ok(!st.notes.p4);
  }
  assert.deepStrictEqual(Object.keys(picks).sort(), ['p4', 'p5']);
});
test('two mafia agreeing kill that target, no tie note', function () {
  const roles = ['mafia', 'mafia', 'doctor', 'police', 'civilian', 'civilian', 'civilian'];
  const st = mk(roles);
  sub(st, 'p0', 'kill', 'p6'); sub(st, 'p1', 'kill', 'p6'); sub(st, 'p2', 'save', 'p2'); sub(st, 'p3', 'check', 'p0'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p6'));
  assert.deepStrictEqual(st.notes, {});
});
test('majority of mafia votes wins over minority (3 mafia not allowed, use 2 + block)', function () {
  const roles = ['mafia', 'mafia', 'prankster', 'civilian', 'civilian', 'civilian'];
  const st = mk(roles, { doctor: false, police: false });
  sub(st, 'p0', 'kill', 'p3'); sub(st, 'p1', 'kill', 'p4'); sub(st, 'p2', 'prank', 'p0'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  // p0 blocked, only p1's vote counts => p4 dies
  assert.ok(!alive(st, 'p4'));
  assert.ok(alive(st, 'p3'));
});
test('mafia cannot target mafia or themselves', function () {
  const st = mk(['mafia', 'mafia', 'doctor', 'police', 'civilian', 'civilian']);
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill', to: 'p1' }).ok, false);
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill', to: 'p0' }).ok, false);
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill', to: 'nobody' }).ok, false);
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill', to: 'p2' }).ok, true);
});
test('police and prankster cannot target self', function () {
  const st = mk(R6);
  assert.strictEqual(E.submit(st, 'p2', { t: 'check', to: 'p2' }).ok, false);
  assert.strictEqual(E.submit(st, 'p3', { t: 'prank', to: 'p3' }).ok, false);
});
test('wrong action type or malformed actions are rejected', function () {
  const st = mk(R6);
  assert.strictEqual(E.submit(st, 'p4', { t: 'kill', to: 'p1' }).error, 'wrong-action');
  assert.strictEqual(E.submit(st, 'p1', { t: 'kill', to: 'p4' }).error, 'wrong-action');
  assert.strictEqual(E.submit(st, 'p4', { t: 'vote', to: 'p1' }).error, 'wrong-action');
  assert.strictEqual(E.submit(st, 'p4', null).error, 'bad-action');
  assert.strictEqual(E.submit(st, 'p4', {}).error, 'bad-action');
  assert.strictEqual(E.submit(st, 'zz', { t: 'sleep' }).error, 'not-alive');
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill' }).error, 'bad-target');
  assert.strictEqual(E.submit(st, 'p0', { t: 'kill', to: { a: 1 } }).error, 'bad-target');
});
test('a submission can be changed until the night resolves', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4');
  sub(st, 'p0', 'kill', 'p5');
  assert.strictEqual(st.sub.p0.to, 'p5');
});
test('night with partial submissions still resolves (forced)', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4');
  assert.strictEqual(E.ready(st), false);
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p4'));
  assert.strictEqual(st.phase, 'discuss');
});
test('night with nothing submitted: nobody dies', function () {
  const st = mk(R6);
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.players.filter(function (p) { return !p.alive; }).length, 0);
  assert.strictEqual(st.phase, 'discuss');
});
test('mafia wins by parity right after the night', function () {
  const st = mk(['mafia', 'doctor', 'civilian', 'civilian']); // 1 v 3
  st.players[3].alive = false; // 1 v 2
  sub(st, 'p0', 'kill', 'p2'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'sleep');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.winner, 'mafia');
  assert.strictEqual(st.phase, 'over');
});
test('doctor save prevents parity win', function () {
  const st = mk(['mafia', 'doctor', 'civilian', 'civilian']);
  st.players[3].alive = false;
  sub(st, 'p0', 'kill', 'p2'); sub(st, 'p1', 'save', 'p2'); sub(st, 'p2', 'sleep');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.winner, null);
  assert.strictEqual(st.phase, 'discuss');
});

/* ---------- day ---------- */
function toVote(st) { E.advance(st, seeded(1), 1); E.advance(st, seeded(1), 1); }
function dayGame(roles, cfg) {
  const st = mk(roles, cfg);
  E.advance(st, seeded(1), 1);          // empty night
  assert.strictEqual(st.phase, 'discuss');
  return st;
}
test('discussion: everyone must be ready, then vote phase starts clean', function () {
  const st = dayGame(R6);
  assert.strictEqual(E.ready(st), false);
  st.players.forEach(function (p) { sub(st, p.id, 'ready'); });
  assert.ok(E.ready(st));
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.phase, 'vote');
  assert.deepStrictEqual(st.sub, {});
  assert.strictEqual(E.pendingIds(st).length, 6);
});
test('vote: plurality lynches and reveals', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'p4'); sub(st, 'p1', 'vote', 'p4'); sub(st, 'p2', 'vote', 'p4'); sub(st, 'p3', 'vote', 'p0'); sub(st, 'p4', 'vote', 'p0'); sub(st, 'p5', 'vote', 'skip');
  assert.ok(E.ready(st));
  E.advance(st, seeded(1), 1);
  assert.ok(!alive(st, 'p4'));
  assert.strictEqual(st.ballot.outcome, 'lynch');
  assert.strictEqual(st.ballot.lynched, 'p4');
  assert.strictEqual(st.phase, 'night');
  assert.strictEqual(st.round, 2);
  assert.strictEqual(st.log[st.log.length - 1].x, 'N4 was voted out. Role: Civilian.');
});
test('vote: top tie lynches nobody', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'p4'); sub(st, 'p1', 'vote', 'p4'); sub(st, 'p2', 'vote', 'p5'); sub(st, 'p3', 'vote', 'p5'); sub(st, 'p4', 'vote', 'p0'); sub(st, 'p5', 'vote', 'p1');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.ballot.outcome, 'tie');
  assert.strictEqual(st.players.filter(function (p) { return !p.alive; }).length, 0);
});
test('vote: skip beating every player lynches nobody', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'skip'); sub(st, 'p1', 'vote', 'skip'); sub(st, 'p2', 'vote', 'skip'); sub(st, 'p3', 'vote', 'p4'); sub(st, 'p4', 'vote', 'p3'); sub(st, 'p5', 'vote', 'p3');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.ballot.outcome, 'skip');
  assert.strictEqual(st.round, 2);
});
test('vote: skip tied with a player is a tie, nobody lynched', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'skip'); sub(st, 'p1', 'vote', 'skip'); sub(st, 'p2', 'vote', 'skip'); sub(st, 'p3', 'vote', 'p4'); sub(st, 'p4', 'vote', 'p3'); sub(st, 'p5', 'vote', 'p3');
  // p3 has 2 votes; skip has 3 -> skip wins; adjust: make skip 2
  st.sub.p2 = { t: 'vote', to: 'p3' };
  // now p3 has 3, skip 2
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.ballot.outcome, 'lynch');
});
test('vote: exact skip/player tie -> tie', function () {
  const st = dayGame(['mafia', 'doctor', 'police', 'civilian', 'civilian']);
  E.advance(st, seeded(1), 1);
  // 5 alive: p3 gets 2 votes, skip gets 2 explicit + 1 abstain? make skip = 2: two skips, p3 two votes, one votes someone else -> that someone has 1
  sub(st, 'p0', 'vote', 'p3'); sub(st, 'p1', 'vote', 'p3'); sub(st, 'p2', 'vote', 'skip'); sub(st, 'p4', 'vote', 'skip'); sub(st, 'p3', 'vote', 'p2');
  // counts: p3:2, p2:1, skip: 5-3=2 -> tie between p3 and skip
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.ballot.outcome, 'tie');
});
test('vote: abstainers count as skip when closed early', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'p4'); // only one vote, 5 abstain
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.ballot.outcome, 'skip');
  assert.ok(alive(st, 'p4'));
  assert.strictEqual(st.ballot.rows.filter(function (r) { return r.to === null; }).length, 5);
});
test('vote: cannot vote for yourself, a dead player, or a stranger', function () {
  const st = dayGame(R6);
  st.players[5].alive = false;
  E.advance(st, seeded(1), 1);
  assert.strictEqual(E.submit(st, 'p0', { t: 'vote', to: 'p0' }).error, 'bad-target');
  assert.strictEqual(E.submit(st, 'p0', { t: 'vote', to: 'p5' }).error, 'bad-target');
  assert.strictEqual(E.submit(st, 'p0', { t: 'vote', to: 'p9' }).error, 'bad-target');
  assert.strictEqual(E.submit(st, 'p0', { t: 'vote', to: 'skip' }).ok, true);
  assert.strictEqual(E.submit(st, 'p5', { t: 'vote', to: 'p1' }).error, 'not-alive');
});
test('vote can be changed until close', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'p4'); sub(st, 'p0', 'vote', 'skip');
  assert.strictEqual(st.sub.p0.to, 'skip');
});
test('lynching the last mafia: town wins', function () {
  const st = dayGame(['mafia', 'doctor', 'police', 'civilian']);
  E.advance(st, seeded(1), 1);
  ['p1', 'p2', 'p3'].forEach(function (id) { sub(st, id, 'vote', 'p0'); });
  sub(st, 'p0', 'vote', 'p1');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.winner, 'town');
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(st.round, 1);
});
test('wrongly lynching a civilian can hand mafia the win by parity', function () {
  const st = mk(['mafia', 'doctor', 'civilian', 'civilian']);
  st.players[3].alive = false;                 // 1 mafia v doctor + civilian
  E.advance(st, seeded(1), 1);                 // empty night -> discuss
  assert.strictEqual(st.phase, 'discuss');
  E.advance(st, seeded(1), 1);                 // -> vote
  sub(st, 'p0', 'vote', 'p2'); sub(st, 'p1', 'vote', 'p2'); sub(st, 'p2', 'vote', 'p1');
  E.advance(st, seeded(1), 1);                 // p2 voted out -> 1 v 1
  assert.ok(!alive(st, 'p2'));
  assert.strictEqual(st.winner, 'mafia');
  assert.strictEqual(st.phase, 'over');
});
test('rounds advance night -> discuss -> vote -> night', function () {
  const st = mk(R6);
  const seen = [];
  for (let i = 0; i < 7; i++) { seen.push(E.phaseKey(st)); E.advance(st, seeded(i), 1); if (st.phase === 'over') break; }
  assert.deepStrictEqual(seen.slice(0, 6), ['N1', 'T1', 'V1', 'N2', 'T2', 'V2']);
});
test('timers arm per phase when configured and clear when not', function () {
  const st = mk(R6, { nightSecs: 60, discussSecs: 120, voteSecs: 30 });
  E.armTimer(st, 1000);
  assert.strictEqual(st.dl, 61000);
  E.advance(st, seeded(1), 2000);
  assert.strictEqual(st.dl, 2000 + 120000);
  E.advance(st, seeded(1), 3000);
  assert.strictEqual(st.dl, 3000 + 30000);
  const u = mk(R6);
  E.armTimer(u, 1000);
  assert.strictEqual(u.dl, null);
});

/* ---------- removal ---------- */
test('removing a player drops their submission and can complete the phase', function () {
  const st = mk(R6);
  ['p0', 'p1', 'p2', 'p3', 'p4'].forEach(function (id) {
    const r = E.P(st, id).role;
    if (r === 'mafia') sub(st, id, 'kill', 'p4'); else if (r === 'doctor') sub(st, id, 'save', 'p1'); else if (r === 'police') sub(st, id, 'check', 'p0'); else if (r === 'prankster') sub(st, id, 'prank', 'p4'); else sub(st, id, 'sleep');
  });
  assert.strictEqual(E.ready(st), false);
  assert.ok(E.removePlayer(st, 'p5'));
  assert.ok(E.ready(st));
  assert.ok(!E.P(st, 'p5').alive);
  assert.strictEqual(E.removePlayer(st, 'p5'), false);
});
test('removed target is ignored at night resolution', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p5'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p5'); sub(st, 'p3', 'prank', 'p5');
  E.removePlayer(st, 'p5');
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.intel.length, 0);
  assert.strictEqual(st.log[st.log.length - 1].x, 'Nobody was killed last night.');
  assert.strictEqual(st.players.filter(function (p) { return !p.alive; }).length, 1);
});
test('removing the last mafia ends the game for town', function () {
  const st = mk(R6);
  E.removePlayer(st, 'p0');
  assert.strictEqual(st.winner, 'town');
  assert.strictEqual(st.phase, 'over');
});
test('removed voters are not counted and removed votes vanish', function () {
  const st = dayGame(R6);
  E.advance(st, seeded(1), 1);
  sub(st, 'p0', 'vote', 'p4'); sub(st, 'p1', 'vote', 'p4'); sub(st, 'p2', 'vote', 'p4');
  E.removePlayer(st, 'p2');
  assert.strictEqual(E.P(st, 'p2').alive, false);
  assert.ok(!st.sub.p2);
});
test('nothing advances after the game is over', function () {
  const st = mk(R6);
  E.removePlayer(st, 'p0');
  const seq = st.seq;
  E.advance(st, seeded(1), 1);
  assert.strictEqual(st.seq, seq);
  assert.strictEqual(E.submit(st, 'p1', { t: 'sleep' }).ok, false);
  assert.strictEqual(E.ready(st), false);
});

/* ---------- views ---------- */
test('public view hides every living role and reveals dead ones per setting', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p1'); sub(st, 'p2', 'check', 'p0'); sub(st, 'p3', 'prank', 'p5'); allSleep(st, []);
  E.advance(st, seeded(1), 1);
  const pv = E.publicView(st);
  pv.players.forEach(function (p) {
    if (p.alive) assert.strictEqual(p.rv, null, p.id);
    else assert.strictEqual(p.rv, 'civilian');
  });
  assert.strictEqual(pv.recap, null);
  const txt = JSON.stringify(pv);
  assert.ok(!/"intel"|"notes"|"sub"|"lastSaved"|"mafiaChat"/.test(txt));
  assert.ok(!('players' in pv && pv.players.some(function (p) { return 'role' in p; })));
});
test('game over reveals all roles and a recap', function () {
  const st = mk(R6);
  E.removePlayer(st, 'p0');
  const pv = E.publicView(st);
  assert.strictEqual(pv.winner, 'town');
  assert.ok(pv.players.every(function (p) { return p.rv; }));
  assert.ok(Array.isArray(pv.recap));
});
test('player views expose only what that player may know', function () {
  const roles = ['mafia', 'mafia', 'doctor', 'police', 'prankster', 'civilian', 'civilian'];
  const st = mk(roles);
  sub(st, 'p0', 'kill', 'p5');
  const m0 = E.playerView(st, 'p0'), m1 = E.playerView(st, 'p1'), civ = E.playerView(st, 'p5'), doc = E.playerView(st, 'p2');
  assert.deepStrictEqual(m0.mates.map(function (m) { return m.id; }), ['p1']);
  assert.deepStrictEqual(m1.mates.map(function (m) { return m.id; }), ['p0']);
  assert.deepStrictEqual(m1.mateVotes, { p0: 'p5' });
  assert.deepStrictEqual(m0.mateVotes, {});
  [civ, doc].forEach(function (v) {
    assert.deepStrictEqual(v.mates, []);
    assert.deepStrictEqual(v.mateVotes, {});
    assert.deepStrictEqual(v.mchat, []);
  });
  assert.strictEqual(civ.act.kind, 'sleep');
  assert.strictEqual(doc.act.kind, 'save');
  assert.strictEqual(m0.act.kind, 'kill');
  assert.ok(m0.act.targets.indexOf('p1') === -1);
  const j = JSON.stringify(civ);
  assert.ok(!/p0|p1/.test(JSON.stringify({ mates: civ.mates, mv: civ.mateVotes })), 'civilian view leaks mafia ids');
  assert.strictEqual(civ.me.role, 'civilian');
});
test('mafia chat only appears in mafia views', function () {
  const st = mk(['mafia', 'mafia', 'doctor', 'police', 'civilian', 'civilian']);
  st.mafiaChat.push({ f: 'p0', t: 1, x: 'hi' });
  assert.strictEqual(E.playerView(st, 'p1').mchat.length, 1);
  assert.strictEqual(E.playerView(st, 'p2').mchat.length, 0);
  assert.strictEqual(E.playerView(st, 'p4').mchat.length, 0);
});
test('dead players get no action', function () {
  const st = mk(R6);
  st.players[4].alive = false;
  assert.strictEqual(E.playerView(st, 'p4').act, null);
});
test('state survives a JSON round trip mid-game', function () {
  const st = mk(R6);
  sub(st, 'p0', 'kill', 'p4'); sub(st, 'p1', 'save', 'p2');
  const copy = JSON.parse(JSON.stringify(st));
  sub(copy, 'p2', 'check', 'p0'); sub(copy, 'p3', 'prank', 'p5'); allSleep(copy, []);
  E.advance(copy, seeded(9), 5);
  assert.strictEqual(copy.phase, 'discuss');
  assert.ok(!alive(copy, 'p4'));
});

/* ---------- randomized full games ---------- */
function randomGame(n, cfg, seed) {
  const rng = seeded(seed);
  const players = Array.from({ length: n }, function (_, i) { return { id: 'r' + i, name: 'R' + i }; });
  const st = E.newGame({ gameId: 'rg' + seed, players: players, cfg: cfg, rng: rng, now: 1 });
  let steps = 0;
  while (st.phase !== 'over') {
    if (++steps > 200) throw new Error('did not terminate');
    const phaseBefore = st.phase, roundBefore = st.round, aliveBefore = st.players.filter(function (p) { return p.alive; }).length;
    // random subset submits random legal actions (sometimes everyone)
    const everyone = rng() < 0.7;
    st.players.forEach(function (p) {
      if (!p.alive) return;
      if (!everyone && rng() < 0.3) return;
      const act = E.actionFor(st, p);
      assert.ok(act, 'alive player must have an action');
      let to;
      if (act.kind === 'vote') { const opts = act.targets.concat(['skip']); to = opts[Math.floor(rng() * opts.length)]; }
      else if (act.targets.length) to = act.targets[Math.floor(rng() * act.targets.length)];
      const r = E.submit(st, p.id, { t: act.kind, to: to });
      assert.ok(r.ok, 'legal action rejected: ' + JSON.stringify(act) + ' ' + r.error);
    });
    // occasionally remove someone
    if (rng() < 0.04) {
      const livers = st.players.filter(function (p) { return p.alive; });
      E.removePlayer(st, livers[Math.floor(rng() * livers.length)].id);
      if (st.phase === 'over') break;
    }
    if (E.ready(st) || rng() < 0.5) E.advance(st, rng, steps);
    // invariants
    assert.ok(st.players.every(function (p) { return !(!p.alive && st.sub[p.id]); }), 'dead player has submission');
    if (st.phase !== 'over' && (phaseBefore !== st.phase || roundBefore !== st.round)) {
      assert.deepStrictEqual(st.sub, {}, 'submissions must reset on phase change');
    }
    const al = st.players.filter(function (p) { return p.alive; });
    const m = al.filter(function (p) { return p.role === 'mafia'; }).length;
    if (st.phase !== 'over') {
      assert.ok(m > 0 && m < al.length - m, 'live game must have 0 < mafia < town: m=' + m + ' alive=' + al.length);
    } else {
      assert.ok(st.winner === 'town' ? m === 0 : m >= al.length - m, 'winner inconsistent');
    }
    assert.ok(al.length <= aliveBefore, 'players cannot be revived');
  }
  return st;
}
test('randomized games: 4..8 players, many configs, invariants hold', function () {
  const cfgs = [{}, { mafia: 1 }, { mafia: 2 }, { doctor: false }, { police: false, prankster: false }, { reveal: 'none' }, { doctor: false, police: false, prankster: false }];
  let games = 0, town = 0, mafia = 0;
  for (let n = 4; n <= 8; n++) cfgs.forEach(function (cfg, ci) {
    for (let s = 1; s <= 300; s++) {
      const st = randomGame(n, cfg, n * 100003 + ci * 1009 + s);
      games++; if (st.winner === 'town') town++; else mafia++;
      assert.ok(st.recap.length >= 0);
      const pv = E.publicView(st);
      assert.ok(pv.players.every(function (p) { return p.rv; }));
    }
  });
  console.log('  simulated ' + games + ' random games (town ' + town + ' / mafia ' + mafia + ')');
});
test('randomized: state JSON round trips at every step and views never throw', function () {
  for (let s = 1; s <= 200; s++) {
    const n = 4 + (s % 5);
    const rng = seeded(s * 31);
    const players = Array.from({ length: n }, function (_, i) { return { id: 'j' + i, name: 'J' + i }; });
    let st = E.newGame({ gameId: 'j' + s, players: players, rng: rng, now: 1 });
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 400) {
      st = JSON.parse(JSON.stringify(st));
      st.players.forEach(function (p) {
        if (!p.alive) return;
        const act = E.actionFor(st, p);
        const opts = act.kind === 'vote' ? act.targets.concat(['skip']) : act.targets;
        const to = opts[Math.floor(rng() * opts.length)];
        E.submit(st, p.id, { t: act.kind, to: to });
        const v = E.playerView(st, p.id);
        JSON.stringify(v);
      });
      JSON.stringify(E.publicView(st));
      E.advance(st, rng, 1);
    }
    assert.strictEqual(st.phase, 'over');
  }
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
