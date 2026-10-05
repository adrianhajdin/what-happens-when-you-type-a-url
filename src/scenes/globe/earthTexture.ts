import * as THREE from "three";
import { CITIES, LAND, WATER } from "./world-data";
import { rng } from "@/lib/math";

/**
 * Procedural night-side Earth, generated on a canvas once per session:
 *  - `surface`: land / ocean albedo (R = land mask, used by the shader)
 *  - `lights`:  city lights (gold) + coastline glow (blue), emissive
 */
let cached: { surface: THREE.CanvasTexture; lights: THREE.CanvasTexture; w: number } | null = null;

export function earthTextures(width: number) {
  if (cached && cached.w === width) return cached;
  cached?.surface.dispose();
  cached?.lights.dispose();
  const W = width;
  const H = width / 2;
  const X = (lng: number) => ((lng + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;

  const trace = (g: CanvasRenderingContext2D, ring: [number, number][], scale = 1) => {
    g.beginPath();
    ring.forEach(([lng, lat], i) => (i ? g.lineTo(X(lng) * scale, Y(lat) * scale) : g.moveTo(X(lng) * scale, Y(lat) * scale)));
    g.closePath();
  };

  // --- surface: R channel = land mask. It's blurred anyway, so half resolution
  // (a quarter of the pixels / VRAM of the lights texture).
  const SW = W / 2;
  const SH = H / 2;
  const sc = document.createElement("canvas");
  sc.width = SW;
  sc.height = SH;
  const s = sc.getContext("2d")!;
  s.fillStyle = "#000000";
  s.fillRect(0, 0, SW, SH);
  s.fillStyle = "#ff0000";
  LAND.forEach((r) => {
    trace(s, r, 0.5);
    s.fill();
  });
  s.fillStyle = "#000000";
  WATER.forEach((r) => {
    trace(s, r, 0.5);
    s.fill();
  });
  // soften the mask a touch so the shader gets a shelf gradient at coasts
  s.filter = "blur(1px)";
  s.drawImage(sc, 0, 0);
  s.filter = "none";

  // --- lights
  const lc = document.createElement("canvas");
  lc.width = W;
  lc.height = H;
  const l = lc.getContext("2d")!;
  l.fillStyle = "#000";
  l.fillRect(0, 0, W, H);
  // coastline glow
  l.strokeStyle = "rgba(70,150,255,0.55)";
  l.lineWidth = Math.max(1, W / 1400);
  l.lineJoin = "round";
  [...LAND, ...WATER].forEach((r) => {
    trace(l, r);
    l.stroke();
  });

  const k = W / 2048;
  const r = rng(42);
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  l.globalCompositeOperation = "lighter";
  for (const [lng, lat, w] of CITIES) {
    const cx = X(lng);
    const cy = Y(lat);
    // warm core
    const core = l.createRadialGradient(cx, cy, 0, cx, cy, 5 * k * Math.sqrt(w));
    core.addColorStop(0, "rgba(255,200,130,0.45)");
    core.addColorStop(1, "rgba(255,150,60,0)");
    l.fillStyle = core;
    l.fillRect(cx - 8 * k * w, cy - 8 * k * w, 16 * k * w, 16 * k * w);
    // scatter
    const n = Math.round(w * 110 * k);
    const sigma = 2.2 * k * Math.sqrt(w) * 2;
    for (let i = 0; i < n; i++) {
      const x = cx + gauss() * sigma * 1.3;
      const y = cy + gauss() * sigma;
      const a = 0.1 + r() * 0.35;
      l.fillStyle = `rgba(255,${170 + Math.floor(r() * 60)},${80 + Math.floor(r() * 60)},${a})`;
      const d = (0.6 + r() * 0.9) * k;
      l.fillRect(x, y, d, d);
    }
  }
  // faint rural light everywhere there is land
  const mask = s.getImageData(0, 0, SW, SH).data;
  const rural = Math.round(14000 * k);
  for (let i = 0; i < rural; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(H * 0.12 + r() * H * 0.62);
    if (mask[((y >> 1) * SW + (x >> 1)) * 4] < 200) continue;
    l.fillStyle = `rgba(255,190,110,${0.08 + r() * 0.25})`;
    l.fillRect(x, y, k, k);
  }
  l.globalCompositeOperation = "source-over";

  const surface = new THREE.CanvasTexture(sc);
  const lights = new THREE.CanvasTexture(lc);
  lights.colorSpace = THREE.SRGBColorSpace;
  for (const t of [surface, lights]) {
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  cached = { surface, lights, w: W };
  return cached;
}
