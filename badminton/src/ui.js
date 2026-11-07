/* ===== ui: screens. The court canvas and the controls are persistent; the rest re-renders from state. ===== */
let root, hdrEl, connEl, mainEl, toastEl;
const SIDES = [{ name: 'Blue', color: '#3f7bff' }, { name: 'Red', color: '#ff5c72' }];
function st() { return S.st; }
function match() { return S.st && S.st.match; }
function rosterEntry(id) { return S.st && S.st.roster ? S.st.roster.find(function (r) { return r.id === id; }) : null; }
function nameOf(id) { const m = match(); const p = m && m.players.find(function (q) { return q.id === id; }); const r = rosterEntry(id); return (p ? p.name : r ? r.name : 'Player') + ((p && p.bot) || (r && r.bot) ? ' 🤖' : ''); }
function viewers() { return S.st && Array.isArray(S.st.viewers) ? S.st.viewers : []; }
function card() { const c = h('section', { class: 'card' }); for (let i = 0; i < arguments.length; i++) add(c, arguments[i]); return c; }
function btn(label, fn, o) { o = o || {}; return h('button', { type: 'button', class: 'btn ' + (o.kind || ''), id: o.id, disabled: !!o.disabled, 'aria-label': o.aria, onclick: function (e) { SFX.click(); fn(e); } }, o.icon ? icon(o.icon, 18) : null, label); }
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
function sideDot(s) { return h('span', { class: 'sdot s' + s, 'aria-hidden': 'true' }); }
function currentTheme() { return store('theme') === 'light' ? 'light' : 'dark'; }
function setTheme(t) { document.documentElement.setAttribute('data-theme', t); store('theme', t); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#11141d' : '#f5f2e8'); }
function touchy() { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }

/* ---------- home ---------- */
function hero() {
  return h('section', { class: 'hero' },
    h('div', { class: 'heroart', 'aria-hidden': 'true', html: '<svg viewBox="0 0 220 130" width="220" height="130"><rect x="20" y="10" width="180" height="110" rx="6" fill="#1f7a55"/><g stroke="#fff" stroke-width="2.5" fill="none" opacity=".9"><rect x="26" y="16" width="168" height="98"/><path d="M110 16v98M60 16v98M160 16v98M26 65h34M160 65h34"/></g><path d="M110 12v106" stroke="#f4f6fb" stroke-width="4"/><path d="M58 95 C 90 20, 140 18, 168 48" fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-dasharray="5 5"/><g transform="translate(168 48) rotate(40)"><path d="M0-3L-13-8L-13 8L0 3Z" fill="#fff"/><circle cx="1.5" r="3.6" fill="#f2f2f2" stroke="#c9a26b"/></g><circle cx="58" cy="98" r="9" fill="#3f7bff" stroke="#fff" stroke-width="2"/><circle cx="160" cy="80" r="9" fill="#ff5c72" stroke="#fff" stroke-width="2"/></svg>' }),
    h('div', { class: 'herotx' },
      h('h1', { text: 'Smash it.' }),
      h('p', { text: 'Online badminton for 2 to 4 friends (1 v 1, 1 v 2 or 2 v 2), with real shuttle physics, a height meter for timing smashes, and an energy bar so you can’t smash forever.' })));
}
function savedHost() { const s = storeJSON('host'); return s && s.room && s.savedAt && Date.now() - s.savedAt < 24 * 3600 * 1000 ? s : null; }
const PRACTICE = { format: store('pfmt') || '1v1', level: store('plvl') || 'normal' };
function homeScreen() {
  const nodes = [hero()];
  const invited = S.joinCode.length === 4;
  const sh = savedHost();
  if (sh) nodes.push(h('section', { class: 'card resume' }, h('h3', { text: 'Game in progress' }), h('p', {}, 'You were hosting court ', h('strong', { class: 'code-inline', text: sh.room }), '.'),
    h('div', { class: 'row' }, btn('Resume hosting', function () { hostResume(sh); }, { kind: 'primary', id: 'resumeHost' }), confirmBtn('discard', 'Discard', 'Confirm: end that game', function () { storeJSON('host', null); render(); }))));
  const nameIn = h('input', { id: 'nameIn', type: 'text', maxlength: '14', autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } });
  const need = function () { const nm = cleanName(S.name); if (!nm) { setErr('Type your name first.'); const el = document.getElementById('nameIn'); if (el) el.focus(); return null; } S.err = ''; store('name', nm); return nm; };
  const codeIn = h('input', { id: 'codeIn', type: 'text', autocapitalize: 'characters', autocomplete: 'off', maxlength: '4', placeholder: 'ABCD', 'aria-label': 'Court code', class: 'codein', value: S.joinCode, oninput: function (e) { const c = cleanCode(e.target.value); S.joinCode = c; if (e.target.value !== c) e.target.value = c; } });
  const joinForm = h('form', { class: 'joinrow', id: 'joinForm', onsubmit: function (e) { e.preventDefault(); const nm = need(); if (!nm) return; const c = cleanCode(S.joinCode); if (c.length !== 4) { setErr('Court codes have 4 letters.'); return; } clientJoin(c, nm); } },
    codeIn, h('button', { class: 'btn primary', type: 'submit', id: 'joinBtn' }, 'Join'),
    h('button', { class: 'btn ghost', type: 'button', id: 'watchBtn', onclick: function () { const c = cleanCode(S.joinCode); if (c.length !== 4) { setErr('Type the 4-letter court code to watch.'); return; } S.err = ''; clientJoin(c, cleanName(S.name), true); } }, icon('eye', 18), 'Watch'));
  const create = btn('Create a court', function () { const nm = need(); if (!nm) return; hostCreate(nm); }, { kind: invited ? 'ghost' : 'primary big', id: 'createBtn' });
  nodes.push(h('section', { class: 'card' }, h('h2', { text: invited ? 'You’re invited to court ' + S.joinCode : 'Who’s playing?' }), h('label', { class: 'lbl', for: 'nameIn', text: 'Name' }), nameIn));
  const practice = card(h('h3', { text: 'Practice against the computer' }),
    seg('Format', 'pracFmt', [['1v1', '1 v 1'], ['1v2', 'You v 2'], ['2v2', '2 v 2 (with a partner)']], PRACTICE.format, function (v) { PRACTICE.format = v; store('pfmt', v); render(); }),
    seg('Level', 'pracLvl', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], PRACTICE.level, function (v) { PRACTICE.level = v; store('plvl', v); render(); }),
    btn('Play', function () { const nm = cleanName(S.name) || 'You'; localBegin(nm, PRACTICE.format, PRACTICE.level); }, { kind: 'primary', id: 'practiceBtn' }));
  if (invited) nodes.push(card(h('h3', { text: 'Join court' }), joinForm, h('p', { class: 'hint', text: 'Or start your own:' }), create));
  else { nodes.push(card(h('h3', { text: 'Play online' }), create, h('div', { class: 'or' }, h('span', { text: 'or join friends' })), joinForm)); nodes.push(practice); }
  nodes.push(settingsCard(), howCard(!invited));
  nodes.push(h('p', { class: 'moregames' }, 'More games: ', h('a', { href: '../', text: 'Mafia' }), ' · ', h('a', { href: '../penfight/', text: 'Pen Fight' }), ' · ', h('a', { href: '../pictionary/', text: 'Pictionary' })));
  return nodes;
}
/* controls: touch sensitivity and keyboard bindings (shared by the home page and the in-game panel) */
function controlsPanel() {
  const rows = Input.ACTIONS.map(function (a) {
    const waiting = Input.capture === a[0];
    return h('div', { class: 'bindrow' }, h('span', { class: 'bindname', text: a[1] }),
      h('button', { type: 'button', class: 'bindkey' + (waiting ? ' wait' : ''), id: 'bind-' + a[0], 'aria-label': 'Change key for ' + a[1], onclick: function () { Input.capture = waiting ? null : a[0]; render(); } }, waiting ? 'Press a key… (Esc cancels)' : Input.keyName(Input.binds[a[0]]) + (['up', 'down', 'left', 'right'].indexOf(a[0]) !== -1 ? '  (or arrow)' : '')));
  });
  return h('div', { class: 'ctlpanel', id: 'ctlPanel' },
    seg('Touch joystick sensitivity', 'sensPick', [['low', 'Low (smooth)'], ['medium', 'Medium'], ['high', 'High (quick)']], S.sens, function (v) { S.sens = v; store('sens', v); render(); }),
    h('p', { class: 'hint', text: 'Low: drag further for full speed, movement eases in gently. High: small flicks move you fast.' }),
    h('span', { class: 'lbl', text: 'Keyboard: click an action, then press the key you want' }),
    h('div', { class: 'binds', id: 'binds' }, rows),
    h('div', { class: 'row' }, btn('Reset keys', function () { Input.resetBinds(); Input.capture = null; render(); }, { kind: 'ghost small', id: 'resetKeys' })),
    seg('Landing guide (an ✕ where the shuttle will come down)', 'guidePick', [[true, 'On'], [false, 'Off']], S.guide, function (v) { S.guide = v; store('guide', v ? '1' : '0'); render(); }));
}
function settingsCard() {
  return h('details', { class: 'card', id: 'setD' }, h('summary', { class: 'sumh', text: 'Settings & controls' }),
    controlsPanel(),
    seg('Theme', 'themePick', [['dark', 'Dark'], ['light', 'Light']], currentTheme(), function (v) { setTheme(v); render(); }));
}
function keysText(a) { return Input.keyName(Input.binds[a]); }
function howCard(open) {
  return h('details', { class: 'card how', id: 'howD', open: open ? true : null }, h('summary', { class: 'sumh', text: 'How to play' }),
    h('ul', { class: 'howlist' },
      h('li', {}, h('b', { text: 'Move: ' }), touchy() ? 'put your thumb down on the left and drag, like a joystick (sensitivity is in Settings).' : keysText('up') + keysText('left') + keysText('down') + keysText('right') + ' or the arrow keys (or drag on the left on a touch screen).'),
      h('li', {}, h('b', { text: 'Hit: ' }), 'Clear (' + keysText('clear') + '), Drop (' + keysText('drop') + '), Smash (' + keysText('smash') + '). Change keys in Settings. Swing when the green ring lights up around you, which means the shuttle is in reach. The direction you’re pushing as you hit aims the shot left or right, short or deep.'),
      h('li', {}, h('b', { text: 'Height meter: ' }), 'the gauge on the right shows how high the shuttle is. 🟢 2 m and up is the smash zone (above 2.5 m a jump smash). 🟡 is for drives, drops and clears. 🔴 below about 0.9 m, lift it or play a net shot; a smash from there goes into the net. The buttons relabel themselves to show what you’ll actually play.'),
      h('li', {}, h('b', { text: 'Serves: ' }), 'Clear = forehand high serve (deep), Drop = backhand short serve (just over the net), Smash = backhand flick serve (looks short, goes deep). Serve from the right court on an even score, into the diagonal box.'),
      h('li', {}, h('b', { text: 'Energy: ' }), 'sprinting, jumping and smashing drain it; standing still recovers it. Tired players run slower and smash softer. In 1 v 2 the solo player recovers faster.'),
      h('li', {}, h('b', { text: 'Perfect contact: ' }), 'hit close to your body at a good height for a faster, more accurate shot. Shots on your left are backhands, a little weaker.'),
      h('li', {}, h('b', { text: 'Scoring: ' }), 'every rally scores a point. First to 10 wins, but you need a 2-point lead; at 14–14 the next point wins (15 is the cap).')));
}
function joinUrl() { return location.origin + location.pathname + '#' + S.room; }
function copyLink() { const url = joinUrl(); try { navigator.clipboard.writeText(url).then(function () { toast('Invite link copied.'); }, function () { prompt('Copy this link:', url); }); } catch (e) { prompt('Copy this link:', url); } }
function qrSvg(text) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; } }
function roomCard() {
  const svg = qrSvg(joinUrl());
  return h('section', { class: 'card roomcard' }, h('div', { class: 'roomtop' },
    h('div', { class: 'roominfo' }, h('div', { class: 'lbl', text: 'Court code' }),
      h('div', { class: 'code', id: 'roomCode' }, S.room.split('').map(function (c) { return h('span', { text: c }); })),
      h('p', { class: 'hint', text: 'Friends open this page and type the code, scan the QR, or tap your link. Anyone extra can watch and wait for the next game.' }),
      h('div', { class: 'row' }, btn('Copy invite link', copyLink, { kind: 'primary', id: 'copyBtn', icon: 'copy' }),
        navigator.share ? btn('Share', function () { navigator.share({ title: 'Badminton', text: 'Badminton! Court ' + S.room, url: joinUrl() }).catch(function () {}); }, { kind: 'ghost', id: 'shareBtn', icon: 'share' }) : null)),
    svg ? h('div', { class: 'qr', id: 'qr', html: svg, role: 'img', 'aria-label': 'QR code to join' }) : null));
}

