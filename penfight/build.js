// Builds penfight/index.html: one self-contained page (game + planck.js + PeerJS + QR code inlined).
const fs = require('fs');
const path = require('path');
const d = __dirname;
const r = (p) => fs.readFileSync(path.join(d, p), 'utf8');
const vendor = (f) => {
  for (const p of [path.join(d, 'vendor', f), path.join(d, '..', 'vendor', f)]) if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  throw new Error('missing vendor/' + f);
};
const strip = (s) => s.replace(/\/\/# sourceMappingURL=.*$/mg, '');
const planck = strip(vendor('planck.min.js'));
const peer = strip(vendor('peerjs.min.js'));
const qr = vendor('qrcode.js');
const game = r('src/game.js');
const app = ['src/core.js', 'src/net.js', 'src/settings.js', 'src/ui.js'].map(r).join('\n');
for (const [n, s] of [['planck', planck], ['peer', peer], ['qr', qr], ['game', game], ['app', app]]) if (/<\/script/i.test(s)) throw new Error('</script> inside ' + n);
new Function('"use strict";' + app);
const out = r('src/index.tpl.html')
  .replace('/*__CSS__*/', () => r('src/style.css'))
  .replace('/*__PLANCK__*/', () => planck)
  .replace('/*__PEERJS__*/', () => peer)
  .replace('/*__QR__*/', () => qr)
  .replace('/*__GAME__*/', () => game)
  .replace('/*__APP__*/', () => app);
fs.writeFileSync(path.join(d, 'index.html'), out);
console.log('built penfight/index.html', (out.length / 1024).toFixed(0) + ' KB');
