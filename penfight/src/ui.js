/* ===== ui: screens, desk renderer, flick controls ===== */
let root, hdrEl, connEl, mainEl, toastEl;
let stage = null;            // persistent { wrap, canvas, ctx, overlay, w, h, dpr, scale, wood }
const VIEW = { w: PF.TABLE.w + 1.4, h: PF.TABLE.h + 1.4 };
const DRAG_FULL = 2.6;       // world units of pull for full power
const fallAnim = {};
let drag = null, lastAimSent = 0;

/* ---------- lookups ---------- */
function st() { return S.st; }
function match() { return S.st && S.st.match; }
function rosterEntry(id) { return S.st && S.st.roster ? S.st.roster.find(function (r) { return r.id === id; }) : null; }
function nameOf(id) { const m = match(); if (m) return PF.nameOf(m, id); const r = rosterEntry(id); return r ? r.name : 'Player'; }
function skinOf(id) { const m = match(); const p = m && m.players.find(function (q) { return q.id === id; }); const r = rosterEntry(id); return PF.skinById(p ? p.skin : r ? r.skin : 'blue'); }
function isLocal() { return S.screen === 'local'; }
function shooterIsMe() { const m = match(); return !!m && (isLocal() || m.turn === S.me); }
function canShoot() { const m = match(); return !!m && m.phase === 'aim' && shooterIsMe() && (isLocal() || S.conn === 'open'); }

/* ---------- building blocks ---------- */
function card() { const c = h('section', { class: 'card' }); for (let i = 0; i < arguments.length; i++) add(c, arguments[i]); return c; }
function btn(label, fn, o) {
  o = o || {};
  return h('button', { type: 'button', class: 'btn ' + (o.kind || ''), id: o.id, disabled: o.disabled, 'aria-label': o.aria, onclick: function (e) { if (!o.disabled) fn(e); } }, o.icon ? icon(o.icon, 18) : null, label);
}
function confirmBtn(key, label, confirmLabel, run, kind) {
  const armed = S.confirm === key;
  return btn(armed ? confirmLabel : label, function () {
    if (armed) { S.confirm = null; run(); render(); return; }
    S.confirm = key; render();
    setTimeout(function () { if (S.confirm === key) { S.confirm = null; render(); } }, 5000);
  }, { kind: armed ? 'danger' : (kind || 'ghost'), id: 'cf-' + key });
}
function seg(label, id, options, value, onPick) {
  return h('div', { class: 'field', id: id }, h('span', { class: 'lbl', text: label }),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(function (o) {
      const on = String(o[0]) === String(value);
      return h('button', { type: 'button', class: 'segb' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-v': String(o[0]), onclick: function () { onPick(o[0]); } }, o[1]);
    })));
}

/* ---------- pen drawing (world units; pen lies along +x, tip at +L/2) ---------- */
function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawPen(ctx, skin, o) {
  o = o || {};
  const L = PF.PEN.len, W = PF.PEN.wid, hl = L / 2, hw = W / 2;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  // shadow on the desk
  if (!o.noShadow) { ctx.save(); ctx.translate(0.05, 0.08); ctx.fillStyle = 'rgba(40,20,5,.32)'; rr(ctx, -hl, -hw, L, W, hw); ctx.fill(); ctx.restore(); }
  if (o.glow) {
    ctx.save(); ctx.strokeStyle = o.glow; ctx.lineWidth = 0.07; ctx.shadowColor = o.glow; ctx.shadowBlur = 14;
    rr(ctx, -hl - 0.05, -hw - 0.05, L + 0.1, W + 0.1, hw + 0.05); ctx.stroke(); ctx.restore();
  }
  if (skin.pencil) {
    ctx.fillStyle = skin.cap; rr(ctx, -hl, -hw, 0.2, W, 0.06); ctx.fill();                     // eraser
    ctx.fillStyle = skin.band; ctx.fillRect(-hl + 0.16, -hw - 0.005, 0.12, W + 0.01);           // ferrule
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.008;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-hl + 0.16 + i * 0.03, -hw); ctx.lineTo(-hl + 0.16 + i * 0.03, hw); ctx.stroke(); }
    ctx.fillStyle = skin.body; ctx.fillRect(-hl + 0.28, -hw, L - 0.56, W);                        // hexagonal body
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-hl + 0.28, -hw * 0.25, L - 0.56, hw * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-hl + 0.28, hw * 0.45, L - 0.56, hw * 0.55);
    ctx.fillStyle = '#e8c48c'; ctx.beginPath(); ctx.moveTo(hl - 0.28, -hw); ctx.lineTo(hl - 0.07, -0.028); ctx.lineTo(hl - 0.07, 0.028); ctx.lineTo(hl - 0.28, hw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.tip; ctx.beginPath(); ctx.moveTo(hl - 0.09, -0.032); ctx.lineTo(hl, 0); ctx.lineTo(hl - 0.09, 0.032); ctx.closePath(); ctx.fill();
  } else {
    // tip
    ctx.fillStyle = skin.tip; ctx.beginPath(); ctx.moveTo(hl - 0.24, -hw * 0.8); ctx.lineTo(hl - 0.02, -0.025); ctx.lineTo(hl - 0.02, 0.025); ctx.lineTo(hl - 0.24, hw * 0.8); ctx.closePath(); ctx.fill();
    if (skin.id === 'gold') { ctx.strokeStyle = '#7a5a12'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(hl - 0.2, 0); ctx.lineTo(hl - 0.03, 0); ctx.stroke(); }
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(hl - 0.015, 0, 0.018, 0, Math.PI * 2); ctx.fill();
    // barrel
    const g = ctx.createLinearGradient(0, -hw, 0, hw);
    g.addColorStop(0, shade(skin.body, 0.35)); g.addColorStop(0.35, skin.body); g.addColorStop(1, shade(skin.body, -0.35));
    ctx.fillStyle = g; rr(ctx, -hl + 0.06, -hw, L - 0.3, W, hw * 0.8); ctx.fill();
    if (skin.clear) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-hl + 0.5, -hw * 0.45, L - 0.8, hw * 0.9); ctx.fillStyle = shade(skin.cap, -0.1); ctx.fillRect(-hl + 0.5, -0.012, L - 0.84, 0.024); }
    // grip
    ctx.fillStyle = skin.band; rr(ctx, hl - 0.56, -hw * 1.02, 0.32, W * 1.02, 0.03); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.01;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(hl - 0.56 + i * 0.053, -hw); ctx.lineTo(hl - 0.56 + i * 0.053, hw); ctx.stroke(); }
    // cap with clip
    const cg = ctx.createLinearGradient(0, -hw * 1.1, 0, hw * 1.1);
    cg.addColorStop(0, shade(skin.cap, 0.35)); cg.addColorStop(0.4, skin.cap); cg.addColorStop(1, shade(skin.cap, -0.3));
    ctx.fillStyle = cg; rr(ctx, -hl, -hw * 1.1, 0.5, W * 1.1, hw); ctx.fill();
    if (skin.id === 'gold') { ctx.fillStyle = skin.band; ctx.fillRect(-hl + 0.46, -hw * 1.1, 0.04, W * 1.1); ctx.fillRect(hl - 0.62, -hw, 0.03, W); }
    ctx.fillStyle = skin.id === 'gold' ? skin.band : '#c9ccd2'; rr(ctx, -hl + 0.06, -hw * 1.1 - 0.035, 0.36, 0.045, 0.02); ctx.fill();
  }
  // gloss
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-hl + 0.1, -hw * 0.7, L - 0.4, hw * 0.28);
  ctx.restore();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = function (c) { return Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)))); };
  return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}
