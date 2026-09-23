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
  cave: [['Echo', 'Hollow', 'Amethyst', 'Deep', 'Glimmer', 'Geode', 'Quartz', 'Silent'], ['Cavern', 'Grotto', 'Vault', 'Depths', 'Chasm', 'Mine', 'Warren', 'Undercroft']],
  abyss: [['Hollow', 'Dread', 'Silent', 'Bleak', 'Crimson', 'Ashen', 'Grave', 'Whisper'], ['Abyss', 'Maw', 'Pit', 'Mire', 'Wastes', 'Hollows', 'Nether', 'Crypt']],
  sky: [['Aurora', 'Zephyr', 'Halo', 'Seraph', 'Gilded', 'Cirrus', 'Solace', 'Lumen'], ['Heights', 'Spire', 'Firmament', 'Terrace', 'Isles', 'Reach', 'Choir', 'Canopy']],
  desert: [['Sun', 'Amber', 'Mirage', 'Dune', 'Scarab', 'Saffron', 'Ochre', 'Sirocco'], ['Sea', 'Wastes', 'Oasis', 'Expanse', 'Tombs', 'Road', 'Basin', 'Sands']],
  hell: [['Brimstone', 'Molten', 'Sulfur', 'Cinder', 'Infernal', 'Scorched', 'Magma', 'Burning'], ['Pit', 'Forge', 'Caldera', 'Circle', 'Throne', 'Furnace', 'Crucible', 'Gate']],
  heaven: [['Golden', 'Radiant', 'Eternal', 'Blessed', 'Ivory', 'Sacred', 'Seventh', 'Luminous'], ['Gates', 'Sanctum', 'Cloister', 'Choir', 'Throne', 'Rose', 'Garden', 'Halls']],
};

const SCALES = {
  fire: [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 3, 5, 6, 10]],
  neon: [[0, 2, 3, 7, 8], [0, 3, 7, 10, 14], [0, 2, 5, 7, 9]],
  cryo: [[0, 5, 7, 10, 14], [0, 2, 7, 9, 14], [0, 4, 7, 11, 14]],
  cave: [[0, 1, 5, 7, 8], [0, 3, 5, 7, 10], [0, 2, 3, 7, 8]],
  abyss: [[0, 1, 6, 7, 10], [0, 1, 3, 6, 8], [0, 3, 6, 9, 11]],
  sky: [[0, 2, 4, 7, 9], [0, 4, 7, 9, 11], [0, 2, 4, 7, 11]],
  desert: [[0, 1, 4, 5, 7, 8, 10], [0, 2, 3, 6, 7, 8, 11], [0, 1, 4, 5, 7, 8, 11]],
  hell: [[0, 1, 4, 5, 6, 8, 11], [0, 1, 3, 6, 7, 8, 10], [0, 1, 5, 6, 10]],
  heaven: [[0, 2, 4, 6, 7, 9, 11], [0, 2, 4, 7, 9, 11, 14], [0, 4, 7, 11, 14]],
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
  cave: { ink: '#f1e8ff', muted: '#a797bf', accent: '#c29bff', warm: '#ffb13b', panel: 'rgba(12,8,18,.6)', line: 'rgba(194,155,255,.22)', scrim: 'rgba(3,2,6,.6)' },
  abyss: { ink: '#f6e9e6', muted: '#a88a86', accent: '#ff4a55', warm: '#ff2a3a', panel: 'rgba(14,3,5,.62)', line: 'rgba(255,42,58,.28)', scrim: 'rgba(3,0,1,.65)' },
  sky: { ink: '#ffffff', muted: '#e2ebfa', accent: '#ffe3a8', warm: '#ffc45c', panel: 'rgba(24,38,70,.45)', line: 'rgba(255,227,168,.4)', scrim: 'rgba(20,34,66,.45)' },
  desert: { ink: '#fff6e8', muted: '#d9bf98', accent: '#6ff2e0', warm: '#ffb347', panel: 'rgba(40,22,8,.5)', line: 'rgba(255,200,130,.3)', scrim: 'rgba(26,14,4,.5)' },
  hell: { ink: '#fff0e6', muted: '#c9937a', accent: '#ff8a2a', warm: '#ff4a10', panel: 'rgba(20,4,0,.6)', line: 'rgba(255,110,40,.32)', scrim: 'rgba(10,2,0,.62)' },
  heaven: { ink: '#3a2c14', muted: '#5a4622', accent: '#b8860b', warm: '#d49a1a', panel: 'rgba(255,248,232,.62)', line: 'rgba(184,134,11,.35)', scrim: 'rgba(255,246,226,.55)' },
};
const CANON_NAMES = {
  fire: 'Ember Lake', neon: 'Chrome Grid', cryo: 'Void Lattice', cave: 'Amethyst Grotto', abyss: 'Crimson Maw', sky: 'Gilded Heights',
  desert: 'Mirage Sea', hell: 'Brimstone Forge', heaven: 'Golden Gates',
};
const CANON_HUES = {
  fire: { iceH: 205, warmH: 18, sparxH: 48 }, neon: { iceH: 185, warmH: 320, sparxH: 60 }, cryo: { iceH: 172, warmH: 265, sparxH: 350 },
  cave: { iceH: 275, warmH: 35, sparxH: 160 }, abyss: { iceH: 355, warmH: 0, sparxH: 45 }, sky: { iceH: 40, warmH: 250, sparxH: 200 },
  desert: { iceH: 172, warmH: 240, sparxH: 180 }, hell: { iceH: 200, warmH: 16, sparxH: 55 }, heaven: { iceH: 44, warmH: 215, sparxH: 45 },
};

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

