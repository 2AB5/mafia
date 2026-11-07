/* ===== View: what this screen shows. Other players and the shuttle are smoothed from the host's frames;
   your own figure moves instantly from your controls. ===== */
const KIND_NAMES = BD.NAMES;
const View = (function () {
  const DELAY = 0.075;                                   // seconds of smoothing for remote frames
  const V = { m: null, frames: [], me: null, off: null, rn: -1, pops: [], land: null, landKey: '', lastEv: 0, trail: [] };
  V.reset = function () { V.m = null; V.frames = []; V.me = null; V.off = null; V.rn = -1; V.pops = []; V.land = null; V.trail = []; V.lastEv = 0; };
  V.state = function (d) {
    const m = d.match;
    if (!m) { V.m = null; V.me = null; return; }
    if (!V.m || V.m.id !== m.id) { V.frames = []; V.off = null; V.rn = -1; V.pops = []; V.lastEv = m.evN || 0; V.me = null; }
    V.m = m;
    const p = m.players.find(function (q) { return q.id === S.me && !q.left; });
    if (p && !V.me) V.me = { x: p.x, y: p.y };
    if (!p) V.me = null;
  };
  // host time ≈ local time + offset (smoothed, so frames play back evenly)
  V.frame = function (fr, isHost) {
    const now = performance.now() / 1000;
    if (!isHost) {
      const o = fr.ts - now;
      V.off = V.off === null ? o : (o > V.off ? V.off + (o - V.off) * 0.2 : V.off + (o - V.off) * 0.02);
    }
    V.frames.push({ ts: fr.ts, f: fr });
    if (V.frames.length > 40) V.frames.splice(0, V.frames.length - 40);
    if (V.m) {
      V.m.phase = fr.ph; V.m.server = fr.sv; V.m.lastHitTeam = fr.lh;
      const pz = fr.pz ? fr.pz.join(':') : '';
      if (pz !== V.pzKey) { V.pzKey = pz; V.pz = fr.pz; Breaks.update(); }
      if (fr.r !== V.rn) {
        V.rn = fr.r;
        // new serve: everyone is placed by the host
        const i = V.m.players.findIndex(function (q) { return q.id === S.me; });
        if (i !== -1 && V.me && fr.p[i]) { V.me.x = fr.p[i][0]; V.me.y = fr.p[i][1]; }
        V.land = null; V.trail = [];
      }
    }
    (fr.e || []).forEach(function (e) { if (e.n > V.lastEv) { V.lastEv = e.n; onEvent(e); } });
  };
  V.pong = function () { /* round trips are not needed: frames carry host time */ };
  V.renderTs = function () {
    if (S.isHost && H.match) return H.match.t;
    if (V.off === null) return V.frames.length ? V.frames[V.frames.length - 1].ts : 0;
    return performance.now() / 1000 + V.off - DELAY;
  };
  /* everything to draw right now */
  V.now = function () {
    const m = V.m; if (!m) return null;
    if (S.isHost && H.match) {
      const hm = H.match;
      return { shuttle: hm.shuttle, landed: !!hm.landed, players: hm.players.map(function (p) { return { id: p.id, x: p.x, y: p.y, energy: p.energy, swing: p.swing, kind: p.swingKind, hand: p.hand, side: p.side, left: p.left }; }) };
    }
    const fs = V.frames; if (!fs.length) return null;
    const t = V.renderTs();
    let a = fs[0], b = fs[0];
    for (let i = 0; i < fs.length; i++) { if (fs[i].ts <= t) { a = fs[i]; b = fs[i + 1] || fs[i]; } }
    const span = b.ts - a.ts, k = span > 0 ? Math.max(0, Math.min(1, (t - a.ts) / span)) : 1;
    const A = a.f, B = b.f;
    const lerp = function (u, v) { return u + (v - u) * k; };
    let sh;
    if (A.r !== B.r || A.s[6] !== B.s[6]) sh = { x: B.s[0], y: B.s[1], z: B.s[2], vx: B.s[3], vy: B.s[4], vz: B.s[5], held: !!B.s[6] };
    else sh = { x: lerp(A.s[0], B.s[0]), y: lerp(A.s[1], B.s[1]), z: lerp(A.s[2], B.s[2]), vx: B.s[3], vy: B.s[4], vz: B.s[5], held: !!B.s[6] };
    // past the newest frame: keep flying the shuttle with the real physics so it never freezes
    if (t > B.ts && !sh.held && !B.s[7]) { const s2 = { x: B.s[0], y: B.s[1], z: B.s[2], vx: B.s[3], vy: B.s[4], vz: B.s[5] }; const dt = Math.min(0.2, t - B.ts); for (let x = 0; x < dt; x += BD.DT) BD.stepShuttle(s2, BD.DT); if (s2.z > 0) sh = Object.assign(sh, s2); }
    const players = m.players.map(function (p, i) {
      const pa = A.p[i], pb = B.p[i] || pa;
      if (!pa) return { id: p.id, x: p.x, y: p.y, energy: 100, swing: 0, kind: '', side: p.side, left: p.left };
      const o = { id: p.id, x: A.r !== B.r ? pb[0] : lerp(pa[0], pb[0]), y: A.r !== B.r ? pb[1] : lerp(pa[1], pb[1]), energy: pb[2], swing: pb[3] / 100, kind: KIND_CODE[pb[4]] || '', hand: pb[5] ? 'back' : 'fore', side: p.side, left: p.left };
      if (p.id === S.me && V.me) { o.x = V.me.x; o.y = V.me.y; }
      return o;
    });
    return { shuttle: sh, landed: !!B.s[7], players: players };
  };
  /* move my own figure locally (clients only; the host moves straight in the match) */
  V.tickMe = function (dt) {
    if (S.isHost || !V.m || !V.me) return;
    const p = V.m.players.find(function (q) { return q.id === S.me; }); if (!p) return;
    if (V.m.phase === 'over' || V.pz) return;
    if (V.m.phase === 'serve' && V.m.server === p.id) return;
    const last = V.frames.length ? V.frames[V.frames.length - 1].f : null;
    const i = V.m.players.indexOf(p);
    const ghost = { id: p.id, side: p.side, x: V.me.x, y: V.me.y, energy: last && last.p[i] ? last.p[i][2] : 100 };
    let t = Input.target(V.m, ghost, dt);
    if (window.__bdAuto) t = autopilot(ghost, dt) || t;
    if (!t) return;
    ghost.x = t[0]; ghost.y = t[1];
    BD.clampToSide(V.m, ghost);
    V.me.x = ghost.x; V.me.y = ghost.y;
  };
  /* test hook: play my own figure with the bot's brain, sending the same moves and swings a person would */
  const autoMem = {};
  function autopilot(ghost, dt) {
    const n = V.now(); if (!n || !n.shuttle) return null;
    const last = V.frames[V.frames.length - 1]; if (!last) return null;
    const pm = Object.assign({}, V.m, { shuttle: n.shuttle, landed: n.landed ? {} : null, t: V.renderTs(), rallyHits: last.f.rh || 0, players: V.m.players.map(function (p) { const q = n.players.find(function (x) { return x.id === p.id; }); return Object.assign({}, p, q || {}); }) });
    const me = pm.players.find(function (p) { return p.id === ghost.id; }); me.x = ghost.x; me.y = ghost.y; me.bot = window.__bdAuto;
    const th = BD.botThink(pm, me, Math.random, autoMem);
    if (th.hit && performance.now() - (autoMem.lastSwing || 0) > 250) { autoMem.lastSwing = performance.now(); Net.swing(th.hit.button, th.hit.aim); }
    return [ghost.x + th.mx * dt, ghost.y + th.my * dt];
  }
  function onEvent(e) {
    const m = V.m; if (!m) return;
    const mine = e.by && e.by === S.me;
    const p = e.by ? m.players.find(function (q) { return q.id === e.by; }) : null;
    const pos = function () { const n = V.now(); if (!n) return null; const q = n.players.find(function (x) { return x.id === e.by; }); return q ? [q.x, q.y] : null; };
    if (e.k === 'hit') {
      if (e.kind === 'smash') SFX.smash(); else SFX.hit(e.kind === 'clear' || e.kind === 'serveLong' ? 0.8 : e.kind === 'drive' ? 0.6 : 0.3);
      if (mine) buzz(e.kind === 'smash' ? 35 : 15);
      const at = pos();
      if (at) {
        if (e.kind === 'smash') pop((e.jump ? 'JUMP SMASH ' : '💥 ') + e.speed + ' km/h', at, '#ff5a4a');
        else if (e.kind && e.kind.indexOf('serve') === 0) pop(KIND_NAMES[e.kind], at, '#ffffff');
        else if (mine || e.perfect) pop((e.perfect ? 'Perfect! ' : '') + (KIND_NAMES[e.kind] || '') + (e.hand === 'back' ? ' (backhand)' : ''), at, e.perfect ? '#ffd23f' : '#ffffff');
      }
      V.land = null; V.trail = [];
    } else if (e.k === 'whiff') { if (mine) { SFX.whiff(); const at = pos(); if (at) pop('Missed!', at, '#bbbbbb'); } }
    else if (e.k === 'break') { SFX.serve(); }
    else if (e.k === 'play') { SFX.serve(); }
    else if (e.k === 'net') { SFX.net(); pop('NET', [0, 0], '#ff7a6e'); }
    else if (e.k === 'point') {
      const myTeam = p ? null : null; void myTeam;
      const meP = m.players.find(function (q) { return q.id === S.me; });
      SFX.point(meP ? meP.side === e.side : true);
      if (e.at) pop(e.reason === 'in' ? 'IN' : e.reason === 'net' ? 'NET' : e.reason === 'serve' ? 'FAULT' : 'OUT', e.at, e.reason === 'in' ? '#7CFC9A' : '#ff7a6e', 1.6);
    } else if (e.k === 'serve') { if (e.by === S.me) SFX.serve(); }
  }
  function pop(text, at, color, life) { V.pops.push({ text: text, x: at[0], y: at[1], color: color, t: performance.now(), life: (life || 1.1) * 1000 }); if (V.pops.length > 12) V.pops.shift(); }
  V.pop = pop;
  return V;
})();

