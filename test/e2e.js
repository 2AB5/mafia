const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'dist', 'mafia.html'), 'utf8');
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + HTML + '</body></html>';

/* ---------- rules (same as published) ---------- */
const RULES = [
  { path: '', read: 'view', write: 'admin' },
  { path: 'players', read: 'view', write: 'admin' }, { path: 'players/{self}', read: 'view', write: 'interact' },
  { path: 'game', read: 'view', write: 'admin' },
  { path: 'hoststate', read: 'admin', write: 'admin' },
  { path: 'views', read: 'admin', write: 'admin' }, { path: 'views/{self}', read: 'interact', write: 'admin' },
  { path: 'actions', read: 'admin', write: 'admin' }, { path: 'actions/{self}', read: 'interact', write: 'interact' },
  { path: 'outbox', read: 'admin', write: 'admin' }, { path: 'outbox/{self}', read: 'interact', write: 'interact' },
  { path: 'chat', read: 'interact', write: 'admin' }, { path: 'chat/{self}', read: 'interact', write: 'interact' }
];
const LV = { view: 0, interact: 1, admin: 2, owner: 3 };
function allowed(level, uid, p, op) {
  const segs = p.split('/');
  let need = null, selfNeed = null;
  for (const r of RULES) {
    const rs = r.path === '' ? [] : r.path.split('/');
    if (rs.length > segs.length) continue;
    let ok = true, self = false;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] === '{self}') { if (segs[i] !== uid) ok = false; else self = true; }
      else if (rs[i] !== segs[i]) ok = false;
    }
    if (!ok) continue;
    if (self) selfNeed = r[op] || selfNeed; else if (r[op]) need = r[op];
  }
  const have = LV[level];
  const a = have >= LV[need];
  const b = selfNeed ? have >= LV[selfNeed] : false;
  return a || b;
}

/* ---------- shared store ---------- */
const store = new Map();
const subs = [];   // {page, uid, level, id, kind, path}
let opCount = 0;
function parent(p) { return p.split('/').slice(0, -1).join('/'); }
function snapDoc(sub, p) {
  const ok = allowed(sub.level, sub.uid, p, 'read');
  const has = store.has(p) && ok;
  return { id: p.split('/').pop(), exists: has, data: has ? store.get(p) : undefined };
}
function snapColl(sub) {
  const docs = [];
  for (const [k, v] of [...store.entries()].sort()) {
    if (parent(k) === sub.path && allowed(sub.level, sub.uid, k, 'read')) docs.push({ id: k.split('/').pop(), exists: true, data: v });
  }
  return docs;
}
async function push(sub) {
  const payload = sub.kind === 'doc' ? snapDoc(sub, sub.path) : snapColl(sub);
  try { await sub.page.evaluate(([id, p]) => window.__push(id, p), [sub.id, payload]); } catch (e) { /* page closed */ }
}
function notify(p) {
  for (const s of subs) {
    if ((s.kind === 'doc' && s.path === p) || (s.kind === 'coll' && parent(p) === s.path)) push(s);
  }
}
function makeHandler(page, uid, level) {
  return async function (op) {
    opCount++;
    const p = op.path;
    if (op.type === 'sub') {
      const s = { page, uid, level, id: op.id, kind: op.kind, path: p };
      subs.push(s); setTimeout(() => push(s), 5); return { ok: true };
    }
    if (op.type === 'get') {
      if (op.kind === 'coll') return { ok: true, docs: snapColl({ uid, level, path: p }) };
      return { ok: true, doc: snapDoc({ uid, level }, p) };
    }
    if (!allowed(level, uid, p, 'write')) return { ok: false, code: 'invalid_argument', message: 'denied ' + p };
    if (op.type === 'set') store.set(p, JSON.parse(JSON.stringify(op.data)));
    else if (op.type === 'update') {
      if (!store.has(p)) return { ok: false, code: 'invalid_argument', message: 'missing' };
      store.set(p, Object.assign({}, store.get(p), JSON.parse(JSON.stringify(op.data))));
    } else if (op.type === 'delete') store.delete(p);
    notify(p);
    return { ok: true };
  };
}

