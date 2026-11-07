// Pen-vs-pen duels with a human-like bot that reads the landing ghost.
const PF = require('../src/game.js');
function seeded(seed){let s=seed>>>0;return function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function botShot(m, rng) {
  const me = PF.penOf(m, m.turn), skin = m.players.find(p => p.id === m.turn).skin, T = m.table;
  const myTeam = PF.teamOf(m, m.turn);
  const foes = PF.alivePens(m).filter(p => p.id !== m.turn && (myTeam === null || PF.teamOf(m, p.id) !== myTeam));
  let best = null;
  for (const t of foes) {
    const dx = t.x - me.x, dy = t.y - me.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
    const ex = ux > 0 ? (T.w / 2 - t.x) / ux : ux < 0 ? (-T.w / 2 - t.x) / ux : 1e9;
    const ey = uy > 0 ? (T.h / 2 - t.y) / uy : uy < 0 ? (-T.h / 2 - t.y) / uy : 1e9;
    const score = Math.min(ex, ey) + d * 0.35;
    if (!best || score < best.score) best = { t, d, ux, uy, score };
  }
  const wob = (rng() - 0.5) * 0.16, c = Math.cos(wob), s = Math.sin(wob);
  const ux = best.ux * c - best.uy * s, uy = best.ux * s + best.uy * c;
  const lx = (rng() - 0.5) * 0.5;
  const full = PF.predict(me, { lx, ix: ux * PF.impulseForPull(1, skin), iy: uy * PF.impulseForPull(1, skin) }, skin).dist;
  let pull = Math.min(1, (best.d + 2.5 + rng()) / full);
  // read the ghost: don't fly off unless the target is close enough to stop you
  for (let k = 0; k < 20 && best.d > 1.8; k++) {
    const g = PF.predict(me, { lx, ix: ux * PF.impulseForPull(pull, skin), iy: uy * PF.impulseForPull(pull, skin) }, skin);
    if (PF.onTable(g.x * 1.05, g.y * 1.05, T)) break;
    pull -= 0.05;
  }
  const J = PF.impulseForPull(Math.max(0.1, pull), skin);
  return { lx, ix: ux * J, iy: uy * J, turnNo: m.turnNo };
}
function duel(a, b, games, n) {
  let winsA = 0, shots = 0;
  for (let g = 0; g < games; g++) {
    const rng = seeded(g * 7919 + a.length * 31 + b.length);
    const order = g % 2 ? [a, b] : [b, a];
    const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'N' + i, skin: order[i % 2] }));
    const m = PF.newMatch({ players, rng, cfg: { target: 1 } });
    let guard = 0;
    while (m.phase !== 'over' && guard++ < 400) {
      if (m.phase === 'roundover') { PF.startRound(m, rng); continue; }
      PF.simulateShot(m, m.turn, botShot(m, rng)); shots++;
    }
    const w = m.players.find(p => p.id === m.winner);
    if (w && w.skin === a) winsA++;
  }
  return { rate: winsA / games, shots: shots / games };
}
module.exports = { botShot, duel };
if (require.main === module) {
  const ids = PF.SKINS.map(s => s.id), N = Number(process.env.GAMES || 40);
  const total = {}; ids.forEach(i => total[i] = { w: 0, g: 0 });
  let rows = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = duel(ids[i], ids[j], N, 2);
    total[ids[i]].w += r.rate * N; total[ids[i]].g += N; total[ids[j]].w += (1 - r.rate) * N; total[ids[j]].g += N;
    rows.push(ids[i] + ' v ' + ids[j] + ' ' + Math.round(r.rate * 100) + '%');
  }
  console.log(rows.join(' | '));
  console.log('OVERALL ' + ids.map(i => PF.skinById(i).name + ' ' + Math.round(total[i].w / total[i].g * 100) + '%').join(', '));
}