/* ===== Input: joystick (touch), keyboard, and the three shot buttons ===== */
const Input = (function () {
  const I = { jx: 0, jy: 0, keys: {}, stick: null, orient: 'port', sv: [0, 0], capture: null };
  /* key bindings: one rebindable key per action; the arrow keys always move as well */
  const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', clear: 'KeyJ', drop: 'KeyK', smash: 'KeyL' };
  const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  I.ACTIONS = [['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'], ['clear', 'Clear / lift'], ['drop', 'Drop / net shot'], ['smash', 'Smash / drive']];
  I.binds = Object.assign({}, DEFAULT_KEYS, storeJSON('keys') || {});
  I.saveBinds = function () { storeJSON('keys', I.binds); };
  I.resetBinds = function () { I.binds = Object.assign({}, DEFAULT_KEYS); storeJSON('keys', null); };
  I.keyName = function (code) {
    if (!code) return '–';
    const named = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Tab: 'Tab', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    if (named[code]) return named[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
    return code;
  };
  function down(action) { const k = I.keys; return !!(k[I.binds[action]] || (ARROWS[action] && k[ARROWS[action]])); }
  /* touch sensitivity: how far you drag for full speed, and how quickly movement follows your thumb */
  // 0 = smoothest … 100 = the original: instant, linear, short drag
  I.sens = function () {
    const v = Math.max(0, Math.min(100, Number(S.sens))), t = v / 100;
    return { r: Math.round(72 - 20 * t), ease: v >= 100 ? Infinity : 6 + t * t * 34, curve: 1.5 - 0.5 * t, dead: 0.14 - 0.06 * t };
  };
  function raw() {
    const kx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), ky = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
    if (kx || ky) { const d = Math.hypot(kx, ky); return [kx / d, ky / d, true]; }
    // joystick: dead zone near the centre, then a gentle curve for fine control
    const m = Math.min(1, Math.hypot(I.jx, I.jy)), sv = I.sens();
    if (m < sv.dead) return [0, 0, false];
    const f = Math.pow((m - sv.dead) / (1 - sv.dead), sv.curve) / m;
    return [I.jx * f, I.jy * f, false];
  }
  function vec(dt) {
    const r = raw();
    // ease toward the input so starts and stops are smooth instead of jerky
    const letGo = !r[0] && !r[1];
    const ease = r[2] ? Math.max(14, I.sens().ease) : I.sens().ease;
    const k = ease === Infinity ? 1 : Math.min(1, (dt || 0.016) * ease * (letGo ? 3 : 1));     // stopping is quicker than starting
    I.sv[0] += (r[0] - I.sv[0]) * k; I.sv[1] += (r[1] - I.sv[1]) * k;
    if (Math.abs(I.sv[0]) < 0.01 && Math.abs(I.sv[1]) < 0.01 && !r[0] && !r[1]) I.sv = [0, 0];
    return I.sv;
  }
  // screen direction → my own frame (right, forward)
  function frame(dt) { const v = dt === undefined ? I.sv : vec(dt); return I.orient === 'port' ? [v[0], -v[1]] : [v[1], v[0]]; }
  I.aim = function () { const r = raw(); const v = (r[0] || r[1]) ? r : I.sv; return I.orient === 'port' ? [v[0], -v[1]] : [v[1], v[0]]; };
  I.target = function (m, p, dt) {
    const f = frame(dt); const mag = Math.min(1, Math.hypot(f[0], f[1]));
    if (mag < 0.03) return null;
    const s = p.side === 0 ? 1 : -1;
    const wx = f[0] * s, wy = -f[1] * s, d = Math.hypot(wx, wy) || 1;
    const sp = BD.speedCap(m, p) * mag;
    return [p.x + wx / d * sp * dt, p.y + wy / d * sp * dt];
  };
  I.press = function (button) {
    if (!View.m || !View.me && !(S.isHost && H.match && BD.playerOf(H.match, H.myId))) return;
    Net.swing(button);
    const el = document.getElementById('btn-' + button); if (el) { el.classList.add('hit'); setTimeout(function () { el.classList.remove('hit'); }, 140); }
  };
  function shotFor(code) { return ['clear', 'drop', 'smash'].find(function (a) { return I.binds[a] === code; }) || null; }
  function playing() { return S.screen === 'room' && View.m && View.m.phase !== 'over' && (View.me || (S.isHost && H.match && BD.playerOf(H.match, H.myId))); }
  window.addEventListener('keydown', function (e) {
    // waiting for a new key binding?
    if (I.capture) {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') {
        const act = I.capture;
        Object.keys(I.binds).forEach(function (a) { if (a !== act && I.binds[a] === e.code) I.binds[a] = I.binds[act]; });   // swap if taken
        I.binds[act] = e.code; I.saveBinds();
      }
      I.capture = null; render(); return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!playing()) return;
    const shot = shotFor(e.code);
    if (shot) { e.preventDefault(); if (!e.repeat) I.press(shot); return; }
    const moves = Object.keys(ARROWS).some(function (a) { return I.binds[a] === e.code || ARROWS[a] === e.code; });
    if (moves) { e.preventDefault(); I.keys[e.code] = true; }
  }, true);
  window.addEventListener('keyup', function (e) { delete I.keys[e.code]; });
  window.addEventListener('blur', function () { I.keys = {}; I.jx = I.jy = 0; });
  /* a floating joystick: put your thumb down anywhere in the zone and drag */
  I.bindStick = function (zone, knobEl) {
    zone.addEventListener('pointerdown', function (e) {
      if (I.stick) return;
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      I.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      knobEl.style.display = 'block'; place(knobEl, zone, e.clientX, e.clientY, e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', function (e) {
      const st = I.stick; if (!st || st.id !== e.pointerId) return;
      e.preventDefault();
      const R = I.sens().r;
      let dx = e.clientX - st.ox, dy = e.clientY - st.oy; const d = Math.hypot(dx, dy);
      if (d > R) { st.ox += dx * (1 - R / d); st.oy += dy * (1 - R / d); dx = e.clientX - st.ox; dy = e.clientY - st.oy; }
      I.jx = dx / R; I.jy = dy / R;
      place(knobEl, zone, st.ox, st.oy, e.clientX, e.clientY);
    });
    // let go however the touch ends: lifted, cancelled by the system, or capture lost
    const end = function (e) { const st = I.stick; if (!st || (e && e.pointerId !== undefined && st.id !== e.pointerId)) return; I.stick = null; I.jx = I.jy = 0; knobEl.style.display = 'none'; };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { zone.addEventListener(t, end); window.addEventListener(t, end); });
    window.addEventListener('blur', function () { end(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'visible') end(); });
    zone.addEventListener('touchend', function (e) { if (!e.touches || !e.touches.length) end(); });
    ['selectstart', 'contextmenu', 'dragstart'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); }); });
  };
  function place(knob, zone, ox, oy, x, y) {
    const r = zone.getBoundingClientRect();
    knob.style.left = (ox - r.left) + 'px'; knob.style.top = (oy - r.top) + 'px';
    const dot = knob.firstChild; if (dot) { dot.style.transform = 'translate(' + (x - ox) + 'px,' + (y - oy) + 'px)'; }
  }
  return I;
})();