/* ---------- in-page mock of window.claude ---------- */
const MOCK = function (cfg) {
  const handlers = {};
  let n = 0;
  window.__push = function (id, payload) {
    const h = handlers[id]; if (!h) return;
    if (Array.isArray(payload)) {
      const docs = payload.map(d => ({ id: d.id, exists: true, data: () => d.data, metadata: { fromCache: false, hasPendingWrites: false } }));
      h({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
    } else {
      h({ id: payload.id, exists: payload.exists, data: () => payload.data, metadata: { fromCache: false, hasPendingWrites: false } });
    }
  };
  async function call(op) {
    const r = await window.__dbOp(op);
    if (!r.ok) { const e = new Error(r.message); e.code = r.code; throw e; }
    return r;
  }
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: async () => { const r = await call({ type: 'get', kind: 'doc', path: p }); return { id: r.doc.id, exists: r.doc.exists, data: () => r.doc.data }; },
      set: async (d) => { await call({ type: 'set', path: p, data: d }); },
      update: async (d) => { await call({ type: 'update', path: p, data: d }); },
      delete: async () => { await call({ type: 'delete', path: p }); },
      onSnapshot: (next) => { const id = 's' + (++n); handlers[id] = next; call({ type: 'sub', kind: 'doc', path: p, id }); return () => { delete handlers[id]; }; }
    };
  }
  function collRef(p) {
    return {
      path: p,
      doc: (id) => docRef(p + '/' + id),
      get: async () => { const r = await call({ type: 'get', kind: 'coll', path: p }); return { docs: r.docs.map(d => ({ id: d.id, exists: true, data: () => d.data })), size: r.docs.length }; },
      onSnapshot: (next) => { const id = 's' + (++n); handlers[id] = next; call({ type: 'sub', kind: 'coll', path: p, id }); return () => { delete handlers[id]; }; }
    };
  }
  const db = Object.freeze({ doc: docRef, collection: collRef });
  const user = Object.freeze({
    id: async () => cfg.uid, canEdit: async () => cfg.level === 'admin', isOwner: async () => cfg.owner,
    can: async () => cfg.level !== 'view', me: async () => ({ id: cfg.uid, name: '', isOwner: cfg.owner, canEdit: cfg.level === 'admin' })
  });
  window.claude = { use: (name) => new Promise(r => setTimeout(() => r(name === 'db' ? db : name === 'user' ? user : null), 30)) };
};

