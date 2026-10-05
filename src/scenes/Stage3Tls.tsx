"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BRIDGES, CLIENT, CZ, SERVER, TOWER_H, reversed } from "./parts/Canyon";
import { Packet, type PacketHandle } from "@/core/Packet";
import { DynamicLabel, Label, type DynamicLabelHandle } from "@/core/Label";
import { COLORS, HEX, TIME, glowTexture, hdr } from "@/core/materials";
import { disposeObject } from "@/core/Stage";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { TARGET_HOST } from "@/lib/journey";
import { easeInOut, easeOut, remap, rng } from "@/lib/math";
import { store } from "@/lib/store";

const INDEX = 3;
export const PADLOCK_URL = "/models/padlock.min.glb";

const BEAT = {
  helloFrom: 0.04,
  helloTo: 0.26,
  serverFrom: 0.28,
  serverTo: 0.5,
  verify: 0.5,
  keysFrom: 0.56,
  lockFrom: 0.62,
  lockTo: 0.74,
  tubeFrom: 0.74,
  tubeTo: 0.86,
  dataFrom: 0.86,
  dataTo: 0.98,
};

const CHANNEL = BRIDGES[1];
const LOCK_POS = new THREE.Vector3(0, 11.5, CZ);
const DOCK_L = new THREE.Vector3(CLIENT[0] + 2.6, 3, CZ);

const CIPHERS = ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256", "key_share: x25519"];
const CHAIN = [`leaf · ${TARGET_HOST}`, "intermediate CA", "root CA · in your trust store"];

/* --------------------------- encrypted tube shader -------------------------- */

const tubeVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const tubeFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uReveal;
  uniform float uTime;
  uniform vec3 uCyan;
  uniform vec3 uMagenta;
  uniform vec2 uScale;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  // distance to the nearest hex cell edge
  float hexEdge(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
    vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    q = abs(q);
    return 0.5 - max(dot(q, s * 0.5), q.x);
  }
  void main() {
    if (vUv.x > uReveal) discard;
    vec2 p = vUv * uScale;
    float e = hexEdge(p);
    float line = smoothstep(0.06, 0.0, e);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(vN, V)), 2.0);
    float flow = 0.5 + 0.5 * sin(vUv.x * 40.0 - uTime * 4.0);
    float head = smoothstep(0.05, 0.0, uReveal - vUv.x) * step(uReveal, 0.999);
    vec3 col = uCyan * (line * (0.9 + 0.6 * flow) + fres * 0.6) + uMagenta * head * 2.0;
    float ends = smoothstep(0.03, 0.0, vUv.x) + smoothstep(0.97, 1.0, vUv.x);
    col += uMagenta * ends * 2.0;
    float a = clamp(line * 0.9 + fres * 0.35 + 0.04 + head, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

function EncryptedTube({ matRef }: { matRef: React.RefObject<THREE.ShaderMaterial | null> }) {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.TubeGeometry(CHANNEL, 64, 1.35, 28, false);
    const length = CHANNEL.getLength();
    const mat = new THREE.ShaderMaterial({
      vertexShader: tubeVert,
      fragmentShader: tubeFrag,
      fog: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uReveal: { value: 0 },
        uTime: TIME,
        uCyan: { value: hdr(COLORS.cyan, 1.3) },
        uMagenta: { value: hdr(COLORS.magenta, 1.4) },
        uScale: { value: new THREE.Vector2(length / 0.9, (Math.PI * 2 * 1.35) / 0.9 / 1.732) },
      },
    });
    return { geo, mat };
  }, []);
  useEffect(() => {
    matRef.current = mat;
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat, matRef]);
  return <mesh geometry={geo} material={mat} renderOrder={3} />;
}

/* --------------------------------- keys ---------------------------------- */

