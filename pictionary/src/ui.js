/* ===== ui: screens. Board and chat are persistent elements; everything else re-renders from state. ===== */
let root, hdrEl, connEl, mainEl, toastEl;

/* ---------- helpers ---------- */
function st() { return S.st; }
function game() { return S.st && S.st.game; }
function rosterEntry(id) { return S.st && S.st.roster ? S.st.roster.find(function (r) { return r.id === id; }) : null; }
function nameOf(id) { const g = game(); if (g) return PC.nameOf(g, id); const r = rosterEntry(id); return r ? r.name : 'Player'; }
function meP() { const g = game(); return g && S.me ? g.players.find(function (p) { return p.id === S.me && !p.left; }) || null : null; }
function viewers() { return (S.st && Array.isArray(S.st.viewers)) ? S.st.viewers : []; }
function teamName(t) { return PC.TEAMS[t].name; }
function teamShort(t) { return PC.TEAMS[t].short; }
function card() { const c = h('section', { class: 'card' }); for (let i = 0; i < arguments.length; i++) add(c, arguments[i]); return c; }
function btn(label, fn, o) {
  o = o || {};
  return h('button', { type: 'button', class: 'btn ' + (o.kind || ''), id: o.id, disabled: !!o.disabled, 'aria-label': o.aria, onclick: function (e) { SFX.click(); fn(e); } }, o.icon ? icon(o.icon, 18) : null, label);
}
function confirmBtn(key, label, confirmLabel, run, kind) {
  const armed = S.confirm === key;
  return btn(armed ? confirmLabel : label, function () {
    if (armed) { S.confirm = null; run(); render(); return; }
    S.confirm = key; render(); setTimeout(function () { if (S.confirm === key) { S.confirm = null; render(); } }, 3500);
  }, { kind: (armed ? 'danger ' : 'ghost ') + (kind || ''), id: 'c-' + key });
}
function seg(label, id, options, value, onPick) {
  return h('div', { class: 'field', id: id }, h('span', { class: 'lbl', text: label }),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(function (o) {
      const on = o[0] === value;
      return h('button', { type: 'button', class: 'segb' + (on ? ' on' : ''), 'data-v': String(o[0]), 'aria-pressed': on ? 'true' : 'false', onclick: function () { SFX.click(); onPick(o[0]); } }, o[1]);
    })));
}
function clockLeft() { const d = st(); if (!d || !d.clock) return 0; return Math.max(0, d.clock.left - (Date.now() - d.clockAt)); }
function fmtSecs(ms) { return Math.ceil(ms / 1000) + 's'; }
function teamDot(t) { return h('span', { class: 'tdot t' + t, 'aria-hidden': 'true' }); }

