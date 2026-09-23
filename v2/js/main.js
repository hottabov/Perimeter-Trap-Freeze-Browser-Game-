import { Game } from './core.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';
import { themeForLevel, generateTheme, canonicalTheme, FAMILIES } from './themegen.js';
import { fetchBoard, submitScore } from './net.js';

const $ = (id) => document.getElementById(id);
const aspect = () => innerWidth / innerHeight;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pad2 = (n) => String(n).padStart(2, '0');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};
const FAMILY_NAMES = { fire: 'Fire & Ice', neon: 'Neon Glacier', cryo: 'Cryo Void' };
const GLYPH = { fire: '❄', neon: '◆', cryo: '◇' };
const POWER_NAMES = { slow: 'Slow time', haste: 'Haste', shield: 'Shield', life: '+1 life' };
const NEW_FOES = {
  2: '<b>New: Sparx.</b> It crawls along the ice edge. The edge is no longer safe, so keep moving.',
  3: '<b>New: Hunter.</b> It turns toward you while you are drawing a line.',
  4: '<b>New: Splitter.</b> Wait too long and it splits in two.',
  5: '<b>Boss.</b> Trap it once for every ring. It breaks out smaller and angrier each time.',
};

const game = new Game();
const view = new Renderer(game, $('stage'));
const sfx = new Sfx();

let mode = store.get('perimeter.mode', 'auto');
if (mode !== 'auto' && !FAMILIES.includes(mode)) mode = 'auto';
let theme = null;
let current = 'title';

/* ---------------- theme ---------------- */
function applyTheme(T) {
  theme = T;
  const root = document.documentElement;
  root.dataset.family = T.family;
  for (const [k, v] of Object.entries(T.ui)) root.style.setProperty('--' + k, v);
  view.setTheme(T);
  sfx.setTheme(T);
  $('world').textContent = T.world;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', T.clear);
  updateHud(true);
}

function newWorld(fam) {
  const f = fam === 'random' ? FAMILIES[(Math.random() * 3) | 0] : fam;
  const T = generateTheme(f, (Math.random() * 1e9) | 0);
  applyTheme(T);
  if (current !== 'title') callout(T.world, 'small');
  sfx.ui();
}

function setMode(m) {
  mode = m;
  store.set('perimeter.mode', m);
  document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  applyTheme(m === 'auto' ? canonicalTheme('fire') : canonicalTheme(m));
}
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); sfx.unlock(); sfx.ui(); setMode(b.dataset.mode); }));
document.querySelectorAll('button[data-fam]').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); sfx.unlock(); newWorld(b.dataset.fam); b.blur(); }));

/* ---------------- screens ---------------- */
const screens = ['title', 'pause', 'clear', 'over'];
function show(name) {
  current = name;
  screens.forEach(s => { $('screen-' + s).hidden = s !== name; });
  document.body.classList.toggle('is-title', name === 'title');
}
function hide() { show(null); }

function showIntro() {
  const el = $('intro');
  const S = game.spec;
  const foe = NEW_FOES[game.level] ? `<div class="newfoe">${NEW_FOES[game.level]}</div>` : '';
  el.innerHTML = `<div class="eyebrow">Level ${pad2(game.level)}${S.boss ? ' · Boss' : ''}</div>
    <div class="name display">${theme.world}</div>
    <div class="goal">Freeze ${S.goal}% of the field or shatter every enemy</div>${foe}`;
  el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showIntro.t1); clearTimeout(showIntro.t2);
  showIntro.t1 = setTimeout(() => el.classList.add('out'), foe ? 4200 : 2600);
  showIntro.t2 = setTimeout(() => { el.hidden = true; el.classList.remove('show', 'out'); }, foe ? 4900 : 3300);
  sfx.levelIntro();
}

let runSeed = 1;
function startGame() {
  sfx.unlock(); sfx.ui();
  runSeed = (Math.random() * 1e9) | 0;
  hide();
  view.transition(() => {
    applyTheme(themeForLevel(1, mode, runSeed));
    game.newGame(aspect(), runSeed);
    showIntro();
    $('hint').hidden = false;
  }, 600);
  sfx.sinkOut();
}
function nextLevel() {
  if (current !== 'clear') return;
  sfx.unlock(); sfx.ui();
  hide();
  sfx.sinkOut();
  view.transition(() => {
    applyTheme(themeForLevel(game.level + 1, mode, runSeed));
    game.nextLevel(aspect());
    showIntro();
    $('hint').hidden = true;
  });
}
function toTitle() {
  hide();
  view.transition(() => {
    setMode(mode);
    game.attract(aspect());
    show('title');
    renderTitleBest();
  }, 500);
}
function togglePause() {
  if (game.state === 'playing') { game.pause(); show('pause'); }
  else if (game.state === 'paused') { game.resume(); hide(); }
}

