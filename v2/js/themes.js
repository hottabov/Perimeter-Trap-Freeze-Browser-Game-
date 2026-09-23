// Three visual directions for the same game. Colors are sRGB hex; arrays are linear HDR (values > 1 bloom).
export const THEMES = {
  fire: {
    key: 'fire',
    name: 'Fire & Ice',
    tagline: 'Freeze the embers before they burn your frost',
    clear: '#04060b',
    floor: { kind: 'lake', a: '#010309', b: '#0a1a2e', c: '#8fb8ff', lightK: 0.03 },
    ice: {
      base: '#163f66', top: '#8fc4e4', deep: '#04111f', edge: '#bfe8ff', rim: '#4aa0dc', flash: [0.5, 0.95, 1.4], edgeDark: 0.45,
      edgeW: 0.1, edgeI: 0.06, rimP: 2.6, rimI: 0.3, alpha: 1, spark: 3.5, flashDecay: 340, lightK: 0.09,
      hMin: 0.8, hMax: 1.8, gap: 1.0, facets: true, sparkle: true, holo: false, grow: 700,
    },
    trail: { color: [0.35, 0.9, 1.5], hot: [1.0, 1.4, 1.7] },
    hero: { color: [2.6, 3.4, 4.2], light: '#9fe3ff', lightI: 1.2, spark: [0.9, 1.8, 3.0], kind: 'frost' },
    enemy: { style: 'FIRE', a: '#c01a00', b: '#ff8a00', core: '#fff1b8', light: '#ff6a10', lightI: 3.2, emit: 'embers', ring: false },
    boss: { style: 'FIRE', a: '#5a0008', b: '#ff3a00', core: '#ffe08a', light: '#ff3a10', lightI: 5, emit: 'embers', ring: false },
    iceOrb: '#bfeaff',
    shards: { color: '#d8f2ff', emissive: '#3d8fd6', emissiveI: 0.55, opacity: 0.92, alt: '#ff7a1a' },
    burst: { kill: [3.0, 1.2, 0.3], killAlt: [1.6, 2.6, 3.4], steam: true, death: [3.0, 0.8, 0.3], capture: [1.2, 2.4, 3.4] },
    post: { bloom: [0.75, 0.4, 0.95], vignette: 1.0, grain: 0.012, aberr: 0.0, scan: 0, tint: [1.0, 1.0, 1.04], exposure: 1.0 },
    sun: [-0.4, 1.0, 0.55], ambient: '#27405e', dir: '#cfe6ff',
    hudGlyph: '❄',
    audio: { root: 45, scale: [0, 3, 5, 7, 10], wave: 'triangle', drone: 'sine', cutoff: 700, shimmer: 1.0, steam: true },
  },

  neon: {
    key: 'neon',
    name: 'Neon Glacier',
    tagline: 'Glass ice on a synthwave grid',
    clear: '#06020d',
    floor: { kind: 'grid', a: '#07020e', b: '#ff2bd6', c: '#2de2ff', lightK: 0.02 },
    ice: {
      base: '#0d2456', top: '#140f33', deep: '#07041a', edge: '#34f0ff', rim: '#ff3bd4', flash: [1.2, 0.35, 1.1],
      edgeW: 0.07, edgeI: 1.4, rimP: 3.0, rimI: 0.4, alpha: 1, spark: 0, flashDecay: 380, lightK: 0.04,
      hMin: 1.0, hMax: 1.0, gap: 0.9, facets: false, sparkle: false, holo: false, grow: 600,
    },
    trail: { color: [1.6, 0.25, 1.3], hot: [1.5, 1.5, 1.6] },
    hero: { color: [1.2, 3.8, 4.2], light: '#2de2ff', lightI: 1.2, spark: [0.6, 2.8, 3.4], kind: 'orb' },
    enemy: { style: 'PLASMA', a: '#ff1f8f', b: '#7a2cff', core: '#ffd0f5', light: '#ff2bd6', lightI: 2.8, emit: 'sparks', ring: true },
    boss: { style: 'PLASMA', a: '#ffb000', b: '#ff2b6a', core: '#fff3c0', light: '#ffae00', lightI: 4.5, emit: 'sparks', ring: true },
    iceOrb: '#34f0ff',
    shards: { color: '#1b1440', emissive: '#34f0ff', emissiveI: 1.6, opacity: 0.95, alt: '#ff2bd6' },
    burst: { kill: [3.4, 0.6, 2.8], killAlt: [0.6, 3.0, 3.6], steam: false, death: [3.5, 0.4, 1.2], capture: [0.5, 3.0, 3.6] },
    post: { bloom: [0.95, 0.45, 0.9], vignette: 0.85, grain: 0.01, aberr: 0.0012, scan: 0.04, tint: [1.02, 0.98, 1.05], exposure: 1.0 },
    sun: [0.3, 1.0, 0.4], ambient: '#2a1a55', dir: '#ffd6f6',
    hudGlyph: '◆',
    audio: { root: 41, scale: [0, 2, 3, 7, 8], wave: 'sawtooth', drone: 'sawtooth', cutoff: 1100, shimmer: 0.6, steam: false, arp: true },
  },

  cryo: {
    key: 'cryo',
    name: 'Cryo Void',
    tagline: 'Holographic crystal lattice in deep space',
    clear: '#010207',
    floor: { kind: 'void', a: '#000106', b: '#3a1a8a', c: '#1ab8c8', lightK: 0.03 },
    ice: {
      base: '#0c7f72', top: '#5fd6c8', deep: '#062a3d', edge: '#b8fff6', rim: '#3cb8e0', flash: [1.0, 2.2, 2.0],
      edgeW: 0.08, edgeI: 1.8, rimP: 1.8, rimI: 0.8, alpha: 0.55, spark: 0, flashDecay: 520, lightK: 0.05,
      hMin: 0.4, hMax: 2.2, gap: 0.8, facets: false, sparkle: false, holo: true, grow: 800,
    },
    trail: { color: [1.3, 1.4, 1.6], hot: [0.8, 1.6, 1.8] },
    hero: { color: [4.0, 4.0, 4.4], light: '#e8fbff', lightI: 1.0, spark: [2.2, 2.6, 3.4], kind: 'laser' },
    enemy: { style: 'BIO', a: '#8a5cff', b: '#ff5cd1', core: '#e6d6ff', light: '#9a6bff', lightI: 2.6, emit: 'motes', ring: false },
    boss: { style: 'BIO', a: '#ff4d6d', b: '#ffb86b', core: '#ffe6d6', light: '#ff5c7a', lightI: 4.5, emit: 'motes', ring: true },
    iceOrb: '#7ffff0',
    shards: { color: '#0b3b44', emissive: '#1ad6c0', emissiveI: 2.0, opacity: 0.8, alt: '#9a6bff' },
    burst: { kill: [1.8, 1.0, 3.6], killAlt: [0.6, 3.6, 3.2], steam: false, death: [3.6, 0.5, 1.0], capture: [0.8, 3.6, 3.4] },
    post: { bloom: [0.9, 0.45, 0.9], vignette: 0.95, grain: 0.015, aberr: 0.002, scan: 0.08, tint: [0.96, 1.03, 1.06], exposure: 1.0 },
    sun: [0.2, 1.0, 0.7], ambient: '#10213a', dir: '#b8fff6',
    hudGlyph: '◇',
    audio: { root: 38, scale: [0, 5, 7, 10, 14], wave: 'sine', drone: 'sine', cutoff: 500, shimmer: 1.4, steam: false, sonar: true },
  },

  // Crystal cave: dark stone, glowing mineral veins, amethyst crystal ice, firefly enemies
  cave: {
    key: 'cave',
    name: 'Crystal Cave',
    clear: '#030205',
    floor: { kind: 'cave', a: '#07060a', b: '#1d1822', c: '#2fe0b0', lightK: 0.035 },
    ice: {
      base: '#3c1f6b', top: '#b58ae6', deep: '#12072a', edge: '#e9c8ff', rim: '#c07bff', flash: [1.2, 0.7, 2.0], edgeDark: 0.3,
      edgeW: 0.08, edgeI: 0.35, rimP: 2.2, rimI: 0.5, alpha: 1, spark: 3.0, flashDecay: 420, lightK: 0.07,
      hMin: 0.5, hMax: 2.7, gap: 0.92, facets: true, sparkle: true, holo: false, grow: 750, contour: 0.9, tileI: 1, cap: 0,
    },
    trail: { color: [0.3, 1.6, 1.1], hot: [1.2, 1.8, 1.6] },
    hero: { color: [2.2, 4.0, 3.4], light: '#7dffd8', lightI: 1.3, spark: [0.8, 2.8, 2.0], kind: 'frost' },
    enemy: { style: 'BIO', a: '#ffb13b', b: '#ff7a1a', core: '#fff0b8', light: '#ffab3d', lightI: 2.8, emit: 'motes', ring: false },
    boss: { style: 'BIO', a: '#9dff3b', b: '#3bffa4', core: '#eaffd0', light: '#8dff5a', lightI: 4.5, emit: 'motes', ring: true },
    iceOrb: '#e3c4ff',
    shards: { color: '#c9a2f5', emissive: '#7a3fd0', emissiveI: 0.9, opacity: 0.92, alt: '#ffb13b' },
    burst: { kill: [3.0, 1.8, 0.4], killAlt: [1.8, 1.0, 3.2], steam: false, death: [3.2, 1.2, 0.3], capture: [1.6, 1.0, 3.2] },
    post: { bloom: [0.8, 0.45, 0.9], vignette: 1.15, grain: 0.02, aberr: 0.0, scan: 0, tint: [1.0, 0.98, 1.05], exposure: 1.0 },
    sun: [0.2, 1.0, -0.4], ambient: '#2a1f3a', dir: '#c9b8ff',
    hudGlyph: '◈',
    audio: { root: 40, scale: [0, 1, 5, 7, 8], wave: 'triangle', drone: 'sine', cutoff: 520, shimmer: 1.2, drip: true },
  },

  // Abyss: black tar, pulsing red veins, eyes in the dark, obsidian ice, eyeball enemies
  abyss: {
    key: 'abyss',
    name: 'Abyss',
    clear: '#030001',
    floor: { kind: 'abyss', a: '#040102', b: '#1a0306', c: '#ff1a2e', lightK: 0.04 },
    ice: {
      base: '#1a0d10', top: '#2a1a1e', deep: '#050203', edge: '#ff2a3a', rim: '#ff3848', flash: [2.2, 0.25, 0.3], edgeDark: 0.4,
      edgeW: 0.06, edgeI: 0.6, rimP: 3.0, rimI: 0.35, alpha: 1, spark: 0, flashDecay: 520, lightK: 0.06,
      hMin: 0.9, hMax: 2.1, gap: 0.97, facets: false, sparkle: false, holo: false, grow: 900, contour: 1.8, tileI: 0.35, cap: 0.6,
    },
    trail: { color: [1.8, 1.6, 1.4], hot: [2.0, 2.0, 2.2] },
    hero: { color: [3.4, 3.6, 4.2], light: '#dfe8ff', lightI: 1.4, spark: [2.4, 2.6, 3.2], kind: 'orb' },
    enemy: { style: 'EYE', a: '#c41020', b: '#ff5a3a', core: '#f2e6dc', light: '#ff2a3a', lightI: 2.4, emit: 'embers', ring: false },
    boss: { style: 'EYE', a: '#ffcc00', b: '#ff5a00', core: '#fff0e0', light: '#ff5a1a', lightI: 4.5, emit: 'embers', ring: true },
    iceOrb: '#ff5a6a',
    shards: { color: '#1a0d10', emissive: '#ff2a3a', emissiveI: 1.2, opacity: 0.95, alt: '#f2e6dc' },
    burst: { kill: [3.4, 0.3, 0.3], killAlt: [2.8, 2.4, 2.2], steam: false, death: [3.5, 0.2, 0.2], capture: [3.0, 0.4, 0.5] },
    post: { bloom: [0.75, 0.5, 0.85], vignette: 1.35, grain: 0.045, aberr: 0.0018, scan: 0, tint: [1.08, 0.92, 0.92], exposure: 0.95 },
    sun: [0.3, 1.0, 0.2], ambient: '#2a0a0e', dir: '#ffb0a8',
    hudGlyph: '◉',
    audio: { root: 33, scale: [0, 1, 6, 7, 10], wave: 'sawtooth', drone: 'sawtooth', cutoff: 260, shimmer: 0.5, heartbeat: true },
  },

  // Sky: cloud sea far below, pearl-and-gold ice, dark storm enemies
  sky: {
    key: 'sky',
    name: 'Celestial',
    clear: '#1b2a4a',
    floor: { kind: 'sky', a: '#26406e', b: '#8fb3dc', c: '#ffd9a0', lightK: 0.02 },
    ice: {
      base: '#8a9cb8', top: '#fff7ea', deep: '#4a5c7c', edge: '#ffd27a', rim: '#cfe4ff', flash: [2.0, 1.7, 1.0], edgeDark: 0.12,
      edgeW: 0.07, edgeI: 0.25, rimP: 2.4, rimI: 0.35, alpha: 1, spark: 2.2, flashDecay: 420, lightK: 0.05,
      hMin: 0.6, hMax: 1.7, gap: 0.96, facets: true, sparkle: true, holo: false, grow: 650, contour: 1.2, tileI: 0.5, cap: 0.3,
    },
    trail: { color: [2.0, 1.4, 0.4], hot: [2.4, 2.2, 1.6] },
    hero: { color: [4.0, 3.2, 1.4], light: '#ffd27a', lightI: 1.2, spark: [3.0, 2.2, 0.8], kind: 'orb' },
    enemy: { style: 'PLASMA', a: '#3a2a6a', b: '#1c2450', core: '#bfe8ff', light: '#8ab8ff', lightI: 2.2, emit: 'sparks', ring: true },
    boss: { style: 'PLASMA', a: '#5a1a4a', b: '#26104a', core: '#ffd0f0', light: '#ff8ad0', lightI: 4, emit: 'sparks', ring: true },
    iceOrb: '#fff2d6',
    shards: { color: '#fff7ea', emissive: '#ffd27a', emissiveI: 0.5, opacity: 0.95, alt: '#8ab8ff' },
    burst: { kill: [1.6, 2.2, 3.4], killAlt: [3.2, 2.6, 1.2], steam: false, death: [3.2, 1.0, 0.8], capture: [3.2, 2.6, 1.4] },
    post: { bloom: [0.55, 0.5, 1.15], vignette: 0.55, grain: 0.01, aberr: 0.0, scan: 0, tint: [1.02, 1.0, 0.98], exposure: 1.0 },
    sun: [-0.3, 1.0, 0.5], ambient: '#8aa0c8', dir: '#fff2dc',
    hudGlyph: '✦',
    audio: { root: 50, scale: [0, 2, 4, 7, 9], wave: 'sine', drone: 'triangle', cutoff: 1400, shimmer: 1.6, chimes: true },
  },
};

// Region-contour and top-cap settings for the original three styles
Object.assign(THEMES.fire.ice, { contour: 0.55, tileI: 1, cap: 0 });
Object.assign(THEMES.neon.ice, { contour: 2.4, tileI: 0.1, cap: 1, gap: 1.0, top: '#1c2f7a', base: '#10235c' });
Object.assign(THEMES.cryo.ice, { contour: 1.2, tileI: 1, cap: 0 });

export const THEME_ORDER = ['fire', 'neon', 'cryo', 'cave', 'abyss', 'sky'];
