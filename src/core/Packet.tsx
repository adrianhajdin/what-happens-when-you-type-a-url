"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COLORS, glowTexture, hdr } from "./materials";

/**
 * The protagonist. Emissive core + halo + a shader trail.
 *
 * The trail is a spring chain: every frame each sample eases toward the one in
 * front of it, so the comet stretches when the packet moves fast and collapses
 * when it stops. Positions live in one preallocated Float32Array (no per-frame
 * allocation).
 *
 * Scroll-driven, so the API is progress-based instead of time-based:
 *   followPath(curve, t) — place the packet at t∈[0,1] along a curve.
 */

export type PacketHandle = {
  followPath: (curve: { getPoint: (t: number, out: THREE.Vector3) => THREE.Vector3 }, t: number) => void;
  setPosition: (p: THREE.Vector3) => void;
  setVisible: (v: boolean) => void;
  setScale: (s: number) => void;
  group: THREE.Group | null;
};

const N = 56;

const trailVert = /* glsl */ `
  attribute float aIdx;
  uniform float uSize;
  uniform float uPx;
  varying float vIdx;
  void main() {
    vIdx = aIdx;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float taper = pow(1.0 - aIdx, 1.4);
    gl_PointSize = uSize * uPx * taper / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const trailFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uTail;
  uniform float uOpacity;
  varying float vIdx;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= pow(1.0 - vIdx, 1.6) * uOpacity;
    vec3 col = mix(uColor, uTail, vIdx);
    gl_FragColor = vec4(col * a, a);
  }
`;

type Props = {
  color?: THREE.Color;
  size?: number;
  visible?: boolean;
  trail?: boolean;
};

export const Packet = forwardRef<PacketHandle, Props>(function Packet(
  { color = COLORS.cyan, size = 0.55, visible = true, trail = true },
  ref,
) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());
  const state = useRef({ visible, scale: 1, primed: false });

  const { geo, mat, positions } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const idx = new Float32Array(N);
    for (let i = 0; i < N; i++) idx[i] = i / (N - 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aIdx", new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: hdr(color, 2.2) },
        uTail: { value: hdr(new THREE.Color("#3b5bff"), 1.2) },
        uSize: { value: size * 1.6 },
        uPx: { value: 600 },
        uOpacity: { value: 1 },
      },
    });
    return { geo, mat, positions };
  }, [color, size]);

  useImperativeHandle(ref, () => ({
    followPath(curve, t) {
      curve.getPoint(Math.min(1, Math.max(0, t)), target.current);
    },
    setPosition(p) {
      target.current.copy(p);
    },
    setVisible(v) {
      state.current.visible = v;
    },
    setScale(s) {
      state.current.scale = s;
    },
    get group() {
      return group.current;
    },
  }));

  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const st = state.current;
    g.visible = st.visible && st.scale > 0.001;
    if (!g.visible) {
      st.primed = false;
      return;
    }
    const p = target.current;
    const core = g.children[0] as THREE.Object3D;
    core.position.copy(p);
    core.scale.setScalar(st.scale);
    mat.uniforms.uPx.value = s.size.height * 0.9;
    mat.uniforms.uSize.value = size * 1.6 * st.scale;
    if (!trail) return;
    // reset trail on teleports (first frame visible or huge jumps)
    tmp.current.set(positions[0], positions[1], positions[2]);
    if (!st.primed || tmp.current.distanceToSquared(p) > 900 * st.scale * st.scale) {
      for (let i = 0; i < N; i++) {
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      st.primed = true;
    }
    positions[0] = p.x;
    positions[1] = p.y;
    positions[2] = p.z;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 38);
    for (let i = 1; i < N; i++) {
      const a = i * 3;
      const b = a - 3;
      positions[a] += (positions[b] - positions[a]) * k;
      positions[a + 1] += (positions[b + 1] - positions[a + 1]) * k;
      positions[a + 2] += (positions[b + 2] - positions[a + 2]) * k;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  const glow = glowTexture();
  return (
    <group ref={group}>
      <group>
        <mesh>
          <sphereGeometry args={[size, 24, 16]} />
          <meshBasicMaterial color={hdr(color, 3)} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[size * 0.55, 16, 12]} />
          <meshBasicMaterial color={[6, 7, 8]} toneMapped={false} />
        </mesh>
        <sprite scale={[size * 9, size * 9, 1]}>
          <spriteMaterial map={glow} color={hdr(color, 1.4)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
      {trail && <points geometry={geo} material={mat} frustumCulled={false} />}
    </group>
  );
});
