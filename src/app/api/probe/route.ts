import { NextResponse, type NextRequest } from "next/server";
import { detectCdn, type CdnInfo } from "@/lib/cdn";
import { normalizeHost } from "@/lib/host";

/**
 * Runs at the edge, in the Vercel region nearest the visitor, so the request
 * it makes reaches the same CDN point of presence the visitor's own browser
 * would. The response headers reveal the CDN, that PoP and its cache status.
 *
 * One GET to the site's root, no redirects followed, body discarded, 5 s cap.
 */
export const runtime = "edge";

export type ProbeResult = {
  host: string;
  status: number;
  server: string | null;
  location: string | null;
  cdn: CdnInfo;
  /** Where this probe itself ran (Vercel edge region), for transparency. */
  probedFrom: string | null;
  visitor: { city: string; lat: number; lng: number } | null;
};

export async function GET(req: NextRequest) {
  const parsed = normalizeHost(req.nextUrl.searchParams.get("host") ?? "");
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { host } = parsed;

  let res: Response;
  try {
    res = await fetch(`https://${host}/`, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; what-happens-when-you-type-a-url/1.0)", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't reach ${host}: ${(e as Error).message}` }, { status: 502 });
  }
  res.body?.cancel().catch(() => undefined);

  const h = req.headers;
  const city = h.get("x-vercel-ip-city");
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  const body: ProbeResult = {
    host,
    status: res.status,
    server: res.headers.get("server"),
    location: res.headers.get("location"),
    cdn: detectCdn(res.headers),
    probedFrom: (h.get("x-vercel-id") ?? "").split("::")[0] || null,
    visitor: city && Number.isFinite(lat) && Number.isFinite(lng) ? { city: decodeURIComponent(city), lat, lng } : null,
  };
  return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
}
