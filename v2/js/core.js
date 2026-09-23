// Perimeter v2 — game logic (renderer-agnostic).
import { levelSpec, layoutRects, starsFor } from './levels.js';
import { rng } from './themegen.js';

export const ACTIVE = 0, SOLID = 1, TRAIL = 2;
export const NEVER = 1e9;

const DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const DIRS = ['up', 'right', 'down', 'left'];
const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const LONG_SIDE = 112;
const HERO_STEP_MS = 30;
const KILL_PTS = { drifter: 1000, hunter: 1500, splitter: 1200, boss: 5000 };
const POWER_WEIGHTS = [['slow', 30], ['haste', 25], ['shield', 30], ['life', 15]];

let nextId = 1;

export class Game {
  constructor() {
    this.listeners = {};
    this.state = 'title';
    this.t = 0;
    this.level = 1; this.score = 0; this.lives = 3;
    this.enemies = []; this.sparx = []; this.powerup = null;
    this.effects = { slowUntil: 0, hasteUntil: 0, shield: false };
    this.streak = 0;
    this.runSeed = 1;
    this.freezeDirty = true; this.trailDirty = true;
    this.setupGrid(LONG_SIDE, 64);
    this.resetField(false);
    this.spawnHero();
  }

  /* ---------------- events ---------------- */
  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data = {}) {
    (this.listeners[type] || []).forEach(f => f(data));
    (this.listeners['*'] || []).forEach(f => f(type, data));
  }

  /* ---------------- grid ---------------- */
  static gridFor(aspect) {
    if (aspect >= 1) return { w: LONG_SIDE, h: clamp(Math.round(LONG_SIDE / aspect), 56, LONG_SIDE) };
    return { w: clamp(Math.round(LONG_SIDE * aspect), 52, LONG_SIDE), h: LONG_SIDE };
  }
  setupGrid(w, h) {
    this.W = w; this.H = h;
    this.cells = new Uint8Array(w * h);
    this.freezeAt = new Float32Array(w * h).fill(NEVER);
    this.trailAt = new Float32Array(w * h).fill(-1);
    this.emit('grid', { w, h });
  }
  idx(x, y) { return y * this.W + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) { return this.cells[y * this.W + x]; }

  isPerimeter(x, y) {
    if (!this.inside(x, y) || this.get(x, y) !== SOLID) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (this.inside(nx, ny) && this.get(nx, ny) === ACTIVE) return true;
    }
    return false;
  }
  edgeOf(x, y) { // 4-adjacent to open field: the "inner" edge of the perimeter band
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (this.inside(nx, ny) && this.get(nx, ny) === ACTIVE) return true;
    }
    return false;
  }

  resetField(wave = true, layout = 'open', seed = 1) {
    const { W, H } = this;
    this.cells.fill(ACTIVE);
    this.freezeAt.fill(NEVER);
    this.trailAt.fill(-1);
    const ring = [];
    for (let x = 0; x < W; x++) ring.push(this.idx(x, 0));
    for (let y = 1; y < H; y++) ring.push(this.idx(W - 1, y));
    for (let x = W - 2; x >= 0; x--) ring.push(this.idx(x, H - 1));
    for (let y = H - 2; y >= 1; y--) ring.push(this.idx(0, y));
    const start = ring.indexOf(this.idx(Math.floor(W / 2), H - 1));
    const n = ring.length;
    ring.forEach((i, k) => {
      this.cells[i] = SOLID;
      const d = Math.min(Math.abs(k - start), n - Math.abs(k - start));
      this.freezeAt[i] = wave ? this.t + (d / (n / 2)) * 900 : -1e6;
    });
    // Obstacles
    const rects = layoutRects(layout, W, H, seed);
    rects.forEach(([x0, y0, x1, y1], k) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = this.idx(x, y);
        if (this.cells[i] === SOLID) continue;
        this.cells[i] = SOLID;
        this.freezeAt[i] = wave ? this.t + 900 + k * 120 + ((x - x0) + (y - y0)) * 12 : -1e6;
      }
    });
    // Any sealed-off pocket becomes ice too, so there is one open field
    const comps = this.components();
    if (comps.length > 1) {
      let big = 0;
      comps.forEach((c, k) => { if (c.length > comps[big].length) big = k; });
      comps.forEach((c, k) => { if (k !== big) for (const i of c) { this.cells[i] = SOLID; this.freezeAt[i] = wave ? this.t + 1200 : -1e6; } });
    }
    let open = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === ACTIVE) open++;
    this.playable = open;
    this.frozenCount = 0;
    this.freezeDirty = this.trailDirty = true;
    this.emit('field', { wave });
  }

  /* ---------------- flow ---------------- */
  newGame(aspect, seed) {
    this.level = 1; this.score = 0; this.lives = 3; this.streak = 0;
    this.runSeed = seed || ((Math.random() * 1e9) | 0);
    this.startLevel(aspect);
  }

  startLevel(aspect) {
    const g = Game.gridFor(aspect || 16 / 9);
    if (g.w !== this.W || g.h !== this.H) this.setupGrid(g.w, g.h);
    this.spec = levelSpec(this.level);
    this.rand = rng(this.runSeed + this.level * 1013);
    this.resetField(true, this.spec.layout, this.runSeed + this.level);
    this.spawnHero();
    this.effects = { slowUntil: 0, hasteUntil: 0, shield: false };
    this.powerup = null;
    this.nextPowerAt = this.t + 6000 + this.rand() * 4000;
    this.lifeSpawned = false;
    this.spawnEnemies();
    this.sparx = [];
    this.sparxQueue = [];
    for (let k = 0; k < this.spec.sparx; k++) this.sparxQueue.push(this.t + 2600 + k * 900);
    this.clearAt = 0;
    this.goalReached = false;
    this.levelTime = 0;
    this.deaths = 0;
    this.state = 'playing';
    this.emit('level', { level: this.level, spec: this.spec });
  }

  attract(aspect) {
    const g = Game.gridFor(aspect || 16 / 9);
    if (g.w !== this.W || g.h !== this.H) this.setupGrid(g.w, g.h);
    this.level = 1;
    this.spec = levelSpec(4);
    this.rand = rng(7);
    this.resetField(true, 'open', 1);
    const { W, H } = this;
    const rects = [
      [0, 0, Math.round(W * 0.22), Math.round(H * 0.3)],
      [W - Math.round(W * 0.3), H - Math.round(H * 0.26), W, H],
      [Math.round(W * 0.55), 0, Math.round(W * 0.72), Math.round(H * 0.16)],
      [0, Math.round(H * 0.7), Math.round(W * 0.12), H],
    ];
    rects.forEach(([x0, y0, x1, y1], k) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = this.idx(x, y);
        if (this.cells[i] === SOLID) continue;
        this.cells[i] = SOLID;
        this.freezeAt[i] = this.t + 700 + k * 350 + Math.hypot(x - x0, y - y0) * 9;
      }
    });
    this.freezeDirty = true;
    this.spawnHero();
    this.snapHeroToPerimeter();
    this.enemies = [];
    this.enemies.push(this.makeEnemy('drifter'), this.makeEnemy('hunter'), this.makeEnemy('drifter'));
    this.sparx = []; this.sparxQueue = []; this.powerup = null;
    this.state = 'title';
  }

  nextLevel(aspect) {
    this.level++;
    if (this.level % 5 === 1 && this.level > 1) { this.lives++; this.emit('extraLife', {}); }
    this.startLevel(aspect);
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.emit('pause', {}); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.emit('resume', {}); } }

  get capturedPct() { return this.playable ? (100 * this.frozenCount) / this.playable : 0; }
  get multiplier() { return 1 + Math.min(4, this.streak); }
  get slowed() { return this.t < this.effects.slowUntil; }
  get hasted() { return this.t < this.effects.hasteUntil; }

  /* ---------------- hero ---------------- */
  spawnHero() {
    const x = Math.floor(this.W / 2), y = this.H - 1;
    this.hero = {
      x, y, px: x, py: y, dir: 'left', next: null, carving: false,
      cool: HERO_STEP_MS, stepMs: HERO_STEP_MS, trail: [], startX: x, startY: y,
      invulnUntil: 0, moving: false,
    };
  }
  input(dir) { if (DIR[dir]) this.hero.next = dir; }

  heroRenderPos() {
    const h = this.hero;
    const k = this.state === 'playing' ? 1 - clamp(h.cool / h.stepMs, 0, 1) : 1;
    return { x: h.px + (h.x - h.px) * k + 0.5, y: h.py + (h.y - h.py) * k + 0.5 };
  }

  updateHero(dt) {
    const h = this.hero;
    h.stepMs = HERO_STEP_MS / (this.hasted ? 1.45 : 1);
    h.cool -= dt;
    let guard = 0;
    while (h.cool <= 0 && guard++ < 5) {
      h.cool += h.stepMs;
      const r = this.heroStep();
      if (r === 'bite') { this.die('bite'); return; }
      if (r === 'closed') this.capture();
      if (this.state !== 'playing') return;
    }
  }

  heroStep() {
    const h = this.hero;
    let wanted = h.next || h.dir;
    if (h.carving && wanted === OPP[h.dir]) wanted = h.dir;
    h.px = h.x; h.py = h.y;
    if (wanted !== h.dir) {
      const r = this.tryMove(wanted);
      if (r) { h.dir = wanted; h.moving = true; return r; }
    }
    const r = this.tryMove(h.dir);
    h.moving = !!r;
    return r;
  }

  tryMove(dir) {
    const h = this.hero;
    const [dx, dy] = DIR[dir];
    const nx = h.x + dx, ny = h.y + dy;
    if (!this.inside(nx, ny)) return false;
    const tgt = this.get(nx, ny);
    if (!h.carving) {
      if (tgt === ACTIVE) {
        if (!this.isPerimeter(h.x, h.y)) return false;
        h.carving = true; h.trail = []; h.startX = h.x; h.startY = h.y;
        this.emit('carveStart', { x: h.x, y: h.y });
      } else if (tgt === SOLID) {
        if (!this.isPerimeter(nx, ny)) return false;
        h.x = nx; h.y = ny;
        return true;
      } else return false;
    }
    if (tgt === TRAIL) return 'bite';
    h.x = nx; h.y = ny;
    const i = this.idx(nx, ny);
    if (tgt === ACTIVE) {
      this.cells[i] = TRAIL; this.trailAt[i] = this.t;
      h.trail.push(i); this.trailDirty = true;
      return true;
    }
    h.carving = false;
    return 'closed';
  }

  /* ---------------- flood helpers ---------------- */
  components() {
    const { W, H, cells } = this;
    const seen = new Uint8Array(W * H), q = new Int32Array(W * H), comps = [];
    for (let s = 0; s < W * H; s++) {
      if (seen[s] || cells[s] !== ACTIVE) continue;
      let qb = 0, qe = 0; q[qe++] = s; seen[s] = 1;
      const list = [];
      while (qb < qe) {
        const i = q[qb++]; list.push(i);
        const x = i % W, y = (i / W) | 0;
        if (x > 0 && !seen[i - 1] && cells[i - 1] === ACTIVE) { seen[i - 1] = 1; q[qe++] = i - 1; }
        if (x < W - 1 && !seen[i + 1] && cells[i + 1] === ACTIVE) { seen[i + 1] = 1; q[qe++] = i + 1; }
        if (y > 0 && !seen[i - W] && cells[i - W] === ACTIVE) { seen[i - W] = 1; q[qe++] = i - W; }
        if (y < H - 1 && !seen[i + W] && cells[i + W] === ACTIVE) { seen[i + W] = 1; q[qe++] = i + W; }
      }
      comps.push(list);
    }
    return comps;
  }

  waveDistances(sources, mask) {
    const { W, H } = this;
    const dist = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
    let qb = 0, qe = 0, maxd = 0;
    for (const s of sources) { dist[s] = 0; q[qe++] = s; }
    while (qb < qe) {
      const i = q[qb++], d = dist[i] + 1, x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) {
        if (j < 0 || dist[j] >= 0 || !mask[j]) continue;
        dist[j] = d; if (d > maxd) maxd = d; q[qe++] = j;
      }
    }
    return { dist, maxd };
  }

  /* ---------------- capture ---------------- */
  capture() {
    const h = this.hero;
    const trail = h.trail; h.trail = [];
    for (const i of trail) { this.cells[i] = SOLID; this.freezeAt[i] = this.t; this.trailAt[i] = -1; }
    const comps = this.components();
    const mask = new Uint8Array(this.W * this.H);
    let frozen = 0;
    if (comps.length >= 2) {
      let big = 0;
      for (let k = 1; k < comps.length; k++) if (comps[k].length > comps[big].length) big = k;
      comps.forEach((c, k) => { if (k !== big) for (const i of c) { mask[i] = 1; frozen++; } });
    }
    for (const i of trail) mask[i] = 1;
    const { dist, maxd } = this.waveDistances(trail, mask);
    const per = Math.min(7, 750 / Math.max(1, maxd));
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || (this.cells[i] === SOLID && this.freezeAt[i] <= this.t)) continue;
      this.cells[i] = SOLID;
      this.freezeAt[i] = this.t + Math.max(0, dist[i]) * per;
    }
    this.frozenCount += frozen + trail.length;
    this.freezeDirty = this.trailDirty = true;

    // Enemies inside the frozen region
    const mult = this.multiplier;
    const kills = [];
    let bossHit = false;
    for (const e of this.enemies) {
      if (e.state !== 'alive') continue;
      const ci = this.cellIndexOf(e);
      if (mask[ci]) {
        if (e.type === 'boss' && e.hp > 1) {
          e.state = 'encased'; e.freezeAt = this.freezeAt[ci]; e.breakAt = e.freezeAt + 900; e.hp--;
          bossHit = true;
          this.score += KILL_PTS.boss * mult;
          this.emit('bossHit', { e, hp: e.hp, points: KILL_PTS.boss * mult });
          continue;
        }
        e.state = 'frozen'; e.freezeAt = this.freezeAt[ci]; e.shatterAt = e.freezeAt + 420 + kills.length * 90;
        kills.push(e);
      } else if (this.cells[ci] === SOLID) this.nudgeOut(e);
    }
    let killPts = 0;
    kills.forEach(e => { e.points = KILL_PTS[e.type] * kills.length * mult; killPts += e.points; });
    // Power-up inside the frozen region is collected
    if (this.powerup && mask[this.idx(this.powerup.x, this.powerup.y)]) this.collectPowerup();

    const pct = (100 * (frozen + trail.length)) / this.playable;
    const areaPts = Math.round(pct * 100 * (1 + Math.min(1, pct / 20)));
    this.score += areaPts + killPts;
    if (kills.length || bossHit) this.streak++;

    const hp = this.heroRenderPos();
    this.emit('capture', { trail, frozen, pct, kills: kills.length, killPts, areaPts, mult, maxDelay: maxd * per, x: hp.x, y: hp.y, t: this.t });

    if (!this.isPerimeter(h.x, h.y)) this.snapHeroToPerimeter();
    for (const s of this.sparx) if (!this.isPerimeter(s.x, s.y)) this.snapSparx(s);

    this.checkWin();
  }

  checkWin() {
    if (this.clearAt) return;
    const alive = this.enemies.filter(e => e.state === 'alive' || e.state === 'encased');
    if (!alive.length) {
      const last = Math.max(this.t, ...this.enemies.map(e => e.shatterAt || 0));
      this.clearAt = last + 900;
      this.emit('lastKill', {});
      return;
    }
    if (this.capturedPct >= this.spec.goal) {
      // Goal reached: every remaining enemy freezes where it stands
      this.goalReached = true;
      alive.forEach((e, k) => {
        e.state = 'frozen'; e.freezeAt = this.t + 250 + k * 160; e.shatterAt = e.freezeAt + 450;
        e.points = KILL_PTS[e.type]; this.score += e.points;
      });
      this.clearAt = this.t + 250 + alive.length * 160 + 1400;
      this.emit('goalReached', { pct: this.capturedPct });
      this.emit('lastKill', {});
    }
  }

  cellIndexOf(e) { return this.idx(clamp(Math.floor(e.x), 0, this.W - 1), clamp(Math.floor(e.y), 0, this.H - 1)); }

  snapHeroToPerimeter() {
    const h = this.hero; let best = null, bd = 1e9;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!this.isPerimeter(x, y)) continue;
      const d = Math.abs(x - h.x) + Math.abs(y - h.y);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { h.x = h.px = best[0]; h.y = h.py = best[1]; }
  }

  nearestFree(cx, cy, r, maxR = 30) {
    for (let rad = 0; rad < maxR; rad++) {
      let best = null, bd = 1e9;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = cx + dx + 0.5, y = cy + dy + 0.5;
        if (!this.areaFree(x, y, r)) continue;
        const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best) return best;
    }
    return null;
  }
  nudgeOut(e) {
    const p = this.nearestFree(Math.floor(e.x), Math.floor(e.y), Math.min(e.r, 1), 14);
    if (p) { e.x = p[0]; e.y = p[1]; }
  }

  /* ---------------- level clear ---------------- */
  levelClear() {
    this.state = 'clear';
    const h = this.hero;
    const mask = new Uint8Array(this.W * this.H);
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (this.cells[i] === ACTIVE) { mask[i] = 1; n++; }
    const src = [this.idx(h.x, h.y)]; mask[src[0]] = 1;
    const { dist, maxd } = this.waveDistances(src, mask);
    const per = Math.min(6, 1300 / Math.max(1, maxd));
    for (let i = 0; i < mask.length; i++) if (mask[i] && this.cells[i] === ACTIVE) {
      this.cells[i] = SOLID; this.freezeAt[i] = this.t + Math.max(0, dist[i]) * per;
    }
    this.freezeDirty = true;
    this.sparx.forEach(s => this.emit('sparxDie', { s }));
    this.sparx = [];
    const secs = this.levelTime / 1000;
    const breakdown = {
      clear: 1000 * this.level,
      time: Math.max(0, Math.round((this.spec.par - secs) * 50)),
      overGoal: Math.max(0, Math.round((this.capturedPct - this.spec.goal) * 200)),
      lives: this.deaths === 0 ? 1500 : 0,
    };
    const bonus = breakdown.clear + breakdown.time + breakdown.overGoal + breakdown.lives;
    this.score += bonus;
    const stars = starsFor(this.deaths, secs, this.spec.par);
    this.emit('clear', { level: this.level, bonus, breakdown, stars, seconds: secs, pct: this.capturedPct, remaining: n, duration: maxd * per });
  }

  /* ---------------- enemies ---------------- */
  spawnEnemies() {
    const S = this.spec;
    this.enemies = [];
    const add = (type, n) => { for (let k = 0; k < n; k++) this.enemies.push(this.makeEnemy(type)); };
    add('drifter', S.drifters); add('hunter', S.hunters); add('splitter', S.splitters);
    if (S.boss) this.enemies.push(this.makeEnemy('boss'));
  }

  makeEnemy(type, at) {
    const S = this.spec || levelSpec(1);
    const R = this.rand || Math.random;
    const base = (10 + S.level * 0.5) * S.speed;
    const cfg = {
      drifter: { r: 1.25, speed: base * (1 + R() * 0.3) },
      hunter: { r: 1.15, speed: base * 1.12 },
      splitter: { r: 1.45, speed: base * 0.9 },
      boss: { r: 2.4, speed: base * 1.2 },
      mini: { r: 0.95, speed: base * 1.2 },
    }[type];
    const h = this.hero;
    let x = 0, y = 0;
    if (at) { x = at[0]; y = at[1]; } else {
      for (let tries = 0; tries < 300; tries++) {
        x = 6 + R() * (this.W - 12); y = 6 + R() * (this.H - 12);
        const d = Math.hypot(x - h.x, y - h.y);
        if (d > Math.min(this.W, this.H) * 0.4 && this.areaFree(x, y, cfg.r + 1) && !this.enemies.some(o => Math.hypot(o.x - x, o.y - y) < 8)) break;
      }
    }
    let a = R() * Math.PI * 2;
    const snap = Math.PI / 4;
    a = Math.round(a / snap) * snap + (R() - 0.5) * 0.6;
    if (Math.abs(Math.cos(a)) < 0.3 || Math.abs(Math.sin(a)) < 0.3) a += 0.6;
    const e = {
      id: nextId++, type: type === 'mini' ? 'drifter' : type, x, y, vx: Math.cos(a), vy: Math.sin(a),
      speed: cfg.speed, r: cfg.r, boss: type === 'boss', state: 'alive', freezeAt: 0, shatterAt: 0, seed: R(),
    };
    if (type === 'splitter') e.splitAt = this.t + 8000 + R() * 3000;
    if (type === 'boss') { e.hp = S.bossHp; e.maxHp = S.bossHp; }
    if (type === 'hunter') e.hunting = false;
    return e;
  }

  areaFree(x, y, r) {
    for (let yy = Math.floor(y - r); yy <= Math.floor(y + r); yy++)
      for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++)
        if (!this.inside(xx, yy) || this.get(xx, yy) !== ACTIVE) return false;
    return true;
  }
  solidAt(px, py) {
    const x = Math.floor(px), y = Math.floor(py);
    if (!this.inside(x, y)) return true;
    return this.cells[y * this.W + x] === SOLID;
  }

  updateEnemies(dt, collide) {
    const slow = this.slowed ? 0.45 : 1;
    const born = [];
    for (const e of this.enemies) {
      if (e.state === 'frozen') {
        if (this.t >= e.shatterAt) { e.state = 'dead'; this.emit('shatter', { e }); }
        continue;
      }
      if (e.state === 'encased') {
        if (this.t >= e.breakAt) this.bossBreakOut(e, born);
        continue;
      }
      if (e.state !== 'alive') continue;

      // Hunters steer toward the hero while a line is being drawn
      if (e.type === 'hunter') {
        e.hunting = this.hero.carving && this.state === 'playing';
        if (e.hunting) {
          const hp = this.heroRenderPos();
          const want = Math.atan2(hp.y - e.y, hp.x - e.x);
          const cur = Math.atan2(e.vy, e.vx);
          let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const turn = clamp(d, -1.9 * dt / 1000, 1.9 * dt / 1000);
          e.vx = Math.cos(cur + turn); e.vy = Math.sin(cur + turn);
        }
      }
      if (e.type === 'splitter' && this.t >= e.splitAt && this.state === 'playing') { this.split(e, born); continue; }

      const spd = e.speed * slow * (e.hunting ? 1.25 : 1);
      const dist = (spd * dt) / 1000;
      const steps = Math.max(1, Math.ceil(dist / 0.35));
      const s = dist / steps;
      for (let k = 0; k < steps; k++) {
        const r = e.r * 0.92;
        const nx = e.x + e.vx * s, sx = Math.sign(e.vx) * r;
        if (this.solidAt(nx + sx, e.y) || this.solidAt(nx + sx, e.y - r * 0.7) || this.solidAt(nx + sx, e.y + r * 0.7)) { e.vx = -e.vx; this.emit('bounce', { e }); }
        else e.x = nx;
        const ny = e.y + e.vy * s, sy = Math.sign(e.vy) * r;
        if (this.solidAt(e.x, ny + sy) || this.solidAt(e.x - r * 0.7, ny + sy) || this.solidAt(e.x + r * 0.7, ny + sy)) { e.vy = -e.vy; this.emit('bounce', { e }); }
        else e.y = ny;
      }
      if (!e.hunting && Math.random() < dt * 0.0004) {
        const a = Math.atan2(e.vy, e.vx) + (Math.random() - 0.5) * 0.5;
        e.vx = Math.cos(a); e.vy = Math.sin(a);
      }
      if (Math.abs(e.vx) < 0.25) e.vx = Math.sign(e.vx || 1) * 0.25;
      if (Math.abs(e.vy) < 0.25) e.vy = Math.sign(e.vy || 1) * 0.25;
      const n = Math.hypot(e.vx, e.vy); e.vx /= n; e.vy /= n;
      if (collide && this.hitsHero(e)) {
        if (this.absorbHit(e)) continue;
        this.die('hit', e); return;
      }
    }
    if (born.length) this.enemies.push(...born);
    this.enemies = this.enemies.filter(e => e.state !== 'dead' && e.state !== 'gone');
  }

  split(e, born) {
    e.state = 'gone';
    const a = Math.atan2(e.vy, e.vx);
    for (const s of [-1, 1]) {
      const m = this.makeEnemy('mini', [e.x + Math.cos(a + s * Math.PI / 2) * 0.8, e.y + Math.sin(a + s * Math.PI / 2) * 0.8]);
      m.vx = Math.cos(a + s * 0.9); m.vy = Math.sin(a + s * 0.9);
      if (!this.areaFree(m.x, m.y, 0.3)) { m.x = e.x; m.y = e.y; }
      born.push(m);
    }
    this.emit('split', { e });
  }

  bossBreakOut(e, born) {
    const p = this.nearestFree(Math.floor(e.x), Math.floor(e.y), e.r * 0.85, 40);
    if (!p) { e.state = 'frozen'; e.shatterAt = this.t; e.points = KILL_PTS.boss; return; }
    const from = { x: e.x, y: e.y };
    e.x = p[0]; e.y = p[1];
    e.r *= 0.85; e.speed *= 1.12; e.state = 'alive';
    const minion = this.makeEnemy('mini', [e.x, e.y]);
    born.push(minion);
    this.emit('bossBreak', { e, from, hp: e.hp });
  }

  hitsHero(e) {
    const h = this.hero;
    if (!h.carving || this.t < h.invulnUntil) return false;
    const hp = this.heroRenderPos();
    if (Math.hypot(hp.x - e.x, hp.y - e.y) < e.r * 0.85 + 0.45) return true;
    const r = e.r * 0.85;
    for (let y = Math.floor(e.y - r); y <= Math.floor(e.y + r); y++)
      for (let x = Math.floor(e.x - r); x <= Math.floor(e.x + r); x++) {
        if (!this.inside(x, y) || this.get(x, y) !== TRAIL) continue;
        const cx = clamp(e.x, x, x + 1), cy = clamp(e.y, y, y + 1);
        if ((cx - e.x) ** 2 + (cy - e.y) ** 2 < r * r) return true;
      }
    return false;
  }

  absorbHit(e) {
    if (!this.effects.shield) return false;
    this.effects.shield = false;
    this.hero.invulnUntil = this.t + 1300;
    if (e) { e.vx = -e.vx; e.vy = -e.vy; }
    const hp = this.heroRenderPos();
    this.emit('shieldBreak', { x: hp.x, y: hp.y });
    return true;
  }

  /* ---------------- sparx (perimeter crawlers) ---------------- */
  spawnSparx() {
    const k = this.sparx.length;
    const x = k % 2 === 0 ? Math.floor(this.W / 2) : Math.floor(this.W / 3);
    const s = { id: nextId++, x, y: 0, px: x, py: 0, dir: k % 2 ? 'left' : 'right', cool: 0, stepMs: Math.max(34, 58 - this.level * 1.2), hist: [] };
    if (!this.isPerimeter(s.x, s.y)) this.snapSparx(s);
    this.sparx.push(s);
    this.emit('sparxSpawn', { s });
  }

  snapSparx(s) {
    let best = null, bd = 1e9;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!this.isPerimeter(x, y)) continue;
      const d = Math.abs(x - s.x) + Math.abs(y - s.y);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { s.x = s.px = best[0]; s.y = s.py = best[1]; s.hist = []; }
  }

  sparxRenderPos(s) {
    const k = 1 - clamp(s.cool / s.stepMs, 0, 1);
    return { x: s.px + (s.x - s.px) * k + 0.5, y: s.py + (s.y - s.py) * k + 0.5 };
  }

  stepSparx(s) {
    s.px = s.x; s.py = s.y;
    const di = DIRS.indexOf(s.dir);
    const order = [0, 1, 3, 2].map(o => DIRS[(di + o) % 4]); // straight, right, left, back
    let best = null, bestScore = -1e9;
    order.forEach((d, rank) => {
      const [dx, dy] = DIR[d];
      const nx = s.x + dx, ny = s.y + dy;
      if (!this.isPerimeter(nx, ny)) return;
      let score = 0;
      if (this.edgeOf(nx, ny)) score += 4;
      if (rank === 0) score += 1.5;
      if (rank === 3) score -= 6;
      if (s.hist.includes(this.idx(nx, ny))) score -= 5;
      if (score > bestScore) { bestScore = score; best = [d, nx, ny]; }
    });
    if (!best) { this.snapSparx(s); return; }
    s.dir = best[0]; s.x = best[1]; s.y = best[2];
    s.hist.push(this.idx(s.x, s.y)); if (s.hist.length > 8) s.hist.shift();
  }

  updateSparx(dt, collide) {
    while (this.sparxQueue.length && this.t >= this.sparxQueue[0]) { this.sparxQueue.shift(); this.spawnSparx(); }
    const slow = this.slowed ? 0.45 : 1;
    for (const s of this.sparx) {
      s.cool -= dt * slow;
      let g = 0;
      while (s.cool <= 0 && g++ < 4) { s.cool += s.stepMs; this.stepSparx(s); }
      if (!collide || this.t < this.hero.invulnUntil) continue;
      const a = this.sparxRenderPos(s), b = this.heroRenderPos();
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1.05) {
        if (this.absorbHit(null)) { s.dir = OPP[s.dir]; s.hist = []; continue; }
        this.die('sparx'); return;
      }
    }
  }

  /* ---------------- power-ups ---------------- */
  updatePowerups() {
    if (this.powerup && this.t >= this.powerup.expireAt) { this.emit('powerExpire', { p: this.powerup }); this.powerup = null; this.nextPowerAt = this.t + 5000 + this.rand() * 5000; }
    if (!this.powerup && this.t >= this.nextPowerAt) this.spawnPowerup();
    if (this.powerup && this.state === 'playing') {
      const hp = this.heroRenderPos();
      if (Math.hypot(hp.x - (this.powerup.x + 0.5), hp.y - (this.powerup.y + 0.5)) < 1.6) this.collectPowerup();
    }
  }
  spawnPowerup() {
    const pool = POWER_WEIGHTS.filter(([t]) => t !== 'life' || (!this.lifeSpawned && this.lives < 5));
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let roll = this.rand() * total, type = pool[0][0];
    for (const [t, w] of pool) { if ((roll -= w) <= 0) { type = t; break; } }
    for (let tries = 0; tries < 200; tries++) {
      const x = 6 + Math.floor(this.rand() * (this.W - 12)), y = 6 + Math.floor(this.rand() * (this.H - 12));
      if (!this.areaFree(x + 0.5, y + 0.5, 1.5)) continue;
      if (this.enemies.some(e => Math.hypot(e.x - x, e.y - y) < 6)) continue;
      if (type === 'life') this.lifeSpawned = true;
      this.powerup = { type, x, y, spawnAt: this.t, expireAt: this.t + 12000 };
      this.emit('powerSpawn', { p: this.powerup });
      return;
    }
    this.nextPowerAt = this.t + 3000;
  }
  collectPowerup() {
    const p = this.powerup; if (!p) return;
    this.powerup = null;
    this.nextPowerAt = this.t + 8000 + this.rand() * 5000;
    if (p.type === 'slow') this.effects.slowUntil = this.t + 7000;
    if (p.type === 'haste') this.effects.hasteUntil = this.t + 7000;
    if (p.type === 'shield') this.effects.shield = true;
    if (p.type === 'life') { this.lives++; this.emit('extraLife', {}); }
    this.emit('powerup', { p });
  }

  /* ---------------- death ---------------- */
  die(reason, enemy) {
    const h = this.hero;
    const trail = h.trail.slice();
    for (const i of trail) { this.cells[i] = ACTIVE; this.trailAt[i] = -1; }
    this.trailDirty = true;
    h.trail = [];
    const hp = this.heroRenderPos();
    this.lives--; this.deaths++;
    this.streak = 0;
    this.effects.hasteUntil = 0;
    this.state = 'dying';
    this.dyingUntil = this.t + 1100;
    this.emit('death', { reason, trail, x: hp.x, y: hp.y, lives: this.lives, enemy });
    h.carving = false;
    h.x = h.px = h.startX; h.y = h.py = h.startY;
    h.next = null;
    if (!this.isPerimeter(h.x, h.y)) this.snapHeroToPerimeter();
    // keep sparx from camping the respawn point
    for (const s of this.sparx) if (Math.abs(s.x - h.x) + Math.abs(s.y - h.y) < 12) { s.dir = OPP[s.dir]; s.hist = []; }
  }

  /* ---------------- tick ---------------- */
  update(dt) {
    if (this.state === 'paused' || this.state === 'gameover') return;
    this.t += dt;
    if (this.state === 'title') { this.updateEnemies(dt, false); return; }
    if (this.state === 'dying') {
      this.updateEnemies(dt, false);
      this.updateSparx(dt, false);
      if (this.t >= this.dyingUntil) {
        if (this.lives <= 0) { this.state = 'gameover'; this.emit('gameover', { score: this.score, level: this.level }); }
        else { this.state = 'playing'; this.hero.invulnUntil = this.t + 1500; this.emit('respawn', {}); }
      }
      return;
    }
    if (this.state === 'clear') { this.updateEnemies(dt, false); return; }
    this.levelTime += dt;
    this.updateHero(dt);
    if (this.state !== 'playing') return;
    this.updateEnemies(dt, !this.clearAt);
    if (this.state !== 'playing') return;
    this.updateSparx(dt, !this.clearAt);
    if (this.state !== 'playing') return;
    this.updatePowerups();
    if (this.clearAt && this.t >= this.clearAt) { this.clearAt = 0; this.levelClear(); }
  }
}
