/**
 * Where CDN points of presence and cloud regions are. CDNs name PoPs by the
 * nearest airport's IATA code (Cloudflare's cf-ray suffix, Fastly's
 * x-served-by, CloudFront's x-amz-cf-pop); Vercel uses region ids. City
 * coordinates are approximate (metro centre).
 */
export const AIRPORTS: Record<string, [string, number, number]> = {
  // Europe
  AMS: ["Amsterdam", 52.37, 4.9], ARN: ["Stockholm", 59.33, 18.07], ATH: ["Athens", 37.98, 23.73], BCN: ["Barcelona", 41.39, 2.17],
  BEG: ["Belgrade", 44.8, 20.46], BRU: ["Brussels", 50.85, 4.35], BTS: ["Bratislava", 48.15, 17.1], BUD: ["Budapest", 47.5, 19.04],
  CDG: ["Paris", 48.86, 2.35], CPH: ["Copenhagen", 55.68, 12.57], DUB: ["Dublin", 53.35, -6.26], DUS: ["Düsseldorf", 51.23, 6.78],
  EDI: ["Edinburgh", 55.95, -3.19], FCO: ["Rome", 41.9, 12.5], FRA: ["Frankfurt", 50.11, 8.68], GVA: ["Geneva", 46.2, 6.14],
  HAM: ["Hamburg", 53.55, 9.99], HEL: ["Helsinki", 60.17, 24.94], IST: ["Istanbul", 41.01, 28.98], KBP: ["Kyiv", 50.45, 30.52],
  LHR: ["London", 51.51, -0.13], LIS: ["Lisbon", 38.72, -9.14], LUX: ["Luxembourg", 49.61, 6.13], MAD: ["Madrid", 40.42, -3.7],
  MAN: ["Manchester", 53.48, -2.24], MRS: ["Marseille", 43.3, 5.37], MUC: ["Munich", 48.14, 11.58], MXP: ["Milan", 45.46, 9.19],
  OSL: ["Oslo", 59.91, 10.75], OTP: ["Bucharest", 44.43, 26.1], PRG: ["Prague", 50.08, 14.42], SOF: ["Sofia", 42.7, 23.32],
  TXL: ["Berlin", 52.52, 13.4], BER: ["Berlin", 52.52, 13.4], VIE: ["Vienna", 48.21, 16.37], WAW: ["Warsaw", 52.23, 21.01],
  ZAG: ["Zagreb", 45.81, 15.98], ZRH: ["Zurich", 47.37, 8.54], RIX: ["Riga", 56.95, 24.11], VNO: ["Vilnius", 54.69, 25.28],
  TLL: ["Tallinn", 59.44, 24.75], LJU: ["Ljubljana", 46.06, 14.51], KRK: ["Kraków", 50.06, 19.94], PMO: ["Palermo", 38.12, 13.36],
  // North America
  ATL: ["Atlanta", 33.75, -84.39], BOS: ["Boston", 42.36, -71.06], CLE: ["Cleveland", 41.5, -81.69], CLT: ["Charlotte", 35.23, -80.84],
  CMH: ["Columbus", 39.96, -82.99], DEN: ["Denver", 39.74, -104.99], DFW: ["Dallas", 32.78, -96.8], DTW: ["Detroit", 42.33, -83.05],
  EWR: ["Newark", 40.74, -74.17], IAD: ["Washington, D.C. (Ashburn)", 39.04, -77.49], IAH: ["Houston", 29.76, -95.37],
  JFK: ["New York", 40.71, -74.0], LAS: ["Las Vegas", 36.17, -115.14], LAX: ["Los Angeles", 34.05, -118.24], MCI: ["Kansas City", 39.1, -94.58],
  MIA: ["Miami", 25.76, -80.19], MSP: ["Minneapolis", 44.98, -93.27], ORD: ["Chicago", 41.88, -87.63], PDX: ["Portland", 45.52, -122.68],
  PHL: ["Philadelphia", 39.95, -75.16], PHX: ["Phoenix", 33.45, -112.07], PIT: ["Pittsburgh", 40.44, -79.99], SAN: ["San Diego", 32.72, -117.16],
  SEA: ["Seattle", 47.6, -122.33], SFO: ["San Francisco", 37.77, -122.42], SJC: ["San Jose", 37.34, -121.89], SLC: ["Salt Lake City", 40.76, -111.89],
  STL: ["St. Louis", 38.63, -90.2], TPA: ["Tampa", 27.95, -82.46], BNA: ["Nashville", 36.16, -86.78], RDU: ["Raleigh", 35.78, -78.64],
  YUL: ["Montréal", 45.5, -73.57], YVR: ["Vancouver", 49.28, -123.12], YYZ: ["Toronto", 43.65, -79.38], YYC: ["Calgary", 51.05, -114.07],
  YWG: ["Winnipeg", 49.9, -97.14], MEX: ["Mexico City", 19.43, -99.13], QRO: ["Querétaro", 20.59, -100.39], GDL: ["Guadalajara", 20.67, -103.35],
  // South America
  BOG: ["Bogotá", 4.71, -74.07], EZE: ["Buenos Aires", -34.6, -58.38], GIG: ["Rio de Janeiro", -22.9, -43.17], GRU: ["São Paulo", -23.55, -46.63],
  LIM: ["Lima", -12.05, -77.04], SCL: ["Santiago", -33.45, -70.67], UIO: ["Quito", -0.18, -78.47], FOR: ["Fortaleza", -3.72, -38.54],
  // Asia / Oceania / Middle East / Africa
  BKK: ["Bangkok", 13.75, 100.5], BLR: ["Bangalore", 12.97, 77.59], BOM: ["Mumbai", 19.08, 72.88], CGK: ["Jakarta", -6.2, 106.85],
  DEL: ["Delhi", 28.61, 77.21], HKG: ["Hong Kong", 22.32, 114.17], HND: ["Tokyo", 35.69, 139.69], NRT: ["Tokyo", 35.69, 139.69],
  ICN: ["Seoul", 37.57, 126.98], KIX: ["Osaka", 34.69, 135.5], KUL: ["Kuala Lumpur", 3.14, 101.69], MAA: ["Chennai", 13.08, 80.27],
  MNL: ["Manila", 14.6, 120.98], SIN: ["Singapore", 1.35, 103.82], TPE: ["Taipei", 25.03, 121.57], HYD: ["Hyderabad", 17.39, 78.49],
  CCU: ["Kolkata", 22.57, 88.36], SGN: ["Ho Chi Minh City", 10.82, 106.63], HAN: ["Hanoi", 21.03, 105.85],
  SYD: ["Sydney", -33.87, 151.21], MEL: ["Melbourne", -37.81, 144.96], BNE: ["Brisbane", -27.47, 153.03], PER: ["Perth", -31.95, 115.86],
  AKL: ["Auckland", -36.85, 174.76], DXB: ["Dubai", 25.2, 55.27], DOH: ["Doha", 25.29, 51.53], TLV: ["Tel Aviv", 32.08, 34.78],
  RUH: ["Riyadh", 24.71, 46.68], BAH: ["Bahrain", 26.23, 50.59], CAI: ["Cairo", 30.04, 31.24], JNB: ["Johannesburg", -26.2, 28.05],
  CPT: ["Cape Town", -33.92, 18.42], LOS: ["Lagos", 6.52, 3.38], NBO: ["Nairobi", -1.29, 36.82], CMN: ["Casablanca", 33.57, -7.59],
};

