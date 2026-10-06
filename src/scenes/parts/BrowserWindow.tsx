"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { RoundedBox, Line } from "@react-three/drei";
import * as THREE from "three";
import { COLORS, HEX, hdr } from "@/core/materials";
import type { Vec3 } from "@/lib/math";

export const BAR_POS: Vec3 = [0, 9, 0];
export const BAR_W = 13;
export const BAR_H = 1.5;
/** Where the "go" button sits — the packet is born here. */
export const GO_POS: Vec3 = [BAR_POS[0] + BAR_W / 2 - 0.85, BAR_POS[1], 0.25];

export type BrowserHandle = {
  setUrl: (text: string, caret: boolean, placeholder?: boolean) => void;
  setGlow: (v: number) => void;
};

function roundedRect(w: number, h: number, r: number, z: number) {
  const pts: THREE.Vector3[] = [];
  const seg = 8;
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
  }
  pts.push(pts[0].clone());
  return pts;
}

/** Floating 3D address bar. Text is a canvas texture redrawn only when it changes. */
export const BrowserBar = forwardRef<BrowserHandle, { position?: Vec3; onActivate?: () => void }>(function BrowserBar({ position = BAR_POS, onActivate }, ref) {
  const outline = useMemo(() => roundedRect(BAR_W, BAR_H, 0.55, 0.17), []);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const text = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1536;
    c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { c, tex, text: "\u0000", caret: false, placeholder: false };
  }, []);
  useEffect(() => () => text.tex.dispose(), [text]);

  useImperativeHandle(ref, () => ({
    setUrl(t, caret, placeholder = false) {
      // called every frame: compare fields, don't build a key string
      if (t === text.text && caret === text.caret && placeholder === text.placeholder) return;
      text.text = t;
      text.caret = caret;
      text.placeholder = placeholder;
      const g = text.c.getContext("2d")!;
      const fam = getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "monospace";
      g.clearRect(0, 0, 1536, 128);
      g.textBaseline = "middle";
      g.font = `500 64px ${fam}`;
      let x = 8;
      if (!placeholder) {
        g.fillStyle = "rgba(160,190,230,0.55)";
        g.fillText("https://", x, 66);
        x += g.measureText("https://").width;
      }
      g.fillStyle = placeholder ? "rgba(160,190,230,0.45)" : "#eaf8ff";
      g.shadowColor = HEX.cyan;
      g.shadowBlur = placeholder ? 0 : 14;
      g.fillText(t, x, 66);
      g.shadowBlur = 0;
      const w = placeholder ? 0 : g.measureText(t).width;
      if (caret) {
        g.fillStyle = HEX.cyan;
        g.fillRect(x + w + 6, 30, 6, 72);
      }
      text.tex.needsUpdate = true;
    },
    setGlow(v) {
      if (glowMat.current) glowMat.current.color.copy(COLORS.cyan).multiplyScalar(1.5 + v * 5);
    },
  }));

  return (
    <group
      position={position}
      onClick={
        onActivate &&
        ((e) => {
          e.stopPropagation();
          onActivate();
        })
      }
      onPointerOver={onActivate && (() => (document.body.style.cursor = "text"))}
      onPointerOut={onActivate && (() => (document.body.style.cursor = ""))}
    >
      <RoundedBox args={[BAR_W, BAR_H, 0.3]} radius={0.14} smoothness={3}>
        <meshBasicMaterial color="#070b1c" transparent opacity={0.92} />
      </RoundedBox>
      <Line points={outline} color={hdr(COLORS.cyan, 2.2)} lineWidth={2} toneMapped={false} />
      {/* traffic lights */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-BAR_W / 2 + 0.6 + i * 0.42, 0, 0.17]}>
          <circleGeometry args={[0.13, 16]} />
          <meshBasicMaterial color={i === 0 ? hdr(COLORS.magenta, 1.6) : [0.25, 0.3, 0.45]} toneMapped={false} />
        </mesh>
      ))}
      {/* lock */}
      <group position={[-BAR_W / 2 + 2.15, 0, 0.17]}>
        <mesh position={[0, -0.08, 0]}>
          <planeGeometry args={[0.32, 0.26]} />
          <meshBasicMaterial color={hdr(COLORS.cyan, 1.3)} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <ringGeometry args={[0.08, 0.13, 16, 1, 0, Math.PI]} />
          <meshBasicMaterial color={hdr(COLORS.cyan, 1.3)} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[-BAR_W / 2 + 2.6 + 4.6, 0, 0.17]}>
        <planeGeometry args={[9.2, 9.2 / 12]} />
        <meshBasicMaterial map={text.tex} transparent toneMapped={false} />
      </mesh>
      {/* go button */}
      <mesh position={[BAR_W / 2 - 0.85, 0, 0.17]}>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial ref={glowMat} color={hdr(COLORS.cyan, 1.5)} toneMapped={false} />
      </mesh>
      <mesh position={[BAR_W / 2 - 0.85, 0, 0.18]}>
        <circleGeometry args={[0.3, 32]} />
        <meshBasicMaterial color="#070b1c" />
      </mesh>
    </group>
  );
});
