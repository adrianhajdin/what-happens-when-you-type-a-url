"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { TIME } from "./materials";
import { useStore, store } from "@/lib/store";

/** How long to keep rendering after the last scroll/drag, so damping and trails settle. */
const SETTLE_MS = 1400;

/**
 * frameloop="demand": nothing renders unless something changed. Scroll,
 * drag and hover poke the store; we keep frames flowing while the camera
 * damping settles, during the landing intro, and while dragging the globe.
 */
export function FrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.progress !== prev.progress || s.lastActivity !== prev.lastActivity || s.ready !== prev.ready) invalidate();
      }),
    [invalidate],
  );
  useFrame((state) => {
    TIME.value = state.clock.elapsedTime;
    const s = store();
    const busy = performance.now() - s.lastActivity < SETTLE_MS || s.orbit.dragging || s.progress < 0.004;
    if (busy) invalidate();
  }, -10);
  return null;
}

declare global {
  interface Window {
    __perf?: { fps: number; calls: number; triangles: number; geometries: number; textures: number; programs: number; stage: number };
  }
}

/** ?debug: fps + renderer counters, mirrored to window.__perf for PERF.md measurements. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const advance = useThree((s) => s.advance);
  const r = useRef({ frames: 0, last: performance.now() });
  useEffect(() => {
    // handle for console / automated measurement in ?debug
    (window as unknown as { __three: unknown }).__three = { gl, scene, invalidate, advance };
    /**
     * Synchronous benchmark (independent of rAF throttling / vsync): renders
     * `frames` frames back to back, forcing a GPU sync after each, and returns
     * the mean frame cost. Used to produce PERF.md.
     */
    (window as unknown as { __bench: unknown }).__bench = async (progress: number, stage: number, frames = 60) => {
      store().set({ progress, stage, lastActivity: performance.now() });
      await new Promise((r) => setTimeout(r, 400)); // let React mount the stage window
      const ctx = gl.getContext();
      const px = new Uint8Array(4);
      const sync = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      for (let i = 0; i < 40; i++) advance(performance.now()); // settle damping + compile
      sync();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        advance(performance.now());
        sync();
      }
      const ms = (performance.now() - t0) / frames;
      const info = gl.info;
      return {
        ms: +ms.toFixed(2),
        fps: Math.round(1000 / ms),
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      };
    };
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl, scene, invalidate, advance]);
  useFrame(() => {
    gl.info.reset();
  }, -100);
  useFrame(() => {
    const s = r.current;
    s.frames++;
    const now = performance.now();
    if (now - s.last < 500) return;
    const fps = (s.frames * 1000) / (now - s.last);
    s.frames = 0;
    s.last = now;
    const i = gl.info;
    window.__perf = {
      fps: Math.round(fps),
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs?.length ?? 0,
      stage: store().stage,
    };
    const el = document.getElementById("debug-stats");
    if (el) {
      const p = window.__perf;
      el.textContent = `${p.fps} fps · ${p.calls} calls · ${(p.triangles / 1000).toFixed(0)}k tris · ${p.geometries} geo · ${p.textures} tex · ${p.programs} prog`;
    }
  }, 2);
  return null;
}
