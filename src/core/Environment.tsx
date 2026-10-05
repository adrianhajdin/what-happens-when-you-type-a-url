"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, store } from "@/lib/store";
import { locate, type Loc } from "@/lib/stages";

/**
 * A set shared by several consecutive stages (e.g. the canyon used by TCP and
 * TLS). Same mount / visibility rules as <Stage>, applied to the union.
 */
export function SharedSet({ stages, children }: { stages: number[]; children: ReactNode }) {
  const active = useStore((s) => s.stage);
  const group = useRef<THREE.Group>(null);
  const loc = useRef<Loc>({ index: 0, t: 0, transitioning: false, u: 0 });
  const mounted = stages.some((i) => i >= active - 1 && i <= active + 1);
  useFrame(() => {
    if (!group.current) return;
    const l = locate(store().progress, loc.current);
    group.current.visible = stages.includes(l.index) || (l.transitioning && stages.includes(l.index + 1));
  }, -1);
  if (!mounted) return null;
  return <group ref={group}>{children}</group>;
}
