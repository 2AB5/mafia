/* ===== Mafia engine: pure rules, no DOM, JSON-safe state ===== */
const Engine = (function () {
  'use strict';

  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 8;

  const ROLES = {
    mafia:     { label: 'Mafia',     team: 'mafia', kind: 'kill'  },
    doctor:    { label: 'Doctor',    team: 'town',  kind: 'save'  },
    police:    { label: 'Police',    team: 'town',  kind: 'check' },
    prankster: { label: 'Prankster', team: 'town',  kind: 'prank' },
    civilian:  { label: 'Civilian',  team: 'town',  kind: 'sleep' }
  };

  /* ---------- config ---------- */
  function defaultConfig() {
    return {
      mafia: 'auto',        // 'auto' | 1 | 2
      doctor: true,
      police: true,
      prankster: true,
      reveal: 'role',       // what everyone learns when a player is out: 'role' | 'team' | 'none'
      nightSecs: 0,         // 0 = wait for everyone
      discussSecs: 0,
      voteSecs: 0
    };
  }

  function secs(v) {
    const n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? Math.min(n, 900) : 0;
  }

  function normalizeConfig(c) {
    const d = defaultConfig();
    c = c || {};
    const m = c.mafia === 'auto' || c.mafia === undefined ? 'auto' : Number(c.mafia);
    return {
      mafia: m === 1 || m === 2 ? m : 'auto',
      doctor: c.doctor === undefined ? d.doctor : !!c.doctor,
      police: c.police === undefined ? d.police : !!c.police,
      prankster: c.prankster === undefined ? d.prankster : !!c.prankster,
      reveal: c.reveal === 'team' || c.reveal === 'none' ? c.reveal : 'role',
      nightSecs: secs(c.nightSecs),
      discussSecs: secs(c.discussSecs),
      voteSecs: secs(c.voteSecs)
    };
  }

  function maxMafia(n) { return n >= 6 ? 2 : 1; }

  function buildRoles(n, cfgIn) {
    const cfg = normalizeConfig(cfgIn);
    const notes = [];
    let m = cfg.mafia === 'auto' ? (n <= 5 ? 1 : 2) : cfg.mafia;
    if (m > maxMafia(n)) {
      m = maxMafia(n);
      notes.push('Mafia limited to ' + m + ' with ' + n + ' players.');
    }
    const specials = [];
    if (cfg.doctor) specials.push('doctor');
    if (cfg.police) specials.push('police');
    if (cfg.prankster) specials.push('prankster');
    while (m + specials.length > n) {
      const dropped = specials.pop();
      notes.push(ROLES[dropped].label + ' left out: not enough players.');
    }
    const roles = [];
    for (let i = 0; i < m; i++) roles.push('mafia');
    specials.forEach(function (s) { roles.push(s); });
    while (roles.length < n) roles.push('civilian');
    const counts = {};
    roles.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
    return { roles: roles, counts: counts, notes: notes };
  }

  /* ---------- helpers ---------- */
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function P(st, id) {
    for (let i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i];
    return null;
  }

  function aliveList(st) { return st.players.filter(function (p) { return p.alive; }); }

  function uniqueNames(players) {
    const seen = {};
    return players.map(function (p) {
      let base = String(p.name == null ? '' : p.name).replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
      let name = base, i = 2;
      while (seen[name.toLowerCase()]) { name = base.slice(0, 13) + ' ' + i; i++; }
      seen[name.toLowerCase()] = true;
      return { id: p.id, name: name };
    });
  }

  function phaseKey(st) {
    const c = st.phase === 'night' ? 'N' : st.phase === 'discuss' ? 'T' : st.phase === 'vote' ? 'V' : st.phase === 'over' ? 'X' : 'L';
    return c + st.round;
  }

  function armTimer(st, now) {
    const s = st.phase === 'night' ? st.cfg.nightSecs
      : st.phase === 'discuss' ? st.cfg.discussSecs
      : st.phase === 'vote' ? st.cfg.voteSecs : 0;
    st.dl = s > 0 && now ? now + s * 1000 : null;
  }

  function addLog(st, ph, x) {
    st.log.push({ r: st.round, ph: ph, x: x });
    if (st.log.length > 120) st.log.splice(0, st.log.length - 120);
  }

  function addNote(st, id, x) {
    if (!st.notes[id]) st.notes[id] = [];
    st.notes[id].push({ r: st.round, x: x });
  }

  function revealText(st, p) {
    if (st.cfg.reveal === 'role') return ' Role: ' + ROLES[p.role].label + '.';
    if (st.cfg.reveal === 'team') return ' Team: ' + (p.role === 'mafia' ? 'Mafia' : 'Town') + '.';
    return '';
  }

  /* ---------- creation ---------- */
  function newGame(opts) {
    const rng = opts.rng || Math.random;
    const cleaned = uniqueNames(opts.players);
    const n = cleaned.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('Mafia needs ' + MIN_PLAYERS + ' to ' + MAX_PLAYERS + ' players.');
    const ids = {};
    cleaned.forEach(function (p) {
      if (ids[p.id]) throw new Error('Duplicate player id.');
      ids[p.id] = true;
    });
    const cfg = normalizeConfig(opts.cfg);
    const roles = shuffle(buildRoles(n, cfg).roles.slice(), rng);
    const st = {
      v: 1,
      gameId: opts.gameId,
      cfg: cfg,
      phase: 'night',
      round: 1,
      players: cleaned.map(function (p, i) {
        return { id: p.id, name: p.name, role: roles[i], alive: true, out: null };
      }),
      sub: {},
      lastSaved: null,
      intel: [],
      notes: {},
      log: [],
      ballot: null,
      recap: [],
      mafiaChat: [],
      relay: {},
      winner: null,
      dl: null,
      seq: 0
    };
    armTimer(st, opts.now);
    return st;
  }

  /* ---------- actions ---------- */
  function actionFor(st, p) {
    if (!p || !p.alive) return null;
    const alive = aliveList(st);
    if (st.phase === 'night') {
      const kind = ROLES[p.role].kind;
      if (kind === 'sleep') return { kind: kind, targets: [], blocked: {} };
      if (kind === 'kill') {
        return { kind: kind, blocked: {}, targets: alive.filter(function (x) { return x.role !== 'mafia'; }).map(function (x) { return x.id; }) };
      }
      if (kind === 'save') {
        const blocked = {};
        let targets = alive.map(function (x) { return x.id; });
        if (st.lastSaved && targets.indexOf(st.lastSaved) !== -1) {
          blocked[st.lastSaved] = 'protected last night';
          targets = targets.filter(function (id) { return id !== st.lastSaved; });
        }
        return { kind: kind, targets: targets, blocked: blocked };
      }
      return { kind: kind, blocked: {}, targets: alive.filter(function (x) { return x.id !== p.id; }).map(function (x) { return x.id; }) };
    }
    if (st.phase === 'discuss') return { kind: 'ready', targets: [], blocked: {} };
    if (st.phase === 'vote') {
      return { kind: 'vote', skip: true, blocked: {}, targets: alive.filter(function (x) { return x.id !== p.id; }).map(function (x) { return x.id; }) };
    }
    return null;
  }

  function submit(st, pid, a) {
    if (st.phase !== 'night' && st.phase !== 'discuss' && st.phase !== 'vote') return { ok: false, error: 'inactive' };
    const p = P(st, pid);
    if (!p || !p.alive) return { ok: false, error: 'not-alive' };
    if (!a || typeof a.t !== 'string') return { ok: false, error: 'bad-action' };
    const act = actionFor(st, p);
    if (a.t !== act.kind) return { ok: false, error: 'wrong-action' };
    if (act.kind === 'sleep' || act.kind === 'ready') {
      st.sub[pid] = { t: a.t };
      return { ok: true };
    }
    if (act.kind === 'vote' && a.to === 'skip') {
      st.sub[pid] = { t: 'vote', to: 'skip' };
      return { ok: true };
    }
    if (typeof a.to !== 'string' || act.targets.indexOf(a.to) === -1) return { ok: false, error: 'bad-target' };
    st.sub[pid] = { t: a.t, to: a.to };
    return { ok: true };
  }

  function pendingIds(st) {
    if (st.phase !== 'night' && st.phase !== 'discuss' && st.phase !== 'vote') return [];
    return aliveList(st).filter(function (p) { return !st.sub[p.id]; }).map(function (p) { return p.id; });
  }

  function ready(st) {
    if (st.phase !== 'night' && st.phase !== 'discuss' && st.phase !== 'vote') return false;
    return aliveList(st).length > 0 && pendingIds(st).length === 0;
  }

  /* ---------- win check ---------- */
  function checkWin(st) {
    const alive = aliveList(st);
    const mafia = alive.filter(function (p) { return p.role === 'mafia'; }).length;
    const town = alive.length - mafia;
    if (mafia === 0) st.winner = 'town';
    else if (mafia >= town) st.winner = 'mafia';
    if (st.winner) {
      st.phase = 'over';
      st.sub = {};
      addLog(st, 'E', st.winner === 'town'
        ? 'Town wins. Every Mafia member is out.'
        : 'Mafia wins. They now match the town.');
    }
    return st.winner;
  }

  /* ---------- resolution ---------- */
  function resolveNight(st, rng) {
    const r = st.round;
    const subs = st.sub;
    const find = function (role) {
      for (let i = 0; i < st.players.length; i++) if (st.players[i].alive && st.players[i].role === role) return st.players[i];
      return null;
    };
    const mafia = st.players.filter(function (p) { return p.alive && p.role === 'mafia'; });
    const prank = find('prankster');
    const doc = find('doctor');
    const cop = find('police');
    const nm = function (id) { const q = P(st, id); return q ? q.name : '?'; };
    const liveTarget = function (id) { const q = id ? P(st, id) : null; return q && q.alive ? q : null; };

    // 1. Prankster
    let blockedId = null;
    if (prank && subs[prank.id] && subs[prank.id].t === 'prank' && liveTarget(subs[prank.id].to)) blockedId = subs[prank.id].to;
    if (blockedId) {
      const bp = P(st, blockedId);
      if (bp.role === 'mafia' || bp.role === 'doctor' || bp.role === 'police') {
        addNote(st, blockedId, 'The Prankster got to you last night. Your action had no effect.');
      }
    }

    // 2. Mafia vote
    const tally = {};
    mafia.forEach(function (m) {
      const s = subs[m.id];
      if (!s || s.t !== 'kill' || m.id === blockedId) return;
      const t = liveTarget(s.to);
      if (!t || t.role === 'mafia') return;
      tally[t.id] = (tally[t.id] || 0) + 1;
    });
    let target = null, tie = false;
    const ids = Object.keys(tally);
    if (ids.length) {
      const max = Math.max.apply(null, ids.map(function (k) { return tally[k]; }));
      const top = ids.filter(function (k) { return tally[k] === max; });
      tie = top.length > 1;
      target = top.length === 1 ? top[0] : top[Math.floor(rng() * top.length)];
    }
    if (tie) {
      mafia.forEach(function (m) { addNote(st, m.id, 'Your team was split, so the target was picked at random.'); });
    }

    // 3. Doctor
    let saved = null;
    let docBlocked = false;
    if (doc && subs[doc.id] && subs[doc.id].t === 'save') {
      if (doc.id === blockedId) docBlocked = true;
      else if (liveTarget(subs[doc.id].to)) saved = subs[doc.id].to;
    }

    // 4. Police
    let copResult = null, copBlocked = false;
    if (cop && subs[cop.id] && subs[cop.id].t === 'check') {
      if (cop.id === blockedId) copBlocked = true;
      else {
        const t = liveTarget(subs[cop.id].to);
        if (t) {
          copResult = { to: t.id, res: t.role === 'mafia' ? 'mafia' : 'clear' };
          st.intel.push({ r: r, to: t.id, res: copResult.res });
        }
      }
    }

    st.lastSaved = saved;

    // 5. Kill
    let died = null;
    if (target && target !== saved) {
      const t = P(st, target);
      t.alive = false;
      t.out = { ph: 'N', r: r };
      died = t;
    }

    // log + recap
    if (died) addLog(st, 'N', died.name + ' was killed in the night.' + revealText(st, died));
    else addLog(st, 'N', 'Nobody was killed last night.');

    const rec = [];
    rec.push(target ? 'Mafia targeted ' + nm(target) + (tie ? ' (split vote, random pick).' : '.') : 'Mafia picked no one.');
    if (doc && subs[doc.id]) rec.push(docBlocked ? 'The Doctor was pranked.' : (saved ? 'The Doctor protected ' + nm(saved) + '.' : 'The Doctor protected no one.'));
    if (cop && subs[cop.id]) rec.push(copBlocked ? 'The Police were pranked.' : (copResult ? 'The Police checked ' + nm(copResult.to) + ': ' + (copResult.res === 'mafia' ? 'Mafia' : 'not Mafia') + '.' : 'The Police checked no one.'));
    if (blockedId) rec.push('The Prankster pranked ' + nm(blockedId) + '.');
    rec.push(died ? nm(died.id) + ' died.' : 'Nobody died.');
    st.recap.push('Night ' + r + ': ' + rec.join(' '));

    st.sub = {};
    if (!checkWin(st)) st.phase = 'discuss';
  }

  function resolveVote(st) {
    const alive = aliveList(st);
    const counts = {};
    let cast = 0;
    const rows = [];
    alive.forEach(function (p) {
      const s = st.sub[p.id];
      if (s && s.t === 'vote' && s.to && s.to !== 'skip') {
        const t = P(st, s.to);
        if (t && t.alive && t.id !== p.id) {
          counts[t.id] = (counts[t.id] || 0) + 1;
          cast++;
          rows.push({ from: p.id, to: t.id });
          return;
        }
      }
      rows.push({ from: p.id, to: s && s.to === 'skip' ? 'skip' : null });
    });
    const skip = alive.length - cast;
    const options = Object.keys(counts).map(function (id) { return { id: id, c: counts[id] }; });
    options.push({ id: 'skip', c: skip });
    const max = Math.max.apply(null, options.map(function (o) { return o.c; }));
    const top = options.filter(function (o) { return o.c === max; });
    let outcome, lynched = null;
    if (top.length > 1) outcome = 'tie';
    else if (top[0].id === 'skip') outcome = 'skip';
    else { outcome = 'lynch'; lynched = top[0].id; }

    const r = st.round;
    st.ballot = { r: r, rows: rows, outcome: outcome, lynched: lynched };
    const nm = function (id) { return id === 'skip' ? 'skip' : id == null ? 'no vote' : P(st, id).name; };
    st.recap.push('Day ' + r + ' vote: ' + rows.map(function (w) { return nm(w.from) + ' → ' + nm(w.to); }).join(', ') + '. ' +
      (outcome === 'lynch' ? nm(lynched) + ' was voted out.' : outcome === 'tie' ? 'Tie, nobody voted out.' : 'Skipped, nobody voted out.'));

    if (outcome === 'lynch') {
      const t = P(st, lynched);
      t.alive = false;
      t.out = { ph: 'V', r: r };
      addLog(st, 'V', t.name + ' was voted out.' + revealText(st, t));
    } else if (outcome === 'tie') {
      addLog(st, 'V', 'The vote was tied. Nobody is voted out.');
    } else {
      addLog(st, 'V', 'The town chose to skip. Nobody is voted out.');
    }

    st.sub = {};
    if (!checkWin(st)) {
      st.round = r + 1;
      st.phase = 'night';
    }
  }

  function advance(st, rng, now) {
    rng = rng || Math.random;
    if (st.phase === 'night') resolveNight(st, rng);
    else if (st.phase === 'discuss') { st.phase = 'vote'; st.sub = {}; }
    else if (st.phase === 'vote') resolveVote(st);
    else return st;
    st.seq++;
    armTimer(st, now);
    return st;
  }

  function removePlayer(st, pid) {
    const p = P(st, pid);
    if (!p || !p.alive || st.phase === 'over') return false;
    p.alive = false;
    p.out = { ph: 'X', r: st.round };
    delete st.sub[pid];
    addLog(st, 'X', p.name + ' left the table.' + revealText(st, p));
    st.seq++;
    checkWin(st);
    return true;
  }

  /* ---------- views ---------- */
  function rvOf(st, p) {
    if (st.phase === 'over') return p.role;
    if (p.alive) return null;
    if (st.cfg.reveal === 'role') return p.role;
    if (st.cfg.reveal === 'team') return p.role === 'mafia' ? 'mafia' : 'town';
    return null;
  }

  function publicView(st) {
    const over = st.phase === 'over';
    return {
      v: 1,
      gameId: st.gameId,
      phase: st.phase,
      round: st.round,
      key: phaseKey(st),
      cfg: st.cfg,
      players: st.players.map(function (p) { return { id: p.id, name: p.name, alive: p.alive, rv: rvOf(st, p) }; }),
      pending: pendingIds(st),
      dl: st.dl,
      log: st.log.slice(-60),
      ballot: st.ballot,
      winner: st.winner,
      recap: over ? st.recap.slice() : null,
      seq: st.seq
    };
  }

  function playerView(st, id) {
    const p = P(st, id);
    if (!p) return null;
    const v = {
      v: 1,
      gameId: st.gameId,
      key: phaseKey(st),
      phase: st.phase,
      round: st.round,
      me: { id: p.id, name: p.name, role: p.role, alive: p.alive },
      act: null,
      mine: null,
      mates: [],
      mateVotes: {},
      mchat: [],
      intel: [],
      notes: []
    };
    if (st.phase !== 'over') {
      v.act = actionFor(st, p);
      v.mine = st.sub[id] || null;
    }
    if (p.role === 'mafia') {
      v.mates = st.players.filter(function (x) { return x.role === 'mafia' && x.id !== id; })
        .map(function (x) { return { id: x.id, name: x.name, alive: x.alive }; });
      if (st.phase === 'night') {
        v.mates.forEach(function (m) {
          const s = st.sub[m.id];
          if (m.alive && s && s.t === 'kill') v.mateVotes[m.id] = s.to;
        });
      }
      v.mchat = st.mafiaChat.slice(-50);
    }
    if (p.role === 'police') v.intel = st.intel.slice();
    v.notes = (st.notes[id] || []).slice(-12);
    return v;
  }

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    ROLES: ROLES,
    defaultConfig: defaultConfig,
    normalizeConfig: normalizeConfig,
    buildRoles: buildRoles,
    maxMafia: maxMafia,
    newGame: newGame,
    phaseKey: phaseKey,
    actionFor: actionFor,
    submit: submit,
    pendingIds: pendingIds,
    ready: ready,
    advance: advance,
    removePlayer: removePlayer,
    armTimer: armTimer,
    playerView: playerView,
    publicView: publicView,
    uniqueNames: uniqueNames,
    P: P
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
