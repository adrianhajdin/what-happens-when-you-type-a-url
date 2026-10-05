"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DynamicLabel, Label, type DynamicLabelHandle } from "@/core/Label";
import { Towers, rackSpecs } from "@/core/Tower";
import { FlowLine } from "@/core/FlowLine";
import { COLORS, HEX } from "@/core/materials";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { TARGET_HOST, TARGET_IP } from "@/lib/journey";
import { Chain, arc, remap, type Vec3 } from "@/lib/math";
import { store } from "@/lib/store";

const INDEX = 1;

const TOWERS = {
  resolver: { pos: [-14, 0, -48] as Vec3, h: 10, w: 4, name: "RECURSIVE RESOLVER", sub: "your ISP · 1.1.1.1 style" },
  root: { pos: [-2, 0, -72] as Vec3, h: 34, w: 8, name: "ROOT  ( . )", sub: "a–m.root-servers.net" },
  tld: { pos: [12, 0, -64] as Vec3, h: 20, w: 6, name: ".COM TLD", sub: "a.gtld-servers.net" },
  auth: { pos: [22, 0, -50] as Vec3, h: 15, w: 5, name: "AUTHORITATIVE", sub: "ns1.vercel-dns.com" },
};
type TowerId = keyof typeof TOWERS;

/** All four DNS towers in one batched draw (see Towers). */
const TOWER_SPECS = (Object.keys(TOWERS) as TowerId[]).flatMap((id) =>
  rackSpecs(TOWERS[id].pos, TOWERS[id].h, TOWERS[id].w, id === "resolver" ? "cyan" : "magenta"),
);

const top = (id: TowerId) => {
  const t = TOWERS[id];
  return new THREE.Vector3(t.pos[0], t.h + 1.2, t.pos[2]);
};
const CLIENT_START = new THREE.Vector3(-2, 0.8, -24);
const CLIENT_END = new THREE.Vector3(1, 1.2, -30);

const LEGS: { from: THREE.Vector3; to: THREE.Vector3; h: number; text: string; answer: boolean }[] = [
  { from: CLIENT_START, to: top("resolver"), h: 5, text: `A? ${TARGET_HOST}`, answer: false },
  { from: top("resolver"), to: top("root"), h: 8, text: `A? ${TARGET_HOST}`, answer: false },
  { from: top("root"), to: top("resolver"), h: 8, text: "→ ask .com: a.gtld-servers.net", answer: true },
  { from: top("resolver"), to: top("tld"), h: 9, text: `A? ${TARGET_HOST}`, answer: false },
  { from: top("tld"), to: top("resolver"), h: 9, text: "→ ask ns1.vercel-dns.com", answer: true },
  { from: top("resolver"), to: top("auth"), h: 10, text: `A? ${TARGET_HOST}`, answer: false },
  { from: top("auth"), to: top("resolver"), h: 10, text: `A ${TARGET_IP}  TTL 60`, answer: true },
  { from: top("resolver"), to: CLIENT_END, h: 5, text: `${TARGET_IP}`, answer: true },
];
const ROUTE = new Chain(LEGS.map((l) => arc(l.from, l.to, l.h)));
const HOP_START = 0.04;
const HOP_END = 0.9;

/** What the resolver has cached after each leg (caching is the point of a resolver). */
const CACHE_AFTER = [[], [], [".com  NS  ✓"], [".com  NS  ✓"], [".com  NS  ✓", "vercel.com  NS  ✓"], [".com  NS  ✓", "vercel.com  NS  ✓"], [".com  NS  ✓", "vercel.com  NS  ✓", "vercel.com  A  ✓"]];

