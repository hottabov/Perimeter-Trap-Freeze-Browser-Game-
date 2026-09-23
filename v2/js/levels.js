// Level design: enemy mix, obstacles and goals. Deterministic per (level, runSeed).
import { rng } from './themegen.js';

export const GOAL_BASE = 90;

export const JOURNEY = 9;      // levels 1-9: the nine hand-made worlds; clearing 9 finishes the journey
export const HARDEN_MS = 12000; // player ice sets hard this long after it freezes

export function isBoss(L) { return L === 5 || L === JOURNEY || (L > JOURNEY + 1 && L % 5 === 0); }

export function levelSpec(level) {
  const L = level;
  const endless = Math.max(0, L - JOURNEY);
  const spec = {
    level: L,
    drifters: 2 + (L >= 6 ? 1 : 0) + Math.floor(endless / 3),
    hunters: L >= 3 ? 1 + (L >= 8 ? 1 : 0) + Math.floor(endless / 5) : 0,
    splitters: L >= 4 ? 1 + (L >= 12 ? 1 : 0) : 0,
    sparx: L >= 2 ? 1 + (L >= 8 ? 1 : 0) + (L >= 16 ? 1 : 0) : 0,
    boss: isBoss(L),
    bossHp: L === JOURNEY ? 4 : 3 + Math.floor(L / 12),
    speed: Math.min(1.55, 1 + (L - 1) * 0.035),
    goal: GOAL_BASE,
    shape: shapeFor(L),
    layout: layoutFor(L),
    par: 70 + L * 9, // seconds for the time star
  };
  // Shaped arenas keep to layouts that sit well inside them
  if (spec.shape !== 'rect' && !SHAPE_LAYOUTS.includes(spec.layout)) spec.layout = SHAPE_LAYOUTS[L % SHAPE_LAYOUTS.length];
  if (spec.shape === 'donut' && spec.layout === 'pillars') spec.layout = 'open';
  // Small arenas get one drifter less so they don't feel crowded
  if (SMALL_SHAPES.includes(spec.shape)) spec.drifters = Math.max(1, spec.drifters - 1);
  // Boss levels are about the boss
  if (spec.boss) { spec.drifters = Math.max(1, spec.drifters - 2); spec.hunters = Math.max(0, spec.hunters - 1); spec.splitters = 0; }
  // Cap the total so the field never gets unreadable
  const total = () => spec.drifters + spec.hunters + spec.splitters;
  while (total() > 6) { if (spec.drifters > 2) spec.drifters--; else if (spec.splitters) spec.splitters--; else spec.hunters--; }
  return spec;
}

/* ---------- arena shapes ---------- */
// Arenas are rectilinear so the hero can walk every edge with the four arrow keys.
const SHAPE_CYCLE = ['octagon', 'L', 'plus', 'U', 'rect', 'donut', 'T', 'Z', 'H', 'rect', 'steps', 'ring2'];
const SHAPE_LAYOUTS = ['open', 'pillars', 'islands', 'open'];
const SMALL_SHAPES = ['L', 'plus', 'T', 'Z'];
export const SHAPE_NAMES = {
  rect: 'Open field', octagon: 'Octagon', L: 'Corner', plus: 'Cross', U: 'Horseshoe', donut: 'Ring',
  T: 'Anvil', Z: 'Zigzag', H: 'Twin halls', steps: 'Terraces', ring2: 'Twin pools',
};
function shapeFor(L) {
  if (L <= 2) return 'rect';
  return SHAPE_CYCLE[(L - 3) % SHAPE_CYCLE.length];
}

// Returns a Uint8Array with 1 for every cell that is open field at the start of the level.
// Everything else becomes the arena wall (the band next to the field) or empty void.
export function shapeMask(kind, W, H, seed) {
  const r = rng(seed * 7 + 3);
  const m = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) m[y * W + x] = 1;
  const iw = W - 2, ih = H - 2;
  const flipX = r() < 0.5, flipY = r() < 0.5;
  // cut a rectangle given in fractions of the inner field (after optional mirroring)
  const cut = (fx0, fy0, fx1, fy1) => {
    if (flipX) [fx0, fx1] = [1 - fx1, 1 - fx0];
    if (flipY) [fy0, fy1] = [1 - fy1, 1 - fy0];
    const x0 = 1 + Math.round(fx0 * iw), x1 = 1 + Math.round(fx1 * iw);
    const y0 = 1 + Math.round(fy0 * ih), y1 = 1 + Math.round(fy1 * ih);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) m[y * W + x] = 0;
  };
  // staircase corner: n steps of s cells
  const stairs = (n, s) => {
    for (let k = 1; k <= n; k++) {
      const w = (n + 1 - k) * s, h = k * s;
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const gx = cx ? W - 2 - x : 1 + x, gy = cy ? H - 2 - y : 1 + y;
          m[gy * W + gx] = 0;
        }
      }
    }
  };
  const s = Math.max(3, Math.round(Math.min(iw, ih) * 0.075));
  switch (kind) {
    case 'octagon': stairs(3, s); break;
    case 'steps': stairs(5, Math.max(3, Math.round(s * 0.8))); break;
    case 'L': cut(0.56, 0, 1, 0.5); break;
    case 'plus': cut(0, 0, 0.26, 0.3); cut(0.74, 0, 1, 0.3); cut(0, 0.7, 0.26, 1); cut(0.74, 0.7, 1, 1); break;
    case 'U': cut(0.37, 0, 0.63, 0.48); break;
    case 'T': cut(0, 0.52, 0.3, 1); cut(0.7, 0.52, 1, 1); break;
    case 'Z': cut(0, 0, 0.36, 0.42); cut(0.64, 0.58, 1, 1); break;
    case 'H': cut(0.38, 0, 0.62, 0.3); cut(0.38, 0.7, 0.62, 1); break;
    case 'donut': cut(0.38, 0.35, 0.62, 0.65); break;
    case 'ring2': cut(0.22, 0.36, 0.38, 0.64); cut(0.62, 0.36, 0.78, 0.64); break;
    default: break;
  }
  return m;
}

