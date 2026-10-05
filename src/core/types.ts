import type { ComponentType } from "react";
import * as THREE from "three";
import { easeInOut, type Vec3 } from "@/lib/math";

export type CameraKey = { position: Vec3; target: Vec3; fov?: number };

export type CameraPose = { position: THREE.Vector3; target: THREE.Vector3; fov: number };

export type PacketPose = { position: THREE.Vector3; scale: number; visible: boolean };

/** Every stage module in src/scenes exports this shape. See SCENES.md. */
export type StageModule = {
  /** Rendered inside <Stage>, only while within ±1 of the active stage. */
  Scene: ComponentType<{ index: number }>;
  /** Camera pose at local t = 0 (where the incoming transition lands). */
  cameraIn: CameraKey;
  /** Camera pose at local t = 1 (where the outgoing transition starts). */
  cameraOut: CameraKey;
  /** Optional in-stage camera motion. Must equal cameraIn at t=0 and cameraOut at t=1. */
  camera?: (t: number, out: CameraPose) => void;
  /** Where the hero packet is at local t. Transitions interpolate packet(1) → next.packet(0). */
  packet?: (t: number, out: PacketPose) => void;
  /** Relative scroll length (mirrors STAGES[i].duration). */
  duration: number;
  /** GLBs this stage needs: preloaded on approach, cleared from cache 2+ stages later. */
  models?: string[];
};

export const DEFAULT_FOV = 45;

type Key = CameraKey & { t: number };

/** Keyframed camera: eased segments between poses. Allocation-free at runtime. */
export function cameraPath(keys: Key[]) {
  const ps = keys.map((k) => new THREE.Vector3(...k.position));
  const ts = keys.map((k) => new THREE.Vector3(...k.target));
  const fs = keys.map((k) => k.fov ?? DEFAULT_FOV);
  return {
    cameraIn: keys[0] as CameraKey,
    cameraOut: keys[keys.length - 1] as CameraKey,
    camera(t: number, out: CameraPose) {
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const a = keys[i].t;
      const b = keys[i + 1].t;
      const u = easeInOut(Math.min(1, Math.max(0, (t - a) / (b - a || 1))));
      out.position.lerpVectors(ps[i], ps[i + 1], u);
      out.target.lerpVectors(ts[i], ts[i + 1], u);
      out.fov = fs[i] + (fs[i + 1] - fs[i]) * u;
    },
  };
}
