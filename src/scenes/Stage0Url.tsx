"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BrowserBar, GO_POS, BAR_POS, type BrowserHandle } from "./parts/BrowserWindow";
import { Label } from "@/core/Label";
import { COLORS, HEX, glassMaterial, glowTexture, hdr } from "@/core/materials";
import { UNIT_BOX } from "@/core/Tower";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { easeOut, remap } from "@/lib/math";
import { store, useJourney, useStore } from "@/lib/store";
import { focusAddressBar } from "@/lib/address-bar";

const INDEX = 0;

/** Scroll beats within the stage (local t). */
const BEAT = {
  typeStart: 0.06,
  typeEnd: 0.34,
  enter: 0.38,
  browserScan: 0.42,
  browserMiss: 0.56,
  osScan: 0.58,
  osMiss: 0.7,
  birth: 0.74,
  drop: 0.84,
};

const DROP = new THREE.CubicBezierCurve3(
  new THREE.Vector3(...GO_POS),
  new THREE.Vector3(GO_POS[0] + 2.5, GO_POS[1] + 1.5, -1),
  new THREE.Vector3(5, 0.8, -5),
  new THREE.Vector3(0, 0.7, -14),
);

type Status = "idle" | "scan" | "miss";

const PLACEHOLDER = "Search or type a URL";
const EDIT_PLACEHOLDER = "type any site, e.g. github.com";

const BLOCKS = [
  { id: "browser", title: "BROWSER CACHE", x: -4.6, scan: BEAT.browserScan, miss: BEAT.browserMiss, rows: ["github.com        A  ✓", "fonts.gstatic.com A  ✓"] },
  { id: "os", title: "OS RESOLVER CACHE", x: 4.6, scan: BEAT.osScan, miss: BEAT.osMiss, rows: ["/etc/hosts        ✓", "api.github.com A  ✓"] },
];
const missRow = (host: string) => `${(host.length > 17 ? host.slice(0, 16) + "…" : host).padEnd(17)} ?  —`;

const statusOf = (b: (typeof BLOCKS)[number], t: number): Status => (t >= b.miss ? "miss" : t >= b.scan ? "scan" : "idle");

function MemoryBlock({ title, x, rows, status }: { title: string; x: number; rows: string[]; status: Status }) {
  const mat = useMemo(() => glassMaterial(COLORS.cyan, 0.9), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const c = status === "miss" ? COLORS.red : COLORS.cyan;
    (mat.uniforms.uEdge.value as THREE.Color).copy(c).multiplyScalar(status === "scan" ? 2 : 1);
  }, [mat, status]);
  return (
    <group position={[x, 12, -4]}>
      <mesh geometry={UNIT_BOX} material={mat} scale={[6.4, 2.9, 0.5]} />
      <Label text={title} size={0.4} position={[0, 0.95, 0.4]} color="#bfefff" weight={700} />
      <Label
        text={rows[0]}
        sub={rows.slice(1)}
        size={0.36}
        position={[0, -0.3, 0.4]}
        color="#8fb6d9"
        subColor="rgba(150,190,230,0.75)"
        weight={500}
        align="left"
      />
      {status !== "idle" && (
        <Label
          text={status === "miss" ? "MISS" : "looking up…"}
          size={status === "miss" ? 0.55 : 0.34}
          position={[0, -2.05, 0.4]}
          color={status === "miss" ? HEX.red : HEX.cyan}
          bg="rgba(6,6,15,0.85)"
          border={status === "miss" ? HEX.red : HEX.cyan}
          weight={700}
        />
      )}
    </group>
  );
}

