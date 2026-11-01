/* ===== ui: screens ===== */
let root, hdrEl, connEl, mainEl, dockEl, chatLogEl, chatIn, chatHint, dockTitle, overlayEl, toastEl;
const OPEN = {};
const L = { data: null };

/* ---------- lookups ---------- */
function rosterOf() { return (S.pub && S.pub.roster) || []; }
function rosterEntry(id) { return rosterOf().find(function (r) { return r.id === id; }) || null; }
function pubPlayer(id) { return S.pub && S.pub.players ? S.pub.players.find(function (p) { return p.id === id; }) || null : null; }
function nameOf(id) {
  const p = pubPlayer(id); if (p) return p.name;
  const r = rosterEntry(id); if (r) return r.name;
  if (S.screen === 'local' && L.data && L.data.st) { const q = E.P(L.data.st, id); if (q) return q.name; }
  return 'Player';
}
function avOf(id) { const r = rosterEntry(id); return r && r.av ? r.av : ''; }
function inGame() { return !!(S.me && S.pub && S.pub.phase !== 'lobby' && pubPlayer(S.me)); }
function amHost() { return S.isHost; }

/* ---------- building blocks ---------- */
function card() { const c = h('section', { class: 'card' }); for (let i = 0; i < arguments.length; i++) add(c, arguments[i]); return c; }
function btn(label, fn, o) {
  o = o || {};
  return h('button', { type: 'button', class: 'btn ' + (o.kind || ''), id: o.id, disabled: o.disabled, 'aria-label': o.aria,
    onclick: function (e) { if (o.disabled) return; fn(e); } }, o.icon ? icon(o.icon, 18) : null, label);
}
function confirmBtn(key, label, confirmLabel, run, kind) {
  const armed = S.confirm === key;
  return btn(armed ? confirmLabel : label, function () {
    if (armed) { S.confirm = null; run(); render(); return; }
    S.confirm = key; render();
    setTimeout(function () { if (S.confirm === key) { S.confirm = null; render(); } }, 5000);
  }, { kind: armed ? 'danger' : (kind || 'ghost'), id: 'cf-' + key });
}
function plural(r, c) { return c + ' ' + ROLE_TXT[r].title + (c > 1 && r !== 'mafia' ? 's' : ''); }
function rvLabel(rv) { if (!rv) return 'Out'; if (rv === 'town') return 'Town'; return ROLE_TXT[rv] ? ROLE_TXT[rv].title : 'Out'; }
function rolePreview(n, cfg) {
  const nn = Math.min(Math.max(n, MINP), MAXP);
  const b = E.buildRoles(nn, cfg);
  const parts = ['mafia', 'doctor', 'police', 'prankster', 'civilian'].filter(function (r) { return b.counts[r]; }).map(function (r) { return plural(r, b.counts[r]); });
  return { text: 'With ' + nn + ' players: ' + parts.join(', ') + '.', notes: b.notes };
}
function avatar(id, name, cls) {
  const av = avOf(id);
  return h('span', { class: 'av' + (av ? ' emoji' : '') + (cls ? ' ' + cls : ''), style: '--h:' + hue(id), text: av || (name || '?').charAt(0).toUpperCase() });
}
function seat(p, o) {
  o = o || {};
  const dead = p.alive === false;
  const r = rosterEntry(p.id);
  const offline = S.screen === 'room' && r && !r.on;
  const cls = 'seat' + (dead ? ' dead' : '') + (o.selected ? ' sel' : '') + (o.selectable ? ' pick' : '') + (o.extra ? ' ' + o.extra : '');
  const sub = o.sub ? h('span', { class: 'sub', text: o.sub })
    : dead ? h('span', { class: 'sub', text: rvLabel(p.rv) })
    : o.blocked ? h('span', { class: 'sub', text: o.blocked })
    : offline ? h('span', { class: 'sub off', text: 'offline' })
    : o.pending ? h('span', { class: 'sub wait', text: 'deciding…' }) : null;
  const inner = [
    avatar(p.id, p.name),
    h('span', { class: 'sn' },
      h('span', { class: 'nm', text: p.name }),
      o.you ? h('em', { class: 'tag', text: 'you' }) : null,
      o.host ? h('em', { class: 'tag', text: 'host' }) : null,
      o.mate ? h('em', { class: 'tag ally', text: 'mafia' }) : null),
    sub
  ];
  if (o.selectable) {
    return h('button', { type: 'button', class: cls, 'data-id': p.id, 'aria-pressed': o.selected ? 'true' : 'false', onclick: function () { o.onPick(p.id); } }, inner);
  }
  return h('div', { class: cls, 'data-id': p.id }, inner);
}
function avatarPicker(id, current, taken, onPick) {
  return h('div', { class: 'avpick', id: id, role: 'group', 'aria-label': 'Choose your avatar' }, AVATARS.map(function (a) {
    const isTaken = !!(taken && taken[a]);
    return h('button', { type: 'button', class: 'avb' + (a === current ? ' on' : ''), 'aria-pressed': a === current ? 'true' : 'false', 'aria-label': 'Avatar ' + a, disabled: isTaken, 'data-av': a,
      onclick: function () { onPick(a); SFX.click(); } }, a);
  }));
}