function Key({ color, keyRef }: { color: THREE.Color; keyRef: (g: THREE.Group | null) => void }) {
  const c = hdr(color, 2.4);
  return (
    <group ref={keyRef} scale={0.9}>
      <mesh position={[-1.3, 0, 0]}>
        <torusGeometry args={[0.6, 0.16, 10, 28]} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[2.4, 0.22, 0.22]} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
      {[0.9, 1.35].map((x) => (
        <mesh key={x} position={[x, -0.3, 0]}>
          <boxGeometry args={[0.2, 0.45, 0.2]} />
          <meshBasicMaterial color={c} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------- padlock -------------------------------- */

/**
 * The Tripo export is a whole diorama of design/s3.png (towers, tube, keys,
 * padlock). We only want the padlock, so at load we keep the triangles inside
 * its bounds (measured from a vertex-density plot of the raw model) and drop
 * the rest. Model-space bounds of the padlock, raw units:
 */
const LOCK_BOUNDS = { minX: -0.045, maxX: 0.105, minY: 0.262 };

function extractPadlock(src: THREE.Object3D) {
  const root = src.clone(true);
  root.updateMatrixWorld(true);
  const keep = new THREE.Group();
  const v = new THREE.Vector3();
  // bounds of the kept triangles only (Box3.setFromObject would measure the whole shared vertex buffer)
  const box = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const index = g.index;
    const tri = index ? index.count / 3 : pos.count / 3;
    const out: number[] = [];
    const inside = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      inside[i] = v.x > LOCK_BOUNDS.minX && v.x < LOCK_BOUNDS.maxX && v.y > LOCK_BOUNDS.minY ? 1 : 0;
    }
    for (let t = 0; t < tri; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      if (inside[a] && inside[b] && inside[c]) {
        out.push(a, b, c);
        for (const i of [a, b, c]) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
      }
    }
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) geo.setAttribute(name, attr);
    geo.setIndex(out);
    const src = mesh.material as THREE.MeshStandardMaterial;
    // Unlit: the Tripo texture has the neon baked in; boost it so bloom catches the glow.
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: src.map, color: new THREE.Color(1.45, 1.45, 1.6), toneMapped: false }));
    m.matrix.copy(mesh.matrixWorld);
    m.matrixAutoUpdate = false;
    keep.add(m);
  });
  // centre and normalise to a fixed height
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = 5 / size.y;
  const wrap = new THREE.Group();
  keep.position.copy(center).multiplyScalar(-k);
  keep.scale.setScalar(k);
  wrap.add(keep);
  return wrap;
}

function Padlock({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const gltf = useGLTF(PADLOCK_URL);
  const model = useMemo(() => extractPadlock(gltf.scene), [gltf]);
  useEffect(() => () => disposeObject(model), [model]);
  return (
    <group ref={groupRef} position={LOCK_POS} scale={0}>
      <primitive object={model} />
    </group>
  );
}

/** Pixels that converge into the padlock as it assembles. */
function Converge({ matRef }: { matRef: React.RefObject<THREE.ShaderMaterial | null> }) {
  const { geo, mat } = useMemo(() => {
    const n = 220;
    const r = rng(17);
    const start = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      start[i * 3] = side * (4 + r() * 14);
      start[i * 3 + 1] = (r() - 0.5) * 10;
      start[i * 3 + 2] = (r() - 0.5) * 8;
      seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(start, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uP: { value: 0 }, uPx: { value: 800 }, uCyan: { value: hdr(COLORS.cyan, 2) }, uMagenta: { value: hdr(COLORS.magenta, 2) } },
      vertexShader: /* glsl */ `
        uniform float uP; uniform float uPx;
        attribute float aSeed; varying float vA; varying float vSide;
        void main() {
          float p = clamp(uP * 1.3 - aSeed * 0.3, 0.0, 1.0);
          p = p * p * (3.0 - 2.0 * p);
          vec3 pos = mix(position, position * 0.05, p);
          vSide = step(0.0, position.x);
          vA = sin(p * 3.14159) ;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (0.25 + aSeed * 0.25) * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCyan; uniform vec3 uMagenta; varying float vA; varying float vSide;
        void main() {
          vec2 q = abs(gl_PointCoord - 0.5);
          float a = step(max(q.x, q.y), 0.4) * vA;
          gl_FragColor = vec4(mix(uCyan, uMagenta, vSide) * a, a);
        }`,
    });
    return { geo, mat };
  }, []);
  useEffect(() => {
    matRef.current = mat;
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat, matRef]);
  return <points geometry={geo} material={mat} position={LOCK_POS} frustumCulled={false} />;
}