function genCave(r) {
  const T = clone(THEMES.cave);
  const cH = r.pick([275, 150, 205, 320, 45, 185]) + r.jit(6);   // crystal
  const vH = cH + r.pick([150, 180, -120]);                      // mineral veins
  const fH = r.pick([38, 20, 90, 55]) + r.jit(5);                // fireflies
  Object.assign(T.ice, {
    base: hsl(cH, 55, 24), top: hsl(cH + 8, 62, 62 + r.jit(6)), deep: hsl(cH - 8, 70, 7), edge: hsl(cH + 10, 90, 86),
    rim: hsl(cH + 20, 80, 62), flash: hdr(cH, 80, 70, 1.8), hMin: r.range(0.4, 0.7), hMax: r.range(2.2, 3.0), gap: r.range(0.88, 0.95),
  });
  T.floor = { ...T.floor, a: hsl(cH + 20, 20, 3), b: hsl(cH + 20, 12, 11 + r.jit(2)), c: hsl(vH, 85, 55) };
  T.trail = { color: hdr(vH, 90, 55, 1.6), hot: hdr(vH, 70, 80, 1.8) };
  T.hero = { ...T.hero, color: hdr(vH, 80, 80, 4), light: hsl(vH, 90, 75), spark: hdr(vH, 85, 62, 3) };
  T.enemy = { ...T.enemy, a: hsl(fH, 100, 60), b: hsl(fH - 15, 100, 55), core: hsl(fH + 10, 100, 86), light: hsl(fH, 100, 60) };
  T.boss = { ...T.boss, a: hsl(fH + 60, 100, 58), b: hsl(fH + 100, 100, 58), core: hsl(fH + 70, 100, 88), light: hsl(fH + 70, 100, 60) };
  T.iceOrb = hsl(cH, 90, 85);
  T.shards = { ...T.shards, color: hsl(cH, 60, 75), emissive: hsl(cH, 70, 42), alt: hsl(fH, 100, 60) };
  T.burst = { kill: hdr(fH, 100, 60, 3), killAlt: hdr(cH, 85, 70, 3), steam: false, death: hdr(fH - 20, 100, 55, 3.2), capture: hdr(cH, 85, 70, 3) };
  T.ambient = hsl(cH, 25, 16); T.dir = hsl(cH, 60, 85); T.clear = hsl(cH, 40, 1.5);
  T.ui = { ink: hsl(cH, 80, 95), muted: hsl(cH, 20, 66), accent: hsl(cH, 85, 76), warm: hsl(fH, 100, 62), panel: hsla(cH, 40, 5, .6), line: hsla(cH, 80, 76, .22), scrim: hsla(cH, 50, 2, .6) };
  return { T, P: { iceH: cH, warmH: fH, sparxH: vH } };
}

