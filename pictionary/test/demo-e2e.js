// Plays the Pictionary demo (you + 1 robot vs 2 robots) on one page, like a person would.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } }
async function waitFor(fn, label, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { let v; try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(80); } throw new Error('timeout: ' + label); }
(async () => {
  const web = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(path.join(DIR, 'index.html'))); }).listen(8799, '127.0.0.1');
  const browser = await chromium.launch(); const errors = [];
  const pg = await (await browser.newContext({ viewport: { width: 390, height: 860 } })).newPage();
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts|net::|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/fonts.g*/**', r => r.abort());
  const G = () => pg.evaluate(() => window.__pc.H.game);
  const chat = () => pg.$eval('#chatLog', el => el.innerText).catch(() => '');
  const say = async (x) => { await pg.fill('#chatIn', x); await pg.press('#chatIn', 'Enter'); await sleep(150); };
  const fast = (what) => pg.evaluate((w) => { const t = window.__pc.H.game.turn; if (w === 'draw') t.drawUntil = Math.min(t.drawUntil, Date.now() + 500); if (w === 'reveal') t.revealUntil = Date.now(); if (w === 'choose') t.chooseUntil = Date.now() + 3200; }, what);
  try {
    await pg.goto('http://127.0.0.1:8799/');
    await pg.fill('#nameIn', 'Ab');
    check(/Who wins/.test(await pg.textContent('#howWin')), 'how-to explains who wins');
    check(await pg.evaluate(() => { const d = document.getElementById('demoCard'), p = document.getElementById('createBtn'); return !!d && !!p && (d.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; }), 'demo card sits above Play online');
    await pg.screenshot({ path: path.join(SHOTS, 'd1-home.png'), fullPage: true });
    await pg.click('#demoBtn');
    await waitFor(() => pg.$('#scorebar'), 'demo starts');
    const roster = await pg.evaluate(() => window.__pc.S.st.roster);
    check(roster.length === 4 && roster.filter(r => r.bot).length === 3, 'demo has you and 3 robots');
    const me = roster.find(r => !r.bot);
    check(roster.filter(r => r.team === me.team).length === 2, 'one robot is on your team');
    check((await pg.textContent('#chip')).trim() === 'Demo', 'header says Demo');
    let g = await G();
    check(g.totalTurns === 4, 'demo is 4 turns');
    const results = [];
    for (let turn = 1; turn <= 4; turn++) {
      await waitFor(async () => { const x = await G(); return x.turnNo === turn && (x.phase === 'choose' || x.phase === 'draw'); }, 'turn ' + turn + ' begins', 15000);
      g = await G();
      const t = g.turn;
      const drawerIsMe = t.drawer === me.id, iSet = t.setTeam === me.team, iGuess = t.team === me.team && !drawerIsMe;
      console.log('  turn ' + turn + ': ' + (drawerIsMe ? 'you draw' : iSet ? 'you set the word for a robot' : 'you guess your robot teammate'));
      if (iSet) {
        await waitFor(() => pg.$('#chooseForm'), 'word form');
        await waitFor(async () => /Pick something tricky|hard one|can’t wait/.test(await chat()), 'robot teammate chimes in on team chat', 8000).catch(() => check(false, 'robot teammate tip'));
        if (turn === 2) {
          // a word the robot can't draw is refused; a suggested one works
          await pg.fill('#wordIn', 'xylophone'); await pg.click('[data-cat="Object"]'); await pg.click('#sendWord'); await sleep(300);
          check((await G()).phase === 'choose', 'a word the robot can’t draw is refused');
          await pg.click('[data-sugg="0"]');
          check((await pg.inputValue('#hintIn')).length > 0, 'suggestion fills in a hint');
          await pg.screenshot({ path: path.join(SHOTS, 'd3-set-for-robot.png') });
          await pg.click('#sendWord');
        } else {
          // do nothing: the robot teammate picks before time runs out
          await fast('choose');
          await waitFor(async () => /I’ll pick one/.test(await chat()), 'robot teammate steps in', 8000);
        }
        await waitFor(async () => (await G()).phase === 'draw', 'robot starts drawing');
        g = await G();
        check(!!(await pg.evaluate(() => window.__pc.Sketch.find(window.__pc.H.game.turn.word))), 'the robot draws a word it knows');
        // the robot draws, its teammate guesses; give it up to 40 s then fast-forward
        await waitFor(async () => (await pg.evaluate(() => window.__pc.Board.units.length)) >= 3, 'robot ink appears', 15000);
        const got = await waitFor(async () => (await G()).phase === 'reveal', 'robots finish', 40000).catch(() => false);
        if (!got) { await fast('draw'); await waitFor(async () => (await G()).phase === 'reveal', 'reveal'); }
      } else if (iGuess) {
        // a robot sets the word, my robot teammate draws it, I guess
        await waitFor(async () => (await G()).phase === 'draw', 'robots set a word', 9000);
        await waitFor(async () => (await pg.evaluate(() => window.__pc.Board.units.length)) >= 4, 'robot teammate is drawing', 15000);
        await sleep(2500);
        await pg.screenshot({ path: path.join(SHOTS, 'd2-guess-robot.png') });
        const word = (await G()).turn.word;
        check(!(await pg.$('#theWord')) && !!(await pg.$('#mask')), 'you see blanks, not the word');
        await say('definitely a dinosaur');
        await say(word);
        await waitFor(async () => (await G()).phase === 'reveal', 'your guess ends the turn', 5000);
      } else {
        // I draw; robots set my word; my robot teammate guesses with wrong tries first
        await waitFor(async () => (await G()).phase === 'draw', 'robots set your word', 9000);
        const w = (await G()).turn.word;
        check((await pg.textContent('#theWord')).trim() === w, 'you see your word: ' + w);
        const b = await pg.$eval('#board', el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        for (const s of [[[0.2, 0.3], [0.8, 0.3], [0.8, 0.7], [0.2, 0.7], [0.2, 0.3]], [[0.3, 0.5], [0.7, 0.5]], [[0.5, 0.2], [0.5, 0.8]]]) {
          await pg.mouse.move(b.x + b.w * s[0][0], b.y + b.h * s[0][1]); await pg.mouse.down();
          for (let i = 1; i < s.length; i++) await pg.mouse.move(b.x + b.w * s[i][0], b.y + b.h * s[i][1], { steps: 8 });
          await pg.mouse.up(); await sleep(300);
        }
        await waitFor(async () => { const c = await chat(); const mate = roster.find(r => r.bot && r.team === me.team).name; return c.split('\n').filter(l => l.startsWith(mate)).length >= 1; }, 'robot teammate tries some guesses', 20000);
        await pg.screenshot({ path: path.join(SHOTS, 'd4-robot-guessing.png') });
        const got = await waitFor(async () => (await G()).phase === 'reveal', 'robot guesses or time runs out', 75000).catch(() => false);
        if (!got) { await fast('draw'); await waitFor(async () => (await G()).phase === 'reveal', 'reveal'); }
      }
      g = await G();
      results.push(g.turn.result.kind + (g.turn.result.by ? ' by ' + roster.find(r => r.id === g.turn.result.by).name : ''));
      await waitFor(() => pg.$('#revealWord'), 'reveal card');
      await fast('reveal');
    }
    await waitFor(async () => (await G()).phase === 'over', 'demo over', 10000);
    await waitFor(() => pg.$('#summaryTable'), 'summary');
    check(/Most points wins/.test(await pg.textContent('#winRule')), 'end screen explains how the winner is decided');
    const gal = await pg.$$eval('#gallery .gi', els => els.length).catch(() => 0);
    check(gal === 4, 'gallery has all 4 drawings (' + gal + ')');
    await pg.screenshot({ path: path.join(SHOTS, 'd5-over.png'), fullPage: true });
    check(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no horizontal scroll');
    console.log('  results: ' + results.join(' | ') + ' · score ' + JSON.stringify((await G()).teamScore));
    await pg.click('#rematchBtn');
    await waitFor(async () => { const x = await G(); return x && x.turnNo === 1 && x.phase !== 'over'; }, 'demo restarts');
    await pg.click('#c-exitdemo'); await pg.click('#c-exitdemo');
    await waitFor(() => pg.$('#demoBtn'), 'back home after exit');
    check(!(await pg.evaluate(() => localStorage.getItem('pictionary.host'))), 'the demo never saves a hosting session');
  } catch (e) { fails++; console.log('  ERROR ' + e.stack); }
  check(errors.length === 0, 'page errors:\n    ' + errors.slice(0, 10).join('\n    '));
  await browser.close(); web.close();
  console.log(fails ? fails + ' FAILED' : 'DEMO E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