/* --------------------------------- scene --------------------------------- */

function Scene() {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const server = useRef<PacketHandle>(null);
  const ciphers = useRef<(THREE.Sprite | null)[]>([]);
  const chain = useRef<(THREE.Sprite | null)[]>([]);
  const checks = useRef<(THREE.Sprite | null)[]>([]);
  const keys = useRef<(THREE.Group | null)[]>([]);
  const lock = useRef<THREE.Group>(null);
  const tube = useRef<THREE.ShaderMaterial | null>(null);
  const converge = useRef<THREE.ShaderMaterial | null>(null);
  const halo = useRef<THREE.Sprite>(null);
  const caption = useRef<DynamicLabelHandle>(null);
  const back = useMemo(() => reversed(CHANNEL), []);

  useFrame((state) => {
    const t = stageT(INDEX, store().progress);

    // ClientHello: cipher cards fan out around the travelling packet
    const hu = remap(t, BEAT.helloFrom, BEAT.helloTo);
    CHANNEL.getPoint(hu, tmp);
    const fan = Math.sin(Math.PI * Math.min(1, hu * 1.15));
    ciphers.current.forEach((s, i) => {
      if (!s) return;
      s.visible = t > BEAT.helloFrom && t < BEAT.helloTo + 0.02;
      const a = (i / (CIPHERS.length - 1) - 0.5) * 2.2;
      s.position.set(tmp.x + Math.sin(a) * 8 * fan, tmp.y + 2.5 + Math.cos(a) * 4.5 * fan, tmp.z + 2);
      (s.material as THREE.SpriteMaterial).opacity = fan;
    });

    // ServerHello + certificate chain
    const su = remap(t, BEAT.serverFrom, BEAT.serverTo);
    const serverMoving = t > BEAT.serverFrom && t < BEAT.serverTo;
    server.current?.setVisible(serverMoving);
    back.getPoint(su, tmp);
    server.current?.setPosition(tmp);
    chain.current.forEach((s, i) => {
      if (!s) return;
      s.visible = t > BEAT.serverFrom - 0.02 && t < BEAT.keysFrom + 0.06;
      if (t < BEAT.serverTo) s.position.set(tmp.x, tmp.y + 2.6 + i * 1.9, tmp.z + 1.2);
      else s.position.set(CLIENT[0] + 9, 7 + i * 1.9, CZ + 3);
      const c = checks.current[i];
      if (c) {
        c.visible = s.visible && t > BEAT.verify + i * 0.02;
        c.position.set(s.position.x - s.scale.x / 2 - 0.8, s.position.y, s.position.z + 0.1);
      }
    });

    // keys fly in from both towers and combine
    const ku = easeInOut(remap(t, BEAT.keysFrom, BEAT.lockTo));
    keys.current.forEach((g, i) => {
      if (!g) return;
      g.visible = t > BEAT.keysFrom && t < BEAT.lockTo + 0.03;
      const sx = i === 0 ? CLIENT[0] : SERVER[0];
      g.position.set(sx + (LOCK_POS.x - sx + (i === 0 ? -1.2 : 1.2)) * ku, TOWER_H + 3 + (LOCK_POS.y - TOWER_H - 3) * ku, CZ + 1.5);
      g.rotation.set(0, i === 0 ? 0 : Math.PI, Math.sin(state.clock.elapsedTime * 2 + i) * 0.1);
      g.scale.setScalar(0.9 * (1 - remap(t, BEAT.lockTo - 0.03, BEAT.lockTo + 0.03)));
    });

    // padlock assembles
    const lu = remap(t, BEAT.lockFrom, BEAT.lockTo);
    if (lock.current) {
      const s = easeOut(lu);
      lock.current.scale.setScalar(s);
      lock.current.rotation.y = (1 - s) * Math.PI * 1.5 + Math.sin(state.clock.elapsedTime * 0.6) * 0.25 * s;
      lock.current.visible = s > 0.001;
    }
    if (halo.current) {
      halo.current.visible = lu > 0;
      const k = 7 + Math.sin(Math.PI * lu) * 6;
      halo.current.scale.set(k, k, 1);
    }
    if (converge.current) {
      converge.current.uniforms.uP.value = remap(t, BEAT.keysFrom, BEAT.lockTo);
      converge.current.uniforms.uPx.value = state.size.height;
    }

    // the open channel becomes an encrypted tube
    if (tube.current) tube.current.uniforms.uReveal.value = easeInOut(remap(t, BEAT.tubeFrom, BEAT.tubeTo));

    const cap = caption.current;
    if (cap?.sprite) {
      let text = "";
      if (t > BEAT.helloFrom && t < BEAT.helloTo) text = "ClientHello  ·  ciphers + key share";
      else if (t > BEAT.serverFrom && t < BEAT.verify + 0.05) text = "ServerHello  ·  certificate  ·  Finished";
      else if (t > BEAT.keysFrom && t < BEAT.tubeFrom) text = "shared secret  ·  x25519 ECDHE";
      else if (t >= BEAT.tubeFrom) text = "TLS 1.3  ·  1 round trip  ·  AES-128-GCM";
      cap.sprite.visible = text !== "";
      if (text) cap.setText(text);
    }
  });

  return (
    <group>
      <EncryptedTube matRef={tube} />
      <Packet ref={server} color={COLORS.magenta} size={0.5} visible={false} />
      {CIPHERS.map((c, i) => (
        <Label
          key={c}
          ref={(s) => {
            ciphers.current[i] = s;
          }}
          text={c}
          size={0.75}
          color={i === 3 ? HEX.magenta : "#dffaff"}
          bg="rgba(6,10,24,0.88)"
          border={i === 3 ? HEX.magenta : HEX.cyan}
          visible={false}
        />
      ))}
      {CHAIN.map((c, i) => (
        <group key={c}>
          <Label
            ref={(s) => {
              chain.current[i] = s;
            }}
            text={c}
            size={0.7}
            color="#ffe9ff"
            bg="rgba(20,6,26,0.9)"
            border={HEX.magenta}
            visible={false}
          />
          <Label
            ref={(s) => {
              checks.current[i] = s;
            }}
            text="✓"
            size={0.9}
            color="#7dffb0"
            visible={false}
          />
        </group>
      ))}
      {[COLORS.cyan, COLORS.magenta].map((c, i) => (
        <Key
          key={i}
          color={c}
          keyRef={(g) => {
            keys.current[i] = g;
          }}
        />
      ))}
      <Padlock groupRef={lock} />
      <Converge matRef={converge} />
      <sprite ref={halo} position={LOCK_POS} visible={false}>
        <spriteMaterial map={glowTexture()} color={hdr(COLORS.cyan, 0.3)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <DynamicLabel ref={caption} position={[0, 19.5, CZ]} size={0.75} color="#eaffff" bg="rgba(6,8,20,0.85)" border={HEX.cyan} weight={700} />
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [0, 19, CZ + 46], target: [0, 6, CZ], fov: 50 },
  { t: 0.3, position: [3, 18, CZ + 42], target: [2, 7, CZ], fov: 50 },
  { t: 0.56, position: [0, 15, CZ + 28], target: [0, 11, CZ], fov: 48 },
  { t: 0.7, position: [0, 13, CZ + 13], target: [0, 11.5, CZ], fov: 46 },
  { t: 0.76, position: [1, 13.5, CZ + 15], target: [0, 11, CZ], fov: 46 },
  { t: 0.88, position: [-4, 16, CZ + 36], target: [0, 7, CZ], fov: 50 },
  { t: 1, position: [-14, 16, CZ + 38], target: [6, 4, CZ - 8], fov: 52 },
]);

export const Stage3Tls: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  models: [PADLOCK_URL],
  packet(t, out) {
    out.visible = true;
    if (t <= BEAT.helloFrom) out.position.copy(DOCK_L);
    else if (t < BEAT.helloTo) CHANNEL.getPoint(remap(t, BEAT.helloFrom, BEAT.helloTo), out.position);
    else if (t < BEAT.dataFrom) out.visible = false;
    else CHANNEL.getPoint(remap(t, BEAT.dataFrom, BEAT.dataTo), out.position);
  },
};
