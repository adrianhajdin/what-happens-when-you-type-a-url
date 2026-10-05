"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { RANGES, SCROLL_VH, STAGES, activeIndex, locate, type Loc } from "@/lib/stages";
import { store } from "@/lib/store";

gsap.registerPlugin(ScrollTrigger);

export function jumpToStage(i: number) {
  const max = document.documentElement.scrollHeight - innerHeight;
  // land a little inside the stage so its opening beat has started
  const r = RANGES[i];
  scrollTo({ top: (r.start + (r.end - r.start) * 0.02) * max, behavior: "smooth" });
}

/**
 * The master timeline. A tall track scrolls the page; ScrollTrigger scrubs a
 * single tween of `progress` 0 → 1 (the scrub adds inertia). Everything 3D
 * reads store().progress inside its own frame loop.
 */
export function ScrollDriver() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const proxy = { p: 0 };
    const loc: Loc = { index: 0, t: 0, transitioning: false, u: 0 };
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: track.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.9,
      },
    });
    tl.to(proxy, {
      p: 1,
      ease: "none",
      duration: 1,
      onUpdate: () => {
        const s = store();
        const stage = activeIndex(locate(proxy.p, loc));
        s.set({
          progress: proxy.p,
          lastActivity: performance.now(),
          ...(stage !== s.stage ? { stage, hotspot: null } : null),
        });
      },
    });
    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <div ref={track} className="track" style={{ height: `${SCROLL_VH}vh` }}>
      {/* Readable outline of the whole story for screen readers and crawlers. */}
      <article className="sr-only">
        <h1>What happens when you type a URL</h1>
        {STAGES.map((s) => (
          <section key={s.id}>
            <h2>{s.title}</h2>
            <p>{s.concept}</p>
            {s.hotspots.map((h) => (
              <p key={h.id}>
                <strong>{h.title}.</strong> {h.body}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