$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('next').addEventListener('click', nextLevel);
$('resume').addEventListener('click', togglePause);
$('quit').addEventListener('click', () => { game.state = 'title'; toTitle(); });
$('mute').addEventListener('click', (e) => { e.stopPropagation(); sfx.unlock(); $('mute').textContent = sfx.toggleMute() ? '×' : '♪'; });

/* ---------------- input ---------------- */
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
let screenShownAt = 0;
function direction(dir) {
  sfx.unlock();
  if (current === 'title') { startGame(); return; }
  if (current === 'over') return;
  if (game.state === 'paused') { game.resume(); hide(); }
  if (current === 'clear') { if (performance.now() - screenShownAt > 900) nextLevel(); return; }
  if (game.state === 'playing' || game.state === 'dying') game.input(dir);
}
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const dir = KEYS[e.code];
  if (dir) { e.preventDefault(); direction(dir); return; }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    sfx.unlock();
    const fam = FAMILIES[+e.code.slice(5) - 1];
    if (current === 'title') setMode(fam); else newWorld(fam);
    return;
  }
  if (e.code === 'KeyG') { sfx.unlock(); if (current === 'title') setMode('auto'); else newWorld('random'); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'KeyM') { sfx.unlock(); $('mute').textContent = sfx.toggleMute() ? '×' : '♪'; return; }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (current === 'title' || current === 'over') startGame();
    else if (current === 'clear') nextLevel();
    else if (current === 'pause') togglePause();
  }
});

