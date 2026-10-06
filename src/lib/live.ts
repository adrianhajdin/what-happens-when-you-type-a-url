import { BUDGET, HOPS, TARGET_HOST, TARGET_IP, TARGET_NS } from "./journey";
import type { CacheStatus } from "./cdn";
import { km, oneWayMs, type Place } from "./places";
import type { ProbeResult } from "@/app/api/probe/route";
import type { TraceResult } from "@/app/api/trace/route";

/**
 * Everything the stages need to tell the story of one request. The landing
 * page plays EXAMPLE (a scripted, illustrative run); typing a URL replaces it
 * with a live Journey built from /api/trace + /api/probe.
 */
export type Journey = {
  kind: "example" | "live";
  host: string;
  ip: string;
  ttl: number;
  tld: string;
  tldNs: string;
  authNs: string;
  protocol: string;
  cipher: string;
  /** leaf → intermediate(s) → root */
  chain: string[];
  provider: string | null;
  pop: Place | null;
  cache: CacheStatus;
  origin: Place | null;
  visitor: Place;
  /** Raw header lines backing the CDN claims. */
  evidence: string[];
  status: number | null;
};

export const EXAMPLE: Journey = {
  kind: "example",
  host: TARGET_HOST,
  ip: TARGET_IP,
  ttl: 60,
  tld: "com",
  tldNs: "a.gtld-servers.net",
  authNs: TARGET_NS,
  protocol: "TLSv1.3",
  cipher: "TLS_AES_128_GCM_SHA256",
  chain: [TARGET_HOST, "intermediate CA", "root CA"],
  provider: "Vercel",
  pop: { code: "fra1", city: "Frankfurt", lat: HOPS.frankfurt.lat, lng: HOPS.frankfurt.lng },
  cache: "MISS",
  origin: { code: "iad1", city: "Ashburn", lat: HOPS.ashburn.lat, lng: HOPS.ashburn.lng },
  visitor: { city: "Rijeka", lat: HOPS.rijeka.lat, lng: HOPS.rijeka.lng },
  evidence: [],
  status: 200,
};

export const RIJEKA: Place = EXAMPLE.visitor;

