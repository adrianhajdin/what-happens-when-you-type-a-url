"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { COLORS, HEX, TIME, glowTexture, hdr, towerMaterial } from "./materials";
import { UNIT_BOX } from "./Tower";
import { STAGES, locate, type Loc } from "@/lib/stages";
import { rng } from "@/lib/math";
import { useStore, store } from "@/lib/store";
import { GLOBE_CENTER } from "@/scenes/globe/geo";

/**
 * Everything shared between stages: the wet network plane, the instanced
 * city of towers, dust, the far shore, the ocean and the stars. Fog density
 * is driven per stage from STAGES[i].fog.
 */

export const CANYON = { x: 14, zMin: -185, zMax: -115 };
export const SHORE_Z = -300;

const floorVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const floorFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uCyan;
  uniform vec3 uMagenta;
  uniform vec4 uHole;
  uniform float uTime;
  varying vec3 vWorld;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gridLine(vec2 p, float cell, float w) {
    vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;
    vec2 fw = fwidth(p) * 1.2;
    vec2 l = 1.0 - smoothstep(vec2(w), vec2(w) + fw, g);
    return max(l.x, l.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    if (abs(p.x) < uHole.x && p.y > uHole.y && p.y < uHole.z) discard;
    float dist = length(cameraPosition - vWorld);
    float fade = exp(-dist * 0.012);
    float minor = gridLine(p, 6.0, 0.03) * 0.22;
    float major = gridLine(p, 24.0, 0.05) * 0.5;
    // nodes on some intersections
    vec2 cell = floor(p / 24.0 + 0.5);
    vec2 nodeP = (cell) * 24.0;
    float r = h21(cell);
    float node = smoothstep(0.9, 0.0, length(p - nodeP)) * step(0.72, r);
    float pulse = 0.6 + 0.4 * sin(uTime * 1.5 + r * 30.0);
    vec3 lineCol = mix(uCyan, uMagenta, step(0.5, h21(cell + 7.0)));
    vec3 col = vec3(0.008, 0.009, 0.022);
    col += uCyan * minor * fade;
    col += lineCol * major * fade * 0.9;
    col += lineCol * node * pulse * 3.0 * (0.3 + fade);
    // edge glow around the canyon lip
    float lip = 0.0;
    if (p.y > uHole.y && p.y < uHole.z) lip = smoothstep(1.2, 0.0, abs(abs(p.x) - uHole.x));
    col += uMagenta * lip * 1.5;
    // shoreline glow
    col += uCyan * smoothstep(3.0, 0.0, abs(p.y - uHole.w)) * 0.8;
    // floor is semi-transparent: the mirrored towers below read as wet reflections
    gl_FragColor = vec4(col, 0.86);
    #include <fog_fragment>
  }
`;

const waterFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uMoon;
  varying vec3 vWorld;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    float w = noise(p * vec2(0.08, 0.25) + vec2(0.0, uTime * 0.3)) * 0.6 + noise(p * vec2(0.2, 0.6) - vec2(uTime * 0.2, 0.0)) * 0.4;
    vec3 col = vec3(0.01, 0.012, 0.03) + vec3(0.02, 0.03, 0.07) * w;
    // moon glitter column
    vec3 toCam = normalize(cameraPosition - vWorld);
    float dx = abs(vWorld.x - uMoon.x) / (1.0 + abs(vWorld.z - uMoon.z) * 0.05);
    float glitter = smoothstep(18.0, 0.0, dx) * smoothstep(0.55, 0.8, w);
    col += vec3(0.9, 0.7, 1.0) * glitter * 0.9;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uPx;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.3 + aSeed * 20.0) * 0.8;
    p.x += cos(uTime * 0.2 + aSeed * 13.0) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(6.0, (0.12 + aSeed * 0.2) * uPx / -mv.z);
    // fade out both far away and right in front of the lens (near points would become huge discs)
    vA = smoothstep(160.0, 20.0, -mv.z) * smoothstep(6.0, 18.0, -mv.z) * (0.4 + aSeed * 0.6);
    gl_Position = projectionMatrix * mv;
  }
`;
const dustFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d) * vA;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const starVert = /* glsl */ `
  uniform float uPx;
  attribute float aSize;
  varying float vB;
  void main() {
    vB = aSize;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * 2.2 * uPx / 900.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const starFrag = /* glsl */ `
  uniform float uOpacity;
  varying float vB;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d) * uOpacity * (0.4 + vB * 0.6);
    gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a);
  }
