"use client";

import { useEffect, useRef } from "react";
import { HOTSPOTS, STAGES, elapsedAt, locate, type Loc } from "@/lib/stages";
import { useStore } from "@/lib/store";
import { captionFor, copyFor, fill as fillCopy } from "@/lib/live";
import { traceUrl, resetJourney } from "@/lib/trace-client";
import { focusAddressBar } from "@/lib/address-bar";
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
  const journey = useStore((s) => s.journey);
  const draft = useStore((s) => s.draft);
  const trace = useStore((s) => s.trace);
  const input = useRef<HTMLInputElement>(null);
  const meta = STAGES[stage];
  const live = journey.kind === "live";
  const copy = copyFor(stage, journey);
  const title = copy.title ?? meta.title;
  const concept = fillCopy(copy.concept ?? meta.concept, journey);
  const caption_ = captionFor(journey);
  const card = HOTSPOTS.find((h) => h.id === hotspot);

  // At the top of the page, just start typing: any printable key opens the address bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.video || s.draft !== null || s.progress > 0.02 || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key.length === 1 && /\S/.test(e.key)) {
        e.preventDefault();
        focusAddressBar(e.key);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Transient updates: written straight to the DOM at scroll rate, no React re-render.
  useEffect(() => {
    const loc: Loc = { index: 0, t: 0, transitioning: false, u: 0 };
    return useStore.subscribe((s) => {
      locate(s.progress, loc);
      if (ms.current) ms.current.textContent = Math.round(elapsedAt(loc)).toLocaleString("en");
      if (fill.current) fill.current.style.transform = `scaleY(${s.progress})`;
      if (hint.current) {
        const top = s.progress < 0.01;
        hint.current.style.opacity = top ? "1" : "0";
        hint.current.style.visibility = top ? "visible" : "hidden";
      }
      // Stage copy dips out and back in around the midpoint of each fly-over.
      // Driven by progress, not CSS time, so it is exact when scrubbing and in recorded video.
      // caption: eases in once the stage starts, out before it ends (progress-driven, like the stage copy)
      if (caption.current) {
        const on = !loc.transitioning && STAGES[loc.index].id === "ocean" ? Math.min(1, (loc.t - 0.04) / 0.06, (0.97 - loc.t) / 0.05) : 0;
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
          <h2 className="hud-title">{title}</h2>
          <p className="hud-concept">{concept}</p>
        </div>
        <div className="hud-clock" aria-label="elapsed time">
          <div className="hud-clock-label">elapsed</div>
          <div className="hud-clock-value">
            <span ref={ms}>0</span>
            <small>ms</small>
          </div>
          <div className="hud-clock-sub">
            {live ? journey.visitor.city : origin.city} → {journey.host}
          </div>
          <div className={`hud-badge ${live ? "live" : ""}`}>
            {live ? (
              <>
                live trace{" "}
                <button onClick={() => resetJourney()} title="back to the example run">
                  ×
                </button>
              </>
            ) : (
              "example run"
            )}
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
        {meta.id === "ocean" && (
          <>
            <strong>{caption_.title}</strong>
            <span>{caption_.body}</span>
          </>
        )}
      </div>

      <div className="hud-hint" ref={hint}>
        <button className="hud-try" onClick={() => focusAddressBar()} disabled={trace.status === "loading"}>
          {trace.status === "loading" ? `tracing ${trace.host}…` : live ? "trace another site" : "type any URL"}
        </button>
        <span>{live ? `or scroll to follow your request to ${journey.host}` : "or scroll to follow an example run"}</span>
        <i />
      </div>

      {/* The real input behind the 3D address bar (visually hidden, keeps mobile keyboards and IME working). */}
      <input
        ref={input}
        id="url-input"
        className="url-input"
        type="url"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-label="Type a website to trace"
        value={draft ?? ""}
        onChange={(e) => set({ draft: e.target.value, lastActivity: performance.now() })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft) {
            e.currentTarget.blur();
            traceUrl(draft);
          } else if (e.key === "Escape") {
            set({ draft: null });
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (useStore.getState().trace.status !== "loading") set({ draft: null });
        }}
      />

      {meta.id === "ocean" && <div className="hud-orbit">drag to orbit</div>}
      {meta.hotspots.length > 0 && !card && <div className="hud-hotspot-tip">tap the glowing rings for details</div>}

      {card && (
        <aside className="hud-card" role="dialog" aria-label={card.title}>
          <button className="hud-card-close" onClick={() => set({ hotspot: null })} aria-label="close">
            ×
          </button>
          <div className="hud-card-kicker">{STAGES[card.stage].short}</div>
          <h3>{fillCopy(card.title, journey)}</h3>
          <p>{fillCopy(card.body, journey)}</p>
          {live && card.stage === 4 && journey.evidence.length > 0 && (
            <div className="hud-evidence">
              <div className="hud-card-kicker">response headers</div>
              {journey.evidence.map((e) => (
                <code key={e}>{e}</code>
              ))}
            </div>
          )}
        </aside>
      )}

      {debug && <div id="debug-stats" className="hud-debug" />}
    </div>
  );
}
