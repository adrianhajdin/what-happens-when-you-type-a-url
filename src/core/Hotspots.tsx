"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HOTSPOTS } from "@/lib/stages";
import { useStore, store } from "@/lib/store";
import { TIME } from "./materials";

let ringTex: THREE.CanvasTexture | null = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "white";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "white";
  g.beginPath();
  g.arc(64, 64, 18, 0, Math.PI * 2);
  g.fill();
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

function Marker({ id, position }: { id: string; position: [number, number, number] }) {
  const ring = useRef<THREE.Sprite>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const open = useStore((s) => s.hotspot === id);
  useFrame(() => {
    const s = ring.current;
    if (!s) return;
    const k = 1 + Math.sin(TIME.value * 3 + seed) * 0.12;
    const base = open ? 0.9 : 0.65;
    s.scale.set(base * k, base * k, 1);
  });
  return (
    <group position={position}>
      <sprite ref={ring} renderOrder={12}>
        <spriteMaterial map={ringTexture()} color={open ? [2.2, 0.9, 2.4] : [0.9, 2, 2.3]} transparent depthTest={false} toneMapped={false} fog={false} />
      </sprite>
      {/* generous invisible hit target */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          store().set({ hotspot: open ? null : id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          store().poke();
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[1.3, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

/** Clickable markers for the active stage, data-driven from stages.ts. */
export function Hotspots() {
  const stage = useStore((s) => s.stage);
  const list = useMemo(() => HOTSPOTS.filter((h) => h.stage === stage), [stage]);
  return (
    <>
      {list.map((h) => (
        <Marker key={h.id} id={h.id} position={h.position} />
      ))}
    </>
  );
}
