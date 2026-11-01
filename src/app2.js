
/* ================= UI building blocks ================= */
let root, hdrEl, mainEl, dockEl, chatLogEl, chatForm, chatIn, chatHint, dockTitle;

function card() {
  const c = h('section', { class: 'card' });
  for (let i = 0; i < arguments.length; i++) add(c, arguments[i]);
  return c;
}
function btn(label, fn, o) {
  o = o || {};
  return h('button', {
    type: 'button', class: 'btn ' + (o.kind || ''), id: o.id, disabled: o.disabled,
    onclick: function (e) { if (o.disabled) return; fn(e); }
  }, label);
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
function rvLabel(rv) {
  if (!rv) return 'Out';
  if (rv === 'town') return 'Town';
  return ROLE_TXT[rv] ? ROLE_TXT[rv].title : 'Out';
}
function nameIn(players, id) {
  const p = players.find(function (x) { return x.id === id; });
  return p ? p.name : 'Player';
}
function rolePreview(n, cfg) {
  const nn = Math.min(Math.max(n, MINP), MAXP);
  const b = E.buildRoles(nn, cfg);
  const parts = ['mafia', 'doctor', 'police', 'prankster', 'civilian'].filter(function (r) { return b.counts[r]; })
    .map(function (r) { return plural(r, b.counts[r]); });
  return { text: 'With ' + nn + ' players: ' + parts.join(', ') + '.', notes: b.notes };
}

function seat(p, o) {
  o = o || {};
  const dead = p.alive === false;
  const cls = 'seat' + (dead ? ' dead' : '') + (o.selected ? ' sel' : '') + (o.selectable ? ' pick' : '');
  const sub = dead ? h('span', { class: 'sub', text: rvLabel(p.rv) })
    : o.blocked ? h('span', { class: 'sub', text: o.blocked })
    : o.pending ? h('span', { class: 'sub wait', text: 'deciding' }) : null;
  const inner = [
    h('span', { class: 'av', style: '--h:' + hue(p.id), text: (p.name || '?').charAt(0).toUpperCase() }),
    h('span', { class: 'sn' },
      h('span', { class: 'nm', text: p.name }),
      o.you ? h('em', { class: 'tag', text: 'you' }) : null,
      o.mate ? h('em', { class: 'tag ally', text: 'ally' }) : null),
    sub
  ];
  if (o.selectable) {
    return h('button', {
      type: 'button', class: cls, 'data-id': p.id, 'aria-pressed': o.selected ? 'true' : 'false',
      onclick: function () { o.onPick(p.id); }
    }, inner);
  }
  return h('div', { class: cls, 'data-id': p.id }, inner);
}

/* ================= shared game panels ================= */
function banner(pub) {
  const night = pub.phase === 'night';
  const over = pub.phase === 'over';
  const title = over ? 'Game over'
    : night ? 'Night ' + pub.round
    : 'Day ' + pub.round + (pub.phase === 'discuss' ? ' · Discussion' : ' · Vote');
  const sub = over ? ''
    : night ? 'The town sleeps. Everyone acts in secret.'
    : pub.phase === 'discuss' ? 'Talk it over. Move to the vote when everyone is ready.'
    : 'Vote someone out, or skip.';
  const pend = (pub.pending || []).map(function (id) { return nameOf(id); });
  const waiting = pend.length ? 'Waiting for ' + (pend.length > 4 ? pend.slice(0, 4).join(', ') + ' +' + (pend.length - 4) : pend.join(', ')) : '';
  return h('section', { class: 'banner ' + (night ? 'night' : over ? 'over' : 'day'), id: 'banner' },
    h('div', { class: 'bl' },
      icon(night ? 'moon' : 'sun', 26),
      h('div', {},
        h('h1', { class: 'bt', text: title }),
        sub ? h('p', { class: 'bs', text: sub }) : null,
        !over && waiting ? h('p', { class: 'bw', id: 'waiting', text: waiting }) : null)),
    pub.dl ? h('div', { class: 'timer', id: 'timer', 'aria-label': 'Time left' }) : null);
}

function rolePanel(v, players, local) {
  const r = v.me.role, t = ROLE_TXT[r];
  const open = local ? true : S.roleOpen;
  if (!open) {
    return h('div', { class: 'rolebar' },
      h('span', { class: 'dim', text: 'Your role is hidden' }),
      btn('Show', function () { S.roleOpen = true; render(); }, { kind: 'ghost small', id: 'showRole' }));
  }
  const kids = [
    h('div', { class: 'eyebrow', text: 'Your role' }),
    h('h2', { class: 'rname', text: t.title }),
    h('p', { class: 'rblurb', text: t.blurb })
  ];
  if (r === 'mafia' && v.mates.length) {
    kids.push(h('p', { class: 'allies' }, 'Your ally' + (v.mates.length > 1 ? 's: ' : ': '),
      v.mates.map(function (m, i) { return h('strong', { text: m.name + (m.alive ? '' : ' (out)') + (i < v.mates.length - 1 ? ', ' : '') }); })));
  }
  if (r === 'mafia' && !v.mates.length) kids.push(h('p', { class: 'allies', text: 'You are the only Mafia member.' }));
  if (!local) kids.push(btn('Hide', function () { S.roleOpen = false; render(); }, { kind: 'ghost small', id: 'hideRole' }));
  return h('section', { class: 'card role ' + r, id: 'roleCard' }, icon(r, 40), h('div', { class: 'rbody' }, kids));
}

function infoCard(v, players) {
  const rows = [];
  v.intel.forEach(function (i) {
    rows.push(h('li', {}, 'Night ' + i.r + ': ', h('strong', { text: nameIn(players, i.to) }), i.res === 'mafia' ? ' is Mafia.' : ' is not Mafia.'));
  });
  v.notes.forEach(function (n) { rows.push(h('li', {}, 'Night ' + n.r + ': ' + n.x)); });
  if (!rows.length) return null;
  return card(h('h3', { text: 'Private notes' }), h('ul', { class: 'plain' }, rows));
}

function actionPanel(v, players, submitFn, local) {
  const act = v.act;
  if (!act) {
    if (!v.me.alive) {
      return card(h('h2', { text: 'You are out' }),
        h('p', { class: 'dim', text: local ? 'Pass the device on.' : 'Keep what you know to yourself. You can still chat with the other ghosts below.' }));
    }
    return null;
  }
  const selKey = v.gameId + ':' + v.key + ':' + v.me.id;
  const sent = S.sent && S.sent.k === selKey ? S.sent : null;
  const mine = v.mine;
  const locked = !!(sent || mine);
  const lockedTo = sent ? sent.to : (mine ? mine.to : undefined);
  const doSubmit = function (a) {
    if (!local) { S.sent = { k: selKey, to: a.to }; }
    SFX.click();
    if (!local) render();
    Promise.resolve(submitFn(a)).catch(function (e) { S.sent = null; setErr(e); });
  };

  if (act.kind === 'sleep' || act.kind === 'ready') {
    const isSleep = act.kind === 'sleep';
    const c = card(
      h('h2', { text: isSleep ? 'Close your eyes' : 'Discussion' }),
      h('p', { class: 'dim', text: isSleep
        ? 'You have no night power. Tap below so nobody can tell who does.'
        : 'Talk it over. Tap when you are ready to vote. The vote opens when everyone is ready.' }),
      btn(locked ? (isSleep ? 'Sleeping…' : 'Ready. Waiting for the others…') : (isSleep ? 'Go to sleep' : 'I’m ready to vote'),
        function () { doSubmit({ t: act.kind }); }, { kind: 'primary', disabled: locked, id: 'actBtn' }));
    return c;
  }

  const txt = KIND_TXT[act.kind];
  const chosen = S.sel && S.sel.k === selKey ? S.sel.to : lockedTo;
  const mateSet = {};
  v.mates.forEach(function (m) { mateSet[m.id] = true; });
  const pick = function (id) { S.sel = { k: selKey, to: id }; SFX.click(); render(); };
  const grid = h('div', { class: 'seats' },
    players.filter(function (p) { return p.alive; }).map(function (p) {
      return seat(p, {
        selectable: act.targets.indexOf(p.id) !== -1, selected: chosen === p.id,
        blocked: act.blocked[p.id], you: p.id === v.me.id, mate: !!mateSet[p.id] && v.me.role === 'mafia', onPick: pick
      });
    }));
  const c = card(h('h2', { text: txt.title }), h('p', { class: 'dim', text: txt.prompt }), grid);
  if (act.skip) {
    c.appendChild(h('button', {
      type: 'button', class: 'seat skip' + (chosen === 'skip' ? ' sel' : ''), 'data-id': 'skip',
      'aria-pressed': chosen === 'skip' ? 'true' : 'false', onclick: function () { pick('skip'); }
    }, h('span', { class: 'sn' }, h('span', { class: 'nm', text: 'Skip. Nobody goes out.' }))));
  }
  const same = locked && chosen === lockedTo;
  const label = !chosen ? 'Pick an option' : same ? 'Locked in' : locked ? 'Change choice' : txt.btn;
  c.appendChild(btn(label, function () { doSubmit({ t: act.kind, to: chosen }); }, { kind: 'primary', disabled: !chosen || same, id: 'actBtn' }));
  if (locked && !local) c.appendChild(h('p', { class: 'hint', text: 'Locked in. You can change it until everyone has chosen.' }));
  if (v.me.role === 'mafia' && act.kind === 'kill') {
    const mv = Object.keys(v.mateVotes);
    if (mv.length) {
      c.appendChild(h('ul', { class: 'plain mates' }, mv.map(function (id) {
        const m = v.mates.find(function (x) { return x.id === id; });
        return h('li', {}, (m ? m.name : 'Ally') + ' picked ', h('strong', { text: nameIn(players, v.mateVotes[id]) }), '.');
      })));
    }
    if (!local) c.appendChild(mafiaChat(v));
  }
  return c;
}

function mafiaChat(v) {
  const who = {};
  who[v.me.id] = v.me.name;
  v.mates.forEach(function (m) { who[m.id] = m.name; });
  const log = h('div', { class: 'chatlog small', id: 'mchatLog' },
    v.mchat.length ? v.mchat.map(function (m) { return h('div', { class: 'msg' + (m.f === v.me.id ? ' mine' : '') }, h('b', { text: who[m.f] || 'Ally' }), ' ', h('span', { text: m.x })); })
      : h('p', { class: 'hint', text: 'Only Mafia can read this. Plan tonight’s target.' }));
  const input = h('input', { id: 'mchatIn', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Whisper to your team…', 'aria-label': 'Mafia message' });
  const form = h('form', { class: 'chatform', onsubmit: function (e) { e.preventDefault(); const t = input.value; input.value = ''; sendMafiaChat(t); } },
    input, h('button', { class: 'btn', type: 'submit', id: 'mchatSend', text: 'Send' }));
  return h('div', { class: 'mchat' }, h('h3', { text: 'Mafia whisper' }), log, form);
}

function newsCard(pub) {
  const log = pub.log || [];
  const latest = log.slice(-4);
  const kids = [h('h3', { text: 'Latest news' })];
  if (!latest.length) kids.push(h('p', { class: 'dim', text: 'The first night begins. Nobody has been hurt yet.' }));
  else kids.push(h('ul', { class: 'plain news' }, latest.map(function (e) { return h('li', { class: 'lg ' + e.ph, text: e.x }); })));
  const b = pub.ballot;
  if (b && ((pub.phase === 'night' && b.r === pub.round - 1) || pub.phase === 'over')) {
    kids.push(h('details', { class: 'ballot', id: 'ballotD' },
      h('summary', { text: 'How everyone voted' }),
      h('ul', { class: 'plain' }, b.rows.map(function (w) {
        return h('li', {}, h('strong', { text: nameOf(w.from) }), ' → ', w.to === 'skip' ? 'skip' : w.to === null ? 'no vote' : nameOf(w.to));
      }))));
  }
  if (log.length > 4) {
    kids.push(h('details', { class: 'history', id: 'histD' }, h('summary', { text: 'Full history' }),
      h('ul', { class: 'plain news' }, log.map(function (e) { return h('li', { class: 'lg ' + e.ph, text: e.x }); }))));
  }
  return card(kids);
}

function seatsCard(pub, v) {
  const mates = {};
  if (v && v.me && v.me.role === 'mafia') v.mates.forEach(function (m) { mates[m.id] = true; });
  const pend = {};
  (pub.pending || []).forEach(function (id) { pend[id] = true; });
  return card(h('h3', { text: 'The table' }),
    h('div', { class: 'seats' }, pub.players.map(function (p) {
      return seat(p, { you: p.id === S.me, mate: !!mates[p.id], pending: !!pend[p.id] && p.alive });
    })));
}

/* ================= config panel ================= */
const NIGHT_OPTS = [[0, 'No limit'], [60, '1 min'], [90, '1.5 min'], [120, '2 min']];
const DISC_OPTS = [[0, 'No limit'], [120, '2 min'], [180, '3 min'], [300, '5 min']];
const VOTE_OPTS = [[0, 'No limit'], [45, '45 sec'], [60, '1 min'], [90, '1.5 min']];

function seg(label, id, options, value, onPick) {
  return h('div', { class: 'field', id: id },
    h('span', { class: 'lbl', text: label }),
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
    h('select', { id: id, onchange: function (e) { onPick(Number(e.target.value)); } },
      opts.map(function (o) { return h('option', { value: String(o[0]), selected: o[0] === val }, o[1]); })));
}
function configPanel(cfg, n, change, o) {
  const pv = rolePreview(n, cfg);
  return card(
    h('h3', { text: 'Table rules' }),
    seg('Mafia members', 'cfgMafia', [['auto', 'Auto'], [1, '1'], [2, '2']], cfg.mafia, function (v) { change({ mafia: v }); }),
    h('div', { class: 'toggles' },
      toggle('cfgDoctor', 'Doctor', 'Protects one player each night', cfg.doctor, function (v) { change({ doctor: v }); }),
      toggle('cfgPolice', 'Police', 'Investigates one player each night', cfg.police, function (v) { change({ police: v }); }),
      toggle('cfgPrank', 'Prankster', 'Blocks one player’s night action', cfg.prankster, function (v) { change({ prankster: v }); })),
    seg('When someone is out, reveal', 'cfgReveal', [['role', 'Their role'], ['team', 'Their team'], ['none', 'Nothing']], cfg.reveal, function (v) { change({ reveal: v }); }),
    o.timers ? h('div', { class: 'timesel' },
      timeSel('cfgNight', 'Night limit', cfg.nightSecs, NIGHT_OPTS, function (v) { change({ nightSecs: v }); }),
      timeSel('cfgDisc', 'Discussion limit', cfg.discussSecs, DISC_OPTS, function (v) { change({ discussSecs: v }); }),
      timeSel('cfgVote', 'Voting limit', cfg.voteSecs, VOTE_OPTS, function (v) { change({ voteSecs: v }); })) : null,
    h('p', { class: 'preview', id: 'rolePreview', text: pv.text }),
    pv.notes.map(function (t) { return h('p', { class: 'hint', text: t }); }));
}
function configSummary(cfg, n) {
  const pv = rolePreview(n, cfg);
  const lim = [];
  if (cfg.nightSecs) lim.push('night ' + mmss(cfg.nightSecs * 1000));
  if (cfg.discussSecs) lim.push('discussion ' + mmss(cfg.discussSecs * 1000));
  if (cfg.voteSecs) lim.push('vote ' + mmss(cfg.voteSecs * 1000));
  return card(h('h3', { text: 'Table rules' }),
    h('p', { id: 'rolePreview', text: pv.text }),
    h('p', { class: 'dim', text: 'When someone is out, everyone learns ' + (cfg.reveal === 'role' ? 'their role' : cfg.reveal === 'team' ? 'their team' : 'nothing about them') + '.' }),
    lim.length ? h('p', { class: 'dim', text: 'Time limits: ' + lim.join(', ') + '.' }) : null);
}

/* ================= screens: home / lobby / game / over ================= */
function hero(small) {
  return h('header', { class: 'hero' + (small ? ' small' : '') },
    h('h1', { class: 'brand-big', text: 'Mafia' }),
    h('p', { class: 'tagline', text: 'Hidden roles. One table. Four to eight players.' }));
}
function howCard() {
  return h('details', { class: 'card how', id: 'howD' },
    h('summary', { text: 'How to play' }),
    HOW.map(function (r) { return h('div', { class: 'howrow' }, h('h4', { text: r[0] }), h('p', { text: r[1] })); }));
}
function localEntryCard() {
  const saved = store('local');
  let resumable = false;
  try { const d = saved ? JSON.parse(saved) : null; resumable = !!(d && d.st && d.stage !== 'over' && d.stage !== 'setup'); } catch (e) { resumable = false; }
  return card(h('h3', { text: 'One device' }),
    h('p', { class: 'dim', text: 'Pass a single phone or laptop around the table. Everyone takes a turn in private.' }),
    h('div', { class: 'row' },
      btn('Play on one device', function () { enterLocal(false); }, { kind: S.online && S.pub ? 'ghost' : 'primary', id: 'localBtn' }),
      resumable ? btn('Resume saved game', function () { enterLocal(true); }, { kind: 'ghost', id: 'resumeBtn' }) : null));
}
function homeScreen() {
  const nodes = [hero(false)];
  if (!S.online) {
    nodes.push(card(h('h2', { text: 'Online tables need claude.ai' }),
      h('p', { class: 'dim', text: 'Open this page in claude.ai while signed in to host or join a live table. You can still play on one device.' })));
  } else if (!S.pubLoaded) {
    nodes.push(card(h('p', { class: 'dim', text: 'Looking for a table…' })));
  } else if (!S.pub) {
    nodes.push(card(h('h2', { text: 'No table is open' }),
      S.canEdit
        ? [h('p', { class: 'dim', text: 'Open a table, then share this page’s link with your players. Give them contributor access so they can sit down.' }),
           btn('Open a table', function () { hostOpenLobby(false); }, { kind: 'primary', id: 'openTable' })]
        : h('p', { class: 'dim', text: 'The host has not opened a table yet. This page updates on its own when they do.' })));
  }
  nodes.push(localEntryCard());
  nodes.push(howCard());
  return nodes;
}

function lobbyScreen() {
  const pub = S.pub, roster = S.roster, host = isHost();
  const n = roster.length;
  const inRoster = roster.some(function (r) { return r.id === S.me; });
  const nodes = [h('header', { class: 'hero small' },
    h('h1', { class: 'brand-big', text: 'Mafia' }),
    h('p', { class: 'tagline', text: host ? 'You are hosting this table.' : (pub.hostName ? 'Hosted by ' + pub.hostName + '.' : 'Waiting for the host to deal the roles.') }))];

  const seats = [];
  roster.forEach(function (r) {
    seats.push(h('div', { class: 'seatwrap' },
      seat({ id: r.id, name: r.name, alive: true }, { you: r.id === S.me }),
      host && r.id !== S.me ? h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + r.name, 'data-remove': r.id, onclick: function () { hostRemove(r.id); } }, icon('x', 14)) : null));
  });
  for (let i = n; i < MAXP; i++) seats.push(h('div', { class: 'seat empty' }, h('span', { class: 'nm', text: 'Open seat' })));
  const countText = n + ' of ' + MAXP + ' seated' + (n < MINP ? ' · need ' + (MINP - n) + ' more' : n > MAXP ? ' · too many' : '');
  const seatCard = card(h('h2', { text: 'Seats' }), h('p', { class: 'dim', id: 'seatCount', text: countText }), h('div', { class: 'seats' }, seats));
  if (!inRoster) {
    seatCard.appendChild(h('form', { class: 'joinrow', onsubmit: function (e) { e.preventDefault(); joinTable(S.nameDraft); } },
      h('input', { id: 'nameIn', type: 'text', maxlength: '16', autocomplete: 'off', placeholder: 'Your name', 'aria-label': 'Your name', value: S.nameDraft, oninput: function (e) { S.nameDraft = e.target.value; } }),
      h('button', { class: 'btn primary', type: 'submit', id: 'joinBtn', disabled: n >= MAXP }, 'Take a seat')));
    if (n >= MAXP) seatCard.appendChild(h('p', { class: 'hint', text: 'The table is full.' }));
  } else {
    seatCard.appendChild(btn('Leave table', leaveTable, { kind: 'ghost', id: 'leaveBtn' }));
  }
  nodes.push(seatCard);

  if (host) {
    nodes.push(configPanel(pub.cfg, n, hostSetCfg, { timers: true }));
    const ok = n >= MINP && n <= MAXP;
    nodes.push(card(
      btn(n < MINP ? 'Need ' + (MINP - n) + ' more player' + (MINP - n > 1 ? 's' : '') : n > MAXP ? 'Remove ' + (n - MAXP) + ' player' + (n - MAXP > 1 ? 's' : '') : 'Deal the roles', hostStart, { kind: 'primary', disabled: !ok, id: 'startBtn' }),
      h('p', { class: 'hint', text: 'Share this page’s link. Players need contributor access to sit down. This tab runs the game, so keep it open.' })));
  } else {
    nodes.push(configSummary(pub.cfg, n));
    nodes.push(card(h('p', { class: 'dim', id: 'waitHost', text: inRoster ? 'You are seated. The host will deal the roles when everyone is here.' : 'Take a seat to join this game.' })));
    if (S.canEdit) nodes.push(card(confirmBtn('takeover', 'Host this table instead', 'Confirm: take over hosting', function () { hostOpenLobby(false); }, 'ghost')));
  }
  nodes.push(localEntryCard());
  nodes.push(howCard());
  return nodes;
}

function hostPanel() {
  const pub = S.pub, st = H.state;
  const c = card(h('h3', { text: 'Host controls' }),
    h('p', { class: 'hint', text: 'This browser tab runs the game for everyone. Keep it open.' }));
  const active = pub.phase === 'night' || pub.phase === 'discuss' || pub.phase === 'vote';
  if (S.hostLost && pub.phase !== 'over') {
    c.appendChild(h('p', { class: 'warn', text: 'The saved game data could not be found, so this game cannot continue.' }));
  } else if (active) {
    const pend = (pub.pending || []).map(nameOf);
    c.appendChild(h('p', { class: 'small', id: 'hostPending', text: pend.length ? 'Waiting for: ' + pend.join(', ') : 'Everyone has acted.' }));
    c.appendChild(confirmBtn('skip', 'Skip waiting', 'Confirm: continue now', hostForce, 'ghost'));
    const alive = (pub.players || []).filter(function (p) { return p.alive; });
    c.appendChild(h('div', { class: 'row' },
      h('select', { id: 'rmSel', 'aria-label': 'Remove a player', onchange: function (e) { S.rmSel = e.target.value; render(); } },
        h('option', { value: '' }, 'Remove a player…'),
        alive.map(function (p) { return h('option', { value: p.id, selected: S.rmSel === p.id }, p.name); })),
      S.rmSel ? confirmBtn('rm', 'Remove', 'Confirm: remove', function () { const id = S.rmSel; S.rmSel = ''; hostRemove(id); }, 'ghost') : null));
  }
  c.appendChild(confirmBtn('end', pub.phase === 'over' ? 'New game with the same players' : 'End game and return to the lobby', 'Confirm', function () { hostOpenLobby(true); }, pub.phase === 'over' ? 'primary' : 'ghost'));
  if (st && !st.players.some(function (p) { return p.id === S.me; })) {
    c.appendChild(h('details', { class: 'narrator', id: 'narrD' }, h('summary', { text: 'Narrator view (shows every role)' }),
      h('ul', { class: 'plain' }, st.players.map(function (p) {
        return h('li', {}, h('strong', { text: p.name }), ' – ' + ROLE_TXT[p.role].title + (p.alive ? '' : ' (out)'));
      }))));
  }
  return c;
}

function onlineGameScreen() {
  const pub = S.pub, v = S.view;
  const meIn = inGame();
  const nodes = [banner(pub)];
  if (meIn) {
    if (S.roleSeenFor !== pub.gameId) { S.roleSeenFor = pub.gameId; S.roleOpen = true; }
    const synced = v && v.gameId === pub.gameId && v.key === pub.key;
    if (!synced) nodes.push(card(h('p', { class: 'dim', id: 'syncing', text: 'Syncing with the host…' })));
    else {
      nodes.push(rolePanel(v, pub.players, false));
      nodes.push(actionPanel(v, pub.players, function (a) { return sendAction(v, a); }, false));
      nodes.push(infoCard(v, pub.players));
    }
  } else {
    nodes.push(card(h('p', { class: 'dim', id: 'watching', text: 'This game is already under way. You are watching.' })));
  }
  nodes.push(newsCard(pub));
  nodes.push(seatsCard(pub, v));
  if (isHost()) nodes.push(hostPanel());
  return nodes;
}

function resultCard(pub, myRole) {
  const win = pub.winner;
  let line = win === 'town' ? 'Town wins' : 'Mafia wins';
  let sub = win === 'town' ? 'Every Mafia member is out.' : 'The Mafia now matches the town.';
  if (myRole) {
    const mine = (myRole === 'mafia') === (win === 'mafia');
    sub += mine ? ' You won.' : ' You lost.';
  }
  return h('section', { class: 'banner over ' + win, id: 'banner' },
    h('div', { class: 'bl' }, icon(win === 'town' ? 'police' : 'mafia', 30),
      h('div', {}, h('h1', { class: 'bt', id: 'winner', text: line }), h('p', { class: 'bs', text: sub }))));
}
function rolesReveal(pub) {
  return card(h('h3', { text: 'Who was who' }),
    h('div', { class: 'seats' }, pub.players.map(function (p) {
      return h('div', { class: 'seat reveal ' + p.rv + (p.alive ? '' : ' dead'), 'data-id': p.id },
        h('span', { class: 'av', style: '--h:' + hue(p.id), text: p.name.charAt(0).toUpperCase() }),
        h('span', { class: 'sn' }, h('span', { class: 'nm', text: p.name }), p.id === S.me ? h('em', { class: 'tag', text: 'you' }) : null),
        h('span', { class: 'sub', text: ROLE_TXT[p.rv].title + (p.alive ? '' : ' · out') }));
    })));
}
function recapCard(pub) {
  if (!pub.recap || !pub.recap.length) return null;
  return h('details', { class: 'card how', id: 'recapD', open: true },
    h('summary', { text: 'What really happened' }),
    h('ul', { class: 'plain news' }, pub.recap.map(function (t) { return h('li', { text: t }); })));
}
function onlineOverScreen() {
  const pub = S.pub, v = S.view;
  const myRole = inGame() && v && v.gameId === pub.gameId && v.me ? v.me.role : null;
  const nodes = [resultCard(pub, myRole), rolesReveal(pub), recapCard(pub), newsCard(pub)];
  if (isHost()) nodes.push(hostPanel());
  else nodes.push(card(h('p', { class: 'dim', id: 'waitNew', text: 'Waiting for the host to start another game.' })));
  return nodes;
}

function onlineScreen() {
  const pub = S.pub;
  if (pub.phase === 'lobby') return lobbyScreen();
  if (pub.phase === 'over') return onlineOverScreen();
  return onlineGameScreen();
}

/* ================= local pass-and-play ================= */
function defaultLocal() {
  return { stage: 'setup', names: ['', '', '', ''], cfg: E.defaultConfig(), st: null, kind: '', queue: [], i: 0, peek: '' };
}
function persistLocal() {
  const d = L.data;
  if (!d || d.stage === 'setup') return;
  store('local', d.stage === 'over' ? null : JSON.stringify(d));
}
function enterLocal(resume) {
  S.mode = 'local';
  L.data = null;
  if (resume) {
    try { L.data = JSON.parse(store('local')); } catch (e) { L.data = null; }
  }
  if (!L.data || !L.data.st) L.data = defaultLocal();
  render();
}
function exitLocal() { S.mode = 'auto'; render(); }
function localLiving() { return L.data.st.players.filter(function (p) { return p.alive; }).map(function (p) { return p.id; }); }
function localBegin(kind) {
  const d = L.data;
  d.kind = kind; d.queue = localLiving(); d.i = 0; d.stage = 'handoff';
  persistLocal(); render();
}
function localNext() {
  const d = L.data;
  d.i++;
  if (d.i < d.queue.length) { d.stage = 'handoff'; persistLocal(); render(); return; }
  const st = d.st;
  if (d.kind === 'roles') { localBegin('night'); return; }
  E.advance(st, secureRng, 0);
  if (st.phase === 'over') d.stage = 'over';
  else d.stage = d.kind === 'night' ? 'day' : 'result';
  persistLocal(); render();
}
function localStart() {
  const d = L.data;
  const players = d.names.map(function (nm, i) { return { id: 'L' + i, name: cleanName(nm) || 'Player ' + (i + 1) }; });
  if (players.length < MINP || players.length > MAXP) { setErr('Mafia needs ' + MINP + ' to ' + MAXP + ' players.'); return; }
  d.st = E.newGame({ gameId: 'local' + newId(), players: players, cfg: d.cfg, rng: secureRng, now: 0 });
  d.kind = 'roles'; d.queue = players.map(function (p) { return p.id; }); d.i = 0; d.stage = 'handoff';
  persistLocal(); render();
}
function localPlayers() {
  const pv = E.publicView(L.data.st);
  return pv.players;
}
function localBanner() {
  return banner(E.publicView(L.data.st));
}

function localSetup() {
  const d = L.data;
  const n = d.names.length;
  const inputs = h('div', { class: 'namelist' }, d.names.map(function (nm, i) {
    return h('input', { id: 'ln' + i, type: 'text', maxlength: '16', autocomplete: 'off', placeholder: 'Player ' + (i + 1), 'aria-label': 'Player ' + (i + 1) + ' name', value: nm,
      oninput: function (e) { d.names[i] = e.target.value; } });
  }));
  return [
    hero(true),
    card(h('h2', { text: 'Who is playing?' }), h('p', { class: 'dim', text: 'Enter 4 to 8 names. The device will be passed around.' }), inputs,
      h('div', { class: 'row' },
        btn('Add player', function () { if (d.names.length < MAXP) { d.names.push(''); render(); } }, { kind: 'ghost', id: 'addP', disabled: n >= MAXP }),
        btn('Remove last', function () { if (d.names.length > MINP) { d.names.pop(); render(); } }, { kind: 'ghost', id: 'delP', disabled: n <= MINP }))),
    configPanel(d.cfg, n, function (p) { d.cfg = E.normalizeConfig(Object.assign({}, d.cfg, p)); render(); }, { timers: false }),
    card(btn('Deal the roles', localStart, { kind: 'primary', id: 'localStart' }), btn('Back', exitLocal, { kind: 'ghost', id: 'localBack' })),
    howCard()
  ];
}
function localHandoff() {
  const d = L.data, who = E.P(d.st, d.queue[d.i]);
  const forRole = d.kind === 'roles';
  return [
    localBanner(),
    card(h('p', { class: 'eyebrow', text: forRole ? 'Role reveal' : d.kind === 'night' ? 'Night action' : 'Vote' }),
      h('h2', { class: 'pass', text: 'Pass the device to' }),
      h('p', { class: 'passname', id: 'passName', text: who.name }),
      h('p', { class: 'hint', text: 'Make sure nobody else can see the screen.' }),
      btn('I am ' + who.name, function () { d.stage = forRole ? 'role' : 'act'; persistLocal(); render(); }, { kind: 'primary', id: 'iAm' }))
  ];
}
function localRole() {
  const d = L.data, id = d.queue[d.i];
  const v = E.playerView(d.st, id);
  return [rolePanel(v, localPlayers(), true), card(btn('Hide and pass on', localNext, { kind: 'primary', id: 'hideNext' }))];
}
function localAct() {
  const d = L.data, id = d.queue[d.i];
  const v = E.playerView(d.st, id);
  const players = localPlayers();
  const submit = function (a) {
    const r = E.submit(d.st, id, a);
    if (!r.ok) { setErr('That choice is not allowed. Try again.'); return; }
    localNext();
  };
  return [
    localBanner(),
    h('div', { class: 'rolebar mini' }, icon(v.me.role, 18), h('span', { text: v.me.name + ' · ' + ROLE_TXT[v.me.role].title })),
    infoCard(v, players),
    actionPanel(v, players, submit, true)
  ];
}
function localDay() {
  const d = L.data, st = d.st;
  const pub = E.publicView(st);
  return [
    banner(pub),
    newsCard(pub),
    seatsCard(pub, null),
    card(h('h3', { text: 'Discussion' }), h('p', { class: 'dim', text: 'Talk it over out loud. Anyone with private news can peek in secret.' }),
      h('div', { class: 'row' },
        btn('Peek at my private notes', function () { d.stage = 'peekpick'; render(); }, { kind: 'ghost', id: 'peekBtn' }),
        btn('Start the vote', function () {
          E.advance(st, secureRng, 0);
          localBegin('vote');
        }, { kind: 'primary', id: 'voteBtn' })))
  ];
}
function localPeekPick() {
  const d = L.data;
  return [h('section', { class: 'card' }, h('h2', { text: 'Who is peeking?' }),
    h('p', { class: 'dim', text: 'Pick your name, then make sure nobody else is looking.' }),
    h('div', { class: 'seats' }, d.st.players.filter(function (p) { return p.alive; }).map(function (p) {
      return seat({ id: p.id, name: p.name, alive: true }, { selectable: true, onPick: function (id) { d.peek = id; d.stage = 'peek'; render(); } });
    })),
    btn('Back', function () { d.stage = 'day'; render(); }, { kind: 'ghost', id: 'peekBack' }))];
}
function localPeek() {
  const d = L.data;
  const v = E.playerView(d.st, d.peek);
  const info = infoCard(v, localPlayers());
  return [
    h('div', { class: 'rolebar mini' }, icon(v.me.role, 18), h('span', { text: v.me.name + ' · ' + ROLE_TXT[v.me.role].title })),
    info || card(h('p', { class: 'dim', text: 'No private notes right now.' })),
    card(btn('Hide', function () { d.peek = ''; d.stage = 'day'; render(); }, { kind: 'primary', id: 'peekDone' }))
  ];
}
function localResult() {
  const d = L.data;
  const pub = E.publicView(d.st);
  return [
    h('section', { class: 'banner day' }, h('div', { class: 'bl' }, icon('sun', 26), h('div', {}, h('h1', { class: 'bt', text: 'The votes are in' })))),
    newsCard(pub),
    seatsCard(pub, null),
    card(btn('Begin night ' + d.st.round, function () { localBegin('night'); }, { kind: 'primary', id: 'beginNight' }))
  ];
}
function localOver() {
  const d = L.data;
  const pub = E.publicView(d.st);
  return [
    resultCard(pub, null), rolesReveal(pub), recapCard(pub), newsCard(pub),
    card(h('div', { class: 'row' },
      btn('Play again', function () { const names = d.st.players.map(function (p) { return p.name; }); const cfg = d.cfg; L.data = defaultLocal(); L.data.names = names; L.data.cfg = cfg; store('local', null); render(); }, { kind: 'primary', id: 'again' }),
      btn('Exit', function () { store('local', null); exitLocal(); }, { kind: 'ghost', id: 'exitLocal' })))
  ];
}
function localScreen() {
  const d = L.data;
  if (!d) { L.data = defaultLocal(); return localSetup(); }
  const map = { setup: localSetup, handoff: localHandoff, role: localRole, act: localAct, day: localDay, peekpick: localPeekPick, peek: localPeek, result: localResult, over: localOver };
  return (map[d.stage] || localSetup)();
}

/* ================= chat dock ================= */
function canChat() {
  if (!S.online || !S.pub || S.mode === 'local') return { show: false };
  const pub = S.pub, me = pubPlayer(S.me);
  if (pub.phase === 'lobby') {
    const seated = S.roster.some(function (r) { return r.id === S.me; });
    return seated ? { show: true, ok: true } : { show: true, ok: false, why: 'Take a seat to chat.' };
  }
  if (!me) return { show: true, ok: false, why: 'Spectators cannot chat.' };
  if (pub.phase === 'over') return { show: true, ok: true };
  if (!me.alive) return { show: true, ok: true, ghost: true };
  if (pub.phase === 'night') return { show: true, ok: false, why: 'The table is silent at night.' };
  return { show: true, ok: true };
}
renderDock = function () {
  const c = canChat();
  dockEl.hidden = !c.show;
  if (!c.show) return;
  const pub = S.pub, me = pubPlayer(S.me);
  const iAmDead = !!(me && !me.alive);
  const seeAll = iAmDead || pub.phase === 'over';
  const all = [];
  Object.keys(S.chats).forEach(function (id) {
    const d = S.chats[id] || {};
    (Array.isArray(d.msgs) ? d.msgs : []).forEach(function (m) {
      if (!m || typeof m.x !== 'string') return;
      all.push({ id: id, name: d.name || 'Player', t: m.t || 0, x: m.x, g: !!m.g });
    });
  });
  all.sort(function (a, b) { return a.t - b.t; });
  const shown = all.filter(function (m) { return !m.g || seeAll; }).slice(-80);
  const near = chatLogEl.scrollHeight - chatLogEl.scrollTop - chatLogEl.clientHeight < 60;
  clear(chatLogEl);
  if (!shown.length) chatLogEl.appendChild(h('p', { class: 'hint', text: 'No messages yet.' }));
  shown.forEach(function (m) {
    const nm = pubPlayer(m.id) ? pubPlayer(m.id).name : (S.roster.find(function (r) { return r.id === m.id; }) || { name: m.name }).name;
    chatLogEl.appendChild(h('div', { class: 'msg' + (m.id === S.me ? ' mine' : '') + (m.g ? ' ghost' : '') }, h('b', { text: nm }), ' ', h('span', { text: m.x })));
  });
  if (near) chatLogEl.scrollTop = chatLogEl.scrollHeight;
  dockTitle.textContent = c.ghost ? 'Ghost chat' : 'Table talk';
  chatIn.disabled = !c.ok;
  chatIn.placeholder = c.ok ? (c.ghost ? 'Only ghosts can read this…' : 'Say something…') : 'Chat is closed';
  document.getElementById('chatSend').disabled = !c.ok;
  chatHint.textContent = c.ok ? (c.ghost ? 'Living players cannot see ghost messages.' : '') : (c.why || '');
};
function buildDock() {
  dockTitle = h('h2', { id: 'dockTitle', text: 'Table talk' });
  chatLogEl = h('div', { class: 'chatlog', id: 'chatLog', 'aria-live': 'polite' });
  chatIn = h('input', { id: 'chatIn', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Say something…', 'aria-label': 'Message' });
  chatForm = h('form', { class: 'chatform', id: 'chatForm' }, chatIn, h('button', { class: 'btn primary', type: 'submit', id: 'chatSend' }, 'Send'));
  chatHint = h('p', { class: 'hint', id: 'chatHint' });
  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const c = canChat();
    if (!c.show || !c.ok) return;
    const t = chatIn.value;
    chatIn.value = '';
    sendChat(t);
  });
  dockEl = h('aside', { class: 'card dock', id: 'dock', hidden: true }, dockTitle, chatLogEl, chatForm, chatHint);
}

/* ================= shell ================= */
function setTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
function cycleTheme() {
  const cur = store('theme') || '';
  const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
  store('theme', next || null);
  setTheme(next);
  render();
}
function renderHeader() {
  clear(hdrEl);
  const theme = store('theme') || '';
  let chip = '';
  if (S.mode === 'local') chip = 'One device';
  else if (S.online && S.pub) chip = S.pub.phase === 'lobby' ? 'Lobby' : S.pub.phase === 'over' ? 'Game over' : (S.pub.phase === 'night' ? 'Night ' : 'Day ') + S.pub.round;
  add(hdrEl,
    h('div', { class: 'hbrand' }, icon('mafia', 22), h('span', { class: 'logo', text: 'Mafia' }), chip ? h('span', { class: 'chip', id: 'chip', text: chip }) : null),
    h('div', { class: 'htools' },
      S.mode === 'local' ? btn('Leave', exitLocal, { kind: 'ghost small', id: 'leaveLocal' }) : null,
      h('button', { type: 'button', class: 'iconbtn', id: 'soundBtn', 'aria-label': S.sound ? 'Mute sound' : 'Turn sound on', 'aria-pressed': S.sound ? 'true' : 'false',
        onclick: function () { S.sound = !S.sound; store('sound', S.sound ? '1' : '0'); if (S.sound) SFX.click(); render(); } }, icon(S.sound ? 'vol' : 'mute')),
      h('button', { type: 'button', class: 'iconbtn', id: 'themeBtn', 'aria-label': 'Theme: ' + (theme || 'system'), title: 'Theme: ' + (theme || 'system'), onclick: cycleTheme }, icon('theme'))));
}
function errBar() {
  return h('div', { class: 'err', role: 'alert', id: 'errBar' }, h('span', { text: S.err }),
    h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { S.err = ''; render(); } }, icon('x', 16)));
}
function loadingCard(t) { return card(h('p', { class: 'dim', id: 'loading', text: t })); }

