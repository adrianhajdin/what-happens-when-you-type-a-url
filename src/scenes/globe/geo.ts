import * as THREE from "three";
import type { LatLng } from "@/lib/journey";

/** The globe lives far above the network plane; the camera flies up to it. */
export const GLOBE_CENTER = new THREE.Vector3(0, 700, -1500);
export const GLOBE_R = 100;

/**
 * lat/lng → point on a sphere, matching THREE.SphereGeometry's UV layout so an
 * equirectangular texture lines up (u = (lng + 180) / 360).
 */
export function latLngToLocal(lat: number, lng: number, r: number, out = new THREE.Vector3()) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export function latLngToWorld(lat: number, lng: number, r = GLOBE_R, out = new THREE.Vector3()) {
  return latLngToLocal(lat, lng, r, out).add(GLOBE_CENTER);
}

/** Great-circle interpolation between two lat/lngs, returned as unit vectors. */
export function greatCircle(a: LatLng, b: LatLng, steps: number) {
  const va = latLngToLocal(a.lat, a.lng, 1);
  const vb = latLngToLocal(b.lat, b.lng, 1);
  const out: THREE.Vector3[] = [];
  const angle = va.angleTo(vb);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (angle < 1e-6) {
      out.push(va.clone());
      continue;
    }
    const s = Math.sin(angle);
    const v = va
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / s)
      .add(vb.clone().multiplyScalar(Math.sin(t * angle) / s));
    out.push(v);
  }
  return out;
}

/** Densify a lat/lng polyline into world-space points at radius r (great-circle between waypoints). */
export function routePoints(points: LatLng[], r: number, stepsPerLeg = 16) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = greatCircle(points[i], points[i + 1], stepsPerLeg);
    if (i > 0) seg.shift();
    for (const v of seg) out.push(v.multiplyScalar(r).add(GLOBE_CENTER));
  }
  return out;
}
