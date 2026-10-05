"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeElements } from "@react-three/fiber";

/**
 * Text as canvas textures on sprites. No font files to download, no SDF
 * generation; textures are cached by content so repeated labels are free.
 */

export type LabelStyle = {
  color?: string;
  /** Pill background; omit for bare glowing text. */
  bg?: string;
  border?: string;
  mono?: boolean;
  weight?: number;
  /** Extra lines rendered smaller and dimmer below the first. */
  sub?: string[];
  subColor?: string;
  align?: "left" | "center";
};

const PX = 64; // font px per world-unit of label height

function fontFamily(mono: boolean) {
  if (typeof document === "undefined") return "monospace";
  const v = getComputedStyle(document.body).getPropertyValue(mono ? "--font-mono" : "--font-sans").trim();
  return v || (mono ? "ui-monospace, monospace" : "system-ui, sans-serif");
}

function draw(canvas: HTMLCanvasElement, text: string, s: LabelStyle) {
  const g = canvas.getContext("2d")!;
  const mono = s.mono ?? true;
  const fam = fontFamily(mono);
  const main = `${s.weight ?? 600} ${PX}px ${fam}`;
  const subFont = `400 ${PX * 0.62}px ${fam}`;
  g.font = main;
  let w = g.measureText(text).width;
  const subs = s.sub ?? [];
  g.font = subFont;
  for (const l of subs) w = Math.max(w, g.measureText(l).width);
  const padX = s.bg ? PX * 0.5 : PX * 0.15;
  const padY = s.bg ? PX * 0.3 : PX * 0.1;
  const lineH = PX * 1.15;
  const subH = PX * 0.8;
  const W = Math.ceil(w + padX * 2);
  const H = Math.ceil(lineH + subs.length * subH + padY * 2);
  canvas.width = W;
  canvas.height = H;
  g.clearRect(0, 0, W, H);
  if (s.bg) {
    const r = Math.min(H / 2, PX * 0.45);
    g.beginPath();
    g.roundRect(3, 3, W - 6, H - 6, r);
    g.fillStyle = s.bg;
    g.fill();
    if (s.border) {
      g.lineWidth = 4;
      g.strokeStyle = s.border;
      g.stroke();
    }
  }
  const align = s.align ?? "center";
  g.textAlign = align;
  g.textBaseline = "middle";
  const x = align === "center" ? W / 2 : padX;
  g.font = main;
  g.fillStyle = s.color ?? "#e6f6ff";
  g.shadowColor = s.color ?? "#22d3ee";
  g.shadowBlur = s.bg ? 0 : 10;
  g.fillText(text, x, padY + lineH / 2);
  g.shadowBlur = 0;
  g.font = subFont;
  g.fillStyle = s.subColor ?? "rgba(200,225,255,0.7)";
  subs.forEach((l, i) => g.fillText(l, x, padY + lineH + subH * (i + 0.5)));
  return W / H;
}

type Entry = { tex: THREE.CanvasTexture; aspect: number };
const cache = new Map<string, Entry>();

export function textTexture(text: string, style: LabelStyle = {}): Entry {
  const key = text + "|" + JSON.stringify(style);
  let e = cache.get(key);
  if (!e) {
    const c = document.createElement("canvas");
    const aspect = draw(c, text, style);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    e = { tex, aspect };
    cache.set(key, e);
  }
  return e;
}

/** Drop every cached label texture (called when fonts finish loading). */
export function clearLabelCache() {
  cache.forEach((e) => e.tex.dispose());
  cache.clear();
}

type LabelProps = Omit<ThreeElements["sprite"], "ref"> &
  LabelStyle & {
    text: string;
    /** World-space height of the first line. */
    size?: number;
    opacity?: number;
    /** Render on top of everything (HUD-like). */
    overlay?: boolean;
    glow?: number;
  };

export const Label = forwardRef<THREE.Sprite, LabelProps>(function Label(
  { text, size = 1, opacity = 1, overlay = false, glow = 0.82, color, bg, border, mono, weight, sub, subColor, align, ...rest },
  ref,
) {
  const style = useMemo<LabelStyle>(
    () => ({ color, bg, border, mono, weight, sub, subColor, align }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, bg, border, mono, weight, sub?.join("\n"), subColor, align],
  );
  const { tex, aspect } = useMemo(() => textTexture(text, style), [text, style]);
  const lines = 1 + (sub?.length ?? 0) * 0.7;
  const h = size * (lines + (bg ? 0.55 : 0.2));
  return (
    <sprite ref={ref} scale={[h * aspect, h, 1]} renderOrder={overlay ? 10 : 2} {...rest}>
      <spriteMaterial
        map={tex}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={!overlay}
        toneMapped={false}
        color={[glow, glow, glow]}
        fog={false}
      />
    </sprite>
  );
});

export type DynamicLabelHandle = {
  setText: (text: string) => void;
  sprite: THREE.Sprite | null;
};

/** A label whose text changes at runtime (typing, counters). Redraws only when the string changes. */
export const DynamicLabel = forwardRef<DynamicLabelHandle, Omit<LabelProps, "text"> & { initial?: string }>(
  function DynamicLabel({ initial = "", size = 1, opacity = 1, overlay = false, glow = 0.82, color, bg, border, mono, weight, sub, subColor, align, ...rest }, ref) {
    const sprite = useRef<THREE.Sprite>(null);
    const state = useMemo(() => {
      const canvas = document.createElement("canvas");
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return { canvas, tex, text: "\u0000" };
    }, []);
    const style: LabelStyle = { color, bg, border, mono, weight, sub, subColor, align };
    const styleRef = useRef(style);
    styleRef.current = style;

    const apply = (text: string) => {
      if (text === state.text) return;
      state.text = text;
      const aspect = draw(state.canvas, text || " ", styleRef.current);
      state.tex.dispose(); // canvas size may change: force re-upload at new size
      state.tex.needsUpdate = true;
      const s = sprite.current;
      if (s) {
        const lines = 1 + (styleRef.current.sub?.length ?? 0) * 0.7;
        const h = size * (lines + (styleRef.current.bg ? 0.55 : 0.2));
        s.scale.set(h * aspect, h, 1);
      }
    };

    useImperativeHandle(ref, () => ({ setText: apply, get sprite() { return sprite.current; } }));
    useLayoutEffect(() => {
      apply(initial);
      return () => state.tex.dispose();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <sprite ref={sprite} renderOrder={overlay ? 10 : 2} {...rest}>
        <spriteMaterial
          map={state.tex}
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest={!overlay}
          toneMapped={false}
          color={[glow, glow, glow]}
          fog={false}
        />
      </sprite>
    );
  },
);
