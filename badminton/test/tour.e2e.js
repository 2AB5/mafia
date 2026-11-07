// Real online badminton test: local PeerJS server + Chromium tabs. Players are driven by an autopilot that
// uses the same moves and swings as the controls, plus direct keyboard and touch checks.
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PEER_PORT = 9173, WEB_PORT = 8815;
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
  const finish = (pg, n, side) => pg.evaluate(([n, side]) => { const c = window.__bd.H.courts[n]; const m = c.match; if (!m || m.phase === 'over' || m.fid !== c.fid) return false; m.games = [[2, 0], [2, 1]].map(g => side ? g.slice().reverse() : g); m.gamesWon = side ? [0, 2] : [2, 0]; m.winner = side; m.phase = 'over'; return true; }, [n, side]);
  const H = (pg, expr) => ev(pg, '(H => ' + expr + ')(window.__bd.H)');
  // ---- singles knockout: host + 2 friends + 3 bots = 6 entries, two courts at once ----
  const host = await newPage('host', { viewport: { width: 1200, height: 900 } });
  await host.goto(URL); await host.fill('#nameIn', 'Ab'); await host.click('#createBtn');
  await waitFor(() => ev(host, "window.__bd.S.conn === 'open'"), 'court open');
  await host.click('#modePick [data-v="tour"]');
  await waitFor(() => host.$('#tKind'), 'tournament setup shown');
  const code = await ev(host, 'window.__bd.S.room');
  const ps = [];
  for (const nm of ['Riya', 'Karan']) {
    const pg = await newPage(nm); await pg.goto(URL + '#' + code); await waitFor(() => pg.$('#codeIn'), 'home');
    await pg.fill('#nameIn', nm); await pg.click('#joinBtn'); ps.push(pg);
  }
  await waitFor(async () => (await host.textContent('#seatCount')).trim() === '3 / 16', '3 entered');
  for (let b = 0; b < 3; b++) await host.click('#addBot-normal');
  await waitFor(async () => (await host.textContent('#seatCount')).trim() === '6 / 16', '6 entered');
  check(await ps[0].$('#waitHost') && /Tournament/.test(await ps[0].textContent('#waitHost')), 'friends see the tournament lobby');
  const spec = await newPage('spec'); await spec.goto(URL); await spec.fill('#nameIn', 'Dev'); await spec.fill('#codeIn', code); await spec.click('#watchBtn');
  await waitFor(() => spec.$('#waitHost'), 'spectator in lobby');
  await host.click('#tTarget [data-v="5"]');
  await host.click('#startBtn');
  await waitFor(() => host.$('#bracket'), 'bracket shown');
  const T0 = await H(host, 'H.tour');
  check(T0.fixtures.filter(f => f.bye).length === 2, '6 entries: 2 byes in an 8 bracket');
  await waitFor(() => H(host, 'H.courts[1].match && H.courts[2].match && H.courts[1].match.phase !== "over" && H.courts[2].match.phase !== "over"'), 'two matches start at once', 15000);
  check(await H(host, 'H.courts[1].match.cfg.games === 3 && H.courts[1].match.cfg.target === 5'), 'tournament matches are best of 3 to 5');
  const onCourt = await H(host, '[1,2].map(n => H.courts[n].match.players.map(p => p.id))');
  check(new Set(onCourt.flat()).size === 4, 'four different players on the two courts');
  for (const pg of [host].concat(ps)) await pg.evaluate(() => { window.__bdAuto = 'hard'; });
  await sleep(4000);
  // players on a court see their own match; others see the bracket
  for (const pg of ps) {
    const me = await ev(pg, 'window.__bd.S.me'), playing = onCourt.flat().includes(me);
    const v = await ev(pg, 'window.__bd.S.st.view');
    check(playing ? v >= 1 && !!(await pg.$('#stage')) : v === 0 && !!(await pg.$('#bracket')), pg._tag + (playing ? ' is shown their court' : ' sees the bracket'));
    if (playing) check(await ev(pg, 'window.__bd.View.frames.length > 5'), pg._tag + ' gets frames from their court');
  }
  await spec.screenshot({ path: path.join(SHOTS, 't1-bracket.png'), fullPage: true });
  await spec.click('#watch2'); await waitFor(() => ev(spec, 'window.__bd.S.st.view === 2 && !!document.querySelector("#stage")'), 'spectator watches court 2');
  await sleep(1500);
  check(await ev(spec, 'window.__bd.View.frames.length > 5 && window.__bd.View.frames.every(f => f.f.c === 2)'), 'spectator only gets court 2 frames');
  await spec.screenshot({ path: path.join(SHOTS, 't2-court2.png') });
  await spec.click('#toCourt1'); await waitFor(() => ev(spec, 'window.__bd.S.st.view === 1'), 'spectator switches to court 1');
  await spec.click('#toBracket'); await waitFor(() => spec.$('#bracket'), 'spectator back to bracket');
  // live score on the bracket
  check(/Court 1/.test(await spec.textContent('#tcourt1')), 'court card shown');
  // finish matches quickly until a champion
  let guard = 0;
  while (!(await H(host, 'H.tour.done')) && guard++ < 120) {
    for (const n of [1, 2]) await finish(host, n, guard % 2);
    await sleep(1000);
  }
  await waitFor(() => H(host, 'H.tour.done'), 'tournament finishes', 120000);
  const T = await H(host, 'H.tour');
  check(T.fixtures.filter(f => !f.bye && f.status === 'done').length === 5, '6 entries play 5 matches');
  await waitFor(() => spec.$('#champion'), 'champion shown to spectator');
  check((await spec.textContent('#champion')).trim().length > 0, 'champion named');
  await host.screenshot({ path: path.join(SHOTS, 't3-champion.png'), fullPage: true });
  await host.click('#lobbyBtn'); await waitFor(() => host.$('#tKind'), 'back to tournament lobby');
  // ---- doubles league: 6 players -> 3 teams; swap two players ----
  await host.click('#tKind [data-v="doubles"]'); await host.click('#tFormat [data-v="league"]');
  await waitFor(() => host.$('#teamList'), 'teams shown');
  const before = await ev(host, 'window.__bd.S.st.teams.pairs');
  check(before.length === 3, '6 players make 3 teams');
  await host.click('[data-swap="' + before[0][0] + '"]'); await host.click('[data-swap="' + before[1][0] + '"]');
  await waitFor(() => ev(host, 'window.__bd.S.st.teams.pairs[0][0] === ' + JSON.stringify(before[1][0])), 'swap applied');
  await host.click('[data-remove="' + before[2][1] + '"]');
  await waitFor(() => ev(host, '!!window.__bd.S.st.teams.spare'), 'odd one out shown');
  check(await ev(host, 'document.querySelector("#startBtn").disabled'), 'odd doubles cannot start');
  await host.click('#addBot-easy');
  await waitFor(() => ev(host, '!window.__bd.S.st.teams.spare'), 'computer partner fills the gap');
  await host.screenshot({ path: path.join(SHOTS, 't4-teams.png'), fullPage: true });
  await host.click('#startBtn');
  await waitFor(() => host.$('#leagueTable'), 'league table');
  await waitFor(() => H(host, '!!H.courts[1].match && H.courts[1].match.players.length === 4'), 'doubles match on court 1');
  check(await H(host, '!H.courts[2].match'), 'only one match at a time with 3 teams');
  guard = 0;
  while (!(await H(host, 'H.tour.done')) && guard++ < 120) { await finish(host, 1, 0); await finish(host, 2, 0); await sleep(1000); }
  await waitFor(() => H(host, 'H.tour.done'), 'league finishes', 90000);
  check((await H(host, 'H.tour.fixtures.length')) === 3, '3 teams play 3 league matches');
  await waitFor(() => ps[0].$('#champion'), 'league champion shown');
  await host.screenshot({ path: path.join(SHOTS, 't5-league.png'), fullPage: true });
  // ---- quick match best of 3 option still there ----
  await host.click('#lobbyBtn'); await host.click('#modePick [data-v="quick"]');
  await waitFor(() => host.$('#cfgGames'), 'games option in quick match');
  await host.click('#cfgGames [data-v="3"]');
  await waitFor(() => ev(host, 'window.__bd.S.st.cfg.games === 3'), 'quick match can be best of 3', 3000);
  console.log(errors.length ? errors.join('\n') : 'no page errors'); if (errors.length) fails++;
  console.log(fails ? fails + ' FAILED' : 'tournament e2e passed');
  await browser.close(); psrv.close(); web.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