function Scene() {
  const label = useRef<DynamicLabelHandle>(null);
  const ttl = useRef<DynamicLabelHandle>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const [leg, setLeg] = useState(-1);
  const legRef = useRef(-1);
  const ttlRef = useRef(-1);

  const groundLines = useMemo(() => {
    const g = (a: Vec3, b: Vec3) => new THREE.LineCurve3(new THREE.Vector3(a[0], 0.06, a[2]), new THREE.Vector3(b[0], 0.06, b[2]));
    return [
      g([0, 0, -20], TOWERS.resolver.pos),
      g(TOWERS.resolver.pos, TOWERS.root.pos),
      g(TOWERS.root.pos, TOWERS.tld.pos),
      g(TOWERS.tld.pos, TOWERS.auth.pos),
      g(TOWERS.resolver.pos, TOWERS.auth.pos),
    ];
  }, []);

  useFrame(() => {
    const t = stageT(INDEX, store().progress);
    const u = remap(t, HOP_START, HOP_END);
    const inHops = t > HOP_START && t < HOP_END;
    const l = t >= HOP_END ? LEGS.length : t <= HOP_START ? -1 : ROUTE.segment(u);
    if (l !== legRef.current) {
      legRef.current = l;
      setLeg(l);
    }
    const s = label.current?.sprite;
    if (s) {
      s.visible = inHops;
      if (inHops) {
        ROUTE.getPoint(u, tmp);
        s.position.set(tmp.x, tmp.y + 1.7, tmp.z);
        label.current!.setText(LEGS[ROUTE.segment(u)].text);
      }
    }
    const ts = ttl.current?.sprite;
    if (ts) {
      const show = t > 0.8;
      ts.visible = show;
      if (show) {
        // TTL starts ticking once the resolver has the answer
        const secs = Math.max(0, 60 - Math.floor(remap(t, 0.8, 1) * 6));
        if (secs !== ttlRef.current) {
          ttlRef.current = secs;
          ttl.current!.setText(`${TARGET_IP} · TTL ${secs}s`);
        }
        if (t < HOP_END) {
          ROUTE.getPoint(u, tmp);
          ts.position.set(tmp.x, tmp.y - 1.3, tmp.z);
        } else ts.position.set(CLIENT_END.x, CLIENT_END.y + 2.2, CLIENT_END.z);
      }
    }
  });

  const cache = CACHE_AFTER[Math.min(Math.max(leg, 0), CACHE_AFTER.length - 1)] ?? [];
  return (
    <group>
      <Towers specs={TOWER_SPECS} />
      {(Object.keys(TOWERS) as TowerId[]).map((id) => {
        const tw = TOWERS[id];
        const active = leg >= 0 && leg < LEGS.length && (LEGS[leg].to.equals(top(id)) || LEGS[leg].from.equals(top(id)));
        return (
          <group key={id}>
            <Label
              text={tw.name}
              sub={[tw.sub]}
              size={id === "root" ? 0.9 : 0.62}
              position={[tw.pos[0], tw.h + (id === "root" ? 4.2 : 3.2), tw.pos[2]]}
              color={active ? "#ffffff" : "#bfefff"}
              bg="rgba(6,8,20,0.8)"
              border={active ? HEX.magenta : "rgba(34,211,238,0.45)"}
              glow={active ? 1.1 : 0.85}
              weight={700}
            />
          </group>
        );
      })}
      {cache.length > 0 && (
        <Label
          text="resolver cache"
          sub={cache}
          size={0.45}
          position={[-21.5, 8, -46]}
          color={HEX.cyan}
          bg="rgba(6,8,20,0.82)"
          border="rgba(34,211,238,0.6)"
          align="left"
        />
      )}
      {groundLines.map((c, i) => (
        <FlowLine key={i} curve={c} color={i === 0 ? COLORS.cyan : COLORS.magenta} radius={0.05} segments={8} dash={6} speed={0.4} base={0.5} />
      ))}
      <DynamicLabel ref={label} size={0.55} color="#eaffff" bg="rgba(6,8,20,0.82)" border={HEX.cyan} weight={600} />
      <DynamicLabel ref={ttl} size={0.5} color={HEX.magenta} bg="rgba(20,6,24,0.85)" border={HEX.magenta} weight={700} />
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [4, 8, -4], target: [2, 12, -52], fov: 52 },
  { t: 0.25, position: [-6, 14, -18], target: [-2, 18, -60], fov: 52 },
  { t: 0.55, position: [2, 22, -22], target: [6, 16, -60], fov: 50 },
  { t: 0.85, position: [0, 10, -12], target: [0, 6, -42], fov: 50 },
  { t: 1, position: [4, 9, -16], target: [0, 4, -64], fov: 50 },
]);

export const Stage1Dns: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    out.visible = true;
    if (t <= HOP_START) out.position.copy(CLIENT_START);
    else if (t >= HOP_END) out.position.copy(CLIENT_END);
    else ROUTE.getPoint(remap(t, HOP_START, HOP_END), out.position);
  },
};
