"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Packet, type PacketHandle } from "./Packet";
import type { PacketPose } from "./types";
import { SCENES } from "@/scenes";
import { locate, type Loc } from "@/lib/stages";
import { easeInOut } from "@/lib/math";
import { store } from "@/lib/store";

const pose = (): PacketPose => ({ position: new THREE.Vector3(), scale: 1, visible: false });

/**
 * The one packet that travels the whole journey. Each stage says where it is
 * (module.packet(t)); between stages it flies from packet(1) to next.packet(0).
 */
export function HeroPacket() {
  const ref = useRef<PacketHandle>(null);
  const r = useRef({ loc: { index: 0, t: 0, transitioning: false, u: 0 } as Loc, a: pose(), b: pose() });

  useFrame(() => {
    const h = ref.current;
    if (!h) return;
    const { loc, a, b } = r.current;
    locate(store().progress, loc);
    const m = SCENES[loc.index];
    a.visible = false;
    a.scale = 1;
    if (!loc.transitioning) {
      m.packet?.(loc.t, a);
    } else {
      b.visible = false;
      b.scale = 1;
      m.packet?.(1, a);
      SCENES[loc.index + 1].packet?.(0, b);
      if (a.visible && b.visible) {
        const u = easeInOut(loc.u);
        const d = a.position.distanceTo(b.position);
        a.position.lerp(b.position, u);
        a.position.y += Math.sin(Math.PI * u) * Math.min(d * 0.15, 40);
        a.scale += (b.scale - a.scale) * u;
      } else if (b.visible && loc.u > 0.5) {
        a.position.copy(b.position);
        a.scale = b.scale;
        a.visible = true;
      }
    }
    h.setVisible(a.visible);
    h.setScale(a.scale);
    h.setPosition(a.position);
  }, -1);

  return <Packet ref={ref} />;
}
