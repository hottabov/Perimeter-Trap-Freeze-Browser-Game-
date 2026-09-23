// Procedural world themes: every level gets its own palette, ice profile, name and music key.
import { THEMES } from './themes.js';

/* ---------- seeded random ---------- */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.jit = (v) => (f() * 2 - 1) * v;
  return f;
}

/* ---------- colour helpers ---------- */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = (x) => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3)];
}
const clampPct = (v) => Math.max(0, Math.min(100, v));
export function hsl(h, s, l) {
  const [r, g, b] = hslToRgb(h, clampPct(s), clampPct(l));
  return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function hsla(h, s, l, a) { return `hsla(${Math.round(((h % 360) + 360) % 360)}, ${clampPct(s)}%, ${clampPct(l)}%, ${a})`; }
// linear-light HDR triplet (values above 1 bloom)
function hdr(h, s, l, k) { return hslToRgb(h, clampPct(s), clampPct(l)).map(v => +(Math.pow(v, 2.2) * k).toFixed(3)); }

/* ---------- names ---------- */
const NAMES = {
  fire: [['Ember', 'Cinder', 'Hearth', 'Ash', 'Frostfire', 'Kindle', 'Pyre', 'Rime'], ['Fjord', 'Tundra', 'Hollow', 'Lake', 'Reach', 'Mere', 'Barrens', 'Sound']],
  neon: [['Chrome', 'Laser', 'Synth', 'Pulse', 'Vapor', 'Turbo', 'Night', 'Prism'], ['Grid', 'Drive', 'Boulevard', 'Arcade', 'Sector', 'Highway', 'Circuit', 'Strip']],
  cryo: [['Void', 'Nebula', 'Quasar', 'Helix', 'Aurora', 'Zenith', 'Photon', 'Echo'], ['Lattice', 'Array', 'Drift', 'Sanctum', 'Veil', 'Spire', 'Expanse', 'Choir']],
};

const SCALES = {
  fire: [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 3, 5, 6, 10]],
  neon: [[0, 2, 3, 7, 8], [0, 3, 7, 10, 14], [0, 2, 5, 7, 9]],
  cryo: [[0, 5, 7, 10, 14], [0, 2, 7, 9, 14], [0, 4, 7, 11, 14]],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- shared derived fields ---------- */
const POWERUPS = { slow: '#8f7bff', haste: '#5dff9a', shield: '#ffd24a', life: '#ff4d6d' };

function finish(T, P) {
  // P: palette hues { iceH, warmH, family-specific }
  T.powerups = POWERUPS;
  T.hunter ||= { ...T.enemy, a: hsl(P.warmH + 35, 100, 45), b: hsl(P.warmH + 60, 100, 55), core: hsl(P.warmH + 60, 100, 90), light: hsl(P.warmH + 45, 100, 58) };
  T.splitter ||= { ...T.enemy, a: hsl(P.warmH - 30, 90, 45), b: hsl(P.warmH - 5, 100, 58), core: hsl(P.warmH, 100, 90), light: hsl(P.warmH - 20, 100, 60) };
  T.sparx ||= { color: hdr(P.sparxH, 100, 70, 4), light: hsl(P.sparxH, 100, 65) };
  return T;
}

/* ---------- canonical themes (levels 1-3) get UI colours matching the prototype ---------- */
const CANON_UI = {
  fire: { ink: '#e8f3ff', muted: '#8fb0cc', accent: '#7fd0ff', warm: '#ff8a3d', panel: 'rgba(6,14,26,.55)', line: 'rgba(160,210,255,.18)', scrim: 'rgba(2,6,12,.55)' },
  neon: { ink: '#fdf2ff', muted: '#c49be6', accent: '#34f0ff', warm: '#ff2bd6', panel: 'rgba(20,4,34,.5)', line: 'rgba(255,43,214,.35)', scrim: 'rgba(8,0,16,.5)' },
  cryo: { ink: '#dffffb', muted: '#6fb8b0', accent: '#1ad6c0', warm: '#9a6bff', panel: 'rgba(2,12,18,.5)', line: 'rgba(26,214,192,.3)', scrim: 'rgba(0,4,8,.5)' },
};
const CANON_NAMES = { fire: 'Ember Lake', neon: 'Chrome Grid', cryo: 'Void Lattice' };
const CANON_HUES = { fire: { iceH: 205, warmH: 18, sparxH: 48 }, neon: { iceH: 185, warmH: 320, sparxH: 60 }, cryo: { iceH: 172, warmH: 265, sparxH: 350 } };

export function canonicalTheme(family) {
  const T = clone(THEMES[family]);
  T.family = family;
  T.ui = CANON_UI[family];
  T.world = CANON_NAMES[family];
  T.seed = 0;
  return finish(T, CANON_HUES[family]);
}

/* ---------- generators ---------- */
function genFire(r) {
  const T = clone(THEMES.fire);
  const iceH = r.pick([205, 195, 215, 185, 228, 172]) + r.jit(6);
  const fireH = r.pick([12, 22, 30, 352, 4]) + r.jit(4);
  Object.assign(T.ice, {
    base: hsl(iceH, 62, 24 + r.jit(3)), top: hsl(iceH - 6, 55, 72 + r.jit(5)), deep: hsl(iceH + 4, 75, 7), edge: hsl(iceH, 85, 86),
    rim: hsl(iceH, 72, 60), flash: hdr(iceH, 80, 70, 1.5), hMin: r.range(0.6, 0.95), hMax: r.range(1.5, 2.2),
  });
  T.floor = { ...T.floor, a: hsl(iceH + 8, 80, 1.5), b: hsl(iceH + 4, 60, 9 + r.jit(2)), c: hsl(iceH - 10, 80, 78) };
  T.trail = { color: hdr(iceH, 85, 62, 1.5), hot: hdr(iceH, 60, 82, 1.7) };
  T.hero = { ...T.hero, color: hdr(iceH - 10, 70, 82, 4), light: hsl(iceH - 5, 90, 80), spark: hdr(iceH, 80, 65, 3) };
  T.enemy = { ...T.enemy, a: hsl(fireH, 100, 38), b: hsl(fireH + 25, 100, 52), core: hsl(fireH + 40, 100, 86), light: hsl(fireH + 14, 100, 55) };
  T.boss = { ...T.boss, a: hsl(fireH - 12, 100, 16), b: hsl(fireH + 8, 100, 46), core: hsl(fireH + 35, 100, 78), light: hsl(fireH, 100, 50) };
  T.iceOrb = hsl(iceH, 80, 85);
  T.shards = { ...T.shards, color: hsl(iceH, 60, 90), emissive: hsl(iceH, 65, 48), alt: hsl(fireH + 20, 100, 55) };
  T.burst = { kill: hdr(fireH + 15, 100, 55, 3), killAlt: hdr(iceH, 80, 72, 3), steam: true, death: hdr(fireH, 100, 55, 3), capture: hdr(iceH, 80, 72, 3) };
  T.ambient = hsl(iceH, 40, 24); T.dir = hsl(iceH, 60, 88); T.clear = hsl(iceH, 60, 3);
  T.ui = { ink: hsl(iceH, 60, 95), muted: hsl(iceH, 28, 66), accent: hsl(iceH, 85, 74), warm: hsl(fireH + 20, 100, 62), panel: hsla(iceH, 60, 6, .55), line: hsla(iceH, 80, 80, .18), scrim: hsla(iceH, 70, 3, .55) };
  return { T, P: { iceH, warmH: fireH, sparxH: 50 } };
}

function genNeon(r) {
  const T = clone(THEMES.neon);
  const [gH0, eH0] = r.pick([[320, 190], [25, 275], [95, 300], [350, 175], [45, 215], [280, 160], [200, 330]]);
  const gH = gH0 + r.jit(6), eH = eH0 + r.jit(6);
  Object.assign(T.ice, {
    base: hsl(eH + 20, 70, 17), top: hsl(gH + 30, 55, 11), deep: hsl(gH + 20, 60, 5), edge: hsl(eH, 100, 62),
    rim: hsl(gH, 100, 62), flash: hdr(gH, 100, 60, 1.2), gap: r.range(0.84, 0.94), edgeI: r.range(1.1, 1.6),
  });
  T.floor = { ...T.floor, a: hsl(gH, 70, 3), b: hsl(gH, 100, 58), c: hsl(eH, 100, 60) };
  T.trail = { color: hdr(gH, 100, 60, 1.6), hot: [1.5, 1.5, 1.6] };
  T.hero = { ...T.hero, color: hdr(eH, 100, 65, 3.5), light: hsl(eH, 100, 60), spark: hdr(eH, 100, 62, 3) };
  T.enemy = { ...T.enemy, a: hsl(gH + 10, 100, 55), b: hsl(gH + 50, 90, 50), core: hsl(gH + 10, 100, 90), light: hsl(gH, 100, 58) };
  T.boss = { ...T.boss, a: hsl(gH + 140, 100, 52), b: hsl(gH + 170, 100, 58), core: hsl(gH + 150, 100, 90), light: hsl(gH + 150, 100, 55) };
  T.iceOrb = hsl(eH, 100, 62);
  T.shards = { ...T.shards, color: hsl(gH + 30, 55, 12), emissive: hsl(eH, 100, 60), alt: hsl(gH, 100, 60) };
  T.burst = { kill: hdr(gH, 100, 60, 3.4), killAlt: hdr(eH, 100, 62, 3.4), steam: false, death: hdr(gH + 10, 100, 55, 3.5), capture: hdr(eH, 100, 62, 3.4) };
  T.ambient = hsl(gH + 40, 50, 22); T.dir = hsl(gH, 100, 92); T.clear = hsl(gH, 70, 3);
  T.ui = { ink: hsl(gH, 100, 97), muted: hsl(gH, 45, 72), accent: hsl(eH, 100, 62), warm: hsl(gH, 100, 60), panel: hsla(gH, 70, 8, .5), line: hsla(gH, 100, 58, .35), scrim: hsla(gH, 90, 3, .5) };
  return { T, P: { iceH: eH, warmH: gH, sparxH: 60 } };
}

function genCryo(r) {
  const T = clone(THEMES.cryo);
  const iceH = r.pick([172, 160, 190, 145, 200, 182]) + r.jit(6);
  const nebH = r.pick([265, 290, 232, 318, 250]) + r.jit(8);
  Object.assign(T.ice, {
    base: hsl(iceH, 82, 27), top: hsl(iceH, 65, 60), deep: hsl(iceH + 25, 75, 13), edge: hsl(iceH, 100, 86),
    rim: hsl(iceH + 20, 72, 56), flash: hdr(iceH, 80, 65, 2.2), hMin: r.range(0.3, 0.6), hMax: r.range(1.8, 2.8), gap: r.range(0.72, 0.86),
  });
  T.floor = { ...T.floor, a: hsl(nebH, 80, 1.2), b: hsl(nebH, 65, 30), c: hsl(iceH + 10, 75, 45) };
  T.trail = { color: hdr(iceH, 40, 85, 1.5), hot: hdr(iceH, 80, 70, 1.8) };
  T.hero = { ...T.hero, color: [4.0, 4.0, 4.4], light: hsl(iceH, 60, 94) };
  T.enemy = { ...T.enemy, a: hsl(nebH, 100, 68), b: hsl(nebH + 50, 100, 68), core: hsl(nebH, 100, 92), light: hsl(nebH + 10, 100, 70) };
  T.boss = { ...T.boss, a: hsl(nebH + 100, 100, 62), b: hsl(nebH + 130, 100, 70), core: hsl(nebH + 110, 100, 92), light: hsl(nebH + 110, 100, 68) };
  T.iceOrb = hsl(iceH, 100, 75);
  T.shards = { ...T.shards, color: hsl(iceH, 70, 15), emissive: hsl(iceH, 80, 46), alt: hsl(nebH, 100, 70) };
  T.burst = { kill: hdr(nebH, 100, 70, 3.2), killAlt: hdr(iceH, 90, 65, 3.4), steam: false, death: hdr(350, 100, 60, 3.5), capture: hdr(iceH, 90, 65, 3.4) };
  T.ambient = hsl(iceH + 30, 55, 14); T.dir = hsl(iceH, 100, 86); T.clear = hsl(nebH, 70, 1.5);
  T.ui = { ink: hsl(iceH, 100, 94), muted: hsl(iceH, 35, 58), accent: hsl(iceH, 80, 47), warm: hsl(nebH, 100, 70), panel: hsla(iceH + 20, 70, 4, .5), line: hsla(iceH, 80, 47, .3), scrim: hsla(iceH + 20, 90, 1, .5) };
  return { T, P: { iceH, warmH: nebH, sparxH: 350 } };
}

const GEN = { fire: genFire, neon: genNeon, cryo: genCryo };

export function generateTheme(family, seed) {
  const r = rng(seed * 2654435761 + family.length * 97);
  const { T, P } = GEN[family](r);
  T.family = family;
  T.seed = seed;
  T.key = family;
  T.world = `${r.pick(NAMES[family][0])} ${r.pick(NAMES[family][1])}`;
  T.name = T.world;
  T.audio = { ...T.audio, root: T.audio.root + r.pick([-5, -3, -2, 0, 2, 3, 5]), scale: r.pick(SCALES[family]) };
  return finish(T, P);
}

export const FAMILIES = ['fire', 'neon', 'cryo'];

// Theme for a level. mode: 'auto' (new world every level) or a fixed family.
export function themeForLevel(level, mode, runSeed) {
  if (mode === 'auto') {
    if (level <= 3) return canonicalTheme(FAMILIES[level - 1]);
    const r = rng(runSeed + level * 7919);
    // avoid repeating the previous level's family
    const prev = themeFamilyForAuto(level - 1, runSeed);
    const fam = r.pick(FAMILIES.filter(f => f !== prev));
    return generateTheme(fam, runSeed + level * 31);
  }
  if (level === 1) return canonicalTheme(mode);
  return generateTheme(mode, runSeed + level * 31);
}

function themeFamilyForAuto(level, runSeed) {
  if (level <= 3) return FAMILIES[level - 1];
  const r = rng(runSeed + level * 7919);
  const prev = themeFamilyForAuto(level - 1, runSeed);
  return r.pick(FAMILIES.filter(f => f !== prev));
}
