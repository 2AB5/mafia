/* ===== progress: XP, levels and unlocks, saved in this browser only (no account) ===== */
const LEVEL_XP = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000];
const DESKS = [
  { id: 'oak',    name: 'Oak',       level: 1, base: ['#a8703d', '#b98150', '#a26a37'], grain: '70,35,10',  rim: ['#6f4421', '#8a5a2e'], ink: '30,45,120' },
  { id: 'walnut', name: 'Walnut',    level: 3, base: ['#5e3a22', '#6e452a', '#563420'], grain: '25,12,4',   rim: ['#3b2414', '#4c2f1b'], ink: '235,205,150' },
  { id: 'exam',   name: 'Exam hall', level: 5, base: ['#3f6b4f', '#4a7a5c', '#3a6349'], grain: '12,32,18',  rim: ['#27412f', '#335640'], ink: '240,240,220' },
  { id: 'birch',  name: 'Birch',     level: 7, base: ['#d9b98a', '#e3c79c', '#d2b07f'], grain: '120,80,40', rim: ['#9c7a4c', '#b48e5d'], ink: '40,60,160' }
];
function defaultProfile() { return { v: 1, xp: 0, matches: 0, wins: 0, roundsWon: 0, kos: 0, selfOuts: 0, streak: 0, bestStreak: 0, desk: 'oak', flick: 'pull', seen: [] }; }
function loadProfile() { const p = storeJSON('profile'); return p && p.v === 1 ? Object.assign(defaultProfile(), p) : defaultProfile(); }
const PROF = { p: loadProfile(), last: null };
function saveProfile() { storeJSON('profile', PROF.p); }
function levelOf(xp) { let l = 1; for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1; return l; }
function levelProgress(xp) {
  const l = levelOf(xp), lo = LEVEL_XP[l - 1], hi = LEVEL_XP[l];
  return { level: l, into: xp - lo, need: hi === undefined ? null : hi - lo, toNext: hi === undefined ? null : hi - xp };
}
function myLevel() { return levelOf(PROF.p.xp); }
function isUnlocked(skinId) { return myLevel() >= PF.skinById(skinId).level; }
function deskUnlocked(id) { const d = DESKS.find(function (x) { return x.id === id; }); return !!d && myLevel() >= d.level; }
function currentDesk() { const d = DESKS.find(function (x) { return x.id === PROF.p.desk; }); return d && deskUnlocked(d.id) ? d : DESKS[0]; }
function usableSkin(id) { return validSkin(id) && isUnlocked(id) ? id : 'blue'; }
function nextUnlock() {
  const l = myLevel();
  const items = PF.SKINS.map(function (s) { return { level: s.level, name: s.name }; })
    .concat(DESKS.map(function (d) { return { level: d.level, name: d.name + ' desk' }; }))
    .filter(function (x) { return x.level > l; }).sort(function (a, b) { return a.level - b.level; });
  return items[0] || null;
}
/* award XP once per finished online match; returns the breakdown (also kept in PROF.last) */
function awardMatch(m, me) {
  if (!m || m.phase !== 'over' || !me) return null;
  if (PROF.p.seen.indexOf(m.id) !== -1) return PROF.last && PROF.last.id === m.id ? PROF.last : null;
  const pl = m.players.find(function (p) { return p.id === me; });
  if (!pl) return null;
  const teams = !!m.teamScore;
  const roundsWon = teams ? m.teamScore[pl.team] : pl.score;
  const won = teams ? m.winnerTeam === pl.team : m.winner === me;
  const st = (m.stats && m.stats[me]) || { ko: 0, self: 0, mate: 0 };
  const lines = [['Played a match', 20]];
  if (roundsWon) lines.push(['Rounds won × ' + roundsWon, 30 * roundsWon]);
  if (st.ko) lines.push(['Knock-offs × ' + st.ko, 15 * st.ko]);
  if (won) lines.push([teams ? 'Team win' : 'Match win', 60]);
  const streak = won ? PROF.p.streak + 1 : 0;
  if (won && streak > 1) lines.push(['Win streak × ' + streak, 10 * Math.min(streak, 5)]);
  const total = lines.reduce(function (a, l) { return a + l[1]; }, 0);
  const before = levelOf(PROF.p.xp);
  const p = PROF.p;
  p.xp += total; p.matches++; if (won) p.wins++; p.roundsWon += roundsWon; p.kos += st.ko; p.selfOuts += st.self;
  p.streak = streak; p.bestStreak = Math.max(p.bestStreak, streak);
  p.seen.push(m.id); if (p.seen.length > 40) p.seen.splice(0, p.seen.length - 40);
  saveProfile();
  const after = levelOf(p.xp);
  const unlocked = PF.SKINS.filter(function (s) { return s.level > before && s.level <= after; }).map(function (s) { return s.name; })
    .concat(DESKS.filter(function (d) { return d.level > before && d.level <= after; }).map(function (d) { return d.name + ' desk'; }));
  PROF.last = { id: m.id, lines: lines, total: total, before: before, after: after, unlocked: unlocked, won: won };
  return PROF.last;
}
function resetProfile() { PROF.p = defaultProfile(); PROF.last = null; saveProfile(); }
