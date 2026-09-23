// Three.js 2.5D renderer: gameplay stays a 2D grid, visuals are 3D.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { THEMES } from './themes.js';
import { SOLID } from './core.js';
import {
  ICE_VERT, ICE_FRAG, TRAIL_VERT, TRAIL_FRAG, FLOOR_VERT, FLOOR_FRAG,
  ORB_VERT, ORB_FRAG, PART_VERT, PART_FRAG, FinalShader,
} from './shaders.js';

const hex = (h) => new THREE.Color(h);
const hdr = (a, k = 1) => new THREE.Color(a[0] * k, a[1] * k, a[2] * k);
const rnd = (a, b) => a + Math.random() * (b - a);
const TILT = 0.6;    // camera tilt from vertical, radians (steeper = more 3D)
const FOLLOW = 0.14; // how far the camera drifts toward the hero (fraction of half-field)
const MASK_PAD = 10;  // cells of padding around the grid in the floor mask texture

// Power-up icons drawn once on a canvas: hourglass, lightning, shield, heart
const iconTextures = {};
function getIconTexture(type) {
  if (iconTextures[type]) return iconTextures[type];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2); x.scale(S / 100, S / 100);
  x.lineJoin = 'round'; x.lineCap = 'round';
  x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 8;
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineWidth = 7;
  x.beginPath();
  if (type === 'slow') { // hourglass
    x.moveTo(-22, -32); x.lineTo(22, -32); x.lineTo(3, -2); x.lineTo(22, 32); x.lineTo(-22, 32); x.lineTo(-3, -2); x.closePath();
    x.stroke();
    x.beginPath(); x.moveTo(-12, 26); x.lineTo(12, 26); x.lineTo(0, 12); x.closePath(); x.fill();
  } else if (type === 'haste') { // lightning bolt
    x.moveTo(8, -36); x.lineTo(-20, 6); x.lineTo(-2, 6); x.lineTo(-10, 36); x.lineTo(20, -8); x.lineTo(2, -8); x.closePath(); x.fill();
  } else if (type === 'shield') {
    x.moveTo(0, -34); x.bezierCurveTo(12, -26, 24, -26, 28, -26); x.bezierCurveTo(30, 6, 18, 24, 0, 36);
    x.bezierCurveTo(-18, 24, -30, 6, -28, -26); x.bezierCurveTo(-24, -26, -12, -26, 0, -34); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(0, -20); x.lineTo(0, 24); x.stroke();
  } else { // heart
    x.moveTo(0, 32); x.bezierCurveTo(-40, 6, -30, -32, 0, -14); x.bezierCurveTo(30, -32, 40, 6, 0, 32); x.closePath(); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (iconTextures[type] = tex);
}

let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/* ---------------- particle system ---------------- */
class Particles {
  constructor(scene, N) {
    this.N = N; this.cursor = 0;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3); this.size = new Float32Array(N); this.size0 = new Float32Array(N);
    this.alpha = new Float32Array(N); this.a0 = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.grow = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, c, size, life, grav = 0, drag = 0, alpha = 1, grow = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size[i] = this.size0[i] = size; this.alpha[i] = this.a0[i] = alpha;
    this.life[i] = this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  burst(x, y, z, n, c, speed, size, life, opts = {}) {
    const { up = 0.4, grav = -14, drag = 1.5, spread = 1, jitter = 0.3, alpha = 1, grow = 0 } = opts;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      const vy = speed * up * (0.3 + Math.random());
      const cc = c.clone().multiplyScalar(0.7 + Math.random() * 0.6);
      this.spawn(x + rnd(-jitter, jitter), y, z + rnd(-jitter, jitter), Math.cos(a) * s * spread, vy, Math.sin(a) * s * spread,
        cc, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.7), grav, drag, alpha, grow);
    }
  }
  update(dtMs) {
    const dt = dtMs / 1000;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dtMs;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05 && this.vel[i3 + 1] < 0) { this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] *= -0.3; }
      this.alpha[i] = this.a0[i] * Math.min(1, k * 1.6);
      this.size[i] = this.size0[i] * (this.grow[i] ? (1 + (1 - k) * this.grow[i]) : (0.35 + 0.65 * k));
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}

