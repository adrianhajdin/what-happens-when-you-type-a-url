"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "@/lib/store";

const WINDOW = 45; // frames per decision
const SLOW = 1 / 30 + 0.003; // below the 30 fps floor
const FAST = 1 / 55; // comfortable headroom

/**
 * Keeps the 30 fps floor on devices we can't predict: while frames are
 * flowing back to back (scrolling), watch the average frame time and step the
 * pixel ratio down when it's too slow, back up when there's headroom.
 * Idle (demand mode) frames are ignored: their dt is meaningless.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useStore((s) => s.tier);
  const max = tier === "high" ? Math.min(window.devicePixelRatio, 1.75) : 1;
  const min = tier === "high" ? 1 : 0.6;
  const r = useRef({ sum: 0, n: 0, dpr: max, cooldown: 0 });

  useFrame((_, dt) => {
    const s = r.current;
    if (dt > 0.1) return; // a gap: rendering just resumed
    s.sum += dt;
    s.n++;
    if (s.n < WINDOW) return;
    const avg = s.sum / s.n;
    s.sum = 0;
    s.n = 0;
    if (s.cooldown > 0) {
      s.cooldown--;
      return;
    }
    let next = s.dpr;
    if (avg > SLOW && s.dpr > min) next = Math.max(min, s.dpr - 0.25);
    else if (avg < FAST && s.dpr < max) next = Math.min(max, s.dpr + 0.125);
    if (next !== s.dpr) {
      s.dpr = next;
      s.cooldown = 2;
      setDpr(next);
    }
  });
  return null;
}