/* ---------- game panels ---------- */
function banner(pub) {
  const night = pub.phase === 'night', over = pub.phase === 'over';
  const title = over ? 'Game over' : night ? 'Night ' + pub.round : 'Day ' + pub.round + (pub.phase === 'discuss' ? ' · Talk' : ' · Vote');
  const sub = over ? '' : night ? pickLine(NIGHT_LINES, pub.gameId + pub.round)
    : pub.phase === 'discuss' ? 'Argue, accuse, defend. Tap ready when you want to vote.'
    : 'Vote someone out, or skip.';
  const pend = (pub.pending || []).map(nameOf);
  const alive = (pub.players || []).filter(function (p) { return p.alive; }).length;
  const done = alive - pend.length;
  return h('section', { class: 'banner ' + (night ? 'night' : over ? 'over' : 'day'), id: 'banner' },
    h('div', { class: 'bl' }, icon(night ? 'moon' : 'sun', 28),
      h('div', { class: 'bt-wrap' },
        h('h1', { class: 'bt', text: title }),
        sub ? h('p', { class: 'bs', text: sub }) : null,
        !over && alive ? h('div', { class: 'progress', id: 'progress', 'aria-label': done + ' of ' + alive + ' done' },
          h('span', { class: 'bar' }, h('span', { class: 'fill', style: 'width:' + Math.round(done / alive * 100) + '%' })),
          h('span', { class: 'ptext', text: pend.length ? done + ' of ' + alive + ' ready · waiting for ' + (pend.length > 3 ? pend.slice(0, 3).join(', ') + ' +' + (pend.length - 3) : pend.join(', ')) : 'Everyone is ready' })) : null)),
    pub.dl ? h('div', { class: 'timer', id: 'timer', 'aria-label': 'Time left' }) : null);
}
function rolePanel(v, local) {
  const r = v.me.role, t = ROLE_TXT[r];
  const kids = [h('div', { class: 'eyebrow', text: 'Your secret role' }), h('h2', { class: 'rname', text: t.title }), h('p', { class: 'rblurb', text: t.blurb })];
  if (r === 'mafia') {
    kids.push(v.mates.length
      ? h('p', { class: 'allies' }, 'Your family: ', v.mates.map(function (m, i) { return h('strong', { text: m.name + (m.alive ? '' : ' (out)') + (i < v.mates.length - 1 ? ', ' : '') }); }))
      : h('p', { class: 'allies', text: 'You are the only Mafia member. Trust nobody.' }));
  }
  if (!v.me.alive) kids.push(h('p', { class: 'warn', text: 'You are out. Keep your secrets; you can still talk with the other ghosts.' }));
  const body = h('div', { class: 'rbody' }, kids);
  if (local) return h('section', { class: 'card role ' + r, id: 'roleCard' }, h('div', { class: 'rico' }, icon(r, 34)), body);
  return h('details', { class: 'card role ' + r, id: 'roleD' },
    h('summary', { class: 'rsum' }, h('span', { class: 'rico' }, icon(r, 22)), h('span', { class: 'rs-t' }, 'Your role: ', h('strong', { class: 'spoiler', text: t.title })), h('span', { class: 'rs-h', text: 'tap to show' })),
    body);
}
function infoCard(v) {
  const rows = [];
  v.intel.forEach(function (i) {
    rows.push(h('li', { class: i.res === 'mafia' ? 'hit' : '' }, 'Night ' + i.r + ': ', h('strong', { text: nameOf(i.to) }), i.res === 'mafia' ? ' is Mafia.' : ' is not Mafia.'));
  });
  v.notes.forEach(function (n) { rows.push(h('li', {}, 'Night ' + n.r + ': ' + n.x)); });
  if (!rows.length) return null;
  return card(h('h3', { text: v.me.role === 'police' ? 'Case file' : 'Private notes' }), h('ul', { class: 'plain notes' }, rows));
}
function actionPanel(v, players, submitFn, local) {
  const act = v.act;
  if (!act) return null;
  const selKey = v.gameId + ':' + v.key + ':' + v.me.id;
  const sent = S.sent && S.sent.k === selKey ? S.sent : null;
  const mine = v.mine;
  const locked = !!(sent || mine);
  const lockedTo = sent ? sent.to : (mine ? mine.to : undefined);
  const doSubmit = function (a) {
    SFX.click();
    if (!local) { S.sent = { k: selKey, to: a.to }; render(); }
    const ok = submitFn(a);
    if (ok === false && !local) { S.sent = null; render(); }
  };
  if (act.kind === 'sleep' || act.kind === 'ready') {
    const isSleep = act.kind === 'sleep';
    return h('section', { class: 'card act ' + (isSleep ? 'sleepy' : '') },
      h('h2', { text: isSleep ? 'Close your eyes' : 'Talk it out' }),
      h('p', { class: 'dim', text: isSleep ? 'You have no night power. Tap below so nobody can tell who does.' : 'Who is lying? Discuss out loud or in the chat. The vote opens when everyone is ready.' }),
      btn(locked ? (isSleep ? 'Sleeping… zzz' : 'Ready. Waiting for the others…') : (isSleep ? 'Go to sleep' : 'I’m ready to vote'), function () { doSubmit({ t: act.kind }); }, { kind: 'primary big', disabled: locked, id: 'actBtn' }));
  }
  const txt = KIND_TXT[act.kind];
  const chosen = S.sel && S.sel.k === selKey ? S.sel.to : lockedTo;
  const mateSet = {};
  v.mates.forEach(function (m) { mateSet[m.id] = true; });
  const pick = function (id) { S.sel = { k: selKey, to: id }; SFX.click(); render(); };
  const grid = h('div', { class: 'seats' }, players.filter(function (p) { return p.alive; }).map(function (p) {
    return seat(p, { selectable: act.targets.indexOf(p.id) !== -1, selected: chosen === p.id, blocked: act.blocked[p.id], you: p.id === v.me.id, mate: !!mateSet[p.id] && v.me.role === 'mafia', onPick: pick, sub: null });
  }));
  const c = h('section', { class: 'card act ' + act.kind }, h('h2', { text: txt.title }), h('p', { class: 'dim', text: txt.prompt }), grid);
  if (act.skip) {
    c.appendChild(h('button', { type: 'button', class: 'seat skip' + (chosen === 'skip' ? ' sel' : ''), 'data-id': 'skip', 'aria-pressed': chosen === 'skip' ? 'true' : 'false', onclick: function () { pick('skip'); } },
      h('span', { class: 'nm', text: 'Skip. Nobody goes out today.' })));
  }
  const same = locked && chosen === lockedTo;
  const label = !chosen ? 'Pick an option' : same ? 'Locked in' : locked ? 'Change my choice' : txt.btn;
  c.appendChild(btn(label, function () { doSubmit({ t: act.kind, to: chosen }); }, { kind: 'primary big', disabled: !chosen || same, id: 'actBtn' }));
  if (locked && !local) c.appendChild(h('p', { class: 'hint', text: 'Locked in. You can change it until everyone has chosen.' }));
  if (v.me.role === 'mafia' && act.kind === 'kill') {
    const mv = Object.keys(v.mateVotes);
    if (mv.length) c.appendChild(h('ul', { class: 'plain mates' }, mv.map(function (id) {
      const m = v.mates.find(function (x) { return x.id === id; });
      return h('li', {}, (m ? m.name : 'Your partner') + ' wants ', h('strong', { text: nameOf(v.mateVotes[id]) }), '.');
    })));
    if (!local && v.mates.length) c.appendChild(mafiaChat(v));
  }
  return c;
}
function mafiaChat(v) {
  const log = h('div', { class: 'chatlog small', id: 'mchatLog' },
    v.mchat.length ? v.mchat.map(function (m) { return h('div', { class: 'msg' + (m.f === v.me.id ? ' mine' : '') }, h('b', { text: nameOf(m.f) }), ' ', h('span', { text: m.x })); })
      : h('p', { class: 'hint', text: 'Only your family can read this. Agree on a target.' }));
  const input = h('input', { id: 'mchatIn', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Whisper to the family…', 'aria-label': 'Mafia whisper' });
  const form = h('form', { class: 'chatform', onsubmit: function (e) { e.preventDefault(); const t = input.value; input.value = ''; Net.mchat(t); } },
    input, h('button', { class: 'btn', type: 'submit', id: 'mchatSend' }, 'Whisper'));
  setTimeout(function () { const el = document.getElementById('mchatLog'); if (el) el.scrollTop = el.scrollHeight; }, 0);
  return h('div', { class: 'mchat' }, h('h3', { text: 'Family whisper' }), log, form);
}
function newsCard(pub) {
  const log = pub.log || [];
  const latest = log.slice(-4);
  const kids = [h('h3', { text: 'Town news' })];
  if (!latest.length) kids.push(h('p', { class: 'dim', text: 'The first night begins. Nobody has been hurt yet.' }));
  else kids.push(h('ul', { class: 'plain news' }, latest.map(function (e) { return h('li', { class: 'lg ' + e.ph, text: e.x }); })));
  const b = pub.ballot;
  if (b && ((pub.phase === 'night' && b.r === pub.round - 1) || pub.phase === 'over')) {
    kids.push(h('details', { class: 'ballot', id: 'ballotD' }, h('summary', { text: 'How everyone voted on day ' + b.r }),
      h('ul', { class: 'plain' }, b.rows.map(function (w) { return h('li', {}, h('strong', { text: nameOf(w.from) }), ' → ', w.to === 'skip' ? 'skip' : w.to === null ? 'no vote' : nameOf(w.to)); }))));
  }
  if (log.length > 4) kids.push(h('details', { class: 'history', id: 'histD' }, h('summary', { text: 'Full history' }),
    h('ul', { class: 'plain news' }, log.map(function (e) { return h('li', { class: 'lg ' + e.ph, text: e.x }); }))));
  return card(kids);
}
function seatsCard(pub, v) {
  const mates = {};
  if (v && v.me && v.me.role === 'mafia') v.mates.forEach(function (m) { mates[m.id] = true; });
  const pend = {};
  (pub.pending || []).forEach(function (id) { pend[id] = true; });
  return card(h('h3', { text: 'The table' }), h('div', { class: 'seats' }, pub.players.map(function (p) {
    return seat(p, { you: p.id === S.me, host: p.id === pub.hostId, mate: !!mates[p.id], pending: !!pend[p.id] && p.alive });
  })));
}

/* ---------- table rules ---------- */
const NIGHT_OPTS = [[0, 'No limit'], [60, '1 min'], [90, '1.5 min'], [120, '2 min']];
const DISC_OPTS = [[0, 'No limit'], [120, '2 min'], [180, '3 min'], [300, '5 min']];
const VOTE_OPTS = [[0, 'No limit'], [45, '45 sec'], [60, '1 min'], [90, '1.5 min']];
function seg(label, id, options, value, onPick) {
  return h('div', { class: 'field', id: id }, h('span', { class: 'lbl', text: label }),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(function (o) {
      const on = String(o[0]) === String(value);
      return h('button', { type: 'button', class: 'segb' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-v': String(o[0]), onclick: function () { onPick(o[0]); } }, o[1]);
    })));
}
function toggle(id, label, desc, on, onPick) {
  return h('button', { type: 'button', id: id, class: 'toggle' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: function () { onPick(!on); } },
    h('span', { class: 'tk' }), h('span', { class: 'tl' }, label, h('small', { text: desc })));
}
function timeSel(id, label, val, opts, onPick) {
  return h('label', { class: 'field', for: id }, h('span', { class: 'lbl', text: label }),
    h('select', { id: id, onchange: function (e) { onPick(Number(e.target.value)); } }, opts.map(function (o) { return h('option', { value: String(o[0]), selected: o[0] === val }, o[1]); })));
}
function configPanel(cfg, n, change, timers) {
  const pv = rolePreview(n, cfg);
  return card(h('h3', { text: 'Table rules' }),
    seg('Mafia members', 'cfgMafia', [['auto', 'Auto'], [1, '1'], [2, '2']], cfg.mafia, function (v) { change({ mafia: v }); }),
    h('div', { class: 'toggles' },
      toggle('cfgDoctor', 'Doctor', 'Protects one player each night', cfg.doctor, function (v) { change({ doctor: v }); }),
      toggle('cfgPolice', 'Police', 'Investigates one player each night', cfg.police, function (v) { change({ police: v }); }),
      toggle('cfgPrank', 'Prankster', 'Blocks one player’s night action', cfg.prankster, function (v) { change({ prankster: v }); })),
    seg('When someone is out, reveal', 'cfgReveal', [['role', 'Their role'], ['team', 'Their side'], ['none', 'Nothing']], cfg.reveal, function (v) { change({ reveal: v }); }),
    timers ? h('div', { class: 'timesel' },
      timeSel('cfgNight', 'Night limit', cfg.nightSecs, NIGHT_OPTS, function (v) { change({ nightSecs: v }); }),
      timeSel('cfgDisc', 'Talk limit', cfg.discussSecs, DISC_OPTS, function (v) { change({ discussSecs: v }); }),
      timeSel('cfgVote', 'Vote limit', cfg.voteSecs, VOTE_OPTS, function (v) { change({ voteSecs: v }); })) : null,
    h('p', { class: 'preview', id: 'rolePreview', text: pv.text }),
    pv.notes.map(function (t) { return h('p', { class: 'hint', text: t }); }));
}
function configSummary(cfg, n) {
  const pv = rolePreview(n, cfg);
  const lim = [];
  if (cfg.nightSecs) lim.push('night ' + mmss(cfg.nightSecs * 1000));
  if (cfg.discussSecs) lim.push('talk ' + mmss(cfg.discussSecs * 1000));
  if (cfg.voteSecs) lim.push('vote ' + mmss(cfg.voteSecs * 1000));
  return card(h('h3', { text: 'Table rules' }), h('p', { class: 'preview', id: 'rolePreview', text: pv.text }),
    h('p', { class: 'dim', text: 'When someone is out, everyone learns ' + (cfg.reveal === 'role' ? 'their role' : cfg.reveal === 'team' ? 'which side they were on' : 'nothing about them') + '.' }),
    lim.length ? h('p', { class: 'dim', text: 'Time limits: ' + lim.join(', ') + '.' }) : null);
}
function howCard() {
  return h('details', { class: 'card how', id: 'howD' }, h('summary', { text: 'How to play' }),
    HOW.map(function (r) { return h('div', { class: 'howrow' }, h('h4', { text: r[0] }), h('p', { text: r[1] })); }));
}

/* ================= home ================= */
function hero() {
  return h('header', { class: 'hero' },
    h('p', { class: 'eyebrow kicker', text: 'A party game of lies · 4–8 players' }),
    h('h1', { class: 'brand-big' }, 'Mafia', h('span', { class: 'dot', text: '.' })),
    h('p', { class: 'tagline', text: 'Everyone gets a secret role on their own phone. By night the Mafia strikes. By day the town hunts them down.' }));
}
function savedHost() {
  const s = storeJSON('host');
  if (!s || !s.room || !s.savedAt || Date.now() - s.savedAt > 24 * 3600 * 1000) return null;
  return s;
}
function homeScreen() {
  const nodes = [hero()];
  const invited = S.joinCode && S.joinCode.length === 4;
  const sh = savedHost();
  const lastRoom = store('lastRoom');
  if (sh) {
    nodes.push(h('section', { class: 'card resume' }, h('h3', { text: 'Game in progress' }),
      h('p', {}, 'You were hosting room ', h('strong', { class: 'code-inline', text: sh.room }), '.'),
      h('div', { class: 'row' }, btn('Resume hosting', function () { hostResume(sh); }, { kind: 'primary', id: 'resumeHost' }),
        confirmBtn('discard', 'Discard', 'Confirm: end that room', function () { storeJSON('host', null); render(); }, 'ghost'))));
  } else if (lastRoom && !invited && store('tok.' + lastRoom) && S.name) {
    nodes.push(h('section', { class: 'card resume' }, h('h3', { text: 'Recent room' }),
      h('p', {}, 'Jump back into room ', h('strong', { class: 'code-inline', text: lastRoom }), ' as ' + S.name + '.'),
      h('div', { class: 'row' }, btn('Rejoin', function () { clientJoin(lastRoom, S.name, S.av); }, { kind: 'primary', id: 'rejoinBtn' }),
        btn('Forget it', function () { store('lastRoom', null); render(); }, { kind: 'ghost', id: 'forgetRoom' }))));
  }
  const nameIn = h('input', { id: 'nameIn', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name,
    oninput: function (e) { S.name = e.target.value; } });
  const who = h('section', { class: 'card who' }, h('h2', { text: invited ? 'You’re invited to room ' + S.joinCode : 'Who are you?' }),
    h('label', { class: 'lbl', for: 'nameIn', text: 'Name' }), nameIn,
    h('span', { class: 'lbl', text: 'Pick a face' }),
    avatarPicker('avPick', S.av, null, function (a) { S.av = a; store('av', a); render(); }));
  nodes.push(who);
  const need = function () {
    const nm = cleanName(S.name);
    if (!nm) { setErr('Type your name first.'); const el = document.getElementById('nameIn'); if (el) el.focus(); return null; }
    S.err = '';
    if (!S.av) { S.av = AVATARS[hash(nm) % AVATARS.length]; store('av', S.av); }
    store('name', nm);
    return nm;
  };
  const codeIn = h('input', { id: 'codeIn', type: 'text', inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', maxlength: '4', placeholder: 'ABCD', 'aria-label': 'Room code', class: 'codein', value: S.joinCode,
    oninput: function (e) { const c = cleanCode(e.target.value); S.joinCode = c; if (e.target.value !== c) e.target.value = c; } });
  const joinForm = h('form', { class: 'joinrow', id: 'joinForm', onsubmit: function (e) {
    e.preventDefault();
    const nm = need(); if (!nm) return;
    const c = cleanCode(S.joinCode);
    if (c.length !== 4) { setErr('Room codes have 4 letters.'); return; }
    clientJoin(c, nm, S.av);
  } }, codeIn, h('button', { class: 'btn primary', type: 'submit', id: 'joinBtn' }, 'Join room'));
  const create = btn('Create a new room', function () { const nm = need(); if (!nm) return; hostCreate(nm, S.av); }, { kind: invited ? 'ghost' : 'primary big', id: 'createBtn' });
  if (invited) nodes.push(card(h('h3', { text: 'Join room' }), joinForm, h('p', { class: 'hint', text: 'Or start your own:' }), create));
  else nodes.push(card(h('h3', { text: 'Play online' }), create, h('div', { class: 'or' }, h('span', { text: 'or join friends' })), joinForm));
  nodes.push(card(h('h3', { text: 'All around one phone' }),
    h('p', { class: 'dim', text: 'No internet needed. Pass one device around the table and everyone takes a private turn.' }),
    btn('Play on one device', function () { enterLocal(false); }, { kind: 'ghost', id: 'localBtn' }),
    storeJSON('local') && storeJSON('local').st ? btn('Resume one-device game', function () { enterLocal(true); }, { kind: 'ghost', id: 'resumeLocal' }) : null));
  nodes.push(howCard());
  return nodes;
}

/* ================= room: lobby ================= */
function joinUrl() { return location.origin + location.pathname + '#' + S.room; }
function copyLink() {
  const url = joinUrl();
  const done = function () { toast('Link copied. Send it to your friends.'); };
  try { navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); }); } catch (e) { fallbackCopy(url); }
}
function fallbackCopy(url) {
  const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0;left:0' });
  ta.value = url; document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  toast(ok ? 'Link copied. Send it to your friends.' : 'Copy this link: ' + url);
}
function shareLink() {
  const data = { title: 'Mafia', text: 'Join my Mafia game. Room code ' + S.room, url: joinUrl() };
  navigator.share(data).catch(function () { /* cancelled */ });
}
function qrSvg(text) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { return ''; }
}
function roomCard(big) {
  const code = S.room;
  const letters = h('div', { class: 'code', id: 'roomCode', 'aria-label': 'Room code ' + code.split('').join(' ') }, code.split('').map(function (c) { return h('span', { text: c }); }));
  const svg = qrSvg(joinUrl());
  return h('section', { class: 'card roomcard' + (big ? ' big' : '') },
    h('div', { class: 'roomtop' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Room code' }), letters,
        h('p', { class: 'hint', text: 'Friends open this page and enter the code, scan the QR code, or tap your link.' }),
        h('div', { class: 'row' },
          btn('Copy invite link', copyLink, { kind: 'primary', id: 'copyBtn', icon: 'copy' }),
          navigator.share ? btn('Share', shareLink, { kind: 'ghost', id: 'shareBtn', icon: 'share' }) : null)),
      svg ? h('div', { class: 'qr', id: 'qr', html: svg, 'aria-label': 'QR code to join room ' + code, role: 'img' }) : null));
}
function lobbyScreen() {
  const pub = S.pub, roster = rosterOf(), host = amHost();
  const n = roster.length;
  const seated = !!S.me;
  const nodes = [roomCard(true)];
  const seats = roster.map(function (r) {
    return h('div', { class: 'seatwrap' },
      seat({ id: r.id, name: r.name, alive: true }, { you: r.id === S.me, host: r.id === pub.hostId }),
      host && r.id !== S.me ? h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + r.name, 'data-remove': r.id, onclick: function () { hostRemove(r.id); } }, icon('x', 14)) : null);
  });
  for (let i = n; i < MAXP; i++) seats.push(h('div', { class: 'seat empty' }, h('span', { class: 'nm', text: i < MINP ? 'Waiting for a player' : 'Open seat' })));
  const need = MINP - n;
  const seatCard = card(h('div', { class: 'cardhead' }, h('h2', { text: 'The table' }), h('span', { class: 'count', id: 'seatCount', text: n + ' / ' + MAXP })),
    h('p', { class: 'dim', text: need > 0 ? 'Need ' + need + ' more to start.' : 'Ready when you are. More can still join.' }),
    h('div', { class: 'seats' }, seats));
  if (!seated && !host) {
    const taken = {};
    roster.forEach(function (r) { taken[r.av] = true; });
    const nm = h('input', { id: 'sitName', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } });
    seatCard.appendChild(h('div', { class: 'sitbox' }, h('h3', { text: 'Take a seat' }), nm,
      avatarPicker('sitAv', S.av, taken, function (a) { S.av = a; render(); }),
      btn('Sit down', function () { if (!cleanName(S.name)) { setErr('Type your name first.'); return; } Net.sit(S.name, S.av); }, { kind: 'primary', id: 'sitBtn', disabled: n >= MAXP })));
  }
  nodes.push(seatCard);
  if (host) {
    nodes.push(configPanel(pub.cfg, n, hostSetCfg, true));
    nodes.push(card(btn(n < MINP ? 'Need ' + need + ' more player' + (need > 1 ? 's' : '') : 'Deal the roles', function () { SFX.flip(); hostStart(); }, { kind: 'primary big', disabled: n < MINP || n > MAXP, id: 'startBtn' }),
      h('p', { class: 'hint', text: 'Your device runs the game for everyone. Keep this page open and your screen on while you play.' }),
      confirmBtn('close', 'Close room', 'Confirm: close room for everyone', function () { Net.leave(); }, 'ghost')));
  } else {
    nodes.push(configSummary(pub.cfg, n));
    nodes.push(card(h('p', { class: 'dim', id: 'waitHost', text: seated ? 'You’re in. ' + (nameOf(pub.hostId)) + ' deals the roles when everyone is here.' : 'Take a seat to play this game.' }),
      confirmBtn('leave', seated ? 'Leave the table' : 'Leave room', 'Confirm: leave', function () { Net.leave(); }, 'ghost')));
  }
  nodes.push(howCard());
  return nodes;
}

