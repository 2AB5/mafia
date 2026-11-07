/* ===== clips: turn instant replays into short videos people can share (MP4 where the browser can, else WebM) ===== */
const Clips = (function () {
  const W = 720, H = 1280, FPS = 30, SP = REPLAY_SPEED;        // portrait, phone-story sized
  const TOP = 190, BOT = 200;                                   // bands above and below the desk
  let busy = false;
  const last = { size: 0, type: '', secs: 0, name: '' };        // for tests

  function pickMime() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (let i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* next */ } }
    return '';
  }
  function supported() {
    try { return !!(window.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream && pickMime()); } catch (e) { return false; }
  }
  const ease = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  function nameIn(r) { return function (id) { const p = r.players.find(function (q) { return q.id === id; }); return p ? p.name : 'Player'; }; }

  /* pen poses of a replay at sim time t, plus when each pen went off */
  function posesAt(r, t) {
    const fr = r.frames;
    let a = fr[0], b = fr[0];
    for (let i = 0; i < fr.length; i++) { if (fr[i].t <= t) { a = fr[i]; b = fr[i + 1] || fr[i]; } }
    const span = b.t - a.t, k = span > 0 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 1;
    return a.p.map(function (pa, i) {
      const pb = b.p[i] || pa;
      let da = pb[2] - pa[2]; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      return { x: pa[0] + (pb[0] - pa[0]) * k, y: pa[1] + (pb[1] - pa[1]) * k, a: pa[2] + da * k, out: !!(pb[3] || pa[3]), gone: !!fr[0].p[i][3] };
    });
  }
  function fallTimes(r) {
    const out = {};
    r.frames.forEach(function (f) { f.p.forEach(function (q, i) { if (q[3] && !r.frames[0].p[i][3] && !out[i]) out[i] = { t: f.t, x: q[0], y: q[1], a: q[2] }; }); });
    return out;
  }

  /* ---------- drawing ---------- */
  function paper(ctx) {
    ctx.fillStyle = '#f5f2e8'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(64,110,190,.14)'; ctx.lineWidth = 2;
    for (let y = 60; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(214,69,93,.45)'; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, H); ctx.stroke();
  }
  function header(ctx, sub) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2350c9'; ctx.font = '700 88px "Caveat", "Comic Sans MS", cursive';
    ctx.fillText('Pen Fight', W / 2, 78);
    if (sub) { ctx.fillStyle = '#5f6272'; ctx.font = '800 26px "Nunito", system-ui, sans-serif'; ctx.fillText(sub.toUpperCase(), W / 2, 146); }
  }
  function footer(ctx, caption) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (caption) {
      ctx.font = '800 34px "Nunito", system-ui, sans-serif';
      const cw = Math.min(W - 60, ctx.measureText(caption).width + 56);
      ctx.fillStyle = 'rgba(10,12,20,.86)'; rr(ctx, W / 2 - cw / 2, H - BOT + 40, cw, 64, 32); ctx.fill();
      ctx.fillStyle = '#ffd23f'; fitText(ctx, caption, W / 2, H - BOT + 73, cw - 40);
    }
    ctx.fillStyle = '#5f6272'; ctx.font = '700 24px "Nunito", system-ui, sans-serif';
    ctx.fillText('Play with friends: 2ab5.github.io/mafia/penfight', W / 2, H - 46);
  }
  function fitText(ctx, s, x, y, maxW) {
    let size = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    while (size > 14 && ctx.measureText(s).width > maxW) { size -= 2; ctx.font = ctx.font.replace(/\d+px/, size + 'px'); }
    ctx.fillText(s, x, y);
  }
  const woodCache = {};
  function woodFor(table, sc) {
    const key = table.w + 'x' + table.h + ':' + Math.round(sc) + ':' + currentDesk().id;
    if (!woodCache[key]) woodCache[key] = makeWood({ scale: sc, dpr: 1 }, table);
    return woodCache[key];
  }
  /* one frame of a replay: tt = seconds into this segment */
  function drawShot(ctx, seg, tt) {
    const r = seg.r, T = r.table, V = { w: T.w + 0.8, h: T.h + 0.8 }, nm = nameIn(r);
    paper(ctx);
    header(ctx, seg.sub);
    const ax = 20, ay = TOP, aw = W - 40, ah = H - TOP - BOT;
    const sc = Math.min(aw / V.w, ah / V.h);
    const end = replayEnd(r), simT = Math.max(0, Math.min(end, (tt - seg.pre) * SP));
    const f = Math.min(ease(tt / 0.7), ease((seg.dur - tt) / 0.7));
    const z = 1 + (seg.cam.z - 1) * f, k = sc * z;
    // keep the zoomed camera over the desk, not the floor beyond it
    const limX = Math.max(0, T.w / 2 + 0.35 - aw / (2 * k)), limY = Math.max(0, T.h / 2 + 0.35 - ah / (2 * k));
    const cx = Math.max(-limX, Math.min(limX, seg.cam.cx * f)), cy = Math.max(-limY, Math.min(limY, seg.cam.cy * f));
    const ox = ax + aw / 2, oy = ay + ah / 2;
    ctx.save();
    rr(ctx, ax, ay, aw, ah, 26); ctx.clip();
    ctx.fillStyle = '#3a2616'; ctx.fillRect(ax, ay, aw, ah);
    ctx.setTransform(k, 0, 0, k, ox - cx * k, oy - cy * k);
    const D = currentDesk();
    ctx.fillStyle = D.rim[0]; rr(ctx, -T.w / 2 - 0.14, -T.h / 2 - 0.14, T.w + 0.28, T.h + 0.28, 0.2); ctx.fill();
    ctx.fillStyle = D.rim[1]; rr(ctx, -T.w / 2 - 0.07, -T.h / 2 - 0.07, T.w + 0.14, T.h + 0.14, 0.14); ctx.fill();
    ctx.drawImage(woodFor(T, sc), -T.w / 2, -T.h / 2, T.w, T.h);
    const poses = posesAt(r, simT);
    poses.forEach(function (p, i) {
      if (p.gone) return;
      const pl = r.players[i]; if (!pl) return;
      const skin = PF.skinById(pl.skin);
      if (p.out) {
        const fo = seg.falls[i]; if (!fo) return;
        const e = (simT - fo.t) / SP / 0.65;
        if (e >= 1 || e < 0) return;
        const d = Math.hypot(fo.x, fo.y) || 1;
        ctx.save(); ctx.translate(fo.x + fo.x / d * e * 0.6, fo.y + fo.y / d * e * 0.6); ctx.rotate(fo.a + e * 1.2); ctx.scale(1 - e * 0.45, 1 - e * 0.45);
        drawPen(ctx, skin, { alpha: 1 - e, noShadow: true }); ctx.restore();
        return;
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      drawPen(ctx, skin, { glow: pl.id === r.by ? 'rgba(255,255,255,.85)' : null });
      ctx.restore();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
    // name tags (may poke out over the desk edge)
    ctx.font = '800 22px "Nunito", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    poses.forEach(function (p, i) {
      const pl = r.players[i]; if (!pl || p.out || p.gone) return;
      const sx = ox + (p.x - cx) * k, sy = oy + (p.y - cy) * k - 44;
      const label = pl.name + (pl.bot ? ' 🤖' : '');
      const tw = ctx.measureText(label).width + 26;
      ctx.fillStyle = pl.id === r.by ? 'rgba(255,210,63,.96)' : r.teams && (pl.team === 0 || pl.team === 1) ? PF.TEAMS[pl.team].color : 'rgba(20,18,30,.78)';
      rr(ctx, sx - tw / 2, sy - 18, tw, 36, 18); ctx.fill();
      ctx.fillStyle = pl.id === r.by ? '#1d1a10' : '#fff'; ctx.fillText(label, sx, sy + 1);
    });
    // slow-mo marker in the title band, clear of the pens
    ctx.font = '800 26px "Nunito", system-ui, sans-serif';
    const sw = ctx.measureText(String(seg.sub || '').toUpperCase()).width;
    ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(W / 2 - sw / 2 - 20, 146, 8, 0, Math.PI * 2); ctx.fill();
    footer(ctx, replayCaption(r, nm));
  }
  function drawTitle(ctx, seg, tt) {
    paper(ctx); header(ctx, seg.sub);
    const a = ease(tt / 0.4);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f2230'; ctx.font = '800 64px "Nunito", system-ui, sans-serif';
    ctx.fillText('Match highlights', W / 2, 420);
    ctx.font = '700 30px "Nunito", system-ui, sans-serif'; ctx.fillStyle = '#5f6272';
    ctx.fillText(seg.line, W / 2, 480);
    seg.players.forEach(function (p, i) {
      const y = 600 + i * 96, sk = PF.skinById(p.skin);
      ctx.save(); ctx.translate(W / 2 - 170, y); ctx.scale(70, 70); drawPen(ctx, sk, {}); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = '#1f2230'; ctx.font = '800 40px "Nunito", system-ui, sans-serif';
      ctx.fillText(p.name + (p.bot ? ' 🤖' : ''), W / 2 - 90, y + 2);
    });
    ctx.globalAlpha = 1;
    footer(ctx, '');
  }
  function drawEnd(ctx, seg, tt) {
    paper(ctx); header(ctx, 'Final result');
    const a = ease(tt / 0.4);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '110px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.fillText('🏆', W / 2, 300);
    ctx.fillStyle = '#1f2230'; ctx.font = '800 52px "Nunito", system-ui, sans-serif';
    fitText(ctx, seg.winner, W / 2, 410, W - 80);
    // table
    const sum = seg.sum, top = 480;
    ctx.font = '800 22px "Nunito", system-ui, sans-serif'; ctx.fillStyle = '#5f6272';
    const cols = [['Shots', 'shots'], ['KOs', 'ko'], ['Off', 'off']], x0 = 120, cxs = [460, 550, 640];
    ctx.textAlign = 'left'; ctx.fillText('PLAYER', x0, top);
    ctx.textAlign = 'center'; cols.forEach(function (c, j) { ctx.fillText(c[0].toUpperCase(), cxs[j], top); });
    sum.rows.slice(0, 5).forEach(function (row, i) {
      const y = top + 56 + i * 66;
      ctx.fillStyle = 'rgba(255,253,247,.95)'; rr(ctx, x0 - 24, y - 28, W - 2 * (x0 - 24), 56, 16); ctx.fill();
      ctx.fillStyle = PF.skinById(row.skin).body; ctx.beginPath(); ctx.arc(x0 - 2, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f2230'; ctx.textAlign = 'left'; ctx.font = '800 30px "Nunito", system-ui, sans-serif';
      fitText(ctx, row.name, x0 + 20, y + 1, 280);
      ctx.textAlign = 'center'; ctx.font = '800 30px "Nunito", system-ui, sans-serif';
      ctx.fillText(String(row.shots), cxs[0], y + 1); ctx.fillText(String(row.ko), cxs[1], y + 1); ctx.fillText(String(row.fell + row.self), cxs[2], y + 1);
    });
    let y = top + 56 + Math.min(5, sum.rows.length) * 66 + 30;
    sum.awards.slice(0, 3).forEach(function (aw) {
      const who = (sum.rows.find(function (x) { return x.id === aw.who; }) || {}).name || '';
      ctx.textAlign = 'center'; ctx.fillStyle = '#1f2230'; ctx.font = '800 28px "Nunito", system-ui, sans-serif';
      fitText(ctx, aw.icon + ' ' + aw.title + ': ' + who, W / 2, y, W - 80);
      ctx.fillStyle = '#5f6272'; ctx.font = '700 22px "Nunito", system-ui, sans-serif'; ctx.fillText(aw.text, W / 2, y + 34);
      y += 84;
    });
    ctx.globalAlpha = 1;
    footer(ctx, '');
  }
  function drawSeg(ctx, seg, tt) {
    if (seg.kind === 'shot') drawShot(ctx, seg, tt); else if (seg.kind === 'title') drawTitle(ctx, seg, tt); else drawEnd(ctx, seg, tt);
  }
  function shotSeg(r, sub, pre, post) {
    pre = pre || 0.5; post = post || 1.1;
    return { kind: 'shot', r: r, sub: sub, pre: pre, dur: pre + replayEnd(r) / SP + post, cam: replayCam(r, 1.9), falls: fallTimes(r) };
  }

  /* ---------- picking the best shots of a match ---------- */
  function highlights(m) {
    const list = S.replays && S.replays.matchId === m.id ? S.replays.list : [];
    const scored = list.map(function (r, i) {
      const others = r.fell.filter(function (id) { return id !== r.by; }).length;
      const score = others * 10 + (r.matchOver ? 8 : 0) + (r.roundOver ? 3 : 0) + (r.power || 0) * 2 - (others ? 0 : 4);
      return { r: r, i: i, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 4).sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.r; });
  }

  /* ---------- recording ---------- */
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clip'; }
  function record(segs, fileBase, title) {
    if (busy) { toast('Already making a clip. Hang on.'); return; }
    const mime = pickMime();
    if (!mime) { toast('This browser cannot make video clips.'); return; }
    busy = true;
    const total = segs.reduce(function (a, s) { return a + s.dur; }, 0);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.className = 'clipcanvas';
    const ctx = canvas.getContext('2d');
    const bar = h('span', { class: 'clipfill' });
    const status = h('p', { class: 'clipstat', id: 'clipStatus', text: 'Making your clip…' });
    const body = h('div', { class: 'clipmedia' }, canvas);
    const actions = h('div', { class: 'row clipact' });
    let cancelled = false, rec = null;
    const close = function () { cancelled = true; try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) { /* ignore */ } sheet.remove(); busy = false; };
    actions.appendChild(btn('Cancel', close, { kind: 'ghost', id: 'clipCancel' }));
    const sheet = h('div', { class: 'clipsheet', id: 'clipSheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'clipbox' }, h('h3', { text: title }), body, h('div', { class: 'clipbar' }, bar), status, actions));
    document.body.appendChild(sheet);
    drawSeg(ctx, segs[0], 0);
    const stream = canvas.captureStream(FPS);
    const chunks = [];
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3000000 }); } catch (e) { close(); toast('Could not start recording on this browser.'); return; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (cancelled) return;
      const type = mime.split(';')[0], ext = type === 'video/mp4' ? '.mp4' : '.webm';
      const blob = new Blob(chunks, { type: type });
      const name = fileBase + ext;
      last.size = blob.size; last.type = type; last.secs = Math.round(total * 10) / 10; last.name = name;
      const url = URL.createObjectURL(blob);
      clear(body);
      body.appendChild(h('video', { src: url, controls: true, autoplay: true, muted: true, loop: true, playsinline: true, class: 'clipvideo', id: 'clipVideo' }));
      status.textContent = (Math.round(total * 10) / 10) + ' s video · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB' + (ext === '.webm' ? ' (WebM)' : '');
      bar.style.width = '100%';
      clear(actions);
      let file = null;
      try { file = new File([blob], name, { type: type }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.share) {
        let ok = false; try { ok = navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
        if (ok) actions.appendChild(btn('Share', function () { navigator.share({ files: [file], title: 'Pen Fight', text: title }).catch(function () {}); }, { kind: 'primary', id: 'clipShare', icon: 'share' }));
      }
      actions.appendChild(h('a', { class: 'btn ' + (actions.childNodes.length ? 'ghost' : 'primary'), href: url, download: name, id: 'clipDownload' }, 'Download'));
      actions.appendChild(btn('Close', function () { sheet.remove(); URL.revokeObjectURL(url); }, { kind: 'ghost', id: 'clipClose' }));
      busy = false;
    };
    rec.start(500);
    const t0 = performance.now();
    const tick = function () {
      if (cancelled) return;
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { drawSeg(ctx, segs[segs.length - 1], segs[segs.length - 1].dur); setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); }, 120); return; }
      let acc = 0, i = 0;
      while (i < segs.length - 1 && t >= acc + segs[i].dur) { acc += segs[i].dur; i++; }
      drawSeg(ctx, segs[i], t - acc);
      bar.style.width = Math.round(t / total * 100) + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function saveReplay(r) {
    if (!r || !r.players) return;
    const nm = nameIn(r);
    record([shotSeg(r, 'Round ' + r.round + ' · slow-mo replay', 1.0, 1.8)], 'penfight-' + (r.room ? r.room.toLowerCase() + '-' : '') + slug(replayCaption(r, nm)), replayCaption(r, nm));
  }
  function saveReel(m) {
    const hl = highlights(m);
    if (!hl.length) { toast('No knock-offs to make a reel from.'); return; }
    const sum = PF.matchSummary(m);
    const winner = m.teamScore ? (m.winnerTeam !== null ? PF.TEAMS[m.winnerTeam].name + ' wins!' : 'Match over') : (m.winner ? PF.nameOf(m, m.winner) + ' is the desk champion' : 'Match over');
    const segs = [{ kind: 'title', dur: 1.8, sub: (S.room ? 'Room ' + S.room + ' · ' : '') + m.round + (m.round === 1 ? ' round' : ' rounds'), line: sum.totalShots + ' shots, ' + hl.length + ' best moments', players: m.players.slice(0, 5) }];
    hl.forEach(function (r, i) { segs.push(shotSeg(r, 'Highlight ' + (i + 1) + ' of ' + hl.length + ' · round ' + r.round + ' · slow-mo')); });
    segs.push({ kind: 'end', dur: 3.4, winner: winner, sum: sum });
    record(segs, 'penfight-highlights' + (S.room ? '-' + S.room.toLowerCase() : ''), 'Match highlights');
  }
  return { supported: supported, saveReplay: saveReplay, saveReel: saveReel, highlights: highlights, last: last, mime: pickMime, busy: function () { return busy; } };
})();
window.__pf && (window.__pf.clips = Clips);
