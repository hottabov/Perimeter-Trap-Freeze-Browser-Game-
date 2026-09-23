// Shared GLSL snippets and shader sources
export const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return v; }
float vnoise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1)), h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,g,u.x),mix(h,k,u.x),u.y), u.z); }
float fbm3(vec3 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*vnoise3(p); p=p*2.02+11.7; a*=.5; } return v; }
`;

export const LIGHTS = /* glsl */`
uniform vec4 uLightPos[8];
uniform vec3 uLightCol[8];
vec3 pointLights(vec3 W, vec3 N, float falloff){
  vec3 acc = vec3(0.);
  for(int i=0;i<8;i++){
    vec4 lp = uLightPos[i];
    if(lp.w > 0.){
      vec3 L = lp.xyz - W; float d2 = dot(L,L);
      float att = lp.w / (1. + d2*falloff);
      acc += uLightCol[i] * att * (0.2 + 0.8*max(dot(N, normalize(L)), 0.));
    }
  }
  return acc;
}
`;

/* ---------------- ICE COLUMNS ---------------- */
export const ICE_VERT = /* glsl */`
attribute float aFreeze;
attribute float aSeed;
uniform float uGameTime;
uniform float uGrow;
uniform float uHMax;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vAge; varying float vSeed; varying float vT; varying float vHN;
float easeOutBack(float x){ float c1=1.9; float c3=c1+1.; return 1.+c3*pow(x-1.,3.)+c1*pow(x-1.,2.); }
void main(){
  float age = uGameTime - aFreeze;
  float t = clamp(age/uGrow, 0., 1.);
  float g = age < 0. ? 0. : easeOutBack(t);
  vec3 p = position;
  p.y *= g;
  p.xz *= age < 0. ? 0. : mix(0.35, 1.0, min(1., t*2.5));
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vL = position - vec3(0., .5, 0.);
  vAge = age; vSeed = aSeed; vT = t;
  vHN = clamp(instanceMatrix[1][1] / uHMax, 0., 1.);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ICE_FRAG = /* glsl */`
uniform vec3 uBase; uniform vec3 uTop; uniform vec3 uDeep; uniform vec3 uEdge; uniform vec3 uRim; uniform vec3 uFlash;
uniform float uEdgeW; uniform float uEdgeI; uniform float uRimP; uniform float uRimI; uniform float uAlpha;
uniform float uSpark; uniform float uTime; uniform float uFlashDecay; uniform vec3 uSunDir; uniform float uLightK;
uniform float uEdgeDark;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vAge; varying float vSeed; varying float vT; varying float vHN;
${NOISE}
${LIGHTS}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 a = abs(vL) * 2.;
  float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z));
  float e2 = a.x + a.y + a.z - mx - mn;
  float edge = smoothstep(1. - uEdgeW, 1., e2);
  float top = smoothstep(0.5, 0.9, N.y);
  float h = vL.y + .5;
  vec3 col = mix(uDeep, uBase, h);
  vec3 topCol = mix(uBase, uTop, smoothstep(0.2, 1.0, vHN)) * (0.88 + 0.24 * vSeed);
  col = mix(col, topCol, top);
#ifdef FACETS
  // crystalline facets inside the ice
  float f = fbm(vW.xz * 0.9 + vW.y * 0.6 + vSeed * 7.);
  col *= 0.8 + 0.45 * smoothstep(0.35, 0.75, f);
  col += uRim * 0.25 * smoothstep(0.62, 0.66, f);
#endif
  float ndl = max(dot(N, normalize(uSunDir)), 0.);
  col *= 0.5 + 0.7 * ndl;
  float fr = pow(1. - max(dot(N, V), 0.), uRimP);
  col += uRim * fr * uRimI;
  col *= 1. - uEdgeDark * edge;
  col += uEdge * edge * uEdgeI;
  col += pointLights(vW, N, uLightK) * (0.35 + 0.35 * top);
#ifdef SPARKLE
  vec3 q = floor(vW * 5.);
  float hs = hash13(q);
  float tw = pow(max(0., sin(uTime * 2.3 + hs * 60.)), 30.);
  col += uTop * step(0.9, hs) * tw * uSpark * top;
#endif
  float fl = vAge >= 0. ? exp(-vAge / uFlashDecay) : 0.;
  col += uFlash * fl;
  float alpha = uAlpha;
#ifdef HOLO
  float scan = 0.55 + 0.45 * sin(vW.y * 30. - uTime * 5. + vSeed * 6.);
  float lines = smoothstep(0.92, 1., fract(vW.y * 3. - uTime * 0.4));
  alpha = uAlpha * (0.18 + 0.82 * max(edge, fr * 0.8)) * scan + lines * 0.12 + fl * 0.5;
  col *= 1. + lines * 1.5;
#endif
  gl_FragColor = vec4(col, alpha);
}`;

/* ---------------- TRAIL ---------------- */
export const TRAIL_VERT = /* glsl */`
attribute float aTrail;
uniform float uGameTime;
varying float vAge; varying vec3 vL; varying vec3 vW;
void main(){
  float age = uGameTime - aTrail;
  vec3 p = position;
  float on = aTrail < 0. ? 0. : 1.;
  float pop = on * (1. + 0.9 * exp(-age / 90.));
  p.xz *= on * (0.55 + 0.45 * min(1., age / 60.));
  p.y *= pop;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
  vAge = age; vL = position; vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const TRAIL_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uHot; uniform float uTime; uniform float uDanger;
varying float vAge; varying vec3 vL; varying vec3 vW;
void main(){
  float fresh = exp(-vAge / 220.);
  float pulse = 0.75 + 0.25 * sin(uTime * 14. - vAge * 0.012);
  vec3 col = uColor * pulse + uHot * fresh;
  col = mix(col, vec3(4., 0.6, 0.4), uDanger * (0.5 + 0.5 * sin(uTime * 30.)));
  gl_FragColor = vec4(col, 1.);
}`;

/* ---------------- FLOORS ---------------- */
export const FLOOR_VERT = /* glsl */`
varying vec3 vW; varying vec2 vUv;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const FLOOR_HEAD = /* glsl */`
uniform float uTime; uniform vec2 uField; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uLightK;
varying vec3 vW; varying vec2 vUv;
${NOISE}
${LIGHTS}
float fieldMask(vec2 p){ vec2 d = abs(p) - uField*0.5; return 1. - smoothstep(0., 6., max(d.x, d.y)); }
`;

export const FLOOR_FRAG = {
  // Night lake: dark water, moving ripples, reflections of the fire enemies
  lake: FLOOR_HEAD + /* glsl */`
void main(){
  vec2 p = vW.xz;
  float t = uTime;
  vec2 q = p * 0.03 + vec2(t * 0.012, t * 0.008);
  float n = 0.6 * vnoise(q) + 0.3 * vnoise(q * 2.1 + 3.7) + 0.1 * vnoise(q * 4.3 + 9.1);
  float nx = (0.6 * vnoise(q + vec2(0.4, 0.)) + 0.3 * vnoise((q + vec2(0.4, 0.)) * 2.1 + 3.7)) - (n - 0.1 * vnoise(q * 4.3 + 9.1));
  float nz = (0.6 * vnoise(q + vec2(0., 0.4)) + 0.3 * vnoise((q + vec2(0., 0.4)) * 2.1 + 3.7)) - (n - 0.1 * vnoise(q * 4.3 + 9.1));
  float rip = sin(p.x * 0.5 + t * 0.9) * sin(p.y * 0.43 - t * 0.7) * 0.015;
  vec3 N = normalize(vec3(nx * 1.2 + rip, 1., nz * 1.2 + rip));
  vec3 V = normalize(cameraPosition - vW);
  float m = fieldMask(p);
  vec3 col = mix(uA, uB, 0.3 + 0.45 * smoothstep(0.25, 0.8, n));
  // fine wind ripples
  float f1 = vnoise(p * 0.7 + vec2(t * 0.4, -t * 0.3)) - 0.5;
  float f2 = vnoise(p * 0.7 + vec2(5.2 - t * 0.35, 1.3 + t * 0.25)) - 0.5;
  N = normalize(N + vec3(f1 * 0.08, 0., f2 * 0.08));
  // moonlight sheen
  vec3 R = reflect(-V, N);
  float moon = pow(max(dot(R, normalize(vec3(-0.25, 0.7, -0.65))), 0.), 14.);
  col += uC * moon * 0.12;
  // reflections / glow pools of lights on water
  vec3 acc = vec3(0.);
  for(int i=0;i<8;i++){
    vec4 lp = uLightPos[i];
    if(lp.w > 0.){
      vec3 L = lp.xyz - vW; float d2 = dot(L.xz, L.xz);
      vec3 H = normalize(normalize(L) + V);
      float spec = pow(max(dot(N, H), 0.), 40.) * 0.8;
      acc += uLightCol[i] * lp.w * (0.3 / (1. + d2 * 0.07) + spec / (1. + d2 * 0.03));
    }
  }
  col += acc * 0.3;
  // snowy shore outside the field
  float snow = fbm(p * 0.09) * 0.5 + 0.5;
  vec3 shore = vec3(0.004, 0.006, 0.01) * snow;
  col = mix(shore, col, m);
  gl_FragColor = vec4(col, 1.);
}`,

  // Synthwave neon grid floor
  grid: FLOOR_HEAD + /* glsl */`
float gridLine(vec2 g, float w){ vec2 f = abs(fract(g - 0.5) - 0.5) / (fwidth(g) * w); return 1. - min(min(f.x, f.y), 1.); }
void main(){
  vec2 p = vW.xz + uField * 0.5;
  float m = fieldMask(vW.xz);
  float major = gridLine(p / 8., 1.4);
  float minor = gridLine(p, 1.);
  float pulse = 0.6 + 0.4 * sin(uTime * 1.3 - length(vW.xz) * 0.06);
  vec3 col = uA;
  col += uB * major * (0.45 + 0.35 * pulse) * m;
  col += uC * minor * 0.05 * m;
  // horizon glow outside the field
  float out_ = 1. - m;
  col += uB * out_ * 0.08 * (0.5 + 0.5 * sin(p.x * 0.05 + uTime));
  col += uB * gridLine(p / 16., 1.2) * out_ * 0.18;
  col += pointLights(vW, vec3(0.,1.,0.), uLightK) * 0.45;
  gl_FragColor = vec4(col, 1.);
}`,

  // Deep space void with nebula and star field
  void: FLOOR_HEAD + /* glsl */`
void main(){
  vec2 p = vW.xz;
  float m = fieldMask(p);
  float neb = fbm(p * 0.018 + vec2(uTime * 0.004, 0.));
  float neb2 = fbm(p * 0.03 - vec2(0., uTime * 0.006) + 5.);
  vec3 col = uA;
  col += uB * pow(neb, 2.4) * 0.55;
  col += uC * pow(neb2, 3.6) * 0.12;
  // stars
  vec2 sc = floor(p * 1.2);
  float h = hash12(sc);
  vec2 sp = fract(p * 1.2) - 0.5 - (vec2(hash12(sc + 3.1), hash12(sc + 7.7)) - 0.5) * 0.6;
  float star = step(0.975, h) * smoothstep(0.12, 0., length(sp)) * (0.5 + 0.5 * sin(uTime * 3. + h * 90.));
  col += vec3(0.9, 0.95, 1.2) * star * 2.5;
  // dotted holographic floor grid inside the field
  vec2 g = vW.xz + uField * 0.5;
  vec2 gd = abs(fract(g / 4.) - 0.5);
  float crossG = smoothstep(0.035, 0., min(gd.x, gd.y)) * smoothstep(0.28, 0.0, max(gd.x, gd.y) - 0.2);
  col += uC * (crossG * 0.1) * m;
  col *= mix(0.25, 1., m);
  col += pointLights(vW, vec3(0.,1.,0.), uLightK) * 0.35;
  gl_FragColor = vec4(col, 1.);
}`,
};

/* ---------------- ENEMY ORBS ---------------- */
export const ORB_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vP;
uniform float uTime; uniform float uWobble;
void main(){
  vec3 p = position;
  p += normal * sin(uTime * 7. + position.y * 5.) * uWobble;
  vec4 wp = modelMatrix * vec4(p, 1.);
  vW = wp.xyz; vP = position; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ORB_FRAG = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uCore; uniform vec3 uIce; uniform float uTime; uniform float uFrozen; uniform float uSeed; uniform float uHit;
varying vec3 vN; varying vec3 vW; varying vec3 vP;
${NOISE}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1. - max(dot(N, V), 0.), 2.);
  vec3 col;
#if defined(STYLE_FIRE)
  float n = fbm3(normalize(vP) * 2.2 + vec3(0., -uTime * 1.8, uSeed * 9.));
  float core = pow(max(dot(N, V), 0.), 2.);
  float k = clamp(n * 1.25 + core * 0.55, 0., 1.);
  col = mix(uA, uB, smoothstep(0.25, 0.7, k));
  col = mix(col, uCore, smoothstep(0.72, 0.95, k));
  col *= 0.75 + 0.55 * core;
  col += uA * fr * 1.0;
#elif defined(STYLE_PLASMA)
  float b = sin(dot(normalize(vP), vec3(0.6, 0.8, 0.2)) * 14. + uTime * 5. + uSeed * 6.);
  float n = fbm3(normalize(vP) * 3. + uTime * 0.6);
  col = mix(uA, uB, 0.5 + 0.5 * b) * (0.55 + n * 0.7);
  col += uCore * pow(fr, 1.5) * 1.6;
  col += uCore * pow(max(dot(N, V), 0.), 8.) * 0.6;
#else
  float n = fbm3(normalize(vP) * 2.5 + vec3(uTime * 0.4, uTime * 0.25, uSeed * 5.));
  float veins = smoothstep(0.48, 0.52, n) - smoothstep(0.52, 0.58, n);
  float pulse = 0.6 + 0.4 * sin(uTime * 3. + uSeed * 10.);
  col = uA * fr * 3.2;
  col += uB * veins * 2.5 * pulse;
  col += uCore * pow(max(dot(N, V), 0.), 4.) * 2.2 * pulse;
#endif
  vec3 ice = uIce * (0.6 + 1.6 * fr);
  col = mix(col, ice, uFrozen);
  col += vec3(3.) * uHit;
  gl_FragColor = vec4(col, 1.);
}`;

/* ---------------- PARTICLES ---------------- */
export const PART_VERT = /* glsl */`
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
  vColor = aColor; vAlpha = aAlpha;
}`;
export const PART_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  if(vAlpha * a < 0.003) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

/* ---------------- FINAL POST PASS ---------------- */
export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0 }, uVignette: { value: 0.8 },
    uGrain: { value: 0.03 }, uScan: { value: 0 }, uTint: { value: null }, uRes: { value: null },
    uFlash: { value: null }, uFlashAmt: { value: 0 }, uWarp: { value: 0 }, uWarpCenter: { value: null },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse; uniform float uTime; uniform float uAberr; uniform float uVignette; uniform float uGrain;
uniform float uScan; uniform vec3 uTint; uniform vec2 uRes; uniform vec3 uFlash; uniform float uFlashAmt;
uniform float uWarp; uniform vec2 uWarpCenter;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  // shockwave ring distortion
  if(uWarp > 0.){
    vec2 d = uv - uWarpCenter; d.x *= uRes.x / uRes.y;
    float r = length(d);
    float ring = smoothstep(0.08, 0., abs(r - (1. - uWarp) * 0.6)) * uWarp;
    uv -= normalize(d + 1e-5) * ring * 0.03 * vec2(uRes.y / uRes.x, 1.);
  }
  vec2 c = uv - 0.5;
  float dist = length(c);
  float ab = uAberr * (0.4 + dist * 2.);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ab).b;
  col *= uTint;
  col *= mix(1., smoothstep(0.95, 0.25, dist), uVignette);
  if(uScan > 0.){ col *= 1. - uScan * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.3)); }
  col += (h(uv * uRes + fract(uTime) * 100.) - 0.5) * uGrain;
  col += uFlash * uFlashAmt;
  gl_FragColor = vec4(col, 1.);
}`,
};
