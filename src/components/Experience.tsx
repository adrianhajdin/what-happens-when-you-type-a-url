"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { CameraRig } from "@/core/CameraRig";
import { Stage } from "@/core/Stage";
import { SharedSet } from "@/core/Environment";
import { World } from "@/core/World";
import { HeroPacket } from "@/core/HeroPacket";
import { Effects } from "@/core/Effects";
import { FrameDriver, PerfProbe } from "@/core/FrameDriver";
import { Hotspots } from "@/core/Hotspots";
import { clearLabelCache } from "@/core/Label";
import { Canyon } from "@/scenes/parts/Canyon";
import { earthTextures } from "@/scenes/globe/earthTexture";
import { SCENES } from "@/scenes";
import { useStore, store, type Tier } from "@/lib/store";
import { ScrollDriver } from "./ScrollDriver";
import { Hud } from "./Hud";
import { Loader } from "./Loader";
import { useGeoOrigin } from "./useGeoOrigin";

function detectTier(): Tier {
  const q = new URLSearchParams(location.search).get("tier");
  if (q === "low" || q === "high") return q;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || small || weak ? "low" : "high";
}

/** Signals the loader once the first real frame has been drawn with all programs compiled. */
function Ready() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      store().set({ loaded: 0.55 });
      await new Promise((r) => setTimeout(r, 30));
      const steps: Record<string, number> = {};
      store().set({ loaded: 0.8 });
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      await gl.compileAsync?.(scene, camera);
      steps.compile = Math.round(performance.now() - t0);
      (window as unknown as { __loadSteps: unknown }).__loadSteps = steps;
      if (cancelled) return;
      store().set({ loaded: 1 });
      requestAnimationFrame(() => {
        (window as unknown as { __ttff: number }).__ttff = Math.round(performance.now());
        store().set({ ready: true, lastActivity: performance.now() });
        // The globe texture is the heaviest CPU job (~50–100 ms). Do it once the
        // first frame is up, while the visitor reads stage 0; it's long done by
        // the time the globe mounts (stage 4).
        const gen = () => {
          const t = performance.now();
          earthTextures(store().tier === "high" ? 4096 : 2048);
          steps.earth = Math.round(performance.now() - t);
        };
        if ("requestIdleCallback" in window) requestIdleCallback(gen, { timeout: 2500 });
        else setTimeout(gen, 600);
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);
  return null;
}

const DebugPanel = dynamic(() => import("./DebugPanel"), { ssr: false });

export default function Experience() {
  const debug = useStore((s) => s.debug);
  const tier = useStore((s) => s.tier);
  const stage = useStore((s) => s.stage);
  const [fontsReady, setFontsReady] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useGeoOrigin();

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    store().set({ debug: q.has("debug"), tier: detectTier() });
    if (q.has("debug")) (window as unknown as { __store: typeof useStore }).__store = useStore;
    const fams = ["--font-mono", "--font-sans"].map((v) => getComputedStyle(document.body).getPropertyValue(v).trim());
    Promise.all(fams.flatMap((f) => (f ? [document.fonts.load(`700 64px ${f}`), document.fonts.load(`500 64px ${f}`)] : [])))
      .catch(() => undefined)
      .then(() => {
        clearLabelCache();
        store().set({ loaded: 0.3 });
        setFontsReady(true);
      });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && store().set({ hotspot: null });
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const ocean = SCENES.findIndex((s) => s.id === "ocean");
  const onDown = (e: React.PointerEvent) => {
    if (store().stage !== ocean) return;
    drag.current = { x: e.clientX, y: e.clientY };
    store().orbit.dragging = true;
    store().poke();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const o = store().orbit;
    o.yaw -= (e.clientX - drag.current.x) * 0.004;
    o.pitch = Math.max(-0.5, Math.min(0.5, o.pitch - (e.clientY - drag.current.y) * 0.003));
    drag.current = { x: e.clientX, y: e.clientY };
    store().poke();
  };
  const onUp = () => {
    drag.current = null;
    store().orbit.dragging = false;
    store().poke();
  };

  return (
    <>
      <div
        className="canvas-wrap"
        data-orbit={stage === ocean ? "on" : "off"}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {fontsReady && (
          <Canvas
            frameloop="demand"
            dpr={tier === "high" ? [1, 1.75] : [1, 1]}
            gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
            camera={{ fov: 45, near: 0.1, far: 9000, position: [0, 9.4, 15.5] }}
          >
            <FrameDriver />
            <CameraRig />
            <World />
            <SharedSet stages={[2, 3]}>
              <Canyon />
            </SharedSet>
            {SCENES.map((m, i) => (
              <Stage key={m.id} index={i} module={m} />
            ))}
            <HeroPacket />
            <Hotspots />
            <Effects />
            <Ready />
            {debug && <PerfProbe />}
          </Canvas>
        )}
      </div>
      <ScrollDriver />
      <Hud />
      <Loader />
      {debug && <DebugPanel />}
    </>
  );
}