/* ---------- lobby ---------- */
function lobbyScreen() {
  const d = st(), host = S.isHost, roster = d.roster;
  const me = roster.find(function (r) { return r.id === S.me; });
  const c = [0, 0]; roster.forEach(function (r) { c[r.side]++; });
  const col = function (s) {
    const mem = roster.filter(function (r) { return r.side === s; });
    return h('div', { class: 'sidecol s' + s, id: 'side' + s },
      h('div', { class: 'teamhead' }, sideDot(s), h('h3', { text: SIDES[s].name + ' side' }), h('span', { class: 'count', text: mem.length + ' / 2' })),
      h('ul', { class: 'members' }, mem.length ? mem.map(function (r) {
        return h('li', { class: r.on ? '' : 'off', 'data-id': r.id }, h('span', { class: 'nm', text: r.name }),
          r.id === S.me ? h('em', { class: 'tag', text: 'you' }) : null, r.id === d.hostId ? h('em', { class: 'tag', text: 'host' }) : null,
          r.bot ? (host ? h('button', { type: 'button', class: 'tag botb', 'data-bot': r.id, onclick: function () { hostCycleBot(r.id); } }, '🤖 ' + r.bot) : h('em', { class: 'tag botb', text: '🤖 ' + r.bot })) : null,
          !r.on ? h('em', { class: 'tag warnt', text: 'offline' }) : null,
          host && c[1 - s] < 2 ? h('button', { type: 'button', class: 'mini', 'data-move': r.id, onclick: function () { hostSetSide(r.id, 1 - s); } }, '⇄') : null,
          host && r.id !== S.me ? h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + r.name, 'data-remove': r.id, onclick: function () { hostRemove(r.id); } }, icon('x', 14)) : null);
      }) : h('li', { class: 'emptyli', text: 'Empty' })),
      me && me.side !== s && c[s] < 2 ? btn('Play on ' + SIDES[s].name, function () { Net.side(s); }, { kind: 'small ghost', id: 'joinSide' + s }) : null);
  };
  const why = startProblem2(d);
  const sc = card(h('div', { class: 'cardhead' }, h('h2', { text: 'Players' }), h('span', { class: 'count', id: 'seatCount', text: roster.length + ' / 4' })),
    h('p', { class: 'dim', text: why || (c[0] + ' v ' + c[1] + '. Ready to play!') }), h('div', { class: 'sides' }, col(0), col(1)));
  const vs = viewers();
  if (vs.length) sc.appendChild(h('p', { class: 'viewline', id: 'viewLine' }, icon('eye', 16), h('span', { text: 'Watching and waiting: ' + vs.join(', ') })));
  if (!me && !host) sc.appendChild(h('div', { class: 'sitbox' }, h('p', { class: 'watching', text: '👁 You’re watching. Join if there’s a free spot.' }),
    h('input', { id: 'sitName', type: 'text', maxlength: '14', placeholder: 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } }),
    btn('Join the game', function () { if (!cleanName(S.name)) { setErr('Type your name first.'); return; } Net.sit(S.name); }, { kind: 'primary', id: 'sitBtn', disabled: roster.length >= 4 })));
  if (me && !host) sc.appendChild(h('div', { class: 'row' }, btn('Just watch instead', function () { Net.watch(); }, { kind: 'ghost small', id: 'justWatch', icon: 'eye' })));
  if (host && roster.length < 4) sc.appendChild(h('div', { class: 'addbot' }, h('span', { class: 'lbl', text: 'Add a computer player' }),
    h('div', { class: 'row' }, ['easy', 'normal', 'hard'].map(function (lv) { return btn('+ ' + lv[0].toUpperCase() + lv.slice(1), function () { hostAddBot(lv); }, { kind: 'small', id: 'addBot-' + lv }); }))));
  const nodes = [roomCard(), sc];
  if (host) nodes.push(card(h('h3', { text: 'Game' }),
    seg('Points to win (win by 2)', 'cfgTarget', [[5, '5'], [10, '10'], [15, '15'], [21, '21']], d.cfg.target, function (v) { hostSetCfg({ target: v }); }),
    btn(why || 'Start the game', function () { hostStart(); }, { kind: 'primary big', id: 'startBtn', disabled: !!why }),
    h('p', { class: 'hint', text: 'Your phone runs the game. Keep this page open while you play.' }),
    confirmBtn('close', 'Close court', 'Confirm: close court for everyone', function () { Net.leave(); })));
  else nodes.push(card(h('p', { class: 'dim', id: 'waitHost', text: 'First to ' + d.cfg.target + ', win by 2. ' + nameOf(d.hostId) + ' starts the game.' }), confirmBtn('leave', 'Leave', 'Confirm: leave', function () { Net.leave(); })));
  nodes.push(howCard(false));
  return nodes;
}
function startProblem2(d) {
  const c = [0, 0]; d.roster.forEach(function (r) { c[r.side]++; });
  if (d.roster.length < 2) return 'Waiting for a second player, or add a computer player.';
  if (!c[0] || !c[1]) return 'Both sides need a player: tap ⇄ to move someone.';
  return '';
}

