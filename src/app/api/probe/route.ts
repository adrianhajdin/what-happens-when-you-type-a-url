import { NextResponse, type NextRequest } from "next/server";
import { promises as dns } from "node:dns";
import https from "node:https";
import { detectCdn, type CdnInfo } from "@/lib/cdn";
import { isPrivateIp, normalizeHost } from "@/lib/host";

/**
 * Reads the site's CDN, point of presence and cache status from its response
 * headers. Deployed to five regions (vercel.json: the plan's maximum); Vercel
 * routes each visitor to the nearest one, so the PoP this request reaches is
 * close to the one their own browser uses.
 *
 * Raw node:https (not fetch: platform fetch proxies can strip CDN headers),
 * pinned to a validated public IP, one GET /, no redirects followed, body
 * discarded, 5 s cap.
 */
export const runtime = "nodejs";
export const maxDuration = 10;

export type ProbeResult = {
  host: string;
  status: number;
  server: string | null;
  location: string | null;
  cdn: CdnInfo;
  /** Vercel region this probe ran in, for transparency. */
  probedFrom: string | null;
  visitor: { city: string; lat: number; lng: number } | null;
};

function get(ip: string, host: string): Promise<{ status: number; headers: Headers }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: host,
        port: 443,
        path: "/",
        method: "GET",
        headers: { host, "user-agent": "Mozilla/5.0 (compatible; what-happens-when-you-type-a-url/1.0)", accept: "text/html,*/*" },
        timeout: 5000,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v == null) continue;
          for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one);
        }
        res.destroy(); // headers are all we need
        resolve({ status: res.statusCode ?? 0, headers });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const parsed = normalizeHost(req.nextUrl.searchParams.get("host") ?? "");
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { host } = parsed;

  let ip: string;
  try {
    const addrs = await dns.resolve4(host);
    if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("no public address");
    ip = addrs[0];
  } catch {
    return NextResponse.json({ error: `${host} doesn't resolve to a public address` }, { status: 400 });
  }

  let res: { status: number; headers: Headers };
  try {
    res = await get(ip, host);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't reach ${host}: ${(e as Error).message}` }, { status: 502 });
  }

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
    probedFrom: process.env.VERCEL_REGION ?? null,
    visitor: city && Number.isFinite(lat) && Number.isFinite(lng) ? { city: decodeURIComponent(city), lat, lng } : null,
  };
  return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
}
