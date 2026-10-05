"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Towers, UNIT_BOX, sharedTowerMaterial, type TowerSpec } from "@/core/Tower";
import { FlowLine, setReveal } from "@/core/FlowLine";
import { Label } from "@/core/Label";
import { COLORS, HEX, glowTexture, hdr } from "@/core/materials";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { remap, easeInOut } from "@/lib/math";
import { store } from "@/lib/store";

const INDEX = 4;
const FZ = -240;
const FRONT = new THREE.Vector3(0, 1.2, FZ + 8.5);
const BACK = new THREE.Vector3(0, 1.2, FZ - 8.5);

const BEAT = { arrive: 0.2, scanFrom: 0.22, scanTo: 0.44, miss: 0.44, hitFrom: 0.3, hitTo: 0.46, gateFrom: 0.5, gateTo: 0.6, through: 0.64, out: 0.66 };

const IN_PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(17, 1.2, -190),
  new THREE.Vector3(10, 1.2, -204),
  new THREE.Vector3(2, 1.2, -220),
  FRONT.clone(),
]);
const HIT_PATH = new THREE.CatmullRomCurve3([
  FRONT.clone().setX(2),
  new THREE.Vector3(10, 0.6, -222),
  new THREE.Vector3(19, 0.6, -208),
  new THREE.Vector3(24, 0.6, -190),
]);
const MISS_PATH = new THREE.CatmullRomCurve3([
  BACK.clone(),
  new THREE.Vector3(0, 1.4, -275),
  new THREE.Vector3(0, 2.5, -305),
  new THREE.Vector3(0, 3, -360),
  new THREE.Vector3(0, 3.5, -430),
]);

const CORNERS = [
  [-8, -8],
  [8, -8],
  [-8, 8],
  [8, 8],
] as const;

const FORTRESS: TowerSpec[] = [
  { position: [0, 0, FZ], size: [13, 17, 13], edge: "magenta", density: 0.65 },
  ...CORNERS.map(([x, z], i): TowerSpec => ({ position: [x, 0, FZ + z], size: [4.2, 23, 4.2], edge: i % 2 ? "cyan" : "magenta", density: 0.7 })),
  { position: [0, 17, FZ], size: [8, 3, 8], edge: "cyan", density: 0.3, reflect: false },
  // bridge pillars over the water
  ...Array.from({ length: 9 }, (_, i): TowerSpec => ({ position: [0, -6, -310 - i * 14], size: [1.2, 8.5, 1.2], edge: "cyan", density: 0, reflect: false })),
];