/** Vercel region ids → nearest airport code. */
export const VERCEL_REGIONS: Record<string, string> = {
  arn1: "ARN", bom1: "BOM", cdg1: "CDG", cle1: "CLE", cpt1: "CPT", dub1: "DUB", dxb1: "DXB", fra1: "FRA", gru1: "GRU",
  hkg1: "HKG", hnd1: "HND", iad1: "IAD", icn1: "ICN", kix1: "KIX", lhr1: "LHR", pdx1: "PDX", sfo1: "SFO", sin1: "SIN",
  syd1: "SYD", yul1: "YUL",
};

export type Place = { code?: string; city: string; lat: number; lng: number };

export function airport(code: string | undefined | null): Place | null {
  if (!code) return null;
  const c = code.toUpperCase();
  const a = AIRPORTS[c];
  return a ? { code: c, city: a[0], lat: a[1], lng: a[2] } : null;
}

export function vercelRegion(id: string | undefined | null): Place | null {
  if (!id) return null;
  const a = airport(VERCEL_REGIONS[id.toLowerCase()]);
  return a ? { ...a, code: id.toLowerCase() } : null;
}

/** Great-circle distance in km. */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * One-way latency estimate: light in fibre ≈ 200 km/ms, real routes are
 * ~1.4× the great-circle distance, plus ~1 ms of switching.
 */
export function oneWayMs(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return (km(a, b) * 1.4) / 200 + 1;
}
