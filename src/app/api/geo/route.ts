import { NextResponse, type NextRequest } from "next/server";

/**
 * Approximate visitor location from Vercel's edge geo-IP headers.
 * No third-party lookup; locally the headers are absent and the client
 * falls back to Rijeka.
 */
export function GET(req: NextRequest) {
  const h = req.headers;
  const city = h.get("x-vercel-ip-city");
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({});
  return NextResponse.json({ city: decodeURIComponent(city), lat, lng }, { headers: { "cache-control": "private, no-store" } });
}