/* ================= room: game ================= */
function hostPanel() {
  const pub = S.pub, active = pub.phase === 'night' || pub.phase === 'discuss' || pub.phase === 'vote';
  const c = card(h('h3', { text: 'Host controls' }));
  if (active) {
    const pend = (pub.pending || []).map(nameOf);
    c.appendChild(h('p', { class: 'small', id: 'hostPending', text: pend.length ? 'Waiting for: ' + pend.join(', ') : 'Everyone has acted.' }));
    c.appendChild(h('div', { class: 'row' }, confirmBtn('skip', 'Skip waiting', 'Confirm: continue now', hostForce, 'ghost')));
    const alive = (pub.players || []).filter(function (p) { return p.alive && p.id !== S.me; });
    c.appendChild(h('div', { class: 'row' },
      h('select', { id: 'rmSel', 'aria-label': 'Remove a player', onchange: function (e) { S.rmSel = e.target.value; render(); } },
        h('option', { value: '' }, 'Remove a player who left…'),
        alive.map(function (p) { return h('option', { value: p.id, selected: S.rmSel === p.id }, p.name); })),
      S.rmSel ? confirmBtn('rm', 'Remove', 'Confirm: remove', function () { const id = S.rmSel; S.rmSel = ''; hostRemove(id); }, 'ghost') : null));
  }
  c.appendChild(h('div', { class: 'row' },
    pub.phase === 'over' ? btn('Play again', function () { hostToLobby(); }, { kind: 'primary', id: 'againBtn' })
      : confirmBtn('end', 'End game, back to lobby', 'Confirm: end game', hostToLobby, 'ghost'),
    confirmBtn('close', 'Close room', 'Confirm: close room', function () { Net.leave(); }, 'ghost')));
  c.appendChild(h('p', { class: 'hint', text: 'Keep this page open. If you reload, the game picks up where it left off.' }));
  return c;
}
function gameScreen() {
  const pub = S.pub, v = S.view;
  const nodes = [banner(pub)];
  if (inGame() && v && v.gameId === pub.gameId) {
    nodes.push(rolePanel(v, false));
    if (!v.me.alive) nodes.push(h('section', { class: 'card ghostcard' }, h('h2', { text: 'You are out' }), h('p', { class: 'dim', text: 'Keep what you know to yourself. Watch the town tear itself apart, and chat with the other ghosts.' })));
    nodes.push(actionPanel(v, pub.players, function (a) { return Net.act(v, a); }, false));
    nodes.push(infoCard(v));
  } else {
    nodes.push(card(h('p', { class: 'dim', id: 'watching', text: 'This game started before you sat down. You are watching; you can join the next one.' })));
  }
  nodes.push(newsCard(pub));
  nodes.push(seatsCard(pub, v));
  if (amHost()) nodes.push(hostPanel());
  else nodes.push(card(confirmBtn('leave', 'Leave room', 'Confirm: leave', function () { Net.leave(); }, 'ghost')));
  return nodes;
}
function resultBanner(pub, myRole) {
  const win = pub.winner;
  let sub = win === 'town' ? 'Every Mafia member is out.' : 'The Mafia now controls the town.';
  if (myRole) sub += ((myRole === 'mafia') === (win === 'mafia')) ? ' You won.' : ' You lost.';
  return h('section', { class: 'banner over ' + win, id: 'banner' },
    h('div', { class: 'bl' }, icon(win === 'town' ? 'police' : 'mafia', 32),
      h('div', {}, h('h1', { class: 'bt', id: 'winner', text: win === 'town' ? 'Town wins' : 'Mafia wins' }), h('p', { class: 'bs', text: sub }))));
}
function rolesReveal(pub) {
  return card(h('h3', { text: 'Who was who' }), h('div', { class: 'seats' }, pub.players.map(function (p) {
    return seat(p, { you: p.id === S.me, extra: 'reveal ' + p.rv, sub: ROLE_TXT[p.rv].title + (p.alive ? '' : ' · out') });
  })));
}
function recapCard(pub) {
  if (!pub.recap || !pub.recap.length) return null;
  return h('details', { class: 'card how', id: 'recapD', open: true }, h('summary', { text: 'What really happened' }),
    h('ul', { class: 'plain news' }, pub.recap.map(function (t) { return h('li', { text: t }); })));
}
function overScreen() {
  const pub = S.pub, v = S.view;
  const myRole = inGame() && v && v.gameId === pub.gameId ? v.me.role : null;
  const nodes = [resultBanner(pub, myRole), rolesReveal(pub), recapCard(pub), newsCard(pub)];
  if (amHost()) nodes.push(hostPanel());
  else nodes.push(card(h('p', { class: 'dim', id: 'waitNew', text: 'Waiting for the host to start another round.' }), confirmBtn('leave', 'Leave room', 'Confirm: leave', function () { Net.leave(); }, 'ghost')));
  return nodes;
}
function roomScreen() {
  if (!S.pub) {
    return [roomCard(false), card(h('p', { class: 'dim', id: 'loading', text: S.conn === 'failed' ? 'Could not join this room.' : 'Connecting to room ' + S.room + '…' }),
      btn('Back', function () { Net.leave(); }, { kind: 'ghost', id: 'backHome' }))];
  }
  if (S.pub.phase === 'lobby') return lobbyScreen();
  if (S.pub.phase === 'over') return overScreen();
  return gameScreen();
}