/* ---------- helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(40); }
  throw new Error('timeout: ' + label);
}
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log('  FAIL ' + msg); } }

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mkPage = async (uid, level, owner, width) => {
    const ctx = await browser.newContext({ viewport: { width: width || 1100, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(uid + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(uid + ' console: ' + m.text()); });
    await page.exposeFunction('__dbOp', makeHandler(page, uid, level));
    await page.addInitScript(MOCK, { uid, level, owner });
    await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('http://mafia.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await page.goto('http://mafia.test/');
    return page;
  };
  const NAMES = ['Ab', 'Riya', 'Karan', 'Meera', 'Dev', 'Isha', 'Arjun', 'Zoya'];

  async function playOnline(nPlayers, cfgClicks, seedTag) {
    store.clear(); subs.length = 0;
    const pages = [];
    pages.push(await mkPage('u0', 'admin', true));
    for (let i = 1; i < nPlayers; i++) pages.push(await mkPage('u' + i, 'interact', false, i === 1 ? 400 : 1100));
    const host = pages[0];
    await host.click('#openTable');
    await waitFor(() => host.$('#nameIn'), 'lobby on host');
    for (let i = 0; i < nPlayers; i++) {
      const pg = pages[i];
      await waitFor(() => pg.$('#nameIn'), 'lobby on ' + i);
      await pg.fill('#nameIn', NAMES[i]);
      await pg.click('#joinBtn');
    }
    await waitFor(async () => (await host.textContent('#seatCount')).startsWith(nPlayers + ' of'), 'all seated');
    for (const c of cfgClicks) await host.click(c);
    await sleep(150);
    // non-host sees rules summary and cannot see Deal button
    check(!(await pages[1].$('#startBtn')), 'non-host must not see start button');
    await host.click('#startBtn');

    // privacy checks via direct mock reads as a non-host
    await waitFor(() => pages[1].evaluate(() => !!(window.__mafia.S.view && window.__mafia.S.view.me)), 'view delivered');
    const leak = await pages[1].evaluate(async () => {
      const db = await window.claude.use('db');
      const out = {};
      out.host = (await db.doc('hoststate/s').get()).exists;
      out.otherView = (await db.doc('views/u0').get()).exists;
      out.ownView = (await db.doc('views/u1').get()).exists;
      out.actions = (await db.collection('actions').get()).size;
      try { await db.doc('game/public').set({ hacked: 1 }); out.wroteGame = true; } catch (e) { out.wroteGame = false; }
      try { await db.doc('views/u1').set({ hacked: 1 }); out.wroteView = true; } catch (e) { out.wroteView = false; }
      try { await db.doc('players/u2').delete(); out.deletedOther = true; } catch (e) { out.deletedOther = false; }
      return out;
    });
    check(!leak.host && !leak.otherView && leak.ownView && leak.actions === 0 && !leak.wroteGame && !leak.wroteView && !leak.deletedOther, 'privacy/rules ' + JSON.stringify(leak));
    const pubTxt = JSON.stringify(store.get('game/public'));
    check(!/"role":/.test(pubTxt) && store.get('game/public').players.every(p => p.rv === null), 'public doc must not contain roles');

    // play the game through the UI
    let guard = 0, shots = 0;
    const seenPhases = new Set();
    while (guard++ < 80) {
      const pub = store.get('game/public');
      if (pub.phase === 'over') break;
      seenPhases.add(pub.phase);
      const key = pub.key;
      // every alive player acts through the UI
      for (let i = 0; i < nPlayers; i++) {
        const pg = pages[i];
        const st = await waitFor(() => pg.evaluate((k) => { const v = window.__mafia.S.view; const p = window.__mafia.S.pub; return v && p && v.key === k && p.key === k ? { act: v.act, alive: v.me.alive, role: v.me.role } : null; }, key), 'player ' + i + ' synced to ' + key);
        if (!st.alive || !st.act) continue;
        if (!(await pg.$('#actBtn'))) { await sleep(100); }
        const act = st.act;
        if (act.kind === 'sleep' || act.kind === 'ready') { await pg.click('#actBtn'); continue; }
        const opts = act.kind === 'vote' ? act.targets.concat(['skip', 'skip']) : act.targets;
        const pick = opts[Math.floor(Math.random() * opts.length)];
        await pg.click((pick === 'skip' ? 'button.seat.skip' : 'button.seat') + '[data-id="' + pick + '"]');
        if (st.role === 'mafia' && act.kind === 'kill' && Math.random() < 0.5) {
          await pg.fill('#mchatIn', 'go for it ' + key);
          await pg.press('#mchatIn', 'Enter');
        }
        await pg.click('#actBtn');
        if (shots < 2 && i === 1) { await pg.screenshot({ path: path.join(DIR, 'shot-' + seedTag + '-phone-' + key + '.png'), fullPage: true }); shots++; }
      }
      // table talk during the day
      if (pub.phase === 'discuss') {
        const talker = pages[nPlayers - 1];
        if (!(await talker.$('#chatIn[disabled]'))) { await talker.fill('#chatIn', 'I think it is someone quiet'); await talker.press('#chatIn', 'Enter'); }
      }
      await waitFor(() => store.get('game/public').key !== key, 'host advances past ' + key);
    }
    const pub = store.get('game/public');
    check(pub.phase === 'over', 'game reached over');
    check(seenPhases.has('night') && seenPhases.has('discuss') && seenPhases.has('vote'), 'saw all phases');
    // everyone sees winner + reveal
    for (let i = 0; i < nPlayers; i++) {
      await waitFor(() => pages[i].$('#winner'), 'winner on ' + i);
      const n = await pages[i].$$eval('.seat.reveal', els => els.length);
      check(n === nPlayers, 'reveal shows all players on page ' + i);
    }
    // mafia chat never shown to town
    const st = store.get('hoststate/s');
    const townIdx = st.players.findIndex(p => p.role !== 'mafia');
    const townViewHasChat = JSON.stringify(store.get('views/' + st.players[townIdx].id)).includes('go for it');
    check(!townViewHasChat, 'mafia chat must not reach town views');
    // reset for a new game
    await host.click('#cf-end'); await host.click('#cf-end');
    await waitFor(() => host.$('#startBtn'), 'back to lobby');
    await sleep(400); console.log('    left:', [...store.keys()].filter(k=>!k.startsWith('players/')).join(' '));
    check(store.size > 0 && !store.has('hoststate/s') && ![...store.keys()].some(k => k.startsWith('views/') || k.startsWith('actions/')), 'lobby reset cleared private data');
    await waitFor(async () => (await host.textContent('#seatCount')).startsWith(nPlayers + ' of'), 'players kept for next game');
    console.log('  online ' + nPlayers + 'p: ' + (pub.winner) + ' won after round ' + pub.round + ', ' + opCount + ' db ops so far');
    for (const p of pages) await p.context().close();
  }

  async function hostReloadAndTimers() {
    store.clear(); subs.length = 0;
    const pages = [await mkPage('u0', 'admin', true)];
    for (let i = 1; i < 4; i++) pages.push(await mkPage('u' + i, 'interact', false));
    await pages[0].click('#openTable');
    for (let i = 0; i < 4; i++) { await waitFor(() => pages[i].$('#nameIn'), 'lobby'); await pages[i].fill('#nameIn', NAMES[i]); await pages[i].click('#joinBtn'); }
    await waitFor(async () => (await pages[0].textContent('#seatCount')).startsWith('4 of'), 'seated');
    await pages[0].selectOption('#cfgNight', '60');
    await sleep(150);
    await pages[0].click('#startBtn');
    await waitFor(() => pages[2].$('#timer'), 'timer shown to players');
    const t1 = await pages[2].textContent('#timer');
    check(/^[01]:\d\d$/.test(t1), 'timer text ' + t1);
    // host reloads mid-game: state must recover from hoststate
    const before = JSON.stringify(store.get('hoststate/s'));
    await pages[0].reload();
    await waitFor(() => pages[0].evaluate(() => !!window.__mafia.H.state), 'host recovered state');
    const after = await pages[0].evaluate(() => JSON.stringify(window.__mafia.H.state));
    check(before === after, 'host state identical after reload');
    // host forces the night forward (skip waiting) with two clicks
    const key = store.get('game/public').key;
    await pages[0].click('#cf-skip'); await pages[0].click('#cf-skip');
    await waitFor(() => store.get('game/public').key !== key, 'forced advance');
    // host removes a player mid game
    const victim = store.get('hoststate/s').players.find(p => p.alive && p.id !== 'u0');
    if (store.get('game/public').phase !== 'over') {
      await pages[0].selectOption('#rmSel', victim.id);
      await pages[0].click('#cf-rm'); await pages[0].click('#cf-rm');
      await waitFor(() => !store.get('hoststate/s').players.find(p => p.id === victim.id).alive, 'removed');
    }
    console.log('  host reload, timer, skip, remove: ok');
    // a player who arrives late is a spectator
    const late = await mkPage('u9', 'interact', false);
    await waitFor(() => late.$('#watching, #winner'), 'late joiner sees game');
    await late.context().close();
    for (const p of pages) await p.context().close();
  }

  async function playLocal(n) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('local pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('local console: ' + m.text()); });
    await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('http://mafia.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await page.goto('http://mafia.test/');
    await waitFor(() => page.$('#localBtn'), 'offline home', 15000);
    await page.screenshot({ path: path.join(DIR, 'shot-home-phone.png'), fullPage: true });
    await page.click('#localBtn');
    for (let i = 4; i < n; i++) await page.click('#addP');
    for (let i = 0; i < n; i++) await page.fill('#ln' + i, NAMES[i]);
    await page.click('#localStart');
    let guard = 0;
    while (guard++ < 400) {
      if (await page.$('#winner')) break;
      if (await page.$('#iAm')) { await page.click('#iAm'); continue; }
      if (await page.$('#hideNext')) { await page.click('#hideNext'); continue; }
      if (await page.$('#voteBtn')) {
        if (guard < 30 && await page.$('#peekBtn')) { await page.click('#peekBtn'); await page.click('.seats button.seat'); await page.click('#peekDone'); }
        await page.click('#voteBtn'); continue;
      }
      if (await page.$('#beginNight')) { await page.click('#beginNight'); continue; }
      if (await page.$('#actBtn')) {
        const seats = await page.$$('button.seat');
        if (seats.length) { await seats[Math.floor(Math.random() * seats.length)].click(); }
        await page.click('#actBtn'); continue;
      }
      throw new Error('local: stuck');
    }
    check(!!(await page.$('#winner')), 'local game finished');
    const revealed = await page.$$eval('.seat.reveal', els => els.length);
    check(revealed === n, 'local reveal count');
    await page.screenshot({ path: path.join(DIR, 'shot-local-over-phone.png'), fullPage: true });
    const w = await page.textContent('#winner');
    console.log('  local ' + n + 'p: ' + w);
    // horizontal overflow check at phone width
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!ov, 'no horizontal overflow on phone (local over)');
    await ctx.close();
  }

  try {
    await playOnline(6, [], 'six');
    if (process.env.QUICK) { await browser.close(); process.exit(0); }
    await playOnline(8, ['#cfgReveal [data-v="none"]', '#cfgMafia [data-v="1"]'], 'eight');
    await playOnline(4, ['#cfgPrank'], 'four');
    await playOnline(7, ['#cfgReveal [data-v="team"]'], 'seven');
    await hostReloadAndTimers();
    await playLocal(5);
    await playLocal(8);
    await playLocal(4);
  } catch (e) {
    fails++; console.log('  ERROR ' + e.stack);
  }
  const realErrors = errors.filter(e => !/fonts\.g/.test(e));
  check(realErrors.length === 0, 'no page/console errors:\n    ' + realErrors.slice(0, 10).join('\n    '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL E2E PASSED');
  process.exit(fails ? 1 : 0);
})();