/* ---------- game ---------- */
function scoreBar(m) {
  const side = function (s) {
    const names = m.players.filter(function (p) { return p.side === s; }).map(function (p) { return p.name + (p.bot ? ' 🤖' : ''); }).join(' & ');
    return h('div', { class: 'sb s' + s + (m.serveSide === s && m.phase !== 'over' ? ' serving' : '') },
      h('span', { class: 'sbn', text: names }), h('span', { class: 'sbs', id: 'score' + s, text: String(m.score[s]) }));
  };
  const me = m.players.find(function (p) { return p.id === S.me; });
  return h('div', { class: 'scorebar', id: 'scorebar' }, side(me && me.side === 1 ? 1 : 0),
    h('div', { class: 'sbmid' }, h('span', { text: 'to ' + m.cfg.target }), h('span', { class: 'rally', id: 'rallyNo', text: m.phase === 'rally' ? '' : '' })), side(me && me.side === 1 ? 0 : 1));
}
function banner(m) {
  const me = m.players.find(function (p) { return p.id === S.me && !p.left; });
  if (m.phase === 'point' && m.lastPoint) {
    const lp = m.lastPoint, won = me && me.side === lp.side;
    const why = { in: 'Winner!', out: 'Out!', net: 'Into the net!', serve: 'Serve fault!' }[lp.reason] || '';
    const who = m.players.filter(function (p) { return p.side === lp.side; }).map(function (p) { return p.name; }).join(' & ');
    return h('div', { class: 'banner ' + (me ? (won ? 'good' : 'bad') : ''), id: 'pointBanner' }, h('b', { text: why }), h('span', { text: ' Point ' + who + ' · ' + m.score[me && me.side === 1 ? 1 : 0] + '–' + m.score[me && me.side === 1 ? 0 : 1] + (lp.hits > 6 ? ' · ' + lp.hits + '-shot rally' : '') }));
  }
  if (m.phase === 'serve') {
    if (me && m.server === me.id) return h('div', { class: 'banner mine', id: 'serveBanner' }, h('b', { text: 'Your serve. ' }), h('span', { text: 'Clear = high · Drop = short · Smash = flick' }));
    return h('div', { class: 'banner', id: 'serveBanner' }, h('span', { text: nameOf(m.server) + ' to serve…' }));
  }
  const w = m.score.map(function (x, i) { return x >= m.cfg.target - 1 && x > m.score[1 - i] ? i : -1; }).filter(function (i) { return i >= 0; });
  if (w.length && m.phase === 'rally') return h('div', { class: 'banner hot', id: 'pointBanner' }, h('span', { text: 'Game point for ' + SIDES[w[0]].name + '!' }));
  return null;
}
function gameScreen() {
  const m = match();
  if (m.phase === 'over') return overScreen(m);
  const me = m.players.find(function (p) { return p.id === S.me && !p.left; });
  const wrap = Court.ensure();
  const ov = h('div', { class: 'courtov' }, banner(m));
  const old = wrap.querySelector('.courtov'); if (old) old.remove();
  wrap.appendChild(ov);
  const nodes = [scoreBar(m)];
  const stage = h('div', { class: 'stage' + (me ? ' playing' : ''), id: 'stage' }, wrap, me ? Controls.ensure() : null);
  nodes.push(stage);
  const tools = [];
  tools.push(h('div', { class: 'reacts' }, REACTIONS.map(function (e) { return h('button', { type: 'button', class: 'react', 'aria-label': 'React ' + e, onclick: function () { Net.react(e); } }, e); })));
  if (me && touchy()) tools.push(h('p', { class: 'runhint', text: 'Drag on the left side to run' }));
  if (me) tools.push(h('div', { class: 'energy', 'aria-label': 'Your energy' }, h('span', { class: 'elbl', text: 'Energy' }), h('span', { class: 'ebar' }, h('span', { class: 'efill hi', id: 'myEnergy' }))));
  if (!me) tools.push(h('p', { class: 'watching', id: 'watching', text: '👁 You’re watching. You can join when this game ends.' }));
  const ctl = [h('button', { type: 'button', class: 'btn small ghost', id: 'ctlBtn', 'aria-expanded': OPEN.ctl ? 'true' : 'false', onclick: function () { OPEN.ctl = !OPEN.ctl; render(); } }, '⚙ Controls'), h('button', { type: 'button', class: 'btn small ghost', id: 'guideBtn', 'aria-pressed': S.guide ? 'true' : 'false', onclick: function () { S.guide = !S.guide; store('guide', S.guide ? '1' : '0'); render(); } }, 'Landing guide: ' + (S.guide ? 'on' : 'off'))];
  if (S.isHost && !S.local) ctl.push(confirmBtn('end', 'End game', 'Confirm: end game', hostEndGame, 'small'));
  if (S.local) ctl.push(confirmBtn('quit', 'Quit practice', 'Confirm: quit', function () { hostClose(); }, 'small'));
  if (!S.isHost) ctl.push(confirmBtn('leave', 'Leave', 'Confirm: leave', function () { Net.leave(); }, 'small'));
  tools.push(h('div', { class: 'row ctl' }, ctl));
  nodes.push(h('div', { class: 'below' }, tools));
  if (OPEN.ctl) nodes.push(card(h('div', { class: 'cardhead' }, h('h3', { text: 'Controls' }), btn('Done', function () { OPEN.ctl = false; Input.capture = null; render(); }, { kind: 'small', id: 'ctlDone' })), controlsPanel()));
  return nodes;
}
function overScreen(m) {
  const sum = BD.summary(m), me = m.players.find(function (p) { return p.id === S.me; });
  const w = m.winner;
  const winners = w === 0 || w === 1 ? m.players.filter(function (p) { return p.side === w; }).map(function (p) { return p.name; }).join(' & ') : '';
  const buttons = [];
  if (S.isHost) { buttons.push(btn(S.local ? 'Play again' : 'Rematch', hostRematch, { kind: 'primary big', id: 'rematchBtn' })); buttons.push(btn(S.local ? 'Back home' : 'Back to lobby', hostToLobby, { kind: 'ghost', id: 'lobbyBtn' })); }
  else {
    buttons.push(h('p', { class: 'hint', text: 'Waiting for ' + nameOf(st().hostId) + ' to start the next game…' }));
    if (!me && S.st.roster.length < 4) buttons.push(btn('Play next game', function () { Net.sit(cleanName(S.name) || 'Player'); }, { kind: 'primary', id: 'sitNext' }));
    buttons.push(confirmBtn('leave2', 'Leave', 'Confirm: leave', function () { Net.leave(); }));
  }
  const head = h('section', { class: 'card winner' + (w === 0 || w === 1 ? ' s' + w : ''), id: 'overCard' }, icon('trophy', 44),
    h('p', { class: 'ov-k', text: 'Game over' }),
    h('h2', { class: 'ov-t', id: 'winner', text: w === null || w === undefined ? 'Game ended' : winners + (me && me.side === w ? ' (you!)' : '') + ' win' + (winners.indexOf('&') !== -1 ? '' : 's') + '!' }),
    h('div', { class: 'finalscore' }, [0, 1].map(function (s) { return h('div', { class: 'fs s' + s }, h('span', { class: 'tname', text: SIDES[s].name }), h('span', { class: 'tscore', text: String(m.score[s]) })); })),
    h('p', { class: 'hint', text: sum.rallies + ' rallies · longest ' + sum.longest + ' shots' }),
    h('div', { class: 'ovbtns' }, buttons));
  const table = h('table', { class: 'sumtab', id: 'summaryTable' },
    h('thead', {}, h('tr', {}, h('th', { class: 'pn', text: 'Player' }), ['Shots', 'Winners', 'Errors', 'Smashes', 'Top smash'].map(function (c) { return h('th', { text: c }); }))),
    h('tbody', {}, sum.rows.map(function (r) {
      return h('tr', { class: 's' + r.side + (r.id === S.me ? ' me' : ''), 'data-pid': r.id }, h('td', { class: 'pn' }, sideDot(r.side), h('span', { class: 'cn', text: r.name + (r.bot ? ' 🤖' : '') + (r.id === S.me ? ' (you)' : '') })),
        h('td', { text: String(r.hits) }), h('td', { class: 'b', text: String(r.winners) }), h('td', { text: String(r.errors) }), h('td', { text: String(r.smashes) }), h('td', { text: r.fastest ? r.fastest + ' km/h' : '–' }));
    })));
  const nm = function (id) { const r = sum.rows.find(function (x) { return x.id === id; }); return r ? r.name : ''; };
  return [head, card(h('h3', { text: 'Match stats' }), h('div', { class: 'tablewrap' }, table),
    sum.awards.length ? h('ul', { class: 'awards', id: 'awards' }, sum.awards.map(function (a) { return h('li', { 'data-award': a.id }, h('span', { class: 'aic', text: a.icon }), h('span', { class: 'atx' }, h('b', { text: a.title + ': ' + nm(a.who) }), h('span', { text: a.text }))); })) : null)];
}
function roomScreen() {
  const d = st();
  if (!d) return [S.room ? roomCard() : null, card(h('p', { class: 'dim', id: 'loading', text: S.conn === 'failed' ? 'Could not join this court.' : 'Connecting to court ' + S.room + '…' }), btn('Back', function () { Net.leave(); }, { kind: 'ghost', id: 'backHome' }))].filter(Boolean);
  if (!d.match) return S.local ? [card(h('p', { class: 'dim', text: 'Starting…' }))] : lobbyScreen();
  return gameScreen();
}
onStateHook = function (prev, d) {
  const pm = prev && prev.match, m = d.match;
  if (m && pm && pm.id === m.id && pm.phase !== 'over' && m.phase === 'over') SFX.win();
  if (m && (!pm || pm.id !== m.id)) setTimeout(function () { window.scrollTo(0, 0); }, 0);
};