/* ================= announcements ================= */
function revealLine(rv, cfg) {
  if (cfg.reveal === 'none' || !rv) return 'Their role stays a secret.';
  if (cfg.reveal === 'team') return rv === 'mafia' ? 'They were with the Mafia.' : 'They were on the town’s side.';
  return rv === 'mafia' ? 'They were Mafia.' : 'They were the ' + ROLE_TXT[rv].title + '.';
}
let prevAlive = {};
onSnapshotHook = function () {
  const pub = S.pub;
  const aliveNow = {};
  (pub.players || []).forEach(function (p) { aliveNow[p.id] = p.alive; });
  const before = prevAlive;
  prevAlive = aliveNow;
  const key = pub.gameId + ':' + pub.key;
  if (pub.phase === 'lobby') { S.lastKey = key; S.lastGame = ''; return; }
  if (S.lastGame !== pub.gameId) {
    S.lastGame = pub.gameId; S.lastKey = key;
    if (S.view && pub.phase !== 'over' && store('seenRole') !== pub.gameId) { S.overlay = { kind: 'role', flipped: false }; }
    return;
  }
  if (key === S.lastKey) return;
  S.lastKey = key;
  const newlyDead = (pub.players || []).filter(function (p) { return before[p.id] === true && !p.alive; });
  const meDied = newlyDead.some(function (p) { return p.id === S.me; });
  if (pub.phase === 'discuss') {
    const d = newlyDead[0];
    if (d) {
      S.overlay = { kind: 'death', id: d.id, eyebrow: 'Dawn of day ' + pub.round, title: d.id === S.me ? 'You were killed' : d.name, line: d.id === S.me ? 'The Mafia came for you in the night. You can still watch, and talk with other ghosts.' : d.name + ' ' + pickLine(DEATH_LINES, pub.gameId + d.id), sub: d.id === S.me ? '' : revealLine(d.rv, pub.cfg), auto: 8000 };
      SFX.kill(); if (meDied) buzz([200, 100, 300]);
    } else {
      S.overlay = { kind: 'calm', eyebrow: 'Dawn of day ' + pub.round, title: 'Everyone survived', line: pickLine(SAVED_LINES, pub.gameId + pub.round), auto: 6000 };
      SFX.day();
    }
  } else if (pub.phase === 'vote') {
    SFX.vote();
  } else if (pub.phase === 'night') {
    const b = pub.ballot;
    if (b && b.r === pub.round - 1) {
      if (b.outcome === 'lynch') {
        const p = pubPlayer(b.lynched);
        S.overlay = { kind: 'vote', id: b.lynched, eyebrow: 'The town has spoken', title: b.lynched === S.me ? 'You were voted out' : (p ? p.name : 'Someone') + ' is out', line: b.lynched === S.me ? 'The town turned on you. You can still watch, and talk with other ghosts.' : revealLine(p && p.rv, pub.cfg), sub: 'Night ' + pub.round + ' falls…', auto: 8000 };
        if (meDied) buzz([200, 100, 300]);
      } else {
        S.overlay = { kind: 'calm', eyebrow: 'The town has spoken', title: 'Nobody is voted out', line: b.outcome === 'tie' ? 'The vote was tied.' : 'The town chose to wait.', sub: 'Night ' + pub.round + ' falls…', auto: 6000 };
      }
    }
    SFX.night();
  } else if (pub.phase === 'over') {
    const myRole = S.view && S.view.me ? S.view.me.role : null;
    const won = myRole ? ((myRole === 'mafia') === (pub.winner === 'mafia')) : null;
    const last = (pub.log || []).filter(function (e) { return e.ph !== 'E'; }).slice(-1)[0];
    S.overlay = { kind: 'over', win: pub.winner, eyebrow: last ? last.x : 'Game over', title: pub.winner === 'town' ? 'Town wins' : 'Mafia wins', line: won === null ? '' : won ? 'You won.' : 'You lost.' };
    if (won === false) SFX.lose(); else SFX.win();
  }
};
let overlayTimer = null;
function closeOverlay() { clearTimeout(overlayTimer); overlayTimer = null; S.overlay = null; render(); }
let overlayDrawn = null, overlayDrawnFlip = null;
function renderOverlay() {
  const o = S.overlay;
  if (o === overlayDrawn && (!o || o.flipped === overlayDrawnFlip)) return;   // unchanged: keep the DOM (and its animation) as is
  overlayDrawn = o; overlayDrawnFlip = o ? o.flipped : null;
  clear(overlayEl);
  overlayEl.hidden = !o;
  overlayEl.className = 'overlay' + (o ? ' ' + o.kind + (o.win ? ' ' + o.win : '') : '');
  if (!o) return;
  if (o.kind === 'role') {
    const v = S.view;
    if (!v || !v.me) { S.overlay = null; overlayEl.hidden = true; return; }
    const r = v.me.role;
    const cardEl = h('button', { type: 'button', class: 'flip' + (o.flipped ? ' flipped' : ''), id: 'flipCard', 'aria-label': o.flipped ? 'Your role: ' + ROLE_TXT[r].title : 'Tap to reveal your role',
      onclick: function () { if (!o.flipped) { o.flipped = true; SFX.flip(); buzz(40); render(); } } },
      h('span', { class: 'face front' }, h('span', { class: 'fmark', text: '?' }), h('span', { class: 'ftxt', text: 'Tap to reveal your role' }), h('span', { class: 'fhint', text: 'Keep your screen hidden' })),
      h('span', { class: 'face back ' + r }, icon(r, 46), h('span', { class: 'frole', text: ROLE_TXT[r].title }), h('span', { class: 'fblurb', text: ROLE_TXT[r].blurb }),
        r === 'mafia' && v.mates.length ? h('span', { class: 'fmates', text: 'Family: ' + v.mates.map(function (m) { return m.name; }).join(', ') }) : null));
    add(overlayEl, h('div', { class: 'ov-inner' }, h('p', { class: 'ov-eyebrow', text: 'The cards are dealt' }), cardEl,
      o.flipped ? btn('Got it. Hide my card', function () { store('seenRole', S.pub ? S.pub.gameId : ''); closeOverlay(); }, { kind: 'primary big', id: 'gotRole' }) : null));
    return;
  }
  add(overlayEl, h('div', { class: 'ov-inner' },
    o.id ? h('div', { class: 'ov-av' }, avatar(o.id, nameOf(o.id), 'xl')) : (o.kind === 'calm' ? icon('sun', 56) : o.kind === 'over' ? icon(o.win === 'town' ? 'police' : 'mafia', 64) : null),
    h('p', { class: 'ov-eyebrow', text: o.eyebrow }),
    h('h2', { class: 'ov-title', id: 'ovTitle', text: o.title }),
    o.line ? h('p', { class: 'ov-line', text: o.line }) : null,
    o.sub ? h('p', { class: 'ov-sub', text: o.sub }) : null,
    btn('Continue', closeOverlay, { kind: 'primary', id: 'ovClose' })));
  if (o.auto && !overlayTimer) overlayTimer = setTimeout(function () { overlayTimer = null; if (S.overlay === o) closeOverlay(); }, o.auto);
}

