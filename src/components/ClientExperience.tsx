"use client";

import dynamic from "next/dynamic";

/** Server-rendered placeholder so the first paint already looks like the loader. */
function Boot() {
  return (
    <div className="loader">
      <div className="loader-orb" />
      <div className="loader-title">What happens when you type a URL</div>
      <div className="loader-bar">
        <div style={{ transform: "scaleX(0.04)" }} />
      </div>
      <div className="loader-step">loading · 0%</div>
    </div>
  );
}

/** WebGL needs the browser: skip SSR for the whole experience. */
const Experience = dynamic(() => import("./Experience"), { ssr: false, loading: Boot });

export default function ClientExperience() {
  return <Experience />;
}