/* ---------- theme ---------- */
function currentTheme() { const t = store('theme'); return t === 'light' ? 'light' : 'dark'; }
function setTheme(t) { document.documentElement.setAttribute('data-theme', t); store('theme', t); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#11141d' : '#f5f2e8'); }

/* ---------- home ---------- */
function hero() {
  return h('section', { class: 'hero' },
    h('div', { class: 'heroart', 'aria-hidden': 'true', html: '<svg viewBox="0 0 220 120" width="220" height="120"><rect x="14" y="10" width="150" height="100" rx="10" fill="#fff" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><path d="M38 84c14-30 30-44 46-30s22 10 34-10 20-22 28-14" fill="none" stroke="#2f66d0" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="40" r="12" fill="#f2c230"/><path d="M120 76l18 0" stroke="#d6455d" stroke-width="6" stroke-linecap="round"/><g transform="rotate(35 186 60)"><rect x="176" y="10" width="20" height="86" rx="4" fill="#d6455d"/><path d="M176 96l10 18 10-18z" fill="#f5d0a9"/><path d="M183 108l3 6 3-6z" fill="#1f2230"/></g></svg>' }),
    h('div', { class: 'herotx' },
      h('h1', { text: 'Draw it. Guess it. Stump them.' }),
      h('p', { text: 'Two teams, 4 to 12 friends, every phone is a sketchpad. The other team picks your word, its category and a hint, so make them regret it.' })));
}
function savedHost() { const s = storeJSON('host'); return s && s.room && s.savedAt && Date.now() - s.savedAt < 24 * 3600 * 1000 ? s : null; }
function homeScreen() {
  const nodes = [hero()];
  const invited = S.joinCode.length === 4;
  const sh = savedHost();
  if (sh) {
    nodes.push(h('section', { class: 'card resume' }, h('h3', { text: 'Game in progress' }),
      h('p', {}, 'You were hosting room ', h('strong', { class: 'code-inline', text: sh.room }), '.'),
      h('div', { class: 'row' }, btn('Resume hosting', function () { hostResume(sh); }, { kind: 'primary', id: 'resumeHost' }),
        confirmBtn('discard', 'Discard', 'Confirm: end that room', function () { storeJSON('host', null); render(); }))));
  }
  const nameIn = h('input', { id: 'nameIn', type: 'text', maxlength: '14', autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } });
  const need = function () {
    const nm = cleanName(S.name);
    if (!nm) { setErr('Type your name first.'); const el = document.getElementById('nameIn'); if (el) el.focus(); return null; }
    S.err = ''; store('name', nm); return nm;
  };
  const codeIn = h('input', { id: 'codeIn', type: 'text', autocapitalize: 'characters', autocomplete: 'off', maxlength: '4', placeholder: 'ABCD', 'aria-label': 'Room code', class: 'codein', value: S.joinCode,
    oninput: function (e) { const c = cleanCode(e.target.value); S.joinCode = c; if (e.target.value !== c) e.target.value = c; } });
  const joinForm = h('form', { class: 'joinrow', id: 'joinForm', onsubmit: function (e) {
    e.preventDefault();
    const nm = need(); if (!nm) return;
    const c = cleanCode(S.joinCode);
    if (c.length !== 4) { setErr('Room codes have 4 letters.'); return; }
    clientJoin(c, nm);
  } }, codeIn, h('button', { class: 'btn primary', type: 'submit', id: 'joinBtn' }, 'Join'),
    h('button', { class: 'btn ghost', type: 'button', id: 'watchBtn', 'aria-label': 'Watch the room without playing', onclick: function () {
      const c = cleanCode(S.joinCode);
      if (c.length !== 4) { setErr('Type the 4-letter room code to watch.'); return; }
      S.err = ''; const nm = cleanName(S.name); if (nm) store('name', nm);
      clientJoin(c, nm, true);
    } }, icon('eye', 18), 'Watch'));
  const create = btn('Create a room', function () { const nm = need(); if (!nm) return; hostCreate(nm); }, { kind: invited ? 'ghost' : 'primary big', id: 'createBtn' });
  nodes.push(h('section', { class: 'card' }, h('h2', { text: invited ? 'You’re invited to room ' + S.joinCode : 'Who’s playing?' }),
    h('label', { class: 'lbl', for: 'nameIn', text: 'Name' }), nameIn));
  if (invited) nodes.push(card(h('h3', { text: 'Join room' }), joinForm, h('p', { class: 'hint', text: 'Or start your own:' }), create));
  else nodes.push(card(h('h3', { text: 'Play online' }), create, h('div', { class: 'or' }, h('span', { text: 'or join friends' })), joinForm));
  nodes.push(howCard(true));
  nodes.push(h('p', { class: 'moregames' }, 'More games for your group: ', h('a', { href: '../', text: 'Mafia' }), ' · ', h('a', { href: '../penfight/', text: 'Pen Fight' })));
  return nodes;
}
function howCard(open) {
  return h('details', { class: 'card how', id: 'howD', open: open ? true : null },
    h('summary', { class: 'sumh', text: 'How to play' }),
    h('ol', { class: 'howlist' },
      h('li', {}, 'Split into the ', h('b', { class: 'tc0', text: 'Blue' }), ' and ', h('b', { class: 'tc1', text: 'Red' }), ' teams. Turns alternate: one player draws, their teammates guess.'),
      h('li', {}, 'The ', h('b', { text: 'other team' }), ' types the word, picks its category and can add a hint. Stuck? Tap a suggestion.'),
      h('li', {}, 'Guessers see the category and blanks for each letter. The hint unlocks a third of the way in, and a few letters show near the end.'),
      h('li', {}, 'Guess fast for up to ' + PC.GUESS_MAX + ' points. If nobody gets it, the word-setters score ' + PC.STUMP_POINTS + '. The drawer can pass on one unfair word in the first 15 seconds.'),
      h('li', {}, 'The setting team can tease in the chat, but any message containing the word is blocked. Whisper with “Team only”.')));
}
function joinUrl() { return location.origin + location.pathname + '#' + S.room; }
function copyLink() {
  const url = joinUrl();
  const done = function () { toast('Invite link copied.'); };
  try { navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); }); } catch (e) { prompt('Copy this link:', url); }
}
function qrSvg(text) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; } }
function roomCard() {
  const svg = qrSvg(joinUrl());
  return h('section', { class: 'card roomcard' },
    h('div', { class: 'roomtop' },
      h('div', { class: 'roominfo' }, h('div', { class: 'lbl', text: 'Room code' }),
        h('div', { class: 'code', id: 'roomCode', 'aria-label': 'Room code ' + S.room.split('').join(' ') }, S.room.split('').map(function (c) { return h('span', { text: c }); })),
        h('p', { class: 'hint', text: 'Friends open this page and type the code, scan the QR, or tap your link.' }),
        h('div', { class: 'row' }, btn('Copy invite link', copyLink, { kind: 'primary', id: 'copyBtn', icon: 'copy' }),
          navigator.share ? btn('Share', function () { navigator.share({ title: 'Pictionary', text: 'Pictionary night! Room ' + S.room, url: joinUrl() }).catch(function () {}); }, { kind: 'ghost', id: 'shareBtn', icon: 'share' }) : null)),
      svg ? h('div', { class: 'qr', id: 'qr', html: svg, role: 'img', 'aria-label': 'QR code to join room ' + S.room }) : null));
}

