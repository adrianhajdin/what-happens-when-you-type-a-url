"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLOBE_CENTER, GLOBE_R, latLngToWorld, routePoints } from "./globe/geo";
import { earthTextures } from "./globe/earthTexture";
import { DynamicLabel, Label, type DynamicLabelHandle } from "@/core/Label";
import { COLORS, HEX, TIME, flowMaterial, glowTexture, hdr } from "@/core/materials";
import type { CameraKey, CameraPose, StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { BUDGET, DUNANT, HOPS, LEGS, OTHER_CABLES, type LatLng } from "@/lib/journey";
import { remap, smooth } from "@/lib/math";
import { useJourney, useStore, store } from "@/lib/store";
import { budgetFor, goesToOrigin, isHit, nearEnd, type Journey } from "@/lib/live";
import { km, oneWayMs, type Place } from "@/lib/places";

const INDEX = 5;
const R = GLOBE_R;

/* -------------------------------- route ---------------------------------- */

type P = LatLng & { alt: number };
const LAND_ALT = 1.012;
const SEA_ALT = 1.004;

function densify(points: P[], steps: number) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = routePoints([a, b], 1, steps);
    seg.forEach((v, j) => {
      if (i > 0 && j === 0) return;
      const k = j / (seg.length - 1);
      const alt = a.alt + (b.alt - a.alt) * k;
      out.push(v.sub(GLOBE_CENTER).multiplyScalar(R * alt).add(GLOBE_CENTER));
    });
  }
  return out;
}

type Marker = { ll: LatLng; text: string; sub: string; color: string; lift: number; you?: boolean };
type Shot = { at: THREE.Vector3; height: number; back: number };

/** Everything the globe stage draws and frames for one journey. */
type RouteModel = {
  example: boolean;
  curve: THREE.CatmullRomCurve3;
  /** Fraction of arc length at which each leg ends. */
  legEnds: number[];
  legs: { km: number; ms: number; label?: string }[];
  msTotal: number;
  start: Shot;
  end: Shot;
  /** 0 = stay on the overview (short routes), 1 = ride along with the packet. */
  follow: number;
  markers: Marker[];
  /** What the readout says once the packet has arrived. */
  arrival: string;
};

function legEndsOf(curve: THREE.CatmullRomCurve3, stops: LatLng[]) {
  const total = curve.getLength();
  const lens = curve.getLengths(2000);
  const v = new THREE.Vector3();
  return stops.map((ll) => {
    const target = latLngToWorld(ll.lat, ll.lng, R);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 2000; i++) {
      curve.getPoint(i / 2000, v);
      const d = v.distanceToSquared(target);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return lens[best] / total;
  });
}

function exampleRoute(): RouteModel {
  const ll: P[] = [
    { ...HOPS.frankfurt, alt: LAND_ALT },
    { ...HOPS.paris, alt: LAND_ALT },
    { ...HOPS.sthilaire, alt: SEA_ALT },
    ...DUNANT.slice(1).map((p) => ({ ...p, alt: SEA_ALT })),
    { ...HOPS.ashburn, alt: LAND_ALT },
  ];
  const curve = new THREE.CatmullRomCurve3(densify(ll, 10), false, "centripetal");
  const ends = legEndsOf(curve, [HOPS.paris, HOPS.sthilaire, HOPS.virginiaBeach]);
  return {
    example: true,
    curve,
    legEnds: [...ends, 1],
    legs: LEGS.map((l) => ({ km: l.km, ms: l.ms, label: "label" in l ? l.label : undefined })),
    msTotal: LEGS.reduce((a, l) => a + l.ms, 0),
    start: { at: latLngToWorld(41, -28, R), height: 210, back: 150 },
    end: { at: latLngToWorld(38, -45, R), height: 190, back: 130 },
    follow: 1,
    markers: [
      { ll: HOPS.frankfurt, text: "Frankfurt · edge", sub: "DE-CIX", color: HEX.cyan, lift: 1.13 },
      { ll: HOPS.sthilaire, text: "Saint-Hilaire-de-Riez", sub: "Dunant landing · FR", color: "#eaffff", lift: 1.06 },
      { ll: HOPS.virginiaBeach, text: "Virginia Beach", sub: "Dunant landing · US", color: "#eaffff", lift: 1.05 },
      { ll: HOPS.ashburn, text: "Ashburn · origin iad1", sub: "Data Center Alley", color: HEX.magenta, lift: 1.14 },
    ],
    arrival: `origin renders  +${BUDGET.origin} ms  ·  then back  ~${BUDGET.back} ms`,
  };
}

