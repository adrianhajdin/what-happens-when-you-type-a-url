"use client";

import { useStore } from "@/lib/store";

/** Real progress: fonts → WebGL context → globe texture generation → shader compile → first frame. */
export function Loader() {
  const loaded = useStore((s) => s.loaded);
  const ready = useStore((s) => s.ready);
  const step = loaded < 0.3 ? "loading fonts" : loaded < 0.55 ? "starting WebGL" : loaded < 0.8 ? "drawing the night side of Earth" : loaded < 1 ? "compiling shaders" : "ready";
  return (
    <div className={`loader ${ready ? "is-done" : ""}`} aria-hidden={ready}>
      <div className="loader-orb" />
      <div className="loader-title">What happens when you type a URL</div>
      <div className="loader-bar">
        <div style={{ transform: `scaleX(${Math.max(0.04, loaded)})` }} />
      </div>
      <div className="loader-step">
        {step} · {Math.round(loaded * 100)}%
      </div>
    </div>
  );
}
