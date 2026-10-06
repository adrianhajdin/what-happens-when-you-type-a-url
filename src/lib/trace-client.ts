"use client";

import { normalizeHost } from "./host";
import { budgetFor, EXAMPLE, fromTrace, RIJEKA } from "./live";
import { setBudget } from "./stages";
import { store } from "./store";
import type { ProbeResult } from "@/app/api/probe/route";
import type { TraceResult } from "@/app/api/trace/route";

/**
 * Trace a typed URL: DNS + TLS from /api/trace, CDN edge + cache from
 * /api/probe (runs at the edge nearest the visitor), then swap the journey in
 * and rewind to the start so the visitor scrolls through their own request.
 */
export async function traceUrl(input: string) {
  const parsed = normalizeHost(input);
  if ("error" in parsed) {
    store().set({ trace: { status: "error", message: parsed.error } });
    return false;
  }
  const { host } = parsed;
  store().set({ trace: { status: "loading", host }, lastActivity: performance.now() });
  try {
    const [traceRes, probeRes] = await Promise.all([
      fetch(`/api/trace?host=${encodeURIComponent(host)}`),
      fetch(`/api/probe?host=${encodeURIComponent(host)}`).catch(() => null),
    ]);
    const trace = (await traceRes.json()) as TraceResult & { error?: string };
    if (!traceRes.ok || trace.error) throw new Error(trace.error ?? `Couldn't trace ${host}`);
    const probe = probeRes && probeRes.ok ? ((await probeRes.json()) as ProbeResult) : null;
    const o = store().origin;
    const journey = fromTrace(trace, probe, o.geolocated ? { city: o.city, lat: o.lat, lng: o.lng } : RIJEKA);
    setBudget(budgetFor(journey));
    store().set({ journey, trace: { status: "idle" }, draft: null, hotspot: null, lastActivity: performance.now() });
    const url = new URL(location.href);
    url.searchParams.set("url", host);
    history.replaceState(null, "", url);
    scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    return true;
  } catch (e) {
    store().set({ trace: { status: "error", message: (e as Error).message, host }, lastActivity: performance.now() });
    return false;
  }
}

/** Back to the scripted example run. */
export function resetJourney() {
  setBudget(budgetFor(EXAMPLE));
  store().set({ journey: EXAMPLE, trace: { status: "idle" }, draft: null, hotspot: null, lastActivity: performance.now() });
  const url = new URL(location.href);
  url.searchParams.delete("url");
  history.replaceState(null, "", url);
}
