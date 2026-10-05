import { BUDGET, TARGET_HOST, TARGET_IP } from "./journey";
import type { Vec3 } from "./math";
import { clamp01 } from "./math";

export type Hotspot = {
  id: string;
  /** World-space position of the marker. */
  position: Vec3;
  title: string;
  body: string;
};

export type StageMeta = {
  id: string;
  title: string;
  /** Short label for the progress rail. */
  short: string;
  concept: string;
  /** Relative scroll length. */
  duration: number;
  /** FogExp2 density while this stage is on screen. */
  fog: number;
  /** Elapsed-ms counter at stage start → end. */
  elapsed: [number, number];
  /** Optional non-linear mapping local t → 0..1 of the elapsed range. */
  elapsedCurve?: (t: number) => number;
  hotspots: Hotspot[];
};

const b = BUDGET;
const t0 = 0;
const t1 = t0 + b.caches;
const t2 = t1 + b.dns;
const t3 = t2 + b.tcp;
const t4 = t3 + b.tls;
const t5 = t4 + b.edge;
const t6 = t5 + b.ocean + b.origin + b.back;
const t7 = t6 + b.render;

export const STAGES: StageMeta[] = [
  {
    id: "url",
    title: "The URL bar",
    short: "URL",
    concept: "Before touching the network, the browser checks every cache it owns.",
    duration: 1.3,
    fog: 0.016,
    elapsed: [t0, t1],
    hotspots: [
      {
        id: "url-bar",
        position: [-6.4, 9.9, 0.4],
        title: "Parsing what you typed",
        body: `The browser decides whether "${TARGET_HOST}" is a search or a URL, adds https:// (or upgrades via its HSTS preload list), and only then starts looking things up.`,
      },
      {
        id: "url-browser-cache",
        position: [-4.6, 13.6, -4],
        title: "Browser cache",
        body: "Chrome keeps its own DNS cache (chrome://net-internals/#dns) and an HTTP cache. A fresh hit here means zero network traffic. Cold start: MISS.",
      },
      {
        id: "url-os-cache",
        position: [4.6, 13.6, -4],
        title: "OS stub resolver",
        body: "Next the operating system's resolver cache and the hosts file. Also a MISS, so a real DNS query has to leave your machine.",
      },
    ],
  },
  {
    id: "dns",
    title: "DNS: finding the address",
    short: "DNS",
    concept: `Recursive resolution: four servers turn "${TARGET_HOST}" into ${TARGET_IP}.`,
    duration: 1.8,
    fog: 0.011,
    elapsed: [t1, t2],
    hotspots: [
      {
        id: "dns-resolver",
        position: [-14, 12.5, -48],
        title: "Recursive resolver",
        body: "Run by your ISP (or 1.1.1.1 / 8.8.8.8). It does the legwork for you and caches every answer for its TTL, so the next visitor skips all of this.",
      },
      {
        id: "dns-root",
        position: [-2, 37, -72],
        title: "Root servers",
        body: "13 named root servers (a–m.root-servers.net), hundreds of anycast instances. They don't know vercel.com. They only know who runs .com.",
      },
      {
        id: "dns-tld",
        position: [12, 22.5, -64],
        title: ".com TLD servers",
        body: "Operated by Verisign. They answer with the authoritative nameservers for vercel.com, not the address itself.",
      },
      {
        id: "dns-auth",
        position: [22, 17.5, -50],
        title: "Authoritative nameserver",
        body: `The source of truth for the zone. It returns the A record: ${TARGET_IP}, with a TTL saying how long resolvers may cache it.`,
      },
    ],
  },
  {
    id: "tcp",
    title: "TCP handshake",
    short: "TCP",
    concept: "Three packets agree on sequence numbers before a single byte of data moves.",
    duration: 1.1,
    fog: 0.01,
    elapsed: [t2, t3],
    hotspots: [
      {
        id: "tcp-client",
        position: [-19, 19.5, -150],
        title: "Your end of the socket",
        body: "Picks a random ephemeral port and a random initial sequence number, then sends SYN. State: SYN_SENT.",
      },
      {
        id: "tcp-server",
        position: [19, 19.5, -150],
        title: `${TARGET_IP}:443`,
        body: "An anycast address: the same IP is announced from many cities, and BGP routes you to the nearest, Frankfurt. It answers SYN-ACK with its own sequence number.",
      },
    ],
  },
  {
    id: "tls",
    title: "TLS 1.3",
    short: "TLS",
    concept: "One round trip: agree on a cipher, prove identity, derive keys. Then everything is encrypted.",
    duration: 1.5,
    fog: 0.01,
    elapsed: [t3, t4],
    hotspots: [
      {
        id: "tls-ciphers",
        position: [-8, 9, -144],
        title: "ClientHello",
        body: "Lists the cipher suites the browser supports and, new in TLS 1.3, already includes a key share. That is how the handshake fits in a single round trip.",
      },
      {
        id: "tls-cert",
        position: [12, 13, -150],
        title: "Certificate chain",
        body: "The server proves it owns the domain: leaf certificate → intermediate CA → a root your OS already trusts. The browser checks every signature.",
      },
      {
        id: "tls-lock",
        position: [0, 14.5, -150],
        title: "Shared secret",
        body: "Both sides combine their x25519 key shares (ECDHE) into the same secret without ever sending it. Symmetric keys (AES-GCM / ChaCha20) are derived from it.",
      },
    ],
  },
  {
    id: "edge",
    title: "The CDN edge",
    short: "Edge",
    concept: "Edges exist so most requests never cross an ocean. This one is a cache MISS.",
    duration: 1.2,
    fog: 0.007,
    elapsed: [t4, t5],
    hotspots: [
      {
        id: "edge-pop",
        position: [0, 26, -240],
        title: "Edge PoP · Frankfurt",
        body: "Anycast landed you here, peering at DE-CIX, one of the busiest internet exchanges on Earth. Static assets and cached pages are served from here in a few ms.",
      },
      {
        id: "edge-hit",
        position: [19, 3, -206],
        title: "The HIT path",
        body: "If the page were cached at the edge, the response would turn around right here. Total trip: a few dozen ms. The story would end now.",
      },
      {
        id: "edge-miss",
        position: [0, 9, -258],
        title: "The MISS path",
        body: "Nothing cached (or it expired), so the edge forwards the request to the origin, which lives in Ashburn, Virginia. Across the Atlantic.",
      },
    ],
  },
  {
    id: "ocean",
    title: "Under the ocean",
    short: "Ocean",
    concept: "The internet is physical: your request rides a fibre on the seabed. ~80 ms there and back.",
    duration: 2.2,
    fog: 0,
    elapsed: [t5, t6],
    // Outbound crossing is ~20% of the stage's time budget; origin render + return fill the last 8% of scroll.
    elapsedCurve: (t) => {
      const k = b.ocean / (b.ocean + b.origin + b.back);
      return t < 0.92 ? (t / 0.92) * k : k + ((t - 0.92) / 0.08) * (1 - k);
    },
    hotspots: [],
  },
  {
    id: "render",
    title: "Response & render",
    short: "Render",
    concept: "HTML streams back, the DOM and CSSOM grow, and the page assembles: the critical rendering path.",
    duration: 2.0,
    fog: 0.009,
    elapsed: [t6, t7],
    hotspots: [
      {
        id: "render-dom",
        position: [15, 22.5, -12],
        title: "DOM",
        body: "The HTML parser builds the Document Object Model incrementally, as bytes stream in. It does not wait for the whole file.",
      },
      {
        id: "render-cssom",
        position: [-15, 19.5, -12],
        title: "CSSOM",
        body: "CSS is render-blocking: nothing paints until the stylesheet is parsed into the CSSOM, then combined with the DOM into the render tree.",
      },
      {
        id: "render-subresources",
        position: [-9, 4, -40],
        title: "Subresources",
        body: "CSS, JS, fonts and images are discovered while parsing and fetched in parallel over the same HTTP/2 or HTTP/3 connection, with no new handshakes.",
      },
    ],
  },
];

