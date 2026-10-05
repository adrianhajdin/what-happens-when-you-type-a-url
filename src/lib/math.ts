import * as THREE from "three";

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Map x from [a, b] to [0, 1], clamped. */
export const remap = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export type Vec3 = [number, number, number];
export const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

/** Deterministic PRNG so procedural layouts are stable between reloads. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quadratic arc between two points, lifted by `height` at the midpoint. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, height: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y = Math.max(a.y, b.y) + height;
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

/**
 * A curve that runs through several sub-curves, each getting an equal slice of t.
 * Used for multi-hop packet routes (DNS hops etc.).
 */
export class Chain {
  constructor(public curves: THREE.Curve<THREE.Vector3>[]) {}
  getPoint(t: number, out: THREE.Vector3) {
    const n = this.curves.length;
    const x = clamp01(t) * n;
    const i = Math.min(n - 1, Math.floor(x));
    return this.curves[i].getPoint(x - i, out);
  }
  segment(t: number) {
    return Math.min(this.curves.length - 1, Math.floor(clamp01(t) * this.curves.length));
  }
}
