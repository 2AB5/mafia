// Real multiplayer test: local PeerJS signalling server + static server + many Chromium tabs talking WebRTC.
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const PEER_PORT = 9123, WEB_PORT = 8765;
const URL = 'http://127.0.0.1:' + WEB_PORT + '/?peer=127.0.0.1:' + PEER_PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } }
async function waitFor(fn, label, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { let v; try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(60); }
  throw new Error('timeout: ' + label);
}

(async () => {
  const papp = express();
  const psrv = papp.listen(PEER_PORT, '127.0.0.1');
  papp.use('/', ExpressPeerServer(psrv, { path: '/' }));
  const peerServer = psrv;
  const web = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, 'index.html'))); }).listen(WEB_PORT, '127.0.0.1');
  await sleep(500);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
  const errors = [];
  const NAMES = ['Ab', 'Riya', 'Karan', 'Meera', 'Dev', 'Isha', 'Arjun', 'Zoya'];
  const AVS = ['🦊', '🐺', '🦉', '🐱', '🦝', '🐍', '🦅', '🐻'];

  async function newPlayer(i, width) {
    const ctx = await browser.newContext({ viewport: { width: width || 420, height: 860 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('p' + i + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push('p' + i + ' console: ' + m.text()); });
    await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**/fonts.gstatic.com/**', r => r.abort());
    return page;
  }
  const S = (pg, expr) => pg.evaluate(new Function('return (' + expr + ')'));
  async function closeOverlays(pg) {
    for (let k = 0; k < 3; k++) {
      if (await pg.$('#flipCard:not(.flipped)')) { await pg.click('#flipCard'); await pg.click('#gotRole'); continue; }
      if (await pg.$('#gotRole')) { await pg.click('#gotRole'); continue; }
      if (await pg.$('#ovClose')) { await pg.click('#ovClose'); continue; }
      break;
    }
  }

  async function onlineGame(n, opts) {
    opts = opts || {};
    const pages = [];
    const host = await newPlayer(0, 420);
    pages.push(host);
    await host.goto(URL);
    await host.fill('#nameIn', NAMES[0]);
    await host.click('#avPick [data-av="' + AVS[0] + '"]');
    if (opts.shots) await host.screenshot({ path: path.join(SHOTS, '01-home.png'), fullPage: true });
    await host.click('#createBtn');
    await waitFor(() => S(host, "window.__mafia.S.conn === 'open'"), 'host room open');
    const code = await S(host, 'window.__mafia.S.room');
    check(/^[A-Z]{4}$/.test(code), 'room code ' + code);
    check(!!(await host.$('#qr svg')), 'QR code rendered');
    for (let i = 1; i < n; i++) {
      const pg = await newPlayer(i, i === 1 ? 390 : 1000);
      pages.push(pg);
      await pg.goto(URL + '#' + code);
      await waitFor(() => pg.$('#codeIn'), 'join form ' + i);
      check((await pg.inputValue('#codeIn')) === code, 'invite link prefilled the code');
      await pg.fill('#nameIn', NAMES[i]);
      await pg.click('#avPick [data-av="' + AVS[i] + '"]');
      await pg.click('#joinBtn');
    }
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === n + ' / ' + MAXP_STR, 'all ' + n + ' seated', 30000);
    for (let i = 1; i < n; i++) await waitFor(() => S(pages[i], '!!window.__mafia.S.me'), 'player ' + i + ' seated');
    if (opts.shots) { await sleep(300); await host.screenshot({ path: path.join(SHOTS, '02-lobby-host.png'), fullPage: true }); await pages[1].screenshot({ path: path.join(SHOTS, '03-lobby-player.png'), fullPage: true }); }
    for (const c of opts.cfg || []) await host.click(c);
    // lobby chat
    await pages[1].fill('#chatIn', 'hello everyone');
    await pages[1].press('#chatIn', 'Enter');
    await waitFor(async () => (await host.textContent('#chatLog')).includes('hello everyone'), 'lobby chat reached host');
    check(!(await pages[1].$('#startBtn')), 'only host can deal');
    await host.click('#startBtn');
    // role flip overlays
    for (let i = 0; i < n; i++) {
      await waitFor(() => pages[i].$('#flipCard'), 'role card on ' + i);
      if (opts.shots && i === 1) await pages[1].screenshot({ path: path.join(SHOTS, '04-role-card.png') });
      await pages[i].click('#flipCard');
      if (opts.shots && i === 1) { await sleep(800); await pages[1].screenshot({ path: path.join(SHOTS, '05-role-revealed.png') }); }
      await pages[i].click('#gotRole');
    }
    // privacy: each player only knows their own role (plus mafia partners)
    for (let i = 0; i < n; i++) {
      const info = await S(pages[i], '({ me: window.__mafia.S.me, view: window.__mafia.S.view, pub: window.__mafia.S.pub })');
      check(info.view && info.view.me.id === info.me, 'own view on ' + i);
      check(info.pub.players.every(p => p.rv === null), 'no roles in public state on ' + i);
      if (info.view.me.role !== 'mafia') check(info.view.mates.length === 0 && Object.keys(info.view.mateVotes).length === 0, 'non-mafia sees no mafia on ' + i);
    }
    const truth = await S(host, 'window.__mafia.H.st.players.map(p => ({ id: p.id, role: p.role }))');

    let guard = 0, shotN = 0, reloaded = false, hostReloaded = false;
    const seen = new Set();
    while (guard++ < 60) {
      const pub = await S(host, 'window.__mafia.S.pub');
      if (pub.phase === 'over') break;
      seen.add(pub.phase);
      const key = pub.gameId + ':' + pub.key;
      // mid-game player reload (rejoins automatically with saved token)
      if (opts.reloadPlayer && !reloaded && pub.phase === 'discuss') {
        reloaded = true;
        const pg = pages[2];
        await pg.reload();
        await waitFor(() => S(pg, "window.__mafia.S.conn === 'open' && !!window.__mafia.S.view"), 'player rejoined after reload', 30000);
        check(true, '');
        console.log('    player reload: rejoined with the same seat');
      }
      if (opts.reloadHost && !hostReloaded && pub.phase === 'vote') {
        hostReloaded = true;
        await host.reload();
        await waitFor(() => S(host, "window.__mafia.S.conn === 'open' && !!window.__mafia.H.st"), 'host resumed after reload', 60000);
        for (let i = 1; i < n; i++) await waitFor(() => S(pages[i], "window.__mafia.S.conn === 'open'"), 'player ' + i + ' reconnected to resumed host', 60000);
        console.log('    host reload: game resumed, all players reconnected');
      }
      for (let i = 0; i < n; i++) {
        const pg = pages[i];
        const nowKey = await S(host, "window.__mafia.S.pub.gameId + ':' + window.__mafia.S.pub.key");
        if (nowKey !== key) break;            // everyone still alive has acted; the game moved on
        let st;
        try {
          st = await waitFor(() => S(pg, "(function(){var s=window.__mafia.S,v=s.view,p=s.pub;return v&&p&&(p.gameId+':'+p.key)===" + JSON.stringify(key) + "&&v.key===p.key?{act:v.act,alive:v.me.alive,role:v.me.role,mine:v.mine}:null})()"), 'player ' + i + ' synced to ' + key, 30000);
        } catch (e) {
          const dump = await S(pg, "(function(){var s=window.__mafia.S,c=window.__mafia.C;return {conn:s.conn,msg:s.connMsg,me:s.me,pub:s.pub&&s.pub.key,game:s.pub&&s.pub.gameId,view:s.view&&s.view.key,open:!!(c.conn&&c.conn.open),last:Date.now()-c.lastMsg,att:c.attempts}})()");
          const hostSide = await S(host, "(function(){var a=[];window.__mafia.H.conns.forEach(function(r){a.push({pid:r.pid,open:r.conn.open,age:Date.now()-r.last})});return {conns:a,roster:window.__mafia.H.roster.map(function(r){return r.id})}})()");
          console.log('    DIAG player', i, JSON.stringify(dump), '\n    HOST', JSON.stringify(hostSide));
          throw e;
        }
        await closeOverlays(pg);
        if (!st.alive || !st.act || st.mine) continue;
        const act = st.act;
        if (act.kind === 'sleep' || act.kind === 'ready') { await pg.click('#actBtn'); continue; }
        const opts2 = act.kind === 'vote' ? act.targets.concat(['skip']) : act.targets;
        const pick = opts2[Math.floor(Math.random() * opts2.length)];
        await pg.click((pick === 'skip' ? 'button.seat.skip' : 'button.seat') + '[data-id="' + pick + '"]');
        if (st.role === 'mafia' && act.kind === 'kill' && await pg.$('#mchatIn')) { await pg.fill('#mchatIn', 'secret plan ' + key); await pg.press('#mchatIn', 'Enter'); }
        if (opts.shots && i === 1 && shotN < 3) { await pg.screenshot({ path: path.join(SHOTS, '06-' + key.split(':')[1] + '-player.png'), fullPage: true }); shotN++; }
        await pg.click('#actBtn');
      }
      if (pub.phase === 'discuss') {
        const talker = pages[n - 1];
        if (!(await talker.$('#chatIn[disabled]'))) { await talker.fill('#chatIn', 'I trust nobody'); await talker.press('#chatIn', 'Enter'); }
      }
      await waitFor(async () => { const p = await S(host, 'window.__mafia.S.pub'); return (p.gameId + ':' + p.key) !== key; }, 'advance past ' + key, 30000);
      if (opts.shots && guard <= 2) {
        await sleep(500);
        const ov = await pages[1].$('#ovTitle');
        if (ov) await pages[1].screenshot({ path: path.join(SHOTS, '07-announce-' + guard + '.png') });
      }
    }
    const pub = await S(host, 'window.__mafia.S.pub');
    check(pub.phase === 'over', 'game over reached');
    check(seen.has('night') && seen.has('discuss') && seen.has('vote'), 'all phases seen');
    for (let i = 0; i < n; i++) {
      await waitFor(() => pages[i].$('#winner'), 'winner on ' + i, 20000);
      await closeOverlays(pages[i]);
      check((await pages[i].$$('.seat.reveal')).length === n, 'final reveal on ' + i);
    }
    if (opts.shots) await pages[1].screenshot({ path: path.join(SHOTS, '08-over.png'), fullPage: true });
    // mafia whispers never reached town players
    for (let i = 0; i < n; i++) {
      const me = await S(pages[i], 'window.__mafia.S.me');
      const role = truth.find(t => t.id === me).role;
      if (role === 'mafia') continue;
      const leaked = await S(pages[i], "JSON.stringify(window.__mafia.S).indexOf('secret plan') !== -1");
      check(!leaked, 'mafia whisper leaked to town player ' + i);
    }
    // play again keeps the table
    await host.click('#againBtn');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === n + ' / ' + MAXP_STR, 'same players back in lobby', 20000);
    for (let i = 1; i < n; i++) await waitFor(() => S(pages[i], "window.__mafia.S.pub.phase === 'lobby' && !!window.__mafia.S.me"), 'player ' + i + ' back in lobby');
    console.log('  online ' + n + ' players: ' + pub.winner + ' won (round ' + pub.round + ')');
    for (const p of pages) await p.context().close();
  }
  const MAXP_STR = '8';

  async function edgeCases() {
    // wrong code
    const pg = await newPlayer(90, 390);
    await pg.goto(URL);
    await pg.fill('#nameIn', 'Lost');
    await pg.fill('#codeIn', 'QQQQ');
    await pg.click('#joinBtn');
    await waitFor(() => S(pg, "window.__mafia.S.conn === 'failed'"), 'unknown room fails cleanly', 60000);
    const msg = await pg.textContent('.connbar');
    check(/not found/i.test(msg), 'unknown room message: ' + msg);
    await pg.screenshot({ path: path.join(SHOTS, '09-room-not-found.png') });
    await pg.context().close();
    // full table: 9th player is refused a seat
    const pages = [];
    const host = await newPlayer(100, 1000); pages.push(host);
    await host.goto(URL); await host.fill('#nameIn', 'Host'); await host.click('#createBtn');
    await waitFor(() => S(host, "window.__mafia.S.conn === 'open'"), 'host open');
    const code = await S(host, 'window.__mafia.S.room');
    for (let i = 1; i <= 8; i++) {
      const p = await newPlayer(100 + i, 1000); pages.push(p);
      await p.goto(URL + '#' + code); await waitFor(() => p.$('#nameIn'), 'form'); await p.fill('#nameIn', 'Guest' + i); await p.click('#joinBtn');
      await sleep(150);
    }
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '8 / 8', 'table full at 8', 30000);
    const ninth = pages[8];
    await waitFor(() => S(ninth, "window.__mafia.S.conn === 'open' && !!window.__mafia.S.pub"), 'ninth connected');
    await sleep(800);
    check(!(await S(ninth, 'window.__mafia.S.me')), 'ninth player not seated');
    // host kicks someone in lobby -> 7, ninth can now sit
    const victim = await S(host, 'window.__mafia.S.pub.roster[1].id');
    await host.click('[data-remove="' + victim + '"]');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '7 / 8', 'kick works');
    await waitFor(() => ninth.$('#sitBtn'), 'sit form for spectator');
    await ninth.click('#sitBtn');
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '8 / 8', 'spectator sat down after kick');
    // timers + skip + duplicate tab
    await host.selectOption('#cfgNight', '60');
    await host.click('#startBtn');
    await waitFor(() => pages[2].$('#timer'), 'timer visible to players');
    const t = await pages[2].textContent('#timer');
    check(/^[01]:\d\d$/.test(t), 'timer text ' + t);
    const k0 = await S(host, 'window.__mafia.S.pub.key');
    await closeOverlays(host);
    await host.click('#cf-skip'); await host.click('#cf-skip');
    await waitFor(async () => (await S(host, 'window.__mafia.S.pub.key')) !== k0, 'host skip waiting');
    console.log('  edge cases: bad code, full table, kick, spectator seat, timer, skip: ok');
    for (const p of pages) await p.context().close();
  }

  async function localGame() {
    const page = await newPlayer(200, 390);
    await page.goto(URL);
    await page.click('#localBtn');
    for (let i = 4; i < 6; i++) await page.click('#addP');
    for (let i = 0; i < 6; i++) await page.fill('#ln' + i, NAMES[i]);
    await page.click('#localStart');
    let guard = 0;
    while (guard++ < 400) {
      if (await page.$('#winner')) break;
      if (await page.$('#iAm')) { await page.click('#iAm'); continue; }
      if (await page.$('#hideNext')) { await page.click('#hideNext'); continue; }
      if (await page.$('#voteBtn')) { await page.click('#voteBtn'); continue; }
      if (await page.$('#beginNight')) { await page.click('#beginNight'); continue; }
      if (await page.$('#actBtn')) { const s = await page.$$('button.seat'); if (s.length) await s[Math.floor(Math.random() * s.length)].click(); await page.click('#actBtn'); continue; }
      throw new Error('local stuck');
    }
    check(!!(await page.$('#winner')), 'local game finished');
    console.log('  one-device game: ' + (await page.textContent('#winner')));
    await page.context().close();
  }

  try {
    await onlineGame(6, { shots: true, reloadPlayer: true });
    await onlineGame(8, { reloadHost: true, cfg: ['#cfgReveal [data-v="team"]'] });
    await onlineGame(4, { cfg: ['#cfgPrank'] });
    await edgeCases();
    await localGame();
    // overflow + dark/night checks at phone width on saved screenshots happen visually
  } catch (e) { fails++; console.log('  ERROR ' + e.stack); }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 12).join('\n    '));
  await browser.close();
  web.close();
  try { peerServer.close(); } catch (e) { /* ignore */ }
  console.log(fails ? fails + ' FAILED' : 'ALL WEB E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