/* ================= shell ================= */
function renderHeader() {
  clear(hdrEl);
  const m = match();
  let chip = '';
  if (S.screen === 'room') chip = S.local ? 'Practice' : S.room;
  const theme = currentTheme();
  add(hdrEl,
    h('span', { class: 'hbrand' }, h('span', { class: 'logo', text: 'Badminton' })),
    chip ? h('span', { class: 'chip', id: 'chip', text: chip }) : null,
    S.screen === 'room' && viewers().length ? h('button', { type: 'button', class: 'eyechip' + (OPEN.viewers ? ' on' : ''), id: 'eyeChip', 'aria-label': viewers().length + ' watching', onclick: function () { OPEN.viewers = !OPEN.viewers; render(); } }, icon('eye', 16), h('span', { id: 'viewCount', text: String(viewers().length) })) : null,
    S.screen === 'room' && OPEN.viewers && viewers().length ? h('div', { class: 'viewpop', id: 'viewPop' }, h('b', { text: 'Watching' }), viewers().map(function (n) { return h('span', { text: n }); })) : null,
    h('div', { class: 'htools' },
      h('button', { type: 'button', class: 'iconbtn', id: 'themeBtn', 'aria-label': theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', onclick: function () { setTheme(theme === 'dark' ? 'light' : 'dark'); render(); } }, icon(theme === 'dark' ? 'sun' : 'moon')),
      h('button', { type: 'button', class: 'iconbtn', id: 'soundBtn', 'aria-label': S.sound ? 'Mute sound' : 'Turn sound on', onclick: function () { S.sound = !S.sound; store('sound', S.sound ? '1' : '0'); if (S.sound) SFX.click(); render(); } }, icon(S.sound ? 'vol' : 'mute'))));
}
function renderConn() {
  clear(connEl);
  let show = false;
  if (S.screen === 'room' && !S.local) {
    if (S.conn === 'failed') {
      show = true;
      add(connEl, h('div', { class: 'connbar bad', role: 'alert' }, icon('wifi', 18), h('span', { class: 'ctext', text: S.connMsg || 'Disconnected.' }), S.isHost ? null : btn('Try again', clientRetryNow, { kind: 'small', id: 'retryBtn' }), btn('Home', function () { Net.leave(); }, { kind: 'ghost small', id: 'homeBtn' })));
    } else if (S.conn !== 'open' || S.connMsg) {
      show = true;
      add(connEl, h('div', { class: 'connbar', role: 'status' }, h('span', { class: 'spin' }), h('span', { class: 'ctext', text: S.connMsg || (S.isHost ? 'Opening court ' + S.room + '…' : 'Connecting…') })));
    }
  }
  connEl.hidden = !show;
}
function screen() { return S.screen === 'room' ? roomScreen() : homeScreen(); }
const OPEN = {};
function captureFocus() { const a = document.activeElement; if (!a || !a.id || !(a.tagName === 'INPUT')) return null; return { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd }; }
function restoreFocus(k) { if (!k) return; const el = document.getElementById(k.id); if (!el) return; if (el.value !== k.v) el.value = k.v; try { el.focus({ preventScroll: true }); if (k.s !== null && el.setSelectionRange) el.setSelectionRange(k.s, k.e); } catch (e) { /* ignore */ } }
let wakeLock = null;
function syncWake() {
  const want = S.screen === 'room' && !!match() && document.visibilityState === 'visible';
  try { if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }, function () {}); else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { /* optional */ }
}
render = function () {
  if (!root) return;
  const keep = captureFocus();
  const m = match();
  document.documentElement.classList.toggle('ingame', S.screen === 'room' && !!m && m.phase !== 'over');
  renderHeader(); renderConn();
  clear(mainEl);
  if (S.err) mainEl.appendChild(h('div', { class: 'err', role: 'alert', id: 'errBar' }, h('span', { text: S.err }), h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { S.err = ''; render(); } }, icon('x', 16))));
  screen().forEach(function (n) { add(mainEl, n); });
  mainEl.querySelectorAll('details[id]').forEach(function (d) { if (Object.prototype.hasOwnProperty.call(OPEN, d.id)) d.open = OPEN[d.id]; d.addEventListener('toggle', function () { OPEN[d.id] = d.open; }); });
  toastEl.hidden = !S.toast; toastEl.textContent = S.toast;
  restoreFocus(keep); syncWake();
  // the button that started the game is gone: put focus on the court so the keyboard works straight away
  const ae = document.activeElement;
  if (S.screen === 'room' && m && m.phase !== 'over' && (!ae || ae === document.body || !ae.isConnected)) { const cw = document.getElementById('courtWrap'); if (cw) try { cw.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
};
function boot() {
  root = document.getElementById('app');
  setTheme(currentTheme());
  hdrEl = h('header', { class: 'hdr', id: 'hdr' });
  connEl = h('div', { class: 'connwrap', id: 'conn', hidden: true });
  mainEl = h('main', { class: 'main', id: 'main' });
  toastEl = h('div', { class: 'toast', id: 'toast', role: 'status', hidden: true });
  add(root, hdrEl, connEl, mainEl);
  document.body.appendChild(toastEl);
  // Safari on iPad/iPhone ignores the viewport lock for pinch and double-tap, so block those gestures during a game
  const inGame = function () { return document.documentElement.classList.contains('ingame'); };
  ['gesturestart', 'gesturechange'].forEach(function (t) { document.addEventListener(t, function (e) { if (inGame()) e.preventDefault(); }, { passive: false }); });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) { const now = Date.now(); if (inGame() && now - lastTouchEnd < 350 && !(e.target && e.target.closest && e.target.closest('input, a'))) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
  document.addEventListener('touchmove', function (e) { if (inGame() && e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', function () {
    syncWake();
    if (document.visibilityState !== 'visible' || S.screen !== 'room' || S.local) return;
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
window.__bd = { S: S, H: H, C: C, BD: BD, View: View, Input: Input };