/* ================= one device ================= */
function defaultLocal() { return { stage: 'setup', names: ['', '', '', ''], cfg: E.defaultConfig(), st: null, kind: '', queue: [], i: 0, peek: '' }; }
function persistLocal() { const d = L.data; if (!d || d.stage === 'setup') return; storeJSON('local', d.stage === 'over' ? null : d); }
function enterLocal(resume) {
  S.screen = 'local';
  L.data = resume ? storeJSON('local') : null;
  if (!L.data || !L.data.st) { L.data = defaultLocal(); if (S.name) L.data.names[0] = S.name; }
  render();
}
function exitLocal() { S.screen = 'home'; render(); }
function localLiving() { return L.data.st.players.filter(function (p) { return p.alive; }).map(function (p) { return p.id; }); }
function localBegin(kind) { const d = L.data; d.kind = kind; d.queue = localLiving(); d.i = 0; d.stage = 'handoff'; persistLocal(); render(); }
function localNext() {
  const d = L.data;
  d.i++;
  if (d.i < d.queue.length) { d.stage = 'handoff'; persistLocal(); render(); return; }
  if (d.kind === 'roles') { localBegin('night'); return; }
  E.advance(d.st, secureRng, 0);
  d.stage = d.st.phase === 'over' ? 'over' : d.kind === 'night' ? 'day' : 'result';
  if (d.stage === 'day') { const k = (d.st.log[d.st.log.length - 1] || {}).x || ''; if (/killed/.test(k)) SFX.kill(); else SFX.day(); }
  else if (d.stage === 'over') SFX.win(); else SFX.night();
  persistLocal(); render();
}
function localStart() {
  const d = L.data;
  const players = d.names.map(function (nm, i) { return { id: 'L' + i, name: cleanName(nm) || 'Player ' + (i + 1) }; });
  d.st = E.newGame({ gameId: 'local' + randId(6), players: players, cfg: d.cfg, rng: secureRng, now: 0 });
  d.kind = 'roles'; d.queue = players.map(function (p) { return p.id; }); d.i = 0; d.stage = 'handoff';
  SFX.flip(); persistLocal(); render();
}
function localPub() { return E.publicView(L.data.st); }
function localSetup() {
  const d = L.data, n = d.names.length;
  return [
    h('header', { class: 'hero small' }, h('h1', { class: 'brand-big' }, 'Mafia', h('span', { class: 'dot', text: '.' })), h('p', { class: 'tagline', text: 'One device, passed around the table.' })),
    card(h('h2', { text: 'Who is playing?' }), h('p', { class: 'dim', text: 'Enter 4 to 8 names in seating order.' }),
      h('div', { class: 'namelist' }, d.names.map(function (nm, i) {
        return h('input', { id: 'ln' + i, type: 'text', maxlength: '16', autocomplete: 'off', placeholder: 'Player ' + (i + 1), 'aria-label': 'Player ' + (i + 1) + ' name', value: nm, oninput: function (e) { d.names[i] = e.target.value; } });
      })),
      h('div', { class: 'row' },
        btn('Add player', function () { if (d.names.length < MAXP) { d.names.push(''); render(); } }, { kind: 'ghost', id: 'addP', disabled: n >= MAXP }),
        btn('Remove last', function () { if (d.names.length > MINP) { d.names.pop(); render(); } }, { kind: 'ghost', id: 'delP', disabled: n <= MINP }))),
    configPanel(d.cfg, n, function (p) { d.cfg = E.normalizeConfig(Object.assign({}, d.cfg, p)); render(); }, false),
    card(btn('Deal the roles', localStart, { kind: 'primary big', id: 'localStart' }), btn('Back', exitLocal, { kind: 'ghost', id: 'localBack' })),
    howCard()];
}
function localHandoff() {
  const d = L.data, who = E.P(d.st, d.queue[d.i]);
  const forRole = d.kind === 'roles';
  return [banner(localPub()), h('section', { class: 'card handoff' },
    h('p', { class: 'eyebrow', text: forRole ? 'Secret role' : d.kind === 'night' ? 'Night action' : 'Vote' }),
    h('h2', { class: 'pass', text: 'Pass the device to' }), h('p', { class: 'passname', id: 'passName', text: who.name }),
    h('p', { class: 'hint', text: 'Make sure nobody else can see the screen.' }),
    btn('I am ' + who.name, function () { d.stage = forRole ? 'role' : 'act'; persistLocal(); render(); }, { kind: 'primary big', id: 'iAm' }))];
}
function localRole() { const d = L.data, v = E.playerView(d.st, d.queue[d.i]); return [rolePanel(v, true), card(btn('Hide and pass on', localNext, { kind: 'primary big', id: 'hideNext' }))]; }
function localAct() {
  const d = L.data, id = d.queue[d.i], v = E.playerView(d.st, id), pub = localPub();
  const submit = function (a) { if (!E.submit(d.st, id, a).ok) { setErr('That choice is not allowed.'); return false; } localNext(); return true; };
  return [banner(pub), h('div', { class: 'rolebar' }, icon(v.me.role, 18), h('span', { text: v.me.name + ' · ' + ROLE_TXT[v.me.role].title })), infoCard(v), actionPanel(v, pub.players, submit, true)];
}
function localDay() {
  const d = L.data, pub = localPub();
  const last = pub.log[pub.log.length - 1];
  return [banner(pub),
    h('section', { class: 'card dawn' }, h('p', { class: 'eyebrow', text: 'Dawn of day ' + pub.round }), h('h2', { id: 'dawnLine', text: last ? last.x : 'Morning comes.' })),
    seatsCard(pub, null),
    card(h('h3', { text: 'Discussion' }), h('p', { class: 'dim', text: 'Talk it over out loud. Anyone with private notes can peek in secret.' }),
      h('div', { class: 'row' }, btn('Peek at my notes', function () { d.stage = 'peekpick'; render(); }, { kind: 'ghost', id: 'peekBtn' }),
        btn('Start the vote', function () { E.advance(d.st, secureRng, 0); SFX.vote(); localBegin('vote'); }, { kind: 'primary', id: 'voteBtn' }))),
    newsCard(pub)];
}
function localPeekPick() {
  const d = L.data;
  return [card(h('h2', { text: 'Who is peeking?' }), h('p', { class: 'dim', text: 'Pick your name, then make sure nobody else is looking.' }),
    h('div', { class: 'seats' }, d.st.players.filter(function (p) { return p.alive; }).map(function (p) { return seat({ id: p.id, name: p.name, alive: true }, { selectable: true, onPick: function (id) { d.peek = id; d.stage = 'peek'; render(); } }); })),
    btn('Back', function () { d.stage = 'day'; render(); }, { kind: 'ghost', id: 'peekBack' }))];
}
function localPeek() {
  const d = L.data, v = E.playerView(d.st, d.peek);
  return [h('div', { class: 'rolebar' }, icon(v.me.role, 18), h('span', { text: v.me.name + ' · ' + ROLE_TXT[v.me.role].title })),
    infoCard(v) || card(h('p', { class: 'dim', text: 'No private notes right now.' })),
    card(btn('Hide', function () { d.peek = ''; d.stage = 'day'; render(); }, { kind: 'primary', id: 'peekDone' }))];
}
function localResult() {
  const d = L.data, pub = localPub(), last = pub.log[pub.log.length - 1];
  return [h('section', { class: 'card dawn' }, h('p', { class: 'eyebrow', text: 'The town has spoken' }), h('h2', { id: 'dawnLine', text: last ? last.x : '' })),
    seatsCard(pub, null), card(btn('Begin night ' + d.st.round, function () { localBegin('night'); }, { kind: 'primary big', id: 'beginNight' })), newsCard(pub)];
}
function localOver() {
  const d = L.data, pub = localPub();
  return [resultBanner(pub, null), rolesReveal(pub), recapCard(pub), newsCard(pub),
    card(h('div', { class: 'row' },
      btn('Play again', function () { const names = d.st.players.map(function (p) { return p.name; }); const cfg = d.cfg; L.data = defaultLocal(); L.data.names = names; L.data.cfg = cfg; storeJSON('local', null); render(); }, { kind: 'primary', id: 'again' }),
      btn('Exit', function () { storeJSON('local', null); exitLocal(); }, { kind: 'ghost', id: 'exitLocal' })))];
}
function localScreen() {
  const d = L.data || (L.data = defaultLocal());
  const map = { setup: localSetup, handoff: localHandoff, role: localRole, act: localAct, day: localDay, peekpick: localPeekPick, peek: localPeek, result: localResult, over: localOver };
  return (map[d.stage] || localSetup)();
}

