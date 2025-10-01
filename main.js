import { Game } from './src/game.js';
import { AudioManager } from './src/audio.js';

/* -------------------- Boot -------------------- */
const game = new Game({
  canvasId: 'board',
  fxCanvasId: 'fx',
  ui: {
    level: document.getElementById('level'),
    enemies: document.getElementById('enemies'),
    captured: document.getElementById('captured'),
    boss: document.getElementById('boss'),
    banner: document.getElementById('banner'),
    bannerTitle: document.getElementById('banner-title'),
    bannerSub: document.getElementById('banner-sub'),
    bannerBtn: document.getElementById('banner-btn'),
    overlay: document.getElementById('overlay'),
    score: document.getElementById('score'),
    lives: document.getElementById('lives')
  }
});

const audio = new AudioManager({
  playlist: ['audio/1.mp3','audio/2.mp3','audio/3.mp3','audio/4.mp3','audio/5.mp3','audio/6.mp3'],
  sfx: { enemy: 'sfx/enemy.mp3', complete: 'sfx/complete.mp3' }
});

/* -------------------- Name cookie modal -------------------- */
const nameOverlay = createNameOverlay();
document.body.appendChild(nameOverlay.container);

function setCookie(name, value, days){
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name){
  const m = document.cookie.match(new RegExp('(^| )'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}

let playerName = getCookie('playerName');
let nameRequired = !playerName;

/* -------------------- Persistent scores (OPFS → localStorage) -------------------- */
const storage = (()=> {
  let mode = 'local';
  let rootDir = null;
  let fileHandle = null;
  const FILE_NAME = 'scores.json';

  async function init(){
    try{
      if (navigator.storage && navigator.storage.getDirectory){
        rootDir = await navigator.storage.getDirectory();
        fileHandle = await rootDir.getFileHandle(FILE_NAME, { create: true });
        mode = 'opfs';
        try{
          const tx = await (await fileHandle.getFile()).text();
          JSON.parse(tx);
        }catch(_){
          await save([]);
        }
      } else {
        mode = 'local';
        if (!localStorage.getItem('highscores')) localStorage.setItem('highscores','[]');
      }
    }catch(_){
      mode = 'local';
      if (!localStorage.getItem('highscores')) localStorage.setItem('highscores','[]');
    }
  }

  async function load(){
    if (mode === 'opfs'){
      const file = await fileHandle.getFile();
      const txt = await file.text();
      try{ return JSON.parse(txt)||[]; }catch(_){ return []; }
    } else {
      try{ return JSON.parse(localStorage.getItem('highscores')||'[]'); }catch(_){ return []; }
    }
  }

  async function save(list){
    if (mode === 'opfs'){
      const w = await fileHandle.createWritable();
      await w.write(JSON.stringify(list, null, 2));
      await w.close();
    } else {
      localStorage.setItem('highscores', JSON.stringify(list));
    }
  }

  async function upsertScore(name, score){
    const list = await load();
    const idx = list.findIndex(r => r.name === name);
    const now = new Date().toISOString();
    if (idx >= 0){
      if (score > (list[idx].score||0)) list[idx] = { name, score, date: now };
    } else {
      list.push({ name, score, date: now });
    }
    list.sort((a,b)=> b.score - a.score);
    if (list.length > 200) list.length = 200;
    await save(list);
    return list;
  }

  return { init, load, save, upsertScore };
})();

/* -------------------- Remote leaderboard (server API) -------------------- */
const remote = (() => {
  const BASE = '/api';

  async function load() {
    const r = await fetch(`${BASE}/leaderboard`, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('remote load failed');
    const j = await r.json();
    return Array.isArray(j.list) ? j.list : [];
  }

  async function upsertScore(name, score) {
    const r = await fetch(`${BASE}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    if (!r.ok) throw new Error('remote upsert failed');
    const j = await r.json();
    return Array.isArray(j.list) ? j.list : [];
  }

  return { load, upsertScore };
})();

/* -------------------- Ensure keyboard focus & lock scroll -------------------- */
const board = document.getElementById('board');
const overlayEl = document.getElementById('overlay');
board.setAttribute('tabindex', '0');
board.addEventListener('pointerdown', ()=> board.focus(), {passive:true});
window.addEventListener('load', ()=> board.focus());

(function lockScroll(){
  const html = document.documentElement;
  const body = document.body;
  html.style.height = '100%';
  body.style.height = '100%';
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  board.style.touchAction = 'none';
  overlayEl.style.touchAction = 'none';
})();

/* -------------------- Helpers for input gating -------------------- */
function isTypingTarget(el){
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
function isNameModalOpen(){
  return nameOverlay.container && nameOverlay.container.style.display !== 'none';
}

/* -------------------- Input (keyboard) -------------------- */
const MAP_CODE = {
  ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
  KeyA:'left', KeyD:'right', KeyW:'up', KeyS:'down'
};
const MAP_KEY = {
  arrowleft:'left', arrowright:'right', arrowup:'up', arrowdown:'down',
  a:'left', d:'right', w:'up', s:'down'
};
function directionFromEvent(e){
  const byCode = MAP_CODE[e.code];
  if (byCode) return byCode;
  const k = (e.key || '').toLowerCase();
  return MAP_KEY[k];
}
function doRestart(){
  audio.stopAll();
  game.hardReset();
  audio.startForLevel(game.level, false);
  board.focus();
}
function processDirection(dir){
  if (!dir) return;
  if (isNameModalOpen()) return;

  if (!game.running && (game.overlayIntent === 'restart' || game.overlayIntent === 'next')) {
    return;
  }
  if (nameRequired){
    showNameModal();
    return;
  }
  if (!game.running && game.overlayIntent === 'continue') {
    game.input(dir);
    game.resume();
    audio.resumeCurrent();
    return;
  }
  game.input(dir);
}
function onKeyDown(e){
  if (isNameModalOpen() || isTypingTarget(e.target)) return;

  const key = (e.key || '').toLowerCase();
  const dir = directionFromEvent(e);

  // P key for pause/unpause
  if(key === 'p' && game.running){
    e.preventDefault();
    game.pause('Paused', 'Press P or any arrow key to resume');
    return;
  }
  
  if(key === 'p' && !game.running && game.overlayIntent === 'continue'){
    e.preventDefault();
    game.resume();
    audio.resumeCurrent();
    board.focus();
    return;
  }

  // C or Space to continue
  if((key === 'c' || key === ' ') && !game.running && game.overlayIntent === 'continue'){
    e.preventDefault();
    game.resume();
    audio.resumeCurrent();
    board.focus();
    return;
  }

  // Continue after death with C or Space
  if((key === 'c' || key === ' ') && !game.running && game.overlayIntent === 'next'){
    e.preventDefault();
    game.nextLevel();
    audio.startForLevel(game.level, true);
    game.resume();
    board.focus();
    return;
  }

  if (!game.running && game.overlayIntent === 'restart' && key === 'r'){
    e.preventDefault(); e.stopPropagation();
    doRestart();
    return;
  }
  if (dir){
    e.preventDefault(); e.stopPropagation();
    processDirection(dir);
  } else if (key === ' '){
    e.preventDefault();
  }
}
window.addEventListener('keydown', onKeyDown, {capture:true, passive:false});
document.addEventListener('keydown', onKeyDown, {capture:true, passive:false});
board.addEventListener('keydown', onKeyDown, {capture:true, passive:false});

/* -------------------- Input (swipe) -------------------- */
const SWIPE_MIN = 24;
let swipeState = { active:false, id:null, sx:0, sy:0 };
function getPoint(e, wantId){
  if (e instanceof PointerEvent){
    if (wantId != null && e.pointerId !== wantId) return null;
    return { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  const list = e.changedTouches || e.touches;
  if (!list || !list.length) return null;
  if (wantId == null){ const t = list[0]; return { id: t.identifier, x: t.clientX, y: t.clientY }; }
  for (let i=0;i<list.length;i++){ const t = list[i]; if (t.identifier === wantId) return { id: t.identifier, x: t.clientX, y: t.clientY }; }
  return null;
}
function swipeStart(e){
  if (isNameModalOpen()) return;
  if (!game.running && (game.overlayIntent === 'restart' || game.overlayIntent === 'next')) return;
  const p = getPoint(e);
  if (!p) return;
  swipeState.active = true; swipeState.id = p.id; swipeState.sx = p.x; swipeState.sy = p.y;
}
function swipeMove(e){ if (!swipeState.active) return; e.preventDefault(); }
function swipeEnd(e){
  if (!swipeState.active) return;
  const p = getPoint(e, swipeState.id);
  swipeState.active = false;
  if (!p) return;
  const dx = p.x - swipeState.sx, dy = p.y - swipeState.sy;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return;
  const dir = (ax > ay) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  processDirection(dir);
}
['pointerdown','touchstart'].forEach(t=>{
  board.addEventListener(t, swipeStart, {passive:false});
  overlayEl.addEventListener(t, swipeStart, {passive:false});
});
['pointermove','touchmove'].forEach(t=>{
  board.addEventListener(t, swipeMove, {passive:false});
  overlayEl.addEventListener(t, swipeMove, {passive:false});
});
['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>{
  board.addEventListener(t, swipeEnd, {passive:false});
  overlayEl.addEventListener(t, swipeEnd, {passive:false});
});

/* -------------------- Buttons -------------------- */
document.getElementById('reset').addEventListener('click', ()=>{
  doRestart();
});

document.getElementById('banner-btn').addEventListener('click', ()=>{
  const state = game.overlayIntent;
  if (nameRequired){
    showNameModal();
    return;
  }
  if(state === 'restart'){
    doRestart();
    return;
  }
  if(state === 'next'){
    game.nextLevel();
    audio.startForLevel(game.level, true);
    game.resume();
    board.focus();
    return;
  }
  game.resume();
  audio.resumeCurrent();
  board.focus();
});

/* -------------------- Level lifecycle ↔ audio -------------------- */
game.onLevelStart = (lvl)=> audio.startForLevel(lvl, lvl>1);
game.onLevelComplete = ()=>{ audio.sfx('complete'); audio.markLevelComplete(); };
game.onEnemyDestroyed = ()=> audio.sfx('enemy');

/* -------------------- Bonus ↔ audio -------------------- */
game.onBonusStart = () => audio.bonusStart && audio.bonusStart();
game.onBonusStop  = () => audio.bonusStop && audio.bonusStop();

/* -------------------- Hook game over → leaderboard -------------------- */
game.onGameOver = async (finalScore)=>{
  if (!playerName){
    showNameModal(async () => { await game.onGameOver(finalScore); });
    return;
  }

  let updated;
  try {
    updated = await remote.upsertScore(playerName, finalScore);
  } catch {
    updated = await storage.upsertScore(playerName, finalScore);
  }

  document.getElementById('banner-title').textContent = 'Game Over';
  document.getElementById('banner-btn').textContent = 'Restart';
  game.overlayIntent = 'restart';
  renderScoreboardIntoBanner(updated, playerName, finalScore);
};

/* -------------------- Pause on blur -------------------- */
window.addEventListener('blur', ()=>{
  game.pause('Paused', 'Click or press a key to resume');
});

/* -------------------- Start -------------------- */
(async function boot(){
  await storage.init();
  if (nameRequired) showNameModal();
  game.hardReset();
  game.start();
  board.focus();
})();

/* ====== Scoreboard rendering ====== */
function renderScoreboardIntoBanner(list, currentName, currentScore){
  const top = list.slice(0, 20);

  const items = top.map((r, i) => {
    const isYou = (r.name === currentName && r.score <= currentScore);
    return `
      <li style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding:2px 0;
        ${isYou ? 'font-weight:700;' : ''}
      ">
        <span>${i + 1}. ${escapeHtml(r.name)}</span>
        <span>${r.score.toLocaleString()}</span>
      </li>`;
  }).join('');

  const block = `
    <div class="scoreboard">
      <div class="scoreboard-head" style="margin:6px 0 4px; font-weight:700;">Leaderboard</div>
      <ol style="list-style:none; margin:8px 0 0 0; padding:0;">
        ${items}
      </ol>
    </div>
  `;

  const sub = document.getElementById('banner-sub');
  sub.innerHTML = `${currentScore.toLocaleString()} pts – Press Restart to try again` + block;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* ====== Name modal helpers ====== */
function createNameOverlay(){
  const container = document.createElement('div');
  container.id = 'name-overlay';
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.background = 'rgba(0,0,0,0.6)';
  container.style.display = 'none';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.zIndex = '1000';

  const box = document.createElement('div');
  box.style.background = '#111';
  box.style.border = '1px solid #333';
  box.style.borderRadius = '12px';
  box.style.padding = '20px 24px';
  box.style.width = 'min(92vw, 420px)';
  box.style.color = '#eee';
  box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)';
  box.innerHTML = `
    <div style="font-size:20px; font-weight:700; margin-bottom:8px;">Enter your name</div>
    <input id="player-name-input" type="text" placeholder="Your name" maxlength="24"
      style="width:94%; padding:10px 12px; border-radius:8px; border:1px solid #444; background:#0d0d0d; color:#fff; outline:none; margin-bottom:12px;">
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button id="save-name-btn" style="padding:10px 14px; border-radius:8px; background:#b027ff; color:#fff; border:none; font-weight:700; cursor:pointer;">Save</button>
    </div>
  `;
  container.appendChild(box);
  
  container.addEventListener('click', (e)=>{
    if(e.target === container){
      container.style.display = 'none';
    }
  });
  
  return { container, box };
}
function showNameModal(afterSave){
  nameOverlay.container.style.display = 'flex';
  const input = document.getElementById('player-name-input');
  const btn = document.getElementById('save-name-btn');
  setTimeout(()=> input && input.focus(), 30);

  function commit(){
    const v = (input.value || '').trim();
    if (!v) return;
    playerName = v;
    setCookie('playerName', v, 3650);
    nameRequired = false;
    nameOverlay.container.style.display = 'none';
    if (afterSave) afterSave();
  }
  btn.onclick = commit;
  input.onkeydown = (e)=>{ if (e.key === 'Enter') commit(); };
}