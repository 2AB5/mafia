// Real online badminton test: local PeerJS server + Chromium tabs. Players are driven by an autopilot that
// uses the same moves and swings as the controls, plus direct keyboard and touch checks.
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PEER_PORT = 9163, WEB_PORT = 8805;
const URL = 'http://127.0.0.1:' + WEB_PORT + '/?peer=127.0.0.1:' + PEER_PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } }
async function waitFor(fn, label, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { let v; try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(80); } throw new Error('timeout: ' + label); }
const ev = (pg, expr) => pg.evaluate(new Function('return (' + expr + ')'));
(async () => {
  const papp = express(); const psrv = papp.listen(PEER_PORT, '127.0.0.1'); papp.use('/', ExpressPeerServer(psrv, { path: '/' }));
  const web = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(path.join(DIR, 'index.html'))); }).listen(WEB_PORT, '127.0.0.1');
  await sleep(400);
  const browser = await chromium.launch(); const errors = [];
  async function newPage(tag, opt) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opt || {}));
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await pg.route('**/fonts.gstatic.com/**', r => r.abort());
    pg._tag = tag; return pg;
  }
  const M = (pg) => ev(pg, 'window.__bd.H.match && JSON.parse(JSON.stringify(Object.assign({}, window.__bd.H.match, { events: [] })))');

  async function controls() {
    const pg = await newPage('keys', { viewport: { width: 1280, height: 800 } });
    await pg.goto(URL); await pg.fill('#nameIn', 'Ab'); await pg.click('#pracFmt [data-v="1v1"]'); await pg.click('#pracLvl [data-v="easy"]'); await pg.click('#practiceBtn');
    await waitFor(() => ev(pg, '!!window.__bd.H.match'), 'practice starts');
    const me = await ev(pg, 'window.__bd.S.me');
    // receiving or serving, park everything so we can test calmly
    await pg.evaluate(() => { const m = window.__bd.H.match; m.phase = 'rally'; m.lastHitTeam = 1; m.landed = null; m.shuttle = { x: 0, y: -3, z: 8, vx: 0, vy: 0, vz: 0 }; });
    // wide screen = sideways court, my side on the left: Up/Down move across the court, Left/Right toward or away from the net
    const pos = () => ev(pg, '(p => [p.x, p.y])(window.__bd.H.match.players.find(p => p.id === window.__bd.S.me))');
    if (process.env.DBG) console.log('    dbg', await ev(pg, "JSON.stringify({ act: document.activeElement.tagName + '#' + document.activeElement.id, phase: window.__bd.H.match.phase, server: window.__bd.H.match.server === window.__bd.S.me, auto: !!window.__bdAuto, orient: window.__bd.Input.orient })"));
    await waitFor(() => ev(pg, "window.__bd.Input.orient === 'land'"), 'wide layout', 3000);
    const a0 = await pos(); await pg.keyboard.down('ArrowDown'); await sleep(350); await pg.keyboard.up('ArrowDown'); const a1 = await pos();
    check(a1[0] - a0[0] > 0.5 && Math.abs(a1[1] - a0[1]) < 0.2, 'Down moves across the court on a wide screen (' + a0.map(v => v.toFixed(2)) + ' → ' + a1.map(v => v.toFixed(2)) + ')');
    await pg.keyboard.down('ArrowRight'); await sleep(350); await pg.keyboard.up('ArrowRight'); const a2 = await pos();
    check(a2[1] < a1[1] - 0.5, 'Right moves toward the net on a wide screen');
    // hang the shuttle at smash height right in front of me, then press L
    const setUp = (z) => pg.evaluate((z) => { const m = window.__bd.H.match, p = m.players.find(q => q.id === window.__bd.S.me); m.phase = 'rally'; m.lastHitTeam = 1; m.landed = null; p.swing = 0; p.energy = 100; m.shuttle = { x: p.x + 0.3, y: p.y - 0.3, z: z, vx: 0, vy: 0, vz: 0.4 }; }, z);
    await setUp(2.6); await sleep(150);
    check(/Smash/.test(await pg.textContent('#btn-smash')), 'smash button says Smash when the shuttle is high');
    await pg.keyboard.press('KeyL');
    await waitFor(() => ev(pg, "window.__bd.H.match.events.some(e => e.k === 'hit' && e.kind === 'smash' && e.by === window.__bd.S.me)"), 'L smashes', 3000).catch(() => check(false, 'L key smashes'));
    await setUp(0.45); await sleep(150);
    check(await ev(pg, "document.getElementById('btn-smash').classList.contains('danger')"), 'smash button warns when the shuttle is too low');
    await pg.screenshot({ path: path.join(SHOTS, '03-low-warning.png') });
    await pg.dispatchEvent('#btn-clear', 'pointerdown');
    await waitFor(() => ev(pg, "window.__bd.H.match.events.some(e => e.k === 'hit' && e.kind === 'lift' && e.by === window.__bd.S.me)"), 'tap lifts', 3000).catch(() => check(false, 'tapping Clear on a low shuttle lifts it'));
    // serving: force my serve and use the three serves
    for (const [key, kind] of [['KeyJ', 'serveLong'], ['KeyK', 'serveShort'], ['KeyL', 'serveFlick']]) {
      await pg.evaluate(() => { const m = window.__bd.H.match; m.serveSide = m.players.find(p => p.id === window.__bd.S.me).side; m.nextServer = [0, 0]; window.__bd.BD.startServe(m); });
      await sleep(250);
      if (key === 'KeyJ') check(/High serve/.test(await pg.textContent('#btn-clear')), 'buttons show serve names');
      await pg.keyboard.press(key);
      await waitFor(() => ev(pg, "window.__bd.H.match.events.some(e => e.k === 'hit' && e.kind === '" + kind + "')"), kind, 3000).catch(() => check(false, key + ' serves ' + kind));
    }
    // now let the autopilot play a quick game to 5 and check the end screen
    await pg.evaluate(() => { window.__bd.H.match.cfg.target = 5; window.__bdAuto = 'hard'; });
    await waitFor(async () => (await M(pg)).phase === 'over', 'practice game ends', 180000);
    await waitFor(() => pg.$('#summaryTable'), 'summary shown');
    const m = await M(pg);
    check(Math.max(...m.score) >= 5, 'someone reached 5: ' + m.score.join('-'));
    await pg.screenshot({ path: path.join(SHOTS, '04-over-desktop.png'), fullPage: true });
    console.log('  controls + practice: keys move, L smashes, low-shot warning, tap lifts, 3 serves, game ' + m.score.join('–'));
    await pg.context().close(); void me;
  }

  async function online(n, bots, opts) {
    opts = opts || {};
    const host = await newPage('host', opts.hostView);
    await host.goto(URL); await host.fill('#nameIn', 'Ab'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__bd.S.conn === 'open'"), 'court open');
    const code = await ev(host, 'window.__bd.S.room');
    const pages = [host];
    for (let i = 1; i < n; i++) {
      const pg = await newPage('p' + i, i === 1 && opts.landscape ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : undefined);
      await pg.goto(URL + '#' + code); await waitFor(() => pg.$('#codeIn'), 'home');
      await pg.fill('#nameIn', ['Riya', 'Karan', 'Meera'][i - 1]); await pg.click('#joinBtn');
      await waitFor(async () => (await host.textContent('#seatCount')).trim() === (i + 1) + ' / 4', 'player ' + i + ' seated');
      pages.push(pg);
    }
    for (let b = 0; b < bots; b++) await host.click('#addBot-normal');
    const spec = await newPage('spec');
    await spec.goto(URL); await spec.fill('#nameIn', 'Dev'); await spec.fill('#codeIn', code); await spec.click('#watchBtn');
    await waitFor(async () => (await host.$('#viewCount')) && (await host.textContent('#viewCount')).trim() === '1', 'viewer counted');
    // balance the sides: alternate everyone
    const roster = await ev(host, 'window.__bd.S.st.roster');
    const want = roster.map((r, i) => i % 2);
    for (let i = 0; i < roster.length; i++) if (roster[i].side !== want[i]) { await host.click('[data-move="' + roster[i].id + '"]'); await sleep(150); }
    await host.click('#cfgTarget [data-v="5"]');
    await sleep(200);
    if (opts.shots) await host.screenshot({ path: path.join(SHOTS, '05-lobby.png'), fullPage: true });
    await host.click('#startBtn');
    for (const pg of pages.concat([spec])) await waitFor(() => ev(pg, '!!(window.__bd.S.st && window.__bd.S.st.match)'), pg._tag + ' sees the match');
    for (const pg of pages) await pg.evaluate(() => { window.__bdAuto = 'hard'; });
    let reloaded = false, shot = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const m = await M(host);
      if (m.phase === 'over') break;
      if (!shot && m.phase === 'rally' && m.rallyHits >= 2 && opts.shots) {
        shot = true; await sleep(200);
        await pages[1].screenshot({ path: path.join(SHOTS, '06-client-rally' + (opts.landscape ? '-landscape' : '') + '.png') });
        await spec.screenshot({ path: path.join(SHOTS, '07-spectator.png') });
      }
      if (opts.reload && !reloaded && m.score[0] + m.score[1] >= 2) {
        reloaded = true;
        await pages[1].reload();
        await waitFor(() => ev(pages[1], "window.__bd.S.conn === 'open' && !!window.__bd.S.me && !!window.__bd.S.st.match"), 'client back after reload', 30000);
        await pages[1].evaluate(() => { window.__bdAuto = 'hard'; });
        console.log('    client reloaded mid-game and rejoined');
      }
      await sleep(400);
    }
    const m = await M(host);
    check(m.phase === 'over', 'online game finished (' + m.score.join('-') + ')');
    const sum = await ev(host, 'window.__bd.BD.summary(window.__bd.H.match)');
    const clientRows = sum.rows.filter(r => r.id !== m.players[0].id && !r.bot);
    check(clientRows.every(r => r.hits >= 3), 'remote players hit the shuttle over the network: ' + clientRows.map(r => r.name + ' ' + r.hits).join(', '));
    const avg = sum.rows.reduce((a, r) => a + r.hits, 0) / Math.max(1, sum.rallies);
    check(avg >= 2, 'real rallies online (' + avg.toFixed(1) + ' shots per rally)');
    for (const pg of pages.concat([spec])) await waitFor(() => pg.$('#summaryTable'), pg._tag + ' sees the summary', 8000);
    // everyone saw the same score
    for (const pg of pages.concat([spec])) { const sc = await ev(pg, 'window.__bd.S.st.match.score.join("-")'); check(sc === m.score.join('-'), pg._tag + ' score matches (' + sc + ')'); }
    console.log('  online ' + m.mode + ' (' + (n) + ' people' + (bots ? ' + ' + bots + ' bots' : '') + '): ' + m.score.join('–') + ', ' + avg.toFixed(1) + ' shots per rally, longest ' + sum.longest);
    // a fifth person can't join a full court, so they watch
    if (n + bots === 4) {
      const late = await newPage('late'); await late.goto(URL + '#' + code); await waitFor(() => late.$('#codeIn'), 'home'); await late.fill('#nameIn', 'Late'); await late.click('#joinBtn');
      await waitFor(async () => (await host.textContent('#viewCount')).trim() === '2', 'late joiner waits as a viewer');
      await late.context().close();
    }
    if (opts.shots) await pages[1].screenshot({ path: path.join(SHOTS, '08-over-client.png'), fullPage: true });
    await host.click('#rematchBtn');
    await waitFor(() => ev(pages[1], "window.__bd.S.st.match && window.__bd.S.st.match.phase !== 'over'"), 'rematch reaches the client');
    for (const pg of pages.concat([spec])) await pg.context().close();
  }
  try {
    if (process.env.CTL_ONLY) { await controls(); throw 'done'; }
    await controls();
    await online(2, 0, { reload: true, shots: true });
    await online(2, 2, { landscape: true, shots: true });
    await online(3, 0, {});
  } catch (e) { if (e !== 'done') { fails++; console.log('  ERROR ' + e.stack); } }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 10).join('\n    '));
  await browser.close(); web.close(); psrv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL BADMINTON E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