/** A live trace: visitor → edge, or edge → origin when the request goes on. Great-circle legs. */
function liveRoute(j: Journey): RouteModel {
  const near = nearEnd(j);
  const toOrigin = goesToOrigin(j) && j.pop && j.origin;
  const from: Place = toOrigin ? j.pop! : j.visitor;
  let to: Place = toOrigin ? j.origin! : (near ?? j.visitor);
  if (km(from, to) < 30) to = { ...to, lat: to.lat + 0.25, lng: to.lng + 0.35 }; // same metro: keep a visible stub
  const pts = densify([{ ...from, alt: LAND_ALT }, { ...to, alt: LAND_ALT }], 48);
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const dist = km(from, to);
  const ms = Math.round(oneWayMs(from, to));
  // frame the whole route: centre of the arc, pulled back with its angular size
  const mid = curve.getPointAt(0.5, new THREE.Vector3()).sub(GLOBE_CENTER).setLength(R).add(GLOBE_CENTER);
  const span = dist / 6371; // radians
  const height = Math.min(260, Math.max(85, R * (0.55 + span * 1.5)));
  const overview: Shot = { at: mid, height, back: height * 0.7 };
  const b = budgetFor(j);
  const markers: Marker[] = [{ ll: j.visitor, text: `you · ${j.visitor.city}`, sub: "approximate location", color: HEX.magenta, lift: 1.06, you: true }];
  if (j.pop) markers.push({ ll: j.pop, text: `${j.provider} edge · ${j.pop.city}`, sub: j.pop.code ?? "", color: HEX.cyan, lift: 1.12 });
  else if (!j.provider && j.origin) markers.push({ ll: j.origin, text: `server · ${j.origin.city}`, sub: j.ip, color: HEX.cyan, lift: 1.12 });
  if (j.origin && j.provider && (!j.pop || km(j.pop, j.origin) > 30)) {
    markers.push({ ll: j.origin, text: `origin · ${j.origin.city}`, sub: j.origin.code ?? "", color: HEX.magenta, lift: 1.15 });
  }
  return {
    example: false,
    curve,
    legEnds: [1],
    legs: [{ km: Math.round(dist), ms }],
    msTotal: ms,
    start: overview,
    end: overview,
    follow: dist > 1500 ? 1 : 0,
    markers,
    arrival: toOrigin
      ? `origin renders  +${b.origin} ms  ·  then back  ~${b.back} ms`
      : isHit(j)
        ? `edge answers  ·  back to you  ~${b.back} ms`
        : `arrived  ·  ${ms} ms one-way`,
  };
}

const routes = new WeakMap<Journey, RouteModel>();
/** Route for the current journey (cached; journeys are immutable). */
function routeFor(j: Journey) {
  let r = routes.get(j);
  if (!r) {
    r = j.kind === "example" ? exampleRoute() : liveRoute(j);
    routes.set(j, r);
  }
  return r;
}

const TRAVEL = { from: 0.06, to: 0.9 };

/* -------------------------------- camera --------------------------------- */

const UP = new THREE.Vector3(0, 1, 0);
const cam = {
  p: new THREE.Vector3(),
  n: new THREE.Vector3(),
  e: new THREE.Vector3(),
  no: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
};

