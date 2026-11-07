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
  async function newPage(tag, w, hgt, fresh) {
    const ctx = await browser.newContext({ viewport: { width: w || 400, height: hgt || 860 }, hasTouch: false });
    const pg = await ctx.newPage();
    // test players start with everything unlocked (a veteran profile), unless testing a fresh profile
    if (!fresh) await pg.addInitScript(() => { try { if (!localStorage.getItem('penfight.profile')) localStorage.setItem('penfight.profile', JSON.stringify({ v: 1, xp: 5000, matches: 0, wins: 0, roundsWon: 0, kos: 0, selfOuts: 0, streak: 0, bestStreak: 0, desk: 'oak', flick: 'pull', seen: [] })); } catch (e) {} });
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
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === n + ' / 12', 'all seated', 30000);
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
    let shots = 0, framesSeen = 0, reloaded = false, rounds = new Set(), sawSpin = false, replays = 0;
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
      if (gotRoll) { opts._acc = opts._acc || {}; opts._acc[m.turn] = (opts._acc[m.turn] || 0) + 1; }
      if (gotRoll) {
        // did this shot knock anything off? then every screen must play its replay
        const shotId = m.id + ':' + before;
        await waitFor(() => ev(host, "!!window.__pf.S.lastReplay && window.__pf.S.lastReplay.id === " + JSON.stringify(shotId)), 'host built replay', 5000).catch(() => {});
        const fell = await ev(host, "window.__pf.S.lastReplay && window.__pf.S.lastReplay.id === " + JSON.stringify(shotId) + " ? window.__pf.S.lastReplay.fell.length : 0");
        if (fell) {
          const played = await Promise.all(pages.map(pg => waitFor(() => ev(pg, "window.__pf.replayLog.indexOf(" + JSON.stringify(shotId) + ") !== -1"), 'replay played', 5000).catch(() => false)));
          check(played.every(Boolean), 'instant replay played on every screen after knock-off ' + shotId);
          const live = await ev(pages[1], "document.getElementById('statusTxt').textContent.indexOf('Instant replay') === 0");
          if (live && opts.shots && !opts._replayShot) { opts._replayShot = 1; await sleep(900); await pages[1].screenshot({ path: path.join(SHOTS, '13-replay.png') }); }
          if (live) {
            // one player skips it by tapping the desk
            const skipper = pages[1];
            const box = await skipper.$eval('#desk', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
            await skipper.mouse.click(box.x, box.y);
            await waitFor(() => ev(skipper, "document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0"), 'tap skips replay', 3000);
          }
          for (const pg of pages) await waitFor(() => ev(pg, "document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0"), 'replay finished', 12000);
          replays++;
        }
      }
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

    // end-of-match summary: same shot counts on every screen, matching the flicks we made
    const acc = opts._acc || {}; opts._acc = {};
    for (const pg of pages) {
      await waitFor(() => pg.$('#summaryTable'), 'match summary shown');
      const rows = await pg.$$eval('#summaryTable tbody tr', trs => trs.map(tr => ({ id: tr.getAttribute('data-pid'), shots: Number(tr.querySelector('[data-k=shots]').textContent) })));
      check(rows.length === n, 'summary has a row per player');
      check(rows.every(r => r.shots === (acc[r.id] || 0)), 'summary shot counts match flicks made ' + JSON.stringify(rows) + ' vs ' + JSON.stringify(acc));
    }
    const sumTxt = await pages[0].textContent('#matchSummary');
    console.log('    summary: ' + sumTxt.replace(/\s+/g, ' ').slice(0, 220));
    if (opts.shots) { await pages[1].screenshot({ path: path.join(SHOTS, '07-match-over.png') }); await pages[1].screenshot({ path: path.join(SHOTS, (opts.teams ? '16-team-' : '16-') + 'summary.png'), fullPage: true }); }
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
    console.log('  online ' + n + ' players' + (opts.teams ? ' (teams)' : '') + ': ' + w.name + ' won' + (opts.teams ? ' ' + fm.teamScore.join('-') : ' ' + fm.players.map(p => p.name + ' ' + p.score).join(', ')) + ' after ' + shots + ' shots over ' + rounds.size + ' rounds, ' + replays + ' instant replays' + (sawSpin ? ', spin shots included' : ''));
    for (const pg of pages) await pg.context().close();
  }

  async function practiceVsBots() {
    const pg = await newPage('practice', 400, 900);
    await pg.goto(URL);
    await pg.fill('#nameIn', 'Ab');
    await pg.click('#pracBots [data-v="2"]');
    await pg.click('#pracLevel [data-v="easy"]');
    await pg.click('#practiceStart');
    await waitFor(() => pg.$('#desk'), 'practice desk');
    let myShots = 0, botShots = 0, replayClicked = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 480000) {
      const m = await ev(pg, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (m.phase !== 'aim') { await sleep(80); continue; }
      const cur = m.players.find(p => p.id === m.turn);
      if (cur.bot) {
        // the bot shows its aim before flicking
        const sawAim = await waitFor(() => ev(pg, "!!window.__pf.S.aim || window.__pf.H.match.phase !== 'aim'"), 'bot aims', 6000).catch(() => false);
        if (botShots === 0) { check(sawAim, 'bot shows its aim'); await pg.screenshot({ path: path.join(SHOTS, '14-bot-aiming.png') }); }
        await waitFor(() => ev(pg, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'bot flicks', 8000);
        botShots++;
        continue;
      }
      // a replay may be playing: wait for it before flicking
      await waitFor(() => ev(pg, "document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0"), 'replay over', 12000);
      if (!replayClicked && await pg.$('#replayBtn')) {
        replayClicked = true;
        await pg.click('#replayBtn');
        check(/Instant replay/.test(await pg.textContent('#statusTxt')), 'replay button replays the last shot');
        await pg.mouse.click(...(await pg.$eval('#desk', c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + 30]; })));
      }
      const foes = m.pens.filter(p => !p.out && p.id !== m.turn);
      const tp = foes[Math.floor(Math.random() * foes.length)], mp = m.pens.find(p => p.id === m.turn);
      await flick(pg, m.turn, tp.id, Math.random() < 0.5 ? 1 : Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45), (Math.random() - 0.5) * 0.4);
      await waitFor(() => ev(pg, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'my flick', 5000).catch(() => {});
      myShots++;
    }
    const fm = await ev(pg, 'window.__pf.H.match');
    if (fm.phase !== 'over') console.log('    practice state: round ' + fm.round + ' phase ' + fm.phase + ' target ' + fm.cfg.target + ' scores ' + fm.players.map(p => p.name + ':' + p.score).join(' ') + ' turnNo ' + fm.turnNo + ' log: ' + fm.log.slice(-5).join(' | '));
    check(fm.phase === 'over', 'practice match finished');
    check(botShots > 0 && myShots > 0, 'both sides played');
    console.log('  practice vs 2 easy bots: ' + (fm.players.find(p => p.id === fm.winner) || {}).name + ' won; ' + myShots + ' human flicks, ' + botShots + ' bot flicks; replay button ' + (replayClicked ? 'used' : 'not needed'));
    await pg.context().close();
  }
  /* 12 at one desk: host, a friend and 10 computer players */
  async function bigTable() {
    const host = await newPage('bighost', 400, 880), guest = await newPage('bigguest', 1280, 800);
    await host.goto(URL); await host.fill('#nameIn', 'Ab'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pf.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pf.S.room');
    await guest.goto(URL + '#' + code); await waitFor(() => guest.$('#codeIn'), 'join'); await guest.fill('#nameIn', 'Riya'); await guest.click('#joinBtn');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '2 / 12', 'guest seated');
    for (let i = 0; i < 10; i++) await host.click('#addBot-' + ['easy', 'normal', 'hard'][i % 3]);
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '12 / 12', '12 seated');
    check(!(await host.$('#addBot-easy')), 'no more bots once the desk is full');
    await host.screenshot({ path: path.join(SHOTS, 'big-lobby.png'), fullPage: true });
    await host.click('#startBtn');
    await waitFor(() => ev(guest, '!!(window.__pf.S.st.match && window.__pf.S.st.match.pens.length === 12)'), 'guest sees 12 pens');
    const m = await ev(host, 'window.__pf.H.match');
    check(m.table.w > 8 && m.pens.every(p => Math.abs(p.x) < m.table.w / 2 && Math.abs(p.y) < m.table.h / 2), 'bigger desk, every pen on it');
    // let the computer players flick; when it's a person's turn, they flick at the nearest pen
    const t0 = Date.now(); let turns = 0;
    while (Date.now() - t0 < 90000 && turns < 14) {
      const x = await ev(host, 'window.__pf.H.match');
      if (x.phase === 'over') break;
      if (x.phase !== 'aim') { await sleep(100); continue; }
      const cur = x.players.find(p => p.id === x.turn);
      if (!cur.bot) {
        const me = x.pens.find(p => p.id === x.turn), o = x.pens.filter(p => !p.out && p.id !== x.turn).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
        await flick(cur.id === x.players[0].id ? host : guest, x.turn, o.id, 0.8, 0);
      }
      await waitFor(() => ev(host, "window.__pf.H.match.turnNo !== " + x.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'turn passes', 40000); turns++;
    }
    check(turns >= 6, '12-player game keeps moving (' + turns + ' turns)');
    await sleep(800);
    await guest.screenshot({ path: path.join(SHOTS, 'big-desk.png') });
    await host.screenshot({ path: path.join(SHOTS, 'big-desk-phone.png') });
    await host.context().close(); await guest.context().close();
  }
  async function onlineWithBot() {
    const host = await newPage('bhost', 400, 880), guest = await newPage('bguest', 400, 880);
    await host.goto(URL); await host.fill('#nameIn', 'Ab'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pf.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pf.S.room');
    await guest.goto(URL + '#' + code); await waitFor(() => guest.$('#codeIn'), 'join'); await guest.fill('#nameIn', 'Riya'); await guest.click('#joinBtn');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '2 / 12', 'guest seated');
    await host.click('#addBot-hard');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '3 / 12', 'bot seated');
    const botId = await ev(host, 'window.__pf.S.st.roster.find(r => r.bot).id');
    await host.click('[data-bot="' + botId + '"]');           // hard -> easy
    await waitFor(() => ev(guest, "(window.__pf.S.st.roster.find(r => r.bot) || {}).bot === 'easy'"), 'bot level change reached guest');
    await host.screenshot({ path: path.join(SHOTS, '15-lobby-with-bot.png'), fullPage: true });
    await host.click('#cfgTarget [data-v="1"]'); await host.click('#cfgTimer [data-v="0"]');
    await host.click('#startBtn');
    let botTurns = 0;
    const tb = Date.now();
    while (Date.now() - tb < 480000) {
      const m = await ev(host, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (m.phase !== 'aim') { await sleep(80); continue; }
      const cur = m.players.find(p => p.id === m.turn);
      if (cur.bot) {
        if (botTurns === 0) check(await waitFor(() => ev(guest, "!!window.__pf.S.aim"), 'guest sees bot aim', 6000).catch(() => false), 'guest sees the bot aiming live');
        await waitFor(() => ev(host, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'bot turn', 9000); botTurns++; continue;
      }
      const pg = cur.id === (await ev(host, 'window.__pf.S.me')) ? host : guest;
      await waitFor(() => ev(pg, "document.getElementById('statusTxt') && document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0 && window.__pf.S.st.match.turnNo === " + m.turnNo), 'ready to flick', 14000);
      const foes = m.pens.filter(p => !p.out && p.id !== m.turn); const tp = foes[0], mp = m.pens.find(p => p.id === m.turn);
      await flick(pg, m.turn, tp.id, Math.random() < 0.5 ? 1 : Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45), (Math.random() - 0.5) * 0.4);
      await waitFor(() => ev(host, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'human flick', 6000).catch(() => {});
    }
    const fm = await ev(host, 'window.__pf.H.match');
    if (fm.phase !== 'over') console.log('    bot room state: round ' + fm.round + ' phase ' + fm.phase + ' turnNo ' + fm.turnNo + ' log: ' + fm.log.slice(-4).join(' | '));
    check(fm.phase === 'over' && botTurns > 0, 'online match with a bot finished (' + botTurns + ' bot turns)');
    console.log('  online room with a computer player: ' + (fm.players.find(p => p.id === fm.winner) || {}).name + ' won after ' + botTurns + ' bot turns');
    await host.context().close(); await guest.context().close();
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
      const tp = alive[Math.floor(Math.random() * alive.length)], mp = m.pens.find(p => p.id === m.turn);
      await flick(pg, m.turn, tp.id, Math.random() < 0.5 ? 1 : Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45), (Math.random() - 0.5) * 0.4, shots === 0 ? '08-local-wide.png' : null);
      await waitFor(() => ev(pg, "window.__pf.H.match.phase !== 'aim' || window.__pf.H.match.turnNo !== " + m.turnNo), 'local shot', 5000).catch(() => {});
      await waitFor(() => ev(pg, "window.__pf.H.match.phase !== 'roll'"), 'local settle', 20000);
      shots++;
    }
    if (!(await pg.$('#winner'))) { const m = await ev(pg, 'window.__pf.H.match'); console.log('    local not finished: round ' + m.round + ' phase ' + m.phase + ' scores ' + m.players.map(p => p.score) + ' log: ' + m.log.slice(-4).join(' | ')); }
    check(await waitFor(() => pg.$('#winner'), 'winner after replay', 15000).catch(() => null), 'local match finished');
    console.log('  one-device 3 players: ' + (await pg.textContent('#winner')) + ' after ' + shots + ' shots');
    const ov = await ev(pg, 'document.documentElement.scrollWidth > innerWidth + 1');
    check(!ov, 'no horizontal scroll');
    await pg.context().close();
  }
  async function spectators() {
    const host = await newPage('shost', 400, 880), dev = await newPage('sdev', 390, 860), anon = await newPage('sanon', 390, 860), riya = await newPage('sriya', 390, 860);
    await host.goto(URL); await host.fill('#nameIn', 'Ab'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pf.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pf.S.room');
    await host.click('#addBot-easy');
    // Dev watches with a name, a second person watches without typing one
    await dev.goto(URL + '#' + code); await waitFor(() => dev.$('#codeIn'), 'dev home'); await dev.fill('#nameIn', 'Dev'); await dev.click('#watchBtn');
    await anon.goto(URL); await anon.fill('#codeIn', code); await anon.click('#watchBtn');
    await waitFor(async () => (await host.$('#viewCount')) && (await host.textContent('#viewCount')).trim() === '2', 'host sees 2 viewers');
    check((await host.textContent('#seatCount')).trim() === '2 / 12', 'viewers do not take seats');
    await waitFor(() => dev.$('#watching'), 'dev told they are watching');
    check(JSON.stringify(await ev(host, 'window.__pf.S.st.viewers')) === JSON.stringify(['Dev', 'Guest']), 'viewer names listed');
    // a seated player can step back to watch
    await riya.goto(URL + '#' + code); await waitFor(() => riya.$('#codeIn'), 'riya home'); await riya.fill('#nameIn', 'Riya'); await riya.click('#joinBtn');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '3 / 12', 'riya seated');
    await riya.click('#justWatch');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '2 / 12' && (await host.textContent('#viewCount')).trim() === '3', 'riya now watching');
    await host.click('#eyeChip'); await waitFor(() => host.$('#viewPop'), 'viewer list opens');
    check(/Dev/.test(await host.textContent('#viewPop')) && /Riya/.test(await host.textContent('#viewPop')), 'viewer list shows names');
    await host.screenshot({ path: path.join(SHOTS, '18-host-viewers.png'), fullPage: true });
    await host.click('#eyeChip');
    await host.click('#cfgTarget [data-v="1"]'); await host.click('#cfgTimer [data-v="0"]');
    await host.click('#startBtn');
    await waitFor(() => ev(dev, "!!window.__pf.S.st.match"), 'viewer sees match');
    let guard = 0, framesAtViewer = 0, reacted = false, reloaded = false;
    while (guard++ < 300) {
      const m = await ev(host, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (m.phase !== 'aim') { await sleep(80); continue; }
      const cur = m.players.find(p => p.id === m.turn);
      if (!reacted) {
        await dev.click('.reacts .react >> nth=0');
        reacted = await waitFor(() => ev(host, "window.__pf.S.floats.some(f => f.pid === 'v:Dev')"), 'viewer reaction reached host', 4000).catch(() => false);
        check(reacted, 'viewer reactions show on the desk');
        await sleep(200); await dev.screenshot({ path: path.join(SHOTS, '17-spectator.png') });
      }
      if (cur.bot) { await waitFor(() => ev(host, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'bot turn', 9000); continue; }
      await waitFor(() => ev(host, "document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0"), 'host ready', 14000);
      const foes = m.pens.filter(p => !p.out && p.id !== m.turn), tp = foes[0], mp = m.pens.find(p => p.id === m.turn);
      await flick(host, m.turn, tp.id, Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.45), 0);
      const got = await waitFor(() => ev(dev, 'window.__pf.S.frames.length'), 'viewer gets frames', 6000).catch(() => 0);
      if (got) framesAtViewer++;
      if (!reloaded) {
        reloaded = true;
        await dev.reload();
        await waitFor(() => ev(dev, "window.__pf.S.conn === 'open' && !!window.__pf.S.st && !!window.__pf.S.st.match"), 'viewer back after reload', 30000);
        check(!(await ev(dev, 'window.__pf.S.me')), 'viewer stays a viewer after reload');
        await waitFor(async () => (await host.textContent('#viewCount')).trim() === '3', 'viewer count back to 3 after reload', 25000);
      }
    }
    check(framesAtViewer > 0, 'viewers see shots streamed live');
    await waitFor(() => dev.$('#sitNext'), 'viewer can join the next match', 15000);
    check(await waitFor(() => dev.$('#matchSummary'), 'viewer sees summary', 5000).catch(() => false), 'viewer sees the match summary');
    await dev.click('#sitNext');
    await waitFor(() => ev(host, "window.__pf.S.st.roster.some(r => r.name === 'Dev')"), 'dev took a seat for the rematch');
    await waitFor(async () => (await host.textContent('#viewCount')).trim() === '2', 'viewer count drops when dev sits');
    await host.click('#rematchBtn');
    await waitFor(() => ev(dev, "!!window.__pf.S.me && window.__pf.S.st.match.players.some(p => p.id === window.__pf.S.me) && window.__pf.S.st.match.round === 1"), 'dev plays the rematch');
    await anon.context().close();
    await waitFor(async () => (await host.textContent('#viewCount')).trim() === '1', 'viewer count drops when a viewer leaves', 30000);
    console.log('  spectators: 3 watched (one with no name, one stepped back from a seat), saw ' + framesAtViewer + ' live shots, reacted, survived a reload, then joined the rematch');
    await host.context().close(); await dev.context().close(); await riya.context().close();
  }
  async function clipsTest() {
    const pg = await newPage('clips', 400, 900);
    await pg.goto(URL);
    await pg.fill('#nameIn', 'Ab');
    await pg.click('#pracBots [data-v="2"]');
    await pg.click('#pracLevel [data-v="easy"]');
    await pg.click('#practiceStart');
    await waitFor(() => pg.$('#desk'), 'practice desk');
    check(await ev(pg, 'window.__pf.clips.supported()'), 'clips supported in Chromium (' + (await ev(pg, 'window.__pf.clips.mime()')) + ')');
    const saveDl = async (file) => {
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#clipDownload')]);
      const out = path.join(SHOTS, file + path.extname(dl.suggestedFilename()));
      await dl.saveAs(out); return { out, name: dl.suggestedFilename() };
    };
    let clipped = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 480000) {
      const m = await ev(pg, 'window.__pf.H.match');
      if (m.phase === 'over') break;
      if (!clipped && (await ev(pg, "!!(window.__pf.S.lastReplay && window.__pf.S.lastReplay.fell.length && document.getElementById('clipBtn'))"))) {
        await pg.click('#clipBtn');
        await waitFor(() => pg.$('#clipSheet'), 'clip sheet opens', 3000);
        await sleep(1500); await pg.screenshot({ path: path.join(SHOTS, '19-clip-recording.png') });
        await waitFor(() => pg.$('#clipDownload'), 'clip finished', 30000);
        await sleep(600); await pg.screenshot({ path: path.join(SHOTS, '20-clip-ready.png') });
        clipped = await saveDl('clip-single');
        const last = await ev(pg, 'window.__pf.clips.last');
        check(last.size > 20000, 'single clip has real video data (' + last.size + ' bytes, ' + last.secs + ' s)');
        await pg.click('#clipClose');
        continue;
      }
      if (m.phase !== 'aim') { await sleep(80); continue; }
      const cur = m.players.find(p => p.id === m.turn);
      if (cur.bot) { await waitFor(() => ev(pg, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'bot flicks', 9000).catch(() => {}); continue; }
      const ready = await waitFor(() => ev(pg, "document.getElementById('statusTxt') && document.getElementById('statusTxt').textContent.indexOf('Instant replay') !== 0 && window.__pf.H.match.phase === 'aim'"), 'my turn ready', 14000).catch(() => false);
      if (!ready) continue;
      const foes = m.pens.filter(p => !p.out && p.id !== m.turn); const tp = foes[0], mp = m.pens.find(p => p.id === m.turn);
      await flick(pg, m.turn, tp.id, Math.min(1, Math.hypot(tp.x - mp.x, tp.y - mp.y) / 7 + 0.5), 0);
      await waitFor(() => ev(pg, "window.__pf.H.match.turnNo !== " + m.turnNo + " || window.__pf.H.match.phase !== 'aim'"), 'my flick', 5000).catch(() => {});
    }
    check(!!clipped, 'saved a single replay clip');
    await waitFor(() => pg.$('#reelBtn'), 'reel button at match end', 20000);
    const nShots = await ev(pg, "window.__pf.clips.highlights(window.__pf.H.match).length");
    await pg.click('#reelBtn');
    await waitFor(() => pg.$('#clipSheet'), 'reel sheet opens', 3000);
    await sleep(800); await pg.screenshot({ path: path.join(SHOTS, '21-reel-recording.png') });
    await waitFor(() => pg.$('#clipDownload'), 'reel finished', 90000);
    const reel = await saveDl('reel');
    const rl = await ev(pg, 'window.__pf.clips.last');
    check(rl.size > 40000 && rl.secs > 6, 'highlight reel recorded (' + rl.size + ' bytes, ' + rl.secs + ' s, ' + nShots + ' shots)');
    console.log('  clips: single ' + clipped.name + ', reel ' + reel.name + ' (' + rl.secs + ' s, ' + Math.round(rl.size / 1024) + ' KB, ' + nShots + ' highlights)');
    await pg.context().close();
  }
  try {
    if (process.env.BIG_ONLY) { await bigTable(); throw 'done'; }
    if (process.env.LOCAL_ONLY) { await localMatch(); throw 'done'; }
    if (process.env.PRACTICE_ONLY) { for (let k = 0; k < 3; k++) await practiceVsBots(); throw 'done'; }
    if (process.env.BOT_ONLY) { for (let k = 0; k < 3; k++) await onlineWithBot(); throw 'done'; }
    if (process.env.CLIPS_ONLY) { await clipsTest(); throw 'done'; }
    if (process.env.SPECT_ONLY) { await spectators(); throw 'done'; }
    if (process.env.TEAMS_ONLY) { for (let k = 0; k < 2; k++) await onlineMatch(4, { teams: true, target: 2 }); await practiceVsBots(); throw 'done'; }
    await onlineMatch(5, { shots: true, reload: true, target: 1 });
    await onlineMatch(2, { target: 1 });
    await onlineMatch(4, { teams: true, target: 2, shots: true });
    await localMatch();
    await practiceVsBots();
    await onlineWithBot();
    await spectators();
    await clipsTest();
  } catch (e) { if (e !== 'done') { fails++; console.log('  ERROR ' + e.stack); } }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 10).join('\n    '));
  await browser.close(); web.close(); psrv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PEN FIGHT E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
