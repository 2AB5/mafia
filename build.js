// Builds the single-file game: dist/mafia.html (Claude artifact body) and index.html (standalone page).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const eng = read('engine.js');
const app = read('app1.js') + '\n' + read('app2.js');
if (/<\/script/i.test(eng + app)) throw new Error('script close tag inside JS');
new Function(eng); new Function(app); // syntax check
const body = read('shell.html').replace('/*__ENGINE__*/', () => eng).replace('/*__APP__*/', () => app);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'mafia.html'), body);
const page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
console.log('built index.html and dist/mafia.html');