function screen() {
  if (S.boot) return [hero(false), loadingCard('Setting up the table…')];
  if (S.mode === 'local') return localScreen();
  if (S.online && S.pub) return onlineScreen();
  return homeScreen();
}

function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.id || !(a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return null;
  if (a === chatIn) return null;
  return { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd };
}
function restoreFocus(k) {
  if (!k) return;
  const el = document.getElementById(k.id);
  if (!el) return;
  if (el.tagName !== 'SELECT' && el.value !== k.v) el.value = k.v;
  try { el.focus(); if (k.s !== null && k.s !== undefined && el.setSelectionRange) el.setSelectionRange(k.s, k.e); } catch (e) { /* not selectable */ }
}

function cue() {
  const pub = S.online && S.mode !== 'local' ? S.pub : null;
  const key = pub ? pub.gameId + ':' + pub.key : '';
  if (key === S.lastKey) return;
  const had = S.lastKey;
  S.lastKey = key;
  if (!had || !pub) return;
  if (pub.phase === 'night') SFX.night();
  else if (pub.phase === 'discuss') {
    const last = (pub.log || [])[(pub.log || []).length - 1];
    if (last && last.ph === 'N' && /killed/.test(last.x)) SFX.kill(); else SFX.day();
  } else if (pub.phase === 'vote') SFX.vote();
  else if (pub.phase === 'over') {
    const me = inGame() && S.view && S.view.me ? S.view.me.role : null;
    if (me && (me === 'mafia') !== (pub.winner === 'mafia')) SFX.lose(); else SFX.win();
  }
}

function tickTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  if (!S.pub || !S.pub.dl) { el.textContent = ''; return; }
  const rem = (S.pub.dl - S.pub.at) - (Date.now() - S.pubAt);
  el.textContent = rem > 0 ? mmss(rem) : '0:00';
  el.classList.toggle('low', rem < 15000);
}

const OPEN = {};
render = function () {
  if (!root) return;
  const keep = captureFocus();
  cue();
  renderHeader();
  clear(mainEl);
  if (S.err) mainEl.appendChild(errBar());
  screen().forEach(function (n) { add(mainEl, n); });
  mainEl.querySelectorAll('details[id]').forEach(function (d) {
    if (Object.prototype.hasOwnProperty.call(OPEN, d.id)) d.open = OPEN[d.id];
    d.addEventListener('toggle', function () { OPEN[d.id] = d.open; });
  });
  renderDock();
  restoreFocus(keep);
  tickTimer();
};

function init() {
  root = document.getElementById('app');
  const t = store('theme');
  if (t === 'light' || t === 'dark') setTheme(t);
  hdrEl = h('header', { class: 'hdr', id: 'hdr' });
  mainEl = h('main', { class: 'main', id: 'main' });
  buildDock();
  const side = h('div', { class: 'side' }, dockEl);
  add(root, hdrEl, h('div', { class: 'cols' }, mainEl, side));
  render();
  setInterval(tickTimer, 500);
  setTimeout(function () { if (S.boot) { S.boot = false; render(); } }, 12000);
  initOnline().catch(function (e) { S.boot = false; setErr(e); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.__mafia = { S: S, H: H, L: L, E: E };   // handy for debugging and tests
})();