function genAbyss(r) {
  const T = clone(THEMES.abyss);
  const aH = r.pick([355, 280, 100, 18, 330]) + r.jit(5);   // accent glow
  const iH = r.pick([aH, 50, aH + 20]);                     // iris
  Object.assign(T.ice, {
    base: hsl(aH, 30, 8), top: hsl(aH, 12, 13), deep: hsl(aH, 30, 2), edge: hsl(aH, 100, 55),
    rim: hsl(aH, 90, 45), flash: hdr(aH, 100, 50, 2), hMin: r.range(0.8, 1.1), hMax: r.range(1.8, 2.4),
  });
  T.floor = { ...T.floor, a: hsl(aH, 60, 1.2), b: hsl(aH, 70, 6), c: hsl(aH, 100, 55) };
  T.enemy = { ...T.enemy, a: hsl(iH, 100, 40), b: hsl(iH + 20, 100, 55), light: hsl(aH, 100, 55) };
  T.boss = { ...T.boss, a: hsl(iH + 60, 100, 50), b: hsl(iH + 40, 100, 55), light: hsl(iH + 50, 100, 55) };
  T.iceOrb = hsl(aH, 100, 65);
  T.shards = { ...T.shards, color: hsl(aH, 30, 8), emissive: hsl(aH, 100, 50) };
  T.burst = { kill: hdr(aH, 100, 55, 3.4), killAlt: [2.8, 2.4, 2.2], steam: false, death: hdr(aH, 100, 50, 3.5), capture: hdr(aH, 100, 55, 3) };
  T.ambient = hsl(aH, 50, 9); T.dir = hsl(aH, 70, 80); T.clear = hsl(aH, 70, 1);
  T.ui = { ink: hsl(aH, 40, 94), muted: hsl(aH, 15, 60), accent: hsl(aH, 100, 64), warm: hsl(aH, 100, 55), panel: hsla(aH, 60, 3, .62), line: hsla(aH, 100, 55, .28), scrim: hsla(aH, 80, 1, .65) };
  return { T, P: { iceH: aH, warmH: iH, sparxH: aH + 60 } };
}

function genSky(r) {
  const T = clone(THEMES.sky);
  const sH = r.pick([212, 205, 25, 280, 190]) + r.jit(6);   // sky tint (day, dawn, dusk)
  const gH = r.pick([42, 38, 330, 200]) + r.jit(4);         // trim: gold, rose, silver-blue
  const stormH = r.pick([255, 230, 290, 200]) + r.jit(8);
  const dusk = sH < 60 || sH > 250;
  Object.assign(T.ice, {
    base: hsl(sH, 18, 62), top: hsl(gH, 45, 94), deep: hsl(sH, 25, 40), edge: hsl(gH, 90, 68), rim: hsl(sH, 60, 86),
    flash: hdr(gH, 90, 70, 1.6), hMin: r.range(0.5, 0.8), hMax: r.range(1.4, 1.9),
  });
  T.floor = { ...T.floor, a: hsl(sH, 50, dusk ? 20 : 26), b: hsl(sH + (dusk ? 10 : 0), 55, dusk ? 55 : 62), c: hsl(gH, 100, 82) };
  T.trail = { color: hdr(gH, 100, 55, 2), hot: hdr(gH, 80, 80, 2.2) };
  T.hero = { ...T.hero, color: hdr(gH, 100, 70, 4), light: hsl(gH, 100, 72), spark: hdr(gH, 100, 60, 3) };
  T.enemy = { ...T.enemy, a: hsl(stormH, 55, 26), b: hsl(stormH - 25, 60, 20), core: hsl(stormH - 40, 100, 86), light: hsl(stormH - 40, 100, 72) };
  T.boss = { ...T.boss, a: hsl(stormH + 60, 60, 26), b: hsl(stormH + 30, 60, 18), core: hsl(stormH + 70, 100, 88), light: hsl(stormH + 70, 100, 72) };
  T.iceOrb = hsl(gH, 60, 92);
  T.shards = { ...T.shards, color: hsl(gH, 45, 94), emissive: hsl(gH, 90, 60), alt: hsl(stormH - 40, 100, 75) };
  T.burst = { kill: hdr(stormH - 40, 100, 75, 3), killAlt: hdr(gH, 100, 65, 3), steam: false, death: hdr(0, 90, 60, 3), capture: hdr(gH, 100, 70, 3) };
  T.ambient = hsl(sH, 35, 55); T.dir = hsl(gH, 60, 92); T.clear = hsl(sH, 50, 16);
  T.ui = { ink: '#ffffff', muted: hsl(sH, 50, 88), accent: hsl(gH, 100, 82), warm: hsl(gH, 100, 64), panel: hsla(sH, 45, 18, .45), line: hsla(gH, 100, 82, .4), scrim: hsla(sH, 50, 16, .45) };
  return { T, P: { iceH: gH, warmH: stormH, sparxH: gH } };
}

