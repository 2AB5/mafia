/* ===== board: everyone renders the same list of drawing ops onto a fixed 1000×750 bitmap, so fills look the same on every screen ===== */
const Board = (function () {
  const W = 1000, HH = 750, BG = '#ffffff';
  const PALETTE = ['#1f2230', '#7a7f8c', '#d6455d', '#f08a24', '#f2c230', '#3fae5a', '#1c8c7c', '#2f66d0', '#7b4bd1', '#e86aa6', '#8b5a2b', '#f5d0a9'];
  const SIZES = [4, 10, 22, 44];
  const bmp = document.createElement('canvas'); bmp.width = W; bmp.height = HH;
  const bx = bmp.getContext('2d', { willReadFrequently: true });
  const B = { key: '', ops: [], units: [], dirty: true, tool: { mode: 'pen', color: PALETTE[0], size: 10 }, enabled: false, pending: [], drawing: null, onChange: null };
  let canvas = null, vctx = null, wrap = null, floats = null, sendT = null;

  function wipe() { bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalCompositeOperation = 'source-over'; bx.fillStyle = BG; bx.fillRect(0, 0, W, HH); }
  wipe();
  function strokeSeg(u, from) {
    const p = u.p;
    bx.strokeStyle = u.c; bx.fillStyle = u.c; bx.lineWidth = u.w; bx.lineCap = 'round'; bx.lineJoin = 'round';
    if (p.length === 2 || (from === 0 && p.length <= 2)) { bx.beginPath(); bx.arc(p[0], p[1], u.w / 2, 0, Math.PI * 2); bx.fill(); return; }
    const start = Math.max(0, from - 2);
    bx.beginPath(); bx.moveTo(p[start], p[start + 1]);
    for (let i = start + 2; i < p.length; i += 2) bx.lineTo(p[i], p[i + 1]);
    bx.stroke();
  }
  function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function flood(x, y, c) {
    x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(HH - 1, Math.round(y)));
    const img = bx.getImageData(0, 0, W, HH), d = img.data;
    const at = (y * W + x) * 4, tr = d[at], tg = d[at + 1], tb = d[at + 2];
    const f = hexRgb(c);
    if (Math.abs(tr - f[0]) + Math.abs(tg - f[1]) + Math.abs(tb - f[2]) < 6) return;
    const TOL = 90;
    const same = function (i) { return Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= TOL; };
    const seen = new Uint8Array(W * HH);
    const stack = [x, y];
    while (stack.length) {
      const sy = stack.pop(), sx0 = stack.pop();
      let sx = sx0;
      while (sx >= 0 && !seen[sy * W + sx] && same((sy * W + sx) * 4)) sx--;
      sx++;
      let up = false, down = false;
      while (sx < W && !seen[sy * W + sx] && same((sy * W + sx) * 4)) {
        const i = (sy * W + sx) * 4;
        seen[sy * W + sx] = 1; d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
        if (sy > 0) { const ok = !seen[(sy - 1) * W + sx] && same(((sy - 1) * W + sx) * 4); if (ok && !up) { stack.push(sx, sy - 1); up = true; } else if (!ok) up = false; }
        if (sy < HH - 1) { const ok = !seen[(sy + 1) * W + sx] && same(((sy + 1) * W + sx) * 4); if (ok && !down) { stack.push(sx, sy + 1); down = true; } else if (!ok) down = false; }
        sx++;
      }
    }
    // soak up the anti-aliased rim next to the fill so it doesn't leave a pale halo
    for (let yy = 1; yy < HH - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
      const k = yy * W + xx;
      if (seen[k]) continue;
      if (seen[k - 1] || seen[k + 1] || seen[k - W] || seen[k + W]) {
        const i = k * 4;
        if (Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= 300) { d[i] = (d[i] + f[0]) >> 1; d[i + 1] = (d[i + 1] + f[1]) >> 1; d[i + 2] = (d[i + 2] + f[2]) >> 1; }
      }
    }
    bx.putImageData(img, 0, 0);
  }
  function drawUnit(u) {
    if (u.t === 's') strokeSeg(u, 0);
    else if (u.t === 'f') flood(u.p[0], u.p[1], u.c);
    else if (u.t === 'x') wipe();
  }
  function full() { wipe(); let from = 0; B.units.forEach(function (u, i) { if (u.t === 'x') from = i; }); for (let i = from; i < B.units.length; i++) drawUnit(B.units[i]); B.dirty = true; }
  /* apply one op to the unit list (and the bitmap) */
  function apply(o, quiet) {
    B.ops.push(o);
    if (o.k === 's') { const u = { t: 's', c: o.c, w: o.w, p: o.p.slice() }; B.units.push(u); if (!quiet) strokeSeg(u, 0); }
    else if (o.k === 'l') {
      const u = B.units[B.units.length - 1];
      if (u && u.t === 's') { const from = u.p.length; for (let i = 0; i < o.p.length; i++) u.p.push(o.p[i]); if (!quiet) strokeSeg(u, from); }
    }
    else if (o.k === 'f') { const u = { t: 'f', c: o.c, p: o.p.slice(0, 2) }; B.units.push(u); if (!quiet) flood(u.p[0], u.p[1], u.c); }
    else if (o.k === 'x') { B.units.push({ t: 'x' }); if (!quiet) wipe(); }
    else if (o.k === 'u') { B.units.pop(); if (!quiet) full(); }
    B.dirty = true;
  }
  function cleanOp(o) {
    if (!o || typeof o !== 'object' || typeof o.k !== 'string') return null;
    const k = o.k;
    if (k === 'u' || k === 'x') return { k: k };
    if (k !== 's' && k !== 'l' && k !== 'f') return null;
    if (!Array.isArray(o.p) || !o.p.length || o.p.length % 2 || o.p.length > 400) return null;
    const p = [];
    for (let i = 0; i < o.p.length; i += 2) {
      const x = Number(o.p[i]), y = Number(o.p[i + 1]);
      if (!isFinite(x) || !isFinite(y)) return null;
      p.push(Math.max(0, Math.min(W, Math.round(x))), Math.max(0, Math.min(HH, Math.round(y))));
    }
    if (k === 'l') return { k: 'l', p: p };
    const c = typeof o.c === 'string' && /^#[0-9a-f]{6}$/i.test(o.c) ? o.c.toLowerCase() : null;
    if (!c) return null;
    if (k === 'f') return { k: 'f', c: c, p: p.slice(0, 2) };
    const w = Math.max(1, Math.min(80, Math.round(Number(o.w) || 0)));
    return { k: 's', c: c, w: w, p: p.slice(0, 2) };
  }
  function load(key, ops) {
    B.key = key || ''; B.ops = []; B.units = []; B.pending = []; B.drawing = null;
    (ops || []).forEach(function (o) { const c = cleanOp(o); if (c) apply(c, true); });
    full();
    if (B.onChange) B.onChange();
  }
  function remote(key, at, ops) {
    if (key !== B.key || at !== B.ops.length) return false;
    (ops || []).forEach(function (o) { const c = cleanOp(o); if (c) apply(c); });
    return true;
  }

  /* ---------- local drawing (only for the drawer) ---------- */
  function queue(o) {
    apply(o);
    const last = B.pending[B.pending.length - 1];
    if (o.k === 'l' && last && last.k === 'l' && last.p.length + o.p.length <= 400) { for (let i = 0; i < o.p.length; i++) last.p.push(o.p[i]); }
    else B.pending.push({ k: o.k, c: o.c, w: o.w, p: o.p ? o.p.slice() : undefined });
    if (!sendT) sendT = setTimeout(flush, 45);
  }
  function flush() {
    sendT = null;
    if (!B.pending.length) return;
    const ops = B.pending; B.pending = [];
    for (let i = 0; i < ops.length; i += 150) Net.draw(B.key, ops.slice(i, i + 150));
  }
  function evPt(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(W, Math.round((e.clientX - r.left) / r.width * W))), Math.max(0, Math.min(HH, Math.round((e.clientY - r.top) / r.height * HH)))];
  }
  function onDown(e) {
    if (!B.enabled) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const p = evPt(e), t = B.tool;
    if (t.mode === 'fill') { queue({ k: 'f', c: t.color, p: p }); return; }
    B.drawing = { id: e.pointerId, last: p };
    queue({ k: 's', c: t.mode === 'eraser' ? BG : t.color, w: t.mode === 'eraser' ? Math.max(16, t.size * 2) : t.size, p: p });
  }
  function onMove(e) {
    const dr = B.drawing;
    if (!dr || dr.id !== e.pointerId || !B.enabled) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const pts = [];
    (evs.length ? evs : [e]).forEach(function (ev) {
      const p = evPt(ev);
      if (Math.hypot(p[0] - dr.last[0], p[1] - dr.last[1]) >= 2.5) { pts.push(p[0], p[1]); dr.last = p; }
    });
    if (pts.length) queue({ k: 'l', p: pts });
  }
  function onUp(e) { if (B.drawing && B.drawing.id === e.pointerId) { B.drawing = null; flush(); } }
  function undo() { if (!B.enabled) return; if (!B.units.length) return; queue({ k: 'u' }); flush(); }
  function clearAll() { if (!B.enabled) return; queue({ k: 'x' }); flush(); }

  /* ---------- view ---------- */
  function ensure() {
    if (wrap) return wrap;
    canvas = h('canvas', { id: 'board', class: 'board', 'aria-label': 'Drawing board' });
    vctx = canvas.getContext('2d');
    floats = h('div', { class: 'floats', 'aria-hidden': 'true' });
    wrap = h('div', { class: 'boardwrap', id: 'boardWrap' }, canvas, floats, h('div', { class: 'board-ov', id: 'boardOv' }));
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    requestAnimationFrame(loop);
    return wrap;
  }
  function loop() {
    requestAnimationFrame(loop);
    if (!wrap || !wrap.isConnected) return;
    const cw = Math.round(canvas.clientWidth), ch = Math.round(canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(cw * dpr)), ph = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; B.dirty = true; }
    if (!B.dirty) return;
    B.dirty = false;
    vctx.imageSmoothingEnabled = true; vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(bmp, 0, 0, pw, ph);
  }
  function overlay() { ensure(); return wrap.querySelector('#boardOv'); }
  function float(name, e) {
    ensure();
    const el = h('span', { class: 'float', style: 'left:' + (10 + Math.floor(Math.random() * 76)) + '%' }, h('span', { class: 'fe', text: e }), name ? h('span', { class: 'fn', text: name }) : null);
    floats.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
  function snapshot(w) {
    w = w || 400;
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * HH / W);
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/jpeg', 0.78); } catch (e) { return ''; }
  }
  /* a fingerprint of what's on the board (tests compare screens with it) */
  function sig() {
    const d = bx.getImageData(0, 0, W, HH).data; let x = 2166136261;
    for (let i = 0; i < d.length; i += 4 * 97) { x ^= d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16); x = Math.imul(x, 16777619) >>> 0; }
    return B.units.length + ':' + x;
  }
  /* coarse picture: 40×30 cells, each the average colour quantised, for comparing screens */
  function grid() {
    const d = bx.getImageData(0, 0, W, HH).data, out = [];
    for (let gy = 0; gy < 30; gy++) for (let gx = 0; gx < 40; gx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = gy * 25 + 2; y < gy * 25 + 25; y += 4) for (let x = gx * 25 + 2; x < gx * 25 + 25; x += 4) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      out.push(((r / n) >> 5) * 64 + ((g / n) >> 5) * 8 + ((b / n) >> 5));
    }
    return out;
  }
  function blank() { return !B.units.some(function (u) { return u.t !== 'x'; }); }
  B.W = W; B.H = HH; B.PALETTE = PALETTE; B.SIZES = SIZES; B.BG = BG;
  B.load = load; B.remote = remote; B.cleanOp = cleanOp; B.ensure = ensure; B.overlay = overlay; B.float = float;
  B.undo = undo; B.clear = clearAll; B.sig = sig; B.grid = grid; B.snapshot = snapshot; B.blank = blank; B.flush = flush;
  B.setEnabled = function (on) { B.enabled = !!on; if (canvas) canvas.classList.toggle('live', !!on); if (!on) { B.drawing = null; flush(); } };
  B.bitmap = bmp;
  return B;
})();
function showReaction(name, e) { Board.float(name, e); }