`;

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/** Positions for the instanced background city, avoiding every stage's footprint. */
function cityLayout(count: number) {
  const r = rng(7);
  const out: { x: number; z: number; w: number; h: number; d: number; c: boolean }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const z = 70 - r() * 380;
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (30 + Math.pow(r(), 1.6) * 230);
    // keep the canyon walls readable and the edge stage's horizon open
    if (z < -100 && z > -200 && Math.abs(x) < 34) continue;
    if (z < -215 && Math.abs(x) < 70) continue;
    // keep the render stage's DOM / CSSOM trees readable
    if (z > -45 && Math.abs(x) < 48) continue;
    const near = Math.abs(x) < 70;
    const w = 2 + r() * (near ? 4 : 7);
    const h = 4 + Math.pow(r(), 2.2) * (near ? 22 : 60);
    out.push({ x, z, w, h, d: w * (0.7 + r() * 0.6), c: r() < 0.38 });
  }
  return out;
}

function skylineLayout(count: number) {
  const r = rng(99);
  return Array.from({ length: count }, () => {
    const x = (r() - 0.5) * 900;
    const z = -980 - r() * 160;
    const w = 6 + r() * 14;
    return { x, z, w, h: 20 + Math.pow(r(), 2) * 160 * (1 - Math.abs(x) / 600), d: w, c: r() < 0.5 };
  });
}

function InstancedTowers({ items, material, mirror }: { items: ReturnType<typeof cityLayout>; material: THREE.Material; mirror: boolean }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(UNIT_BOX, material, items.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(it.x, it.h / 2, it.z);
      o.scale.set(it.w, it.h, it.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, it.c ? c.copy(COLORS.cyan) : c.copy(COLORS.magenta));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    return m;
  }, [items, material]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return (
    <>
      <primitive object={mesh} />
      {mirror && (
        <group scale={[1, -1, 1]}>
          <instancedMesh args={[UNIT_BOX, material, items.length]} instanceMatrix={mesh.instanceMatrix} instanceColor={mesh.instanceColor} />
        </group>
      )}
    </>
  );
}

export function World() {
  const tier = useStore((s) => s.tier);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const loc = useRef<Loc>({ index: 0, t: 0, transitioning: false, u: 0 });

  const fog = useMemo(() => new THREE.FogExp2(HEX.bg, STAGES[0].fog), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  const floorMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        fog: true,
        transparent: true,
        uniforms: {
          ...fogUniforms(),
          uCyan: { value: COLORS.cyan },
          uMagenta: { value: COLORS.magenta },
          uHole: { value: new THREE.Vector4(CANYON.x, CANYON.zMin, CANYON.zMax, SHORE_Z) },
          uTime: TIME,
        },
      }),
    [],
  );
  const moon = useMemo(() => new THREE.Vector3(160, 70, -1150), []);
  const waterMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: waterFrag,
        fog: true,
        uniforms: { ...fogUniforms(), uTime: TIME, uMoon: { value: moon } },
      }),
    [moon],
  );

  const city = useMemo(() => cityLayout(tier === "high" ? 560 : 240), [tier]);
  const skyline = useMemo(() => skylineLayout(tier === "high" ? 160 : 70), [tier]);
  const cityMat = useMemo(() => towerMaterial({ ledDensity: 0.35, intensity: 0.85 }), []);
  const skyMat = useMemo(() => {
    const m = towerMaterial({ ledDensity: 0.5, intensity: 0.55 });
    m.fog = false;
    return m;
  }, []);

  const dust = useMemo(() => {
    const n = tier === "high" ? 900 : 300;
    const r = rng(3);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 90;
      pos[i * 3 + 1] = r() * 30;
      pos[i * 3 + 2] = 40 - r() * 320;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: TIME, uPx: { value: 800 }, uColor: { value: hdr(COLORS.cyan, 1.2) } },
    });
    return { g, m };
  }, [tier]);

  const stars = useMemo(() => {
    const n = tier === "high" ? 3000 : 1200;
    const r = rng(11);
    const pos = new Float32Array(n * 3);
    const sz = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(2600);
      pos[i * 3] = v.x + GLOBE_CENTER.x;
      pos[i * 3 + 1] = v.y + GLOBE_CENTER.y;
      pos[i * 3 + 2] = v.z + GLOBE_CENTER.z;
      sz[i] = Math.pow(r(), 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uPx: { value: 800 } },
    });
    return { g, m, pts: null as THREE.Points | null };
  }, [tier]);

  const starsRef = useRef<THREE.Points>(null);
  const groundRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const s = store();
    locate(s.progress, loc.current);
    const l = loc.current;
    const a = STAGES[l.index].fog;
    const b = l.transitioning ? STAGES[l.index + 1].fog : a;
    // fog clears quickly as we leave for space, returns late when we come back
    const u = l.transitioning ? Math.pow(l.u, b < a ? 0.35 : 2.5) : 0;
    fog.density = a + (b - a) * u;
    const space = 1 - Math.min(1, fog.density / 0.006);
    stars.m.uniforms.uOpacity.value = space;
    if (starsRef.current) starsRef.current.visible = space > 0.01;
    if (groundRef.current) groundRef.current.visible = space < 0.999;
    stars.m.uniforms.uPx.value = size.height;
    dust.m.uniforms.uPx.value = size.height;
  });

  const glow = glowTexture();
  return (
    <>
      <color attach="background" args={[HEX.bg]} />
      <group ref={groundRef}>
        {/* network plane: ends at the shoreline, hole for the canyon */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, (160 + SHORE_Z) / 2]} material={floorMat} renderOrder={1}>
          <planeGeometry args={[900, 160 - SHORE_Z]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, -1.5, SHORE_Z - 1100]} material={waterMat}>
          <planeGeometry args={[3200, 2200]} />
        </mesh>
        <InstancedTowers items={city} material={cityMat} mirror={tier === "high"} />
        <InstancedTowers items={skyline} material={skyMat} mirror={false} />
        <points geometry={dust.g} material={dust.m} frustumCulled={false} />
        <sprite position={moon} scale={[60, 60, 1]}>
          <spriteMaterial map={glow} color={[2.2, 1.9, 2.4]} transparent depthWrite={false} fog={false} toneMapped={false} />
        </sprite>
        <sprite position={moon} scale={[260, 260, 1]}>
          <spriteMaterial map={glow} color={[0.35, 0.2, 0.5]} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      <points ref={starsRef} geometry={stars.g} material={stars.m} frustumCulled={false} />
    </>
  );
}
