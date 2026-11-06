// Real online Pen Fight test: local PeerJS server + 5 Chromium tabs flicking with the mouse.
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PEER_PORT = 9133, WEB_PORT = 8775;
const URL = 'http://127.0.0.1:' + WEB_PORT + '/?peer=127.0.0.1:' + PEER_PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } }
async function waitFor(fn, label, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { let v; try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(50); } throw new Error('timeout: ' + label); }
const ev = (pg, expr) => pg.evaluate(new Function('return (' + expr + ')'));

(async () => {
  const papp = express(); const psrv = papp.listen(PEER_PORT, '127.0.0.1'); papp.use('/', ExpressPeerServer(psrv, { path: '/' }));
  const web = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(path.join(DIR, 'index.html'))); }).listen(WEB_PORT, '127.0.0.1');
  await sleep(400);
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(tag, w, hgt) {
    const ctx = await browser.newContext({ viewport: { width: w || 400, height: hgt || 860 }, hasTouch: false });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await pg.route('**/fonts.gstatic.com/**', r => r.abort());
    return pg;
  }
  // flick with the real mouse: press on own pen, pull away from the target, release
  async function flick(pg, me, target, power, grabOffset, shotName) {
    const a = await ev(pg, "window.__pf.penScreen(" + JSON.stringify(me) + ")");
    const b = await ev(pg, "window.__pf.penScreen(" + JSON.stringify(target) + ")");
    const off = (grabOffset || 0) * a.scale;
    const gx = a.x + Math.cos(a.a) * off, gy = a.y + Math.sin(a.a) * off;
    const dx = b.x - gx, dy = b.y - gy, d = Math.hypot(dx, dy);
    const pull = power * 3.0 * a.scale;
    await pg.mouse.move(gx, gy); await pg.mouse.down();
    const steps = 8;
    for (let i = 1; i <= steps; i++) await pg.mouse.move(gx - dx / d * pull * i / steps, gy - dy / d * pull * i / steps);
    if (shotName) await pg.screenshot({ path: path.join(SHOTS, shotName) });
    await pg.mouse.up();
  }

  async function onlineMatch(n, opts) {
    opts = opts || {};
    const names = ['Ab', 'Riya', 'Karan', 'Meera', 'Dev'];
    const skins = ['blue', 'red', 'pencil', 'gold', 'pink'];
    const pages = [];
    const host = await newPage('host', 400, 880); pages.push(host);
    await host.goto(URL);
    await host.fill('#nameIn', names[0]); await host.click('#skinPick [data-skin="' + skins[0] + '"]');
    if (opts.shots) await host.screenshot({ path: path.join(SHOTS, '01-home.png'), fullPage: true });
    await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pf.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pf.S.room');
    for (let i = 1; i < n; i++) {
      const pg = await newPage('p' + i, i === 1 ? 390 : 520, 900); pages.push(pg);
      await pg.goto(URL + '#' + code);
      await waitFor(() => pg.$('#codeIn'), 'join form');
      await pg.fill('#nameIn', names[i]); await pg.click('#skinPick [data-skin="' + skins[i] + '"]'); await pg.click('#joinBtn');
    }
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === n + ' / 5', 'all seated', 30000);
    const sk = await ev(host, 'window.__pf.S.st.roster.map(r => r.skin).join(",")');
    check(new Set(sk.split(',')).size === n, 'pens are unique: ' + sk);
    if (opts.shots) { await sleep(300); await host.screenshot({ path: path.join(SHOTS, '02-lobby.png'), fullPage: true }); }
    if (opts.teams) {
      await host.click('#cfgMode [data-v="true"]');
      await waitFor(async () => (await host.$$('.seat .teamb')).length === n, 'team badges on every seat');
      const counts = await ev(host, '[0,1].map(t => window.__pf.S.st.roster.filter(r => r.team === t).length)');
      check(Math.abs(counts[0] - counts[1]) <= 1 && counts[0] > 0 && counts[1] > 0, 'teams auto-balanced ' + counts);
      const pid = await ev(host, 'window.__pf.S.st.roster[1].id');
      const before = await ev(host, 'window.__pf.S.st.roster[1].team');
      await host.click('.seat[data-id="' + pid + '"] button.teamb');
      await waitFor(async () => (await ev(host, 'window.__pf.S.st.roster[1].team')) === 1 - before, 'team switch');
      await waitFor(async () => (await ev(pages[1], "(window.__pf.S.st.roster.find(r => r.id === '" + pid + "') || {}).team")) === 1 - before, 'switch reached the player');
      await host.click('.seat[data-id="' + pid + '"] button.teamb');
      await waitFor(async () => (await ev(host, 'window.__pf.S.st.roster[1].team')) === before, 'team switch back');
      if (opts.shots) { await sleep(200); await host.screenshot({ path: path.join(SHOTS, '09-team-lobby.png'), fullPage: true }); }
    }
    await host.click('#cfgTarget [data-v="' + (opts.target || 2) + '"]');
    await host.click('#cfgTimer [data-v="0"]');
    await sleep(100);
    await host.click('#startBtn');
    for (const pg of pages) await waitFor(() => pg.$('#desk'), 'desk visible');
    const idOf = [];
    for (const pg of pages) idOf.push(await ev(pg, 'window.__pf.S.me'));
    let shots = 0, framesSeen = 0, reloaded = false, rounds = new Set(), sawSpin = false;
    while (shots < 260) {
      const m = await ev(host, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (m.phase === 'roundover') { await waitFor(() => ev(host, "window.__pf.H.match.phase !== 'roundover'"), 'next round starts', 10000); continue; }
      if (m.phase !== 'aim') { await sleep(50); continue; }
      rounds.add(m.round);
      const shooterIdx = idOf.indexOf(m.turn);
      const pg = pages[shooterIdx];
      await waitFor(() => ev(pg, "(function(){var m=window.__pf.S.st&&window.__pf.S.st.match;return m&&m.phase==='aim'&&m.turnNo===" + m.turnNo + "})()"), 'shooter synced');
      if (opts.reload && !reloaded && shots === 3) {
        reloaded = true;
        const victim = pages[(shooterIdx + 1) % n];
        await victim.reload();
        await waitFor(() => ev(victim, "window.__pf.S.conn === 'open' && !!window.__pf.S.st && !!window.__pf.S.st.match && !!window.__pf.S.me"), 'player rejoined mid-match', 30000);
        console.log('    player reload mid-match: rejoined the same seat');
      }
      const myTeam = m.teamScore ? m.players.find(p => p.id === m.turn).team : null;
      const alive = m.pens.filter(p => !p.out && p.id !== m.turn && (myTeam === null || m.players.find(q => q.id === p.id).team !== myTeam));
      const target = alive[Math.floor(Math.random() * alive.length)].id;
      const tp = m.pens.find(p => p.id === target), mp = m.pens.find(p => p.id === m.turn);
      const power = Math.random() < 0.5 ? 1 : Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45);   // reach the target and push through
      const grab = (Math.random() - 0.5) * 1.2;
      const before = m.turnNo;
      await flick(pg, m.turn, target, power, grab, opts.shots && shots === 0 ? '03-aiming.png' : null);
      // spectators should see frames streaming while the shot rolls
      const watcher = pages[(shooterIdx + 1) % n];
      let gotRoll = false;
      try { await waitFor(() => ev(host, "window.__pf.H.match.phase === 'roll'"), 'shot started', 4000); gotRoll = true; } catch (e) { /* tiny flicks can be rejected (<4%) */ }
      if (gotRoll) {
        if (opts.shots && shots === 0) { await sleep(250); await watcher.screenshot({ path: path.join(SHOTS, '04-rolling-watcher.png') }); }
        const f = await waitFor(() => ev(watcher, 'window.__pf.S.frames.length'), 'frames reached watcher', 8000).catch(() => 0);
        if (f) framesSeen++;
        await waitFor(() => ev(host, "window.__pf.H.match.phase !== 'roll'"), 'shot settled', 20000);
        const ls = await ev(host, 'window.__pf.H.match.lastShot');
        if (ls && Math.abs(ls.lx) > 0.3) sawSpin = true;
      }
      shots++;
      // everyone agrees on the result
      const hp = JSON.stringify((await ev(host, 'window.__pf.H.match')).pens.map(p => [p.id, p.out, Math.round(p.x * 100), Math.round(p.y * 100)]));
      for (let i = 1; i < n; i++) {
        await waitFor(async () => JSON.stringify((await ev(pages[i], 'window.__pf.S.st.match')).pens.map(p => [p.id, p.out, Math.round(p.x * 100), Math.round(p.y * 100)])) === hp, 'player ' + i + ' agrees with host after shot', 8000);
      }
      if (opts.shots && shots === 1) await pages[1].screenshot({ path: path.join(SHOTS, '05-after-shot.png') });
      const ph = await ev(host, 'window.__pf.H.match.phase');
      if (ph === 'roundover' && opts.shots && !opts._rshot) { opts._rshot = 1; await sleep(400); await pages[1].screenshot({ path: path.join(SHOTS, (opts.teams ? '10-team-' : '06-') + 'round-over.png') }); }
      if (opts.teams && opts.shots && shots === 2) await pages[2].screenshot({ path: path.join(SHOTS, '11-team-game.png') });
    }
    const fm = await ev(host, 'window.__pf.H.match');
    check(fm.phase === 'over', 'match finished (' + shots + ' shots)');
    let w;
    if (opts.teams) {
      check(fm.winnerTeam === 0 || fm.winnerTeam === 1, 'a team won');
      check(fm.teamScore[fm.winnerTeam] === (opts.target || 2), 'winning team reached target');
      w = { name: ['Blue', 'Red'][fm.winnerTeam] + ' team', score: fm.teamScore[fm.winnerTeam] };
      for (const pg of pages) { await waitFor(() => pg.$('#overCard'), 'over card'); check(/team wins the match/i.test(await pg.textContent('#overCard')), 'team winner shown'); }
    } else {
      w = fm.players.find(p => p.id === fm.winner);
      check(w && w.score === (opts.target || 2), 'winner reached target');
    }
    check(framesSeen > 0, 'watchers received streamed frames');
    for (const pg of pages) await waitFor(() => pg.$('#winner'), 'winner shown everywhere');
    if (opts.shots) await pages[1].screenshot({ path: path.join(SHOTS, '07-match-over.png') });
    // rematch
    await host.click('#rematchBtn');
    for (const pg of pages) await waitFor(() => ev(pg, "!!window.__pf.S.st.match && window.__pf.S.st.match.phase === 'aim' && window.__pf.S.st.match.round === 1"), 'rematch started everywhere');
    // reaction travels
    const reactFrom = pages[1];
    await reactFrom.click('.react');
    await waitFor(() => ev(host, 'window.__pf.S.floats.length > 0'), 'reaction reached host', 5000);
    // skip a turn by host when the shooter is someone else
    const t0 = await ev(host, 'window.__pf.H.match.turn');
    if (t0 !== idOf[0]) { await host.click('#cf-skip'); await host.click('#cf-skip'); await waitFor(async () => (await ev(host, 'window.__pf.H.match.turn')) !== t0, 'host skip'); }
    console.log('  online ' + n + ' players' + (opts.teams ? ' (teams)' : '') + ': ' + w.name + ' won' + (opts.teams ? ' ' + fm.teamScore.join('-') : ' ' + fm.players.map(p => p.name + ' ' + p.score).join(', ')) + ' after ' + shots + ' shots over ' + rounds.size + ' rounds' + (sawSpin ? ', spin shots included' : ''));
    for (const pg of pages) await pg.context().close();
  }

  async function localMatch() {
    const pg = await newPage('local', 1100, 900);
    await pg.goto(URL);
    await pg.click('#localD summary');
    await pg.click('#localN [data-v="3"]');
    await pg.click('#localStart');
    await waitFor(() => pg.$('#desk'), 'local desk');
    let shots = 0;
    while (shots < 300) {
      const m = await ev(pg, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (m.phase !== 'aim') { await sleep(60); continue; }
      const alive = m.pens.filter(p => !p.out && p.id !== m.turn);
      const tp = alive[0], mp = m.pens.find(p => p.id === m.turn);
      await flick(pg, m.turn, tp.id, Math.random() < 0.5 ? 1 : Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45), (Math.random() - 0.5) * 0.4, shots === 0 ? '08-local-wide.png' : null);
      await waitFor(() => ev(pg, "window.__pf.H.match.phase !== 'aim' || window.__pf.H.match.turnNo !== " + m.turnNo), 'local shot', 5000).catch(() => {});
      await waitFor(() => ev(pg, "window.__pf.H.match.phase !== 'roll'"), 'local settle', 20000);
      shots++;
    }
    check(await pg.$('#winner'), 'local match finished');
    console.log('  one-device 3 players: ' + (await pg.textContent('#winner')) + ' after ' + shots + ' shots');
    const ov = await ev(pg, 'document.documentElement.scrollWidth > innerWidth + 1');
    check(!ov, 'no horizontal scroll');
    await pg.context().close();
  }
  try {
    await onlineMatch(5, { shots: true, reload: true, target: 1 });
    await onlineMatch(2, { target: 1 });
    await onlineMatch(4, { teams: true, target: 2, shots: true });
    await localMatch();
  } catch (e) { fails++; console.log('  ERROR ' + e.stack); }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 10).join('\n    '));
  await browser.close(); web.close(); psrv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PEN FIGHT E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
