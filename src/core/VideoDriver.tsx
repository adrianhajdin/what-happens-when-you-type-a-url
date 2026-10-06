"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { activeIndex, locate, RANGES, type Loc } from "@/lib/stages";
import { store } from "@/lib/store";
import { SCENES } from "@/scenes";
import { earthTextures } from "@/scenes/globe/earthTexture";
import { rigControl } from "./CameraRig";

declare global {
  interface Window {
    /** Set by scripts/record-video.mjs before the page loads: a clock it advances per frame. */
    __virtual?: { on: boolean; t: number };
    __video?: {
      ranges: { start: number; end: number }[];
      ready: () => Promise<void>;
      frame: (progress: number, dtMs: number, opts?: { cut?: boolean }) => Promise<void>;
      /** Big title card over the frame (cold open). Hides the HUD while shown. */
      overlay: (o: { title: string; sub?: string; opacity: number } | null) => void;
    };
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * ?video: the Canvas runs with frameloop="never" and this exposes a
 * frame-by-frame API for the recorder. Time is virtual (performance.now is
 * patched by the recorder), so the output plays at real speed no matter how
 * long each frame takes to render and capture.
 */
export function VideoDriver() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    const loc: Loc = { index: 0, t: 0, transitioning: false, u: 0 };
    window.__video = {
      ranges: RANGES,
      async ready() {
        // everything the journey needs, up front: no pop-in mid-recording
        earthTextures(store().tier === "high" ? 4096 : 2048);
        for (const m of SCENES) for (const url of m.models ?? []) useGLTF.preload(url);
        for (let i = 0; i < 100 && !store().ready; i++) await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => setTimeout(r, 600));
      },
      overlay(o) {
        let el = document.getElementById("video-hook");
        if (!el) {
          el = document.createElement("div");
          el.id = "video-hook";
          el.innerHTML = "<h1></h1><p></p>";
          document.body.appendChild(el);
        }
        document.documentElement.classList.toggle("is-coldopen", !!o);
        el.style.opacity = o ? String(o.opacity) : "0";
        if (o) {
          el.querySelector("h1")!.textContent = o.title;
          el.querySelector("p")!.textContent = o.sub ?? "";
        }
      },
      async frame(progress, dtMs, opts) {
        if (opts?.cut) rigControl.snap = true;
        const v = window.__virtual;
        if (v) v.t += dtMs;
        const stage = activeIndex(locate(progress, loc));
        store().set({ progress, stage, lastActivity: performance.now() });
        // let React mount / unmount stages before drawing
        await tick();
        await tick();
        advance(performance.now());
      },
    };
    return () => {
      delete window.__video;
    };
  }, [advance]);
  return null;
}
