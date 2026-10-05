"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import * as THREE from "three";
import { BrowserBar, BAR_POS, BAR_W, type BrowserHandle } from "./parts/BrowserWindow";
import { Packet, type PacketHandle } from "@/core/Packet";
import { FlowLine, setReveal } from "@/core/FlowLine";
import { Label } from "@/core/Label";
import { COLORS, HEX, glassMaterial, hdr } from "@/core/materials";
import { UNIT_BOX } from "@/core/Tower";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { TARGET_HOST } from "@/lib/journey";
import { easeOut, remap, rng, type Vec3 } from "@/lib/math";
import { store } from "@/lib/store";

const INDEX = 6;
const TZ = -12;

/* -------------------------------- ribbons -------------------------------- */

const SINK = new THREE.Vector3(BAR_POS[0], BAR_POS[1] - 0.2, -0.6);
const RIBBONS = [-34, -16, 0, 16, 34].map(
  (x, i) =>
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 1.4, 3 + i * 1.6, -170),
      new THREE.Vector3(x, 6 + (i % 2) * 5, -90),
      new THREE.Vector3(x * 0.35, 8 + (i % 3), -30),
      SINK.clone().add(new THREE.Vector3((i - 2) * 0.9, (i % 2) * 0.4, 0)),
    ]),
);
const TOKENS = ["<!DOCTYPE html>", '<html lang="en">', "<head>", '<meta charset="utf-8">', "<title>", "<body>", "<main>", '<section class="hero">', "<h1>", '<img src="hero.avif">'];

/* ----------------------------- subresources ------------------------------ */

const SUBS = [
  { name: "app.css", ribbon: 1, from: 0.26, to: 0.38, color: COLORS.magenta },
  { name: "main.js", ribbon: 3, from: 0.29, to: 0.43, color: COLORS.cyan },
  { name: "inter.woff2", ribbon: 0, from: 0.31, to: 0.42, color: COLORS.cyan },
  { name: "hero.avif", ribbon: 4, from: 0.33, to: 0.5, color: COLORS.cyan },
];

/* --------------------------------- trees --------------------------------- */

type Node = { id: string; label: string; pos: [number, number]; parent?: string };
const DOM: Node[] = [
  { id: "html", label: "html", pos: [15, 21] },
  { id: "head", label: "head", pos: [9, 17.5], parent: "html" },
  { id: "meta", label: "meta", pos: [6.5, 14], parent: "head" },
  { id: "title", label: "title", pos: [11, 14], parent: "head" },
  { id: "body", label: "body", pos: [21, 17.5], parent: "html" },
  { id: "header", label: "header", pos: [15.5, 14], parent: "body" },
  { id: "nav", label: "nav", pos: [15.5, 10.5], parent: "header" },
  { id: "main", label: "main", pos: [21, 14], parent: "body" },
  { id: "section", label: "section", pos: [21, 10.5], parent: "main" },
  { id: "h1", label: "h1", pos: [17.6, 7], parent: "section" },
  { id: "p", label: "p", pos: [21, 7], parent: "section" },
  { id: "img", label: "img", pos: [24.4, 7], parent: "section" },
  { id: "footer", label: "footer", pos: [26.5, 14], parent: "body" },
];
const CSSOM: Node[] = [
  { id: "c-root", label: "CSSOM", pos: [-15, 18] },
  { id: "c-body", label: "body { }", pos: [-20, 14.5], parent: "c-root" },
  { id: "c-hero", label: ".hero { }", pos: [-15, 14.5], parent: "c-root" },
  { id: "c-h1", label: "h1 { }", pos: [-10, 14.5], parent: "c-root" },
  { id: "c-img", label: "img { }", pos: [-15, 11], parent: "c-hero" },
];
const JOINS: [string, string][] = [
  ["c-body", "body"],
  ["c-hero", "section"],
  ["c-h1", "h1"],
];

const DOM_FROM = 0.14;
const DOM_STEP = 0.028;
const CSS_FROM = 0.4;
const CSS_STEP = 0.03;
const JOIN = { from: 0.58, to: 0.7 };
const PAGE = { from: 0.7, to: 0.87 };
const FINALE = 0.9;

function connector(a: [number, number], b: [number, number]): Vec3[] {
  const mid = (a[1] + b[1]) / 2;
  return [
    [a[0], a[1] - 0.7, TZ],
    [a[0], mid, TZ],
    [b[0], mid, TZ],
    [b[0], b[1] + 0.7, TZ],
  ];
}

/**
 * One tree = 3 draw calls for structure: instanced glass boxes, one merged
 * fat-line geometry for every connector (revealed in parse order through
 * instanceCount), plus a sprite per label.
 */
