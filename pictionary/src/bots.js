/* ===== bots: computer players for the demo. They draw from the sketch library, set words, and "guess" with believable timing. ===== */
const Bots = (function () {
  const NAMES = ['Chintu', 'Pinky', 'Bunty', 'Golu', 'Tinku', 'Babli', 'Monu', 'Guddu'];
  const TEASE = ['Good luck with this one 😈', 'This one’s a classic!', 'Tick tock…', 'Easy… or is it? 😏', 'Draw faster!', 'We picked a good one 😂'];
  const TEAM_TIPS = ['Pick something tricky! Tap a word below.', 'Ooh, make it a hard one 😄', 'Any word from the list works. I can’t wait to watch them struggle.'];
  const CHEERS = ['😂', '👏', '🔥', '😮'];
  let st = { key: '' };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  function isBot(id) { const r = H.roster.find(function (x) { return x.id === id; }); return !!(r && r.bot); }
  function nm(id) { const r = H.roster.find(function (x) { return x.id === id; }); return r ? r.name : 'Bot'; }
  function botsIn(g, team) { return g.players.filter(function (p) { return p.team === team && !p.left && isBot(p.id); }); }
  function humansIn(g, team) { return g.players.filter(function (p) { return p.team === team && !p.left && !isBot(p.id); }); }
  function wordFor(g, drawerIsBot) {
    const used = {}; g.used.forEach(function (w) { used[PC.compact(w)] = true; });
    if (drawerIsBot) {
      const list = Sketch.LIB.filter(function (x) { return !used[PC.compact(x.word)]; });
      const it = pick(list.length ? list : Sketch.LIB);
      return { word: it.word, category: it.category, hint: it.hint };
    }
    // for a human drawer: friendly words, mostly simple ones from the packs
    const pool = PC.WORDS.all.filter(function (x) { return x.pack !== 'hard' && !used[PC.compact(x.word)] && x.word.length <= 14; });
    const it = pick(pool);
    const sk = Sketch.find(it.word);
    return { word: it.word, category: it.category, hint: sk ? sk.hint : '' };
  }
  // believable wrong guesses: other words from the same category
  function wrongPool(word, category) {
    const w = PC.compact(word);
    const same = PC.WORDS.all.concat(Sketch.LIB).filter(function (x) { return x.category === category && PC.compact(x.word) !== w && !PC.isClose(x.word, word) && !PC.isCorrect(x.word, word); }).map(function (x) { return x.word; });
    const any = Sketch.LIB.filter(function (x) { return PC.compact(x.word) !== w; }).map(function (x) { return x.word; });
    return same.length >= 3 ? same : same.concat(any);
  }
  function misspell(word) {
    const a = Array.from(word);
    const idx = []; a.forEach(function (ch, i) { if (/[a-z]/i.test(ch) && i > 0) idx.push(i); });
    if (!idx.length || PC.compact(word).length < 4) return null;
    const i = pick(idx); a.splice(i, 1, a[i] + a[i]);
    const out = a.join('');
    return PC.isClose(out, word) ? out : null;
  }
  function say(id, text, team) { hostSay(id, nm(id), text, !!team, null); }

  function fresh(g, key) {
    const t = g.turn;
    return { key: key, phaseSeen: '', setAt: 0, setDone: false, tipAt: 0, tipDone: false, fallbackAt: 0, script: null, sIdx: 0, sT0: 0, guessers: [], teaseAt: 0, teaseDone: false, inkSince: 0, cheered: false, n: t.n };
  }
  function tick(g, now) {
    if (!H.local || !g || !g.turn || g.phase === 'over') return;
    const t = g.turn;
    const key = g.id + ':' + t.n + ':' + (t.vetoed ? 'v' : 'a');
    if (st.key !== key) st = fresh(g, key);
    const drawerBot = isBot(t.drawer);

    if (g.phase === 'choose') {
      const setBots = botsIn(g, t.setTeam), setHumans = humansIn(g, t.setTeam);
      if (!setHumans.length && setBots.length) {
        if (!st.setAt) st.setAt = now + rnd(2500, 5000);
        if (!st.setDone && now >= st.setAt) { st.setDone = true; hostWord(setBots[0].id, wordFor(g, drawerBot), null); }
      } else if (setBots.length) {
        // a bot teammate helps the human pick, and steps in if they run out of time
        if (!st.tipAt) st.tipAt = now + rnd(2500, 4500);
        if (!st.tipDone && now >= st.tipAt) { st.tipDone = true; say(setBots[0].id, pick(TEAM_TIPS), true); }
        if (!st.setDone && now >= t.chooseUntil - 2500) {
          st.setDone = true;
          const w = wordFor(g, drawerBot);
          say(setBots[0].id, 'Running out of time, I’ll pick one!', true);
          hostWord(setBots[0].id, w, null);
        }
      }
      return;
    }
    if (g.phase !== 'draw') { if (g.phase === 'reveal' && !st.cheered && t.result && Math.random() < 0.7) { st.cheered = true; const bots = g.players.filter(function (p) { return isBot(p.id) && !p.left; }); if (bots.length) { const b = pick(bots); setTimeout(function () { hostReact(b.id, nm(b.id), pick(CHEERS)); }, rnd(300, 1200)); } } return; }

    // ---- drawing ----
    if (st.phaseSeen !== 'draw') {
      st.phaseSeen = 'draw';
      const total = t.drawUntil - t.drawStart;
      if (drawerBot) { st.script = Sketch.script(t.word, Math.random); st.sIdx = 0; st.sT0 = now + rnd(900, 1800); }
      // each bot guesser gets a plan: a few wrong tries, maybe a near miss, then (usually) the answer
      const pool = wrongPool(t.word, t.category);
      st.guessers = botsIn(g, t.team).filter(function (p) { return p.id !== t.drawer; }).map(function (p, i) {
        const never = Math.random() < (drawerBot ? 0.15 : 0.18);
        const base = drawerBot ? (st.script ? st.script.length : 15000) + rnd(1500, 9000) : total * rnd(0.3, 0.72);
        return { id: p.id, next: now + rnd(4500, 8000) + i * 1500, correctAt: never ? Infinity : t.drawStart + Math.min(total - 3000, base), pool: pool.slice(), tried: {}, nearDone: false };
      });
      st.teaseAt = now + total * rnd(0.2, 0.45);
    }
    // the bot drawer lays down its strokes on schedule
    if (drawerBot && st.script) {
      const due = [];
      while (st.sIdx < st.script.steps.length && now - st.sT0 >= st.script.steps[st.sIdx].t) { due.push(st.script.steps[st.sIdx].op); st.sIdx++; }
      if (due.length) hostDraw(t.drawer, H.opsKey, due);
    }
    // setters who are bots tease once
    if (!st.teaseDone && now >= st.teaseAt) {
      st.teaseDone = true;
      const sb = botsIn(g, t.setTeam);
      if (sb.length && Math.random() < 0.8) say(pick(sb).id, pick(TEASE));
    }
    // bot guessers: they can only "recognise" a human's drawing once there is something on the board
    const inked = Board.units.filter(function (u) { return u.t !== 'x'; }).length;
    if (!drawerBot) { if (inked >= 2 && !st.inkSince) st.inkSince = now; if (inked < 2) st.inkSince = 0; }
    st.guessers.forEach(function (q) {
      if (g.phase !== 'draw') return;
      const ready = drawerBot ? st.sIdx > 0 : !!st.inkSince && now - st.inkSince > 6000;
      if (now >= q.correctAt && ready) {
        if (!q.nearDone && Math.random() < 0.35) { q.nearDone = true; const m = misspell(t.word); if (m) { say(q.id, m); q.correctAt = now + rnd(2000, 4000); return; } }
        q.correctAt = Infinity; q.next = Infinity;
        say(q.id, Math.random() < 0.3 ? t.word.toUpperCase() : t.word);
        return;
      }
      if (now >= q.next) {
        q.next = now + rnd(4500, 9000);
        if (!ready && !drawerBot) { if (Math.random() < 0.5) say(q.id, pick(['Draw something! 😅', 'Waiting…', 'Hmm?', '🤔'])); return; }
        const opts = q.pool.filter(function (w) { return !q.tried[w]; });
        if (!opts.length) return;
        const w = pick(opts); q.tried[w] = true;
        say(q.id, Math.random() < 0.15 ? w + '?' : w);
      }
    });
  }
  return { NAMES: NAMES, tick: tick, isBot: isBot, reset: function () { st = { key: '' }; } };
})();
