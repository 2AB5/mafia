// Builds index.html: a single self-contained page (game + PeerJS + QR code library inlined).
const fs = require('fs');
const path = require('path');
const d = __dirname;
const r = (p) => fs.readFileSync(path.join(d, p), 'utf8');
const peer = r('vendor/peerjs.min.js').replace(/\/\/# sourceMappingURL=.*$/m, '');
const qr = r('vendor/qrcode.js');
const eng = r('src/engine.js');
const app = ['src/core.js', 'src/net.js', 'src/ui.js'].map(r).join('\n');
for (const [n, s] of [['peer', peer], ['qr', qr], ['engine', eng], ['app', app]]) {
  if (/<\/script/i.test(s)) throw new Error('</script> inside ' + n);
}
new Function(eng); new Function('"use strict";' + app);
const out = r('src/index.tpl.html')
  .replace('/*__CSS__*/', () => r('src/style.css'))
  .replace('/*__PEERJS__*/', () => peer)
  .replace('/*__QR__*/', () => qr)
  .replace('/*__ENGINE__*/', () => eng)
  .replace('/*__APP__*/', () => app);
fs.writeFileSync(path.join(d, 'index.html'), out);
console.log('built index.html', (out.length / 1024).toFixed(0) + ' KB');