/** Extra stage-local hotspots that don't need a world position are not supported; keep data-driven. */
export const HOTSPOTS = STAGES.flatMap((s, i) => s.hotspots.map((h) => ({ ...h, stage: i })));

/** Scroll units spent flying between two stages. */
export const TRANSITION = 0.55;

const totalUnits = STAGES.reduce((a, s) => a + s.duration, 0) + TRANSITION * (STAGES.length - 1);

export type Range = { start: number; end: number };
export const RANGES: Range[] = (() => {
  let u = 0;
  return STAGES.map((s) => {
    const r = { start: u / totalUnits, end: (u + s.duration) / totalUnits };
    u += s.duration + TRANSITION;
    return r;
  });
})();

/** Scroll height of the page, in viewport heights. */
export const SCROLL_VH = Math.round(totalUnits * 85);

export type Loc = {
  /** Current stage, or the stage being left during a transition. */
  index: number;
  /** Local progress 0..1 within `index`. */
  t: number;
  /** True while flying from `index` to `index + 1`. */
  transitioning: boolean;
  /** Transition progress 0..1. */
  u: number;
};

/** Allocation-free: writes into `out`. */
export function locate(p: number, out: Loc): Loc {
  const n = RANGES.length;
  for (let i = 0; i < n; i++) {
    const r = RANGES[i];
    if (p <= r.end || i === n - 1) {
      if (p < r.start && i > 0) {
        const prev = RANGES[i - 1];
        out.index = i - 1;
        out.t = 1;
        out.transitioning = true;
        out.u = clamp01((p - prev.end) / (r.start - prev.end));
      } else {
        out.index = i;
        out.t = clamp01((p - r.start) / (r.end - r.start));
        out.transitioning = false;
        out.u = 0;
      }
      return out;
    }
  }
  return out;
}

/** Local progress of a specific stage at global progress p (0 before it, 1 after). */
export function stageT(index: number, p: number) {
  const r = RANGES[index];
  return clamp01((p - r.start) / (r.end - r.start));
}

/** The stage that "owns" the screen: nearest stage during a transition. */
export function activeIndex(loc: Loc) {
  return loc.transitioning && loc.u > 0.5 ? loc.index + 1 : loc.index;
}

export function elapsedAt(loc: Loc) {
  const s = STAGES[loc.index];
  const k = s.elapsedCurve ? s.elapsedCurve(loc.t) : loc.t;
  return s.elapsed[0] + (s.elapsed[1] - s.elapsed[0]) * k;
}