function Scene() {
  const bar = useRef<BrowserHandle>(null);
  const [status, setStatus] = useState<[Status, Status]>(["idle", "idle"]);
  const statusKey = useRef<[Status, Status]>(["idle", "idle"]);
  const pool = useRef<THREE.Mesh>(null);
  const journey = useJourney();
  const trace = useStore((s) => s.trace);
  const host = journey.host;
  /** Every prefix of the host, precomputed so typing allocates nothing per frame. */
  const typed = useMemo(() => Array.from({ length: host.length + 1 }, (_, i) => host.slice(0, i)), [host]);

  useFrame(() => {
    const st = store();
    const t = stageT(INDEX, st.progress);
    const blink = Math.floor(performance.now() / 530) % 2 === 0;
    // the bar is a real input while you're at the top of the page
    if (t < BEAT.typeStart && st.draft !== null) {
      bar.current?.setUrl(st.draft ? st.draft.replace(/^https?:\/\//, "") : EDIT_PLACEHOLDER, blink, !st.draft);
    } else if (t < BEAT.typeStart && st.trace.status === "loading" && st.trace.host) {
      bar.current?.setUrl(st.trace.host, false);
    } else {
      const n = Math.round(remap(t, BEAT.typeStart, BEAT.typeEnd) * host.length);
      if (n === 0) bar.current?.setUrl(PLACEHOLDER, blink, true);
      else bar.current?.setUrl(typed[n], t < BEAT.enter && blink);
    }
    // enter pulse
    const pulse = t > BEAT.enter ? Math.max(0, 1 - (t - BEAT.enter) * 12) : 0;
    bar.current?.setGlow(pulse + (t > BEAT.birth ? remap(t, BEAT.birth, BEAT.drop) : 0));

    const a = statusOf(BLOCKS[0], t);
    const b = statusOf(BLOCKS[1], t);
    if (a !== statusKey.current[0] || b !== statusKey.current[1]) {
      statusKey.current = [a, b];
      setStatus(statusKey.current);
    }
    if (pool.current) (pool.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.4 * remap(t, BEAT.birth, 1);
  });

  return (
    <group>
      <BrowserBar ref={bar} onActivate={store().video ? undefined : focusAddressBar} />
      {BLOCKS.map((b, i) => (
        <MemoryBlock key={b.id} title={b.title} x={b.x} rows={[...b.rows, missRow(host)]} status={status[i]} />
      ))}
      {trace.status === "loading" && (
        <Label text={`tracing ${trace.host}…`} sub={["DNS · TLS · CDN edge"]} size={0.45} position={[0, BAR_POS[1] - 1.7, 0.5]} color={HEX.cyan} bg="rgba(6,8,20,0.85)" border={HEX.cyan} weight={700} />
      )}
      {trace.status === "error" && (
        <Label
          text={(trace.message ?? "Couldn't trace that site").slice(0, 60)}
          sub={["try another site, or scroll for the example"]}
          size={0.42}
          position={[0, BAR_POS[1] - 1.7, 0.5]}
          color={HEX.red}
          bg="rgba(20,6,10,0.88)"
          border={HEX.red}
          weight={700}
        />
      )}
      {/* the bar casts a cyan pool of light onto the network plane */}
      <mesh ref={pool} rotation-x={-Math.PI / 2} position={[BAR_POS[0], 0.02, BAR_POS[2] - 1]}>
        <planeGeometry args={[26, 14]} />
        <meshBasicMaterial map={glowTexture()} color={hdr(COLORS.cyan, 0.6)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [0, 9.4, 15.5], target: [0, 9.8, 0], fov: 42 },
  { t: 0.36, position: [0, 10.4, 17.5], target: [0, 10.8, -2], fov: 42 },
  { t: 0.72, position: [1.2, 10.2, 16], target: [1.5, 10.2, -2], fov: 42 },
  { t: 0.8, position: [3.2, 9.8, 11], target: [5, 8.6, -1], fov: 44 },
  // pull up and back: the exit to DNS rises between and above the two cache blocks
  { t: 1, position: [0, 16.5, 19], target: [0, 3, -14], fov: 48 },
]);

export const Stage0Url: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    if (t < BEAT.birth) {
      out.visible = false;
      return;
    }
    out.visible = true;
    out.scale = easeOut(remap(t, BEAT.birth, BEAT.drop));
    if (t < BEAT.drop) out.position.set(...GO_POS);
    else DROP.getPoint(remap(t, BEAT.drop, 1), out.position);
  },
};