let swipe = null;
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, form')) return;
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
}, { passive: true });
addEventListener('pointermove', (e) => {
  if (!swipe || swipe.done || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 22) return;
  swipe.done = true;
  if (current === 'title') return;
  direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
}, { passive: true });
addEventListener('pointerup', () => { swipe = null; });
addEventListener('pointercancel', () => { swipe = null; });
addEventListener('blur', () => { if (game.state === 'playing') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') togglePause(); });

/* ---------------- HUD ---------------- */
let shownScore = 0, lastLives = -1, lastMult = 1, lastFx = '';
function updateHud(force) {
  shownScore += (game.score - shownScore) * 0.15;
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  $('score').textContent = fmt(shownScore);
  $('lvl').textContent = pad2(game.level);
  if ((force || lastLives !== game.lives) && theme) {
    lastLives = game.lives;
    $('lives').textContent = GLYPH[theme.family].repeat(Math.max(0, Math.min(8, game.lives))) || '—';
  }
  const m = game.multiplier;
  if (m !== lastMult) {
    const el = $('mult');
    el.hidden = m <= 1; el.textContent = '×' + m;
    el.classList.remove('bump'); void el.offsetWidth; if (m > lastMult) el.classList.add('bump');
    lastMult = m;
  }
  const goal = game.spec ? game.spec.goal : 75;
  const pct = Math.min(100, game.capturedPct);
  $('capbar').style.width = pct.toFixed(1) + '%';
  $('goaltick').style.left = goal + '%';
  $('cap').textContent = `${pct.toFixed(0)}% of ${goal}% frozen`;
  // active power-up effects
  const chips = [];
  if (theme && game.state !== 'title') {
    const P = theme.powerups;
    if (game.slowed) chips.push(`<span class="chip" style="color:${P.slow}">Slow ${Math.ceil((game.effects.slowUntil - game.t) / 1000)}s</span>`);
    if (game.hasted) chips.push(`<span class="chip" style="color:${P.haste}">Haste ${Math.ceil((game.effects.hasteUntil - game.t) / 1000)}s</span>`);
    if (game.effects.shield) chips.push(`<span class="chip" style="color:${P.shield}">Shield</span>`);
  }
  const html = chips.join('');
  if (html !== lastFx) { $('effects').innerHTML = html; lastFx = html; }
}

function popup(text, cx, cy, h = 2, cls = '') {
  const s = view.worldToScreen(cx, cy, h);
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
function callout(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'callout display ' + cls; el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

/* ---------------- game events → sound + UI ---------------- */
game.on('carveStart', () => sfx.carve());
game.on('capture', (d) => {
  sfx.capture(d.pct, d.kills);
  if (d.areaPts > 0) popup('+' + fmt(d.areaPts), d.x, d.y, 2);
  if (d.kills >= 2) callout(d.kills === 2 ? 'Double freeze' : d.kills === 3 ? 'Triple freeze' : `Deep freeze ×${d.kills}`);
  $('hint').hidden = true;
});
game.on('shatter', ({ e }) => {
  sfx.shatter(e.boss);
  popup('+' + fmt(e.points || 1000), e.x, e.y, e.r * 2 + 1.5, 'kill');
  if (e.boss) callout('Boss shattered');
});
game.on('bossHit', (d) => { sfx.bossHit(); popup('+' + fmt(d.points), d.e.x, d.e.y, d.e.r * 2 + 2, 'kill'); callout(d.hp > 1 ? `Cracked · ${d.hp} left` : 'One more', 'small'); });
game.on('bossBreak', () => sfx.bossBreak());
game.on('split', () => sfx.split());
game.on('goalReached', () => { sfx.goal(); callout('Field secured'); });
game.on('death', (d) => { sfx.death(); if (d.reason === 'bite') callout('Crossed your line', 'small'); if (d.reason === 'sparx') callout('Caught by a sparx', 'small'); });
game.on('respawn', () => sfx.respawn());
game.on('extraLife', () => callout('+1 life', 'small'));
game.on('sparxSpawn', () => sfx.sparx());
game.on('powerSpawn', () => sfx.powerSpawn());
game.on('powerup', ({ p }) => { sfx.powerup(p.type); if (p.type !== 'life') callout(POWER_NAMES[p.type], 'small'); });
game.on('shieldBreak', () => { sfx.shieldBreak(); callout('Shield broke', 'small'); });
game.on('clear', (d) => {
  sfx.clear();
  setTimeout(() => {
    $('clear-eyebrow').textContent = `Level ${pad2(d.level)} cleared`;
    $('clear-world').textContent = theme.world;
    $('clear-stars').innerHTML = [0, 1, 2].map(k => `<span class="${k < d.stars ? 'on' : ''}" style="animation-delay:${0.15 + k * 0.18}s">★</span>`).join('');
    const b = d.breakdown, mm = Math.floor(d.seconds / 60), ss = pad2(Math.floor(d.seconds % 60));
    $('clear-ledger').innerHTML = `
      <dt>Level bonus</dt><dd>+${fmt(b.clear)}</dd>
      <dt>Time ${mm}:${ss} (par ${Math.floor(game.spec.par / 60)}:${pad2(game.spec.par % 60)})</dt><dd>+${fmt(b.time)}</dd>
      <dt>Frozen ${d.pct.toFixed(0)}% (goal ${game.spec.goal}%)</dt><dd>+${fmt(b.overGoal)}</dd>
      <dt>No lives lost</dt><dd>+${fmt(b.lives)}</dd>
      <dt class="total">Score</dt><dd class="total">${fmt(game.score)}</dd>`;
    show('clear'); screenShownAt = performance.now();
  }, Math.max(1500, d.duration + 700));
});
game.on('gameover', async (d) => {
  const best = Math.max(d.score, +store.get('perimeter.best', 0) || 0);
  store.set('perimeter.best', best);
  $('over-score').textContent = fmt(d.score);
  $('over-level').textContent = d.level;
  $('over-best').textContent = fmt(best);
  $('name').value = store.get('perimeter.name', '');
  $('save').disabled = false; $('save').textContent = 'Save score';
  lastScore = d.score;
  setTimeout(() => show('over'), 300);
  renderBoard(await fetchBoard(), null);
});

let lastScore = 0;
$('namebox').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value.trim().slice(0, 24);
  if (!name) { $('name').focus(); return; }
  store.set('perimeter.name', name);
  $('save').disabled = true; $('save').textContent = 'Saving…';
  const res = await submitScore(name, lastScore);
  $('save').textContent = 'Saved';
  renderBoard(res, name);
});

function renderBoard({ list, online }, you) {
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('board').innerHTML = list.slice(0, 10).map((r, i) => `<li class="${r.name === you ? 'you' : ''}"><span>${i + 1}. ${esc(r.name)}</span><span>${fmt(r.score)}</span></li>`).join('');
  $('board-note').textContent = online ? 'Global leaderboard' : 'Leaderboard offline · scores are kept in this browser';
}

function renderTitleBest() {
  const best = +store.get('perimeter.best', 0) || 0;
  $('title-best').textContent = best ? `Best ${fmt(best)}` : '';
}

/* ---------------- boot ---------------- */
setMode(mode);
game.attract(aspect());
show('title');
renderTitleBest();

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

window.__perimeter = {
  game, view, applyTheme, newWorld, startGame, nextLevel,
  // debugging helper: jump straight to a level
  goto(n) { hide(); game.level = n - 1; applyTheme(themeForLevel(n, mode, runSeed)); game.nextLevel(aspect()); showIntro(); },
};
window.addEventListener('error', (e) => { $('err').textContent = 'Error: ' + e.message; });
