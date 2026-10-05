"use client";

import { Suspense, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useStore, store } from "@/lib/store";
import { locate, type Loc } from "@/lib/stages";
import type { StageModule } from "./types";

/**
 * Lifecycle wrapper for one stage:
 *  - mounted only within ±1 of the active stage (so ~3 stages exist at once)
 *  - GLBs preloaded two stages ahead ("on approach")
 *  - drawn only while on screen (own stage or the transition touching it)
 *  - GLB cache cleared once the stage is 2+ behind / ahead
 */
export function Stage({ index, module }: { index: number; module: StageModule & { id: string } }) {
  const active = useStore((s) => s.stage);
  const group = useRef<THREE.Group>(null);
  const loc = useRef<Loc>({ index: 0, t: 0, transitioning: false, u: 0 });
  const mounted = index >= active - 1 && index <= active + 1;

  useEffect(() => {
    const urls = module.models ?? [];
    if (index >= active && index <= active + 2) urls.forEach((u) => useGLTF.preload(u));
    if (index < active - 1 || index > active + 2) urls.forEach((u) => useGLTF.clear(u));
  }, [active, index, module]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const l = locate(store().progress, loc.current);
    g.visible = l.index === index || (l.transitioning && l.index + 1 === index);
  }, -1);

  if (!mounted) return null;
  return (
    <group ref={group} name={`stage-${module.id}`}>
      <Suspense fallback={null}>
        <module.Scene index={index} />
      </Suspense>
    </group>
  );
}

/** Free GPU memory for a loaded GLB scene (geometries, materials, textures). */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