function penPreview(skinId, w, hgt) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  c.width = w * dpr; c.height = hgt * dpr; c.style.width = w + 'px'; c.style.height = hgt + 'px';
  c.className = 'penprev'; c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d');
  const s = (w * dpr) / (PF.PEN.len + 0.3);
  ctx.setTransform(s, 0, 0, s, (w * dpr) / 2, (hgt * dpr) / 2);
  drawPen(ctx, PF.skinById(skinId), { noShadow: true });
  return c;
}
function skinPicker(id, current, taken, onPick) {
  return h('div', { class: 'skins', id: id, role: 'group', 'aria-label': 'Choose your pen' }, PF.SKINS.map(function (sk) {
    const isTaken = !!(taken && taken[sk.id]);
    return h('button', { type: 'button', class: 'skinb' + (sk.id === current ? ' on' : ''), 'aria-pressed': sk.id === current ? 'true' : 'false', disabled: isTaken, 'data-skin': sk.id,
      onclick: function () { onPick(sk.id); SFX.click(); } }, penPreview(sk.id, 92, 22), h('span', { text: sk.name }));
  }));
}

/* ---------- desk ---------- */
function ensureStage() {
  if (stage) return stage;
  const canvas = h('canvas', { id: 'desk', class: 'desk', 'aria-label': 'Desk with pens. On your turn, press on your pen, pull back and release to flick.' });
  const overlay = h('div', { class: 'stage-ov', id: 'stageOv' });
  const wrap = h('div', { class: 'stage', id: 'stage' }, canvas, overlay);
  stage = { wrap: wrap, canvas: canvas, ctx: canvas.getContext('2d'), overlay: overlay, w: 0, h: 0, dpr: 1, scale: 1, wood: null };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); onCancel(); });
  window.addEventListener('resize', function () { stage.w = 0; });
  requestAnimationFrame(frameLoop);
  return stage;
}
function sizeStage() {
  const s = stage;
  const parentW = s.wrap.parentElement ? s.wrap.parentElement.clientWidth : 360;
  const top = s.wrap.getBoundingClientRect().top;
  const availH = Math.max(340, window.innerHeight - Math.max(0, top) - 132);
  let cw = Math.min(parentW, 620), ch = cw * VIEW.h / VIEW.w;
  if (ch > availH) { ch = availH; cw = ch * VIEW.w / VIEW.h; }
  cw = Math.floor(cw); ch = Math.floor(ch);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (cw === s.w && ch === s.h && dpr === s.dpr) return;
  s.w = cw; s.h = ch; s.dpr = dpr;
  s.canvas.style.width = cw + 'px'; s.canvas.style.height = ch + 'px';
  s.canvas.width = Math.round(cw * dpr); s.canvas.height = Math.round(ch * dpr);
  s.scale = cw / VIEW.w;
  s.wood = makeWood(s);
}
function makeWood(s) {
  const k = s.scale * s.dpr;
  const W = Math.round(PF.TABLE.w * k), Ht = Math.round(PF.TABLE.h * k);
  const c = document.createElement('canvas'); c.width = W; c.height = Ht;
  const x = c.getContext('2d');
  let seed = 7; const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#a8703d'); g.addColorStop(0.5, '#b98150'); g.addColorStop(1, '#a26a37');
  x.fillStyle = g; x.fillRect(0, 0, W, Ht);
  const planks = 3, pw = W / planks;
  for (let p = 0; p < planks; p++) {
    x.fillStyle = 'rgba(' + (p % 2 ? '255,230,200' : '60,30,10') + ',' + (0.04 + rnd() * 0.04) + ')';
    x.fillRect(p * pw, 0, pw, Ht);
    for (let i = 0; i < 26; i++) {
      const x0 = p * pw + rnd() * pw, amp = 2 + rnd() * 7, fr = 0.004 + rnd() * 0.01, ph = rnd() * 6;
      x.strokeStyle = 'rgba(70,35,10,' + (0.05 + rnd() * 0.1) + ')'; x.lineWidth = 0.6 + rnd() * 1.6;
      x.beginPath();
      for (let y = 0; y <= Ht; y += 6) { const xx = x0 + Math.sin(y * fr + ph) * amp; if (y === 0) x.moveTo(xx, y); else x.lineTo(xx, y); }
      x.stroke();
    }
    if (p > 0) { x.fillStyle = 'rgba(50,25,8,.35)'; x.fillRect(p * pw - 1, 0, 2, Ht); }
  }
  for (let i = 0; i < 3; i++) {                   // knots
    const kx = rnd() * W, ky = rnd() * Ht;
    for (let r = 3; r < 16; r += 3) { x.strokeStyle = 'rgba(80,40,12,.18)'; x.lineWidth = 1; x.beginPath(); x.ellipse(kx, ky, r * 0.6, r * 1.6, 0, 0, Math.PI * 2); x.stroke(); }
  }
  for (let i = 0; i < 22; i++) {                  // scratches
    const sx = rnd() * W, sy = rnd() * Ht, a = rnd() * Math.PI, l = 8 + rnd() * 40;
    x.strokeStyle = 'rgba(255,240,220,' + (0.08 + rnd() * 0.12) + ')'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
  }
  x.save();                                        // ink doodles carved into the desk
  x.translate(W * 0.72, Ht * 0.9); x.rotate(-0.12);
  x.fillStyle = 'rgba(30,45,120,.28)'; x.font = Math.round(k * 0.36) + 'px "Caveat", "Comic Sans MS", cursive';
  x.fillText('desk champ →', 0, 0);
  x.restore();
  x.save(); x.translate(W * 0.16, Ht * 0.1); x.rotate(0.2);
  x.strokeStyle = 'rgba(30,45,120,.25)'; x.lineWidth = Math.max(1, k * 0.025);
  x.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5, r = k * 0.22; if (i === 0) x.moveTo(Math.cos(a) * r, Math.sin(a) * r); else x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.stroke();
  x.restore();
  return c;
}
function toScreen(x, y) { return [x * stage.scale + stage.w / 2, y * stage.scale + stage.h / 2]; }
function toWorld(px, py) { return [(px - stage.w / 2) / stage.scale, (py - stage.h / 2) / stage.scale]; }