const LAYOUT_CYCLE = ['open', 'open', 'pillars', 'open', 'cross', 'combs', 'pillars', 'islands', 'brokenRing', 'combs', 'cross', 'islands'];
function layoutFor(L) {
  if (L <= 2) return 'open';
  return LAYOUT_CYCLE[(L - 1) % LAYOUT_CYCLE.length];
}

// Returns a list of [x0, y0, x1, y1) rectangles to pre-freeze as obstacles.
export function layoutRects(kind, W, H, seed) {
  const r = rng(seed);
  const R = [];
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const s = Math.min(W, H);
  switch (kind) {
    case 'pillars': {
      const n = r.int(2, 4);
      const pw = Math.round(s * 0.07), ph = Math.round(s * 0.18);
      for (let k = 0; k < n; k++) {
        const x = Math.round(W * (k + 1) / (n + 1)) - (pw >> 1);
        const y = Math.round(H * (k % 2 ? 0.58 : 0.32)) - (ph >> 1);
        R.push(W >= H ? [x, y, x + pw, y + ph] : [Math.round(W * (k % 2 ? 0.6 : 0.3)) - (ph >> 1), Math.round(H * (k + 1) / (n + 1)) - (pw >> 1), Math.round(W * (k % 2 ? 0.6 : 0.3)) + (ph >> 1), Math.round(H * (k + 1) / (n + 1)) + (pw >> 1)]);
      }
      break;
    }
    case 'cross': {
      const t = Math.max(2, Math.round(s * 0.04)), arm = Math.round(s * 0.2), gap = Math.round(s * 0.07);
      R.push([cx - arm - gap, cy - (t >> 1), cx - gap, cy + (t >> 1) + 1]);
      R.push([cx + gap, cy - (t >> 1), cx + gap + arm, cy + (t >> 1) + 1]);
      R.push([cx - (t >> 1), cy - arm - gap, cx + (t >> 1) + 1, cy - gap]);
      R.push([cx - (t >> 1), cy + gap, cx + (t >> 1) + 1, cy + gap + arm]);
      break;
    }
    case 'combs': {
      // teeth growing from the top and bottom walls, alternating
      const n = r.int(3, 5), t = Math.max(2, Math.round(s * 0.035));
      const long = W >= H;
      for (let k = 0; k < n; k++) {
        const along = Math.round((long ? W : H) * (k + 1) / (n + 1));
        const depth = Math.round((long ? H : W) * r.range(0.22, 0.32));
        const fromStart = k % 2 === 0;
        if (long) R.push([along - (t >> 1), fromStart ? 1 : H - 1 - depth, along + (t >> 1) + 1, fromStart ? 1 + depth : H - 1]);
        else R.push([fromStart ? 1 : W - 1 - depth, along - (t >> 1), fromStart ? 1 + depth : W - 1, along + (t >> 1) + 1]);
      }
      break;
    }
    case 'islands': {
      const n = r.int(4, 7);
      for (let k = 0; k < n; k++) {
        const w = r.int(3, Math.round(s * 0.09)), h = r.int(3, Math.round(s * 0.09));
        const x = r.int(8, W - 8 - w), y = r.int(8, H - 8 - h);
        R.push([x, y, x + w, y + h]);
      }
      break;
    }
    case 'brokenRing': {
      const rw = Math.round(W * 0.3), rh = Math.round(H * 0.3), t = 2, gap = Math.round(s * 0.08);
      const x0 = cx - rw, x1 = cx + rw, y0 = cy - rh, y1 = cy + rh;
      R.push([x0, y0, cx - gap, y0 + t], [cx + gap, y0, x1, y0 + t]);
      R.push([x0, y1 - t, cx - gap, y1], [cx + gap, y1 - t, x1, y1]);
      R.push([x0, y0, x0 + t, cy - gap], [x0, cy + gap, x0 + t, y1]);
      R.push([x1 - t, y0, x1, cy - gap], [x1 - t, cy + gap, x1, y1]);
      break;
    }
    default: break;
  }
  return R.map(([a, b, c, d]) => [Math.max(1, a), Math.max(1, b), Math.min(W - 1, c), Math.min(H - 1, d)]);
}

// Stars: 1 = cleared, 2 = no lives lost, 3 = no lives lost and under par time
export function starsFor(deaths, seconds, par) {
  let s = 1;
  if (deaths === 0) s++;
  if (deaths === 0 && seconds <= par) s++;
  return s;
}
