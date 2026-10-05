import * as THREE from "three";

/** Palette from design/hero.png. Values > 1 are HDR and feed the bloom pass. */
export const COLORS = {
  bg: new THREE.Color("#06060f"),
  cyan: new THREE.Color("#22d3ee"),
  magenta: new THREE.Color("#e879f9"),
  red: new THREE.Color("#ff3b5c"),
  gold: new THREE.Color("#ffb347"),
};
export const HEX = { bg: "#06060f", cyan: "#22d3ee", magenta: "#e879f9", red: "#ff4d6d", gold: "#ffc56b" };

export const hdr = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/** Shared time uniform: one object, referenced by every animated material. */
export const TIME = { value: 0 };

/* ------------------------------------------------------------------------ */
/* Tower: dark glossy glass with emissive edges and rack LED rows.          */
/* Works on plain meshes and InstancedMesh (BoxGeometry 1×1×1, scaled).     */
/* ------------------------------------------------------------------------ */

const towerVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vSize;
  varying vec3 vWorld;
  varying vec3 vWN;
  varying float vSeed;
  #ifdef USE_INSTANCING_COLOR
    varying vec3 vTint;
  #endif
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec3 s = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
    vSize = s;
    vP = position * s;
    vN = normal;
    vWN = normalize(mat3(m) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vWorld = wp.xyz;
    vSeed = fract(sin(dot(m[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const towerFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uEdge;
  uniform vec3 uLed;
  uniform float uLedDensity;
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vSize;
  varying vec3 vWorld;
  varying vec3 vWN;
  varying float vSeed;
  #ifdef USE_INSTANCING_COLOR
    varying vec3 vTint;
  #endif

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 an = abs(vN);
    vec3 half_ = vSize * 0.5;
    // face-local 2D coords (u across face, v = height)
    vec2 uv; vec2 hs;
    if (an.y > 0.5) { uv = vP.xz; hs = half_.xz; }
    else if (an.x > 0.5) { uv = vec2(vP.z, vP.y); hs = vec2(half_.z, half_.y); }
    else { uv = vec2(vP.x, vP.y); hs = vec2(half_.x, half_.y); }
    vec2 d = hs - abs(uv);
    float edgeDist = min(d.x, d.y);

    vec3 edgeCol = uEdge;
    #ifdef USE_INSTANCING_COLOR
      edgeCol = vTint;
    #endif

    // base: near-black navy with a cool fresnel sheen
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vWN), V)), 3.0);
    vec3 col = vec3(0.012, 0.014, 0.03) + vec3(0.05, 0.09, 0.2) * fres;
    // vertical gradient: darker at the base
    col *= 0.6 + 0.4 * smoothstep(-half_.y, half_.y, vP.y);

    // emissive edges
    float edge = smoothstep(0.12, 0.0, edgeDist) ;
    col += edgeCol * edge * 1.6 * uIntensity;

    if (an.y < 0.5) {
      // magenta vertical strip near one corner of each side face
      float stripX = hs.x - 0.28 * min(hs.x, 1.2);
      float strip = smoothstep(0.07, 0.0, abs(uv.x - stripX * (vSeed > 0.5 ? 1.0 : -1.0)));
      strip *= step(-hs.y + 0.4, uv.y) * step(uv.y, hs.y - 0.25);
      col += edgeCol * strip * 2.2 * uIntensity;

      // rack LED rows
      float rowH = 0.32;
      float row = floor((uv.y + hs.y) / rowH);
      float inRow = fract((uv.y + hs.y) / rowH);
      float colW = 0.22;
      float c = floor((uv.x + hs.x) / colW);
      float inCol = fract((uv.x + hs.x) / colW);
      float margin = smoothstep(0.35, 0.6, d.x) * step(0.5, d.y);
      float r = h21(vec2(row, c) + vSeed * 31.0);
      float on = step(1.0 - uLedDensity, r);
      float blink = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
      float dash = smoothstep(0.3, 0.2, abs(inRow - 0.5)) * smoothstep(0.42, 0.25, abs(inCol - 0.5));
      col += uLed * dash * on * margin * blink * 1.1 * uIntensity;
    } else {
      // top cap: faint inner frame
      col += edgeCol * smoothstep(0.5, 0.35, edgeDist) * smoothstep(0.2, 0.35, edgeDist) * 0.25;
    }
    // base glow where tower meets the floor
    col += edgeCol * smoothstep(0.6, 0.0, vP.y + half_.y) * 0.9 * uIntensity;

    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

export function towerMaterial(opts: { edge?: THREE.Color; led?: THREE.Color; ledDensity?: number; intensity?: number } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: towerVert,
    fragmentShader: towerFrag,
    fog: true,
    uniforms: {
      ...fogUniforms(),
      uEdge: { value: opts.edge ?? COLORS.magenta.clone() },
      uLed: { value: opts.led ?? COLORS.cyan.clone() },
      uLedDensity: { value: (opts.ledDensity ?? 0.55) * 0.6 },
      uIntensity: { value: opts.intensity ?? 1 },
      uTime: TIME,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Glass panel: translucent body, bright rim (memory blocks, DOM nodes).    */
/* ------------------------------------------------------------------------ */

const glassFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uEdge;
  uniform float uOpacity;
  uniform float uFill;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vSize;
  varying vec3 vWorld;
  varying vec3 vWN;
  varying float vSeed;
  void main() {
    vec3 an = abs(vN);
    vec3 half_ = vSize * 0.5;
    vec2 uv; vec2 hs;
    if (an.y > 0.5) { uv = vP.xz; hs = half_.xz; }
    else if (an.x > 0.5) { uv = vec2(vP.z, vP.y); hs = vec2(half_.z, half_.y); }
    else { uv = vec2(vP.x, vP.y); hs = vec2(half_.x, half_.y); }
    vec2 d = hs - abs(uv);
    float e = min(d.x, d.y);
    float rim = smoothstep(0.06, 0.0, e);
    float inner = smoothstep(0.35, 0.0, e) * 0.25;
    vec3 col = uEdge * (rim * 2.2 + inner) + vec3(0.02, 0.05, 0.12) * uFill;
    float a = clamp(rim + inner + 0.22 * uFill, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

export function glassMaterial(edge: THREE.Color = COLORS.cyan, opacity = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: towerVert,
    fragmentShader: glassFrag,
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...fogUniforms(),
      uEdge: { value: edge.clone() },
      uOpacity: { value: opacity },
      uFill: { value: 1 },
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Flowing light line (tube): dashes travelling along uv.x.                  */
/* ------------------------------------------------------------------------ */

const flowVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const flowFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uDash;
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uBase;
  uniform float uFlip;
  varying vec2 vUv;
  void main() {
    float x = mix(vUv.x, 1.0 - vUv.x, uFlip);
    if (x > uReveal) discard;
    float f = fract(x * uDash - uTime * uSpeed);
    float dash = smoothstep(0.0, 0.15, f) * smoothstep(0.6, 0.3, f);
    float head = smoothstep(0.04, 0.0, uReveal - x) * step(uReveal, 0.999);
    float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
    vec3 col = uColor * (uBase + dash * 1.2 + head * 3.0);
    gl_FragColor = vec4(col, uOpacity * (0.35 + 0.65 * core));
    #include <fog_fragment>
  }
`;

export function flowMaterial(color: THREE.Color, opts: { speed?: number; dash?: number; base?: number; opacity?: number; flip?: boolean } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: flowVert,
    fragmentShader: flowFrag,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      ...fogUniforms(),
      uColor: { value: color.clone() },
      uTime: TIME,
      uSpeed: { value: opts.speed ?? 0.6 },
      uDash: { value: opts.dash ?? 12 },
      uReveal: { value: 1 },
      uOpacity: { value: opts.opacity ?? 1 },
      uBase: { value: opts.base ?? 0.6 },
      uFlip: { value: opts.flip ? 1 : 0 },
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Canvas-generated sprites                                                 */
/* ------------------------------------------------------------------------ */

let glowTex: THREE.CanvasTexture | null = null;
/** Soft radial falloff, used for halos and fake light pools. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let streakTex: THREE.CanvasTexture | null = null;
/** Vertical fade: fake neon reflections on the wet floor. */
export function streakTexture() {
  if (streakTex) return streakTex;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.25)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 256);
  const h = g.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, "rgba(0,0,0,1)");
  h.addColorStop(0.5, "rgba(0,0,0,0)");
  h.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = h;
  g.fillRect(0, 0, 32, 256);
  streakTex = new THREE.CanvasTexture(c);
  return streakTex;
}
