"use client";

import { Leva, useControls, button } from "leva";
import { BLOOM } from "@/core/Effects";
import { STAGES } from "@/lib/stages";
import { jumpToStage } from "./ScrollDriver";

/** ?debug only — loaded with a dynamic import so leva never ships to visitors. */
export default function DebugPanel() {
  useControls("bloom", {
    strength: { value: BLOOM.strength, min: 0, max: 3, onChange: (v: number) => (BLOOM.strength = v) },
    radius: { value: BLOOM.radius, min: 0, max: 1, onChange: (v: number) => (BLOOM.radius = v) },
    threshold: { value: BLOOM.threshold, min: 0, max: 2, onChange: (v: number) => (BLOOM.threshold = v) },
  });
  useControls("jump", Object.fromEntries(STAGES.map((s, i) => [`${i} ${s.short}`, button(() => jumpToStage(i))])));
  return <Leva collapsed />;
}