/* ================= chat dock ================= */
function chatState() {
  if (S.screen !== 'room' || !S.pub || !S.me) return { show: false };
  const pub = S.pub;
  if (pub.phase === 'lobby') return { show: true, ok: true };
  const me = pubPlayer(S.me);
  if (!me) return { show: false };
  if (pub.phase === 'over') return { show: true, ok: true };
  if (!me.alive) return { show: true, ok: true, ghost: true };
  if (pub.phase === 'night') return { show: true, ok: false, why: 'Silence. The town is asleep.' };
  return { show: true, ok: true };
}
renderDock = function () {
  const c = chatState();
  dockEl.hidden = !c.show;
  if (!c.show) return;
  const near = chatLogEl.scrollHeight - chatLogEl.scrollTop - chatLogEl.clientHeight < 80;
  clear(chatLogEl);
  if (!S.chat.length) chatLogEl.appendChild(h('p', { class: 'hint', text: S.pub.phase === 'lobby' ? 'Say hi while everyone joins.' : 'No messages yet.' }));
  S.chat.forEach(function (m) {
    chatLogEl.appendChild(h('div', { class: 'msg' + (m.f === S.me ? ' mine' : '') + (m.g ? ' ghost' : '') },
      h('span', { class: 'mav', text: avOf(m.f) || '' }), h('b', { text: nameOf(m.f) }), ' ', h('span', { text: m.x })));
  });
  if (near) chatLogEl.scrollTop = chatLogEl.scrollHeight;
  dockTitle.textContent = c.ghost ? 'Ghost chat' : 'Table talk';
  chatIn.disabled = !c.ok;
  chatIn.placeholder = c.ok ? (c.ghost ? 'Only ghosts can read this…' : 'Say something…') : 'Chat is closed at night';
  document.getElementById('chatSend').disabled = !c.ok;
  chatHint.textContent = c.ok ? (c.ghost ? 'Living players cannot see ghost messages.' : '') : (c.why || '');
};
function buildDock() {
  dockTitle = h('h2', { id: 'dockTitle', text: 'Table talk' });
  chatLogEl = h('div', { class: 'chatlog', id: 'chatLog', 'aria-live': 'polite' });
  chatIn = h('input', { id: 'chatIn', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Say something…', 'aria-label': 'Message' });
  chatHint = h('p', { class: 'hint', id: 'chatHint' });
  const form = h('form', { class: 'chatform', id: 'chatForm' }, chatIn, h('button', { class: 'btn primary', type: 'submit', id: 'chatSend' }, 'Send'));
  form.addEventListener('submit', function (e) { e.preventDefault(); const c = chatState(); if (!c.show || !c.ok) return; const t = chatIn.value; chatIn.value = ''; Net.chat(t); });
  dockEl = h('aside', { class: 'card dock', id: 'dock', hidden: true }, dockTitle, chatLogEl, form, chatHint);
}

/* ================= shell ================= */
function setTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
function cycleTheme() { const cur = store('theme') || ''; const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : ''; store('theme', next || null); setTheme(next); render(); }
function renderHeader() {
  clear(hdrEl);
  const theme = store('theme') || '';
  let chip = '';
  if (S.screen === 'local') chip = 'One device';
  else if (S.screen === 'room' && S.pub) chip = S.pub.phase === 'lobby' ? 'Room ' + S.room : S.pub.phase === 'over' ? 'Game over' : (S.pub.phase === 'night' ? 'Night ' : 'Day ') + S.pub.round + ' · ' + S.room;
  add(hdrEl,
    h('button', { type: 'button', class: 'hbrand', 'aria-label': 'Mafia home', onclick: function () { if (S.screen === 'local') exitLocal(); } }, icon('mafia', 22), h('span', { class: 'logo', text: 'Mafia' })),
    chip ? h('span', { class: 'chip', id: 'chip', text: chip }) : null,
    h('div', { class: 'htools' },
      S.screen === 'local' ? btn('Leave', exitLocal, { kind: 'ghost small', id: 'leaveLocal' }) : null,
      h('button', { type: 'button', class: 'iconbtn', id: 'soundBtn', 'aria-label': S.sound ? 'Mute sound' : 'Turn sound on', 'aria-pressed': S.sound ? 'true' : 'false',
        onclick: function () { S.sound = !S.sound; store('sound', S.sound ? '1' : '0'); if (S.sound) SFX.click(); render(); } }, icon(S.sound ? 'vol' : 'mute')),
      h('button', { type: 'button', class: 'iconbtn', id: 'themeBtn', 'aria-label': 'Theme: ' + (theme || 'system'), title: 'Theme: ' + (theme || 'system'), onclick: cycleTheme }, icon('theme'))));
}
function renderConn() {
  clear(connEl);
  let show = false;
  if (S.screen === 'room') {
    if (S.conn === 'failed') {
      show = true;
      add(connEl, h('div', { class: 'connbar bad', role: 'alert' }, icon('wifi', 18), h('span', { class: 'ctext', text: S.connMsg || 'Disconnected.' }),
        S.isHost ? null : btn('Try again', clientRetryNow, { kind: 'small', id: 'retryBtn' }),
        btn('Home', function () { Net.leave(); }, { kind: 'ghost small', id: 'homeBtn' })));
    } else if (S.conn !== 'open' || S.connMsg) {
      show = true;
      add(connEl, h('div', { class: 'connbar', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'ctext', text: S.connMsg || (S.isHost ? 'Opening room ' + S.room + '…' : 'Connecting…') })));
    }
  }
  connEl.hidden = !show;
}
function screen() {
  if (S.screen === 'local') return localScreen();
  if (S.screen === 'room') return roomScreen();
  return homeScreen();
}
function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.id || !(a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') || a === chatIn) return null;
  return { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd };
}
function restoreFocus(k) {
  if (!k) return;
  const el = document.getElementById(k.id);
  if (!el) return;
  if (el.tagName !== 'SELECT' && el.value !== k.v) el.value = k.v;
  try { el.focus({ preventScroll: true }); if (k.s !== null && k.s !== undefined && el.setSelectionRange) el.setSelectionRange(k.s, k.e); } catch (e) { /* not selectable */ }
}
function phaseAttr() {
  let night = false;
  if (S.screen === 'room' && S.pub && S.pub.phase === 'night') night = true;
  if (S.screen === 'local' && L.data && L.data.st && L.data.st.phase === 'night' && L.data.stage !== 'setup') night = true;
  if (night) document.documentElement.setAttribute('data-phase', 'night'); else document.documentElement.removeAttribute('data-phase');
}
let wakeLock = null;
function syncWake() {
  const want = S.screen === 'room' && !!S.pub && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }, function () { /* not granted */ });
    } else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { /* optional */ }
}
function tickTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  const pub = S.pub;
  if (!pub || !pub.dl) { el.textContent = ''; return; }
  const rem = pub.dl - Date.now();
  el.textContent = rem > 0 ? mmss(rem) : '0:00';
  el.classList.toggle('low', rem < 15000);
}