/* poses to draw right now */
function currentPoses() {
  const m = match();
  if (!m) return [];
  if (m.phase === 'roll') {
    if (S.isHost && H.sim && H.match && H.match.id === m.id) return H.sim.poses(H.match);
    const fr = S.frames;
    if (fr.length) {
      const t = performance.now() - 90;
      let a = fr[0], b = fr[0];
      for (let i = 0; i < fr.length; i++) { if (fr[i].at <= t) { a = fr[i]; b = fr[i + 1] || fr[i]; } }
      const span = b.at - a.at, k = span > 0 ? Math.max(0, Math.min(1, (t - a.at) / span)) : 1;
      return m.pens.map(function (pen, i) {
        const pa = a.p[i], pb = b.p[i];
        if (!pa || !pb) return { x: pen.x, y: pen.y, a: pen.a, out: pen.out };
        let da = pb[2] - pa[2]; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        return { x: pa[0] + (pb[0] - pa[0]) * k, y: pa[1] + (pb[1] - pa[1]) * k, a: pa[2] + da * k, out: !!(pb[3] || pa[3]) };
      });
    }
  }
  return m.pens.map(function (p) { return { x: p.x, y: p.y, a: p.a, out: p.out }; });
}
function frameLoop() {
  requestAnimationFrame(frameLoop);
  if (!stage || !stage.wrap.isConnected) return;
  sizeStage();
  drawDesk();
  tickHud();
}
function drawDesk() {
  const s = stage, ctx = s.ctx, m = match();
  const k = s.scale * s.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
  ctx.setTransform(k, 0, 0, k, (s.w / 2) * s.dpr, (s.h / 2) * s.dpr);
  const tw = PF.TABLE.w, th = PF.TABLE.h;
  // desk edge and shadow
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24 * s.dpr; ctx.shadowOffsetY = 8 * s.dpr;
  ctx.fillStyle = '#6f4421'; rr(ctx, -tw / 2 - 0.14, -th / 2 - 0.14, tw + 0.28, th + 0.28, 0.2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#8a5a2e'; rr(ctx, -tw / 2 - 0.07, -th / 2 - 0.07, tw + 0.14, th + 0.14, 0.14); ctx.fill();
  if (s.wood) ctx.drawImage(s.wood, -tw / 2, -th / 2, tw, th);
  ctx.strokeStyle = 'rgba(255,235,200,.25)'; ctx.lineWidth = 0.02; ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  if (!m) return;
  const poses = currentPoses();
  const now = performance.now();
  // pens
  m.pens.forEach(function (pen, i) {
    const p = poses[i]; if (!p) return;
    const skin = PF.skinById((m.players.find(function (q) { return q.id === pen.id; }) || {}).skin);
    const key = m.id + ':' + m.round + ':' + pen.id;
    if (p.out) {
      if (!fallAnim[key]) { fallAnim[key] = { t: now, x: p.x, y: p.y, a: p.a }; if (!S.isHost && m.phase !== 'roll') fallAnim[key].t = now - 1000; }
      const f = fallAnim[key], e = (now - f.t) / 650;
      if (e >= 1) return;
      const dx = f.x, dy = f.y, d = Math.hypot(dx, dy) || 1;
      ctx.save(); ctx.translate(f.x + dx / d * e * 0.6, f.y + dy / d * e * 0.6); ctx.rotate(f.a + e * 1.2); ctx.scale(1 - e * 0.45, 1 - e * 0.45);
      drawPen(ctx, skin, { alpha: 1 - e, noShadow: true }); ctx.restore();
      return;
    }
    const active = m.phase === 'aim' && m.turn === pen.id;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    drawPen(ctx, skin, { glow: active ? (shooterIsMe() ? '#ffd23f' : 'rgba(255,255,255,.85)') : null });
    ctx.restore();
  });
  // aim arrow (mine while dragging, or the shooter's live aim)
  let aim = null;
  if (drag && drag.cur && canShoot()) aim = { lx: drag.lx, dx: drag.vx, dy: drag.vy, mine: true };
  else if (S.aim && m.phase === 'aim' && S.aim.k === m.turnNo && !shooterIsMe()) aim = { lx: S.aim.lx * PF.PEN.len / 2, dx: S.aim.dx, dy: S.aim.dy };
  if (aim) {
    const i = m.pens.findIndex(function (q) { return q.id === m.turn; });
    const p = poses[i];
    if (p && !p.out) drawAim(ctx, p, aim);
  }
  // name tags and reactions (screen space)
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.font = '700 12px "Nunito", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  m.pens.forEach(function (pen, i) {
    const p = poses[i]; if (!p || p.out) return;
    const sp = toScreen(p.x, p.y);
    const label = PF.nameOf(m, pen.id) + (pen.id === S.me && !isLocal() ? ' (you)' : '');
    const tw2 = ctx.measureText(label).width + 14;
    const ty = sp[1] - 26;
    ctx.fillStyle = m.turn === pen.id && m.phase === 'aim' ? 'rgba(255,210,63,.95)' : 'rgba(20,18,30,.72)';
    rr(ctx, sp[0] - tw2 / 2, ty - 10, tw2, 20, 10); ctx.fill();
    ctx.fillStyle = m.turn === pen.id && m.phase === 'aim' ? '#1d1a10' : '#fff';
    ctx.fillText(label, sp[0], ty + 0.5);
  });
  S.floats = S.floats.filter(function (f) { return now - f.t < 1800; });
  ctx.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  S.floats.forEach(function (f, j) {
    const i = m.pens.findIndex(function (q) { return q.id === f.pid; });
    const p = poses[i] || { x: 0, y: 0 };
    const sp = toScreen(p.x, p.y), e = (now - f.t) / 1800;
    ctx.globalAlpha = 1 - e * e;
    ctx.fillText(f.e, sp[0] + (j % 3 - 1) * 16, sp[1] - 46 - e * 60);
    ctx.globalAlpha = 1;
  });
}
function drawAim(ctx, pose, aim) {
  const c = Math.cos(pose.a), sn = Math.sin(pose.a);
  const gx = pose.x + c * aim.lx, gy = pose.y + sn * aim.lx;
  const p = Math.min(1, Math.hypot(aim.dx, aim.dy));
  if (p < 0.02) return;
  const ux = aim.dx / p, uy = aim.dy / p;
  const len = 0.45 + p * 2.6;
  const col = 'hsl(' + Math.round(130 - 130 * p) + ' 90% 52%)';
  if (aim.mine && drag.cur) {
    ctx.save(); ctx.setLineDash([0.08, 0.08]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(drag.cur[0], drag.cur[1]); ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(drag.cur[0], drag.cur[1], 0.09, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 6;
  const ex = gx + ux * len, ey = gy + uy * len;
  ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(ex - ux * 0.18, ey - uy * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 0.32 - uy * 0.17, ey - uy * 0.32 + ux * 0.17); ctx.lineTo(ex - ux * 0.32 + uy * 0.17, ey - uy * 0.32 - ux * 0.17); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(gx, gy, 0.07, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.font = '800 ' + (0.34) + 'px "Nunito", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 0.06; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.fillStyle = '#fff';
  const tx = ex + ux * 0.35, ty = ey + uy * 0.35;
  ctx.strokeText(Math.round(p * 100) + '%', tx, ty); ctx.fillText(Math.round(p * 100) + '%', tx, ty);
  ctx.restore();
}

/* ---------- flick input ---------- */
function evWorld(e) { const r = stage.canvas.getBoundingClientRect(); return toWorld(e.clientX - r.left, e.clientY - r.top); }
function myPose() {
  const m = match(); if (!m) return null;
  const i = m.pens.findIndex(function (q) { return q.id === m.turn; });
  const p = currentPoses()[i];
  return p && !p.out ? p : null;
}
function onDown(e) {
  if (!canShoot() || drag) return;
  const p = myPose(); if (!p) return;
  const w = evWorld(e);
  const c = Math.cos(p.a), sn = Math.sin(p.a);
  const rx = w[0] - p.x, ry = w[1] - p.y;
  const along = rx * c + ry * sn, perp = -rx * sn + ry * c;
  const hl = PF.PEN.len / 2;
  if (Math.abs(along) > hl + 0.35 || Math.abs(perp) > 0.55) {
    if (Math.hypot(rx, ry) > 1.4) { toast('Press on your own pen (the glowing one), then pull back.'); return; }
  }
  e.preventDefault();
  drag = { id: e.pointerId, lx: Math.max(-hl, Math.min(hl, along)), cur: null, vx: 0, vy: 0 };
  try { stage.canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  ac();
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!canShoot()) { onCancel(); return; }
  const p = myPose(); if (!p) return;
  const w = evWorld(e);
  const gx = p.x + Math.cos(p.a) * drag.lx, gy = p.y + Math.sin(p.a) * drag.lx;
  const dx = gx - w[0], dy = gy - w[1], d = Math.hypot(dx, dy);
  const pw = Math.min(1, d / DRAG_FULL);
  drag.cur = w;
  drag.vx = d > 0 ? dx / d * pw : 0; drag.vy = d > 0 ? dy / d * pw : 0;
  const now = performance.now();
  if (now - lastAimSent > 60) { lastAimSent = now; Net.aim({ lx: drag.lx / (PF.PEN.len / 2), dx: drag.vx, dy: drag.vy }); }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  onMove(e);
  const d = drag; drag = null;
  const pw = Math.hypot(d.vx, d.vy);
  if (!canShoot() || pw < 0.04) { Net.aim(null); return; }
  // The meter shows how far the pen will slide. Sliding distance grows with speed squared, so the flick strength is the square root of the pull.
  const k = Math.sqrt(pw) / pw;
  Net.shoot({ lx: d.lx, ix: d.vx * k * PF.MAX_IMPULSE, iy: d.vy * k * PF.MAX_IMPULSE });
  buzz(15);
}
function onCancel() { if (drag) { drag = null; Net.aim(null); } }

/* ---------- events → sound & effects ---------- */
let lastHitSound = 0;
onFrameEvents = function (fr) {
  const now = performance.now();
  if (fr.h > 0.08 && now - lastHitSound > 60) { lastHitSound = now; SFX.hit(Math.min(1, fr.h / 1.6)); }
  if (fr.fall && fr.fall.length) { SFX.fall(); const m = match(); if (m && fr.fall.some(function (i) { return m.pens[i] && m.pens[i].id === S.me; })) buzz([60, 40, 120]); }
};
onStateHook = function (prev, d) {
  const pm = prev && prev.match, m = d.match;
  if (!m) return;
  if (pm && pm.id === m.id) {
    if (pm.phase === 'aim' && m.phase === 'roll' && m.lastShot) SFX.flick(m.lastShot.power || 0.5);
    if (m.phase === 'aim' && (pm.turnNo !== m.turnNo || pm.phase !== 'aim') && (isLocal() || m.turn === S.me)) { SFX.turn(); if (!isLocal()) buzz(30); }
    if (pm.phase !== 'roundover' && m.phase === 'roundover') SFX.round();
    if (pm.phase !== 'over' && m.phase === 'over') SFX.win();
  } else if (m.phase === 'aim' && m.turn === S.me) SFX.turn();
};
function showReaction(pid, e) { S.floats.push({ pid: pid, e: e, t: performance.now() }); }

/* ================= screens ================= */
function hero(small) {
  const art = h('canvas', { class: 'heroart', id: 'heroArt', 'aria-hidden': 'true' });
  setTimeout(function () { drawHeroArt(art); }, 0);
  return h('header', { class: 'hero' + (small ? ' small' : '') },
    h('div', { class: 'herotext' },
      h('p', { class: 'kicker', text: 'The last-bench classic · 2–5 players' }),
      h('h1', { class: 'brand-big' }, 'Pen Fight', h('span', { class: 'dot', text: '!' })),
      small ? null : h('p', { class: 'tagline', text: 'Flick your pen, knock theirs off the desk. Last pen standing wins the round. Play with friends on your own phones.' })),
    small ? null : art);
}
function drawHeroArt(c) {
  if (!c.isConnected) return;
  const w = c.clientWidth || 260, hh = c.clientHeight || 150, dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr; c.height = hh * dpr;
  const ctx = c.getContext('2d');
  const s = (w * dpr) / 3.6;
  ctx.setTransform(s, 0, 0, s, (w * dpr) / 2, (hh * dpr) / 2);
  const g = ctx.createLinearGradient(-1.8, 0, 1.8, 0); g.addColorStop(0, '#a8703d'); g.addColorStop(1, '#ba8252');
  ctx.fillStyle = g; rr(ctx, -1.75, -hh / w * 1.75, 3.5, hh / w * 3.5, 0.12); ctx.fill();
  [['blue', -0.55, -0.2, 0.5], ['red', 0.6, 0.15, -0.35], ['pencil', -0.05, 0.38, 2.9]].forEach(function (p) {
    ctx.save(); ctx.translate(p[1], p[2]); ctx.rotate(p[3]); drawPen(ctx, PF.skinById(p[0])); ctx.restore();
  });
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.035; ctx.setLineDash([0.06, 0.06]);
  ctx.beginPath(); ctx.moveTo(-0.15, 0.13); ctx.quadraticCurveTo(0.15, 0.1, 0.3, 0.12); ctx.stroke();
}
function savedHost() { const s = storeJSON('host'); return s && s.room && s.savedAt && Date.now() - s.savedAt < 24 * 3600 * 1000 ? s : null; }
function homeScreen() {
  const nodes = [hero(false)];
  const invited = S.joinCode.length === 4;
  const sh = savedHost();
  if (sh) {
    nodes.push(h('section', { class: 'card resume' }, h('h3', { text: 'Match in progress' }),
      h('p', {}, 'You were hosting room ', h('strong', { class: 'code-inline', text: sh.room }), '.'),
      h('div', { class: 'row' }, btn('Resume hosting', function () { hostResume(sh); }, { kind: 'primary', id: 'resumeHost' }),
        confirmBtn('discard', 'Discard', 'Confirm: end that room', function () { storeJSON('host', null); render(); }))));
  }
  const nameIn = h('input', { id: 'nameIn', type: 'text', maxlength: '14', autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } });
  nodes.push(h('section', { class: 'card' }, h('h2', { text: invited ? 'You’re invited to room ' + S.joinCode : 'Who’s playing?' }),
    h('label', { class: 'lbl', for: 'nameIn', text: 'Name' }), nameIn,
    h('span', { class: 'lbl', text: 'Pick your pen' }),
    skinPicker('skinPick', S.skin, null, function (sk) { S.skin = sk; store('skin', sk); render(); })));
  const need = function () {
    const nm = cleanName(S.name);
    if (!nm) { setErr('Type your name first.'); const el = document.getElementById('nameIn'); if (el) el.focus(); return null; }
    S.err = '';
    if (!S.skin) { S.skin = PF.SKINS[hash(nm) % PF.SKINS.length].id; store('skin', S.skin); }
    store('name', nm);
    return nm;
  };
  const codeIn = h('input', { id: 'codeIn', type: 'text', autocapitalize: 'characters', autocomplete: 'off', maxlength: '4', placeholder: 'ABCD', 'aria-label': 'Room code', class: 'codein', value: S.joinCode,
    oninput: function (e) { const c = cleanCode(e.target.value); S.joinCode = c; if (e.target.value !== c) e.target.value = c; } });
  const joinForm = h('form', { class: 'joinrow', id: 'joinForm', onsubmit: function (e) {
    e.preventDefault();
    const nm = need(); if (!nm) return;
    const c = cleanCode(S.joinCode);
    if (c.length !== 4) { setErr('Room codes have 4 letters.'); return; }
    clientJoin(c, nm, S.skin);
  } }, codeIn, h('button', { class: 'btn primary', type: 'submit', id: 'joinBtn' }, 'Join room'));
  const create = btn('Create a room', function () { const nm = need(); if (!nm) return; hostCreate(nm, S.skin); }, { kind: invited ? 'ghost' : 'primary big', id: 'createBtn' });
  if (invited) nodes.push(card(h('h3', { text: 'Join room' }), joinForm, h('p', { class: 'hint', text: 'Or start your own:' }), create));
  else nodes.push(card(h('h3', { text: 'Play online' }), create, h('div', { class: 'or' }, h('span', { text: 'or join friends' })), joinForm));
  nodes.push(localCard());
  nodes.push(howCard());
  return nodes;
}
const LOCAL = { n: 2, names: ['', '', '', '', ''] };
function localCard() {
  const rows = [];
  for (let i = 0; i < LOCAL.n; i++) {
    const sk = PF.SKINS[i];
    rows.push(h('div', { class: 'lrow' }, penPreview(sk.id, 70, 18),
      h('input', { id: 'lname' + i, type: 'text', maxlength: '14', autocomplete: 'off', placeholder: i === 0 && S.name ? S.name : 'Player ' + (i + 1), 'aria-label': 'Player ' + (i + 1) + ' name', value: LOCAL.names[i], oninput: function (e) { LOCAL.names[i] = e.target.value; } })));
  }
  return h('details', { class: 'card', id: 'localD' }, h('summary', { class: 'sumh', text: 'Play on one device' }),
    h('p', { class: 'dim', text: 'Pass one phone around, or play side by side on a laptop.' }),
    seg('Players', 'localN', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], LOCAL.n, function (v) { LOCAL.n = v; render(); }),
    h('div', { class: 'lrows' }, rows),
    btn('Start', function () {
      const players = [];
      for (let i = 0; i < LOCAL.n; i++) players.push({ name: cleanName(LOCAL.names[i]) || (i === 0 && cleanName(S.name)) || 'Player ' + (i + 1), skin: PF.SKINS[i].id });
      localBegin(players, { target: 3, turnSecs: 0 });
    }, { kind: 'primary', id: 'localStart' }));
}
function howCard() {
  return h('details', { class: 'card how', id: 'howD' }, h('summary', { class: 'sumh', text: 'How to play' }),
    h('ol', { class: 'howlist' },
      h('li', {}, h('strong', { text: 'Your turn: ' }), 'press on your glowing pen, pull back like a slingshot, and let go. The further you pull, the harder the flick.'),
      h('li', {}, h('strong', { text: 'Where you grab matters: ' }), 'grab near the middle to shoot straight; grab near an end to make the pen spin as it flies.'),
      h('li', {}, h('strong', { text: 'Knock pens off the desk. ' }), 'A pen is out once its middle goes over the edge. Careful: flick too hard and yours goes off too.'),
      h('li', {}, h('strong', { text: 'Last pen on the desk ' }), 'wins the round. First to the target number of rounds wins the match.')));
}

/* ---------- room ---------- */
function joinUrl() { return location.origin + location.pathname + '#' + S.room; }
function copyLink() {
  const url = joinUrl();
  const fb = function () {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' }); ta.value = url; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove();
    toast(ok ? 'Link copied. Send it to your friends.' : 'Copy this link: ' + url);
  };
  try { navigator.clipboard.writeText(url).then(function () { toast('Link copied. Send it to your friends.'); }, fb); } catch (e) { fb(); }
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
          navigator.share ? btn('Share', function () { navigator.share({ title: 'Pen Fight', text: 'Pen fight! Room ' + S.room, url: joinUrl() }).catch(function () {}); }, { kind: 'ghost', id: 'shareBtn', icon: 'share' }) : null)),
      svg ? h('div', { class: 'qr', id: 'qr', html: svg, role: 'img', 'aria-label': 'QR code to join room ' + S.room }) : null));
}
function lobbyScreen() {
  const d = st(), roster = d.roster, host = S.isHost, n = roster.length;
  const nodes = [roomCard()];
  const seats = roster.map(function (r) {
    return h('div', { class: 'seat' + (r.on ? '' : ' off'), 'data-id': r.id }, penPreview(r.skin, 84, 20),
      h('span', { class: 'nm', text: r.name }), r.id === S.me ? h('em', { class: 'tag', text: 'you' }) : null, r.id === d.hostId ? h('em', { class: 'tag', text: 'host' }) : null,
      !r.on ? h('em', { class: 'tag warnt', text: 'offline' }) : null,
      host && r.id !== S.me ? h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + r.name, 'data-remove': r.id, onclick: function () { hostRemove(r.id); } }, icon('x', 14)) : null);
  });
  for (let i = n; i < PF.MAX_PLAYERS; i++) seats.push(h('div', { class: 'seat empty' }, h('span', { class: 'nm', text: 'Empty seat' })));
  const sc = card(h('div', { class: 'cardhead' }, h('h2', { text: 'The desk' }), h('span', { class: 'count', id: 'seatCount', text: n + ' / ' + PF.MAX_PLAYERS })),
    h('p', { class: 'dim', text: n < 2 ? 'Waiting for at least one friend.' : 'Ready to fight. More can still join.' }), h('div', { class: 'seats' }, seats));
  if (!S.me && !host) {
    const taken = {}; roster.forEach(function (r) { taken[r.skin] = true; });
    sc.appendChild(h('div', { class: 'sitbox' }, h('h3', { text: 'Take a seat' }),
      h('input', { id: 'sitName', type: 'text', maxlength: '14', placeholder: 'Your name', 'aria-label': 'Your name', value: S.name, oninput: function (e) { S.name = e.target.value; } }),
      skinPicker('sitSkin', S.skin, taken, function (sk) { S.skin = sk; render(); }),
      btn('Sit down', function () { if (!cleanName(S.name)) { setErr('Type your name first.'); return; } Net.sit(S.name, S.skin); }, { kind: 'primary', id: 'sitBtn', disabled: n >= PF.MAX_PLAYERS })));
  }
  nodes.push(sc);
  if (host) {
    nodes.push(card(h('h3', { text: 'Match rules' }),
      seg('First to win', 'cfgTarget', [[1, '1 round'], [2, '2'], [3, '3'], [5, '5']], d.cfg.target, function (v) { hostSetCfg({ target: v }); }),
      seg('Turn timer', 'cfgTimer', [[0, 'Off'], [20, '20 s'], [30, '30 s'], [45, '45 s']], d.cfg.turnSecs, function (v) { hostSetCfg({ turnSecs: v }); }),
      btn(n < 2 ? 'Need one more player' : 'Start the fight', function () { hostStart(); }, { kind: 'primary big', id: 'startBtn', disabled: n < 2 }),
      h('p', { class: 'hint', text: 'Your phone runs the game. Keep this page open and your screen on while you play.' }),
      confirmBtn('close', 'Close room', 'Confirm: close room for everyone', function () { Net.leave(); })));
  } else {
    nodes.push(card(h('p', { class: 'dim', id: 'waitHost', text: (S.me ? 'You’re in. ' : '') + 'First to ' + d.cfg.target + ' round' + (d.cfg.target > 1 ? 's' : '') + ' wins' + (d.cfg.turnSecs ? ', ' + d.cfg.turnSecs + ' seconds per turn' : '') + '. ' + nameOf(d.hostId) + ' starts the match.' }),
      confirmBtn('leave', S.me ? 'Leave the desk' : 'Leave room', 'Confirm: leave', function () { Net.leave(); })));
  }
  nodes.push(howCard());
  return nodes;
}