/* ===== Court: the top-down renderer with the shuttle's height, shadow, reach ring, landing guide and height meter ===== */
const Court = (function () {
  const T = { canvas: null, ctx: null, wrap: null, w: 0, h: 0, dpr: 1, sc: 1, cx: 0, cy: 0, orient: 'port', flip: 1, last: 0 };
  const TEAM = ['#3f7bff', '#ff5c72'];
  function ensure() {
    if (T.wrap) return T.wrap;
    T.canvas = h('canvas', { id: 'court', class: 'court', 'aria-label': 'Badminton court' });
    T.ctx = T.canvas.getContext('2d');
    T.wrap = h('div', { class: 'courtwrap', id: 'courtWrap', tabindex: '-1' }, T.canvas);
    requestAnimationFrame(loop);
    return T.wrap;
  }
  function size() {
    const r = T.wrap.getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), hh = Math.max(200, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== T.w || hh !== T.h || dpr !== T.dpr) { T.w = w; T.h = hh; T.dpr = dpr; T.canvas.width = Math.round(w * dpr); T.canvas.height = Math.round(hh * dpr); T.canvas.style.width = w + 'px'; T.canvas.style.height = hh + 'px'; }
    T.orient = w > hh * 1.15 ? 'land' : 'port';
    Input.orient = T.orient;
    // fit the court plus run-off; leave room on the right for the height meter
    const meterW = 46;
    // in landscape the shot buttons sit in a strip on the right, so the court moves over to leave them room
    T.reserve = T.orient === 'land' && document.getElementById('controls') ? Math.min(270, Math.round(w * 0.3)) : 0;
    const cw = w - T.reserve;
    if (T.orient === 'port') { T.sc = Math.min((w - meterW) / 7.8, hh / 16.2); T.cx = (w - meterW) / 2; T.cy = hh / 2 + T.sc * 0.4; }
    else { T.sc = Math.min((cw - meterW) / 16.6, (hh - 10) / 7.9); T.cx = (cw - meterW) / 2; T.cy = hh / 2 + T.sc * 0.35; }
    const me = View.m && View.m.players.find(function (p) { return p.id === S.me; });
    T.flip = me && me.side === 1 ? -1 : 1;
  }
  // world (x, y, z) → screen; my side is always nearest (bottom in portrait, left in landscape)
  function P(x, y, z) {
    const X = x * T.flip, Y = y * T.flip, lift = (z || 0) * T.sc * 0.42;
    if (T.orient === 'port') return [T.cx + X * T.sc, T.cy + Y * T.sc - lift];
    return [T.cx - Y * T.sc, T.cy + X * T.sc - lift];
  }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function rect(ctx, x0, y0, x1, y1) { const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); }
  function drawCourt(ctx, m) {
    const C = BD.C, W = BD.halfW(m), WD = C.wD, WS = C.wS;
    // floor and the court mat
    ctx.fillStyle = '#16324a'; ctx.fillRect(0, 0, T.w, T.h);
    rect(ctx, -WD - 0.6, -C.half - 0.9, WD + 0.6, C.half + 0.9); ctx.fillStyle = '#1c4466'; ctx.fill();
    rect(ctx, -WD, -C.half, WD, C.half); ctx.fillStyle = '#1f7a55'; ctx.fill();
    if (m.mode === '1v1') { rect(ctx, -WD, -C.half, -WS, C.half); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill(); rect(ctx, WS, -C.half, WD, C.half); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = Math.max(1.5, T.sc * 0.05);
    rect(ctx, -WD, -C.half, WD, C.half); ctx.stroke();
    line(ctx, P(-WS, -C.half), P(-WS, C.half)); line(ctx, P(WS, -C.half), P(WS, C.half));
    [1, -1].forEach(function (s) {
      line(ctx, P(-WD, s * C.short), P(WD, s * C.short));
      line(ctx, P(0, s * C.short), P(0, s * C.half));
      ctx.save(); if (m.mode === '1v1') ctx.globalAlpha = 0.35; line(ctx, P(-WD, s * C.longD), P(WD, s * C.longD)); ctx.restore();
    });
    void W;
  }
  function drawNet(ctx) {
    const a = P(-BD.C.wD - 0.15, 0, 0), b = P(BD.C.wD + 0.15, 0, 0), a2 = P(-BD.C.wD - 0.15, 0, BD.C.net), b2 = P(BD.C.wD + 0.15, 0, BD.C.net);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(a2[0], a2[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const u = i / 6; line(ctx, [a[0] + (a2[0] - a[0]) * u, a[1] + (a2[1] - a[1]) * u], [b[0] + (b2[0] - b[0]) * u, b[1] + (b2[1] - b[1]) * u]); }
    ctx.strokeStyle = '#f4f6fb'; ctx.lineWidth = Math.max(2, T.sc * 0.07); line(ctx, a2, b2);
    ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = Math.max(3, T.sc * 0.08); line(ctx, a, a2); line(ctx, b, b2);
  }
  function drawPlayer(ctx, m, p, info, now) {
    const pl = m.players.find(function (q) { return q.id === p.id; }); if (!pl || p.left) return;
    const g = P(p.x, p.y, 0), r = T.sc * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(g[0], g[1] + r * 0.25, r * 1.1, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // racket: points toward the net, swings across the body when hitting
    const toNet = (p.side === 0 ? -1 : 1);
    const f = P(p.x, p.y + toNet * 1, 0); const ang = Math.atan2(f[1] - g[1], f[0] - g[0]);
    const right = ang + Math.PI / 2;
    const sw = p.swing > 0 ? 1 - p.swing / 0.32 : -1;
    let ra = ang + (p.hand === 'back' ? -0.9 : 0.9);
    if (sw >= 0) ra = ang + (p.hand === 'back' ? -1.6 + sw * 2.4 : 1.6 - sw * 2.4);
    const sx = g[0] + Math.cos(right) * r * (p.hand === 'back' ? -0.6 : 0.6), sy = g[1] - r * 0.3 + Math.sin(right) * r * (p.hand === 'back' ? -0.6 : 0.6);
    const L = T.sc * 0.62, hx = sx + Math.cos(ra) * L, hy = sy + Math.sin(ra) * L;
    ctx.strokeStyle = '#d9dde6'; ctx.lineWidth = Math.max(1.5, T.sc * 0.04); line(ctx, [sx, sy], [hx, hy]);
    ctx.beginPath(); ctx.ellipse(hx + Math.cos(ra) * T.sc * 0.12, hy + Math.sin(ra) * T.sc * 0.12, T.sc * 0.13, T.sc * 0.1, ra, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, T.sc * 0.035); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
    // body
    ctx.fillStyle = TEAM[p.side]; ctx.beginPath(); ctx.arc(g[0], g[1] - r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = p.id === S.me ? 3 : 1.5; ctx.strokeStyle = p.id === S.me ? '#ffd23f' : 'rgba(255,255,255,.8)'; ctx.stroke();
    // name and energy
    const name = pl.name + (pl.bot ? ' 🤖' : '') + (p.id === S.me ? ' (you)' : '');
    ctx.font = '800 ' + Math.max(10, Math.round(T.sc * 0.24)) + 'px "Nunito", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = g[1] - r * 1.9, tw = ctx.measureText(name).width + 12;
    ctx.fillStyle = 'rgba(10,14,24,.72)'; roundRect(ctx, g[0] - tw / 2, ty - 9, tw, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(name, g[0], ty + 0.5);
    const bw = Math.max(26, T.sc * 0.8), by = ty + 12;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(g[0] - bw / 2, by, bw, 4);
    ctx.fillStyle = p.energy > 50 ? '#5fd08a' : p.energy > 25 ? '#ffd23f' : '#ff6b5b'; ctx.fillRect(g[0] - bw / 2, by, bw * p.energy / 100, 4);
    if (m.phase === 'serve' && m.server === p.id) { ctx.font = Math.round(T.sc * 0.32) + 'px system-ui'; ctx.fillText('🏸', g[0] + r * 1.4, g[1] - r * 1.2); }
    void info; void now;
  }
  function roundRect(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawShuttle(ctx, s, landed) {
    if (!s) return;
    const g = P(s.x, s.y, 0), a = P(s.x, s.y, s.z);
    // shadow on the floor, a faint height line, then the shuttle itself
    const big = 1 + Math.min(1.2, s.z * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.45 - s.z * 0.06) + ')'; ctx.beginPath(); ctx.ellipse(g[0], g[1], T.sc * 0.12 * big, T.sc * 0.07 * big, 0, 0, Math.PI * 2); ctx.fill();
    if (s.z > 0.15) { ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; line(ctx, g, a); ctx.setLineDash([]); }
    const tr = View.trail;
    const sp = Math.hypot(s.vx || 0, s.vy || 0, s.vz || 0);
    if (sp > 12 && !landed) { tr.push(a); if (tr.length > 10) tr.shift(); } else if (tr.length) tr.shift();
    if (tr.length > 1) { ctx.strokeStyle = 'rgba(255,240,200,.45)'; ctx.lineWidth = T.sc * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tr[0][0], tr[0][1]); for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke(); }
    // cork points the way it flies, feathers trail behind
    const nx = P(s.x + (s.vx || 0) * 0.02, s.y + (s.vy || 0) * 0.02, s.z + (s.vz || 0) * 0.02);
    let ang = Math.atan2(nx[1] - a[1], nx[0] - a[0]); if (!isFinite(ang) || sp < 0.5) ang = -Math.PI / 2;
    const L = T.sc * 0.26 * big;
    ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(0, -L * 0.2); ctx.lineTo(-L, -L * 0.55); ctx.lineTo(-L, L * 0.55); ctx.lineTo(0, L * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,150,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(L * 0.08, 0, L * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#c9a26b'; ctx.stroke();
    ctx.restore();
  }
  function meReach(ctx, m, n, mine) {
    if (!mine || m.phase !== 'rally' || !n.shuttle) return;
    const g = P(mine.x, mine.y, 0);
    const ghost = { id: mine.id, side: mine.side, x: mine.x, y: mine.y, energy: mine.energy };
    const q = BD.hittable(Object.assign({}, m, { lastHitTeam: m.lastHitTeam }), ghost, n.shuttle);
    const incoming = m.lastHitTeam !== mine.side;
    if (!incoming && !q) return;
    ctx.lineWidth = q ? 3 : 1.5;
    ctx.strokeStyle = q ? 'rgba(124,252,154,.9)' : 'rgba(255,255,255,.25)';
    ctx.setLineDash(q ? [] : [5, 6]);
    ctx.beginPath(); ctx.ellipse(g[0], g[1], BD.REACH * T.sc, BD.REACH * T.sc * (T.orient === 'port' ? 1 : 1), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  function guide(ctx, m, n) {
    if (!S.guide || !n.shuttle || n.shuttle.held || n.landed || m.phase !== 'rally') return;
    const s = n.shuttle;
    const key = Math.round(s.vx * 10) + ':' + Math.round(s.vy * 10) + ':' + (m.lastHitTeam);
    if (!View.land || performance.now() - View.land.at > 200) View.land = { at: performance.now(), f: BD.fly({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz }, 6), key: key };
    const f = View.land.f; if (!f) return;
    const g = P(f.x, f.y, 0), out = !BD.inBounds(m, f.x, f.y), r = T.sc * 0.22;
    ctx.strokeStyle = out ? 'rgba(255,122,110,.75)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    line(ctx, [g[0] - r, g[1] - r * 0.6], [g[0] + r, g[1] + r * 0.6]); line(ctx, [g[0] + r, g[1] - r * 0.6], [g[0] - r, g[1] + r * 0.6]);
  }
  /* the height meter: where the shuttle is, and which shots work from there */
  function meter(ctx, m, n, mine) {
    const s = n.shuttle; if (!s) return;
    const x = T.w - (T.reserve || 0) - 30, top = T.h * 0.16, bot = T.h * 0.84, H0 = 4.5;
    const Y = function (z) { return bot - (Math.min(H0, Math.max(0, z)) / H0) * (bot - top); };
    const Z = BD.ZONES;
    const bands = [[0, Z.low, '#e2514a', 'LOW'], [Z.low, Z.smash, '#e6b422', 'MID'], [Z.smash, Z.jump, '#3fbf6a', 'SMASH'], [Z.jump, H0, '#26d07c', 'JUMP']];
    ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, x - 9, top - 8, 18, bot - top + 16, 9); ctx.fill();
    bands.forEach(function (b) { ctx.fillStyle = b[2]; ctx.globalAlpha = 0.85; ctx.fillRect(x - 5, Y(b[1]), 10, Y(b[0]) - Y(b[1])); ctx.globalAlpha = 1; });
    // the net's height, for reference
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; line(ctx, [x - 9, Y(BD.C.net)], [x + 9, Y(BD.C.net)]);
    ctx.font = '700 9px "Nunito", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('net', x - 12, Y(BD.C.net));
    // marker
    const z = s.held ? 1.0 : s.z, my = Y(z);
    const zone = z >= Z.jump ? 3 : z >= Z.smash ? 2 : z >= Z.low ? 1 : 0;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x - 13, my); ctx.lineTo(x - 22, my - 6); ctx.lineTo(x - 22, my + 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, my, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = bands[zone][2]; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '800 10px "Nunito", system-ui, sans-serif'; ctx.fillStyle = bands[zone][2];
    ctx.fillText(z.toFixed(1) + ' m', x, bot + 18);
    ctx.fillText(['LOW', 'MID', 'SMASH', 'JUMP'][zone], x, top - 16);
    void m; void mine;
  }
  function pops(ctx) {
    const now = performance.now();
    View.pops = View.pops.filter(function (p) { return now - p.t < p.life; });
    View.pops.forEach(function (p) {
      const e = (now - p.t) / p.life, a = P(p.x, p.y, 1.2 + e * 1.2);
      ctx.globalAlpha = 1 - e * e;
      ctx.font = '900 ' + Math.max(12, Math.round(T.sc * 0.34)) + 'px "Nunito", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(p.text, a[0], a[1]);
      ctx.fillStyle = p.color; ctx.fillText(p.text, a[0], a[1]);
      ctx.globalAlpha = 1;
    });
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = T.last ? Math.min(0.05, (ts - T.last) / 1000) : 0.016; T.last = ts;
    if (!T.wrap || !T.wrap.isConnected) return;
    View.tickMe(dt);
    const m = View.m; if (!m) return;
    size();
    const ctx = T.ctx;
    ctx.setTransform(T.dpr, 0, 0, T.dpr, 0, 0);
    const n = View.now();
    drawCourt(ctx, m);
    if (!n) return;
    const mine = n.players.find(function (p) { return p.id === S.me; });
    guide(ctx, m, n);
    meReach(ctx, m, n, mine);
    // draw far things first so near players overlap correctly
    const order = n.players.slice().sort(function (a, b) { return P(a.x, a.y)[1] - P(b.x, b.y)[1]; });
    const sh = n.shuttle, shY = sh ? P(sh.x, sh.y)[1] : 0;
    const netY = P(0, 0)[1];
    let netDrawn = false, shDrawn = false;
    order.forEach(function (p) {
      const py = P(p.x, p.y)[1];
      if (!netDrawn && T.orient === 'port' && py > netY) { drawNet(ctx); netDrawn = true; }
      if (!shDrawn && sh && shY < py) { drawShuttle(ctx, sh, n.landed); shDrawn = true; }
      drawPlayer(ctx, m, p, null, ts);
    });
    if (!netDrawn) drawNet(ctx);
    if (!shDrawn) drawShuttle(ctx, sh, n.landed);
    pops(ctx);
    meter(ctx, m, n, mine);
    Controls.update(m, n, mine);
  }
  T.ensure = ensure;
  return T;
})();
function showReaction(name, e) { if (!View.m) return; const n = View.now(); View.pop(e + ' ' + (name || ''), [0, 0], '#ffffff', 1.6); void n; }

/* ===== Controls: the three shot buttons and the joystick zone; labels follow the shuttle's height ===== */
const Controls = (function () {
  const K = { el: null, btns: {}, lastLabel: {} };
  function ensure() {
    if (K.el) return K.el;
    const knob = h('div', { class: 'knob' }, h('span', { class: 'kdot' }));
    const zone = h('div', { class: 'stickzone', id: 'stickZone', 'aria-label': 'Move: drag here' }, knob);
    Input.bindStick(zone, knob);
    const mk = function (b, label, key) {
      const el = h('button', { type: 'button', class: 'shot ' + b, id: 'btn-' + b, 'aria-label': label }, h('span', { class: 'sl', text: label }), h('span', { class: 'sk', id: 'key-' + b, text: Input.keyName(Input.binds[b]) }));
      void key;
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); Input.press(b); });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      K.btns[b] = el; return el;
    };
    K.el = h('div', { class: 'controls', id: 'controls' }, zone,
      h('div', { class: 'shots' }, mk('drop', 'Drop', 'K'), mk('clear', 'Clear', 'J'), mk('smash', 'Smash', 'L')));
    return K.el;
  }
  const SERVE = { clear: 'High serve', drop: 'Short serve', smash: 'Flick serve' };
  function update(m, n, mine) {
    if (!K.el || !K.el.isConnected || !mine) return;
    const s = n.shuttle; if (!s) return;
    ['clear', 'drop', 'smash'].forEach(function (b) { const k = document.getElementById('key-' + b); const t = Input.keyName(Input.binds[b]); if (k && k.textContent !== t) k.textContent = t; });
    const serving = m.phase === 'serve' && m.server === S.me;
    ['clear', 'drop', 'smash'].forEach(function (b) {
      let label, risk = 'ok';
      if (serving) label = SERVE[b];
      else {
        const pv = BD.preview(m, mine, b, s.held ? 1.0 : s.z);
        label = KIND_NAMES[pv.kind] || b; risk = pv.risk;
      }
      const key = label + ':' + risk;
      if (K.lastLabel[b] !== key) {
        K.lastLabel[b] = key;
        K.btns[b].firstChild.textContent = label;
        K.btns[b].classList.toggle('risky', risk === 'risky');
        K.btns[b].classList.toggle('danger', risk === 'net');
      }
    });
    const ghost = { id: mine.id, side: mine.side, x: mine.x, y: mine.y, energy: mine.energy };
    const q = m.phase === 'rally' ? BD.hittable(m, ghost, s) : null;
    K.el.classList.toggle('inreach', !!q || serving);
    const eb = document.getElementById('myEnergy'); if (eb) { eb.style.width = Math.round(mine.energy) + '%'; eb.className = 'efill ' + (mine.energy > 50 ? 'hi' : mine.energy > 25 ? 'mid' : 'lo'); }
  }
  return { ensure: ensure, update: update };
})();

/* ===== Breaks: the hydration-break overlay on the court, updated from frames without a full re-render ===== */
const Breaks = (function () {
  function update() {
    const wrap = document.getElementById('courtWrap'); if (!wrap) return;
    let el = document.getElementById('breakOv');
    const pz = View.pz;
    if (!pz) { if (el) el.remove(); return; }
    const m = View.m; if (!m) return;
    const who = m.players.find(function (p) { return p.id === pz[0]; });
    const playing = m.players.some(function (p) { return p.id === S.me && !p.left; });
    if (!el) { el = h('div', { class: 'breakov', id: 'breakOv' }); wrap.appendChild(el); }
    clear(el);
    const counting = pz[2] >= 0;
    add(el, h('div', { class: 'breakcard' },
      h('div', { class: 'bicon', text: '🥤' }),
      h('b', { text: counting ? 'Back in ' + Math.max(1, pz[2]) + '…' : 'Hydration break' }),
      h('span', { text: (who ? who.name : 'Someone') + ' called a break' + (counting ? '' : ' · ' + Math.floor(pz[1] / 60) + ':' + String(pz[1] % 60).padStart(2, '0') + ' left') }),
      !counting && playing ? h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small ghost', id: 'breakCtl', onclick: function () { openCtl(true); } }, '⚙ Controls'),
        h('button', { type: 'button', class: 'btn small primary', id: 'resumeBtn', onclick: function () { Net.resume(); } }, 'Resume')) : null));
  }
  return { update: update };
})();
