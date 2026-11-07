const assert = require('assert');
const TR = require('../src/tour.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL: ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); } }
function seeded(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const E = n => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'P' + i, members: ['p' + i] }));
/* run a whole tournament: two courts, results decided by rng, checking the rules at every step */
function play(t, rng) {
  let guard = 0, maxLive = 0;
  while (!t.done && guard++ < 500) {
    TR.assign(t);
    const live = TR.live(t);
    maxLive = Math.max(maxLive, live.length);
    // nobody on two courts at once, courts are distinct
    const ids = live.flatMap(f => [f.a, f.b]); assert.strictEqual(new Set(ids).size, ids.length, 'an entry is on two courts');
    assert.strictEqual(new Set(live.map(f => f.court)).size, live.length);
    assert.ok(live.length <= t.courts);
    if (!live.length) throw new Error('stuck with nothing to play');
    const f = live[Math.floor(rng() * live.length)];
    const w = rng() < 0.5 ? f.a : f.b;
    const g = w === f.a ? [[10, 6], [7, 10], [10, 8]] : [[6, 10], [10, 4], [8, 10]];
    assert.ok(TR.report(t, f.id, w, g));
  }
  return { maxLive };
}
test('knockout brackets for 2 to 16 entries: byes, one champion, everyone else loses exactly once', () => {
  for (let n = 2; n <= 16; n++) {
    const t = TR.create({ entries: E(n), format: 'knockout', rng: seeded(n) });
    let size = 2; while (size < n) size *= 2;
    const byes = t.fixtures.filter(f => f.bye).length;
    assert.strictEqual(byes, size - n, n + ' entries: ' + (size - n) + ' byes');
    // with 2+ byes, no two bye winners meet in round 2 unless every pair has a bye... check the spread for 6 entries
    if (n === 6) { const r1 = t.fixtures.filter(f => f.round === 1); assert.ok(r1.every(f => f.from.filter(id => TR.byId(t, id).bye).length < 2), 'byes are spread out'); }
    const r = play(t, seeded(100 + n));
    assert.ok(t.done && t.champion, n + ' entries: a champion');
    const played = t.fixtures.filter(f => !f.bye && f.status === 'done');
    assert.strictEqual(played.length, n - 1, n + ' entries need ' + (n - 1) + ' matches');
    const losses = {}; played.forEach(f => { const l = f.winner === f.a ? f.b : f.a; losses[l] = (losses[l] || 0) + 1; });
    assert.ok(Object.values(losses).every(x => x === 1)); assert.ok(!losses[t.champion]);
    if (n >= 4) assert.strictEqual(r.maxLive, 2, n + ' entries use both courts at once');
    assert.strictEqual(t.fixtures.filter(f => f.round === t.rounds - 1)[0].roundName, 'Final');
  }
});
test('league: everyone plays everyone once; table sorted by wins, then games, then points', () => {
  for (let n = 2; n <= 8; n++) {
    const t = TR.create({ entries: E(n), format: 'league', rng: seeded(n) });
    assert.strictEqual(t.fixtures.length, n * (n - 1) / 2);
    const pairs = new Set(t.fixtures.map(f => [f.a, f.b].sort().join('-'))); assert.strictEqual(pairs.size, t.fixtures.length);
    play(t, seeded(200 + n));
    const st = TR.standings(t);
    assert.ok(st.every(r => r.played === n - 1));
    for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].won >= st[i].won);
    assert.strictEqual(t.champion, st[0].id);
  }
});
test('one court: matches run one at a time', () => {
  const t = TR.create({ entries: E(5), format: 'league', courts: 1, rng: seeded(3) });
  const r = play(t, seeded(4));
  assert.strictEqual(r.maxLive, 1);
});
test('walkover and bad reports', () => {
  const t = TR.create({ entries: E(4), format: 'knockout', rng: seeded(5) });
  const [f] = TR.assign(t);
  assert.ok(!TR.report(t, f.id, 'nobody', []), 'winner must be in the match');
  assert.ok(TR.walkover(t, f.id, f.b));
  assert.ok(TR.byId(t, f.id).walkover);
  assert.ok(!TR.report(t, f.id, f.a, []), 'can’t report twice');
});
test('pairing players into doubles teams', () => {
  const r = TR.pairUp(['a', 'b', 'c', 'd', 'e'], seeded(6));
  assert.strictEqual(r.teams.length, 2); assert.ok(r.spare);
  assert.strictEqual(new Set(r.teams.flat().concat([r.spare])).size, 5);
  const t = TR.create({ entries: r.teams.map((m, i) => ({ id: 't' + i, name: m.join(' & '), members: m })), kind: 'doubles', rng: seeded(7) });
  assert.strictEqual(t.kind, 'doubles'); assert.ok(TR.entryOfPlayer(t, r.teams[1][0]).id === 't1');
});
test('limits', () => {
  assert.throws(() => TR.create({ entries: E(1) }));
  assert.throws(() => TR.create({ entries: E(17) }));
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
