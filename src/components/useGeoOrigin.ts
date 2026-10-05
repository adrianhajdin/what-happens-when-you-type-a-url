"use client";

import { useEffect } from "react";
import { inEurope } from "@/lib/journey";
import { store } from "@/lib/store";

/**
 * Start the journey from the visitor's approximate city (Vercel's geo-IP
 * headers via /api/geo). The route through Frankfurt → Atlantic only makes
 * sense for European visitors, so anyone else keeps the Rijeka default.
 * Disable with ?geo=0.
 */
export function useGeoOrigin() {
  useEffect(() => {
    if (new URLSearchParams(location.search).get("geo") === "0") return;
    const ctl = new AbortController();
    fetch("/api/geo", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { city?: string; lat?: number; lng?: number } | null) => {
        if (!g?.city || g.lat == null || g.lng == null) return;
        const p = { lat: g.lat, lng: g.lng };
        if (!inEurope(p)) return;
        store().set({ origin: { city: g.city, ...p, geolocated: true } });
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);
}