/* ---------------- ice shards ---------------- */
class Shards {
  constructor(scene, N) {
    this.N = N; this.cursor = 0;
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.25, flatShading: true, transparent: true });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
    this.p = Array.from({ length: N }, () => ({ life: 0 }));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.v = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, zero);
    scene.add(this.mesh);
  }
  setTheme(T) {
    this.mat.color = hex(T.shards.color); this.mat.emissive = hex(T.shards.emissive);
    this.mat.emissiveIntensity = T.shards.emissiveI; this.mat.opacity = T.shards.opacity;
    this.alt = hex(T.shards.alt);
  }
  burst(x, y, z, n, power, altFrac = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      const a = Math.random() * Math.PI * 2, s = power * (0.3 + Math.random());
      this.p[i] = {
        x, y, z, vx: Math.cos(a) * s, vy: power * (0.6 + Math.random() * 1.1), vz: Math.sin(a) * s,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: rnd(-12, 12), wy: rnd(-12, 12), wz: rnd(-12, 12),
        sx: rnd(0.4, 1.1), sy: rnd(0.8, 2.3), sz: rnd(0.4, 1.0), sc: rnd(0.6, 1.5),
        life: rnd(900, 1700), max: 0,
      };
      this.p[i].max = this.p[i].life;
      const c = Math.random() < altFrac ? this.alt : new THREE.Color(1, 1, 1);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dtMs) {
    const dt = dtMs / 1000;
    let any = false;
    for (let i = 0; i < this.N; i++) {
      const p = this.p[i];
      if (p.life <= 0) { if (p.max) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); p.max = 0; any = true; } continue; }
      any = true;
      p.life -= dtMs;
      p.vy -= 32 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.15) { p.y = 0.15; p.vy *= -0.32; p.vx *= 0.55; p.vz *= 0.55; p.wx *= 0.6; p.wy *= 0.6; }
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const k = Math.min(1, p.life / (p.max * 0.35));
      this.e.set(p.rx, p.ry, p.rz); this.q.setFromEuler(this.e);
      this.s.set(p.sx * p.sc * k, p.sy * p.sc * k, p.sz * p.sc * k);
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- renderer ---------------- */
export class Renderer {
  constructor(game, parent) {
    this.game = game;
    const r = this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    r.setPixelRatio(this.dpr);
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    parent.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 4000);
    this.U = {
      uTime: { value: 0 }, uGameTime: { value: 0 }, uSink: { value: 0 }, uHarden: { value: 0 },
      uLightPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uLightCol: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    };
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.4);
    this.scene.add(this.ambient, this.dir);

    // MSAA on the composer target removes the shimmer on thin ice edges and grid lines
    const rt = new THREE.WebGLRenderTarget(innerWidth * this.dpr, innerHeight * this.dpr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1, 0.5, 0.5);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    const fu = this.final.uniforms;
    fu.uTint.value = new THREE.Vector3(1, 1, 1); fu.uRes.value = new THREE.Vector2(innerWidth, innerHeight);
    fu.uFlash.value = new THREE.Color(); fu.uWarpCenter.value = new THREE.Vector2(0.5, 0.5);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    this.particles = new Particles(this.scene, 7000);
    this.shards = new Shards(this.scene, 800);

    this.fx = { shake: 0, aberr: 0, flash: 0, warp: 0, punch: 0, hitstopUntil: 0, slowUntil: 0 };
    this.enemyViews = new Map();
    this.sparxViews = new Map();
    this.puView = null;
    this.sink = null;
    this.perf = { ema: 16, frames: 0, lastCheck: 0 };
    this.scheduled = [];
    this.heroY = 1;
    this.camBase = new THREE.Vector3();
    this.camFollow = new THREE.Vector3();

    game.on('*', (type, d) => this.onEvent(type, d));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- theme ---------- */
  setTheme(theme) {
    const T = this.theme = typeof theme === 'string' ? THEMES[theme] : theme;
    T.hunter ||= T.enemy; T.splitter ||= T.enemy;
    T.sparx ||= { color: [4, 3.4, 1.2], light: '#ffd35c' };
    T.powerups ||= { slow: '#8f7bff', haste: '#5dff9a', shield: '#ffd24a', life: '#ff4d6d' };
    if (this.themeGroup) { this.disposeGroup(this.themeGroup); this.scene.remove(this.themeGroup); }
    this.themeGroup = new THREE.Group();
    this.scene.add(this.themeGroup);
    this.enemyViews.clear();
    this.sparxViews.clear();
    this.puView = null;
    this.scene.background = hex(T.clear);
    this.ambient.color = hex(T.ambient); this.ambient.intensity = 1.0;
    this.dir.color = hex(T.dir); this.dir.intensity = 1.6;
    this.dir.position.set(T.sun[0] * 100, T.sun[1] * 100, T.sun[2] * 100);
    this.buildWorld();
    this.buildHero();
    this.shards.setTheme(T);
    const [bs, br, bt] = T.post.bloom;
    this.bloom.strength = bs; this.bloom.radius = br; this.bloom.threshold = bt;
    const fu = this.final.uniforms;
    fu.uVignette.value = T.post.vignette; fu.uGrain.value = T.post.grain; fu.uScan.value = T.post.scan;
    fu.uTint.value.set(...T.post.tint);
    this.gl.toneMappingExposure = T.post.exposure;
  }

  disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }

  buildWorld() {
    if (!this.theme) return;
    if (this.worldGroup) { this.disposeGroup(this.worldGroup); this.themeGroup.remove(this.worldGroup); }
    const g = this.game, T = this.theme;
    this.worldGroup = new THREE.Group();
    this.themeGroup.add(this.worldGroup);
    this.buildFloor(T, g);
    this.buildIce(T, g);
    this.buildTrail(T, g);
    this.fitCamera();
  }

  buildFloor(T, g) {
    const geo = new THREE.PlaneGeometry(Math.max(g.W, g.H) * 6, Math.max(g.W, g.H) * 6);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.U.uTime, uLightPos: this.U.uLightPos, uLightCol: this.U.uLightCol,
        uField: { value: new THREE.Vector2(g.W, g.H) },
        uMask: { value: this.maskTex || null }, uPad: { value: MASK_PAD },
        uA: { value: hex(T.floor.a) }, uB: { value: hex(T.floor.b) }, uC: { value: hex(T.floor.c) },
        uLightK: { value: T.floor.lightK },
      },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG[T.floor.kind],
    });
    this.floorMat = mat;
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -0.02;
    this.worldGroup.add(m);
  }

  buildIce(T, g) {
    const I = T.ice, n = g.W * g.H;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.freezeAttr = new THREE.InstancedBufferAttribute(g.freezeAt, 1);
    this.freezeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFreeze', this.freezeAttr);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.crackAttr = new THREE.InstancedBufferAttribute(g.iceDmg, 1);
    this.crackAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCrack', this.crackAttr);
    this.openMask = new Float32Array(n);
    this.openAttr = new THREE.InstancedBufferAttribute(this.openMask, 1);
    this.openAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOpen', this.openAttr);
    this.computeOpen();
    const defines = {};
    if (I.facets) defines.FACETS = '';
    if (I.sparkle) defines.SPARKLE = '';
    if (I.holo) defines.HOLO = '';
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uGameTime: this.U.uGameTime, uTime: this.U.uTime, uLightPos: this.U.uLightPos, uLightCol: this.U.uLightCol,
        uGrow: { value: I.grow }, uBase: { value: hex(I.base) }, uTop: { value: hex(I.top) }, uDeep: { value: hex(I.deep) },
        uEdge: { value: hex(I.edge) }, uRim: { value: hex(I.rim) }, uFlash: { value: hdr(I.flash) },
        uEdgeW: { value: I.edgeW }, uEdgeI: { value: I.edgeI }, uRimP: { value: I.rimP }, uRimI: { value: I.rimI },
        uAlpha: { value: I.alpha }, uSpark: { value: I.spark }, uFlashDecay: { value: I.flashDecay },
        uSunDir: { value: new THREE.Vector3(...T.sun) }, uLightK: { value: I.lightK },
        uHMax: { value: Math.max(I.hMax, 0.01) }, uEdgeDark: { value: I.edgeDark || 0 }, uSink: this.U.uSink,
        uContour: { value: I.contour ?? 0.6 }, uTileI: { value: I.tileI ?? 1 }, uCap: { value: I.cap || 0 },
        uHarden: this.U.uHarden,
      },
      defines, vertexShader: ICE_VERT, fragmentShader: ICE_FRAG,
      transparent: !!I.holo, depthWrite: !I.holo, blending: I.holo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    this.heights = new Float32Array(n);
    this.baseH = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % g.W, y = (i / g.W) | 0;
      const wave = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(y * 0.11) * 2) * Math.cos(y * 0.19 - x * 0.05);
      this.baseH[i] = I.hMin + (I.hMax - I.hMin) * (0.55 * seeds[i] + 0.45 * wave);
    }
    this.iceMesh = mesh;
    this.applyShape();
    this.worldGroup.add(mesh);
  }

  // Arena shape: the wall band gets an even height, void cells outside the arena are not drawn
  applyShape() {
    const g = this.game, mesh = this.iceMesh, n = g.W * g.H;
    if (!mesh || !this.baseH || this.baseH.length !== n) return;
    const I = this.theme.ice, m = new THREE.Matrix4();
    const frameH = Math.max(I.hMin, I.hMax * 0.85);
    for (let i = 0; i < n; i++) {
      const sh = g.shape[i], x = i % g.W, y = (i / g.W) | 0;
      const h = sh === 1 ? frameH : this.baseH[i];
      this.heights[i] = h;
      if (sh === 2) m.makeScale(0, 0, 0); else m.makeScale(I.gap, h, I.gap);
      m.setPosition(x + 0.5 - g.W / 2, 0, y + 0.5 - g.H / 2);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.updateFloorMask();
  }

  // Soft mask of the arena for the floor shaders: 1 on the field and its wall, fading to 0 outside
  updateFloorMask() {
    const g = this.game, P = MASK_PAD, w = g.W + 2 * P, h = g.H + 2 * P;
    if (!this.maskTex || this.maskTex.image.width !== w || this.maskTex.image.height !== h) {
      if (this.maskTex) this.maskTex.dispose();
      this.maskTex = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat);
      this.maskTex.magFilter = this.maskTex.minFilter = THREE.LinearFilter;
      this.maskTex.wrapS = this.maskTex.wrapT = THREE.ClampToEdgeWrapping;
      if (this.floorMat) this.floorMat.uniforms.uMask.value = this.maskTex;
    }
    const dist = new Int16Array(w * h).fill(-1), q = new Int32Array(w * h);
    let qb = 0, qe = 0;
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      if (g.shape[y * g.W + x] === 2) continue;
      const j = (y + P) * w + x + P; dist[j] = 0; q[qe++] = j;
    }
    while (qb < qe) {
      const j = q[qb++], x = j % w, y = (j / w) | 0, d = dist[j] + 1;
      if (d > P) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (dist[k] < 0) { dist[k] = d; q[qe++] = k; }
      }
    }
    const data = this.maskTex.image.data;
    for (let j = 0; j < w * h; j++) {
      const d = dist[j] < 0 ? 99 : dist[j];
      const t = Math.min(1, Math.max(0, d / 6));
      const v = Math.round(255 * (1 - t * t * (3 - 2 * t)));
      data[j * 4] = data[j * 4 + 1] = data[j * 4 + 2] = v; data[j * 4 + 3] = 255;
    }
    this.maskTex.needsUpdate = true;
  }

  // Per-cell bitmask of sides that face open field (1:-x 2:+x 4:-z 8:+z); drives the region outline
  computeOpen() {
    const g = this.game, W = g.W, H = g.H, c = g.cells, o = this.openMask;
    if (!o || o.length !== W * H) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (c[i] !== SOLID) { o[i] = 0; continue; }
      let m = 0;
      if (x > 0 && c[i - 1] !== SOLID) m |= 1;
      if (x < W - 1 && c[i + 1] !== SOLID) m |= 2;
      if (y > 0 && c[i - W] !== SOLID) m |= 4;
      if (y < H - 1 && c[i + W] !== SOLID) m |= 8;
      if (g.mine[i]) m |= 16; // player ice: flashes when it sets hard
      o[i] = m;
    }
    if (this.openAttr) this.openAttr.needsUpdate = true;
  }

  buildTrail(T, g) {
    const n = g.W * g.H;
    const geo = new THREE.BoxGeometry(1, 0.28, 1);
    geo.translate(0, 0.14, 0);
    this.trailAttr = new THREE.InstancedBufferAttribute(g.trailAt, 1);
    this.trailAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTrail', this.trailAttr);
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: { uGameTime: this.U.uGameTime, uTime: this.U.uTime, uColor: { value: hdr(T.trail.color) }, uHot: { value: hdr(T.trail.hot) }, uDanger: { value: 0 } },
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
    });
    const mesh = new THREE.InstancedMesh(geo, this.trailMat, n);
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(i % g.W + 0.5 - g.W / 2, 0.02, ((i / g.W) | 0) + 0.5 - g.H / 2);
      mesh.setMatrixAt(i, m);
    }
    this.worldGroup.add(mesh);
  }

  buildHero() {
    const T = this.theme.hero;
    const grp = new THREE.Group();
    let core;
    if (T.kind === 'frost') core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: hdr(T.color) }));
    else core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshBasicMaterial({ color: hdr(T.color) }));
    grp.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hdr(T.color, 0.07), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(4);
    grp.add(halo);
    const extras = [];
    if (T.kind === 'orb') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: hdr(T.color, 0.9) }));
      ring.rotation.x = Math.PI / 2; grp.add(ring); extras.push(ring);
    }
    if (T.kind === 'laser') {
      for (const rot of [0, Math.PI / 2]) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hdr(T.color, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, rotation: rot }));
        f.scale.set(9, 0.35, 1); grp.add(f); extras.push(f);
      }
    }
    if (T.kind === 'frost') {
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), new THREE.MeshBasicMaterial({ color: hdr(T.color, 0.6), wireframe: true }));
      grp.add(inner); extras.push(inner);
    }
    // shield bubble (power-up)
    const sc = hex(this.theme.powerups.shield);
    const shield = new THREE.Group();
    shield.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), new THREE.MeshBasicMaterial({ color: sc.clone().multiplyScalar(2.2), wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    shield.add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color: sc.clone().multiplyScalar(0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
    shield.visible = false;
    grp.add(shield);
    this.hero = { grp, core, halo, extras, shield };
    this.themeGroup.add(grp);
  }

  orbMaterial(T, style, e) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.U.uTime, uA: { value: hex(T.a) }, uB: { value: hex(T.b) }, uCore: { value: hex(T.core) },
        uIce: { value: hex(this.theme.iceOrb) }, uFrozen: { value: 0 }, uSeed: { value: e.seed }, uHit: { value: 0 },
        uWobble: { value: style === 'BIO' ? 0.06 * e.r : style === 'FIRE' ? 0.035 * e.r : style === 'MAGMA' ? 0.02 * e.r : 0 },
        uLook: { value: new THREE.Vector3(0, 1, 0) },
      },
      defines: { ['STYLE_' + style]: '' }, vertexShader: ORB_VERT, fragmentShader: ORB_FRAG,
    });
  }

  makeEnemyView(e) {
    const TH = this.theme;
    const T = e.type === 'boss' ? TH.boss : e.type === 'hunter' ? TH.hunter : e.type === 'splitter' ? TH.splitter : TH.enemy;
    const style = TH.enemy.style;
    const grp = new THREE.Group();
    const body = new THREE.Group();
    grp.add(body);
    const mat = this.orbMaterial(T, style, e);
    const cores = [];
    if (e.type === 'splitter') {
      for (let k = 0; k < 2; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(e.r * 0.62, 32, 22), mat); body.add(c); cores.push(c); }
    } else {
      const c = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), mat);
      if (e.type === 'hunter') c.scale.set(1.4, 0.78, 0.78);
      body.add(c); cores.push(c);
    }
    if (e.type === 'hunter') {
      // swept-back fins make the hunter read as "pointed at you"
      const finMat = new THREE.MeshBasicMaterial({ color: hex(T.b).multiplyScalar(2.2) });
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(e.r * 0.28, e.r * 1.3, 6), finMat);
        fin.rotation.z = Math.PI / 2; fin.rotation.y = s * 0.55;
        fin.position.set(-e.r * 1.05, 0, s * e.r * 0.55);
        body.add(fin);
      }
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hex(T.light).multiplyScalar(0.45), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    halo.scale.setScalar(e.r * 4.2);
    grp.add(halo);
    const rings = [];
    const ringCount = e.type === 'boss' ? e.hp : (T.ring ? (T.rings || 1) : 0);
    for (let k = 0; k < ringCount; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(e.r * (1.35 + k * 0.24), 0.05 * (e.boss ? 1.6 : 1), 8, 64),
        new THREE.MeshBasicMaterial({ color: hex(k % 2 ? T.b : T.a).multiplyScalar(3) }));
      ring.rotation.set(Math.PI / 2 + rnd(-0.6, 0.6), rnd(-0.6, 0.6), 0);
      ring.userData.spin = rnd(1.2, 2.4) * (k % 2 ? -1 : 1);
      grp.add(ring); rings.push(ring);
    }
    const cubeGeo = new THREE.BoxGeometry(e.r * 2.5, e.r * 2.5, e.r * 2.5);
    const cube = new THREE.Group();
    cube.add(new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: hex(TH.iceOrb).multiplyScalar(0.9), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })));
    cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: hex(TH.iceOrb).multiplyScalar(3.5) })));
    cube.visible = false;
    cube.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3));
    grp.add(cube);
    this.themeGroup.add(grp);
    return { grp, body, mat, cores, halo, rings, cube, T, emitAcc: 0, r0: e.r, emit: TH.enemy.emit };
  }

  makeSparxView() {
    const S = this.theme.sparx;
    const grp = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: hdr(S.color) }));
    grp.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hdr(S.color, 0.16), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(3.4);
    grp.add(halo);
    this.themeGroup.add(grp);
    return { grp, core, halo, y: 1 };
  }

  makePowerupView(p) {
    const col = hex(this.theme.powerups[p.type]);
    const grp = new THREE.Group();
    const float = new THREE.Group();
    grp.add(float);
    // soft glowing core
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: col.clone().multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(3.2);
    float.add(glow);
    // faceted glass shell that turns slowly
    const shellGeo = new THREE.IcosahedronGeometry(1.05, 0);
    const shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    shell.add(new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo), new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.2), transparent: true, opacity: 0.9 })));
    float.add(shell);
    // icon, always facing the camera, drawn on top
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: getIconTexture(p.type), color: new THREE.Color(1.5, 1.5, 1.5), transparent: true, depthTest: false, depthWrite: false }));
    icon.scale.setScalar(1.45);
    icon.renderOrder = 20;
    float.add(icon);
    // three motes orbiting the shell
    const motes = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3) }));
      float.add(m); motes.push(m);
    }
    // landing ring on the floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    grp.add(ring);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.35), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05;
    grp.add(shadow);
    this.themeGroup.add(grp);
    return { grp, float, glow, shell, icon, motes, ring, shadow, p, col, landed: false };
  }

  /* ---------- level transition ---------- */
  // Ice sinks into the floor, then `mid` runs (new theme + new level) and the new field rises.
  transition(mid, ms = 750) {
    this.sink = { t0: performance.now(), ms, mid, fired: false };
  }

  /* ---------- layout ---------- */
  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.mat.uniforms.uScale.value = (h * this.dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fitCamera();
  }

  // Find the closest camera distance at which the whole field (plus room for the follow offset)
  // projects inside the screen area between the HUD bars. Solved numerically because the
  // steep tilt makes the near edge much wider on screen than the far edge.
  fitCamera() {
    const g = this.game;
    const cam = this._fitCam ||= new THREE.PerspectiveCamera();
    cam.fov = this.camera.fov; cam.aspect = this.camera.aspect; cam.near = 1; cam.far = 5000; cam.updateProjectionMatrix();
    const topPx = innerWidth < 640 ? 84 : 74, botPx = innerWidth < 640 ? 96 : 70;
    const yTop = 1 - (2 * topPx) / innerHeight, yBot = -1 + (2 * botPx) / innerHeight;
    const ex = (g.W / 2 + 1.5) * (1 + FOLLOW), ez = (g.H / 2 + 1.5) * (1 + FOLLOW);
    const pts = [];
    for (const x of [-ex, ex]) for (const z of [-ez, ez]) for (const y of [0, 2]) pts.push(new THREE.Vector3(x, y, z));
    const v = new THREE.Vector3();
    const fits = (D) => {
      cam.position.set(0, D * Math.cos(TILT), D * Math.sin(TILT));
      cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      for (const p of pts) {
        v.copy(p).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 0.97 || v.y > yTop || v.y < yBot) return false;
      }
      return true;
    };
    let lo = 10, hi = 3000;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    // vertical centring: the field is framed slightly low so the far edge clears the top HUD
    this.camDist = hi;
    this.camBase.set(0, hi * Math.cos(TILT), hi * Math.sin(TILT));
  }

  worldToScreen(cx, cy, y = 1) {
    const v = new THREE.Vector3(cx - this.game.W / 2, y, cy - this.game.H / 2).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }

  /* ---------- time FX ---------- */
  timeScale(now) {
    if (now < this.fx.hitstopUntil) return 0.04;
    if (now < this.fx.slowUntil) return 0.3;
    return 1;
  }
  hitstop(ms) { this.fx.hitstopUntil = Math.max(this.fx.hitstopUntil, performance.now() + ms); }

  cellTop(i) {
    const g = this.game;
    if (g.cells[i] !== SOLID || g.t < g.freezeAt[i]) return 0.4;
    const k = Math.min(1, (g.t - g.freezeAt[i]) / this.theme.ice.grow);
    return this.heights[i] * k * (1 - this.U.uSink.value) + 0.45;
  }

  flashScreen(color, amt) {
    this.fx.flash = Math.max(this.fx.flash, amt);
    this.final.uniforms.uFlash.value.copy(color);
  }

  warpAt(cx, cy, y) {
    const s = this.worldToScreen(cx, cy, y);
    this.final.uniforms.uWarpCenter.value.set(s.x / innerWidth, 1 - s.y / innerHeight);
    this.fx.warp = 1;
  }

  /* ---------- events ---------- */
  onEvent(type, d) {
    const g = this.game, T = this.theme;
    if (!T) return;
    const P = this.particles;
    const W2 = g.W / 2, H2 = g.H / 2;
    switch (type) {
      case 'grid':
        this.buildWorld();
        break;
      case 'field':
        this.applyShape();
        this.scheduled.length = 0;
        if (this.freezeAttr) this.freezeAttr.needsUpdate = true;
        break;
      case 'level':
        this.scheduled.length = 0;
        if (this.freezeAttr) this.freezeAttr.needsUpdate = true;
        break;
      case 'carveStart': {
        const hp = g.heroRenderPos();
        P.burst(hp.x - W2, this.heroY, hp.y - H2, 14, hdr(T.hero.spark), 7, 0.35, 350, { up: 0.6, grav: -6 });
        break;
      }
      case 'capture': {
        const c = hdr(T.burst.capture);
        for (const i of d.trail) {
          if (Math.random() < 0.55) P.spawn(i % g.W + 0.5 - W2 + rnd(-.4, .4), 0.4, ((i / g.W) | 0) + 0.5 - H2 + rnd(-.4, .4), rnd(-1, 1), rnd(4, 9), rnd(-1, 1), c, rnd(0.25, 0.5), rnd(400, 800), -10, 1.5);
        }
        this.scheduleWave(d.t, d.maxDelay, 260);
        this.fx.punch = Math.min(1, 0.25 + d.pct / 20);
        this.fx.shake += Math.min(0.5, d.pct / 30);
        break;
      }
      case 'shatter': {
        const e = d.e, x = e.x - W2, z = e.y - H2, y = e.r + 0.8;
        const big = e.boss;
        this.shards.burst(x, y, z, big ? 120 : 46, big ? 16 : 11, 0.25);
        P.burst(x, y, z, big ? 160 : 70, hdr(T.burst.kill), big ? 26 : 18, 0.5, 900, { up: 0.7, grav: -16, drag: 2 });
        P.burst(x, y, z, big ? 90 : 40, hdr(T.burst.killAlt), big ? 20 : 12, 0.35, 700, { up: 0.9, grav: -10, drag: 2 });
        if (T.burst.steam) P.burst(x, y, z, big ? 50 : 24, new THREE.Color(0.35, 0.38, 0.42), 3, 2.2, 1900, { up: 1.4, grav: 2.5, drag: 1.2, alpha: 0.35, grow: 2.2, jitter: e.r });
        this.fx.shake += big ? 1.6 : 0.75;
        this.fx.aberr = Math.max(this.fx.aberr, big ? 0.014 : 0.007);
        this.flashScreen(hdr(T.burst.killAlt, 0.25), big ? 0.35 : 0.12);
        this.warpAt(e.x, e.y, y);
        this.hitstop(big ? 170 : 70);
        break;
      }
      case 'bossHit': {
        const e = d.e;
        this.fx.shake += 1.2;
        this.fx.aberr = Math.max(this.fx.aberr, 0.012);
        this.flashScreen(hdr(T.burst.killAlt, 0.3), 0.25);
        this.hitstop(120);
        break;
      }
      case 'bossBreak': {
        const e = d.e, f = d.from;
        this.shards.burst(f.x - W2, e.r + 1, f.y - H2, 90, 14, 0.4);
        P.burst(f.x - W2, e.r + 1, f.y - H2, 120, hdr(T.burst.kill), 22, 0.5, 900, { up: 0.6 });
        P.burst(e.x - W2, e.r, e.y - H2, 60, hdr(T.burst.kill), 12, 0.5, 700, { up: 0.3, grav: 0, drag: 3 });
        const v = this.enemyViews.get(e.id);
        if (v && v.rings.length > e.hp) { const r = v.rings.pop(); v.grp.remove(r); r.geometry.dispose(); r.material.dispose(); }
        this.fx.shake += 1.4;
        this.warpAt(f.x, f.y, e.r);
        break;
      }
      case 'split': {
        const e = d.e;
        P.burst(e.x - W2, e.r, e.y - H2, 60, hdr(T.burst.kill), 14, 0.4, 600, { up: 0.4 });
        this.fx.shake += 0.4;
        break;
      }
      case 'lastKill':
        this.fx.slowUntil = performance.now() + 1100;
        break;
      case 'goalReached':
        this.flashScreen(hdr(T.burst.capture, 0.25), 0.3);
        this.fx.punch = 1;
        break;
      case 'death': {
        const c = hdr(T.burst.death);
        for (const i of d.trail) P.spawn(i % g.W + 0.5 - W2, 0.3, ((i / g.W) | 0) + 0.5 - H2, rnd(-3, 3), rnd(3, 10), rnd(-3, 3), c, rnd(0.3, 0.6), rnd(500, 1100), -18, 1.2);
        P.burst(d.x - W2, this.heroY, d.y - H2, 140, c, 22, 0.55, 1000, { up: 0.8, grav: -16, drag: 1.6 });
        P.burst(d.x - W2, this.heroY, d.y - H2, 60, hdr(T.hero.color, 0.8), 30, 0.4, 700, { up: 0.5 });
        this.fx.shake += 1.8;
        this.fx.aberr = 0.02;
        this.flashScreen(new THREE.Color(0.5, 0.05, 0.03), 0.45);
        this.hitstop(140);
        break;
      }
      case 'respawn': {
        const hp = g.heroRenderPos();
        P.burst(hp.x - W2, this.heroY, hp.y - H2, 50, hdr(T.hero.spark), 10, 0.4, 600, { up: 0.3, grav: 0, drag: 3 });
        break;
      }
      case 'shieldBreak': {
        const c = hex(T.powerups.shield).multiplyScalar(3);
        P.burst(d.x - W2, this.heroY, d.y - H2, 90, c, 16, 0.4, 700, { up: 0.4, grav: -4 });
        this.fx.shake += 0.8;
        this.flashScreen(hex(T.powerups.shield).multiplyScalar(0.3), 0.25);
        this.hitstop(90);
        break;
      }
      case 'sparxSpawn': {
        const s = d.s;
        P.burst(s.x + 0.5 - W2, 1.5, s.y + 0.5 - H2, 50, hdr(T.sparx.color, 0.8), 9, 0.35, 600, { up: 0.8, grav: -8 });
        break;
      }
      case 'iceCrack': {
        const top = this.cellTop(g.idx(Math.floor(d.x), Math.floor(d.y)));
        P.burst(d.x - W2, Math.max(0.5, top - 0.3), d.y - H2, 7, hdr(T.burst.killAlt, 0.7), 5, 0.22, 380, { up: 0.9, grav: -14, jitter: 0.2 });
        break;
      }
      case 'iceBreak': {
        const c = hdr(T.burst.killAlt, 0.9);
        const per = Math.max(2, Math.min(8, Math.floor(70 / d.cells.length)));
        for (const i of d.cells) {
          const x = i % g.W + 0.5 - W2, z = ((i / g.W) | 0) + 0.5 - H2, y = (this.heights[i] || 1) * 0.6;
          this.shards.burst(x, y, z, per, 8, 0.15);
          P.burst(x, y, z, 10, c, 7, 0.32, 550, { up: 0.9, jitter: 0.45 });
          P.burst(x, 0.3, z, 3, new THREE.Color(0.25, 0.28, 0.32), 2, 1.4, 900, { up: 0.6, grav: 1, drag: 2, alpha: 0.35, grow: 1.5 });
        }
        this.fx.shake += Math.min(0.6, 0.15 + d.cells.length * 0.05);
        break;
      }
      case 'sparxShatter': {
        const s = d.s, p = g.sparxRenderPos(s);
        const x = p.x - W2, z = p.y - H2, y = this.cellTop(g.idx(s.x, s.y)) + 0.4;
        this.shards.burst(x, y, z, 36, 10, 0.5);
        P.burst(x, y, z, 90, hdr(T.sparx.color, 0.9), 18, 0.4, 800, { up: 0.8, grav: -12 });
        P.burst(x, y, z, 40, hdr(T.burst.killAlt), 12, 0.35, 700, { up: 0.9 });
        this.fx.shake += 0.8;
        this.flashScreen(hdr(T.sparx.color, 0.08), 0.2);
        this.warpAt(p.x, p.y, y);
        this.hitstop(90);
        break;
      }
      case 'sparxDie': {
        const s = d.s;
        P.burst(s.x + 0.5 - W2, 1.5, s.y + 0.5 - H2, 40, hdr(T.sparx.color, 0.8), 8, 0.35, 500, { up: 0.6 });
        break;
      }
      case 'powerSpawn': {
        const p = d.p;
        P.burst(p.x + 0.5 - W2, 0.5, p.y + 0.5 - H2, 40, hex(T.powerups[p.type]).multiplyScalar(3), 6, 0.35, 700, { up: 1.5, grav: -3 });
        break;
      }
      case 'powerup': {
        const p = d.p, col = hex(T.powerups[p.type]);
        P.burst(p.x + 0.5 - W2, 1.2, p.y + 0.5 - H2, 110, col.clone().multiplyScalar(3), 16, 0.4, 800, { up: 0.8, grav: -8 });
        this.flashScreen(col.clone().multiplyScalar(0.3), 0.22);
        this.fx.punch = Math.max(this.fx.punch, 0.5);
        break;
      }
      case 'powerExpire': {
        const p = d.p;
        P.burst(p.x + 0.5 - W2, 1, p.y + 0.5 - H2, 24, hex(T.powerups[p.type]).multiplyScalar(1.5), 4, 0.3, 500, { up: 0.5 });
        break;
      }
      case 'clear':
        this.scheduleWave(g.t, d.duration, 600);
        this.fx.punch = 1;
        this.flashScreen(hdr(T.burst.capture, 0.2), 0.2);
        break;
    }
  }

  // Spark particles that follow the freeze wave front
  scheduleWave(t0, dur, maxN) {
    const g = this.game, list = [];
    for (let i = 0; i < g.freezeAt.length; i++) {
      const f = g.freezeAt[i];
      if (f >= t0 - 1 && f <= t0 + dur + 1) list.push(i);
    }
    const step = Math.max(1, Math.floor(list.length / maxN));
    for (let k = 0; k < list.length; k += step) {
      const i = list[(k + ((Math.random() * step) | 0)) % list.length];
      this.scheduled.push({ i, at: g.freezeAt[i] + 60 });
    }
  }

  /* ---------- per-frame ---------- */
  update(realDt, gameDt) {
    const g = this.game, T = this.theme, U = this.U;
    U.uTime.value += realDt / 1000;
    U.uGameTime.value = g.t;
    U.uHarden.value = g.state === 'title' ? 0 : g.hardenMs || 0;
    this.adaptQuality(realDt);

    if (this.sink) {
      const p = (performance.now() - this.sink.t0) / this.sink.ms;
      U.uSink.value = Math.min(1, p);
      if (p >= 1 && !this.sink.fired) {
        this.sink.fired = true;
        const mid = this.sink.mid;
        this.sink = null;
        mid();
        U.uSink.value = 0;
      }
    }

    if (g.freezeDirty && this.freezeAttr) { this.freezeAttr.needsUpdate = true; g.freezeDirty = false; this.computeOpen(); }
    if (g.trailDirty && this.trailAttr) { this.trailAttr.needsUpdate = true; g.trailDirty = false; }
    if (g.crackDirty && this.crackAttr) { this.crackAttr.needsUpdate = true; g.crackDirty = false; }

    if (this.scheduled.length) {
      const c = hdr(this.theme.burst.capture);
      const W2 = g.W / 2, H2 = g.H / 2;
      this.scheduled = this.scheduled.filter(s => {
        if (g.t < s.at) return true;
        const x = s.i % g.W + 0.5 - W2, z = ((s.i / g.W) | 0) + 0.5 - H2;
        const top = this.heights[s.i] || 1;
        this.particles.spawn(x + rnd(-.4, .4), top + 0.2, z + rnd(-.4, .4), rnd(-0.8, 0.8), rnd(2, 6), rnd(-0.8, 0.8), c, rnd(0.2, 0.45), rnd(350, 800), -6, 1.2);
        return false;
      });
    }

    this.li = 1;
    this.updateHero(realDt, gameDt);
    this.updateSparxViews(realDt, gameDt);
    this.updatePowerupView(realDt);
    this.updateEnemies(realDt, gameDt);
    for (let k = this.li; k < 8; k++) U.uLightPos.value[k].w = 0;
    this.particles.update(gameDt);
    this.shards.update(gameDt);
    this.updateCamera(realDt);

    const fx = this.fx, fu = this.final.uniforms;
    fx.aberr *= Math.exp(-realDt / 160);
    fx.flash *= Math.exp(-realDt / 140);
    fx.warp = Math.max(0, fx.warp - realDt / 650);
    fu.uAberr.value = T.post.aberr + fx.aberr;
    fu.uFlashAmt.value = fx.flash;
    fu.uWarp.value = fx.warp;
    fu.uTime.value = U.uTime.value;
    // slow-time power-up: cold desaturated grade
    const slowK = g.slowed ? 1 : 0;
    fx.slowK = (fx.slowK || 0) + (slowK - (fx.slowK || 0)) * (1 - Math.exp(-realDt / 200));
    fu.uTint.value.set(T.post.tint[0] * (1 - 0.18 * fx.slowK), T.post.tint[1] * (1 - 0.05 * fx.slowK), T.post.tint[2] * (1 + 0.2 * fx.slowK));
    fu.uVignette.value = T.post.vignette + 0.25 * fx.slowK;
    this.composer.render();
  }

  // Drop resolution if the device can't keep up (checked every 2 s, only ever steps down)
  adaptQuality(realDt) {
    const p = this.perf;
    p.ema += (realDt - p.ema) * 0.05;
    p.frames++;
    const now = performance.now();
    if (p.frames < 120 || now - p.lastCheck < 2000) return;
    p.lastCheck = now;
    if (p.ema > 24 && this.dpr > 0.75) {
      this.dpr = Math.max(0.75, this.dpr > 1.1 ? 1 : this.dpr - 0.25);
      this.resize();
      p.frames = 0;
    }
  }

  updateHero(realDt, gameDt) {
    const g = this.game, h = g.hero, v = this.hero, T = this.theme.hero;
    const hp = g.heroRenderPos();
    const i = g.idx(h.x, h.y);
    const target = h.carving ? 0.6 : this.cellTop(i) + 0.15;
    this.heroY += (target - this.heroY) * (1 - Math.exp(-realDt / 45));
    const x = hp.x - g.W / 2, z = hp.y - g.H / 2;
    v.grp.position.set(x, this.heroY, z);
    const tt = this.U.uTime.value;
    v.core.rotation.y = tt * 2.2; v.core.rotation.x = tt * 1.3;
    v.extras.forEach((e, k) => { if (e.isMesh) { e.rotation.z = tt * (k ? -1.5 : 1.8); e.rotation.y = tt * 0.7; } });
    v.halo.scale.setScalar(3.6 + Math.sin(tt * 6) * 0.4 + (h.carving ? 1.0 : 0));
    v.shield.visible = g.effects.shield;
    if (v.shield.visible) { v.shield.rotation.y = tt * 0.8; v.shield.rotation.x = tt * 0.5; v.shield.scale.setScalar(1 + Math.sin(tt * 5) * 0.04); }
    const blink = g.t < h.invulnUntil && Math.floor(g.t / 90) % 2 === 0;
    v.grp.visible = g.state !== 'dying' && g.state !== 'gameover' && !blink && !this.sink;
    const L = this.U.uLightPos.value[0];
    L.set(x, this.heroY + 1.2, z, v.grp.visible ? T.lightI : 0);
    this.U.uLightCol.value[0].copy(hex(T.light));
    if (v.grp.visible && h.moving && g.state === 'playing') {
      const c = hdr(T.spark);
      const n = (h.carving ? 2 : 1) + (g.hasted ? 2 : 0);
      for (let k = 0; k < n; k++) this.particles.spawn(x + rnd(-.25, .25), this.heroY + rnd(-.2, .2), z + rnd(-.25, .25), rnd(-.6, .6), rnd(0.5, 2), rnd(-.6, .6), c, rnd(0.18, 0.4), rnd(250, 520), -2, 2);
    }
  }

  updateSparxViews(realDt, gameDt) {
    const g = this.game, S = this.theme.sparx, tt = this.U.uTime.value;
    const seen = new Set();
    for (const s of g.sparx) {
      let v = this.sparxViews.get(s.id);
      if (!v) { v = this.makeSparxView(); this.sparxViews.set(s.id, v); v.y = this.cellTop(g.idx(s.x, s.y)) + 0.35; }
      seen.add(s.id);
      const p = g.sparxRenderPos(s);
      const target = this.cellTop(g.idx(s.x, s.y)) + 0.35;
      v.y += (target - v.y) * (1 - Math.exp(-realDt / 60));
      const x = p.x - g.W / 2, z = p.y - g.H / 2;
      v.grp.position.set(x, v.y, z);
      v.core.rotation.y = tt * 9; v.core.rotation.z = tt * 5;
      v.halo.scale.setScalar(3 + Math.sin(tt * 18 + s.id) * 0.6);
      if (this.li < 8) { this.U.uLightPos.value[this.li].set(x, v.y + 0.8, z, 1.4); this.U.uLightCol.value[this.li].copy(hex(S.light)); this.li++; }
      if (Math.random() < gameDt / 12) this.particles.spawn(x + rnd(-.2, .2), v.y, z + rnd(-.2, .2), rnd(-1.5, 1.5), rnd(0.5, 3), rnd(-1.5, 1.5), hdr(S.color, 0.8), rnd(0.12, 0.28), rnd(200, 420), -6, 2);
    }
    for (const [id, v] of this.sparxViews) {
      if (!seen.has(id)) { this.disposeGroup(v.grp); this.themeGroup.remove(v.grp); this.sparxViews.delete(id); }
    }
  }

  updatePowerupView(realDt) {
    const g = this.game, p = g.powerup, tt = this.U.uTime.value;
    if (this.puView && this.puView.p !== p) { this.disposeGroup(this.puView.grp); this.themeGroup.remove(this.puView.grp); this.puView = null; }
    if (!p) return;
    if (!this.puView) this.puView = this.makePowerupView(p);
    const v = this.puView;
    const x = p.x + 0.5 - g.W / 2, z = p.y + 0.5 - g.H / 2;
    const age = g.t - p.spawnAt, left = p.expireAt - g.t;
    // drop in from above with a small bounce, then hover
    const drop = Math.min(1, age / 550);
    const bounce = drop < 1 ? (1 - drop) * (1 - drop) * 9 : 0;
    const hover = 1.25 + Math.sin(tt * 2.2) * 0.14;
    if (drop >= 1 && !v.landed) {
      v.landed = true;
      this.particles.burst(x, 0.4, z, 30, v.col.clone().multiplyScalar(2.5), 7, 0.3, 600, { up: 0.5, grav: -6 });
    }
    // fade out over the last 3 s: blink faster as time runs out
    const warn = left < 3000 ? 0.55 + 0.45 * Math.cos(tt * (8 + (3000 - left) / 200)) : 1;
    const shrink = left < 400 ? Math.max(0.01, left / 400) : 1;
    v.grp.position.set(x, 0, z);
    v.grp.scale.setScalar(2);
    v.float.position.y = hover + bounce;
    v.float.scale.setScalar(Math.min(1, 0.4 + drop) * shrink);
    v.shell.rotation.y = tt * 0.9; v.shell.rotation.x = tt * 0.4;
    v.glow.material.opacity = 0.85 * warn;
    v.glow.scale.setScalar(3 + Math.sin(tt * 5) * 0.25);
    v.icon.material.opacity = warn;
    v.motes.forEach((m, k) => {
      const a = tt * 2.4 + (k * Math.PI * 2) / 3;
      m.position.set(Math.cos(a) * 1.45, Math.sin(a * 1.3) * 0.35, Math.sin(a) * 1.45);
    });
    const rp = (tt * 0.7) % 1;
    v.ring.scale.setScalar(0.8 + rp * 1.2);
    v.ring.material.opacity = 0.7 * (1 - rp) * warn * (v.landed ? 1 : 0);
    v.shadow.material.opacity = 0.45 * warn * drop;
    if (this.li < 8) { this.U.uLightPos.value[this.li].set(x, hover * 2 + 0.5, z, 2.4 * warn); this.U.uLightCol.value[this.li].copy(v.col); this.li++; }
  }

  updateEnemies(realDt, gameDt) {
    const g = this.game, P = this.particles, tt = this.U.uTime.value;
    const seen = new Set();
    for (const e of g.enemies) {
      let v = this.enemyViews.get(e.id);
      if (!v) { v = this.makeEnemyView(e); this.enemyViews.set(e.id, v); }
      seen.add(e.id);
      const T = v.T;
      const x = e.x - g.W / 2, z = e.y - g.H / 2;
      let y = e.r * 0.95 + Math.sin(tt * 2.5 + e.seed * 10) * 0.12;
      let k = 0;
      const iced = (e.state === 'frozen' || e.state === 'encased') && g.t >= e.freezeAt;
      if (iced) {
        k = Math.min(1, (g.t - e.freezeAt) / 220);
        y += k * 0.9;
        const until = e.state === 'frozen' ? e.shatterAt : e.breakAt;
        const jitter = g.t > until - 220 ? (e.state === 'encased' ? 0.3 : 0.12) : 0;
        v.grp.position.set(x + rnd(-jitter, jitter), y, z + rnd(-jitter, jitter));
      } else v.grp.position.set(x, y, z);
      v.mat.uniforms.uFrozen.value = k;
      v.cube.visible = k > 0;
      if (k > 0) {
        const s = k < 1 ? 1 + 1.9 * Math.pow(k - 1, 3) + 0.9 * Math.pow(k - 1, 2) : 1;
        v.cube.scale.setScalar(Math.max(0.01, s) * (e.r / v.r0));
      }
      // shape per type
      const sc = e.r / v.r0;
      v.body.scale.setScalar(sc);
      if (v.mat.defines.STYLE_EYE !== undefined) {
        // eyes watch the hero (tilted up toward the camera); convert to the body's local frame
        const hp = g.heroRenderPos();
        let lx = hp.x - e.x, lz = hp.y - e.y;
        const ln = Math.hypot(lx, lz) || 1; lx /= ln; lz /= ln;
        const ry = e.type === 'hunter' ? -Math.atan2(e.vy, e.vx) : 0;
        const c = Math.cos(-ry), s = Math.sin(-ry);
        v.mat.uniforms.uLook.value.set(lx * c + lz * s, 1.1, -lx * s + lz * c).normalize();
      }
      if (e.type === 'hunter') {
        v.body.rotation.y = -Math.atan2(e.vy, e.vx);
        const hunt = e.hunting ? 1 : 0;
        v.halo.scale.setScalar(e.r * (4.2 + hunt * (2 + Math.sin(tt * 14))));
      } else if (e.type === 'splitter') {
        const left = Math.max(0, (e.splitAt - g.t) / 1000);
        const sep = e.r * (0.42 + (left < 1.6 ? (1.6 - left) * 0.35 : 0));
        const a = tt * (2 + (left < 1.6 ? 6 : 0));
        v.cores[0].position.set(Math.cos(a) * sep, 0, Math.sin(a) * sep);
        v.cores[1].position.set(-Math.cos(a) * sep, 0, -Math.sin(a) * sep);
      }
      v.halo.material.opacity = 0.8 * (1 - k * 0.7);
      v.rings.forEach(r => { r.rotation.z += r.userData.spin * realDt / 1000 * (1 - k); });
      if (this.li < 8) {
        const flick = v.emit === 'embers' ? 0.8 + 0.25 * Math.sin(tt * 23 + e.seed * 40) + 0.15 * Math.sin(tt * 37) : 0.9 + 0.1 * Math.sin(tt * 4 + e.seed * 9);
        this.U.uLightPos.value[this.li].set(x, y + 0.6, z, (T.lightI || 3) * flick * (1 - k * 0.85) * (e.boss ? 1.4 : 1));
        this.U.uLightCol.value[this.li].copy(hex(T.light));
        this.li++;
      }
      if (e.state === 'alive') {
        v.emitAcc += gameDt;
        const every = v.emit === 'embers' ? 22 : v.emit === 'motes' ? 30 : 45;
        while (v.emitAcc > every) {
          v.emitAcc -= every;
          const c = hex(Math.random() < 0.5 ? T.a : T.b).multiplyScalar(2.2);
          if (v.emit === 'embers') {
            const a = Math.random() * 6.28, rr = e.r * 0.7;
            P.spawn(x + Math.cos(a) * rr, y + rnd(0, e.r * 0.6), z + Math.sin(a) * rr, rnd(-0.6, 0.6), rnd(2.5, 5.5), rnd(-0.6, 0.6), c.multiplyScalar(1.3), rnd(0.2, 0.45) * (e.boss ? 1.5 : 1), rnd(500, 1000), 1.5, 1.2);
          } else if (v.emit === 'motes') {
            P.spawn(x - e.vx * e.r + rnd(-0.4, 0.4), y + rnd(-0.3, 0.3), z - e.vy * e.r + rnd(-0.4, 0.4), -e.vx * 0.5 + rnd(-0.3, 0.3), rnd(-0.2, 0.4), -e.vy * 0.5 + rnd(-0.3, 0.3), c, rnd(0.3, 0.6) * (e.boss ? 1.5 : 1), rnd(900, 1500), 0, 0.6);
          } else {
            const a = Math.random() * 6.28;
            P.spawn(x, y, z, Math.cos(a) * 5, rnd(-1, 1), Math.sin(a) * 5, c.multiplyScalar(1.4), rnd(0.15, 0.3), rnd(200, 400), 0, 3);
          }
        }
      }
    }
    for (const [id, v] of this.enemyViews) {
      if (!seen.has(id)) { this.disposeGroup(v.grp); this.themeGroup.remove(v.grp); this.enemyViews.delete(id); }
    }
  }

  updateCamera(realDt) {
    const g = this.game, cam = this.camera, fx = this.fx;
    const hp = g.heroRenderPos();
    const tt = this.U.uTime.value;
    const title = g.state === 'title';
    const follow = title ? 0 : FOLLOW;
    // target drifts toward the hero; the camera also orbits a little around it (parallax)
    const nx = (hp.x - g.W / 2) / (g.W / 2), nz = (hp.y - g.H / 2) / (g.H / 2);
    const tx = nx * (g.W / 2) * follow, tz = nz * (g.H / 2) * follow;
    const k = 1 - Math.exp(-realDt / 260);
    this.camFollow.x += (tx - this.camFollow.x) * k;
    this.camFollow.z += (tz - this.camFollow.z) * k;
    const wantYaw = title ? Math.sin(tt * 0.18) * 0.22 : nx * 0.1;
    const wantPitch = title ? 0 : -nz * 0.05;
    this.camYaw = (this.camYaw || 0) + (wantYaw - (this.camYaw || 0)) * (1 - Math.exp(-realDt / 500));
    this.camPitch = (this.camPitch || 0) + (wantPitch - (this.camPitch || 0)) * (1 - Math.exp(-realDt / 500));
    // slight push-in while a line is being drawn
    const carveK = g.hero && g.hero.carving ? 1 : 0;
    this.camCarve = (this.camCarve || 0) + (carveK - (this.camCarve || 0)) * (1 - Math.exp(-realDt / 400));
    fx.shake = Math.min(3, fx.shake) * Math.exp(-realDt / 170);
    fx.punch *= Math.exp(-realDt / 260);
    const sh = fx.shake * 0.6;
    const dolly = 1 - fx.punch * 0.035 - this.camCarve * 0.035 + (this.U.uSink.value * 0.05);
    const D = this.camDist * dolly, tilt = TILT + this.camPitch;
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    cam.position.set(
      this.camFollow.x + D * Math.sin(tilt) * sy + rnd(-sh, sh),
      D * Math.cos(tilt) + rnd(-sh, sh) * 0.5,
      this.camFollow.z + D * Math.sin(tilt) * cy + rnd(-sh, sh),
    );
    cam.lookAt(this.camFollow.x, 0, this.camFollow.z);
  }
}
