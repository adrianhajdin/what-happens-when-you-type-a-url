/**
 * The physical route of the request. All coordinates and latencies are
 * APPROXIMATE — good enough to tell the story honestly, not survey-grade.
 *
 * Latency model: light in fibre ≈ 200 km/ms (≈ 2/3 c), plus routing slack.
 */

export type LatLng = { lat: number; lng: number };

export type Hop = LatLng & {
  id: string;
  name: string;
  detail: string;
};

/** The domain the visitor "types". One constant so the open item (vercel.com vs own domain) is a one-line change. */
export const TARGET_HOST = "vercel.com";
/** A record the DNS stage returns (vercel.com's anycast address). */
export const TARGET_IP = "76.76.21.21";

export const HOPS = {
  rijeka: { id: "rijeka", name: "Rijeka", detail: "You, on a home connection", lat: 45.327, lng: 14.442 },
  frankfurt: { id: "frankfurt", name: "Frankfurt", detail: "Edge PoP fra1, peering at DE-CIX", lat: 50.11, lng: 8.682 },
  paris: { id: "paris", name: "Paris", detail: "Terrestrial backbone", lat: 48.857, lng: 2.352 },
  sthilaire: {
    id: "sthilaire",
    name: "Saint-Hilaire-de-Riez",
    detail: "Dunant cable landing station, France",
    lat: 46.721,
    lng: -1.946,
  },
  virginiaBeach: {
    id: "virginiaBeach",
    name: "Virginia Beach",
    detail: "Dunant cable landing station, USA",
    lat: 36.853,
    lng: -75.978,
  },
  ashburn: { id: "ashburn", name: "Ashburn", detail: "Origin region iad1, 'Data Center Alley'", lat: 39.044, lng: -77.487 },
} satisfies Record<string, Hop>;

/**
 * Dunant (Google, 2021): Saint-Hilaire-de-Riez ↔ Virginia Beach, ~6,400 km.
 * Waypoints approximate the seabed route, not the exact survey line.
 */
export const DUNANT: LatLng[] = [
  { lat: 46.721, lng: -1.946 },
  { lat: 46.2, lng: -5.5 },
  { lat: 45.4, lng: -12 },
  { lat: 44.2, lng: -22 },
  { lat: 42.6, lng: -33 },
  { lat: 40.9, lng: -45 },
  { lat: 39.3, lng: -56 },
  { lat: 37.9, lng: -66 },
  { lat: 37.1, lng: -72.5 },
  { lat: 36.853, lng: -75.978 },
];

/** Decorative neighbours so the Atlantic looks like the real, crowded seabed. Approximate endpoints. */
export const OTHER_CABLES: { name: string; points: LatLng[] }[] = [
  { name: "MAREA", points: [{ lat: 36.85, lng: -75.98 }, { lat: 39, lng: -50 }, { lat: 42, lng: -20 }, { lat: 43.26, lng: -2.93 }] },
  { name: "Grace Hopper", points: [{ lat: 40.58, lng: -73.66 }, { lat: 44, lng: -50 }, { lat: 49, lng: -20 }, { lat: 50.83, lng: -4.55 }] },
  { name: "AEC-1", points: [{ lat: 40.8, lng: -72.9 }, { lat: 46, lng: -50 }, { lat: 52, lng: -25 }, { lat: 54.23, lng: -9.22 }] },
  { name: "Amitié", points: [{ lat: 42.46, lng: -70.95 }, { lat: 45, lng: -45 }, { lat: 46, lng: -20 }, { lat: 44.87, lng: -1.2 }] },
  { name: "Havfrue", points: [{ lat: 40.2, lng: -74.0 }, { lat: 48, lng: -45 }, { lat: 56, lng: -20 }, { lat: 57.3, lng: 7.9 }] },
  { name: "EllaLink", points: [{ lat: -3.72, lng: -38.54 }, { lat: 10, lng: -30 }, { lat: 28, lng: -18 }, { lat: 37.95, lng: -8.87 }] },
  { name: "BRUSA", points: [{ lat: 36.85, lng: -75.98 }, { lat: 25, lng: -65 }, { lat: 5, lng: -45 }, { lat: -22.9, lng: -43.2 }] },
  { name: "SAm-1", points: [{ lat: 25.77, lng: -80.19 }, { lat: 18, lng: -66 }, { lat: 5, lng: -45 }, { lat: -3.72, lng: -38.54 }] },
  { name: "2Africa (Atl.)", points: [{ lat: 43.3, lng: -2.9 }, { lat: 30, lng: -14 }, { lat: 14.7, lng: -17.4 }, { lat: 6.4, lng: 3.4 }] },
  { name: "TAT-14", points: [{ lat: 40.1, lng: -74.0 }, { lat: 47, lng: -40 }, { lat: 51.5, lng: -10 }, { lat: 53.4, lng: 6 }] },
];

/** One-way latency per leg in ms (approx). */
export const LEGS = [
  { from: "frankfurt", to: "paris", km: 480, ms: 4 },
  { from: "paris", to: "sthilaire", km: 400, ms: 3 },
  { from: "sthilaire", to: "virginiaBeach", km: 6400, ms: 33, label: "Dunant cable" },
  { from: "virginiaBeach", to: "ashburn", km: 300, ms: 3 },
] as const;

/**
 * Elapsed time budget (ms) for the whole page load, used by the HUD counter.
 * Ends at 1,200 ms — the finale number.
 */
export const BUDGET = {
  caches: 2,
  dns: 72, // client→resolver + root + TLD + authoritative, cold resolver cache
  tcp: 18, // one RTT Rijeka ↔ Frankfurt edge
  tls: 18, // TLS 1.3: one RTT
  edge: 10, // request to edge + cache lookup
  ocean: 43, // edge → origin one-way (legs above)
  origin: 120, // origin renders the page
  back: 47, // response back over the Atlantic and to you
  render: 870, // download, parse, CSSOM, JS, subresources, paint
};

export const EUROPE_BOUNDS = { minLat: 35, maxLat: 71, minLng: -11, maxLng: 32 };

export function inEurope(p: LatLng) {
  const b = EUROPE_BOUNDS;
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}