/* ---------- lobby ---------- */
function lobbyScreen() {
  const d = st(), host = S.isHost, roster = d.roster, n = roster.length;
  const nodes = [roomCard()];
  const me = roster.find(function (r) { return r.id === S.me; });
  const col = function (t) {
    const mem = roster.filter(function (r) { return r.team === t; });
    return h('div', { class: 'teamcol t' + t, id: 'team' + t },
      h('div', { class: 'teamhead' }, teamDot(t), h('h3', { text: teamName(t) }), h('span', { class: 'count', text: String(mem.length) })),
      h('ul', { class: 'members' }, mem.length ? mem.map(function (r) {
        return h('li', { class: r.on ? '' : 'off', 'data-id': r.id },
          h('span', { class: 'nm', text: r.name }), r.id === S.me ? h('em', { class: 'tag', text: 'you' }) : null, r.id === d.hostId ? h('em', { class: 'tag', text: 'host' }) : null,
          !r.on ? h('em', { class: 'tag warnt', text: 'offline' }) : null,
          host ? h('button', { type: 'button', class: 'mini', 'data-move': r.id, 'aria-label': 'Move ' + r.name + ' to the ' + teamName(1 - t), onclick: function () { hostSetTeam(r.id, 1 - t); } }, t === 0 ? '→ Red' : '→ Blue') : null,
          host && r.id !== S.me ? h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + r.name, 'data-remove': r.id, onclick: function () { hostRemove(r.id); } }, icon('x', 14)) : null);
      }) : h('li', { class: 'emptyli', text: 'Nobody yet' })),
      me && me.team !== t ? btn('Switch to ' + teamShort(t), function () { Net.team(t); }, { kind: 'small ghost', id: 'joinTeam' + t }) : null);
  };
  const sc = card(h('div', { class: 'cardhead' }, h('h2', { text: 'Teams' }), h('span', { class: 'count', id: 'seatCount', text: n + ' / ' + PC.MAX_PLAYERS })),
    h('p', { class: 'dim', text: startProblem2(d) || 'Ready! More friends can still join.' }),
    h('div', { class: 'teams' }, col(0), col(1)));
  const vs = viewers();
  if (vs.length) sc.appendChild(h('p', { class: 'viewline', id: 'viewLine' }, icon('eye', 16), h('span', { text: 'Watching: ' + vs.join(', ') })));
  if (!me && !host) {
    sc.appendChild(h('div', { class: 'sitbox' }, h('p', { class: 'watching', id: 'watching', text: '👁 You’re watching this room. Join a team to play.' }),
      h('input', { id: 'sitName', type: 'text', maxlength: '14', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } }),
      btn('Join the game', function () { if (!cleanName(S.name)) { setErr('Type your name first.'); return; } Net.sit(S.name); }, { kind: 'primary', id: 'sitBtn', disabled: n >= PC.MAX_PLAYERS })));
  }
  if (me && !host) sc.appendChild(h('div', { class: 'row' }, btn('Just watch instead', function () { Net.watch(); }, { kind: 'ghost small', id: 'justWatch', icon: 'eye' })));
  if (host) sc.appendChild(h('div', { class: 'row' }, btn('Shuffle teams', hostShuffleTeams, { kind: 'ghost small', id: 'shuffleBtn', icon: 'users' })));
  nodes.push(sc);
  nodes.push(h('div', { class: 'lobbychat' }, Chat.ensure())); Chat.sync();
  if (host) {
    const why = startProblem();
    nodes.push(card(h('h3', { text: 'Game settings' }),
      seg('Rounds (everyone draws once per round)', 'cfgRounds', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], d.cfg.rounds, function (v) { hostSetCfg({ rounds: v }); }),
      seg('Drawing time', 'cfgDraw', [[60, '60 s'], [80, '80 s'], [100, '100 s'], [120, '120 s']], d.cfg.drawSecs, function (v) { hostSetCfg({ drawSecs: v }); }),
      seg('Time to pick a word', 'cfgChoose', [[30, '30 s'], [40, '40 s'], [60, '60 s']], d.cfg.chooseSecs, function (v) { hostSetCfg({ chooseSecs: v }); }),
      seg('Reveal a few letters near the end', 'cfgLetters', [[true, 'On'], [false, 'Off']], d.cfg.letterHints, function (v) { hostSetCfg({ letterHints: v }); }),
      btn(why ? why : 'Start the game', function () { hostStart(); }, { kind: 'primary big', id: 'startBtn', disabled: !!why }),
      h('p', { class: 'hint', text: 'Your phone runs the game. Keep this page open and your screen on while you play.' }),
      confirmBtn('close', 'Close room', 'Confirm: close room for everyone', function () { Net.leave(); })));
  } else {
    nodes.push(card(h('p', { class: 'dim', id: 'waitHost', text: (me ? 'You’re on the ' + teamName(me.team) + '. ' : '') + d.cfg.rounds + (d.cfg.rounds === 1 ? ' round' : ' rounds') + ', ' + d.cfg.drawSecs + ' s to draw. ' + nameOf(d.hostId) + ' starts the game.' }),
      confirmBtn('leave', 'Leave room', 'Confirm: leave', function () { Net.leave(); })));
  }
  nodes.push(howCard(false));
  return nodes;
}
function startProblem2(d) {
  const c = [0, 0]; d.roster.forEach(function (r) { if (r.team === 0 || r.team === 1) c[r.team]++; });
  if (d.roster.length < PC.MIN_PLAYERS) return 'Waiting for players: you need at least 4, two on each team.';
  if (c[0] < 2 || c[1] < 2) return 'Each team needs at least 2 players.';
  return '';
}