/* ===== chat panel: a persistent element so typing never gets interrupted by re-renders ===== */
const Chat = (function () {
  let el = null, log = null, input = null, form = null, teamBtn = null, sendBtn = null;
  function ensure() {
    if (el) return el;
    log = h('div', { class: 'chatlog', id: 'chatLog', role: 'log', 'aria-live': 'polite' });
    input = h('input', { id: 'chatIn', type: 'text', maxlength: '120', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Guess or chat' });
    teamBtn = h('button', { type: 'button', class: 'teambtn', id: 'teamToggle', 'aria-pressed': 'false', onclick: function () { S.chatTeam = !S.chatTeam; sync(); input.focus(); } }, 'Team only');
    sendBtn = h('button', { class: 'btn primary sendb', type: 'submit', id: 'chatSend', 'aria-label': 'Send' }, icon('send', 18));
    form = h('form', { class: 'chatform', id: 'chatForm', onsubmit: function (e) {
      e.preventDefault();
      const x = input.value.trim(); if (!x) return;
      input.value = '';
      Net.say(x, S.chatTeam && teamToggleShown());
    } }, input, teamBtn, sendBtn);
    el = h('section', { class: 'chat', id: 'chat' }, h('div', { class: 'chathead' }, h('h3', { id: 'chatTitle', text: 'Chat' }), h('span', { class: 'chatsub', id: 'chatSub' })), log, form);
    redraw();
    return el;
  }
  function teamToggleShown() {
    const g = S.st && S.st.game; if (!g || g.phase === 'over' || !S.me) return !!(S.st && S.me);
    const me = g.players.find(function (p) { return p.id === S.me; }); if (!me) return false;
    const t = g.turn; if (!t) return true;
    if (g.phase === 'draw' && me.team === t.team) return false;          // guessers' messages are guesses
    return true;
  }
  function line(m) {
    const k = m.k;
    const tdot = function () { return m.tt === 0 || m.tt === 1 ? h('span', { class: 'tdot t' + m.tt, 'aria-hidden': 'true' }) : null; };
    if (k === 'sys' || k === 'turn' || k === 'hint' || k === 'stumped' || k === 'over') return h('div', { class: 'msg sys k-' + k }, m.x);
    if (k === 'correct') return h('div', { class: 'msg correct' }, '🎉 ', m.x);
    if (k === 'close') return h('div', { class: 'msg note close' }, '🤏 ', m.x);
    if (k === 'note') return h('div', { class: 'msg note' }, m.x);
    if (k === 'blocked') return h('div', { class: 'msg note blocked' }, h('b', { text: 'Only you can see this: ' }), '“' + m.x + '”. ', m.why || '');
    const mine = m.f && m.f === S.me;
    return h('div', { class: 'msg' + (mine ? ' mine' : '') + (k === 'guess' ? ' guess' : '') + (m.opp ? ' opp' : '') + (m.to !== undefined && m.to !== 'all' ? ' teamonly' : '') },
      tdot(), h('b', { class: 'who', text: (m.n || 'Player') + (m.to !== undefined && m.to !== 'all' ? ' 🔒' : '') + ':' }), ' ', h('span', { class: 'tx', text: m.x }));
  }
  function near() { return log.scrollHeight - log.scrollTop - log.clientHeight < 60; }
  function add(m) {
    ensure();
    const stick = near();
    const empty = log.querySelector('.empty'); if (empty) empty.remove();
    log.appendChild(line(m));
    while (log.childNodes.length > 200) log.removeChild(log.firstChild);
    if (stick || m.f === S.me) log.scrollTop = log.scrollHeight;
    if (m.k === 'correct') SFX.correct(); else if (m.k === 'close') SFX.close(); else if (m.k === 'hint') SFX.hint(); else if (m.k === 'stumped') SFX.stumped(); else if (m.f && m.f !== S.me) SFX.msg();
  }
  function redraw() {
    if (!log) return;
    clear(log);
    if (!S.chat.length) log.appendChild(h('p', { class: 'empty hint', text: 'Guesses and chat show up here.' }));
    S.chat.forEach(function (m) { log.appendChild(line(m)); });
    log.scrollTop = log.scrollHeight;
  }
  /* placeholder, team toggle and title follow the player's role */
  function sync() {
    ensure();
    const g = S.st && S.st.game, t = g && g.turn;
    const me = g && S.me ? g.players.find(function (p) { return p.id === S.me; }) : null;
    let ph = 'Say something…', title = 'Chat', sub = '', disabled = false;
    const live = g && g.phase !== 'over';
    if (live && !me) { ph = 'Viewers can only react during a game'; disabled = true; title = 'Chat'; }
    else if (live && t && me) {
      if (g.phase === 'draw' && me.id === t.drawer) { ph = 'You’re drawing, no chatting!'; disabled = true; title = 'Guesses'; }
      else if (g.phase === 'draw' && me.team === t.team) { ph = 'Type your guess…'; title = 'Guess the word'; sub = 'Your guesses show to everyone'; }
      else if (me.team === t.setTeam) { ph = S.chatTeam ? 'Whisper to your team…' : 'Tease them (you can’t say the word)…'; title = g.phase === 'choose' ? 'Pick a word together' : 'Chat'; sub = S.chatTeam ? 'Only your team sees this' : 'Everyone sees this'; }
      else { ph = S.chatTeam ? 'Whisper to your team…' : 'Chat…'; }
    }
    input.placeholder = ph; input.disabled = disabled; sendBtn.disabled = disabled;
    const showTeam = !disabled && teamToggleShown();
    teamBtn.hidden = !showTeam;
    teamBtn.classList.toggle('on', !!S.chatTeam);
    teamBtn.setAttribute('aria-pressed', S.chatTeam ? 'true' : 'false');
    teamBtn.textContent = S.chatTeam ? '🔒 Team' : 'Everyone';
    el.querySelector('#chatTitle').textContent = title;
    el.querySelector('#chatSub').textContent = sub;
  }
  return { ensure: ensure, add: add, redraw: redraw, sync: sync, input: function () { ensure(); return input; } };
})();