/* ---------- game ---------- */
function hud() {
  const m = match();
  const chips = m.players.map(function (p) {
    const pen = PF.penOf(m, p.id), r = rosterEntry(p.id);
    const out = pen && pen.out, active = m.turn === p.id && (m.phase === 'aim' || m.phase === 'roll');
    const pips = [];
    for (let i = 0; i < m.cfg.target; i++) pips.push(h('span', { class: 'pip' + (i < p.score ? ' on' : '') }));
    return h('div', { class: 'chip' + (active ? ' active' : '') + (out ? ' out' : '') + (r && !r.on && !isLocal() ? ' offline' : ''), 'data-id': p.id },
      h('span', { class: 'swatch', style: 'background:' + PF.skinById(p.skin).body }),
      h('span', { class: 'cn', text: p.name + (p.id === S.me && !isLocal() ? ' (you)' : '') }),
      h('span', { class: 'pips', 'aria-label': p.score + ' of ' + m.cfg.target + ' rounds' }, pips));
  });
  return h('div', { class: 'hud', id: 'hud' }, chips);
}
function statusText() {
  const m = match();
  if (m.phase === 'aim') {
    if (shooterIsMe()) return (isLocal() ? nameOf(m.turn) + ', your flick! ' : 'Your flick! ') + 'Press your glowing pen, pull back, let go.';
    return nameOf(m.turn) + ' is lining up a shot…';
  }
  if (m.phase === 'roll') return m.lastShot ? nameOf(m.lastShot.by) + ' flicked at ' + Math.round(m.lastShot.power * 100) + '% power!' : 'Flying…';
  if (m.phase === 'roundover') return m.roundWinner ? nameOf(m.roundWinner) + ' takes round ' + m.round + '!' : 'Draw! Everyone fell off.';
  return m.winner ? nameOf(m.winner) + ' wins the match!' : '';
}
function tickHud() {
  const d = st(); const m = match();
  const el = document.getElementById('timerFill'), txt = document.getElementById('timerTxt');
  if (el && d && m && m.phase === 'aim' && d.deadline && d.cfg.turnSecs) {
    const rem = Math.max(0, d.deadline - Date.now());
    el.style.width = (rem / (d.cfg.turnSecs * 1000) * 100).toFixed(1) + '%';
    el.classList.toggle('low', rem < 6000);
    if (txt) txt.textContent = Math.ceil(rem / 1000) + 's';
  }
  const nr = document.getElementById('nextIn');
  if (nr && d && d.nextRound) nr.textContent = 'Next round in ' + Math.max(0, Math.ceil((d.nextRound - Date.now()) / 1000)) + '…';
}
function stageOverlay() {
  const m = match(), ov = stage.overlay;
  clear(ov);
  ov.className = 'stage-ov';
  if (m.phase === 'roundover') {
    ov.classList.add('show');
    const w = m.roundWinner;
    add(ov, h('div', { class: 'ovcard', id: 'roundCard' },
      w ? penPreview(PF.penOf(m, w) ? m.players.find(function (p) { return p.id === w; }).skin : 'blue', 150, 36) : null,
      h('p', { class: 'ov-k', text: 'Round ' + m.round }),
      h('h2', { class: 'ov-t', id: 'roundTitle', text: w ? nameOf(w) + ' wins it!' : 'Draw!' }),
      h('p', { class: 'ov-s', text: w ? 'Last pen on the desk.' : 'Every pen fell. Nobody scores.' }),
      scoreList(m), h('p', { class: 'hint', id: 'nextIn', text: 'Next round soon…' })));
  } else if (m.phase === 'over') {
    ov.classList.add('show');
    const w = m.winner;
    const buttons = [];
    if (S.isHost) {
      buttons.push(btn('Rematch', hostRematch, { kind: 'primary big', id: 'rematchBtn' }));
      buttons.push(btn(isLocal() ? 'Exit' : 'Back to lobby', hostToLobby, { kind: 'ghost', id: 'lobbyBtn' }));
    } else {
      buttons.push(h('p', { class: 'hint', text: 'Waiting for ' + nameOf(st().hostId) + ' to start a rematch…' }));
      buttons.push(confirmBtn('leave2', 'Leave room', 'Confirm: leave', function () { Net.leave(); }));
    }
    add(ov, h('div', { class: 'ovcard win', id: 'overCard' }, icon('trophy', 44),
      h('p', { class: 'ov-k', text: 'Match over' }),
      h('h2', { class: 'ov-t', id: 'winner', text: nameOf(w) + (w === S.me && !isLocal() ? ' (you!)' : '') + ' is the desk champion' }),
      scoreList(m), h('div', { class: 'ovbtns' }, buttons)));
  }
}
function scoreList(m) {
  return h('ol', { class: 'scores' }, PF.standings(m).map(function (p) {
    const pips = []; for (let i = 0; i < m.cfg.target; i++) pips.push(h('span', { class: 'pip' + (i < p.score ? ' on' : '') }));
    return h('li', {}, h('span', { class: 'swatch', style: 'background:' + PF.skinById(p.skin).body }), h('span', { class: 'cn', text: p.name }), h('span', { class: 'pips' }, pips));
  }));
}
function gameScreen() {
  const m = match(), d = st();
  ensureStage();
  stageOverlay();
  const nodes = [hud(), stage.wrap];
  const timer = m.phase === 'aim' && d.cfg.turnSecs && d.deadline
    ? h('div', { class: 'timer' }, h('span', { class: 'tbar' }, h('span', { class: 'tfill', id: 'timerFill' })), h('span', { class: 'ttxt', id: 'timerTxt' })) : null;
  nodes.push(h('div', { class: 'status' + (shooterIsMe() && m.phase === 'aim' ? ' mine' : ''), id: 'status' }, h('span', { id: 'statusTxt', text: statusText() }), timer));
  const tools = [];
  if (!isLocal() && S.me) tools.push(h('div', { class: 'reacts', role: 'group', 'aria-label': 'Reactions' }, REACTIONS.map(function (e) { return h('button', { type: 'button', class: 'react', 'aria-label': 'React ' + e, onclick: function () { Net.react(e); } }, e); })));
  const hostBtns = [];
  if (S.isHost && m.phase === 'aim' && !shooterIsMe()) hostBtns.push(confirmBtn('skip', 'Skip ' + nameOf(m.turn) + '’s turn', 'Confirm: skip', hostSkip));
  if (S.isHost && m.phase !== 'over') hostBtns.push(confirmBtn('end', isLocal() ? 'Quit match' : 'End match', 'Confirm: end match', hostToLobby));
  if (!S.isHost && m.phase !== 'over') hostBtns.push(confirmBtn('leave', 'Leave room', 'Confirm: leave', function () { Net.leave(); }));
  if (S.isHost && !isLocal() && m.phase !== 'over') {
    const kickable = m.players.filter(function (p) { const r = rosterEntry(p.id); const pen = PF.penOf(m, p.id); return p.id !== S.me && r && !r.on && pen && !pen.out; });
    kickable.forEach(function (p) { hostBtns.push(confirmBtn('rm' + p.id, 'Remove ' + p.name + ' (offline)', 'Confirm: remove', function () { hostRemove(p.id); })); });
  }
  tools.push(h('div', { class: 'row tools' }, hostBtns));
  const last = m.log[m.log.length - 1];
  if (last) tools.push(h('p', { class: 'ticker', id: 'ticker', text: last }));
  nodes.push(h('div', { class: 'below' }, tools));
  return nodes;
}
function roomScreen() {
  const d = st();
  if (!d) return [roomCard(), card(h('p', { class: 'dim', id: 'loading', text: S.conn === 'failed' ? 'Could not join this room.' : 'Connecting to room ' + S.room + '…' }), btn('Back', function () { Net.leave(); }, { kind: 'ghost', id: 'backHome' }))];
  if (!d.match) return lobbyScreen();
  if (!S.me && !isLocal()) {
    return [h('p', { class: 'watching', id: 'watching', text: 'A match is on. You’re watching; sit down when it ends.' })].concat(gameScreen());
  }
  return gameScreen();
}