function Fortress({ scanRef }: { scanRef: React.RefObject<THREE.Mesh | null> }) {
  const mat = useMemo(() => sharedTowerMaterial("magenta", "cyan", 0.6), []);
  return (
    <group>
      <Towers specs={FORTRESS} />
      <group position={[0, 0, FZ]}>
        {CORNERS.map(([x, z], i) => (
          <mesh key={i} geometry={UNIT_BOX} material={mat} position={[x, 23 + 4, z]} scale={[0.4, 8, 0.4]} />
        ))}
        <mesh geometry={UNIT_BOX} material={mat} position={[0, 26, 0]} scale={[0.5, 12, 0.5]} />
        {/* ground rings */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
          <ringGeometry args={[13.2, 13.6, 96]} />
          <meshBasicMaterial color={hdr(COLORS.magenta, 2.5)} toneMapped={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
          <ringGeometry args={[15.6, 15.8, 96]} />
          <meshBasicMaterial color={hdr(COLORS.cyan, 2)} toneMapped={false} />
        </mesh>
        {/* cache-lookup scan ring */}
        <mesh ref={scanRef} rotation-x={-Math.PI / 2} visible={false}>
          <ringGeometry args={[10, 10.4, 64]} />
          <meshBasicMaterial color={hdr(COLORS.cyan, 3)} toneMapped={false} transparent side={THREE.DoubleSide} />
        </mesh>
        {/* front door */}
        <mesh position={[0, 3, 6.6]}>
          <planeGeometry args={[3.2, 6]} />
          <meshBasicMaterial color={hdr(COLORS.cyan, 1.6)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Scene() {
  const scan = useRef<THREE.Mesh>(null);
  const inLine = useRef<THREE.Mesh>(null);
  const hitLine = useRef<THREE.Mesh>(null);
  const missLine = useRef<THREE.Mesh>(null);
  const doors = useRef<(THREE.Mesh | null)[]>([]);
  const [phase, setPhase] = useState(0);
  const phaseRef = useRef(0);

  useFrame(() => {
    const t = stageT(INDEX, store().progress);
    setReveal(inLine.current, remap(t, 0, BEAT.arrive));
    setReveal(hitLine.current, remap(t, BEAT.hitFrom, BEAT.hitTo));
    setReveal(missLine.current, remap(t, BEAT.gateTo, 1));
    const su = remap(t, BEAT.scanFrom, BEAT.scanTo);
    if (scan.current) {
      scan.current.visible = su > 0 && su < 1;
      scan.current.position.y = 0.5 + su * 17;
      const k = 1 + Math.sin(su * Math.PI) * 0.08;
      scan.current.scale.set(k, k, 1);
    }
    const g = easeInOut(remap(t, BEAT.gateFrom, BEAT.gateTo));
    for (let i = 0; i < doors.current.length; i++) {
      const d = doors.current[i];
      if (d) d.position.x = (i === 0 ? -1 : 1) * (1.6 + g * 3.2);
    }
    const p = t < BEAT.scanFrom ? 0 : t < BEAT.miss ? 1 : t < BEAT.gateFrom ? 2 : 3;
    if (p !== phaseRef.current) {
      phaseRef.current = p;
      setPhase(p);
    }
  });

  return (
    <group>
      <Fortress scanRef={scan} />
      {/* back gate: two sliding panels */}
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            doors.current[i] = m;
          }}
          position={[0, 3.5, FZ - 6.7]}
        >
          <boxGeometry args={[3.2, 7, 0.3]} />
          <meshBasicMaterial color={phase >= 3 ? hdr(COLORS.cyan, 1.8) : hdr(COLORS.red, 1.8)} toneMapped={false} />
        </mesh>
      ))}
      <FlowLine ref={inLine} curve={IN_PATH} color={COLORS.cyan} radius={0.08} segments={40} reveal={0} />
      <FlowLine ref={hitLine} curve={HIT_PATH} color={COLORS.magenta} radius={0.07} segments={40} opacity={0.45} base={0.3} reveal={0} />
      <FlowLine ref={missLine} curve={MISS_PATH} color={COLORS.cyan} radius={0.1} segments={96} dash={30} speed={1.2} reveal={0} />
      <Label text="EDGE PoP  ·  fra1" sub={["Frankfurt  ·  peering at DE-CIX"]} size={1.1} position={[0, 34, FZ]} weight={700} />
      {phase >= 1 && (
        <Label
          text={phase === 1 ? "cache lookup  GET /" : "cache  MISS"}
          sub={phase === 1 ? ["key: vercel.com/  ·  checking…"] : ["nothing fresh here → forward to origin"]}
          size={1.25}
          position={[-13, 13, FZ + 10]}
          color={phase === 1 ? HEX.cyan : HEX.red}
          bg="rgba(6,8,20,0.88)"
          border={phase === 1 ? HEX.cyan : HEX.red}
          weight={700}
        />
      )}
      {phase >= 1 && (
        <Label
          text="HIT → back to you in ~20 ms"
          sub={["(not this time)"]}
          size={0.55}
          position={[22, 3.5, -199]}
          color={HEX.magenta}
          opacity={0.75}
          bg="rgba(6,8,20,0.75)"
          border="rgba(232,121,249,0.5)"
        />
      )}
      {phase >= 3 && (
        <Label text="MISS → origin  iad1 · Ashburn, VA" size={0.7} position={[0, 7.5, -282]} color="#eaffff" bg="rgba(6,8,20,0.85)" border={HEX.cyan} weight={700} />
      )}
      <sprite position={[0, 6, FZ]} scale={[60, 40, 1]}>
        <spriteMaterial map={glowTexture()} color={hdr(COLORS.magenta, 0.25)} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [-34, 18, -180], target: [4, 10, -236], fov: 50 },
  { t: 0.45, position: [-30, 22, -190], target: [2, 10, -238], fov: 52 },
  { t: 0.64, position: [30, 16, -232], target: [0, 5, -264], fov: 54 },
  { t: 1, position: [5, 13, -268], target: [0, 9, -430], fov: 55 },
]);

export const Stage4Edge: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    out.visible = true;
    if (t < BEAT.arrive) IN_PATH.getPoint(remap(t, 0, BEAT.arrive), out.position);
    else if (t < BEAT.through) out.position.copy(FRONT);
    else if (t < BEAT.out) out.visible = false;
    else MISS_PATH.getPoint(remap(t, BEAT.out, 1), out.position);
  },
};