/** Oblique "orbiting satellite" framing around a surface point. */
function frame(surface: THREE.Vector3, height: number, back: number, ahead: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) {
  cam.n.subVectors(surface, GLOBE_CENTER).normalize();
  cam.e.crossVectors(UP, cam.n).normalize();
  cam.no.crossVectors(cam.n, cam.e).normalize();
  outPos.copy(GLOBE_CENTER).addScaledVector(cam.n, R + height).addScaledVector(cam.no, -back);
  outTarget.copy(GLOBE_CENTER).addScaledVector(cam.n, R).addScaledVector(cam.no, ahead);
}

function camera(t: number, out: CameraPose) {
  const r = routeFor(store().journey);
  const u = remap(t, TRAVEL.from, TRAVEL.to);
  // the base shot: overview, or riding along with the packet on long routes
  frame(r.start.at, r.start.height, r.start.back, 0, out.position, out.target);
  if (r.follow > 0) {
    r.curve.getPointAt(Math.min(1, u), cam.p);
    frame(cam.p, 105, 70, 6, cam.a, cam.b);
    const w = r.follow * smooth(remap(t, 0.02, 0.22)) * (1 - smooth(remap(t, 0.86, 1)));
    out.position.lerp(cam.a, w);
    out.target.lerp(cam.b, w);
  }
  const endW = smooth(remap(t, 0.86, 1)) * r.follow;
  if (endW > 0) {
    frame(r.end.at, r.end.height, r.end.back, 0, cam.a, cam.b);
    out.position.lerp(cam.a, endW);
    out.target.lerp(cam.b, endW);
  }
  out.fov = 42;
}

const poseKey = (t: number): CameraKey => {
  const p: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 42 };
  camera(t, p);
  return { position: p.position.toArray(), target: p.target.toArray(), fov: p.fov };
};

/* -------------------------------- globe ---------------------------------- */

const globeVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vLocal = normalize(position);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const globeFrag = /* glsl */ `
  uniform sampler2D uSurface;
  uniform sampler2D uLights;
  uniform float uTime;
  uniform float uClouds;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec3 vWorld;
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    float land = texture2D(uSurface, vUv).r;
    float relief = fbm(vLocal * 9.0);
    vec3 ocean = vec3(0.004, 0.012, 0.04) + vec3(0.01, 0.035, 0.09) * relief;
    // continental shelf: bright shallow water hugging coasts
    float shelf = smoothstep(0.02, 0.45, land) * (1.0 - smoothstep(0.45, 0.8, land));
    ocean += vec3(0.02, 0.08, 0.2) * shelf;
    vec3 ground = vec3(0.018, 0.03, 0.07) + vec3(0.03, 0.04, 0.07) * relief;
    vec3 col = mix(ocean, ground, smoothstep(0.45, 0.6, land));
    vec3 lights = texture2D(uLights, vUv).rgb;
    float clouds = smoothstep(0.58, 0.85, fbm(vLocal * 3.2 + vec3(uTime * 0.004, 0.0, 0.0))) * uClouds;
    col += lights * 1.5 * (1.0 - clouds * 0.8);
    col = mix(col, vec3(0.11, 0.12, 0.17), clouds * 0.55);
    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(normalize(vN), V)), 3.0);
    col += vec3(0.12, 0.38, 1.0) * rim * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const atmoFrag = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    // back faces of a slightly larger shell: glow peaks at the planet's limb, fades to the shell edge
    vec3 V = normalize(cameraPosition - vWorld);
    float d = clamp(-dot(normalize(vN), V) / 0.42, 0.0, 1.0);
    float i = pow(d, 2.2) * 0.9;
    gl_FragColor = vec4(vec3(0.18, 0.5, 1.0) * i, i);
  }
`;

