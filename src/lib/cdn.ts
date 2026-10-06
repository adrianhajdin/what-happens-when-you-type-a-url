import { airport, vercelRegion, type Place } from "./places";

export type CacheStatus = "HIT" | "MISS" | "DYNAMIC" | "UNKNOWN";

export type CdnInfo = {
  /** Display name, or null when no CDN was detected (the origin answered directly). */
  provider: string | null;
  /** The edge location that answered (near whoever made the request). */
  pop: Place | null;
  cache: CacheStatus;
  /** Where the origin runs, when the provider reveals it (Vercel functions do). */
  origin: Place | null;
  /** Raw header evidence, shown in the UI so the claim can be checked. */
  evidence: string[];
};

function cacheFrom(v: string | null | undefined): CacheStatus {
  if (!v) return "UNKNOWN";
  const s = v.toLowerCase();
  if (/\bhit\b|stale|revalidated|prerender/.test(s)) return "HIT";
  if (/\bmiss\b|expired/.test(s)) return "MISS";
  if (/dynamic|bypass|pass/.test(s)) return "DYNAMIC";
  return "UNKNOWN";
}

/**
 * Identify the CDN, the edge location and the cache status from response
 * headers. Pure function: used by the edge probe, unit-testable.
 */
export function detectCdn(h: Headers): CdnInfo {
  const get = (k: string) => h.get(k);
  const ev = (k: string) => {
    const v = get(k);
    return v ? `${k}: ${v}` : null;
  };
  const evidence = (...keys: string[]) => keys.map(ev).filter((x): x is string => !!x);
  const server = (get("server") ?? "").toLowerCase();

  // Vercel: x-vercel-id = "fra1::iad1::abcd-…" (edge::function-region::id) or "fra1::abcd-…" (static)
  const vid = get("x-vercel-id");
  if (vid) {
    const parts = vid.split("::");
    const pop = vercelRegion(parts[0]);
    const fn = parts.length >= 3 ? vercelRegion(parts[1]) : null;
    return { provider: "Vercel", pop, cache: cacheFrom(get("x-vercel-cache")), origin: fn, evidence: evidence("x-vercel-id", "x-vercel-cache") };
  }
  // Cloudflare: cf-ray = "8b0f…-FRA"
  const ray = get("cf-ray");
  if (ray || server === "cloudflare") {
    const code = ray?.split("-").pop();
    return { provider: "Cloudflare", pop: airport(code), cache: cacheFrom(get("cf-cache-status")), origin: null, evidence: evidence("cf-ray", "cf-cache-status") };
  }
  // CloudFront: x-amz-cf-pop = "FRA56-P1"
  const cf = get("x-amz-cf-pop");
  if (cf || /cloudfront/i.test(get("via") ?? "")) {
    return { provider: "Amazon CloudFront", pop: airport(cf?.slice(0, 3)), cache: cacheFrom(get("x-cache")), origin: null, evidence: evidence("x-amz-cf-pop", "x-cache") };
  }
  // Fastly: x-served-by = "cache-fra-etou8220098-FRA" (sometimes a shield + edge list)
  const served = get("x-served-by");
  if (served && /cache-/.test(served)) {
    const last = served.split(",").pop()!.trim();
    const code = last.split("-").pop();
    const hits = (get("x-cache") ?? "").split(",").pop();
    return { provider: "Fastly", pop: airport(code), cache: cacheFrom(hits), origin: null, evidence: evidence("x-served-by", "x-cache") };
  }
  // Netlify
  if (server.includes("netlify") || get("x-nf-request-id")) {
    return { provider: "Netlify", pop: null, cache: cacheFrom(get("cache-status")), origin: null, evidence: evidence("server", "cache-status") };
  }
  // Akamai
  if (server.includes("akamai") || get("x-akamai-transformed")) {
    return { provider: "Akamai", pop: null, cache: cacheFrom(get("x-cache")), origin: null, evidence: evidence("server", "x-cache") };
  }
  // Google front ends (gws / ESF / Google Frontend)
  if (/^(gws|esf|google frontend|gfe)/.test(server) || /google/i.test(get("via") ?? "")) {
    return { provider: "Google edge", pop: null, cache: "DYNAMIC", origin: null, evidence: evidence("server", "via") };
  }
  // Generic proxies that still say whether they cached
  const generic = get("x-cache") ?? get("cache-status");
  if (generic) {
    // a cache layer that doesn't announce a brand (e.g. Wikimedia's own Varnish/ATS fleet)
    const last = generic.split(",").pop();
    return { provider: "a caching proxy", pop: null, cache: cacheFrom(last), origin: null, evidence: evidence("server", "x-cache", "cache-status") };
  }
  return {
    provider: null,
    pop: null,
    cache: cacheFrom(generic),
    origin: null,
    evidence: evidence("server", "x-cache", "cache-status"),
  };
}