function Tree({ nodes, from, step, color }: { nodes: Node[]; from: number; step: number; color: THREE.Color }) {
  const mat = useMemo(() => glassMaterial(color, 1), [color]);
  const { boxes, lines, lineMat, sizes, edgeOf } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const sizes = nodes.map((n) => new THREE.Vector3(Math.max(2.9, n.label.length * 0.52), 1.4, 0.6));
    const boxes = new THREE.InstancedMesh(UNIT_BOX, mat, nodes.length);
    // bounds from the fully-grown tree, so the batch is still culled when off screen
    const o = new THREE.Object3D();
    nodes.forEach((n, i) => {
      o.position.set(n.pos[0], n.pos[1], TZ);
      o.scale.copy(sizes[i]);
      o.updateMatrix();
      boxes.setMatrixAt(i, o.matrix);
    });
    boxes.computeBoundingSphere();
    const pts: number[] = [];
    // edgeOf[i] = how many connector segments exist once node i is visible
    const edgeOf: number[] = [];
    nodes.forEach((n) => {
      if (n.parent) {
        const c = connector(byId.get(n.parent)!.pos, n.pos);
        for (let k = 0; k < 3; k++) pts.push(...c[k], ...c[k + 1]);
      }
      edgeOf.push(pts.length / 6);
    });
    const geo = new LineSegmentsGeometry().setPositions(pts);
    const lineMat = new LineMaterial({ color: color.getHex(), linewidth: 1.5, transparent: true, opacity: 0.8 });
    const lines = new LineSegments2(geo, lineMat);
    return { boxes, lines, lineMat, sizes, edgeOf };
  }, [nodes, mat, color]);
  useEffect(
    () => () => {
      mat.dispose();
      boxes.dispose();
      lines.geometry.dispose();
      lineMat.dispose();
    },
    [mat, boxes, lines, lineMat],
  );
  const labels = useRef<(THREE.Group | null)[]>([]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = stageT(INDEX, store().progress);
    // grow in parse order, then clear the stage for the finale
    const clear = 1 - remap(t, PAGE.to - 0.02, FINALE);
    let shown = 0;
    for (let i = 0; i < nodes.length; i++) {
      const k = easeOut(remap(t, from + i * step, from + i * step + step * 1.6)) * clear;
      const s = Math.max(0.0001, k);
      o.position.set(nodes[i].pos[0], nodes[i].pos[1], TZ);
      o.scale.set(sizes[i].x * s, sizes[i].y * s, sizes[i].z * s);
      o.updateMatrix();
      boxes.setMatrixAt(i, o.matrix);
      const g = labels.current[i];
      if (g) {
        g.visible = k > 0.001;
        g.scale.setScalar(s);
      }
      if (k > 0.5) shown = edgeOf[i];
    }
    boxes.instanceMatrix.needsUpdate = true;
    (lines.geometry as LineSegmentsGeometry).instanceCount = shown;
    lineMat.resolution.set(state.size.width, state.size.height);
  });
  return (
    <group>
      <primitive object={boxes} />
      <primitive object={lines} />
      {nodes.map((n, i) => (
        <group
          key={n.id}
          ref={(g) => {
            labels.current[i] = g;
          }}
          position={[n.pos[0], n.pos[1], TZ + 0.5]}
          visible={false}
        >
          <Label text={n.label} size={0.66} color="#f2fbff" weight={700} />
        </group>
      ))}
    </group>
  );
}

/* --------------------------------- page ---------------------------------- */

function heroTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#1b1446");
  sky.addColorStop(1, "#b04bd6");
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#ffd9ff";
  g.beginPath();
  g.arc(380, 80, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2a1650";
  g.beginPath();
  g.moveTo(0, 256);
  g.lineTo(0, 180);
  g.lineTo(120, 90);
  g.lineTo(210, 170);
  g.lineTo(300, 110);
  g.lineTo(512, 210);
  g.lineTo(512, 256);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PAGE_TOP = BAR_POS[1] - 1.0;
const PAGE_H = 7.6;
const PAGE_C: Vec3 = [BAR_POS[0], PAGE_TOP - PAGE_H / 2, BAR_POS[2]];

/** Blocks of the rendered page, in page-local coordinates (centre = 0,0). */
const BLOCKS: { pos: [number, number]; size: [number, number]; kind: "bar" | "hero" | "text" | "accent" | "card" }[] = [
  { pos: [0, 3.35], size: [12.4, 0.5], kind: "bar" },
  { pos: [-2.9, 0.9], size: [6.2, 3.6], kind: "hero" },
  { pos: [3.3, 2.2], size: [5.2, 0.55], kind: "text" },
  { pos: [2.7, 1.4], size: [4.0, 0.55], kind: "text" },
  { pos: [3.1, 0.55], size: [4.8, 0.2], kind: "card" },
  { pos: [2.9, 0.2], size: [4.4, 0.2], kind: "card" },
  { pos: [2.0, -0.6], size: [2.2, 0.6], kind: "accent" },
  { pos: [-4.2, -2.1], size: [3.6, 1.4], kind: "card" },
  { pos: [0, -2.1], size: [3.6, 1.4], kind: "card" },
  { pos: [4.2, -2.1], size: [3.6, 1.4], kind: "card" },
  { pos: [0, -3.4], size: [12.4, 0.4], kind: "bar" },
];

function Page() {
  const hero = useMemo(heroTexture, []);
  useEffect(() => () => hero.dispose(), [hero]);
  const starts = useMemo(() => {
    const r = rng(23);
    return BLOCKS.map(() => new THREE.Vector3((r() - 0.5) * 30, (r() - 0.2) * 16, 4 + r() * 10));
  }, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const frame = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = stageT(INDEX, store().progress);
    if (frame.current) frame.current.visible = t > PAGE.from - 0.04;
    BLOCKS.forEach((b, i) => {
      const m = refs.current[i];
      if (!m) return;
      const a = PAGE.from + (i / BLOCKS.length) * (PAGE.to - PAGE.from) * 0.7;
      const k = easeOut(remap(t, a, a + 0.06));
      m.visible = k > 0.001;
      v.set(b.pos[0], b.pos[1], 0.05);
      m.position.lerpVectors(starts[i], v, k);
      m.rotation.z = (1 - k) * (i % 2 ? 0.6 : -0.6);
    });
  });
  const colorOf = (k: string) =>
    k === "bar" ? "#1a2350" : k === "text" ? "#e9f3ff" : k === "accent" ? hdr(COLORS.magenta, 1.6) : k === "card" ? "#24305f" : "#ffffff";
  const outline = useMemo<Vec3[]>(() => {
    const w = BAR_W / 2;
    const h = PAGE_H / 2;
    return [
      [-w, h, 0],
      [w, h, 0],
      [w, -h, 0],
      [-w, -h, 0],
      [-w, h, 0],
    ];
  }, []);
  return (
    <group position={PAGE_C}>
      <group ref={frame} visible={false}>
        <mesh>
          <planeGeometry args={[BAR_W, PAGE_H]} />
          <meshBasicMaterial color="#080c1f" transparent opacity={0.94} />
        </mesh>
        <Line points={outline} color={hdr(COLORS.cyan, 2)} lineWidth={1.6} toneMapped={false} />
      </group>
      {BLOCKS.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          visible={false}
        >
          <planeGeometry args={b.size} />
          {b.kind === "hero" ? <meshBasicMaterial map={hero} toneMapped={false} /> : <meshBasicMaterial color={colorOf(b.kind)} toneMapped={false} />}
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------- scene --------------------------------- */

function Scene() {
  const bar = useRef<BrowserHandle>(null);
  const ribbons = useRef<(THREE.Mesh | null)[]>([]);
  const tokens = useRef<(THREE.Sprite | null)[]>([]);
  const subs = useRef<(PacketHandle | null)[]>([]);
  const subLabels = useRef<(THREE.Sprite | null)[]>([]);
  const joins = useRef<(THREE.Mesh | null)[]>([]);
  const finale = useRef<THREE.Group>(null);
  const renderTree = useRef<THREE.Sprite>(null);
  const domLabel = useRef<THREE.Sprite>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const posOf = (id: string): Vec3 => {
    const n = [...DOM, ...CSSOM].find((x) => x.id === id)!;
    return [n.pos[0], n.pos[1], TZ];
  };
  const joinCurves = useMemo(
    () =>
      JOINS.map(([a, b]) => {
        const pa = new THREE.Vector3(...posOf(a));
        const pb = new THREE.Vector3(...posOf(b));
        const mid = pa.clone().lerp(pb, 0.5);
        mid.y += 8;
        mid.z += 3;
        return new THREE.QuadraticBezierCurve3(pa, mid, pb);
      }),
    [],
  );

  useFrame(() => {
    const t = stageT(INDEX, store().progress);
    bar.current?.setUrl(TARGET_HOST, false);
    bar.current?.setGlow(t > FINALE ? 0.6 : 0);
    ribbons.current.forEach((m, i) => setReveal(m, remap(t, i * 0.012, 0.16 + i * 0.012)));
    for (let i = 0; i < tokens.current.length; i++) {
      const s = tokens.current[i];
      if (!s) continue;
      const a = 0.02 + i * 0.022;
      const u = remap(t, a, a + 0.16);
      s.visible = u > 0 && u < 1;
      RIBBONS[i % RIBBONS.length].getPoint(u, tmp);
      s.position.set(tmp.x, tmp.y + 1, tmp.z);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI) * 1.2;
    }
    SUBS.forEach((sr, i) => {
      const u = remap(t, sr.from, sr.to);
      const moving = t > sr.from && t < sr.to;
      RIBBONS[sr.ribbon].getPoint(u, tmp);
      const p = subs.current[i];
      p?.setVisible(moving);
      p?.setPosition(tmp);
      const l = subLabels.current[i];
      if (l) {
        l.visible = moving;
        l.position.set(tmp.x, tmp.y + 1.5, tmp.z);
      }
    });
    const clear = 1 - remap(t, PAGE.to - 0.02, FINALE);
    if (domLabel.current) domLabel.current.visible = t > DOM_FROM && clear > 0;
    joins.current.forEach((m) => setReveal(m, clear > 0 ? remap(t, JOIN.from, JOIN.to) : 0));
    ribbons.current.forEach((m) => {
      if (m) (m.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.25 + 0.75 * clear;
    });
    if (renderTree.current) renderTree.current.visible = t > JOIN.from && t < PAGE.to + 0.04;
    if (finale.current) {
      const k = remap(t, FINALE, FINALE + 0.05);
      finale.current.visible = k > 0;
      finale.current.scale.setScalar(0.85 + 0.15 * easeOut(k));
    }
  });

  return (
    <group>
      <BrowserBar ref={bar} />
      <Page />
      {RIBBONS.map((c, i) => (
        <FlowLine
          key={i}
          ref={(m) => {
            ribbons.current[i] = m;
          }}
          curve={c}
          color={i % 2 ? COLORS.magenta : COLORS.cyan}
          radius={0.14}
          segments={120}
          dash={40}
          speed={-1.2}
          base={0.5}
          reveal={0}
        />
      ))}
      {TOKENS.map((tk, i) => (
        <Label
          key={tk}
          ref={(s) => {
            tokens.current[i] = s;
          }}
          text={tk}
          size={0.6}
          color={i % 2 ? "#f3c6ff" : "#bff6ff"}
          visible={false}
        />
      ))}
      {SUBS.map((s, i) => (
        <group key={s.name}>
          <Packet
            ref={(h) => {
              subs.current[i] = h;
            }}
            color={s.color}
            size={0.4}
            visible={false}
          />
          <Label
            ref={(sp) => {
              subLabels.current[i] = sp;
            }}
            text={s.name}
            size={0.5}
            color="#eaffff"
            bg="rgba(6,8,20,0.85)"
            border={s.color === COLORS.magenta ? HEX.magenta : HEX.cyan}
            visible={false}
          />
        </group>
      ))}
      <Tree nodes={DOM} from={DOM_FROM} step={DOM_STEP} color={COLORS.cyan} />
      <Tree nodes={CSSOM} from={CSS_FROM} step={CSS_STEP} color={COLORS.magenta} />
      <Label ref={domLabel} text="DOM" size={1} position={[15, 23.6, TZ]} color={HEX.cyan} weight={800} visible={false} />
      {joinCurves.map((c, i) => (
        <FlowLine
          key={i}
          ref={(m) => {
            joins.current[i] = m;
          }}
          curve={c}
          color={COLORS.magenta}
          radius={0.08}
          segments={40}
          reveal={0}
        />
      ))}
      <Label ref={renderTree} text="render tree = DOM + CSSOM" sub={["→ layout → paint → composite"]} size={0.8} position={[2, 25, TZ]} color="#ffffff" bg="rgba(8,6,20,0.85)" border={HEX.magenta} weight={700} visible={false} />
      <group ref={finale} position={[0, BAR_POS[1] + 2.4, 0.4]} visible={false}>
        <Label text="1.2 s. That's what just happened." size={0.95} color="#ffffff" weight={800} />
        <Label
          text="cache → DNS → TCP → TLS → edge MISS → Atlantic ×2 → render"
          size={0.36}
          position={[0, -0.95, 0]}
          color="rgba(190,225,255,0.85)"
          weight={500}
        />
      </group>
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [-8, 15, 42], target: [0, 8, -70], fov: 52 },
  { t: 0.14, position: [4, 15, 30], target: [8, 12, -12], fov: 54 },
  { t: 0.5, position: [2, 15, 30], target: [2, 13, -12], fov: 60 },
  { t: 0.7, position: [0, 13, 28], target: [0, 9, -6], fov: 54 },
  { t: 0.88, position: [0, 8.5, 20], target: [0, 7, 0], fov: 46 },
  { t: 1, position: [0, 8.2, 18.5], target: [0, 7.4, 0], fov: 46 },
]);

export const Stage6Render: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    out.visible = t < 0.16;
    out.scale = 1 - remap(t, 0.12, 0.16) * 0.9;
    RIBBONS[2].getPoint(remap(t, 0, 0.14), out.position);
  },
};