function Globe() {
  const tier = useStore((s) => s.tier);
  const tex = useMemo(() => earthTextures(tier === "high" ? 4096 : 2048), [tier]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVert,
        fragmentShader: globeFrag,
        uniforms: { uSurface: { value: tex.surface }, uLights: { value: tex.lights }, uTime: TIME, uClouds: { value: tier === "high" ? 1 : 0.6 } },
      }),
    [tex, tier],
  );
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVert,
        fragmentShader: atmoFrag,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => atmo.dispose(), [atmo]);
  // LOD: full tessellation only up close (stage 5); the fly-in/out from the
  // network plane sees the coarse sphere.
  const lod = useMemo(() => {
    const l = new THREE.LOD();
    const seg = tier === "high" ? [160, 120] : [96, 64];
    l.addLevel(new THREE.Mesh(new THREE.SphereGeometry(R, seg[0], seg[1]), mat), 0);
    l.addLevel(new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat), R * 6);
    return l;
  }, [mat, tier]);
  useEffect(
    () => () => {
      for (const lv of lod.levels) (lv.object as THREE.Mesh).geometry.dispose();
    },
    [lod],
  );
  return (
    <group position={GLOBE_CENTER}>
      <primitive object={lod} />
      <mesh material={atmo} scale={1.1}>
        <sphereGeometry args={[R, 64, 48]} />
      </mesh>
    </group>
  );
}

/* -------------------------------- cables --------------------------------- */

/** The crowded Atlantic seabed: decorative neighbours, always shown. */
function SeabedCables() {
  const { geo, mat } = useMemo(() => {
    const tubes = OTHER_CABLES.map((c) => {
      const curve = new THREE.CatmullRomCurve3(routePoints(c.points, R * 1.002, 20));
      return new THREE.TubeGeometry(curve, 160, 0.16, 5, false);
    });
    const geo = mergeGeometries(tubes)!;
    tubes.forEach((g) => g.dispose());
    const mat = flowMaterial(hdr(new THREE.Color("#8b5cf6"), 1.4), { speed: 0.15, dash: 60, base: 0.7, opacity: 0.85 });
    mat.fog = false;
    return { geo, mat };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} />;
}

/** The scripted run: Dunant highlighted, its repeaters, and the European land legs. */
function DunantRoute({ dunantRef }: { dunantRef: React.RefObject<THREE.Mesh | null> }) {
  const { dunant, dunantMat, land, landMat, repeaters } = useMemo(() => {
    const dCurve = new THREE.CatmullRomCurve3(routePoints(DUNANT, R * 1.003, 14));
    const dunant = new THREE.TubeGeometry(dCurve, 300, 0.24, 6, false);
    const dunantMat = flowMaterial(hdr(COLORS.cyan, 1.4), { speed: 0.5, dash: 90, base: 0.9 });
    dunantMat.fog = false;
    // terrestrial legs Frankfurt → Paris → Saint-Hilaire, and the earlier Rijeka → Frankfurt hop
    const landCurve = new THREE.CatmullRomCurve3(routePoints([HOPS.rijeka, HOPS.frankfurt, HOPS.paris, HOPS.sthilaire], R * 1.004, 16));
    const land = new THREE.TubeGeometry(landCurve, 120, 0.16, 5, false);
    const landMat = flowMaterial(hdr(COLORS.magenta, 1.4), { speed: 0.4, dash: 40, base: 0.8 });
    landMat.fog = false;
    // repeaters every ~1/36 of the cable (real spacing ≈ 60–100 km)
    const n = 36;
    const rep = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: hdr(COLORS.cyan, 3), toneMapped: false }), n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      dCurve.getPointAt((i + 0.5) / n, o.position);
      o.updateMatrix();
      rep.setMatrixAt(i, o.matrix);
    }
    return { dunant, dunantMat, land, landMat, repeaters: rep };
  }, []);
  useEffect(
    () => () => {
      [dunant, land].forEach((g) => g.dispose());
      [dunantMat, landMat].forEach((m) => m.dispose());
      repeaters.geometry.dispose();
      (repeaters.material as THREE.Material).dispose();
      repeaters.dispose();
    },
    [dunant, land, dunantMat, landMat, repeaters],
  );
  return (
    <group>
      <mesh ref={dunantRef} geometry={dunant} material={dunantMat} />
      <mesh geometry={land} material={landMat} />
      <primitive object={repeaters} />
    </group>
  );
}

