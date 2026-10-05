"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { COLORS, towerMaterial } from "./materials";
import type { Vec3 } from "@/lib/math";

/** Shared unit box (centred — the tower shader relies on it): every tower in the app is this geometry, scaled. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const materials = new Map<string, THREE.ShaderMaterial>();
/** Cached tower materials keyed by look, so stages share programs and uniforms. */
export function sharedTowerMaterial(edge: "magenta" | "cyan" = "magenta", led: "cyan" | "magenta" = "cyan", density = 0.55) {
  const key = `${edge}-${led}-${density}`;
  let m = materials.get(key);
  if (!m) {
    m = towerMaterial({ edge: COLORS[edge], led: COLORS[led], ledDensity: density });
    materials.set(key, m);
  }
  return m;
}

type Props = {
  position: Vec3;
  /** width, height, depth */
  size: Vec3;
  edge?: "magenta" | "cyan";
  led?: "cyan" | "magenta";
  density?: number;
  /** Mirrored copy under the semi-transparent floor = wet-floor reflection. */
  reflect?: boolean;
  rotation?: number;
};

/** A glass server tower: one draw call, plus one for its reflection. */
export function Tower({ position, size, edge = "magenta", led = "cyan", density = 0.55, reflect = true, rotation = 0 }: Props) {
  const mat = useMemo(() => sharedTowerMaterial(edge, led, density), [edge, led, density]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={UNIT_BOX} material={mat} scale={size} position-y={size[1] / 2} />
      {reflect && position[1] === 0 && (
        <mesh geometry={UNIT_BOX} material={mat} scale={[size[0], -size[1], size[2]]} position-y={-size[1] / 2} />
      )}
    </group>
  );
}

/** A compound "server rack" tower: main block + side racks + cap, like the hero image. */
export function RackTower({ position, height, width = 4, edge = "magenta", reflect = true }: { position: Vec3; height: number; width?: number; edge?: "magenta" | "cyan"; reflect?: boolean }) {
  const w = width;
  return (
    <group position={position}>
      <Tower position={[0, 0, 0]} size={[w, height, w]} edge={edge} reflect={reflect} />
      <Tower position={[-w * 0.62, 0, w * 0.1]} size={[w * 0.3, height * 0.82, w * 0.75]} edge={edge} density={0.7} reflect={reflect} />
      <Tower position={[w * 0.62, 0, -w * 0.1]} size={[w * 0.3, height * 0.9, w * 0.75]} edge={edge} density={0.7} reflect={reflect} />
      <Tower position={[0, height, 0]} size={[w * 0.7, height * 0.04, w * 0.7]} edge="cyan" density={0} reflect={false} />
    </group>
  );
}
