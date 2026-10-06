"use client";

import { useEffect, useRef } from "react";
import { HOTSPOTS, STAGES, elapsedAt, locate, type Loc } from "@/lib/stages";
import { useStore } from "@/lib/store";
import { TARGET_HOST } from "@/lib/journey";
import { jumpToStage } from "./ScrollDriver";

export function Hud() {
  const stage = useStore((s) => s.stage);
  const hotspot = useStore((s) => s.hotspot);
  const debug = useStore((s) => s.debug);
  const ready = useStore((s) => s.ready);
  const origin = useStore((s) => s.origin);
  const set = useStore((s) => s.set);
  const ms = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const stageText = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const meta = STAGES[stage];
  const card = HOTSPOTS.find((h) => h.id === hotspot);

  // Transient updates: written straight to the DOM at scroll rate, no React re-render.
  useEffect(() => {
    const loc: Loc = { index: 0, t: 0, transitioning: false, u: 0 };
    return useStore.subscribe((s) => {
      locate(s.progress, loc);
      if (ms.current) ms.current.textContent = Math.round(elapsedAt(loc)).toLocaleString("en");
      if (fill.current) fill.current.style.transform = `scaleY(${s.progress})`;
      if (hint.current) hint.current.style.opacity = s.progress < 0.01 ? "1" : "0";
      // Stage copy dips out and back in around the midpoint of each fly-over.
      // Driven by progress, not CSS time, so it is exact when scrubbing and in recorded video.
      // caption: eases in once the stage starts, out before it ends (progress-driven, like the stage copy)
      if (caption.current) {
        const on = !loc.transitioning && STAGES[loc.index].caption ? Math.min(1, (loc.t - 0.04) / 0.06, (0.97 - loc.t) / 0.05) : 0;
        const k = Math.max(0, Math.min(1, on));
        caption.current.style.opacity = String(k);
        caption.current.style.transform = `translate(-50%, ${(1 - k) * 10}px)`;
      }
      if (stageText.current) {
        const k = loc.transitioning ? Math.min(1, Math.abs(loc.u - 0.5) * 3.2) : 1;
        stageText.current.style.opacity = String(k * k * (3 - 2 * k));
      }
    });
  }, []);

  return (
    <div className={`hud ${ready ? "is-ready" : ""}`}>
      <header className="hud-top">
        <div className="hud-stage" ref={stageText}>
          <div className="hud-kicker">
            <span className="hud-num">{String(stage + 1).padStart(2, "0")}</span>
            <span className="hud-of">/ {String(STAGES.length).padStart(2, "0")}</span>
            <span className="hud-short">{meta.short}</span>
          </div>
          <h2 className="hud-title">{meta.title}</h2>
          <p className="hud-concept">{meta.concept}</p>
        </div>
        <div className="hud-clock" aria-label="elapsed time">
          <div className="hud-clock-label">elapsed</div>
          <div className="hud-clock-value">
            <span ref={ms}>0</span>
            <small>ms</small>
          </div>
          <div className="hud-clock-sub">
            {origin.city} → {TARGET_HOST}
          </div>
        </div>
      </header>

      <nav className="hud-rail" aria-label="stages">
        <div className="hud-rail-track">
          <div className="hud-rail-fill" ref={fill} />
        </div>
        {STAGES.map((s, i) => (
          <button key={s.id} className={`hud-tick ${i === stage ? "on" : ""} ${i < stage ? "done" : ""}`} onClick={() => jumpToStage(i)}>
            <span className="hud-tick-dot" />
            <span className="hud-tick-label">{s.short}</span>
          </button>
        ))}
      </nav>

      <div className="hud-caption" ref={caption} style={{ opacity: 0 }}>
        {meta.caption && (
          <>
            <strong>{meta.caption.title}</strong>
            <span>{meta.caption.body}</span>
          </>
        )}
      </div>

      <div className="hud-hint" ref={hint}>
        <span>scroll to send the request</span>
        <i />
      </div>

      {meta.id === "ocean" && <div className="hud-orbit">drag to orbit</div>}
      {meta.hotspots.length > 0 && !card && <div className="hud-hotspot-tip">tap the glowing rings for details</div>}

      {card && (
        <aside className="hud-card" role="dialog" aria-label={card.title}>
          <button className="hud-card-close" onClick={() => set({ hotspot: null })} aria-label="close">
            ×
          </button>
          <div className="hud-card-kicker">{STAGES[card.stage].short}</div>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </aside>
      )}

      {debug && <div id="debug-stats" className="hud-debug" />}
    </div>
  );
}