/* ================= shell ================= */
function setTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
function renderHeader() {
  clear(hdrEl);
  const m = match();
  let chip = '';
  if (S.screen === 'local') chip = 'One device';
  else if (S.screen === 'room') chip = m ? S.room + ' · R' + m.round : 'Room ' + S.room;
  add(hdrEl,
    h('button', { type: 'button', class: 'hbrand', 'aria-label': 'Pen Fight', onclick: function () {} }, h('span', { class: 'logo', text: 'Pen Fight' })),
    chip ? h('span', { class: 'chip', id: 'chip', text: chip }) : null,
    h('div', { class: 'htools' },
      h('a', { class: 'iconlink', href: '../', text: 'Mafia' }),
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
function screen() {
  if (S.screen === 'local') return S.st && S.st.match ? gameScreen() : homeScreen();
  if (S.screen === 'room') return roomScreen();
  return homeScreen();
}
const OPEN = {};
function captureFocus() { const a = document.activeElement; if (!a || !a.id || !(a.tagName === 'INPUT' || a.tagName === 'SELECT')) return null; return { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd }; }
function restoreFocus(k) {
  if (!k) return; const el = document.getElementById(k.id); if (!el) return;
  if (el.value !== k.v) el.value = k.v;
  try { el.focus({ preventScroll: true }); if (k.s !== null && el.setSelectionRange) el.setSelectionRange(k.s, k.e); } catch (e) { /* ignore */ }
}
let wakeLock = null;
function syncWake() {
  const want = (S.screen === 'room' || S.screen === 'local') && !!match() && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }, function () {});
    else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { /* optional */ }
}
render = function () {
  if (!root) return;
  const keep = captureFocus();
  document.documentElement.classList.toggle('ingame', !!match() && S.screen !== 'home');
  renderHeader(); renderConn();
  clear(mainEl);
  if (S.err) mainEl.appendChild(h('div', { class: 'err', role: 'alert', id: 'errBar' }, h('span', { text: S.err }), h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { S.err = ''; render(); } }, icon('x', 16))));
  screen().forEach(function (n) { add(mainEl, n); });
  mainEl.querySelectorAll('details[id]').forEach(function (d) {
    if (Object.prototype.hasOwnProperty.call(OPEN, d.id)) d.open = OPEN[d.id];
    d.addEventListener('toggle', function () { OPEN[d.id] = d.open; });
  });
  toastEl.hidden = !S.toast; toastEl.textContent = S.toast;
  restoreFocus(keep);
  tickHud(); syncWake();
};
function boot() {
  root = document.getElementById('app');
  const t = store('theme'); if (t) setTheme(t);
  hdrEl = h('header', { class: 'hdr', id: 'hdr' });
  connEl = h('div', { class: 'connwrap', id: 'conn', hidden: true });
  mainEl = h('main', { class: 'main', id: 'main' });
  toastEl = h('div', { class: 'toast', id: 'toast', role: 'status', hidden: true });
  add(root, hdrEl, connEl, mainEl);
  document.body.appendChild(toastEl);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') onCancel(); });
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
    if (store('tok.' + code) && cleanName(S.name)) { clientJoin(code, S.name, S.skin); return; }
  }
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
window.__pf = { S: S, H: H, C: C, PF: PF,
  // test/debug helper: page coordinates of a pen's centre (and its axis) on the desk
  penScreen: function (id) {
    const m = match(); if (!m || !stage) return null;
    const i = m.pens.findIndex(function (q) { return q.id === id; }); const p = currentPoses()[i]; if (!p) return null;
    const r = stage.canvas.getBoundingClientRect(), sp = toScreen(p.x, p.y);
    return { x: r.left + sp[0], y: r.top + sp[1], a: p.a, out: p.out, scale: stage.scale };
  } };
