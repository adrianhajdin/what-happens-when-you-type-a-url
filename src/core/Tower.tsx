"use client";

import { useEffect, useMemo } from "react";
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

/* ------------------------------------------------------------------------ */
/* Batched towers: one InstancedMesh per LED density (+1 for reflections).   */
/* ------------------------------------------------------------------------ */

export type TowerSpec = {
  position: Vec3;
  size: Vec3;
  edge?: "magenta" | "cyan";
  density?: number;
  reflect?: boolean;
};

/** The parts of a RackTower as specs, so a whole stage can be drawn in a handful of calls. */
export function rackSpecs(position: Vec3, height: number, width = 4, edge: "magenta" | "cyan" = "magenta", reflect = true): TowerSpec[] {
  const [x, y, z] = position;
  const w = width;
  return [
    { position: [x, y, z], size: [w, height, w], edge, density: 0.55, reflect },
    { position: [x - w * 0.62, y, z + w * 0.1], size: [w * 0.3, height * 0.82, w * 0.75], edge, density: 0.7, reflect },
    { position: [x + w * 0.62, y, z - w * 0.1], size: [w * 0.3, height * 0.9, w * 0.75], edge, density: 0.7, reflect },
    { position: [x, y + height, z], size: [w * 0.7, height * 0.04, w * 0.7], edge: "cyan", density: 0, reflect: false },
  ];
}

function TowerGroup({ specs, density, reflect }: { specs: TowerSpec[]; density: number; reflect: boolean }) {
  const mat = useMemo(() => sharedTowerMaterial("magenta", "cyan", density), [density]);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(UNIT_BOX, mat, specs.length);
    const o = new THREE.Object3D();
    specs.forEach((s, i) => {
      o.position.set(s.position[0], s.position[1] + s.size[1] / 2, s.position[2]);
      o.scale.set(...s.size);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, COLORS[s.edge ?? "magenta"]);
    });
    m.computeBoundingSphere();
    return m;
  }, [specs, mat]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return (
    <>
      <primitive object={mesh} />
      {reflect && (
        <group scale={[1, -1, 1]}>
          <instancedMesh args={[UNIT_BOX, mat, specs.length]} instanceMatrix={mesh.instanceMatrix} instanceColor={mesh.instanceColor} />
        </group>
      )}
    </>
  );
}

/** Draw many towers in as few calls as possible. Specs must be stable (memoise or define at module scope). */
export function Towers({ specs }: { specs: TowerSpec[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { density: number; reflect: boolean; specs: TowerSpec[] }>();
    for (const s of specs) {
      const density = s.density ?? 0.55;
      const reflect = (s.reflect ?? true) && s.position[1] === 0;
      const key = `${density}|${reflect}`;
      if (!map.has(key)) map.set(key, { density, reflect, specs: [] });
      map.get(key)!.specs.push(s);
    }
    return [...map.values()];
  }, [specs]);
  return (
    <>
      {groups.map((g) => (
        <TowerGroup key={`${g.density}|${g.reflect}`} specs={g.specs} density={g.density} reflect={g.reflect} />
      ))}
    </>
  );
}