function genDesert(r) {
  const T = clone(THEMES.desert);
  const sH = r.pick([32, 26, 18, 40, 8]) + r.jit(4);          // sand: gold, ochre, red rock, pale, rust
  const gH = r.pick([172, 185, 160, 200, 140]) + r.jit(6);    // glow: turquoise, jade, lapis
  const eH = r.pick([225, 250, 275, 205]) + r.jit(6);         // scarab spirits: dark iridescent blues and violets
  const night = r() < 0.25;
  Object.assign(T.ice, {
    base: hsl(sH, 45, 42), top: hsl(sH + 4, 60, 74 + r.jit(4)), deep: hsl(sH - 4, 60, 16), edge: hsl(gH, 85, 70), rim: hsl(sH + 8, 80, 82),
    flash: hdr(gH, 80, 65, 2.2), hMin: r.range(0.5, 0.9), hMax: r.range(1.9, 2.6),
  });
  T.floor = { ...T.floor, a: hsl(sH, 55, night ? 7 : 20), b: hsl(sH + 4, 58, night ? 28 : 64), c: hsl(sH + 10, 100, night ? 70 : 88) };
  T.trail = { color: hdr(gH, 85, 55, 1.8), hot: hdr(gH, 60, 80, 2.2) };
  T.hero = { ...T.hero, color: hdr(gH, 80, 80, 4), light: hsl(gH, 90, 75), spark: hdr(gH, 85, 62, 3) };
  T.enemy = { ...T.enemy, a: hsl(eH, 70, 25), b: hsl(eH + 50, 75, 30), core: hsl(eH - 40, 100, 82), light: hsl(eH, 100, 62) };
  T.boss = { ...T.boss, a: hsl(eH + 120, 80, 20), b: hsl(eH + 170, 70, 18), core: hsl(eH + 150, 100, 82), light: hsl(eH + 150, 100, 60) };
  T.iceOrb = hsl(gH, 90, 80);
  T.shards = { ...T.shards, color: hsl(sH + 4, 60, 74), emissive: hsl(gH, 80, 50), alt: hsl(eH, 100, 60) };
  T.burst = { kill: hdr(eH, 100, 60, 3.2), killAlt: hdr(gH, 85, 60, 3), steam: false, death: hdr(eH - 20, 100, 55, 3.2), capture: hdr(gH, 85, 60, 3) };
  T.ambient = hsl(sH, 35, night ? 14 : 30); T.dir = hsl(sH + 8, 80, night ? 78 : 88); T.clear = hsl(sH, 50, night ? 3 : 6);
  T.ui = { ink: hsl(sH, 80, 96), muted: hsl(sH, 40, 72), accent: hsl(gH, 85, 70), warm: hsl(sH + 8, 100, 62), panel: hsla(sH, 60, 8, .5), line: hsla(sH, 90, 75, .3), scrim: hsla(sH, 60, 5, .5) };
  return { T, P: { iceH: gH, warmH: eH, sparxH: gH } };
}

function genHell(r) {
  const T = clone(THEMES.hell);
  const lH = r.pick([14, 22, 4, 350, 30]) + r.jit(4);         // lava
  const cH = r.pick([200, 190, 215, 170]) + r.jit(6);         // the hero's cold colour
  const green = r() < 0.2;                                    // rare sulfur-green hellfire
  const fH = green ? 95 + r.jit(8) : lH;
  Object.assign(T.ice, {
    base: hsl(fH, 35, 8), top: hsl(fH, 22, 16), deep: hsl(fH, 40, 2), edge: hsl(fH + 12, 100, 60), rim: hsl(fH, 100, 50),
    flash: hdr(fH + 10, 100, 55, 2.6), hMin: r.range(0.9, 1.2), hMax: r.range(2.2, 2.9),
  });
  T.floor = { ...T.floor, a: hsl(fH, 45, 6), b: hsl(fH, 100, 50), c: hsl(fH + 25, 100, 62) };
  T.trail = { color: hdr(cH, 90, 60, 2), hot: hdr(cH, 60, 82, 2.4) };
  T.hero = { ...T.hero, color: hdr(cH, 80, 82, 4.2), light: hsl(cH, 90, 80), spark: hdr(cH, 90, 65, 3.2) };
  T.enemy = { ...T.enemy, a: hsl(fH, 70, 8), b: hsl(fH + 5, 100, 50), core: hsl(fH + 30, 100, 62), light: hsl(fH + 8, 100, 52) };
  T.boss = { ...T.boss, a: hsl(fH - 10, 70, 5), b: hsl(fH - 8, 100, 48), core: hsl(fH + 40, 100, 75), light: hsl(fH, 100, 50) };
  T.iceOrb = hsl(cH, 90, 80);
  T.shards = { ...T.shards, color: hsl(fH, 35, 8), emissive: hsl(fH + 10, 100, 52), alt: hsl(cH, 90, 75) };
  T.burst = { kill: hdr(fH + 10, 100, 55, 3.6), killAlt: hdr(cH, 90, 70, 3.4), steam: true, death: hdr(fH, 100, 50, 3.6), capture: hdr(cH, 90, 70, 3.4) };
  T.ambient = hsl(fH, 60, 10); T.dir = hsl(fH + 20, 100, 76); T.clear = hsl(fH, 80, 2);
  T.ui = { ink: hsl(fH + 20, 100, 95), muted: hsl(fH + 10, 35, 62), accent: hsl(fH + 18, 100, 58), warm: hsl(fH, 100, 52), panel: hsla(fH, 80, 4, .6), line: hsla(fH + 10, 100, 55, .32), scrim: hsla(fH, 90, 2, .62) };
  return { T, P: { iceH: cH, warmH: fH, sparxH: fH + 40 } };
}

