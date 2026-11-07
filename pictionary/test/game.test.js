const assert = require('assert');
const PC = require('../src/game.js');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL: ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); } }
function seeded(seed) { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const P = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'N' + i, team: i % 2 }));
const setter = (g) => g.players.find(p => p.team === g.turn.setTeam && !p.left).id;
const guesser = (g) => g.players.find(p => p.team === g.turn.team && p.id !== g.turn.drawer && !p.left).id;

test('config normalisation', () => {
  assert.deepStrictEqual(PC.normalizeConfig({}), PC.defaultConfig());
  assert.deepStrictEqual(PC.normalizeConfig({ rounds: 3, drawSecs: 120, chooseSecs: 60, letterHints: false }), { rounds: 3, drawSecs: 120, chooseSecs: 60, letterHints: false });
  assert.deepStrictEqual(PC.normalizeConfig({ rounds: 9, drawSecs: 7 }), PC.defaultConfig());
});
test('player limits and team sizes', () => {
  assert.throws(() => PC.newGame({ players: P(3) }));
  assert.throws(() => PC.newGame({ players: P(13) }));
  assert.throws(() => PC.newGame({ players: [{ id: 'a', team: 0 }, { id: 'b', team: 0 }, { id: 'c', team: 0 }, { id: 'd', team: 1 }] }), /at least 2/);
  assert.throws(() => PC.newGame({ players: [{ id: 'a', team: 0 }, { id: 'a', team: 1 }, { id: 'c', team: 0 }, { id: 'd', team: 1 }] }), /Duplicate/);
  assert.ok(PC.newGame({ players: P(4) }));
  assert.ok(PC.newGame({ players: P(12) }));
});
test('balanceTeams keeps choices and evens out', () => {
  const m = PC.balanceTeams([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]);
  const c = [0, 0]; Object.values(m).forEach(t => c[t]++); assert.ok(Math.abs(c[0] - c[1]) <= 1);
  const m2 = PC.balanceTeams([{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 1 }, { id: 'd', team: 1 }]);
  const c2 = [0, 0]; Object.values(m2).forEach(t => c2[t]++); assert.deepStrictEqual(c2, [2, 2]);
});
test('guess matching: case, accents, spaces, hyphens, plurals', () => {
  assert.ok(PC.isCorrect('PANI-PURI', 'pani puri'));
  assert.ok(PC.isCorrect('panipuri', 'pani puri'));
  assert.ok(PC.isCorrect('deja vu', 'déjà vu'));
  assert.ok(PC.isCorrect('  Biryani!! ', 'biryani'));
  assert.ok(PC.isCorrect('elephants', 'elephant'));
  assert.ok(!PC.isCorrect('cats', 'cat'), 'short words need the exact word');
  assert.ok(!PC.isCorrect('ele', 'elephant'));
  assert.ok(PC.isClose('biryanni', 'biryani'));
  assert.ok(PC.isClose('elefant', 'elephant'));
  assert.ok(!PC.isClose('dog', 'cat'));
  assert.ok(!PC.isClose('biryani', 'biryani'), 'correct is not close');
});
test('leak filter blocks the word in any form', () => {
  assert.ok(PC.leaks('lol its PIZZA', 'pizza'));
  assert.ok(PC.leaks('p i z z a', 'pizza'));
  assert.ok(PC.leaks('think of vada', 'vada pav'));
  assert.ok(!PC.leaks('you will never get this', 'pizza'));
  assert.ok(!PC.leaks('a', 'a'));
});
test('word checks', () => {
  assert.strictEqual(PC.checkWord('samosa', 'Food', 'fried snack'), null);
  assert.match(PC.checkWord('', 'Food', ''), /Type a word/);
  assert.match(PC.checkWord('x', 'Food', ''), /2 letters/);
  assert.match(PC.checkWord('samosa', '', ''), /category/);
  assert.match(PC.checkWord('samosa', 'Food', 'a samosa'), /hint/);
  assert.match(PC.checkWord('samosa', 'samosa food', ''), /category/);
  assert.match(PC.checkWord('a b c d e f', 'Phrase', ''), /Five/);
  assert.match(PC.checkWord('x'.repeat(31), 'Thing', ''), /30/);
});
test('masks keep spaces and show revealed letters', () => {
  assert.strictEqual(PC.mask('vada pav', []).join(''), '____ ___');
  assert.strictEqual(PC.mask('vada pav', [0, 5]).join(''), 'v___ p__');
  assert.strictEqual(PC.mask('3 idiots', []).join(''), '_ ______');
});
test('a full turn: set word, wrong, close, correct, points, reveal, next turn', () => {
  const rng = seeded(1);
  const g = PC.newGame({ players: P(4), rng, now: 0 });
  assert.strictEqual(g.phase, 'choose');
  const t = g.turn, s = setter(g), gs = guesser(g);
  assert.notStrictEqual(PC.teamOf(g, t.drawer), PC.teamOf(g, s));
  assert.match(PC.setWord(g, gs, { word: 'samosa', category: 'Food' }, 1000), /other team/, 'guessers cannot set the word');
  assert.match(PC.setWord(g, s, { word: 'samosa', category: 'Food', hint: 'samosa!' }, 1000), /hint/);
  assert.strictEqual(PC.setWord(g, s, { word: 'Samosa', category: 'Food', hint: 'tea time snack' }, 1000), null);
  assert.strictEqual(g.phase, 'draw');
  assert.strictEqual(PC.say(g, t.drawer, 'its a samosa', 2000).kind, 'blocked', 'drawer cannot chat');
  assert.strictEqual(PC.say(g, s, 'S A M O S A', 2000).kind, 'blocked', 'setters cannot leak');
  assert.strictEqual(PC.say(g, s, 'you will never get it', 2000).kind, 'chat', 'setters can tease');
  assert.strictEqual(PC.say(g, gs, 'pizza', 3000).kind, 'guess');
  assert.strictEqual(PC.say(g, gs, 'samossa', 4000).kind, 'close');
  const half = 1000 + g.cfg.drawSecs * 500;
  const r = PC.say(g, gs, 'samosa', half);
  assert.strictEqual(r.kind, 'correct');
  assert.strictEqual(r.points, 75, 'half the time left gives 75');
  assert.strictEqual(g.teamScore[t.team], 75);
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.stats[gs].guessed, 1);
  assert.strictEqual(g.stats[t.drawer].drawnGuessed, 1);
  assert.strictEqual(g.history.length, 1);
  assert.strictEqual(g.history[0].word, 'Samosa');
  const ev = PC.tick(g, half + PC.REVEAL_MS, rng);
  assert.strictEqual(g.phase, 'choose');
  assert.ok(ev.some(e => e.k === 'turn'));
  assert.strictEqual(g.turn.team, 1 - t.team, 'teams alternate');
});
test('guessers never see the word; drawer, setters and spectators do', () => {
  const g = PC.newGame({ players: P(6), rng: seeded(2), now: 0 });
  const s = setter(g), gs = guesser(g);
  PC.setWord(g, s, { word: 'taj mahal', category: 'Place', hint: 'white marble' }, 0);
  const vg = PC.viewFor(g, gs), vd = PC.viewFor(g, g.turn.drawer), vs = PC.viewFor(g, s), vx = PC.viewFor(g, null, true);
  assert.strictEqual(vg.turn.word, null);
  assert.strictEqual(vg.turn.hint, '', 'hint hidden until it unlocks');
  assert.strictEqual(vg.turn.category, 'Place', 'category shown from the start');
  assert.strictEqual(vg.turn.mask.join(''), '___ _____');
  assert.ok(!JSON.stringify(vg).toLowerCase().includes('taj'), 'no trace of the word anywhere in the guesser view');
  assert.strictEqual(vd.turn.word, 'taj mahal');
  assert.strictEqual(vs.turn.word, 'taj mahal');
  assert.strictEqual(vx.turn.word, 'taj mahal');
  PC.tick(g, g.cfg.drawSecs * 1000 / 3 + 1, seeded(3));
  assert.strictEqual(PC.viewFor(g, gs).turn.hint, 'white marble', 'hint unlocks a third of the way in');
});
test('letter hints reveal some letters but never the whole word', () => {
  const g = PC.newGame({ players: P(4), rng: seeded(4), now: 0 });
  PC.setWord(g, setter(g), { word: 'pineapple', category: 'Food' }, 0);
  const T = g.cfg.drawSecs * 1000;
  PC.tick(g, T * 0.4, seeded(5)); assert.strictEqual(g.turn.shown.length, 0);
  PC.tick(g, T * 0.5 + 1, seeded(5)); const a = g.turn.shown.length; assert.ok(a >= 1);
  PC.tick(g, T * 0.75 + 1, seeded(5)); const b = g.turn.shown.length; assert.ok(b > a && b <= 9 - 2);
  const g2 = PC.newGame({ players: P(4), rng: seeded(4), now: 0, cfg: { letterHints: false } });
  PC.setWord(g2, setter(g2), { word: 'pineapple', category: 'Food' }, 0);
  PC.tick(g2, g2.cfg.drawSecs * 1000 * 0.9, seeded(5)); assert.strictEqual(g2.turn.shown.length, 0);
});
test('nobody guesses: the setting team scores for stumping them', () => {
  const g = PC.newGame({ players: P(4), rng: seeded(6), now: 0 });
  const s = setter(g), st = g.turn.setTeam;
  PC.setWord(g, s, { word: 'procrastination', category: 'Idea' }, 0);
  const ev = PC.tick(g, g.cfg.drawSecs * 1000, seeded(7));
  assert.ok(ev.some(e => e.k === 'stumped'));
  assert.strictEqual(g.teamScore[st], PC.STUMP_POINTS);
  assert.strictEqual(g.stats[s].stumps, 1);
  assert.strictEqual(g.history[0].result.kind, 'stumped');
});
test('setting team runs out of time: the game picks a word', () => {
  const g = PC.newGame({ players: P(4), rng: seeded(8), now: 0 });
  const ev = PC.tick(g, g.cfg.chooseSecs * 1000, seeded(9));
  assert.ok(ev.some(e => e.k === 'auto'));
  assert.strictEqual(g.phase, 'draw');
  assert.ok(g.turn.word && g.turn.category && g.turn.auto);
});
test('drawer can pass on one word, early only, and not get it back', () => {
  const g = PC.newGame({ players: P(4), rng: seeded(10), now: 0 });
  const s = setter(g), d = g.turn.drawer;
  PC.setWord(g, s, { word: 'gravity', category: 'Idea' }, 0);
  assert.match(PC.veto(g, s, 100), /drawer/);
  assert.strictEqual(PC.veto(g, d, 5000), null);
  assert.strictEqual(g.phase, 'choose');
  assert.match(PC.setWord(g, s, { word: 'Gravity', category: 'Idea' }, 6000), /already passed/);
  assert.strictEqual(PC.setWord(g, s, { word: 'apple', category: 'Food' }, 6000), null);
  assert.match(PC.veto(g, d, 7000), /already/);
  const g2 = PC.newGame({ players: P(4), rng: seeded(11), now: 0 });
  PC.setWord(g2, setter(g2), { word: 'gravity', category: 'Idea' }, 0);
  assert.match(PC.veto(g2, g2.turn.drawer, PC.VETO_MS + 1), /Too late/);
});
test('drawer leaving skips the turn; a team too small ends the game', () => {
  const g = PC.newGame({ players: P(6), rng: seeded(12), now: 0 });
  const d = g.turn.drawer;
  PC.leave(g, d, 100);
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.turn.result.kind, 'skipped');
  PC.tick(g, 100 + PC.REVEAL_MS, seeded(1));
  assert.notStrictEqual(g.turn.drawer, d, 'someone who left never draws');
  const g2 = PC.newGame({ players: P(4), rng: seeded(13), now: 0 });
  PC.leave(g2, 'p0', 0);
  assert.strictEqual(g2.phase, 'over');
});
test('whole games: every player draws in turn, totals add up, summary is consistent', () => {
  for (const [n, seed] of [[4, 21], [5, 22], [7, 23], [12, 24]]) {
    const rng = seeded(seed);
    const g = PC.newGame({ players: P(n), rng, now: 0, cfg: { rounds: 2 } });
    let now = 0, guard = 0, drawn = {}, guessedPts = 0, stumpPts = 0;
    while (g.phase !== 'over' && guard++ < 5000) {
      if (g.phase === 'choose') {
        if (rng() < 0.15) { now = g.turn.chooseUntil; PC.tick(g, now, rng); }
        else { const w = PC.suggest(rng, 1, g.used)[0]; assert.strictEqual(PC.setWord(g, setter(g), w, now), null); }
        continue;
      }
      if (g.phase === 'draw') {
        drawn[g.turn.drawer] = (drawn[g.turn.drawer] || 0) + 1;
        const team = g.turn.team;
        if (rng() < 0.7) { now += Math.floor(rng() * g.cfg.drawSecs * 1000); const r = PC.say(g, guesser(g), g.turn.word, now); if (r.kind === 'correct') guessedPts += r.points; else { now = g.turn.drawUntil; PC.tick(g, now, rng); stumpPts += PC.STUMP_POINTS; } }
        else { now = g.turn.drawUntil; PC.tick(g, now, rng); stumpPts += PC.STUMP_POINTS; }
        assert.strictEqual(g.phase, 'reveal');
        void team;
        continue;
      }
      if (g.phase === 'reveal') { now = g.turn.revealUntil; PC.tick(g, now, rng); }
    }
    assert.strictEqual(g.phase, 'over');
    assert.strictEqual(g.history.length, g.totalTurns);
    const size = [0, 0]; g.players.forEach(p => size[p.team]++);
    assert.strictEqual(g.totalTurns, 2 * 2 * Math.max(size[0], size[1]));
    g.players.forEach(p => assert.ok(drawn[p.id] >= 2, p.id + ' drew ' + drawn[p.id] + ' times'));
    assert.strictEqual(g.teamScore[0] + g.teamScore[1], guessedPts + stumpPts);
    const sum = PC.summary(g);
    assert.strictEqual(sum.rows.length, n);
    assert.ok(g.winner === 'tie' || g.teamScore[g.winner] > g.teamScore[1 - g.winner]);
    const ids = sum.awards.map(a => a.id); assert.strictEqual(new Set(ids).size, ids.length);
  }
});
test('suggestions avoid used words and come from every pack', () => {
  const packs = new Set(PC.WORDS.all.map(w => w.pack));
  assert.deepStrictEqual([...packs].sort(), ['everyday', 'hard', 'india']);
  assert.ok(PC.WORDS.all.length > 300);
  const s = PC.suggest(seeded(1), 3, ['samosa']);
  assert.strictEqual(s.length, 3); assert.ok(s.every(x => x.word && x.category));
  PC.WORDS.all.forEach(w => assert.strictEqual(PC.checkWord(w.word, w.category, ''), null, w.word));
});
test('a game can choose which team starts (the demo starts with yours)', () => {
  for (const ft of [0, 1]) { const g = PC.newGame({ players: P(4), rng: seeded(30 + ft), now: 0, firstTeam: ft }); assert.strictEqual(g.turn.team, ft); }
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
