import { NextResponse, type NextRequest } from "next/server";
import { promises as dns } from "node:dns";
import tls from "node:tls";
import { isPrivateIp, normalizeHost } from "@/lib/host";

/**
 * The location-independent facts about a site: DNS records and the TLS
 * handshake. (Where the CDN edge is depends on where the visitor is, so that
 * part is measured by the edge function in /api/probe.)
 *
 * Safety: only public hostnames; every resolved address must be public; the
 * TLS connection is pinned to the IP we checked (no DNS rebinding); no HTTP
 * request is sent; everything has a short timeout.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

export type TraceResult = {
  host: string;
  ip: string;
  ips: string[];
  ttl: number;
  cname: string | null;
  tld: string;
  tldNs: string | null;
  zone: string;
  authNs: string | null;
  tls: { protocol: string | null; cipher: string | null; chain: string[]; alpn: string | null } | null;
};

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

/** Walk up the labels until we hit the zone that has NS records (e.g. www.github.com → github.com). */
async function zoneNs(host: string) {
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const zone = labels.slice(i).join(".");
    try {
      const ns = await withTimeout(dns.resolveNs(zone), 2500, "NS lookup");
      if (ns.length) return { zone, ns: ns.sort()[0] };
    } catch {
      /* try the parent */
    }
  }
  return { zone: labels.slice(-2).join("."), ns: null };
}

function certName(c: tls.PeerCertificate) {
  const s = c.subject ?? ({} as tls.Certificate);
  return (s.CN || s.O || "certificate").toString();
}

function handshake(ip: string, host: string): Promise<TraceResult["tls"]> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: ip, port: 443, servername: host, ALPNProtocols: ["h2", "http/1.1"], timeout: 5000 });
    const done = (fn: () => void) => {
      socket.removeAllListeners();
      socket.destroy();
      fn();
    };
    socket.once("secureConnect", () => {
      const chain: string[] = [];
      let c: tls.DetailedPeerCertificate | undefined = socket.getPeerCertificate(true);
      const seen = new Set<string>();
      while (c && c.raw && !seen.has(c.fingerprint256) && chain.length < 4) {
        seen.add(c.fingerprint256);
        chain.push(certName(c));
        c = c.issuerCertificate;
      }
      // read everything before done() destroys the socket
      const cipher = socket.getCipher();
      const info = {
        protocol: socket.getProtocol() ?? null,
        cipher: cipher?.standardName ?? cipher?.name ?? null,
        chain,
        alpn: socket.alpnProtocol || null,
      };
      done(() => resolve(info));
    });
    socket.once("timeout", () => done(() => reject(new Error("TLS handshake timed out"))));
    socket.once("error", (e) => done(() => reject(e)));
  });
}

export async function GET(req: NextRequest) {
  const parsed = normalizeHost(req.nextUrl.searchParams.get("host") ?? "");
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { host } = parsed;

  let records: { address: string; ttl: number }[];
  try {
    records = await withTimeout(dns.resolve4(host, { ttl: true }), 3000, "DNS lookup");
  } catch {
    return NextResponse.json({ error: `${host} doesn't resolve (no IPv4 address found)` }, { status: 404 });
  }
  if (!records.length) return NextResponse.json({ error: `${host} has no IPv4 address` }, { status: 404 });
  if (records.some((r) => isPrivateIp(r.address))) {
    return NextResponse.json({ error: `${host} points at a private address` }, { status: 400 });
  }

  let cname: string | null = null;
  try {
    cname = (await withTimeout(dns.resolveCname(host), 2000, "CNAME"))[0] ?? null;
  } catch {
    /* most apex domains have none */
  }
  const tld = host.split(".").pop()!;
  const [zone, tldNs] = await Promise.all([
    zoneNs(host),
    withTimeout(dns.resolveNs(tld), 2500, "TLD lookup")
      .then((ns) => ns.sort()[0] ?? null)
      .catch(() => null),
  ]);

  const ip = records[0].address;
  let tlsInfo: TraceResult["tls"] = null;
  try {
    tlsInfo = await handshake(ip, host);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't open HTTPS to ${host}: ${(e as Error).message}` }, { status: 502 });
  }

  const body: TraceResult = {
    host,
    ip,
    ips: records.map((r) => r.address),
    ttl: records[0].ttl,
    cname,
    tld,
    tldNs,
    zone: zone.zone,
    authNs: zone.ns,
    tls: tlsInfo,
  };
  // identical for everyone for a few minutes: let Vercel's cache absorb repeats
  return NextResponse.json(body, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