function genHeaven(r) {
  const T = clone(THEMES.heaven);
  const gH = r.pick([44, 40, 330, 200, 48]) + r.jit(3);       // trim: gold, rose gold, silver-blue
  const lH = r.pick([40, 30, 210, 280]) + r.jit(5);           // light tint
  const iH = r.pick([215, 200, 280, 160]) + r.jit(8);         // seraph iris
  Object.assign(T.ice, {
    base: hsl(lH, 16, 76), top: hsl(lH, 70, 97), deep: hsl(lH, 12, 50), edge: hsl(gH, 90, 62), rim: hsl(gH, 80, 90),
    flash: hdr(gH, 90, 70, 2.2), hMin: r.range(0.8, 1.1), hMax: r.range(1.8, 2.3),
  });
  T.floor = { ...T.floor, a: hsl(lH, 16, 38), b: hsl(lH, 24, 76), c: hsl(gH, 100, 70) };
  T.trail = { color: hdr(gH, 100, 55, 2.2), hot: hdr(gH, 80, 82, 2.6) };
  T.hero = { ...T.hero, color: hdr(gH, 100, 72, 4.2), light: hsl(gH, 100, 76), spark: hdr(gH, 100, 60, 3.2) };
  T.enemy = { ...T.enemy, a: hsl(gH, 90, 42), b: hsl(iH, 90, 58), core: hsl(lH, 100, 96), light: hsl(gH, 100, 70) };
  T.boss = { ...T.boss, a: hsl(gH - 25, 100, 55), b: hsl(iH + 60, 90, 55), core: hsl(lH, 100, 97), light: hsl(gH - 15, 100, 65) };
  T.iceOrb = hsl(gH, 70, 88);
  T.shards = { ...T.shards, color: hsl(lH, 70, 97), emissive: hsl(gH, 90, 60), alt: hsl(iH, 90, 60) };
  T.burst = { kill: hdr(gH, 100, 65, 3.4), killAlt: hdr(iH, 90, 65, 3.2), steam: false, death: hdr(0, 90, 60, 3.2), capture: hdr(gH, 100, 68, 3.2) };
  T.ambient = hsl(lH, 22, 62); T.dir = hsl(lH, 80, 94); T.clear = hsl(lH, 30, 85);
  T.ui = { ink: hsl(gH, 60, 14), muted: hsl(gH, 30, 36), accent: hsl(gH, 90, 36), warm: hsl(gH, 90, 44), panel: hsla(lH, 60, 97, .62), line: hsla(gH, 90, 36, .35), scrim: hsla(lH, 60, 94, .55) };
  return { T, P: { iceH: gH, warmH: iH, sparxH: gH } };
}

const GEN = { fire: genFire, neon: genNeon, cryo: genCryo, cave: genCave, abyss: genAbyss, sky: genSky, desert: genDesert, hell: genHell, heaven: genHeaven };

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

// Canonical order: the first nine levels descend from ice to the underworld, then rise to heaven
export const FAMILIES = ['fire', 'neon', 'cryo', 'desert', 'cave', 'abyss', 'hell', 'sky', 'heaven'];

// Theme for a level. mode: 'auto' (new world every level) or a fixed family.
// Levels 1-9 introduce each hand-tuned world once; after that every level is generated.
export function themeForLevel(level, mode, runSeed) {
  if (mode === 'auto') {
    if (level <= FAMILIES.length) return canonicalTheme(FAMILIES[level - 1]);
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
  if (level <= FAMILIES.length) return FAMILIES[level - 1];
  const r = rng(runSeed + level * 7919);
  const prev = themeFamilyForAuto(level - 1, runSeed);
  return r.pick(FAMILIES.filter(f => f !== prev));
}
