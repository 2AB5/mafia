/* ===== Pictionary rules: two teams; the other team sets the word, its category and a hint. Pure logic, tested in Node. ===== */
const PC = (function () {
  const WORDS = typeof PC_WORDS !== 'undefined' ? PC_WORDS : require('./words.js');
  const MIN_PLAYERS = 4, MAX_PLAYERS = 12;
  const TEAMS = [{ name: 'Blue team', short: 'Blue', color: '#2f66d0' }, { name: 'Red team', short: 'Red', color: '#d6455d' }];
  const CATEGORIES = ['Object', 'Animal', 'Food', 'Action', 'Place', 'Movie', 'Person', 'Song', 'Sport', 'Festival', 'Phrase', 'Idea', 'Thing'];
  const GUESS_MIN = 50, GUESS_MAX = 100, STUMP_POINTS = 40;
  const REVEAL_MS = 5000, VETO_MS = 15000, VETO_CHOOSE_MS = 25000;

  function defaultConfig() { return { rounds: 2, drawSecs: 80, chooseSecs: 40, letterHints: true }; }
  function normalizeConfig(c) {
    c = c || {};
    const d = defaultConfig();
    return {
      rounds: [1, 2, 3, 4].indexOf(c.rounds) !== -1 ? c.rounds : d.rounds,
      drawSecs: [60, 80, 100, 120].indexOf(c.drawSecs) !== -1 ? c.drawSecs : d.drawSecs,
      chooseSecs: [30, 40, 60].indexOf(c.chooseSecs) !== -1 ? c.chooseSecs : d.chooseSecs,
      letterHints: c.letterHints === undefined ? d.letterHints : !!c.letterHints
    };
  }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 14) || 'Player'; }

  /* ---------- words ---------- */
  // lower case, no accents, letters and digits only, single spaces
  function norm(s) {
    let t = String(s == null ? '' : s).toLowerCase();
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engines */ }
    return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function compact(s) { return norm(s).replace(/ /g, ''); }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = []; for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function isCorrect(guess, word) {
    const g = compact(guess), w = compact(word);
    if (!g || !w) return false;
    if (g === w) return true;
    if (w.length >= 4 && (g === w + 's' || g + 's' === w || g === w + 'es' || g + 'es' === w)) return true;   // plural slips
    return false;
  }
  function isClose(guess, word) {
    const g = compact(guess), w = compact(word);
    if (!g || !w || isCorrect(guess, word)) return false;
    if (w.length < 4) return false;
    return lev(g, w) <= (w.length >= 8 ? 2 : 1);
  }
  // does a chat message give the word away?
  function leaks(text, word) {
    const t = compact(text), w = compact(word);
    if (!w || w.length < 2) return false;
    if (t.indexOf(w) !== -1) return true;
    const tw = norm(text).split(' '), ww = norm(word).split(' ');
    // multi-word answers: saying any long word of it counts as a leak
    return ww.length > 1 && ww.some(function (x) { return x.length >= 4 && tw.indexOf(x) !== -1; });
  }
  function checkWord(word, category, hint) {
    const w = String(word == null ? '' : word).replace(/\s+/g, ' ').trim();
    const n = norm(w);
    if (!n) return 'Type a word for them to draw.';
    if (w.length > 30) return 'Keep the word under 30 characters.';
    if (compact(w).length < 2) return 'The word needs at least 2 letters.';
    if (n.split(' ').length > 5) return 'Five words at most.';
    const cat = String(category == null ? '' : category).replace(/\s+/g, ' ').trim();
    if (!cat) return 'Pick a category.';
    if (cat.length > 18) return 'Keep the category short.';
    if (leaks(cat, w)) return 'The category can’t contain the word.';
    const hi = String(hint == null ? '' : hint).replace(/\s+/g, ' ').trim();
    if (hi.length > 60) return 'Keep the hint under 60 characters.';
    if (hi && leaks(hi, w)) return 'The hint can’t contain the word.';
    return null;
  }
  // the word as blanks, e.g. "_ _ _ _   _ _ _" with revealed letters filled in
  function mask(word, shown) {
    const set = {}; (shown || []).forEach(function (i) { set[i] = true; });
    return Array.from(word).map(function (ch, i) { return /[\p{L}\p{N}]/u.test(ch) ? (set[i] ? ch : '_') : ch; });
  }
  function letterSlots(word) { const out = []; Array.from(word).forEach(function (ch, i) { if (/[\p{L}\p{N}]/u.test(ch)) out.push(i); }); return out; }
  function suggest(rng, n, avoid) {
    rng = rng || Math.random;
    const used = {}; (avoid || []).forEach(function (w) { used[compact(w)] = true; });
    const pool = WORDS.all.filter(function (x) { return !used[compact(x.word)]; });
    const out = [];
    while (out.length < (n || 3) && pool.length) { const i = Math.floor(rng() * pool.length); out.push({ word: pool[i].word, category: pool[i].category }); pool.splice(i, 1); }
    return out;
  }

  /* ---------- teams ---------- */
  function balanceTeams(list) {
    const map = {}; const c = [0, 0];
    list.forEach(function (p) { if (p.team === 0 || p.team === 1) { map[p.id] = p.team; c[p.team]++; } });
    list.forEach(function (p) { if (map[p.id] === undefined) { const t = c[0] <= c[1] ? 0 : 1; map[p.id] = t; c[t]++; } });
    // fix a lopsided split (more than one apart) by moving the newest players
    for (let guard = 0; guard < 20 && Math.abs(c[0] - c[1]) > 1; guard++) {
      const from = c[0] > c[1] ? 0 : 1;
      const mover = list.slice().reverse().find(function (p) { return map[p.id] === from; });
      map[mover.id] = 1 - from; c[from]--; c[1 - from]++;
    }
    return map;
  }

  /* ---------- game ---------- */
  function newGame(opts) {
    const rng = opts.rng || Math.random;
    const players = opts.players || [];
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('Pictionary needs ' + MIN_PLAYERS + ' to ' + MAX_PLAYERS + ' players.');
    const seen = {};
    players.forEach(function (p) { if (seen[p.id]) throw new Error('Duplicate player id.'); seen[p.id] = true; if (p.team !== 0 && p.team !== 1) throw new Error('Every player needs a team.'); });
    const size = [0, 0]; players.forEach(function (p) { size[p.team]++; });
    if (size[0] < 2 || size[1] < 2) throw new Error('Each team needs at least 2 players: one draws, the rest guess.');
    const cfg = normalizeConfig(opts.cfg);
    const g = {
      v: 1,
      id: opts.id || ('g' + Math.floor(rng() * 1e9).toString(36)),
      cfg: cfg,
      players: players.map(function (p) { return { id: p.id, name: cleanName(p.name), team: p.team, score: 0, left: false }; }),
      teamScore: [0, 0],
      stats: {},
      next: [0, 0],                       // whose turn to draw next, per team
      firstTeam: opts.firstTeam === 0 || opts.firstTeam === 1 ? opts.firstTeam : rng() < 0.5 ? 0 : 1,
      turnNo: 0,
      totalTurns: 2 * cfg.rounds * Math.max(size[0], size[1]),
      phase: 'choose',                    // 'choose' | 'draw' | 'reveal' | 'over'
      turn: null,
      history: [],
      used: [],
      winner: null,                       // 0, 1, or 'tie'
      log: []
    };
    g.players.forEach(function (p) { g.stats[p.id] = { guessed: 0, drew: 0, drawnGuessed: 0, stumps: 0, set: 0, fastest: 0, close: 0, wrong: 0 }; });
    startTurn(g, opts.now || 0);
    return g;
  }
  function playerOf(g, id) { return g.players.find(function (p) { return p.id === id; }) || null; }
  function nameOf(g, id) { const p = playerOf(g, id); return p ? p.name : 'Player'; }
  function teamOf(g, id) { const p = playerOf(g, id); return p ? p.team : null; }
  function members(g, t, online) { return g.players.filter(function (p) { return p.team === t && !p.left && (!online || online[p.id] !== false); }); }
  function addLog(g, x) { g.log.push(x); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); }

  /* pick the next drawer for team t, rotating; skips players who left (and, if given, are offline) */
  function pickDrawer(g, t, online) {
    const mem = g.players.filter(function (p) { return p.team === t; });
    for (let k = 0; k < mem.length; k++) {
      const idx = (g.next[t] + k) % mem.length, p = mem[idx];
      if (!p.left && (!online || online[p.id] !== false)) { g.next[t] = (idx + 1) % mem.length; return p.id; }
    }
    return null;
  }
  function startTurn(g, now, online) {
    if (g.turnNo >= g.totalTurns) return finish(g);
    const team = (g.firstTeam + g.turnNo) % 2;
    // a team needs a drawer and at least one guesser, and the other team someone to set the word
    if (members(g, 0).length < 2 || members(g, 1).length < 2) return finish(g, 'Not enough players left on a team.');
    const drawer = pickDrawer(g, team, online) || pickDrawer(g, team);
    if (!drawer) return finish(g, 'Nobody left to draw.');
    g.turnNo++;
    g.phase = 'choose';
    g.turn = {
      n: g.turnNo, team: team, setTeam: 1 - team, drawer: drawer,
      word: null, category: '', hint: '', setBy: null, auto: false,
      chooseUntil: now + g.cfg.chooseSecs * 1000, drawStart: 0, drawUntil: 0, revealUntil: 0,
      shown: [], hintShown: false, vetoed: false, result: null, guesses: 0
    };
    addLog(g, 'Turn ' + g.turnNo + ': ' + nameOf(g, drawer) + ' draws for the ' + TEAMS[team].name + '. The ' + TEAMS[1 - team].name + ' sets the word.');
    return [{ k: 'turn', drawer: drawer, team: team }];
  }
  function beginDraw(g, now) {
    const t = g.turn;
    g.phase = 'draw';
    t.drawStart = now; t.drawUntil = now + g.cfg.drawSecs * 1000;
    t.shown = []; t.hintShown = !t.hint ? true : false;
    g.used.push(t.word);
  }
  function setWord(g, pid, data, now) {
    const t = g.turn;
    if (!t || g.phase !== 'choose') return 'It’s not time to pick a word.';
    const p = playerOf(g, pid);
    if (!p || p.left || p.team !== t.setTeam) return 'Only the other team sets the word.';
    data = data || {};
    const err = checkWord(data.word, data.category, data.hint);
    if (err) return err;
    if (t.vetoed && t.vetoedWord && compact(t.vetoedWord) === compact(data.word)) return nameOf(g, t.drawer) + ' already passed on that word. Pick another.';
    t.word = String(data.word).replace(/\s+/g, ' ').trim();
    t.category = String(data.category).replace(/\s+/g, ' ').trim();
    t.hint = String(data.hint || '').replace(/\s+/g, ' ').trim();
    t.setBy = pid; t.auto = false;
    g.stats[pid].set++;
    beginDraw(g, now);
    addLog(g, nameOf(g, pid) + ' set the word. ' + nameOf(g, t.drawer) + ' is drawing.');
    return null;
  }
  function autoWord(g, now, rng) {
    const t = g.turn;
    const s = suggest(rng, 1, g.used)[0] || { word: 'cat', category: 'Animal' };
    t.word = s.word; t.category = s.category; t.hint = ''; t.setBy = null; t.auto = true;
    beginDraw(g, now);
    addLog(g, 'Time ran out, so the game picked a word.');
  }
  /* the drawer can pass on a word once, early in the turn */
  function veto(g, pid, now) {
    const t = g.turn;
    if (!t || g.phase !== 'draw' || t.drawer !== pid) return 'Only the drawer can pass on the word.';
    if (t.vetoed) return 'You already passed on one word this turn.';
    if (now - t.drawStart > VETO_MS) return 'Too late to pass. Draw it!';
    t.vetoed = true; t.vetoedWord = t.word;
    if (t.setBy && g.stats[t.setBy]) g.stats[t.setBy].set--;
    g.used = g.used.filter(function (w) { return w !== t.word; });
    t.word = null; t.category = ''; t.hint = ''; t.setBy = null; t.auto = false;
    g.phase = 'choose'; t.chooseUntil = now + VETO_CHOOSE_MS; t.shown = []; t.hintShown = false;
    addLog(g, nameOf(g, pid) + ' passed on the word. The ' + TEAMS[t.setTeam].name + ' picks another.');
    return null;
  }
  function guessPoints(g, now) {
    const t = g.turn, total = t.drawUntil - t.drawStart, left = Math.max(0, t.drawUntil - now);
    return GUESS_MIN + Math.round((GUESS_MAX - GUESS_MIN) * (total > 0 ? left / total : 0));
  }
  function endTurn(g, now, result) {
    const t = g.turn;
    t.result = result;
    g.phase = 'reveal';
    t.revealUntil = now + REVEAL_MS;
    g.history.push({ n: t.n, team: t.team, drawer: t.drawer, word: t.word, category: t.category, hint: t.hint, setBy: t.setBy, auto: t.auto, result: result });
  }
  /* a chat line from a player during a turn: a guess, a leak to block, or plain chat */
  function say(g, pid, text, now) {
    const t = g.turn, p = playerOf(g, pid);
    const msg = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!msg) return { kind: 'ignored' };
    if (!p || p.left) return { kind: 'chat', text: msg };            // spectators etc. are handled by the host
    if (!t || g.phase === 'over') return { kind: 'chat', text: msg };
    const word = t.word;
    if (g.phase === 'draw' && pid === t.drawer) return { kind: 'blocked', why: 'You’re drawing, so you can’t chat. Use reactions!' };
    if (g.phase === 'draw' && p.team === t.team) {
      t.guesses++;
      if (isCorrect(msg, word)) {
        const pts = guessPoints(g, now), secs = Math.round((now - t.drawStart) / 100) / 10;
        g.teamScore[t.team] += pts;
        p.score += pts; const d = playerOf(g, t.drawer); if (d) d.score += Math.round(pts / 2);
        const st = g.stats[pid]; st.guessed++; if (!st.fastest || secs < st.fastest) st.fastest = secs;
        g.stats[t.drawer].drew++; g.stats[t.drawer].drawnGuessed++;
        endTurn(g, now, { kind: 'guessed', by: pid, points: pts, secs: secs });
        addLog(g, p.name + ' guessed it in ' + secs + ' s: ' + word + '. +' + pts + ' to the ' + TEAMS[t.team].name + '.');
        return { kind: 'correct', points: pts, secs: secs };
      }
      if (isClose(msg, word)) { g.stats[pid].close++; return { kind: 'close', text: msg }; }
      g.stats[pid].wrong++;
      return { kind: 'guess', text: msg };
    }
    // everyone who knows the word (the setting team, or anyone while choosing) must not leak it
    if ((g.phase === 'draw' || g.phase === 'choose') && word && leaks(msg, word)) return { kind: 'blocked', why: 'That gives the word away, so only you can see it.' };
    return { kind: 'chat', text: msg };
  }
  /* host clock: timeouts and hints. Returns events for the chat feed. */
  function tick(g, now, rng, online) {
    const t = g.turn, ev = [];
    if (!t || g.phase === 'over') return ev;
    if (g.phase === 'choose' && now >= t.chooseUntil) {
      autoWord(g, now, rng);
      ev.push({ k: 'auto' });
    }
    if (g.phase === 'draw') {
      const total = t.drawUntil - t.drawStart, el = now - t.drawStart;
      if (t.hint && !t.hintShown && el >= total / 3) { t.hintShown = true; ev.push({ k: 'hint', hint: t.hint }); }
      if (g.cfg.letterHints) {
        const slots = letterSlots(t.word);
        const want = slots.length < 3 ? 0 : el >= total * 0.75 ? 2 : el >= total * 0.5 ? 1 : 0;
        const per = Math.max(1, Math.round(slots.length * 0.15));
        while (want > 0 && t.shown.length < Math.min(want * per, slots.length - 2)) {
          const free = slots.filter(function (i) { return t.shown.indexOf(i) === -1; });
          const pick = free[Math.floor((rng || Math.random)() * free.length)];
          t.shown.push(pick); t.shown.sort(function (a, b) { return a - b; });
          ev.push({ k: 'letter' });
        }
      }
      if (now >= t.drawUntil) {
        g.teamScore[t.setTeam] += STUMP_POINTS;
        g.stats[t.drawer].drew++;
        if (t.setBy && g.stats[t.setBy]) g.stats[t.setBy].stumps++;
        endTurn(g, now, { kind: 'stumped', points: STUMP_POINTS });
        addLog(g, 'Nobody got it! The word was ' + t.word + '. +' + STUMP_POINTS + ' to the ' + TEAMS[t.setTeam].name + '.');
        ev.push({ k: 'stumped' });
      }
    }
    if (g.phase === 'reveal' && now >= t.revealUntil) {
      const e = startTurn(g, now, online);
      if (Array.isArray(e)) e.forEach(function (x) { ev.push(x); });
      if (g.phase === 'over') ev.push({ k: 'over' });
    }
    return ev;
  }
  /* the drawer left or was skipped: no points, move on */
  function skipTurn(g, now, why) {
    const t = g.turn;
    if (!t || g.phase === 'over' || g.phase === 'reveal') return false;
    endTurn(g, now, { kind: 'skipped', why: why || '' });
    addLog(g, nameOf(g, t.drawer) + (why || '’s turn was skipped.'));
    return true;
  }
  function leave(g, pid, now) {
    const p = playerOf(g, pid);
    if (!p || p.left || g.phase === 'over') return false;
    p.left = true;
    addLog(g, p.name + ' left the game.');
    if (members(g, 0).length < 2 || members(g, 1).length < 2) { if (g.turn && g.phase !== 'reveal') endTurn(g, now, { kind: 'skipped', why: '' }); finish(g, 'Not enough players left on a team.'); return true; }
    if (g.turn && g.turn.drawer === pid && (g.phase === 'choose' || g.phase === 'draw')) skipTurn(g, now, ' left, so the turn was skipped.');
    return true;
  }
  function finish(g, why) {
    g.phase = 'over';
    g.winner = g.teamScore[0] === g.teamScore[1] ? 'tie' : g.teamScore[0] > g.teamScore[1] ? 0 : 1;
    if (why) addLog(g, why);
    addLog(g, g.winner === 'tie' ? 'It’s a tie!' : TEAMS[g.winner].name + ' wins!');
    return [{ k: 'over' }];
  }

  /* what one player may see: guessers never get the word until the reveal */
  function knowsWord(g, pid) {
    const t = g.turn;
    if (!t || !t.word) return false;
    if (g.phase === 'reveal' || g.phase === 'over') return true;
    if (pid === null || pid === undefined) return true;                 // spectators and the host's own logic
    const p = playerOf(g, pid);
    if (!p) return true;                                               // spectators
    return pid === t.drawer || p.team === t.setTeam || p.left;
  }
  function viewFor(g, pid, spectator) {
    const v = JSON.parse(JSON.stringify(g));
    v.used = [];
    if (v.turn) {
      const knows = spectator ? true : knowsWord(g, pid);
      if (v.turn.word) {
        v.turn.len = Array.from(v.turn.word).length;
        v.turn.mask = mask(v.turn.word, v.turn.shown);
      }
      if (!knows) { v.turn.word = null; v.turn.vetoedWord = null; if (!v.turn.hintShown) v.turn.hint = ''; }
      v.turn.knows = knows;
      if (!knows && v.turn.vetoedWord) v.turn.vetoedWord = null;
    }
    // finished turns: guessers learn each word at its reveal, so history is public
    return v;
  }

  /* end-of-game summary */
  function summary(g) {
    const rows = g.players.map(function (p) { const s = g.stats[p.id]; return { id: p.id, name: p.name, team: p.team, left: p.left, score: p.score, guessed: s.guessed, drew: s.drew, drawnGuessed: s.drawnGuessed, stumps: s.stumps, set: s.set, fastest: s.fastest, close: s.close, wrong: s.wrong }; });
    rows.sort(function (a, b) { return (b.score - a.score) || (b.guessed - a.guessed) || a.name.localeCompare(b.name); });
    const awards = [];
    const top = function (val, ok) {
      const c = rows.filter(ok || function () { return true; });
      if (!c.length) return null;
      c.sort(function (a, b) { return val(b) - val(a); });
      if (c.length > 1 && val(c[0]) === val(c[1])) return null;
      return c[0];
    };
    const plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    let r;
    r = top(function (x) { return -x.fastest; }, function (x) { return x.fastest > 0; });
    if (r) awards.push({ id: 'quick', icon: '⚡', title: 'Quickest guess', who: r.id, text: 'got one in ' + r.fastest + ' s' });
    r = top(function (x) { return x.drawnGuessed * 100 - x.drew; }, function (x) { return x.drawnGuessed >= 1; });
    if (r) awards.push({ id: 'artist', icon: '🎨', title: 'Best artist', who: r.id, text: plural(r.drawnGuessed, 'drawing') + ' guessed' });
    r = top(function (x) { return x.guessed; }, function (x) { return x.guessed >= 1; });
    if (r) awards.push({ id: 'eyes', icon: '👀', title: 'Sharp eyes', who: r.id, text: r.guessed + (r.guessed === 1 ? ' correct guess' : ' correct guesses') });
    r = top(function (x) { return x.stumps; }, function (x) { return x.stumps >= 1; });
    if (r) awards.push({ id: 'stump', icon: '🧩', title: 'Word master', who: r.id, text: 'stumped the other team ' + (r.stumps === 1 ? 'once' : r.stumps + ' times') });
    r = top(function (x) { return x.close; }, function (x) { return x.close >= 2; });
    if (r) awards.push({ id: 'close', icon: '🤏', title: 'So close', who: r.id, text: r.close + ' near misses' });
    return { rows: rows, awards: awards.slice(0, 4), teamScore: g.teamScore.slice(), winner: g.winner, history: g.history.slice() };
  }

  return {
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, TEAMS: TEAMS, CATEGORIES: CATEGORIES,
    GUESS_MIN: GUESS_MIN, GUESS_MAX: GUESS_MAX, STUMP_POINTS: STUMP_POINTS, REVEAL_MS: REVEAL_MS, VETO_MS: VETO_MS,
    WORDS: WORDS, defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, cleanName: cleanName,
    norm: norm, compact: compact, lev: lev, isCorrect: isCorrect, isClose: isClose, leaks: leaks, checkWord: checkWord, mask: mask, letterSlots: letterSlots, suggest: suggest,
    balanceTeams: balanceTeams, newGame: newGame, startTurn: startTurn, setWord: setWord, veto: veto, say: say, tick: tick, skipTurn: skipTurn, leave: leave, finish: finish,
    playerOf: playerOf, nameOf: nameOf, teamOf: teamOf, members: members, knowsWord: knowsWord, viewFor: viewFor, summary: summary, guessPoints: guessPoints
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PC;
