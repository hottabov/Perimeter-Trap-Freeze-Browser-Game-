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
const TILT = 0.34; // camera tilt from vertical, radians

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
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 4000);
    this.U = {
      uTime: { value: 0 }, uGameTime: { value: 0 },
      uLightPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uLightCol: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    };
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.4);
    this.scene.add(this.ambient, this.dir);

    this.composer = new EffectComposer(r);
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
    this.scheduled = [];
    this.heroY = 1;
    this.camBase = new THREE.Vector3();
    this.camFollow = new THREE.Vector3();

    game.on('*', (type, d) => this.onEvent(type, d));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- theme ---------- */
  setTheme(key) {
    const T = this.theme = THEMES[key];
    if (this.themeGroup) { this.disposeGroup(this.themeGroup); this.scene.remove(this.themeGroup); }
    this.themeGroup = new THREE.Group();
    this.scene.add(this.themeGroup);
    this.enemyViews.clear();
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
        uA: { value: hex(T.floor.a) }, uB: { value: hex(T.floor.b) }, uC: { value: hex(T.floor.c) },
        uLightK: { value: T.floor.lightK },
      },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG[T.floor.kind],
    });
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
        uHMax: { value: Math.max(I.hMax, 0.01) }, uEdgeDark: { value: I.edgeDark || 0 },
      },
      defines, vertexShader: ICE_VERT, fragmentShader: ICE_FRAG,
      transparent: !!I.holo, depthWrite: !I.holo, blending: I.holo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    this.heights = new Float32Array(n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = i % g.W, y = (i / g.W) | 0;
      const border = x === 0 || y === 0 || x === g.W - 1 || y === g.H - 1;
      const wave = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(y * 0.11) * 2) * Math.cos(y * 0.19 - x * 0.05);
      let h = I.hMin + (I.hMax - I.hMin) * (0.55 * seeds[i] + 0.45 * wave);
      if (border) h = Math.max(I.hMin, I.hMax * 0.85);
      this.heights[i] = h;
      m.makeScale(I.gap, h, I.gap);
      m.setPosition(x + 0.5 - g.W / 2, 0, y + 0.5 - g.H / 2);
      mesh.setMatrixAt(i, m);
    }
    this.iceMesh = mesh;
    this.worldGroup.add(mesh);
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
    else core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshBasicMaterial({ color: hdr(T.color) }));
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
    this.hero = { grp, core, halo, extras };
    this.themeGroup.add(grp);
  }

  makeEnemyView(e) {
    const T = e.boss ? this.theme.boss : this.theme.enemy;
    const grp = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.U.uTime, uA: { value: hex(T.a) }, uB: { value: hex(T.b) }, uCore: { value: hex(T.core) },
        uIce: { value: hex(this.theme.iceOrb) }, uFrozen: { value: 0 }, uSeed: { value: e.seed }, uHit: { value: 0 },
        uWobble: { value: T.style === 'BIO' ? 0.06 * e.r : T.style === 'FIRE' ? 0.035 * e.r : 0 },
      },
      defines: { ['STYLE_' + T.style]: '' }, vertexShader: ORB_VERT, fragmentShader: ORB_FRAG,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), mat);
    grp.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hex(T.light).multiplyScalar(0.45), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    halo.scale.setScalar(e.r * 4.2);
    grp.add(halo);
    const rings = [];
    if (T.ring) {
      const n = e.boss ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(e.r * (1.45 + k * 0.28), 0.045 * (e.boss ? 1.6 : 1), 8, 64),
          new THREE.MeshBasicMaterial({ color: hex(k % 2 ? T.b : T.a).multiplyScalar(3) }));
        ring.rotation.set(Math.PI / 2 + rnd(-0.6, 0.6), rnd(-0.6, 0.6), 0);
        ring.userData.spin = rnd(1.2, 2.4) * (k % 2 ? -1 : 1);
        grp.add(ring); rings.push(ring);
      }
    }
    const cubeGeo = new THREE.BoxGeometry(e.r * 2.5, e.r * 2.5, e.r * 2.5);
    const cube = new THREE.Group();
    cube.add(new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: hex(this.theme.iceOrb).multiplyScalar(0.9), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })));
    cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: hex(this.theme.iceOrb).multiplyScalar(3.5) })));
    cube.visible = false;
    cube.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3));
    grp.add(cube);
    this.themeGroup.add(grp);
    return { grp, mat, core, halo, rings, cube, T, emitAcc: 0 };
  }

  /* ---------- layout ---------- */
  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.mat.uniforms.uScale.value = (h * this.dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fitCamera();
  }

  fitCamera() {
    const g = this.game, cam = this.camera;
    const vf = (cam.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const hudPx = innerWidth < 640 ? 150 : 130;
    const frac = Math.max(0.55, (innerHeight - hudPx) / innerHeight);
    const needW = (g.W / 2 + 2) / Math.tan(hf / 2);
    const needH = ((g.H / 2 + 2) * Math.cos(TILT) + 2.5) / (Math.tan(vf / 2) * frac);
    const dist = Math.max(needW, needH);
    this.camDist = dist;
    this.camBase.set(0, dist * Math.cos(TILT), dist * Math.sin(TILT));
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
        this.fx.flash = Math.max(this.fx.flash, big ? 0.35 : 0.12);
        this.final.uniforms.uFlash.value.copy(hdr(T.burst.killAlt, 0.25));
        const s = this.worldToScreen(e.x, e.y, y);
        this.final.uniforms.uWarpCenter.value.set(s.x / innerWidth, 1 - s.y / innerHeight);
        this.fx.warp = 1;
        this.hitstop(big ? 170 : 70);
        break;
      }
      case 'lastKill':
        this.fx.slowUntil = performance.now() + 1100;
        break;
      case 'death': {
        const c = hdr(T.burst.death);
        for (const i of d.trail) P.spawn(i % g.W + 0.5 - W2, 0.3, ((i / g.W) | 0) + 0.5 - H2, rnd(-3, 3), rnd(3, 10), rnd(-3, 3), c, rnd(0.3, 0.6), rnd(500, 1100), -18, 1.2);
        P.burst(d.x - W2, this.heroY, d.y - H2, 140, c, 22, 0.55, 1000, { up: 0.8, grav: -16, drag: 1.6 });
        P.burst(d.x - W2, this.heroY, d.y - H2, 60, hdr(T.hero.color, 0.8), 30, 0.4, 700, { up: 0.5 });
        this.fx.shake += 1.8;
        this.fx.aberr = 0.02;
        this.fx.flash = 0.45;
        this.final.uniforms.uFlash.value.set(0.5, 0.05, 0.03);
        this.hitstop(140);
        break;
      }
      case 'respawn': {
        const hp = g.heroRenderPos();
        P.burst(hp.x - W2, this.heroY, hp.y - H2, 50, hdr(T.hero.spark), 10, 0.4, 600, { up: 0.3, grav: 0, drag: 3 });
        break;
      }
      case 'clear':
        this.scheduleWave(g.t, d.duration, 600);
        this.fx.punch = 1; this.fx.flash = 0.2;
        this.final.uniforms.uFlash.value.copy(hdr(T.burst.capture, 0.2));
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
    if (g.freezeDirty && this.freezeAttr) { this.freezeAttr.needsUpdate = true; g.freezeDirty = false; }
    if (g.trailDirty && this.trailAttr) { this.trailAttr.needsUpdate = true; g.trailDirty = false; }

    // wave sparkles
    if (this.scheduled.length) {
      const c = hdr(T.burst.capture);
      const W2 = g.W / 2, H2 = g.H / 2;
      this.scheduled = this.scheduled.filter(s => {
        if (g.t < s.at) return true;
        const x = s.i % g.W + 0.5 - W2, z = ((s.i / g.W) | 0) + 0.5 - H2;
        const top = this.heights[s.i] || 1;
        this.particles.spawn(x + rnd(-.4, .4), top + 0.2, z + rnd(-.4, .4), rnd(-0.8, 0.8), rnd(2, 6), rnd(-0.8, 0.8), c, rnd(0.2, 0.45), rnd(350, 800), -6, 1.2);
        return false;
      });
    }

    this.updateHero(realDt, gameDt);
    this.updateEnemies(realDt, gameDt);
    this.particles.update(gameDt);
    this.shards.update(gameDt);
    this.updateCamera(realDt);

    // post FX decay
    const fx = this.fx, fu = this.final.uniforms;
    fx.aberr *= Math.exp(-realDt / 160);
    fx.flash *= Math.exp(-realDt / 140);
    fx.warp = Math.max(0, fx.warp - realDt / 650);
    fu.uAberr.value = T.post.aberr + fx.aberr;
    fu.uFlashAmt.value = fx.flash;
    fu.uWarp.value = fx.warp;
    fu.uTime.value = U.uTime.value;
    this.trailMat.uniforms.uDanger.value = 0;
    this.composer.render();
  }

  updateHero(realDt, gameDt) {
    const g = this.game, h = g.hero, v = this.hero, T = this.theme.hero;
    const hp = g.heroRenderPos();
    const i = g.idx(h.x, h.y);
    let target = 0.6;
    if (!h.carving && g.cells[i] === SOLID && g.t >= g.freezeAt[i]) {
      const k = Math.min(1, (g.t - g.freezeAt[i]) / this.theme.ice.grow);
      target = this.heights[i] * k + 0.55;
    }
    this.heroY += (target - this.heroY) * (1 - Math.exp(-realDt / 45));
    const x = hp.x - g.W / 2, z = hp.y - g.H / 2;
    v.grp.position.set(x, this.heroY, z);
    const tt = this.U.uTime.value;
    v.core.rotation.y = tt * 2.2; v.core.rotation.x = tt * 1.3;
    v.extras.forEach((e, k) => { if (e.isMesh) { e.rotation.z = tt * (k ? -1.5 : 1.8); e.rotation.y = tt * 0.7; } });
    v.halo.scale.setScalar(3.6 + Math.sin(tt * 6) * 0.4 + (h.carving ? 1.0 : 0));
    const blink = g.t < h.invulnUntil && Math.floor(g.t / 90) % 2 === 0;
    v.grp.visible = g.state !== 'dying' && g.state !== 'gameover' && !blink;
    // hero light
    const L = this.U.uLightPos.value[0];
    L.set(x, this.heroY + 1.2, z, v.grp.visible ? T.lightI : 0);
    this.U.uLightCol.value[0].copy(hex(T.light));
    // sparks trail
    if (v.grp.visible && h.moving && g.state === 'playing') {
      const c = hdr(T.spark);
      const n = h.carving ? 2 : 1;
      for (let k = 0; k < n; k++) this.particles.spawn(x + rnd(-.25, .25), this.heroY + rnd(-.2, .2), z + rnd(-.25, .25), rnd(-.6, .6), rnd(0.5, 2), rnd(-.6, .6), c, rnd(0.18, 0.4), rnd(250, 520), -2, 2);
    }
  }

  updateEnemies(realDt, gameDt) {
    const g = this.game, P = this.particles, tt = this.U.uTime.value;
    const seen = new Set();
    let li = 1;
    for (const e of g.enemies) {
      let v = this.enemyViews.get(e.id);
      if (!v) { v = this.makeEnemyView(e); this.enemyViews.set(e.id, v); }
      seen.add(e.id);
      const T = v.T;
      const x = e.x - g.W / 2, z = e.y - g.H / 2;
      let y = e.r * 0.95 + Math.sin(tt * 2.5 + e.seed * 10) * 0.12;
      let k = 0;
      if (e.state === 'frozen' && g.t >= e.freezeAt) {
        k = Math.min(1, (g.t - e.freezeAt) / 220);
        y += k * 0.9;
        const jitter = g.t > e.shatterAt - 180 ? 0.12 : 0;
        v.grp.position.set(x + rnd(-jitter, jitter), y, z + rnd(-jitter, jitter));
      } else v.grp.position.set(x, y, z);
      v.mat.uniforms.uFrozen.value = k;
      v.cube.visible = k > 0;
      if (k > 0) {
        const s = k < 1 ? 1 + 1.9 * Math.pow(k - 1, 3) + 0.9 * Math.pow(k - 1, 2) : 1;
        v.cube.scale.setScalar(Math.max(0.01, s));
      }
      v.halo.material.opacity = 0.8 * (1 - k * 0.7);
      v.rings.forEach(r => { r.rotation.z += r.userData.spin * realDt / 1000 * (1 - k); });
      if (li < 8) {
        const flick = T.style === 'FIRE' ? 0.8 + 0.25 * Math.sin(tt * 23 + e.seed * 40) + 0.15 * Math.sin(tt * 37) : 0.9 + 0.1 * Math.sin(tt * 4 + e.seed * 9);
        this.U.uLightPos.value[li].set(x, y + 0.6, z, T.lightI * flick * (1 - k * 0.85));
        this.U.uLightCol.value[li].copy(hex(T.light));
        li++;
      }
      // emitters
      if (e.state === 'alive') {
        v.emitAcc += gameDt;
        const every = T.emit === 'embers' ? 22 : T.emit === 'motes' ? 30 : 45;
        while (v.emitAcc > every) {
          v.emitAcc -= every;
          const c = hex(Math.random() < 0.5 ? T.a : T.b).multiplyScalar(2.2);
          if (T.emit === 'embers') {
            const a = Math.random() * 6.28, rr = e.r * 0.7;
            P.spawn(x + Math.cos(a) * rr, y + rnd(0, e.r * 0.6), z + Math.sin(a) * rr, rnd(-0.6, 0.6), rnd(2.5, 5.5), rnd(-0.6, 0.6), c.multiplyScalar(1.3), rnd(0.2, 0.45) * (e.boss ? 1.5 : 1), rnd(500, 1000), 1.5, 1.2);
          } else if (T.emit === 'motes') {
            P.spawn(x - e.vx * e.r + rnd(-0.4, 0.4), y + rnd(-0.3, 0.3), z - e.vy * e.r + rnd(-0.4, 0.4), -e.vx * 0.5 + rnd(-0.3, 0.3), rnd(-0.2, 0.4), -e.vy * 0.5 + rnd(-0.3, 0.3), c, rnd(0.3, 0.6) * (e.boss ? 1.5 : 1), rnd(900, 1500), 0, 0.6);
          } else {
            const a = Math.random() * 6.28;
            P.spawn(x, y, z, Math.cos(a) * 5, rnd(-1, 1), Math.sin(a) * 5, c.multiplyScalar(1.4), rnd(0.15, 0.3), rnd(200, 400), 0, 3);
          }
        }
      }
    }
    for (; li < 8; li++) this.U.uLightPos.value[li].w = 0;
    for (const [id, v] of this.enemyViews) {
      if (!seen.has(id)) { this.disposeGroup(v.grp); this.themeGroup.remove(v.grp); this.enemyViews.delete(id); }
    }
  }

  updateCamera(realDt) {
    const g = this.game, cam = this.camera, fx = this.fx;
    const hp = g.heroRenderPos();
    const tt = this.U.uTime.value;
    const follow = g.state === 'title' ? 0 : 0.04;
    const fx_ = (hp.x - g.W / 2) * follow, fz = (hp.y - g.H / 2) * follow;
    this.camFollow.x += (fx_ - this.camFollow.x) * (1 - Math.exp(-realDt / 400));
    this.camFollow.z += (fz - this.camFollow.z) * (1 - Math.exp(-realDt / 400));
    const idle = g.state === 'title' ? 1 : 0;
    const swayX = Math.sin(tt * 0.25) * this.camDist * 0.03 * idle;
    fx.shake = Math.min(3, fx.shake) * Math.exp(-realDt / 170);
    fx.punch *= Math.exp(-realDt / 260);
    const sh = fx.shake * 0.6;
    const dolly = 1 - fx.punch * 0.035;
    cam.position.set(
      this.camBase.x * dolly + this.camFollow.x + swayX + rnd(-sh, sh),
      this.camBase.y * dolly + rnd(-sh, sh) * 0.5,
      this.camBase.z * dolly + this.camFollow.z + rnd(-sh, sh),
    );
    cam.lookAt(this.camFollow.x + swayX * 0.3, 0, this.camFollow.z);
  }
}
