// Perimeter — game logic (renderer-agnostic).
// Grid cell states
export const ACTIVE = 0, SOLID = 1, TRAIL = 2;
export const NEVER = 1e9;

const DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const LONG_SIDE = 112;
const HERO_STEP_MS = 30;
const GROW_MS = 700; // visual grow time — used to time enemy freeze

let nextEnemyId = 1;

export class Game {
  constructor() {
    this.listeners = {};
    this.state = 'title';      // title | playing | dying | paused | clear | gameover
    this.t = 0;                // game clock, ms (can be slowed by renderer FX)
    this.level = 1;
    this.score = 0;
    this.lives = 3;
    this.enemies = [];
    this.hero = null;
    this.streak = 0;
    this.freezeDirty = true;
    this.trailDirty = true;
    this.setupGrid(LONG_SIDE, 64);
    this.resetField(false);
    this.spawnHero();
    this.spawnEnemies();
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

  resetField(wave = true) {
    const { W, H } = this;
    this.cells.fill(ACTIVE);
    this.freezeAt.fill(NEVER);
    this.trailAt.fill(-1);
    // Border ring, frozen with a wave spreading from the hero's spawn point
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
    this.playable = W * H - n;
    this.frozenCount = 0;
    this.freezeDirty = this.trailDirty = true;
    this.emit('field', { wave });
  }

  /* ---------------- game flow ---------------- */
  newGame(aspect) {
    this.level = 1; this.score = 0; this.lives = 3; this.streak = 0;
    this.startLevel(aspect);
  }

  startLevel(aspect) {
    const g = Game.gridFor(aspect || 16 / 9);
    if (g.w !== this.W || g.h !== this.H) this.setupGrid(g.w, g.h);
    this.resetField(true);
    this.spawnHero();
    this.spawnEnemies();
    this.clearAt = 0;
    this.state = 'playing';
    this.emit('level', { level: this.level });
  }

  // Title-screen attract mode: pre-frozen ice shelves so the look is visible immediately
  attract(aspect) {
    const g = Game.gridFor(aspect || 16 / 9);
    if (g.w !== this.W || g.h !== this.H) this.setupGrid(g.w, g.h);
    this.level = 1;
    this.resetField(true);
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
        const d = Math.min(Math.abs(x - x0), Math.abs(x - x1), Math.abs(y - y0), Math.abs(y - y1));
        this.freezeAt[i] = this.t + 700 + k * 350 + (Math.hypot(x - x0, y - y0) * 9);
      }
    });
    this.freezeDirty = true;
    this.spawnHero();
    this.snapHeroToPerimeter();
    this.spawnEnemies();
    this.state = 'title';
  }

  nextLevel(aspect) {
    this.level++;
    if (this.level % 5 === 0) { this.lives++; this.emit('extraLife', {}); }
    this.startLevel(aspect);
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.emit('pause', {}); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.emit('resume', {}); } }

  get capturedPct() { return this.playable ? (100 * this.frozenCount) / this.playable : 0; }

  /* ---------------- hero ---------------- */
  spawnHero() {
    const x = Math.floor(this.W / 2), y = this.H - 1;
    this.hero = {
      x, y, px: x, py: y, dir: 'left', next: null, carving: false,
      cool: HERO_STEP_MS, stepMs: HERO_STEP_MS, trail: [], startX: x, startY: y,
      invulnUntil: 0, moving: false,
    };
  }

  input(dir) {
    if (!DIR[dir]) return;
    this.hero.next = dir;
  }

  heroRenderPos() {
    const h = this.hero;
    const k = this.state === 'playing' ? 1 - clamp(h.cool / h.stepMs, 0, 1) : 1;
    return { x: h.px + (h.x - h.px) * k + 0.5, y: h.py + (h.y - h.py) * k + 0.5 };
  }

  updateHero(dt) {
    const h = this.hero;
    h.cool -= dt;
    let guard = 0;
    while (h.cool <= 0 && guard++ < 4) {
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
      this.cells[i] = TRAIL;
      this.trailAt[i] = this.t;
      h.trail.push(i);
      this.trailDirty = true;
      return true;
    }
    h.carving = false;
    return 'closed';
  }

  /* ---------------- capture ---------------- */
  components() {
    const { W, H, cells } = this;
    const seen = new Uint8Array(W * H);
    const q = new Int32Array(W * H);
    const comps = [];
    for (let s = 0; s < W * H; s++) {
      if (seen[s] || cells[s] !== ACTIVE) continue;
      let qb = 0, qe = 0; q[qe++] = s; seen[s] = 1;
      const list = [];
      while (qb < qe) {
        const i = q[qb++]; list.push(i);
        const x = i % W, y = (i / W) | 0;
        if (x > 0) { const j = i - 1; if (!seen[j] && cells[j] === ACTIVE) { seen[j] = 1; q[qe++] = j; } }
        if (x < W - 1) { const j = i + 1; if (!seen[j] && cells[j] === ACTIVE) { seen[j] = 1; q[qe++] = j; } }
        if (y > 0) { const j = i - W; if (!seen[j] && cells[j] === ACTIVE) { seen[j] = 1; q[qe++] = j; } }
        if (y < H - 1) { const j = i + W; if (!seen[j] && cells[j] === ACTIVE) { seen[j] = 1; q[qe++] = j; } }
      }
      comps.push(list);
    }
    return comps;
  }

  // BFS distance from `sources` restricted to cells where mask[i]===1
  waveDistances(sources, mask) {
    const { W, H } = this;
    const dist = new Int32Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let qb = 0, qe = 0;
    for (const s of sources) { dist[s] = 0; q[qe++] = s; }
    let maxd = 0;
    while (qb < qe) {
      const i = q[qb++]; const d = dist[i] + 1;
      const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) {
        if (j < 0 || dist[j] >= 0 || !mask[j]) continue;
        dist[j] = d; if (d > maxd) maxd = d; q[qe++] = j;
      }
    }
    return { dist, maxd };
  }

  capture() {
    const h = this.hero;
    const trail = h.trail; h.trail = [];
    for (const i of trail) { this.cells[i] = SOLID; this.freezeAt[i] = this.t; this.trailAt[i] = -1; }

    const comps = this.components();
    const mask = new Uint8Array(this.W * this.H);
    let frozen = 0;
    if (comps.length >= 2) {
      // Keep the largest region, freeze everything else
      let big = 0;
      for (let k = 1; k < comps.length; k++) if (comps[k].length > comps[big].length) big = k;
      comps.forEach((c, k) => { if (k !== big) for (const i of c) { mask[i] = 1; frozen++; } });
    }
    const srcs = trail.slice();
    for (const i of trail) mask[i] = 1;
    const { dist, maxd } = this.waveDistances(srcs, mask);
    const per = Math.min(7, 750 / Math.max(1, maxd));
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || this.cells[i] === SOLID && this.freezeAt[i] <= this.t) continue;
      this.cells[i] = SOLID;
      this.freezeAt[i] = this.t + Math.max(0, dist[i]) * per;
    }
    this.frozenCount += frozen + trail.length;
    this.freezeDirty = this.trailDirty = true;

    // Enemies caught inside the frozen region
    const kills = [];
    for (const e of this.enemies) {
      if (e.state !== 'alive') continue;
      const ci = this.idx(clamp(Math.floor(e.x), 0, this.W - 1), clamp(Math.floor(e.y), 0, this.H - 1));
      if (mask[ci]) {
        e.state = 'frozen';
        e.freezeAt = this.freezeAt[ci];
        e.shatterAt = e.freezeAt + 420 + kills.length * 90;
        kills.push(e);
      } else if (this.cells[ci] === SOLID) {
        this.nudgeOut(e);
      }
    }

    const pct = (100 * (frozen + trail.length)) / this.playable;
    const areaPts = Math.round(pct * 100);
    let killPts = 0;
    kills.forEach(e => { e.points = (e.boss ? 5000 : 1000) * kills.length; killPts += e.points; });
    if (kills.length) this.streak++;
    this.score += areaPts + killPts;

    const hp = this.heroRenderPos();
    this.emit('capture', { trail, frozen, pct, kills: kills.length, killPts, areaPts, maxDelay: maxd * per, x: hp.x, y: hp.y, t: this.t, boss: kills.some(e => e.boss) });

    // Hero must stand on a walkable perimeter cell
    if (!this.isPerimeter(h.x, h.y)) this.snapHeroToPerimeter();

    if (!this.enemies.some(e => e.state === 'alive')) {
      const lastShatter = Math.max(...this.enemies.map(e => e.shatterAt || 0), this.t);
      this.clearAt = lastShatter + 900;
      this.emit('lastKill', {});
    }
  }

  snapHeroToPerimeter() {
    const h = this.hero; let best = null, bd = 1e9;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!this.isPerimeter(x, y)) continue;
      const d = Math.abs(x - h.x) + Math.abs(y - h.y);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { h.x = h.px = best[0]; h.y = h.py = best[1]; }
  }

  nudgeOut(e) {
    let best = null, bd = 1e9;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    for (let r = 1; r < 12 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!this.inside(x, y) || this.get(x, y) !== ACTIVE) continue;
      const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
    }
    if (best) { e.x = best[0]; e.y = best[1]; }
  }

  /* ---------------- level clear ---------------- */
  levelClear() {
    this.state = 'clear';
    const h = this.hero;
    const mask = new Uint8Array(this.W * this.H);
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (this.cells[i] === ACTIVE) { mask[i] = 1; n++; }
    const src = [this.idx(h.x, h.y)];
    mask[src[0]] = 1;
    const { dist, maxd } = this.waveDistances(src, mask);
    const per = Math.min(6, 1300 / Math.max(1, maxd));
    for (let i = 0; i < mask.length; i++) if (mask[i] && this.cells[i] === ACTIVE) {
      this.cells[i] = SOLID; this.freezeAt[i] = this.t + Math.max(0, dist[i]) * per;
    }
    this.freezeDirty = true;
    const bonus = 1000 * this.level + this.lives * 500;
    this.score += bonus;
    this.emit('clear', { level: this.level, bonus, remaining: n, duration: maxd * per });
  }

  /* ---------------- enemies ---------------- */
  spawnEnemies() {
    this.enemies = [];
    const count = 2 + Math.floor((this.level - 1) / 2);
    const boss = this.level % 3 === 0;
    const base = 10 + this.level * 0.9;
    for (let k = 0; k < count + (boss ? 1 : 0); k++) {
      const isBoss = boss && k === count;
      this.enemies.push(this.makeEnemy(isBoss ? base * 1.35 : base * (1 + Math.random() * 0.3), isBoss));
    }
  }

  makeEnemy(speed, boss) {
    const r = boss ? 2.2 : 1.25;
    const h = this.hero;
    let x = 0, y = 0;
    for (let tries = 0; tries < 200; tries++) {
      x = 6 + Math.random() * (this.W - 12);
      y = 6 + Math.random() * (this.H - 12);
      const d = Math.hypot(x - h.x, y - h.y);
      if (d > Math.min(this.W, this.H) * 0.4 && this.areaFree(x, y, r + 1) && !this.enemies.some(o => Math.hypot(o.x - x, o.y - y) < 8)) break;
    }
    let a = Math.random() * Math.PI * 2;
    // avoid near-axis angles (boring bounces)
    const snap = (Math.PI / 4);
    a = Math.round(a / snap) * snap + (Math.random() - 0.5) * 0.6;
    if (Math.abs(Math.cos(a)) < 0.3 || Math.abs(Math.sin(a)) < 0.3) a += 0.6;
    return { id: nextEnemyId++, x, y, vx: Math.cos(a), vy: Math.sin(a), speed, r, boss, state: 'alive', freezeAt: 0, shatterAt: 0, seed: Math.random() };
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
    for (const e of this.enemies) {
      if (e.state === 'frozen') {
        if (this.t >= e.shatterAt) { e.state = 'dead'; this.emit('shatter', { e }); }
        continue;
      }
      if (e.state !== 'alive') continue;
      const dist = (e.speed * dt) / 1000;
      const steps = Math.max(1, Math.ceil(dist / 0.35));
      const s = dist / steps;
      for (let k = 0; k < steps; k++) {
        const r = e.r * 0.92;
        const nx = e.x + e.vx * s;
        const sx = Math.sign(e.vx) * r;
        if (this.solidAt(nx + sx, e.y) || this.solidAt(nx + sx, e.y - r * 0.7) || this.solidAt(nx + sx, e.y + r * 0.7)) {
          e.vx = -e.vx; this.emit('bounce', { e });
        } else e.x = nx;
        const ny = e.y + e.vy * s;
        const sy = Math.sign(e.vy) * r;
        if (this.solidAt(e.x, ny + sy) || this.solidAt(e.x - r * 0.7, ny + sy) || this.solidAt(e.x + r * 0.7, ny + sy)) {
          e.vy = -e.vy; this.emit('bounce', { e });
        } else e.y = ny;
      }
      // gentle drift so paths never loop forever
      if (Math.random() < dt * 0.0004) {
        const a = Math.atan2(e.vy, e.vx) + (Math.random() - 0.5) * 0.5;
        e.vx = Math.cos(a); e.vy = Math.sin(a);
        if (Math.abs(e.vx) < 0.3) e.vx = Math.sign(e.vx || 1) * 0.3;
        if (Math.abs(e.vy) < 0.3) e.vy = Math.sign(e.vy || 1) * 0.3;
      }
      if (collide && this.hitsHero(e)) { this.die('hit', e); return; }
    }
    this.enemies = this.enemies.filter(e => e.state !== 'dead');
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

  /* ---------------- death ---------------- */
  die(reason, enemy) {
    const h = this.hero;
    const trail = h.trail.slice();
    for (const i of trail) { this.cells[i] = ACTIVE; this.trailAt[i] = -1; }
    this.trailDirty = true;
    h.trail = [];
    const hp = this.heroRenderPos();
    this.lives--;
    this.streak = 0;
    this.state = 'dying';
    this.dyingUntil = this.t + 1100;
    this.emit('death', { reason, trail, x: hp.x, y: hp.y, lives: this.lives, enemy });
    h.carving = false;
    h.x = h.px = h.startX; h.y = h.py = h.startY;
    h.next = null;
    if (!this.isPerimeter(h.x, h.y)) this.snapHeroToPerimeter();
  }

  /* ---------------- tick ---------------- */
  update(dt) {
    if (this.state === 'paused' || this.state === 'gameover') return;
    this.t += dt;
    if (this.state === 'title') { this.updateEnemies(dt, false); return; }
    if (this.state === 'dying') {
      this.updateEnemies(dt, false);
      if (this.t >= this.dyingUntil) {
        if (this.lives <= 0) { this.state = 'gameover'; this.emit('gameover', { score: this.score, level: this.level }); }
        else { this.state = 'playing'; this.hero.invulnUntil = this.t + 1500; this.emit('respawn', {}); }
      }
      return;
    }
    if (this.state === 'clear') { return; }
    // playing
    this.updateHero(dt);
    if (this.state !== 'playing') return;
    this.updateEnemies(dt, true);
    if (this.clearAt && this.t >= this.clearAt && this.state === 'playing') { this.clearAt = 0; this.levelClear(); }
  }
}

export const CONFIG = { GROW_MS };
