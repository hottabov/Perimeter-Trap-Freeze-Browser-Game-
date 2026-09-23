// Level design: enemy mix, obstacles and goals. Deterministic per (level, runSeed).
import { rng } from './themegen.js';

export const GOAL_BASE = 90;

export function levelSpec(level) {
  const L = level;
  const spec = {
    level: L,
    drifters: 2 + Math.floor((L - 1) / 3),
    hunters: L >= 3 ? 1 + Math.floor((L - 3) / 4) : 0,
    splitters: L >= 4 ? (L >= 9 ? 2 : 1) : 0,
    sparx: L >= 2 ? (L >= 7 ? 2 : 1) : 0,
    boss: L % 5 === 0,
    bossHp: 3 + Math.floor(L / 10),
    speed: Math.min(1.6, 1 + (L - 1) * 0.045),
    goal: GOAL_BASE,
    layout: layoutFor(L),
    par: 60 + L * 8, // seconds for the time star
  };
  // Boss levels are about the boss: fewer small enemies
  if (spec.boss) { spec.drifters = Math.max(1, spec.drifters - 2); spec.hunters = Math.max(0, spec.hunters - 1); spec.splitters = 0; }
  // Cap total so the field never gets unreadable
  const total = () => spec.drifters + spec.hunters + spec.splitters;
  while (total() > 7) { if (spec.drifters > 2) spec.drifters--; else if (spec.splitters) spec.splitters--; else spec.hunters--; }
  return spec;
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
