/* ===== sketches: what the computer players know how to draw, as strokes and fills on the 1000×750 board ===== */
const Sketch = (function () {
  const K = '#1f2230', GREY = '#7a7f8c', RED = '#d6455d', ORANGE = '#f08a24', YELLOW = '#f2c230', GREEN = '#3fae5a', TEAL = '#1c8c7c',
    BLUE = '#2f66d0', PURPLE = '#7b4bd1', PINK = '#e86aa6', BROWN = '#8b5a2b', SKIN = '#f5d0a9';
  const TAU = Math.PI * 2;
  // shape helpers: each returns a flat [x, y, x, y, ...] list
  function ell(cx, cy, rx, ry, a0, a1, n) {
    a0 = a0 === undefined ? 0 : a0; a1 = a1 === undefined ? TAU : a1; n = n || 36;
    const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return p;
  }
  function circ(cx, cy, r, n) { return ell(cx, cy, r, r, 0, TAU, n); }
  function poly(pts, closed) { const p = pts.slice(); if (closed !== false) p.push(pts[0], pts[1]); return p; }
  function line(x1, y1, x2, y2) { return [x1, y1, x2, y2]; }
  function blob(cx, cy, r, bumps, amp) { const p = []; for (let i = 0; i <= 60; i++) { const a = TAU * i / 60; const rr = r + amp * Math.cos(bumps * a); p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85); } return p; }
  function wave(x1, x2, y, amp, waves) { const p = []; for (let i = 0; i <= 40; i++) { const t = i / 40; p.push(x1 + (x2 - x1) * t, y + Math.sin(t * TAU * waves) * amp); } return p; }
  function vwave(x, y1, y2, amp, waves) { const p = []; for (let i = 0; i <= 40; i++) { const t = i / 40; p.push(x + Math.sin(t * TAU * waves) * amp, y1 + (y2 - y1) * t); } return p; }
  const S = function (c, w, p) { return { c: c, w: w, p: p }; };
  const F = function (c, x, y) { return { fill: c, at: [x, y] }; };

  const LIB = [
    { word: 'sun', category: 'Thing', hint: 'rises in the east', draw: function () {
      const out = [S(ORANGE, 8, circ(500, 375, 115)), F(YELLOW, 500, 375)];
      for (let i = 0; i < 12; i++) { const a = TAU * i / 12; out.push(S(ORANGE, 10, line(500 + Math.cos(a) * 150, 375 + Math.sin(a) * 150, 500 + Math.cos(a) * 215, 375 + Math.sin(a) * 215))); }
      return out; } },
    { word: 'house', category: 'Place', hint: 'where you live', draw: function () { return [
      S(K, 8, poly([330, 330, 670, 330, 670, 630, 330, 630])), S(K, 8, poly([295, 335, 500, 150, 705, 335])), F(RED, 500, 270), F(YELLOW, 400, 580),
      S(K, 7, poly([460, 500, 540, 500, 540, 630, 460, 630])), F(BROWN, 500, 570), S(YELLOW, 7, circ(525, 570, 5, 6)),
      S(K, 7, poly([370, 390, 450, 390, 450, 460, 370, 460])), F(BLUE, 410, 425), S(K, 5, line(410, 390, 410, 460)), S(K, 5, line(370, 425, 450, 425)),
      S(K, 7, poly([560, 390, 630, 390, 630, 460, 560, 460])), F(BLUE, 595, 425)]; } },
    { word: 'tree', category: 'Thing', hint: 'gives shade', draw: function () { return [
      S(K, 7, poly([465, 420, 535, 420, 545, 670, 455, 670])), F(BROWN, 500, 560), S(K, 8, blob(500, 290, 190, 6, 28)), F(GREEN, 500, 290),
      S(K, 5, wave(380, 620, 672, 4, 3))]; } },
    { word: 'cat', category: 'Animal', hint: 'says meow', draw: function () { return [
      S(K, 8, circ(500, 420, 160)), S(K, 8, poly([385, 330, 395, 175, 480, 268], false)), S(K, 8, poly([520, 268, 605, 175, 615, 330], false)),
      F(ORANGE, 500, 460), F(ORANGE, 410, 260), F(ORANGE, 590, 260),
      S(K, 7, circ(440, 390, 22)), F(GREEN, 440, 390), S(K, 7, circ(560, 390, 22)), F(GREEN, 560, 390),
      S(K, 6, poly([485, 450, 515, 450, 500, 470])), F(PINK, 500, 456), S(K, 6, ell(475, 478, 25, 22, 0, Math.PI, 12)), S(K, 6, ell(525, 478, 25, 22, 0, Math.PI, 12)),
      S(K, 4, line(420, 455, 300, 430)), S(K, 4, line(420, 470, 300, 475)), S(K, 4, line(580, 455, 700, 430)), S(K, 4, line(580, 470, 700, 475))]; } },
    { word: 'fish', category: 'Animal', hint: 'swims all day', draw: function () { return [
      S(K, 8, ell(450, 375, 200, 115)), S(K, 8, poly([640, 375, 800, 265, 790, 485])), F(BLUE, 420, 375), F(TEAL, 740, 375),
      S(K, 6, circ(330, 345, 20)), F(K, 330, 345), S(K, 6, ell(390, 375, 40, 70, -1.2, 1.2, 12)),
      S(BLUE, 5, circ(220, 230, 18)), S(BLUE, 5, circ(185, 165, 13)), S(BLUE, 5, circ(205, 110, 9))]; } },
    { word: 'car', category: 'Object', hint: 'four wheels', draw: function () { return [
      S(K, 8, poly([210, 520, 210, 395, 330, 380, 405, 275, 620, 275, 700, 380, 790, 395, 790, 520])), F(RED, 500, 450),
      S(K, 6, poly([420, 300, 495, 300, 495, 375, 365, 375])), F(BLUE, 460, 340), S(K, 6, poly([520, 300, 605, 300, 660, 375, 520, 375])), F(BLUE, 560, 340),
      S(K, 8, circ(340, 525, 58)), F(K, 340, 525), S(GREY, 8, circ(340, 525, 20)), S(K, 8, circ(660, 525, 58)), F(K, 660, 525), S(GREY, 8, circ(660, 525, 20)),
      S(YELLOW, 14, line(770, 420, 785, 420))]; } },
    { word: 'umbrella', category: 'Object', hint: 'monsoon must-have', draw: function () {
      const top = ell(500, 400, 300, 260, Math.PI, TAU, 30);
      const bot = []; for (let i = 0; i <= 36; i++) { const t = i / 36; const x = 800 - 600 * t; bot.push(x, 400 - Math.abs(Math.sin(t * Math.PI * 3)) * 45); }
      return [S(K, 8, top.concat(bot)), F(PURPLE, 500, 260), S(K, 5, line(400, 365, 470, 150)), S(K, 5, line(600, 365, 530, 150)),
        S(K, 12, line(500, 390, 500, 640)), S(K, 12, ell(455, 640, 45, 45, 0, Math.PI, 14)), S(K, 10, line(500, 140, 500, 105))]; } },
    { word: 'apple', category: 'Food', hint: 'keeps the doctor away', draw: function () {
      const p = []; for (let i = 0; i <= 60; i++) { const a = TAU * i / 60; const r = 175 - 28 * Math.pow(Math.max(0, Math.cos(a + Math.PI / 2)), 6); p.push(500 + Math.cos(a) * r * 1.05, 430 + Math.sin(a) * r); }
      return [S(K, 8, p), F(RED, 500, 450), S(BROWN, 14, line(500, 270, 520, 190)), S(K, 6, ell(580, 215, 55, 25, 0, TAU, 20)), F(GREEN, 580, 215), S(K, 6, ell(430, 380, 28, 50, 0, TAU, 14)), F('#ffffff', 430, 380)]; } },
    { word: 'banana', category: 'Food', hint: 'monkeys love it', draw: function () {
      const up = [], dn = [];
      // a fat crescent: the outer edge bends more than the inner one
      for (let i = 0; i <= 30; i++) { const a = Math.PI * (0.15 + 0.7 * i / 30); up.push(500 + Math.cos(a) * 300, 170 + Math.sin(a) * 300); dn.unshift(500 + Math.cos(Math.PI * (0.15 + 0.7 * i / 30)) * 300 * 0.98, 225 + Math.sin(Math.PI * (0.15 + 0.7 * i / 30)) * 200); }
      return [S(K, 8, up.concat(dn).concat([up[0], up[1]])), F(YELLOW, 500, 445), S(BROWN, 14, line(245, 330, 215, 300)), S(BROWN, 10, line(755, 330, 775, 315)), S(ORANGE, 5, ell(500, 220, 270, 210, Math.PI * 0.3, Math.PI * 0.7, 16))]; } },
    { word: 'ice cream', category: 'Food', hint: 'melts in the summer', draw: function () { return [
      S(K, 7, poly([395, 380, 605, 380, 500, 690])), F(SKIN, 500, 450), S(BROWN, 4, line(430, 420, 560, 560)), S(BROWN, 4, line(570, 420, 450, 560)), S(BROWN, 4, line(470, 400, 525, 620)),
      S(K, 7, blob(500, 300, 125, 7, 10)), F(PINK, 500, 300), S(K, 6, circ(500, 170, 26)), F(RED, 500, 170), S(PINK, 14, line(560, 385, 565, 430))]; } },
    { word: 'pizza', category: 'Food', hint: 'cheesy and Italian', draw: function () {
      const out = [S(K, 7, poly([300, 210, 700, 210, 500, 660])), F(YELLOW, 500, 380), S(ORANGE, 28, ell(500, 300, 210, 110, Math.PI * 1.18, Math.PI * 1.82, 20))];
      [[430, 290], [565, 295], [500, 385], [498, 505], [555, 400]].forEach(function (q) { out.push(S(K, 5, circ(q[0], q[1], 32, 16)), F(RED, q[0], q[1])); });
      out.push(S(GREEN, 9, line(410, 270, 430, 260)), S(GREEN, 9, line(600, 400, 615, 390)));
      return out; } },
    { word: 'kite', category: 'Object', hint: 'Makar Sankranti sky', draw: function () {
      const out = [S(K, 8, poly([500, 110, 690, 320, 500, 560, 310, 320])), F(RED, 450, 250), F(YELLOW, 560, 420), S(K, 6, line(500, 110, 500, 560)), S(K, 6, line(310, 320, 690, 320)), F(YELLOW, 560, 250), F(RED, 440, 420)];
      out.push(S(K, 5, vwave(500, 560, 730, 22, 1.5)));
      [[518, 615], [482, 690]].forEach(function (q) { out.push(S(BLUE, 6, poly([q[0] - 25, q[1] - 15, q[0] + 25, q[1] + 15, q[0] + 25, q[1] - 15, q[0] - 25, q[1] + 15]))); });
      return out; } },
    { word: 'balloon', category: 'Object', hint: 'goes pop!', draw: function () { return [
      S(K, 7, ell(500, 290, 145, 185)), F(RED, 500, 290), S(K, 6, poly([485, 475, 515, 475, 500, 500])), F(RED, 500, 485), S(GREY, 5, vwave(500, 500, 715, 16, 2)),
      S('#ffffff', 16, ell(440, 230, 40, 60, Math.PI * 1.1, Math.PI * 1.5, 8))]; } },
    { word: 'star', category: 'Thing', hint: 'twinkle twinkle', draw: function () {
      const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 100 : 245; p.push(500 + Math.cos(a) * r, 395 + Math.sin(a) * r); }
      return [S(ORANGE, 8, poly(p)), F(YELLOW, 500, 395), S(YELLOW, 6, line(200, 160, 230, 190)), S(YELLOW, 6, line(230, 160, 200, 190)), S(YELLOW, 6, line(780, 580, 810, 610)), S(YELLOW, 6, line(810, 580, 780, 610))]; } },
    { word: 'moon', category: 'Thing', hint: 'lights up the night', draw: function () {
      const outer = [], inner = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30, y = 130 + 490 * t, s = Math.sin(Math.PI * t); outer.push(560 - 260 * s, y); inner.unshift(560 - 120 * s, y); }
      return [S(K, 7, outer.concat(inner).concat([outer[0], outer[1]])), F(YELLOW, 360, 375), S(GREY, 5, circ(400, 300, 18)), S(GREY, 5, circ(380, 470, 12)),
        S(YELLOW, 6, line(700, 200, 730, 230)), S(YELLOW, 6, line(730, 200, 700, 230)), S(YELLOW, 6, line(760, 450, 785, 475)), S(YELLOW, 6, line(785, 450, 760, 475))]; } },
    { word: 'mountain', category: 'Place', hint: 'the Himalayas', draw: function () { return [
      S(K, 8, poly([90, 640, 380, 200, 560, 470, 700, 290, 920, 640])), F(GREY, 380, 500), F(GREY, 760, 560),
      S(K, 6, poly([310, 305, 380, 200, 450, 305, 415, 280, 380, 315, 345, 280])), F('#ffffff', 380, 255),
      S(K, 6, poly([650, 365, 700, 290, 750, 365, 725, 345, 700, 375, 675, 345])), F('#ffffff', 700, 335),
      S(GREEN, 10, line(60, 650, 950, 650)), S(ORANGE, 7, circ(820, 150, 50)), F(YELLOW, 820, 150)]; } },
    { word: 'flower', category: 'Thing', hint: 'bees love it', draw: function () {
      const out = [S(GREEN, 14, line(500, 462, 500, 700)), S(K, 5, ell(570, 580, 60, 24, 0, TAU, 18)), F(GREEN, 570, 580)];
      for (let i = 0; i < 6; i++) { const a = TAU * i / 6 - Math.PI / 2, x = 500 + Math.cos(a) * 104, y = 300 + Math.sin(a) * 104; out.push(S(K, 5, circ(x, y, 50, 24)), F(PINK, x, y)); }
      out.push(S(K, 6, circ(500, 300, 55)), F(YELLOW, 500, 300));
      return out; } },
    { word: 'boat', category: 'Object', hint: 'floats on water', draw: function () { return [
      S(K, 8, poly([240, 470, 760, 470, 670, 585, 330, 585])), F(BROWN, 500, 530), S(K, 10, line(500, 470, 500, 140)),
      S(K, 7, poly([515, 160, 515, 440, 720, 440])), F('#ffffff', 560, 400), F(YELLOW, 560, 400), S(K, 6, poly([500, 140, 410, 165, 500, 190])), F(RED, 470, 165),
      S(BLUE, 9, wave(150, 850, 620, 14, 5)), S(BLUE, 7, wave(220, 780, 670, 10, 4))]; } },
    { word: 'glasses', category: 'Object', hint: 'help you see', draw: function () { return [
      S(K, 14, circ(360, 390, 115)), S(K, 14, circ(640, 390, 115)), S(K, 12, ell(500, 395, 30, 25, Math.PI, TAU, 10)),
      S(K, 12, line(248, 365, 140, 320)), S(K, 12, line(752, 365, 860, 320)), F(TEAL, 360, 390), F(TEAL, 640, 390),
      S('#ffffff', 12, ell(330, 360, 50, 50, Math.PI * 1.1, Math.PI * 1.45, 8)), S('#ffffff', 12, ell(610, 360, 50, 50, Math.PI * 1.1, Math.PI * 1.45, 8))]; } },
    { word: 'clock', category: 'Object', hint: 'tick tock', draw: function () {
      const out = [S(K, 14, circ(500, 375, 235)), F(YELLOW, 500, 200)];
      for (let i = 0; i < 12; i++) { const a = TAU * i / 12; out.push(S(K, i % 3 ? 6 : 12, line(500 + Math.cos(a) * 195, 375 + Math.sin(a) * 195, 500 + Math.cos(a) * 215, 375 + Math.sin(a) * 215))); }
      out.push(S(K, 14, line(500, 375, 500, 215)), S(RED, 9, line(500, 375, 625, 420)), S(K, 10, circ(500, 375, 12, 10)), S(K, 10, line(430, 120, 390, 95)), S(K, 10, line(570, 120, 610, 95)));
      return out; } },
    { word: 'chai', category: 'Food', hint: 'best with biscuits', draw: function () { return [
      S(K, 8, poly([355, 330, 645, 330, 610, 560, 390, 560])), F(ORANGE, 500, 450), S(K, 8, ell(650, 440, 62, 62, -Math.PI / 2, Math.PI / 2, 14)),
      S(K, 7, ell(500, 575, 215, 38)), F(GREY, 330, 580), S(BROWN, 8, ell(500, 345, 140, 18, 0, Math.PI, 14)),
      S(GREY, 6, vwave(440, 300, 160, 14, 1.2)), S(GREY, 6, vwave(500, 300, 130, 14, 1.2)), S(GREY, 6, vwave(560, 300, 160, 14, 1.2))]; } },
    { word: 'samosa', category: 'Food', hint: 'tea time snack', draw: function () {
      const out = [S(BROWN, 10, poly([290, 570, 500, 180, 710, 570])), F(ORANGE, 500, 420)];
      for (let i = 0; i < 8; i++) { const x = 320 + i * 52; out.push(S(BROWN, 6, line(x, 560, x + 22, 530))); }
      out.push(S(BROWN, 5, line(500, 210, 520, 300)), S(K, 6, ell(800, 580, 75, 30)), F(GREEN, 800, 580), S(GREEN, 8, wave(740, 860, 570, 5, 1)));
      return out; } },
    { word: 'diya', category: 'Festival', hint: 'Diwali lamp', draw: function () {
      const bowl = ell(500, 450, 220, 130, 0, Math.PI, 24).concat([720, 450]);
      return [S(K, 8, bowl), F(ORANGE, 500, 520), S(K, 6, ell(500, 450, 220, 30)), F(BROWN, 500, 450), S(RED, 6, wave(320, 680, 530, 10, 4)),
        S(K, 6, poly([500, 170, 545, 300, 520, 420, 480, 420, 455, 300])), F(YELLOW, 500, 330), S(ORANGE, 6, poly([500, 280, 520, 350, 500, 405, 480, 350])), F(ORANGE, 500, 360),
        S(YELLOW, 6, line(380, 230, 340, 200)), S(YELLOW, 6, line(620, 230, 660, 200)), S(YELLOW, 6, line(500, 135, 500, 95))]; } },
    { word: 'rocket', category: 'Object', hint: 'goes to space', draw: function () { return [
      S(K, 8, poly([440, 560, 440, 300, 500, 140, 560, 300, 560, 560])), F(GREY, 500, 450), S(K, 7, circ(500, 330, 34)), F(BLUE, 500, 330),
      S(K, 7, poly([440, 450, 350, 600, 440, 560], false)), F(RED, 420, 540), S(K, 7, poly([560, 450, 650, 600, 560, 560], false)), F(RED, 580, 540),
      S(K, 7, poly([455, 565, 500, 710, 545, 565])), F(ORANGE, 500, 610), S(YELLOW, 6, poly([480, 570, 500, 650, 520, 570])),
      S(YELLOW, 6, line(240, 190, 265, 215)), S(YELLOW, 6, line(265, 190, 240, 215)), S(YELLOW, 6, line(760, 300, 785, 325)), S(YELLOW, 6, line(785, 300, 760, 325))]; } },
    { word: 'heart', category: 'Thing', hint: 'beats inside you', draw: function () {
      const p = []; for (let i = 0; i <= 64; i++) { const t = TAU * i / 64, x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p.push(500 + x * 15, 350 - y * 15); }
      return [S(K, 8, p), F(RED, 500, 380), S('#ffffff', 14, ell(400, 300, 50, 50, Math.PI * 1.05, Math.PI * 1.45, 8))]; } },
    { word: 'snowman', category: 'Thing', hint: 'built in winter', draw: function () { return [
      S(K, 7, circ(500, 560, 150)), S(K, 7, circ(500, 330, 105)), S(K, 7, circ(500, 170, 72)),
      S(K, 7, poly([435, 110, 565, 110, 555, 30, 445, 30])), F(K, 500, 70), S(K, 12, line(405, 110, 595, 110)),
      S(K, 12, circ(475, 160, 5, 6)), S(K, 12, circ(525, 160, 5, 6)), S(K, 6, poly([500, 180, 570, 195, 500, 200])), F(ORANGE, 515, 191),
      S(K, 12, circ(500, 300, 6, 6)), S(K, 12, circ(500, 345, 6, 6)), S(K, 12, circ(500, 390, 6, 6)),
      S(BROWN, 9, line(400, 315, 280, 240)), S(BROWN, 9, line(600, 315, 720, 240)), S(RED, 16, line(440, 245, 560, 245))]; } },
    { word: 'cricket', category: 'Sport', hint: 'bat and ball', draw: function () { return [
      S(K, 7, poly([300, 600, 360, 640, 560, 330, 500, 290])), F(SKIN, 430, 470), S(K, 12, line(530, 310, 610, 190)),
      S(K, 6, circ(700, 560, 45)), F(RED, 700, 560), S('#ffffff', 4, ell(700, 560, 45, 18, 0, Math.PI, 10)),
      S(BROWN, 9, line(780, 260, 780, 470)), S(BROWN, 9, line(830, 260, 830, 470)), S(BROWN, 9, line(880, 260, 880, 470)), S(BROWN, 7, line(775, 255, 885, 255)), S(GREEN, 10, line(700, 475, 950, 475))]; } },
    { word: 'pencil', category: 'Object', hint: 'write and erase', draw: function () { return [
      S(K, 7, poly([270, 320, 700, 320, 700, 430, 270, 430])), F(YELLOW, 480, 375), S(K, 5, line(270, 357, 700, 357)), S(K, 5, line(270, 393, 700, 393)),
      S(K, 7, poly([700, 320, 830, 375, 700, 430])), F(SKIN, 740, 375), S(K, 7, poly([785, 356, 830, 375, 785, 394])), F(K, 805, 375),
      S(K, 7, poly([270, 320, 200, 320, 200, 430, 270, 430], false)), F(PINK, 235, 375), S(K, 6, line(250, 320, 250, 430))]; } }
  ];
  const BY = {}; LIB.forEach(function (it) { BY[PC.compact(it.word)] = it; });
  function find(word) { return BY[PC.compact(word || '')] || null; }

  /* turn a sketch into a timed list of drawing ops, with a slightly shaky hand and a random size/position */
  function script(word, rng) {
    rng = rng || Math.random;
    const it = find(word);
    const parts = it ? it.draw() : [S(K, 10, ell(500, 300, 90, 90, Math.PI, Math.PI * 2.4, 20).concat([500, 420, 500, 470])), S(K, 16, circ(500, 560, 6, 6))];
    const sc = 0.88 + rng() * 0.14, dx = (rng() - 0.5) * 70, dy = (rng() - 0.5) * 40, rot = (rng() - 0.5) * 0.08;
    const tf = function (x, y) {
      const X = (x - 500) * sc, Y = (y - 375) * sc;
      return [Math.round(500 + dx + X * Math.cos(rot) - Y * Math.sin(rot)), Math.round(375 + dy + X * Math.sin(rot) + Y * Math.cos(rot))];
    };
    const steps = []; let t = 0;
    const speed = 650 + rng() * 300;             // board units per second
    parts.forEach(function (pt) {
      t += 250 + rng() * 450;
      if (pt.fill) { const q = tf(pt.at[0], pt.at[1]); steps.push({ t: t, op: { k: 'f', c: pt.fill, p: q } }); t += 200; return; }
      const pts = [];
      for (let i = 0; i < pt.p.length; i += 2) {
        const q = tf(pt.p[i], pt.p[i + 1]);
        const j = i === 0 || i === pt.p.length - 2 ? 0 : 3;
        pts.push(q[0] + Math.round((rng() - 0.5) * j), q[1] + Math.round((rng() - 0.5) * j));
      }
      steps.push({ t: t, op: { k: 's', c: pt.c, w: Math.max(2, Math.round(pt.w * sc)), p: pts.slice(0, 2) } });
      let chunk = [];
      for (let i = 2; i < pts.length; i += 2) {
        t += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]) / speed * 1000;
        chunk.push(pts[i], pts[i + 1]);
        if (chunk.length >= 8 || i >= pts.length - 2) { steps.push({ t: t, op: { k: 'l', p: chunk } }); chunk = []; }
      }
    });
    return { steps: steps, length: t };
  }
  return { LIB: LIB, find: find, script: script, words: function () { return LIB.map(function (x) { return x.word; }); } };
})();
