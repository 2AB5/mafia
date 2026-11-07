// Real online Pictionary test: local PeerJS server + Chromium tabs drawing with the mouse and guessing in chat.
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PEER_PORT = 9143, WEB_PORT = 8785;
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
  async function newPage(tag, w, hgt, theme) {
    const ctx = await browser.newContext({ viewport: { width: w || 400, height: hgt || 860 }, hasTouch: false });
    const pg = await ctx.newPage();
    if (theme) await pg.addInitScript((t) => { try { localStorage.setItem('pictionary.theme', t); } catch (e) {} }, theme);
    pg.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await pg.route('**/fonts.gstatic.com/**', r => r.abort());
    pg._tag = tag;
    return pg;
  }
  const G = (pg) => ev(pg, 'window.__pc.H.game');
  const chatText = (pg) => pg.$eval('#chatLog', el => el.innerText).catch(() => '');
  async function say(pg, text, team) {
    await waitFor(() => ev(pg, "!document.getElementById('chatIn').disabled"), pg._tag + ' chat enabled', 5000);
    if (team !== undefined) {
      const on = await ev(pg, '!!window.__pc.S.chatTeam');
      if (on !== team) await pg.click('#teamToggle');
    }
    await pg.fill('#chatIn', text); await pg.press('#chatIn', 'Enter'); await sleep(420);
  }
  // draw a little picture with the real mouse: a few strokes, a fill and an undo
  async function doodle(pg, k) {
    const rect = async () => { await pg.$eval('#board', el => el.scrollIntoView({ block: 'center' })); return pg.$eval('#board', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); };
    const P = (b, fx, fy) => [b.x + b.w * fx, b.y + b.h * fy];
    const stroke = async (pts) => { const b = await rect(); const a = P(b, pts[0][0], pts[0][1]); await pg.mouse.move(a[0], a[1]); await pg.mouse.down(); for (let i = 1; i < pts.length; i++) { const q = P(b, pts[i][0], pts[i][1]); await pg.mouse.move(q[0], q[1], { steps: 6 }); } await pg.mouse.up(); };
    await pg.click('.palette .sw >> nth=' + (k % 12));
    // a closed box, then fill it
    await stroke([[0.25, 0.3], [0.6, 0.3], [0.6, 0.7], [0.25, 0.7], [0.25, 0.3]]);
    await pg.click('#tool-fill'); await pg.click('.palette .sw >> nth=' + ((k + 4) % 12));
    { const b = await rect(); const c = P(b, 0.42, 0.5); await pg.mouse.click(c[0], c[1]); }
    await pg.click('#tool-pen'); await pg.click('.sizes .sz >> nth=3');
    await stroke([[0.7, 0.2], [0.85, 0.45], [0.7, 0.8]]);
    await stroke([[0.1, 0.9], [0.9, 0.92]]);
    await pg.click('#undoBtn');
    await pg.click('.sizes .sz >> nth=1');
    await stroke([[0.15, 0.15], [0.2, 0.2], [0.15, 0.25]]);
    const units = await ev(pg, 'window.__pc.Board.units.length');
    check(units === 4, pg._tag + ' drew 4 things (box, fill, line, squiggle) after one undo: ' + units);
  }
  async function opsEqual(pages) {
    const host = pages[0];
    await sleep(400);
    const hn = await ev(host, 'window.__pc.H.ops.length');
    let ref = null;
    for (const pg of pages) {
      const dr = await ev(pg, "window.__pc.S.st.game && window.__pc.S.st.game.turn && window.__pc.S.st.game.turn.drawer === window.__pc.S.me");
      if (dr) { ref = { units: await ev(pg, 'window.__pc.Board.units.length'), grid: await ev(pg, 'window.__pc.Board.grid()') }; break; }
    }
    const inked = ref.grid.filter(v => v !== 511).length;
    for (const pg of pages) {
      await waitFor(async () => {
        if ((await ev(pg, 'window.__pc.Board.units.length')) !== ref.units) return false;
        const gr = await ev(pg, 'window.__pc.Board.grid()');
        return gr.filter((v, i) => v !== ref.grid[i]).length <= 12;
      }, pg._tag + ' board looks like the drawer’s', 8000);
    }
    return { ops: hn, inked: inked };
  }
  async function fullGame() {
    const names = ['Ab', 'Riya', 'Karan', 'Meera'];
    const host = await newPage('Ab', 400, 900);
    await host.goto(URL); await host.fill('#nameIn', 'Ab');
    await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pc.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pc.S.room');
    const pages = [host];
    for (let i = 1; i < 4; i++) {
      const pg = await newPage(names[i], i === 1 ? 390 : 430, 900, i === 2 ? 'light' : undefined);
      await pg.goto(URL + '#' + code); await waitFor(() => pg.$('#codeIn'), 'home for ' + names[i]);
      await pg.fill('#nameIn', names[i]); await pg.click('#joinBtn');
      await waitFor(async () => (await host.textContent('#seatCount')).trim() === (i + 1) + ' / 12', names[i] + ' joined');
      pages.push(pg);
    }
    const spec = await newPage('Dev', 400, 900);
    await spec.goto(URL); await spec.fill('#nameIn', 'Dev'); await spec.fill('#codeIn', code); await spec.click('#watchBtn');
    await waitFor(async () => (await host.$('#viewCount')) && (await host.textContent('#viewCount')).trim() === '1', 'host sees the viewer');
    // teams balance automatically, players can switch, the host can move people
    let roster = await ev(host, 'window.__pc.S.st.roster');
    const cnt = t => roster.filter(r => r.team === t).length;
    check(cnt(0) === 2 && cnt(1) === 2, 'teams auto-balanced 2 v 2');
    const riyaTeam = roster.find(r => r.name === 'Riya').team;
    await pages[1].click('#joinTeam' + (1 - riyaTeam));
    await waitFor(async () => (await ev(host, 'window.__pc.S.st.roster')).find(r => r.name === 'Riya').team === 1 - riyaTeam, 'Riya switched team');
    check(await host.$eval('#startBtn', b => b.disabled), 'start blocked with a 3 v 1 split');
    const riyaId = (await ev(host, 'window.__pc.S.st.roster')).find(r => r.name === 'Riya').id;
    await host.click('[data-move="' + riyaId + '"]');
    await waitFor(async () => (await ev(host, 'window.__pc.S.st.roster')).find(r => r.name === 'Riya').team === riyaTeam, 'host moved Riya back');
    await say(pages[1], 'hi everyone');
    await waitFor(async () => /hi everyone/.test(await chatText(host)), 'lobby chat reaches host');
    await host.click('#cfgRounds [data-v="1"]'); await host.click('#cfgDraw [data-v="60"]'); await host.click('#cfgChoose [data-v="30"]');
    await sleep(200);
    await host.screenshot({ path: path.join(SHOTS, '02-lobby.png'), fullPage: true });
    await host.click('#startBtn');
    for (const pg of pages.concat([spec])) await waitFor(() => ev(pg, '!!window.__pc.S.st.game'), pg._tag + ' sees the game');
    const byId = {}; roster = await ev(host, 'window.__pc.S.st.roster'); roster.forEach(r => { byId[r.id] = pages[names.indexOf(r.name)]; });

    let g = await G(host);
    check(g.totalTurns === 4, 'one round of 2 v 2 is 4 turns (' + g.totalTurns + ')');
    const words = ['pani puri', 'solar eclipse', 'giraffe', 'birthday party'];
    for (let turn = 0; turn < g.totalTurns; turn++) {
      g = await G(host);
      await waitFor(async () => (await G(host)).phase === 'choose', 'choose phase ' + (turn + 1), 15000);
      g = await G(host);
      const t = g.turn;
      const drawerPg = byId[t.drawer];
      const setters = g.players.filter(p => p.team === t.setTeam).map(p => byId[p.id]);
      const guessers = g.players.filter(p => p.team === t.team && p.id !== t.drawer).map(p => byId[p.id]);
      const setter = setters[0], guesser = guessers[0];
      await waitFor(() => setter.$('#chooseForm'), 'setter sees the word form');
      check(!(await guesser.$('#chooseForm')) && !(await drawerPg.$('#chooseForm')), 'only the setting team gets the form');
      check(await ev(setter, '!!window.__pc.S.chatTeam'), 'setter chat starts on team-only');
      // setters whisper: their teammate sees it, the other team does not
      const secret = 'secret plan number ' + (turn + 1);
      await say(setter, secret, true);
      await waitFor(async () => (await chatText(setters[1])).includes(secret), 'team whisper reaches teammate');
      await sleep(300);
      check(!(await chatText(guesser)).includes(secret) && !(await chatText(drawerPg)).includes(secret) && !(await chatText(spec)).includes(secret), 'team whisper hidden from the other team and viewers');
      const word = words[turn];
      if (turn === 0) {
        await setter.screenshot({ path: path.join(SHOTS, '03-setter-form.png') });
        // a hint that gives the word away is refused
        await setter.fill('#wordIn', word); await setter.click('[data-cat="Food"]'); await setter.fill('#hintIn', 'its pani puri lol');
        await setter.click('#sendWord'); await sleep(400);
        check((await G(host)).phase === 'choose', 'leaky hint is refused');
        await setter.fill('#hintIn', 'street food, very tangy');
        await drawerPg.screenshot({ path: path.join(SHOTS, '04-drawer-waiting.png') });
      } else if (turn === 1) {
        await setter.click('[data-sugg="0"]');
        await setter.fill('#wordIn', word); await setter.click('[data-cat="Other"]'); await setter.fill('#catIn', 'Space'); await setter.fill('#hintIn', 'day turns dark');
      } else {
        await setter.fill('#wordIn', word); await setter.click('[data-cat="' + (turn === 2 ? 'Animal' : 'Thing') + '"]');
      }
      await setter.click('#sendWord');
      await waitFor(async () => (await G(host)).phase === 'draw', 'drawing starts ' + (turn + 1));
      // nobody guessing ever receives the word
      for (const gp of guessers) {
        const v = await ev(gp, 'window.__pc.S.st.game.turn');
        check(v.word === null && !JSON.stringify(await ev(gp, 'window.__pc.S.st')).toLowerCase().includes(word.split(' ')[0]), 'guesser state has no trace of the word');
        check(await waitFor(async () => !(await gp.$('#theWord')) && !!(await gp.$('#mask')), 'blanks', 5000).catch(() => false), 'guesser sees blanks');
      }
      await waitFor(async () => (await drawerPg.textContent('#theWord')).trim() === word, 'drawer sees the word');
      check((await setter.textContent('#theWord')).trim() === word, 'setters see the word');
      check((await spec.textContent('#theWord')).trim() === word, 'viewers see the word');
      if (turn === 1) {
        // the drawer passes on this word once; the setting team picks another
        await drawerPg.click('#vetoBtn');
        await waitFor(async () => (await G(host)).phase === 'choose', 'veto goes back to choosing');
        await waitFor(() => setter.$('#chooseForm'), 'setter form again');
        await setter.fill('#wordIn', word); await setter.click('[data-cat="Other"]'); await setter.fill('#catIn', 'Space'); await setter.click('#sendWord');
        await sleep(400);
        check((await G(host)).phase === 'choose', 'the passed word cannot be set again');
        await setter.fill('#wordIn', 'rainbow'); await setter.click('[data-cat="Thing"]'); await setter.click('#sendWord');
        await waitFor(async () => (await G(host)).phase === 'draw', 'new word after the pass');
        words[1] = 'rainbow';
      }
      const theWord = words[turn];
      await waitFor(() => drawerPg.$('#tools'), 'drawer gets tools');
      await doodle(drawerPg, turn);
      const n = await opsEqual(pages.concat([spec]));
      check(n.ops >= 6 && n.inked > 40, 'drawing synced to every screen (' + n.ops + ' ops, ' + n.inked + ' inked cells)');
      if (turn === 0) {
        await drawerPg.screenshot({ path: path.join(SHOTS, '05-drawer.png') });
        // setters can tease but not leak
        await say(setter, 'P A N I puri hehe', false);
        await waitFor(async () => /Only you can see this/.test(await chatText(setter)), 'setter told the leak was blocked');
        await sleep(300);
        check(!/hehe/.test(await chatText(guesser)), 'leak never reaches the guessers');
        await say(setter, 'you will never get this', false);
        await waitFor(async () => /never get this/.test(await chatText(guesser)), 'tease reaches guessers');
        // wrong, close, then the drawer cannot chat
        await say(guesser, 'golgappa');
        await say(guesser, 'pani puro');
        await waitFor(async () => /really close/.test(await chatText(guesser)), 'close guess noticed privately');
        await sleep(300);
        check(!/really close/.test(await chatText(drawerPg)), 'close note is private');
        check(await ev(drawerPg, "document.getElementById('chatIn').disabled"), 'drawer cannot type in chat');
        check(await ev(spec, "document.getElementById('chatIn').disabled"), 'viewer cannot chat during the game');
        await spec.click('.reacts .react >> nth=2');
        await waitFor(() => host.$('.float'), 'viewer reaction floats on the board');
        // the hint unlocks a third of the way in (fast-forward the host clock)
        await host.evaluate(() => { const t = window.__pc.H.game.turn, now = Date.now(); const total = t.drawUntil - t.drawStart; t.drawStart = now - total * 0.4; t.drawUntil = t.drawStart + total; });
        await waitFor(async () => !!(await guesser.$('#hintChip')), 'hint shows for guessers', 5000);
        check(/tangy/.test(await guesser.textContent('#hintChip')), 'guessers see the setter’s hint');
        await guesser.screenshot({ path: path.join(SHOTS, '06-guesser.png') });
        await setter.screenshot({ path: path.join(SHOTS, '07-setter-watching.png') });
        await say(guesser, 'Pani-Puri!');
      } else if (turn === 1) {
        // nobody gets it: fast-forward the clock to the end
        await host.evaluate(() => { const t = window.__pc.H.game.turn; t.drawUntil = Date.now() + 300; });
      } else if (turn === 2) {
        // a guesser reloads mid-drawing and gets the whole picture back
        await guesser.reload();
        await waitFor(() => ev(guesser, "window.__pc.S.conn === 'open' && !!window.__pc.S.st && !!window.__pc.S.st.game"), 'guesser back after reload', 30000);
        await waitFor(async () => (await ev(guesser, 'window.__pc.Board.ops.length')) === (await ev(host, 'window.__pc.H.ops.length')), 'drawing restored after reload', 10000);
        await say(guesser, 'giraffes');
      } else {
        await say(guesser, 'birthday-party');
      }
      await waitFor(async () => (await G(host)).phase === 'reveal', 'reveal ' + (turn + 1), 10000);
      for (const pg of pages) await waitFor(async () => (await pg.$('#revealWord')) && (await pg.textContent('#revealWord')).trim() === theWord, pg._tag + ' sees the reveal');
      if (turn === 0) { await guesser.screenshot({ path: path.join(SHOTS, '08-reveal.png') }); }
      g = await G(host);
      const res = g.turn.result;
      check(turn === 1 ? res.kind === 'stumped' : res.kind === 'guessed', 'turn ' + (turn + 1) + ' result ' + res.kind);
      // move on without waiting the full 5 seconds
      await host.evaluate(() => { const t = window.__pc.H.game.turn; t.revealUntil = Date.now(); });
    }
    await waitFor(async () => (await G(host)).phase === 'over', 'game over', 15000);
    g = await G(host);
    const expected = [0, 0];
    g.history.forEach(hh => { if (hh.result.kind === 'guessed') expected[hh.team] += hh.result.points; if (hh.result.kind === 'stumped') expected[1 - hh.team] += hh.result.points; });
    check(JSON.stringify(expected) === JSON.stringify(g.teamScore), 'team scores add up ' + JSON.stringify(g.teamScore));
    for (const pg of pages.concat([spec])) {
      await waitFor(() => pg.$('#summaryTable'), pg._tag + ' sees the summary');
      const nGal = await pg.$$eval('#gallery .gi', els => els.length).catch(() => 0);
      check(nGal === 4, pg._tag + ' gallery has all 4 drawings (' + nGal + ')');
    }
    const winTxt = await host.textContent('#winner');
    check(g.winner === 'tie' ? /tie/i.test(winTxt) : winTxt.indexOf(['Blue', 'Red'][g.winner]) !== -1, 'winner shown: ' + winTxt);
    await host.screenshot({ path: path.join(SHOTS, '09-over.png'), fullPage: true });
    await pages[2].screenshot({ path: path.join(SHOTS, '10-over-light.png'), fullPage: true });
    // the viewer joins for the next game, then the host starts it
    await spec.click('#sitNext');
    await waitFor(async () => (await ev(host, 'window.__pc.S.st.roster')).some(r => r.name === 'Dev'), 'viewer joined the next game');
    await host.click('#rematchBtn');
    await waitFor(() => ev(spec, "!!window.__pc.S.me && window.__pc.S.st.game && window.__pc.S.st.game.phase === 'choose' && window.__pc.S.st.game.players.length === 5"), 'rematch with 5 players');
    console.log('  full game: ' + winTxt.trim() + ' ' + JSON.stringify(g.teamScore) + ', 4 turns (guessed, passed + stumped, reload mid-draw, guessed), viewer joined the rematch');
    for (const pg of pages.concat([spec])) await pg.context().close();
  }

  // wide screen: board and chat side by side; offline drawer gets skipped; setters run out of time
  async function desktopAndTimeouts() {
    const host = await newPage('W-host', 1280, 860);
    await host.goto(URL); await host.fill('#nameIn', 'Host'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pc.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pc.S.room');
    const pages = [host];
    for (const nm of ['Asha', 'Bilal', 'Chen', 'Diya']) {
      const pg = await newPage('W-' + nm, 420, 860); await pg.goto(URL + '#' + code); await waitFor(() => pg.$('#codeIn'), 'home');
      await pg.fill('#nameIn', nm); await pg.click('#joinBtn'); pages.push(pg);
    }
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '5 / 12', 'five joined');
    await host.click('#startBtn');
    await waitFor(async () => (await G(host)).phase === 'choose', 'choose');
    // nobody sets a word: the game picks one when time runs out
    await host.evaluate(() => { window.__pc.H.game.turn.chooseUntil = Date.now(); });
    await waitFor(async () => (await G(host)).phase === 'draw', 'auto word', 5000);
    let g = await G(host);
    check(g.turn.auto && !!g.turn.word, 'game picked a word: ' + g.turn.word);
    const rosterW = await ev(host, 'window.__pc.S.st.roster');
    const pgOf = id => pages[['Host', 'Asha', 'Bilal', 'Chen', 'Diya'].indexOf(rosterW.find(r => r.id === id).name)];
    const dpg = pgOf(g.turn.drawer);
    await waitFor(() => dpg.$('#tools'), 'drawer tools');
    await doodle(dpg, 3);
    await opsEqual(pages);
    await sleep(300);
    await host.screenshot({ path: path.join(SHOTS, '11-desktop.png') });
    const lay = await host.$eval('.gamegrid', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    check(lay === 2, 'wide screens put chat beside the board');
    // the drawer drops off: after 15 s offline the turn is skipped
    if (dpg !== host) {
      await dpg.context().close();
      const did = g.turn.drawer;
      await waitFor(() => ev(host, "!window.__pc.S.st.roster.find(r => r.id === " + JSON.stringify(did) + ").on"), 'host notices the drawer went offline', 40000);
      await host.evaluate(() => { const d = window.__pc.H.game.turn.drawer; window.__pc.H.offlineSince[d] = Date.now() - 16000; });
      await waitFor(async () => { const gg = await G(host); return gg.phase === 'reveal' && gg.turn.result.kind === 'skipped'; }, 'offline drawer skipped', 5000);
      check(true, 'offline drawer skipped');
    }
    for (const pg of pages) { try { await pg.context().close(); } catch (e) { /* closed */ } }
    console.log('  wide screen + auto word + offline drawer skipped: ok');
  }

  // no horizontal scroll on a small phone during drawing
  async function smallPhone() {
    const host = await newPage('S-host', 360, 740);
    await host.goto(URL); await host.fill('#nameIn', 'Host'); await host.click('#createBtn');
    await waitFor(() => ev(host, "window.__pc.S.conn === 'open'"), 'room open');
    const code = await ev(host, 'window.__pc.S.room');
    const pages = [host];
    for (const nm of ['A', 'B', 'C']) { const pg = await newPage('S-' + nm, 360, 740); await pg.goto(URL + '#' + code); await waitFor(() => pg.$('#codeIn'), 'home'); await pg.fill('#nameIn', nm); await pg.click('#joinBtn'); pages.push(pg); }
    await waitFor(async () => (await host.textContent('#seatCount')).trim() === '4 / 12', 'four joined');
    await host.click('#startBtn');
    await waitFor(async () => (await G(host)).phase === 'choose', 'choose');
    await host.evaluate(() => { window.__pc.H.game.turn.chooseUntil = Date.now(); });
    await waitFor(async () => (await G(host)).phase === 'draw', 'draw', 5000);
    const g = await G(host);
    const roster = await ev(host, 'window.__pc.S.st.roster');
    const dpg = pages[['Host', 'A', 'B', 'C'].indexOf(roster.find(r => r.id === g.turn.drawer).name)];
    await waitFor(() => dpg.$('#tools'), 'tools');
    for (const pg of pages) check(!(await ev(pg, 'document.documentElement.scrollWidth > innerWidth + 1')), pg._tag + ' no horizontal scroll at 360px');
    await dpg.screenshot({ path: path.join(SHOTS, '12-small-drawer.png'), fullPage: true });
    for (const pg of pages) await pg.context().close();
    console.log('  small phone layout: ok');
  }

  try {
    await fullGame();
    await desktopAndTimeouts();
    await smallPhone();
  } catch (e) { fails++; console.log('  ERROR ' + e.stack); }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 10).join('\n    '));
  await browser.close(); web.close(); psrv.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PICTIONARY E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
