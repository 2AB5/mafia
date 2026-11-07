/* ===== Tournament scheduler: knockout (with byes) or league, on up to two courts at once. Pure logic, tested in Node. ===== */
const TR = (function () {
  const MAX_ENTRIES = 16;
  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function roundName(size) { return size === 2 ? 'Final' : size === 4 ? 'Semi-final' : size === 8 ? 'Quarter-final' : 'Round of ' + size; }

  /* entries: [{ id, name, members: [playerId, …] }] */
  function create(opts) {
    const rng = opts.rng || Math.random;
    const entries = (opts.entries || []).map(function (e) { return { id: e.id, name: e.name, members: e.members.slice() }; });
    if (entries.length < 2) throw new Error('A tournament needs at least 2 entries.');
    if (entries.length > MAX_ENTRIES) throw new Error('16 entries at most.');
    const seen = {}; entries.forEach(function (e) { if (seen[e.id]) throw new Error('Duplicate entry.'); seen[e.id] = true; });
    const format = opts.format === 'league' ? 'league' : 'knockout';
    const t = { v: 1, id: opts.id || ('t' + Math.floor(rng() * 1e9).toString(36)), format: format, kind: opts.kind === 'doubles' ? 'doubles' : 'singles', courts: Math.max(1, Math.min(2, opts.courts || 2)),
      entries: entries, fixtures: [], champion: null, done: false, n: 0 };
    if (format === 'knockout') buildKnockout(t, rng); else buildLeague(t, rng);
    settleByes(t);
    return t;
  }
  function fx(t, o) { const f = Object.assign({ id: 'f' + (++t.n), a: null, b: null, from: null, status: 'wait', court: null, winner: null, games: [], walkover: false, bye: false }, o); t.fixtures.push(f); return f; }
  function buildKnockout(t, rng) {
    const ids = shuffle(t.entries.map(function (e) { return e.id; }), rng);
    let size = 2; while (size < ids.length) size *= 2;
    // spread the byes: the top seeds of the shuffled list get them, one per first-round pair
    const slots = new Array(size).fill(null);
    const byes = size - ids.length;
    // byes go to pairs spread across the bracket (bit-reversed order), so bye winners don't meet each other early
    const pairs = size / 2, bits = Math.round(Math.log2(pairs));
    const rev = function (i) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); return r; };
    const byePair = {}; Array.from({ length: pairs }, function (_, i) { return i; }).sort(function (x, y) { return rev(x) - rev(y); }).slice(0, byes).forEach(function (i) { byePair[i] = true; });
    let k = 0;
    for (let i = 0; i < pairs; i++) {
      slots[2 * i] = ids[k++] || null;
      slots[2 * i + 1] = byePair[i] ? null : (ids[k++] || null);
    }
    let prev = [];
    for (let i = 0; i < size / 2; i++) prev.push(fx(t, { round: 0, roundName: roundName(size), a: slots[2 * i], b: slots[2 * i + 1], slot: i }));
    let r = 1, cur = size / 2;
    while (cur >= 2) {
      const next = [];
      for (let i = 0; i < cur / 2; i++) next.push(fx(t, { round: r, roundName: roundName(cur), from: [prev[2 * i].id, prev[2 * i + 1].id], slot: i }));
      prev = next; cur /= 2; r++;
    }
    t.rounds = r;
  }
  function buildLeague(t, rng) {
    // circle method: every entry plays every other once, spread over rounds
    const ids = shuffle(t.entries.map(function (e) { return e.id; }), rng);
    if (ids.length % 2) ids.push(null);
    const n = ids.length, rounds = n - 1;
    const arr = ids.slice();
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a && b) fx(t, { round: r, roundName: 'Round ' + (r + 1), a: r % 2 ? b : a, b: r % 2 ? a : b });
      }
      arr.splice(1, 0, arr.pop());
    }
    t.rounds = rounds;
  }
  function byId(t, id) { return t.fixtures.find(function (f) { return f.id === id; }) || null; }
  function entry(t, id) { return t.entries.find(function (e) { return e.id === id; }) || null; }
  function nameOf(t, id) { const e = entry(t, id); return e ? e.name : 'TBD'; }
  /* a fixture with only one side (a bye) is won without playing; winners move up the bracket */
  function settleByes(t) {
    let changed = true;
    while (changed) {
      changed = false;
      t.fixtures.forEach(function (f) {
        if (f.status === 'done') return;
        if (f.from) {
          const fa = byId(t, f.from[0]), fb = byId(t, f.from[1]);
          if (!f.a && fa.status === 'done') { f.a = fa.winner; changed = true; }
          if (!f.b && fb.status === 'done') { f.b = fb.winner; changed = true; }
          // both feeders were byes with nobody in them: impossible with our seeding, but guard anyway
          if (fa.status === 'done' && fb.status === 'done' && (!f.a || !f.b) && (f.a || f.b)) { f.winner = f.a || f.b; f.status = 'done'; f.bye = true; changed = true; }
          return;
        }
        if (t.format === 'knockout' && f.round === 0 && (!f.a || !f.b) && (f.a || f.b)) { f.winner = f.a || f.b; f.status = 'done'; f.bye = true; changed = true; }
      });
    }
    t.fixtures.forEach(function (f) { if (f.status === 'wait' && f.a && f.b) f.status = 'ready'; });
    finishIfDone(t);
  }
  function busy(t) { const b = {}; t.fixtures.forEach(function (f) { if (f.status === 'live') { b[f.a] = true; b[f.b] = true; } }); return b; }
  function freeCourts(t) { const used = {}; t.fixtures.forEach(function (f) { if (f.status === 'live') used[f.court] = true; }); const out = []; for (let c = 1; c <= t.courts; c++) if (!used[c]) out.push(c); return out; }
  /* put ready fixtures on free courts; nobody plays on two courts at once. Returns the fixtures just started. */
  function assign(t) {
    const started = [];
    freeCourts(t).forEach(function (c) {
      const b = busy(t);
      // earlier rounds first, then the order they were drawn
      const f = t.fixtures.filter(function (x) { return x.status === 'ready' && !b[x.a] && !b[x.b]; }).sort(function (x, y) { return x.round - y.round; })[0];
      if (!f) return;
      f.status = 'live'; f.court = c;
      started.push(f);
    });
    return started;
  }
  function report(t, fid, winner, games, walkover) {
    const f = byId(t, fid);
    if (!f || f.status === 'done' || (winner !== f.a && winner !== f.b)) return false;
    f.status = 'done'; f.winner = winner; f.games = (games || []).map(function (g) { return g.slice(); }); f.walkover = !!walkover;
    settleByes(t);
    return true;
  }
  function walkover(t, fid, winner) { return report(t, fid, winner, [], true); }
  function standings(t) {
    const rows = {};
    t.entries.forEach(function (e) { rows[e.id] = { id: e.id, name: e.name, played: 0, won: 0, lost: 0, gw: 0, gl: 0, pw: 0, pl: 0 }; });
    t.fixtures.forEach(function (f) {
      if (f.status !== 'done' || f.bye || !f.a || !f.b) return;
      const A = rows[f.a], B = rows[f.b];
      A.played++; B.played++;
      if (f.winner === f.a) { A.won++; B.lost++; } else { B.won++; A.lost++; }
      f.games.forEach(function (g) { A.pw += g[0]; A.pl += g[1]; B.pw += g[1]; B.pl += g[0]; if (g[0] > g[1]) { A.gw++; B.gl++; } else { B.gw++; A.gl++; } });
    });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (x, y) { return (y.won - x.won) || ((y.gw - y.gl) - (x.gw - x.gl)) || ((y.pw - y.pl) - (x.pw - x.pl)) || x.name.localeCompare(y.name); });
  }
  function finishIfDone(t) {
    if (t.done) return;
    if (t.format === 'knockout') {
      const final = t.fixtures.filter(function (f) { return f.round === t.rounds - 1; })[0];
      if (final && final.status === 'done') { t.done = true; t.champion = final.winner; }
    } else if (t.fixtures.every(function (f) { return f.status === 'done'; })) { t.done = true; t.champion = standings(t)[0].id; }
  }
  function live(t) { return t.fixtures.filter(function (f) { return f.status === 'live'; }); }
  function upcoming(t) { return t.fixtures.filter(function (f) { return f.status === 'ready' || f.status === 'wait'; }); }
  function entryOfPlayer(t, pid) { return t.entries.find(function (e) { return e.members.indexOf(pid) !== -1; }) || null; }
  /* pair players into teams of two (random); an odd one out is returned separately */
  function pairUp(players, rng) {
    const s = shuffle(players, rng || Math.random), teams = [];
    for (let i = 0; i + 1 < s.length; i += 2) teams.push([s[i], s[i + 1]]);
    return { teams: teams, spare: s.length % 2 ? s[s.length - 1] : null };
  }
  return { MAX_ENTRIES: MAX_ENTRIES, create: create, assign: assign, report: report, walkover: walkover, standings: standings, byId: byId, entry: entry, nameOf: nameOf, live: live, upcoming: upcoming, entryOfPlayer: entryOfPlayer, pairUp: pairUp, freeCourts: freeCourts, roundName: roundName };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TR;
