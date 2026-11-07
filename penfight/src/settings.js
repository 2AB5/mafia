/* ===== settings: desk style and flick control, remembered in this browser ===== */
const DESKS = [
  { id: 'oak',    name: 'Oak',       base: ['#a8703d', '#b98150', '#a26a37'], grain: '70,35,10',  rim: ['#6f4421', '#8a5a2e'], ink: '30,45,120' },
  { id: 'walnut', name: 'Walnut',    base: ['#5e3a22', '#6e452a', '#563420'], grain: '25,12,4',   rim: ['#3b2414', '#4c2f1b'], ink: '235,205,150' },
  { id: 'exam',   name: 'Exam hall', base: ['#3f6b4f', '#4a7a5c', '#3a6349'], grain: '12,32,18',  rim: ['#27412f', '#335640'], ink: '240,240,220' },
  { id: 'birch',  name: 'Birch',     base: ['#d9b98a', '#e3c79c', '#d2b07f'], grain: '120,80,40', rim: ['#9c7a4c', '#b48e5d'], ink: '40,60,160' }
];
const SET = (function () {
  const d = { desk: 'oak', flick: 'pull', replays: true };
  const s = storeJSON('settings');
  return s ? Object.assign(d, s) : d;
})();
function saveSettings() { storeJSON('settings', SET); }
function currentDesk() { return DESKS.find(function (x) { return x.id === SET.desk; }) || DESKS[0]; }
function usableSkin(id) { return validSkin(id) ? id : 'blue'; }