export function fromTrace(t: TraceResult, p: ProbeResult | null, visitor: Place): Journey {
  return {
    kind: "live",
    host: t.host,
    ip: t.ip,
    ttl: t.ttl,
    tld: t.tld,
    tldNs: t.tldNs ?? `${t.tld} servers`,
    authNs: t.authNs ?? "authoritative server",
    protocol: t.tls?.protocol ?? "TLS",
    cipher: t.tls?.cipher ?? "unknown cipher",
    chain: t.tls?.chain.length ? t.tls.chain : [t.host],
    provider: p?.cdn.provider ?? null,
    pop: p?.cdn.pop ?? null,
    cache: p?.cdn.cache ?? "UNKNOWN",
    origin: p?.cdn.origin ?? null,
    visitor: p?.visitor ? { city: p.visitor.city, lat: p.visitor.lat, lng: p.visitor.lng } : visitor,
    evidence: p?.cdn.evidence ?? [],
    status: p?.status ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Story decisions                                                     */
/* ------------------------------------------------------------------ */

export const isTls13 = (j: Journey) => /1\.3/.test(j.protocol);
export const tlsLabel = (j: Journey) => j.protocol.replace("TLSv", "TLS ");
/** The cache served it: the request stops at the edge. */
export const isHit = (j: Journey) => !!j.provider && j.cache === "HIT";
/** The request continues to an origin we can place on the map. */
export const goesToOrigin = (j: Journey) => !isHit(j) && !!j.origin && (!j.pop || km(j.pop, j.origin) > 80);
/** A MISS whose origin runs in the same metro as the edge (e.g. Vercel fra1::fra1). */
export const originNearby = (j: Journey) => !isHit(j) && !!j.origin && !!j.pop && km(j.pop, j.origin) <= 80;
export const crossesOcean = (j: Journey) => {
  if (!goesToOrigin(j) || !j.pop || !j.origin) return false;
  const americas = (p: Place) => p.lng < -30;
  return americas(j.pop) !== americas(j.origin) || km(j.pop, j.origin) > 5000;
};

/** The place the visitor's connection actually terminates (edge, or the server itself without a CDN). */
export const nearEnd = (j: Journey): Place | null => j.pop ?? (j.provider ? null : j.origin);

/** Latency budget in ms, per phase. The example run keeps its hand-tuned numbers. */
export function budgetFor(j: Journey) {
  if (j.kind === "example") return { ...BUDGET };
  const near = nearEnd(j);
  // unknown location: assume a nearby edge (~400 km), the common case for CDN'd sites
  const oneWay = near ? oneWayMs(j.visitor, near) : 3;
  const rtt = Math.round(2 * oneWay + 2);
  const toOrigin = goesToOrigin(j) && near && j.origin ? Math.round(oneWayMs(near, j.origin)) : 0;
  return {
    caches: 2,
    dns: 70,
    tcp: rtt,
    tls: isTls13(j) ? rtt : 2 * rtt,
    edge: j.provider ? 8 : 0,
    ocean: toOrigin,
    origin: isHit(j) ? 2 : 120,
    back: toOrigin + Math.round(oneWay),
    render: 870,
  };
}

export const totalMs = (b: ReturnType<typeof budgetFor>) => Object.values(b).reduce((a, v) => a + v, 0);

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** Fill {host} {ip} {ns} {tldNs} {tld} {edge} {provider} placeholders in stage copy. */
export function fill(s: string, j: Journey) {
  return s
    .replaceAll("{host}", j.host)
    .replaceAll("{ip}", j.ip)
    .replaceAll("{ns}", j.authNs)
    .replaceAll("{tldNs}", j.tldNs)
    .replaceAll("{tld}", j.tld)
    .replaceAll("{edge}", j.pop?.city ?? "the nearest edge")
    .replaceAll("{provider}", j.provider ?? "no CDN");
}

const where = (p: Place | null) => (p ? `${p.city}${p.code ? ` (${p.code})` : ""}` : "an unknown location");

/** Live overrides for stage titles / concepts that depend on what actually happened. */
export function copyFor(index: number, j: Journey): { title?: string; concept?: string } {
  if (j.kind === "example") return {};
  if (index === 3 && !isTls13(j)) return { title: tlsLabel(j), concept: "Two round trips on this older protocol: agree on a cipher, prove identity, derive keys. Then everything is encrypted." };
  if (index === 4) {
    if (!j.provider) return { title: "No CDN", concept: `No CDN in front of ${j.host}: your connection goes straight to the origin server.` };
    if (isHit(j)) return { title: "Cache HIT", concept: `${j.provider}'s edge in ${where(j.pop)} already has the page. The request stops here.` };
    return { title: "The CDN edge", concept: `${j.provider}'s edge in ${where(j.pop)} has no fresh copy (${j.cache}), so it asks the origin.` };
  }
  if (index === 5) {
    if (crossesOcean(j)) return { title: "Under the ocean", concept: `Edge → origin crosses an ocean: ${where(j.pop)} to ${where(j.origin)}.` };
    if (goesToOrigin(j)) return { title: "To the origin", concept: `From the edge in ${where(j.pop)} to the origin in ${where(j.origin)}.` };
    if (originNearby(j)) return { title: "Short trip", concept: `Edge and origin both run in ${where(j.origin)}: this request never left the region.` };
    if (isHit(j)) return { title: "Short trip", concept: `Served from ${where(j.pop)}: your request never went further than that.` };
    return { title: "The physical path", concept: `Your request travels from ${j.visitor.city} to ${where(nearEnd(j))}.` };
  }
  return {};
}

/** Lower-third for the globe stage; burned into recordings, so it must stand alone. */
export function captionFor(j: Journey): { title: string; body: string } {
  if (j.kind === "example") {
    return { title: "This run: cache MISS → origin in the US (iad1)", body: "A cache HIT is answered in Frankfurt and never crosses the ocean." };
  }
  const approx = "Paths drawn as great circles; real fibre routes differ.";
  if (isHit(j)) return { title: `Cache HIT at ${where(j.pop)}`, body: `The response never travelled beyond the edge. ${approx}` };
  if (goesToOrigin(j)) return { title: `Cache ${j.cache} → origin in ${where(j.origin)}`, body: approx };
  if (originNearby(j)) return { title: `Cache ${j.cache} → origin in the same region (${j.origin!.code ?? j.origin!.city})`, body: `The edge and the origin are both in ${j.origin!.city}. ${approx}` };
  if (j.provider) return { title: `${j.provider} doesn't reveal where the origin runs`, body: `Shown: your trip to the edge${j.pop ? ` in ${j.pop.city}` : ""}. ${approx}` };
  return { title: "No CDN detected", body: `The server's location isn't public, so the map shows your side of the trip. ${approx}` };
}

/** Finale line, e.g. "1.2 s" or "≈ 0.9 s". */
export function totalLabel(j: Journey) {
  const t = totalMs(budgetFor(j)) / 1000;
  return j.kind === "example" ? "1.2 s" : `≈ ${t.toFixed(1)} s`;
}
