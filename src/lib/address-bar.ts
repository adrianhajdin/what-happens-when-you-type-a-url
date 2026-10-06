"use client";

import { store } from "./store";

/** The 3D address bar is backed by a real (visually hidden) <input id="url-input"> in the HUD. */
export function focusAddressBar(initial = "") {
  const s = store();
  if (s.video || s.trace.status === "loading") return;
  if (s.progress > 0.02) scrollTo({ top: 0, behavior: "smooth" });
  s.set({ draft: s.draft ?? initial, trace: { status: "idle" }, lastActivity: performance.now() });
  const el = document.getElementById("url-input") as HTMLInputElement | null;
  el?.focus({ preventScroll: true });
}