/* ---------- game ---------- */
function scoreBar(g) {
  const side = function (t) {
    return h('div', { class: 'tside t' + t + (g.turn && g.turn.team === t && g.phase !== 'over' ? ' drawing' : '') },
      h('span', { class: 'tname', text: teamShort(t) }), h('span', { class: 'tscore', id: 'tscore' + t, text: String(g.teamScore[t]) }));
  };
  return h('div', { class: 'scorebar', id: 'scorebar' }, side(0),
    h('div', { class: 'tmid' }, h('span', { class: 'turnno', id: 'turnNo', text: g.phase === 'over' ? 'Final' : 'Turn ' + g.turnNo + ' / ' + g.totalTurns })), side(1));
}
function wordBar(g) {
  const t = g.turn; if (!t) return null;
  const me = meP();
  const timer = g.phase !== 'over' ? h('div', { class: 'timer', id: 'timer' }, h('span', { class: 'tring' }, h('span', { class: 'tfill', id: 'timerFill' })), h('span', { class: 'ttxt', id: 'timerTxt', text: fmtSecs(clockLeft()) })) : null;
  let main;
  if (g.phase === 'choose') {
    main = h('div', { class: 'wb-main' }, h('span', { class: 'wb-k', text: 'Up next' }), h('span', { class: 'wb-w small', text: nameOf(t.drawer) + ' draws · ' + teamShort(t.setTeam) + ' picks the word' }));
  } else {
    const knows = !!t.word;
    const letters = (t.mask || []).map(function (ch) { return h('span', { class: 'lt' + (ch === ' ' ? ' sp' : ch === '_' ? '' : ' shown') + (/[\p{L}\p{N}_]/u.test(ch) || ch === ' ' ? '' : ' pn'), text: ch === '_' ? '' : ch }); });
    main = h('div', { class: 'wb-main' },
      h('span', { class: 'wb-k', text: knows ? (me && me.id === t.drawer ? 'Draw this' : g.phase === 'draw' ? 'The word' : 'The word was') : 'Guess the word · ' + (t.len || 0) + ' letters' }),
      knows ? h('span', { class: 'wb-w', id: 'theWord', text: t.word }) : h('span', { class: 'mask', id: 'mask', 'aria-label': (t.len || 0) + ' letters' }, letters));
  }
  const cat = t.category ? h('span', { class: 'chip cat', id: 'catChip', text: t.category }) : null;
  return h('div', { class: 'wordbar', id: 'wordbar' }, h('div', { class: 'wb-left' }, main, h('div', { class: 'wb-meta' }, cat,
    t.hint && (t.hintShown || t.word) ? h('span', { class: 'chip hintc', id: 'hintChip' }, '💡 ', t.hint, !t.hintShown ? h('em', { text: ' (unlocks for guessers at ⅓ time)' }) : null) : null)), timer);
}
function roleLine(g) {
  const t = g.turn, me = meP();
  if (!t || g.phase === 'over') return null;
  let txt = '', cls = '';
  if (!me) txt = '👁 You’re watching' + (t.word ? ': you can see the word.' : '.');
  else if (g.phase === 'choose') {
    if (me.team === t.setTeam) { txt = 'Your team picks the word for ' + nameOf(t.drawer) + '. Make it tricky, but fair!'; cls = 'mine'; }
    else if (me.id === t.drawer) { txt = 'You’re drawing next! The ' + teamName(t.setTeam) + ' is choosing your word…'; cls = 'mine'; }
    else txt = nameOf(t.drawer) + ' draws next. You’ll be guessing.';
  } else if (g.phase === 'draw') {
    if (me.id === t.drawer) { txt = 'You’re drawing! No letters or numbers.'; cls = 'mine'; }
    else if (me.team === t.team) { txt = 'Guess what ' + nameOf(t.drawer) + ' is drawing!'; cls = 'mine'; }
    else txt = 'Your team set this word. Watch them struggle 😈';
  } else txt = '';
  return txt ? h('p', { class: 'roleline ' + cls, id: 'roleLine', text: txt }) : null;
}
function toolsBar() {
  const T = Board.tool;
  const g = game(), t = g.turn;
  const canPass = !t.vetoed && st().clock && st().clock.el !== undefined && (st().clock.el + (Date.now() - st().clockAt)) < PC.VETO_MS;
  return h('div', { class: 'tools', id: 'tools' },
    h('div', { class: 'palette', role: 'group', 'aria-label': 'Colours' }, Board.PALETTE.map(function (c) {
      const on = T.color === c && T.mode !== 'eraser';
      return h('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), style: 'background:' + c, 'data-c': c, 'aria-label': 'Colour ' + c, 'aria-pressed': on ? 'true' : 'false', onclick: function () { T.color = c; if (T.mode === 'eraser') T.mode = 'pen'; render(); } });
    })),
    h('div', { class: 'toolrow' },
      h('div', { class: 'sizes', role: 'group', 'aria-label': 'Brush size' }, Board.SIZES.map(function (s) {
        const on = T.size === s;
        return h('button', { type: 'button', class: 'sz' + (on ? ' on' : ''), 'data-s': String(s), 'aria-label': 'Size ' + s, 'aria-pressed': on ? 'true' : 'false', onclick: function () { T.size = s; render(); } }, h('span', { class: 'dot', style: 'width:' + Math.max(4, Math.min(26, s * 0.6)) + 'px;height:' + Math.max(4, Math.min(26, s * 0.6)) + 'px' }));
      })),
      h('div', { class: 'modes', role: 'group', 'aria-label': 'Tool' },
        [['pen', 'Pen', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill']].map(function (m) {
          const on = T.mode === m[0];
          return h('button', { type: 'button', class: 'tb' + (on ? ' on' : ''), id: 'tool-' + m[0], 'aria-label': m[1], 'aria-pressed': on ? 'true' : 'false', title: m[1], onclick: function () { T.mode = m[0]; render(); } }, icon(m[2], 20));
        }),
        h('button', { type: 'button', class: 'tb', id: 'undoBtn', 'aria-label': 'Undo', title: 'Undo', onclick: function () { Board.undo(); } }, icon('undo', 20)),
        S.confirm === 'clr' ? h('button', { type: 'button', class: 'tb danger', id: 'clearBtn', onclick: function () { S.confirm = null; Board.clear(); render(); } }, 'Clear?')
          : h('button', { type: 'button', class: 'tb', id: 'clearBtn', 'aria-label': 'Clear the board', title: 'Clear', onclick: function () { S.confirm = 'clr'; render(); setTimeout(function () { if (S.confirm === 'clr') { S.confirm = null; render(); } }, 3000); } }, icon('trash', 20)))),
    canPass ? h('div', { class: 'row passrow' }, btn('Pass on this word', function () { Net.veto(); }, { kind: 'ghost small', id: 'vetoBtn' }), h('span', { class: 'hint', text: 'Once per turn, in the first 15 s' })) : null);
}
function chooseForm(g) {
  const t = g.turn, F = S.form;
  const sug = F.sugg || (F.sugg = PC.suggest(secureRng, 3));
  const cats = PC.CATEGORIES;
  const catOn = function (c) { return F.category === c; };
  const send = function () {
    const category = F.category === 'Other' ? F.custom : F.category;
    const err = PC.checkWord(F.word, category, F.hint);
    if (err) { toast(err); return; }
    Net.word({ word: F.word, category: category, hint: F.hint });
  };
  return h('form', { class: 'card choose', id: 'chooseForm', onsubmit: function (e) { e.preventDefault(); send(); } },
    h('p', { class: 'ov-k', text: t.vetoed ? nameOf(t.drawer) + ' passed. Pick another word' : 'Your team sets the word' }),
    h('h2', { class: 'ov-t', text: 'What should ' + nameOf(t.drawer) + ' draw?' }),
    h('label', { class: 'lbl', for: 'wordIn', text: 'Word or phrase' }),
    h('input', { id: 'wordIn', type: 'text', maxlength: '30', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'e.g. pani puri', value: F.word, oninput: function (e) { F.word = e.target.value; } }),
    h('div', { class: 'sugg', id: 'sugg' }, h('span', { class: 'lbl', text: 'Need ideas?' }),
      sug.map(function (s, i) { return h('button', { type: 'button', class: 'sg', 'data-sugg': String(i), onclick: function () { F.word = s.word; F.category = cats.indexOf(s.category) !== -1 ? s.category : 'Other'; F.custom = cats.indexOf(s.category) !== -1 ? '' : s.category; render(); } }, s.word, h('small', { text: s.category })); }),
      h('button', { type: 'button', class: 'sg more', id: 'moreSugg', 'aria-label': 'More suggestions', onclick: function () { F.sugg = PC.suggest(secureRng, 3); render(); } }, '🔀')),
    h('span', { class: 'lbl', text: 'Category (everyone sees this)' }),
    h('div', { class: 'cats', id: 'cats' }, cats.concat(['Other']).map(function (c) {
      return h('button', { type: 'button', class: 'catb' + (catOn(c) ? ' on' : ''), 'data-cat': c, 'aria-pressed': catOn(c) ? 'true' : 'false', onclick: function () { F.category = c; render(); } }, c);
    })),
    F.category === 'Other' ? h('input', { id: 'catIn', type: 'text', maxlength: '18', placeholder: 'Your category', value: F.custom, oninput: function (e) { F.custom = e.target.value; } }) : null,
    h('label', { class: 'lbl', for: 'hintIn', text: 'Hint (optional, shows a third of the way in)' }),
    h('input', { id: 'hintIn', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'e.g. street food, very spicy', value: F.hint, oninput: function (e) { F.hint = e.target.value; } }),
    h('button', { type: 'submit', class: 'btn primary big', id: 'sendWord' }, 'Send the word'),
    h('p', { class: 'hint', text: 'Anyone on your team can send it. Chat below is set to “Team only” so you can decide together.' }));
}
function boardOverlay() {
  const ov = Board.overlay(), g = game();
  clear(ov); ov.className = 'board-ov';
  if (!g || !g.turn) return;
  const t = g.turn, me = meP();
  if (g.phase === 'choose') {
    ov.classList.add('show');
    if (me && me.team === t.setTeam) { add(ov, h('div', { class: 'ovcard wait' }, h('p', { class: 'ov-k', text: 'Turn ' + g.turnNo }), h('h2', { class: 'ov-t', text: 'Pick the word below' }), h('p', { class: 'ov-s', text: nameOf(t.drawer) + ' is waiting to draw it.' }))); return; }
    add(ov, h('div', { class: 'ovcard wait', id: 'waitCard' },
      h('div', { class: 'pencil-spin', 'aria-hidden': 'true', text: '✏️' }),
      h('p', { class: 'ov-k', text: 'Turn ' + g.turnNo }),
      h('h2', { class: 'ov-t', text: me && me.id === t.drawer ? 'Get ready to draw!' : nameOf(t.drawer) + ' is drawing next' }),
      h('p', { class: 'ov-s', text: 'The ' + teamName(t.setTeam) + ' is choosing ' + (me && me.id === t.drawer ? 'your' : 'the') + ' word…' })));
    return;
  }
  if (g.phase === 'reveal') {
    ov.classList.add('show', 'soft');
    const r = t.result || {};
    let line = '', cls = '';
    if (r.kind === 'guessed') { line = nameOf(r.by) + ' got it in ' + r.secs + ' s · +' + r.points + ' ' + teamShort(t.team); cls = 'good'; }
    else if (r.kind === 'stumped') { line = 'Nobody got it! +' + r.points + ' ' + teamShort(t.setTeam); cls = 'bad'; }
    else line = 'Turn skipped';
    add(ov, h('div', { class: 'ovcard reveal ' + cls, id: 'revealCard' },
      h('p', { class: 'ov-k', text: 'The word was' }),
      h('h2', { class: 'ov-t big', id: 'revealWord', text: t.word || '?' }),
      h('p', { class: 'ov-s', text: line }),
      t.setBy ? h('p', { class: 'hint', text: 'Set by ' + nameOf(t.setBy) + (t.category ? ' · ' + t.category : '') }) : t.auto ? h('p', { class: 'hint', text: 'Picked by the game' }) : null));
  }
}
function playersCard(g) {
  const d = st();
  const t = g.turn;
  const col = function (tm) {
    return h('div', { class: 'pcol t' + tm }, h('div', { class: 'teamhead' }, teamDot(tm), h('b', { text: teamName(tm) })),
      h('ul', { class: 'plist' }, g.players.filter(function (p) { return p.team === tm; }).map(function (p) {
        const r = rosterEntry(p.id);
        const isDrawer = t && t.drawer === p.id && g.phase !== 'over';
        return h('li', { class: (p.left ? 'left ' : '') + (r && !r.on ? 'off ' : '') + (isDrawer ? 'drawer' : ''), 'data-pid': p.id },
          h('span', { class: 'nm', text: p.name + (p.id === S.me ? ' (you)' : '') }), isDrawer ? h('span', { class: 'tag', text: '✏️ drawing' }) : null,
          r && !r.on && !p.left ? h('em', { class: 'tag warnt', text: 'offline' }) : null, p.left ? h('em', { class: 'tag', text: 'left' }) : null,
          h('span', { class: 'pts', text: String(p.score) }));
      })));
  };
  const hostBtns = [];
  if (S.isHost && g.phase !== 'over') {
    if (g.phase === 'choose' || g.phase === 'draw') hostBtns.push(confirmBtn('skip', 'Skip this turn', 'Confirm: skip', hostSkip, 'small'));
    g.players.forEach(function (p) { const r = rosterEntry(p.id); if (p.id !== S.me && !p.left && r && !r.on) hostBtns.push(confirmBtn('rm' + p.id, 'Remove ' + p.name + ' (offline)', 'Confirm: remove', function () { hostRemove(p.id); }, 'small')); });
    hostBtns.push(confirmBtn('end', 'End game', 'Confirm: end game', hostEndGame, 'small'));
  }
  if (!S.isHost) hostBtns.push(confirmBtn('leave', 'Leave room', 'Confirm: leave', function () { Net.leave(); }, 'small'));
  return h('section', { class: 'card players', id: 'playersCard' }, h('div', { class: 'pcols' }, col(0), col(1)),
    viewers().length ? h('p', { class: 'viewline' }, icon('eye', 16), h('span', { text: 'Watching: ' + viewers().join(', ') })) : null,
    hostBtns.length ? h('div', { class: 'row tools2' }, hostBtns) : null, d ? null : null);
}
function reactRow() {
  return h('div', { class: 'reacts', role: 'group', 'aria-label': 'Reactions' }, REACTIONS.map(function (e) { return h('button', { type: 'button', class: 'react', 'aria-label': 'React ' + e, onclick: function () { Net.react(e); } }, e); }));
}
function gameScreen() {
  const g = game(), t = g.turn, me = meP();
  if (g.phase === 'over') return overScreen(g);
  Board.ensure();
  boardOverlay();
  const drawing = me && t && g.phase === 'draw' && t.drawer === me.id;
  Board.setEnabled(!!drawing);
  const setting = me && t && g.phase === 'choose' && me.team === t.setTeam;
  const stage = h('div', { class: 'stagecol' }, roleLine(g), wordBar(g), setting ? chooseForm(g) : null, setting ? null : Board.ensure(), drawing ? toolsBar() : null, reactRow());
  const side = h('div', { class: 'sidecol' }, Chat.ensure(), playersCard(g));
  Chat.sync();
  const nodes = [scoreBar(g)];
  if (!me) nodes.push(h('div', { class: 'watching banner', id: 'watching' }, h('span', { text: '👁 You’re watching. You can join when this game ends.' })));
  nodes.push(h('div', { class: 'gamegrid' }, stage, side));
  return nodes;
}
function overScreen(g) {
  Board.setEnabled(false);
  const sum = PC.summary(g);
  const w = sum.winner;
  const me = meP();
  const buttons = [];
  if (S.isHost) {
    buttons.push(btn('Play again', hostRematch, { kind: 'primary big', id: 'rematchBtn' }));
    buttons.push(btn('Back to lobby', hostToLobby, { kind: 'ghost', id: 'lobbyBtn' }));
  } else {
    buttons.push(h('p', { class: 'hint', text: 'Waiting for ' + nameOf(st().hostId) + ' to start another game…' }));
    if (!me && S.st.roster.length < PC.MAX_PLAYERS) buttons.push(btn('Play next game', function () { Net.sit(cleanName(S.name) || 'Player'); }, { kind: 'primary', id: 'sitNext' }));
    buttons.push(confirmBtn('leave2', 'Leave room', 'Confirm: leave', function () { Net.leave(); }));
  }
  const head = h('section', { class: 'card winner' + (w === 0 || w === 1 ? ' t' + w : ''), id: 'overCard' }, icon('trophy', 44),
    h('p', { class: 'ov-k', text: 'Game over' }),
    h('h2', { class: 'ov-t', id: 'winner', text: w === 'tie' ? 'It’s a tie!' : teamName(w) + ' wins!' }),
    h('div', { class: 'finalscore' }, [0, 1].map(function (t) { return h('div', { class: 'fs t' + t }, h('span', { class: 'tname', text: teamShort(t) }), h('span', { class: 'tscore', text: String(g.teamScore[t]) })); })),
    h('div', { class: 'ovbtns' }, buttons));
  const table = h('table', { class: 'sumtab', id: 'summaryTable' },
    h('thead', {}, h('tr', {}, h('th', { class: 'pn', text: 'Player' }), ['Points', 'Guessed', 'Drew', 'Stumps'].map(function (c) { return h('th', { text: c }); }))),
    h('tbody', {}, sum.rows.map(function (r) {
      return h('tr', { class: 't' + r.team + (r.id === S.me ? ' me' : ''), 'data-pid': r.id },
        h('td', { class: 'pn' }, teamDot(r.team), h('span', { class: 'cn', text: r.name + (r.id === S.me ? ' (you)' : '') })),
        h('td', { class: 'b', text: String(r.score) }), h('td', { text: String(r.guessed) }), h('td', { text: r.drew ? r.drawnGuessed + '/' + r.drew : '0' }), h('td', { text: String(r.stumps) }));
    })));
  const nm = function (id) { const r = sum.rows.find(function (x) { return x.id === id; }); return r ? r.name : ''; };
  const stats = card(h('h3', { text: 'Game summary' }), table,
    sum.awards.length ? h('ul', { class: 'awards', id: 'awards' }, sum.awards.map(function (a) {
      return h('li', { 'data-award': a.id }, h('span', { class: 'aic', text: a.icon }), h('span', { class: 'atx' }, h('b', { text: a.title + ': ' + nm(a.who) }), h('span', { text: a.text })));
    })) : null);
  return [head, stats, galleryCard(g), h('div', { class: 'gamegrid end' }, h('div', { class: 'sidecol' }, Chat.ensure()))].concat((function () { Chat.sync(); return []; })());
}
function galleryCard(g) {
  const list = S.gallery.gameId === g.id ? S.gallery.list : [];
  if (!list.length) return null;
  return h('section', { class: 'card gallery', id: 'gallery' },
    h('div', { class: 'cardhead' }, h('h3', { text: 'Drawings' }), btn('Save all', function () { saveSheet(g, list); }, { kind: 'ghost small', id: 'saveAll', icon: 'download' })),
    h('div', { class: 'gal' }, list.map(function (x) {
      return h('figure', { class: 'gi t' + x.team }, h('img', { src: x.img, alt: 'Drawing of ' + x.word + ' by ' + x.drawer, loading: 'lazy' }),
        h('figcaption', {}, h('b', { text: x.word }), h('span', { text: x.drawer + (x.kind === 'guessed' ? ' · guessed by ' + x.by : x.kind === 'stumped' ? ' · nobody got it' : ' · skipped') })),
        h('a', { class: 'gdl', href: x.img, download: 'pictionary-' + slug(x.word) + '.jpg', 'aria-label': 'Download drawing of ' + x.word }, icon('download', 16)));
    })));
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'drawing'; }
function saveSheet(g, list) {
  const cols = list.length <= 4 ? 2 : 3, cw = 400, chh = 300, cap = 56, pad = 20, top = 110;
  const rows = Math.ceil(list.length / cols);
  const c = document.createElement('canvas'); c.width = pad + cols * (cw + pad); c.height = top + rows * (chh + cap + pad) + 40;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f2e8'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#2350c9'; x.font = '700 64px "Caveat", cursive'; x.textAlign = 'center'; x.fillText('Pictionary', c.width / 2, 66);
  x.fillStyle = '#5f6272'; x.font = '800 22px "Nunito", system-ui, sans-serif';
  x.fillText((g.winner === 'tie' ? 'Tie game' : PC.TEAMS[g.winner].name + ' wins') + ' · Blue ' + g.teamScore[0] + ' – ' + g.teamScore[1] + ' Red', c.width / 2, 96);
  let pending = list.length;
  const done = function () {
    const a = document.createElement('a'); a.download = 'pictionary-drawings.png';
    try { a.href = c.toDataURL('image/png'); } catch (e) { toast('Could not save the drawings.'); return; }
    document.body.appendChild(a); a.click(); a.remove();
  };
  list.forEach(function (it, i) {
    const img = new Image();
    img.onload = img.onerror = function () {
      const cx = pad + (i % cols) * (cw + pad), cy = top + Math.floor(i / cols) * (chh + cap + pad);
      x.fillStyle = '#fff'; x.fillRect(cx, cy, cw, chh);
      try { x.drawImage(img, cx, cy, cw, chh); } catch (e) { /* skip */ }
      x.strokeStyle = PC.TEAMS[it.team].color; x.lineWidth = 4; x.strokeRect(cx, cy, cw, chh);
      x.textAlign = 'left'; x.fillStyle = '#1f2230'; x.font = '800 22px "Nunito", system-ui, sans-serif'; x.fillText(it.word, cx, cy + chh + 26);
      x.fillStyle = '#5f6272'; x.font = '700 16px "Nunito", system-ui, sans-serif'; x.fillText('by ' + it.drawer, cx, cy + chh + 48);
      if (--pending === 0) done();
    };
    img.src = it.img;
  });
}
function roomScreen() {
  const d = st();
  if (!d) return [roomCard(), card(h('p', { class: 'dim', id: 'loading', text: S.conn === 'failed' ? 'Could not join this room.' : 'Connecting to room ' + S.room + '…' }), btn('Back', function () { Net.leave(); }, { kind: 'ghost', id: 'backHome' }))];
  if (!d.game) return lobbyScreen();
  return gameScreen();
}

/* ---------- state hooks: sounds, gallery, per-turn resets ---------- */
onStateHook = function (prev, d) {
  const pg = prev && prev.game, g = d.game;
  if (!g) return;
  if (S.gallery.gameId !== g.id) {
    let kept = null; try { kept = JSON.parse(sessionStorage.getItem('pictionary.gallery') || 'null'); } catch (e) { kept = null; }
    S.gallery = kept && kept.gameId === g.id && Array.isArray(kept.list) ? kept : { gameId: g.id, list: [] };
    if (!kept || kept.gameId !== g.id) setTimeout(function () { window.scrollTo(0, 0); }, 0);
  }
  const t = g.turn, pt = pg && pg.id === g.id ? pg.turn : null;
  const turnChanged = !pt || pt.n !== t.n;
  if (turnChanged) {
    S.form = { word: '', category: '', custom: '', hint: '', sugg: null, key: '' };
    const me = g.players.find(function (p) { return p.id === S.me; });
    S.chatTeam = !!(me && t && me.team === t.setTeam);
    if (me && t && me.id === t.drawer) { SFX.turn(); buzz(40); }
  }
  if (pt && pt.n === t.n && pt.vetoed !== t.vetoed) { S.form.word = ''; S.form.sugg = null; }
  if (pg && pg.id === g.id && pg.phase !== 'draw' && g.phase === 'draw') {
    const me = g.players.find(function (p) { return p.id === S.me; });
    if (me && me.id === t.drawer) { SFX.turn(); buzz([30, 40, 30]); setTimeout(function () { const w = document.getElementById('boardWrap'); if (w) w.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60); }
  }
  // keep each finished drawing for the end-of-game gallery
  if (g.phase === 'reveal' && (!pg || pg.phase !== 'reveal' || (pt && pt.n !== t.n)) && t.word && !S.gallery.list.some(function (x) { return x.n === t.n; })) {
    if (!Board.blank()) {
      S.gallery.list.push({ n: t.n, word: t.word, drawer: PC.nameOf(g, t.drawer), team: t.team, kind: t.result ? t.result.kind : '', by: t.result && t.result.by ? PC.nameOf(g, t.result.by) : '', img: Board.snapshot(480) });
      try { sessionStorage.setItem('pictionary.gallery', JSON.stringify(S.gallery)); } catch (e) { /* too big or blocked: the gallery just won't survive a reload */ }
    }
  }
  if (pg && pg.phase !== 'over' && g.phase === 'over') SFX.win();
};

/* ================= shell ================= */
function renderHeader() {
  clear(hdrEl);
  const g = game();
  let chip = '';
  if (S.screen === 'room') chip = S.room;
  const theme = currentTheme();
  add(hdrEl,
    h('span', { class: 'hbrand' }, h('span', { class: 'logo', text: 'Pictionary' })),
    chip ? h('span', { class: 'chip', id: 'chip', text: chip }) : null,
    S.screen === 'room' && viewers().length ? h('button', { type: 'button', class: 'eyechip' + (OPEN.viewers ? ' on' : ''), id: 'eyeChip', 'aria-label': viewers().length + ' watching: ' + viewers().join(', '), 'aria-expanded': OPEN.viewers ? 'true' : 'false',
      onclick: function () { OPEN.viewers = !OPEN.viewers; render(); } }, icon('eye', 16), h('span', { id: 'viewCount', text: String(viewers().length) })) : null,
    S.screen === 'room' && OPEN.viewers && viewers().length ? h('div', { class: 'viewpop', id: 'viewPop' }, h('b', { text: 'Watching' }), viewers().map(function (n) { return h('span', { text: n }); })) : null,
    h('div', { class: 'htools' },
      h('button', { type: 'button', class: 'iconbtn', id: 'themeBtn', 'aria-label': theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', title: theme === 'dark' ? 'Light theme' : 'Dark theme',
        onclick: function () { setTheme(theme === 'dark' ? 'light' : 'dark'); render(); } }, icon(theme === 'dark' ? 'sun' : 'moon')),
      h('button', { type: 'button', class: 'iconbtn', id: 'soundBtn', 'aria-label': S.sound ? 'Mute sound' : 'Turn sound on', 'aria-pressed': S.sound ? 'true' : 'false',
        onclick: function () { S.sound = !S.sound; store('sound', S.sound ? '1' : '0'); if (S.sound) SFX.click(); render(); } }, icon(S.sound ? 'vol' : 'mute'))));
}
function renderConn() {
  clear(connEl);
  let show = false;
  if (S.screen === 'room') {
    if (S.conn === 'failed') {
      show = true;
      add(connEl, h('div', { class: 'connbar bad', role: 'alert' }, icon('wifi', 18), h('span', { class: 'ctext', text: S.connMsg || 'Disconnected.' }),
        S.isHost ? null : btn('Try again', clientRetryNow, { kind: 'small', id: 'retryBtn' }), btn('Home', function () { Net.leave(); }, { kind: 'ghost small', id: 'homeBtn' })));
    } else if (S.conn !== 'open' || S.connMsg) {
      show = true;
      add(connEl, h('div', { class: 'connbar', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'ctext', text: S.connMsg || (S.isHost ? 'Opening room ' + S.room + '…' : 'Connecting…') })));
    }
  }
  connEl.hidden = !show;
}
function screen() { return S.screen === 'room' ? roomScreen() : homeScreen(); }
const OPEN = {};
function captureFocus() { const a = document.activeElement; if (!a || !a.id || !(a.tagName === 'INPUT' || a.tagName === 'SELECT') || a.id === 'chatIn') return null; return { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd }; }
function restoreFocus(k) {
  if (!k) return; const el = document.getElementById(k.id); if (!el) return;
  if (el.value !== k.v) el.value = k.v;
  try { el.focus({ preventScroll: true }); if (k.s !== null && el.setSelectionRange) el.setSelectionRange(k.s, k.e); } catch (e) { /* ignore */ }
}
let wakeLock = null;
function syncWake() {
  const want = S.screen === 'room' && !!game() && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }, function () {});
    else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { /* optional */ }
}
render = function () {
  if (!root) return;
  const keep = captureFocus();
  const chatFocused = document.activeElement && document.activeElement.id === 'chatIn';
  const g = game();
  document.documentElement.classList.toggle('ingame', S.screen === 'room' && !!g);
  renderHeader(); renderConn();
  // keep the persistent board and chat out of the way while the page is rebuilt
  clear(mainEl);
  if (S.err) mainEl.appendChild(h('div', { class: 'err', role: 'alert', id: 'errBar' }, h('span', { text: S.err }), h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { S.err = ''; render(); } }, icon('x', 16))));
  screen().forEach(function (n) { add(mainEl, n); });
  mainEl.querySelectorAll('details[id]').forEach(function (d) {
    if (Object.prototype.hasOwnProperty.call(OPEN, d.id)) d.open = OPEN[d.id];
    d.addEventListener('toggle', function () { OPEN[d.id] = d.open; });
  });
  toastEl.hidden = !S.toast; toastEl.textContent = S.toast;
  restoreFocus(keep);
  if (chatFocused) { const ci = document.getElementById('chatIn'); if (ci && !ci.disabled) try { ci.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  tickHud(); syncWake();
};
let lastTickSec = -1;
function tickHud() {
  const d = st(); if (!d || !d.clock) return;
  const left = clockLeft(), total = d.clock.total || 1;
  const fill = document.getElementById('timerFill'), txt = document.getElementById('timerTxt');
  if (txt) txt.textContent = fmtSecs(left);
  if (fill) { fill.style.setProperty('--p', (left / total * 100).toFixed(1)); fill.parentElement.classList.toggle('low', left < 10000); }
  const g = game();
  if (g && g.phase === 'draw' && left < 10000 && left > 0) { const s = Math.ceil(left / 1000); if (s !== lastTickSec) { lastTickSec = s; SFX.tick(); } }
  // the "pass on this word" button disappears after 15 seconds
  if (g && g.phase === 'draw' && document.getElementById('vetoBtn') && d.clock.el !== undefined && d.clock.el + (Date.now() - d.clockAt) >= PC.VETO_MS) render();
}
function boot() {
  root = document.getElementById('app');
  setTheme(currentTheme());
  hdrEl = h('header', { class: 'hdr', id: 'hdr' });
  connEl = h('div', { class: 'connwrap', id: 'conn', hidden: true });
  mainEl = h('main', { class: 'main', id: 'main' });
  toastEl = h('div', { class: 'toast', id: 'toast', role: 'status', hidden: true });
  add(root, hdrEl, connEl, mainEl);
  document.body.appendChild(toastEl);
  setInterval(tickHud, 250);
  document.addEventListener('visibilitychange', function () {
    syncWake();
    if (document.visibilityState !== 'visible' || S.screen !== 'room') return;
    if (S.isHost && H.peer && H.peer.disconnected && !H.peer.destroyed) { try { H.peer.reconnect(); } catch (e) { hostStartPeer(); } }
    if (!S.isHost && S.conn !== 'open' && S.conn !== 'failed') clientRetry(100);
  });
  window.addEventListener('pagehide', function () { if (S.isHost) hostSave(); });
  window.addEventListener('hashchange', function () { const c = cleanCode(location.hash.slice(1)); if (S.screen === 'home' && c.length === 4) { S.joinCode = c; render(); } });
  const code = cleanCode(location.hash.slice(1));
  const sh = savedHost();
  if (code.length === 4) {
    if (sh && sh.room === code) { hostResume(sh); return; }
    S.joinCode = code;
    if (store('tok.' + code) && store('watch.' + code) === '1') { clientJoin(code, cleanName(S.name), true); return; }
    if (store('tok.' + code) && cleanName(S.name)) { clientJoin(code, S.name); return; }
  }
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
window.__pc = { S: S, H: H, C: C, PC: PC, Board: Board };