render = function () {
  if (!root) return;
  const keep = captureFocus();
  phaseAttr();
  renderHeader();
  renderConn();
  clear(mainEl);
  if (S.err) mainEl.appendChild(h('div', { class: 'err', role: 'alert', id: 'errBar' }, h('span', { text: S.err }),
    h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { S.err = ''; render(); } }, icon('x', 16))));
  screen().forEach(function (n) { add(mainEl, n); });
  mainEl.querySelectorAll('details[id]').forEach(function (d) {
    if (Object.prototype.hasOwnProperty.call(OPEN, d.id)) d.open = OPEN[d.id];
    d.addEventListener('toggle', function () { OPEN[d.id] = d.open; });
  });
  renderDock();
  renderOverlay();
  toastEl.hidden = !S.toast; toastEl.textContent = S.toast;
  restoreFocus(keep);
  tickTimer();
  syncWake();
};

function boot() {
  root = document.getElementById('app');
  const t = store('theme');
  if (t === 'light' || t === 'dark') setTheme(t);
  hdrEl = h('header', { class: 'hdr', id: 'hdr' });
  connEl = h('div', { class: 'connwrap', id: 'conn', hidden: true });
  mainEl = h('main', { class: 'main', id: 'main' });
  overlayEl = h('div', { class: 'overlay', id: 'overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ovTitle' });
  toastEl = h('div', { class: 'toast', id: 'toast', role: 'status', hidden: true });
  buildDock();
  add(root, hdrEl, connEl, h('div', { class: 'cols' }, mainEl, h('div', { class: 'side' }, dockEl)));
  document.body.appendChild(overlayEl);
  document.body.appendChild(toastEl);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.overlay && S.overlay.kind !== 'role') closeOverlay(); });
  document.addEventListener('visibilitychange', function () {
    syncWake();
    if (document.visibilityState !== 'visible' || S.screen !== 'room') return;
    if (S.isHost && H.peer && H.peer.disconnected && !H.peer.destroyed) { try { H.peer.reconnect(); } catch (e) { hostStartPeer(); } }
    if (!S.isHost && S.conn !== 'open' && S.conn !== 'failed') clientRetry(100);
  });
  window.addEventListener('pagehide', function () { if (S.isHost && H.room) hostSave(true); });
  window.addEventListener('hashchange', function () {
    const c = cleanCode(location.hash.slice(1));
    if (S.screen === 'home' && c.length === 4) { S.joinCode = c; render(); }
  });
  setInterval(tickTimer, 500);

  // Where should we land?
  const code = cleanCode(location.hash.slice(1));
  const sh = savedHost();
  if (code.length === 4) {
    if (sh && sh.room === code) { hostResume(sh); return; }
    S.joinCode = code;
    if (store('tok.' + code) && cleanName(S.name)) { clientJoin(code, S.name, S.av); return; }
  }
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
window.__mafia = { S: S, H: H, C: C, L: L, E: E };
