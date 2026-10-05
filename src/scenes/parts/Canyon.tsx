"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RackTower, Tower, UNIT_BOX, sharedTowerMaterial } from "@/core/Tower";
import { Label } from "@/core/Label";
import { COLORS } from "@/core/materials";
import { rng, type Vec3 } from "@/lib/math";
import { TARGET_IP } from "@/lib/journey";
import { CANYON } from "@/core/World";

/** Shared set for the TCP and TLS stages: two plateaus of servers across a dark canyon. */

export const CZ = -150;
export const CLIENT: Vec3 = [-19, 0, CZ];
export const SERVER: Vec3 = [19, 0, CZ];
export const TOWER_H = 16;

const span = (z: number, y: number, sag: number) =>
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(-16.4, y, z),
    new THREE.Vector3(-8, y - sag * 0.7, z),
    new THREE.Vector3(0, y - sag, z),
    new THREE.Vector3(8, y - sag * 0.7, z),
    new THREE.Vector3(16.4, y, z),
  ]);

/** Three light bridges, left → right. */
export const BRIDGES = [span(CZ + 5, 5, 1.2), span(CZ, 3, 1.6), span(CZ - 5, 5, 1.2)];

export function reversed(c: THREE.Curve<THREE.Vector3>) {
  return { getPoint: (t: number, out: THREE.Vector3) => c.getPoint(1 - t, out) };
}

function Abyss() {
  const mesh = useMemo(() => {
    const r = rng(5);
    const n = 46;
    const mat = sharedTowerMaterial("magenta", "cyan", 0.5);
    const m = new THREE.InstancedMesh(UNIT_BOX, mat, n);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const w = 2 + r() * 4;
      const h = 12 + r() * 55;
      o.position.set((r() - 0.5) * (CANYON.x * 2 - 4), -95 + h / 2, CANYON.zMax - 2 - r() * (CANYON.zMax - CANYON.zMin - 4));
      o.scale.set(w, h, w);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, r() < 0.4 ? c.copy(COLORS.cyan) : c.copy(COLORS.magenta));
    }
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

export function Canyon() {
  const wallMat = useMemo(() => sharedTowerMaterial("magenta", "cyan", 0.45), []);
  const depth = CANYON.zMax - CANYON.zMin;
  return (
    <group>
      {/* cliff walls made of server racks */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={UNIT_BOX} material={wallMat} position={[s * (CANYON.x + 0.6), -45.2, (CANYON.zMax + CANYON.zMin) / 2]} scale={[1.2, 90, depth]} />
      ))}
      <Abyss />
      <RackTower position={CLIENT} height={TOWER_H} width={5} edge="cyan" />
      <RackTower position={SERVER} height={TOWER_H} width={5} edge="magenta" />
      {(
        [
          [-27, -140, 24, 4],
          [-25, -163, 12, 5],
          [-34, -152, 30, 4],
          [-30, -128, 14, 3],
          [27, -140, 26, 4],
          [25, -163, 14, 5],
          [34, -150, 32, 4],
          [30, -129, 12, 3],
        ] as const
      ).map(([x, z, h, w], i) => (
        <Tower key={i} position={[x, 0, z]} size={[w, h, w]} edge={i % 3 === 0 ? "cyan" : "magenta"} />
      ))}
      <Label text="CLIENT" sub={["192.168.1.24 : 52814"]} size={0.7} position={[CLIENT[0], TOWER_H + 6, CZ]} weight={700} />
      <Label text="SERVER" sub={[`${TARGET_IP} : 443  ·  anycast`]} size={0.7} position={[SERVER[0], TOWER_H + 6, CZ]} weight={700} />
    </group>
  );
}
