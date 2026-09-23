import { Game } from './core.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';
import { THEMES, THEME_ORDER } from './themes.js';

const $ = (id) => document.getElementById(id);
const aspect = () => innerWidth / innerHeight;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};

const game = new Game();
const view = new Renderer(game, $('stage'));
const sfx = new Sfx();

/* ---------------- theme ---------------- */
let themeKey = (location.hash || '').slice(1);
if (!THEMES[themeKey]) themeKey = store.get('perimeter.theme', 'fire');
if (!THEMES[themeKey]) themeKey = 'fire';

function applyTheme(key) {
  themeKey = key;
  document.documentElement.dataset.theme = key;
  view.setTheme(key);
  sfx.setTheme(THEMES[key]);
  $('theme-name').textContent = THEMES[key].name;
  document.querySelectorAll('[data-theme]').forEach(b => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.theme === key)); });
  store.set('perimeter.theme', key);
  try { history.replaceState(null, '', '#' + key); } catch (e) { /* sandboxed */ }
  updateHud(true);
}
document.querySelectorAll('button[data-theme]').forEach(b => b.addEventListener('click', (ev) => {
  ev.stopPropagation(); sfx.unlock(); sfx.ui(); applyTheme(b.dataset.theme); b.blur();
}));

/* ---------------- screens ---------------- */
const screens = ['title', 'pause', 'clear', 'over'];
let current = 'title';
function show(name) {
  current = name;
  screens.forEach(s => { $('screen-' + s).hidden = s !== name; });
  document.body.classList.toggle('is-title', name === 'title');
}
function hide() { show(null); }

function startGame() {
  sfx.unlock(); sfx.ui();
  fadeThen(() => { game.newGame(aspect()); hide(); });
}
function nextLevel() {
  sfx.unlock(); sfx.ui();
  fadeThen(() => { game.nextLevel(aspect()); hide(); });
}
function fadeThen(fn) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { fn(); f.classList.remove('on'); }, 330);
}
function togglePause() {
  if (game.state === 'playing') { game.pause(); show('pause'); }
  else if (game.state === 'paused') { game.resume(); hide(); }
}

$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('next').addEventListener('click', nextLevel);
$('resume').addEventListener('click', togglePause);
$('mute').addEventListener('click', (e) => { e.stopPropagation(); sfx.unlock(); $('mute').textContent = sfx.toggleMute() ? '×' : '♪'; });

/* ---------------- input ---------------- */
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
let screenShownAt = 0;
function direction(dir) {
  sfx.unlock();
  if (current === 'title') { startGame(); return; }
  if (game.state === 'paused') { game.resume(); hide(); }
  if (current === 'clear') { if (performance.now() - screenShownAt > 700) nextLevel(); return; }
  if (game.state === 'playing' || game.state === 'dying') game.input(dir);
}
addEventListener('keydown', (e) => {
  const dir = KEYS[e.code];
  if (dir) { e.preventDefault(); direction(dir); return; }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { applyTheme(THEME_ORDER[+e.code.slice(5) - 1]); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'KeyM') { sfx.unlock(); $('mute').textContent = sfx.toggleMute() ? '×' : '♪'; return; }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (current === 'title' || current === 'over') startGame();
    else if (current === 'clear') nextLevel();
    else if (current === 'pause') togglePause();
  }
  if (e.code === 'KeyR' && current === 'over') startGame();
});

let swipe = null;
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
}, { passive: true });
addEventListener('pointermove', (e) => {
  if (!swipe || swipe.done || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 22) return;
  swipe.done = true;
  if (current === 'title') return;
  direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  // allow chained swipes without lifting the finger
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
}, { passive: true });
addEventListener('pointerup', () => { swipe = null; });
addEventListener('pointercancel', () => { swipe = null; });
addEventListener('blur', () => { if (game.state === 'playing') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') togglePause(); });

/* ---------------- HUD ---------------- */
let shownScore = 0;
let lastLives = -1;
function updateHud(force) {
  shownScore += (game.score - shownScore) * 0.15;
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  $('score').textContent = fmt(shownScore);
  $('lvl').textContent = String(game.level).padStart(2, '0');
  if (force || lastLives !== game.lives) {
    lastLives = game.lives;
    $('lives').textContent = THEMES[themeKey].hudGlyph.repeat(Math.max(0, game.lives)) || '—';
  }
  const pct = Math.min(100, game.capturedPct);
  $('capbar').style.width = pct.toFixed(1) + '%';
  $('cap').textContent = pct.toFixed(0) + '% frozen';
}

function popup(text, cx, cy, h = 2, cls = '') {
  const s = view.worldToScreen(cx, cy, h);
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
function callout(text) {
  const el = document.createElement('div');
  el.className = 'callout'; el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

/* ---------------- game events → sound + UI ---------------- */
game.on('carveStart', () => sfx.carve());
game.on('capture', (d) => {
  sfx.capture(d.pct, d.kills);
  if (d.areaPts > 0) popup('+' + fmt(d.areaPts), d.x, d.y, 2);
  if (d.kills >= 2) callout(d.kills === 2 ? 'Double freeze' : d.kills === 3 ? 'Triple freeze' : `Deep freeze ×${d.kills}`);
});
game.on('shatter', ({ e }) => {
  sfx.shatter(e.boss);
  popup('+' + fmt(e.points || 1000), e.x, e.y, e.r * 2 + 1.5, 'kill');
  if (e.boss) callout('Boss shattered');
});
game.on('death', (d) => { sfx.death(); if (d.reason === 'bite') callout('Crossed your line'); });
game.on('respawn', () => sfx.respawn());
game.on('extraLife', () => callout('+1 life'));
game.on('clear', (d) => {
  sfx.clear();
  setTimeout(() => {
    $('clear-eyebrow').textContent = 'Level ' + String(d.level).padStart(2, '0');
    $('clear-bonus').textContent = '+' + fmt(d.bonus);
    $('clear-score').textContent = fmt(game.score);
    show('clear'); screenShownAt = performance.now();
  }, Math.max(1500, d.duration + 700));
});
game.on('gameover', (d) => {
  const best = Math.max(d.score, +store.get('perimeter.best', 0) || 0);
  store.set('perimeter.best', best);
  $('over-score').textContent = fmt(d.score);
  $('over-level').textContent = d.level;
  $('over-best').textContent = fmt(best);
  setTimeout(() => show('over'), 300);
});

/* ---------------- boot ---------------- */
applyTheme(themeKey);
game.attract(aspect());
show('title');

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (game.state === 'title') game.attract(aspect()); }, 250);
});

let last = performance.now();
function frame(now) {
  const realDt = Math.min(50, now - last); last = now;
  const gameDt = realDt * view.timeScale(now);
  game.update(gameDt);
  view.update(realDt, gameDt);
  updateHud(false);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for debugging / automated checks
window.__perimeter = { game, view, applyTheme };
window.addEventListener('error', (e) => { $('err').textContent = 'Error: ' + e.message; });
