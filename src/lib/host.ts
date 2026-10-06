/**
 * Turn whatever someone typed ("https://GitHub.com/foo?x", "github.com",
 * "münchen.de") into a public hostname, or explain why not. Shared by the
 * address bar and both API routes.
 */
export function normalizeHost(input: string): { host: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Type a site, like github.com" };
  if (raw.length > 300) return { error: "That's too long for a URL" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: "That doesn't look like a URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only web addresses (http/https)" };
  const host = url.hostname.toLowerCase().replace(/\.$/, ""); // punycoded by URL
  if (!host.includes(".")) return { error: "Add a domain ending, like .com" };
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return { error: "Use a domain name, not an IP address" };
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) return { error: "That's not a public site" };
  if (host.length > 253 || host.split(".").some((l) => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l))) return { error: "That isn't a valid domain" };
  return { host };
}

/** Private, loopback, link-local, CGNAT, multicast… anything a public site can't legitimately resolve to. */
export function isPrivateIp(ip: string) {
  if (ip.includes(":")) {
    const s = ip.toLowerCase();
    return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb") || s.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