/** A live trace's path as a glowing tube. */
function LiveRoute({ route }: { route: RouteModel }) {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.TubeGeometry(route.curve, 160, 0.24, 6, false);
    const mat = flowMaterial(hdr(COLORS.cyan, 1.4), { speed: 0.5, dash: 40, base: 0.9 });
    mat.fog = false;
    return { geo, mat };
  }, [route]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} />;
}

/* --------------------------------- scene --------------------------------- */

function Scene() {
  const origin = useStore((s) => s.origin);
  const journey = useJourney();
  const route = routeFor(journey);
  const readout = useRef<DynamicLabelHandle>(null);
  const dunant = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const nrm = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(-2);
  useEffect(() => {
    last.current = -2; // new journey: redraw the readout
  }, [journey]);

  useFrame(() => {
    const r = routeFor(store().journey);
    const t = stageT(INDEX, store().progress);
    const u = remap(t, TRAVEL.from, TRAVEL.to);
    const s = readout.current?.sprite;
    if (s) {
      s.visible = t > TRAVEL.from - 0.01 && t < 0.97;
      r.curve.getPointAt(Math.min(1, u), tmp);
      nrm.subVectors(tmp, GLOBE_CENTER).normalize();
      s.position.copy(tmp).addScaledVector(nrm, 7);
      let leg = 0;
      while (leg < r.legEnds.length - 1 && u > r.legEnds[leg]) leg++;
      const ms = Math.round(u * r.msTotal);
      // only rebuild the string when the number on screen changes
      const key = t >= TRAVEL.to ? -1 : ms * 10 + leg;
      if (key !== last.current) {
        last.current = key;
        const L = r.legs[leg];
        if (key === -1) readout.current!.setText(r.arrival);
        else readout.current!.setText(`${ms} ms one-way  ·  ${L.label ? `${L.label} · ` : ""}${L.km.toLocaleString("en")} km`);
      }
    }
    if (dunant.current && r.example) {
      const m = dunant.current.material as THREE.ShaderMaterial;
      m.uniforms.uBase.value = 0.6 + 1.2 * remap(u, r.legEnds[1], r.legEnds[1] + 0.05) * (1 - remap(u, r.legEnds[2], r.legEnds[2] + 0.1) * 0.5);
    }
  });

  // the example shows the geolocated visitor separately; live markers include the visitor
  const markers = route.example ? [...route.markers, { ll: origin, text: `you · ${origin.city}`, sub: "", color: HEX.magenta, lift: 1.06, you: true }] : route.markers;
  const glow = glowTexture();
  return (
    <group>
      <Globe />
      <SeabedCables />
      {route.example ? <DunantRoute dunantRef={dunant} /> : <LiveRoute route={route} />}
      {markers.map((c) => {
        const p = latLngToWorld(c.ll.lat, c.ll.lng, R * 1.006);
        const lp = latLngToWorld(c.ll.lat, c.ll.lng, R * c.lift);
        return (
          <group key={c.text}>
            <sprite position={p} scale={[3.2, 3.2, 1]}>
              <spriteMaterial map={glow} color={c.you ? hdr(COLORS.magenta, 3) : new THREE.Color(3, 3, 3.4)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
            </sprite>
            <Label text={c.text} sub={c.sub ? [c.sub] : undefined} position={lp} size={c.you ? 1.6 : 1.9} color={c.color} bg={c.you ? undefined : "rgba(4,6,16,0.75)"} border={c.you ? undefined : "rgba(120,180,255,0.35)"} weight={700} />
          </group>
        );
      })}
      <DynamicLabel ref={readout} size={2.2} color="#eaffff" bg="rgba(4,8,20,0.85)" border={HEX.cyan} weight={700} />
    </group>
  );
}

export const Stage5Ocean: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  cameraIn: poseKey(0),
  cameraOut: poseKey(1),
  camera,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    const r = routeFor(store().journey);
    out.visible = true;
    out.scale = 1.8;
    const u = remap(t, TRAVEL.from, TRAVEL.to);
    r.curve.getPointAt(Math.min(1, u), out.position);
    if (t > 0.97) out.scale = 1.8 * (1 - remap(t, 0.97, 1) * 0.6);
  },
};
