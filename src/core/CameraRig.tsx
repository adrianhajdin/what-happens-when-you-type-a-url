"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SCENES } from "@/scenes";
import { locate, type Loc } from "@/lib/stages";
import { easeInOut } from "@/lib/math";
import { store } from "@/lib/store";
import { DEFAULT_FOV, type CameraPose, type StageModule } from "./types";
import { GLOBE_CENTER } from "@/scenes/globe/geo";

const OCEAN = SCENES.findIndex((s) => s.id === "ocean");

/** Set `snap` to jump straight to the target pose next frame (hard cuts in recorded video). */
export const rigControl = { snap: false };

const tmpIn = new THREE.Vector3();
const tmpOut = new THREE.Vector3();

function poseAt(m: StageModule, t: number, out: CameraPose) {
  if (m.camera) return m.camera(t, out);
  const u = easeInOut(t);
  out.position.lerpVectors(tmpIn.set(...m.cameraIn.position), tmpOut.set(...m.cameraOut.position), u);
  out.target.lerpVectors(tmpIn.set(...m.cameraIn.target), tmpOut.set(...m.cameraOut.target), u);
  out.fov = (m.cameraIn.fov ?? DEFAULT_FOV) + ((m.cameraOut.fov ?? DEFAULT_FOV) - (m.cameraIn.fov ?? DEFAULT_FOV)) * u;
}

/**
 * Stages are framed for landscape. On narrower screens keep roughly the same
 * horizontal coverage: dolly back from the target and widen the FOV a little
 * (a pure FOV fix would need ~85° on a phone and distort badly).
 */
const REF_ASPECT = 1.45;
function narrowFit(aspect: number) {
  const k = Math.max(1, REF_ASPECT / aspect);
  return { dolly: Math.pow(k, 0.62), fovBoost: Math.min(14, (k - 1) * 7) };
}

/**
 * Owns the camera. Inside a stage it follows that stage's camera(t); between
 * stages it eases from cameraOut(i) to cameraIn(i+1) along a lifted arc. A
 * light critically-damped follow smooths whatever the scroll scrub leaves.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const r = useRef({
    loc: { index: 0, t: 0, transitioning: false, u: 0 } as Loc,
    a: { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: DEFAULT_FOV } as CameraPose,
    b: { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: DEFAULT_FOV } as CameraPose,
    pos: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    fov: DEFAULT_FOV,
    axis: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    off: new THREE.Vector3(),
    init: false,
  });

  useFrame((_, dt) => {
    const s = r.current;
    const st = store();
    const loc = locate(st.progress, s.loc);
    const m = SCENES[loc.index];
    if (!loc.transitioning) {
      poseAt(m, loc.t, s.a);
    } else {
      poseAt(m, 1, s.a);
      poseAt(SCENES[loc.index + 1], 0, s.b);
      const u = easeInOut(loc.u);
      const dist = s.a.position.distanceTo(s.b.position);
      s.a.position.lerp(s.b.position, u);
      s.a.target.lerp(s.b.target, u);
      s.a.fov += (s.b.fov - s.a.fov) * u;
      s.a.position.y += Math.sin(Math.PI * u) * Math.min(dist * 0.12, 18);
    }

    // free orbit: only on the globe
    const o = st.orbit;
    if (loc.index === OCEAN && !loc.transitioning) {
      if (o.yaw || o.pitch) {
        s.off.subVectors(s.a.position, GLOBE_CENTER);
        s.off.applyAxisAngle(s.up, o.yaw);
        s.axis.crossVectors(s.off, s.up).normalize();
        s.off.applyAxisAngle(s.axis, o.pitch);
        s.a.position.copy(GLOBE_CENTER).add(s.off);
        s.off.subVectors(s.a.target, GLOBE_CENTER).applyAxisAngle(s.up, o.yaw).applyAxisAngle(s.axis, o.pitch);
        s.a.target.copy(GLOBE_CENTER).add(s.off);
      }
      if (!o.dragging) {
        const k = Math.exp(-dt * 0.5);
        o.yaw *= k;
        o.pitch *= k;
      }
    } else {
      o.yaw = 0;
      o.pitch = 0;
    }

    if (rigControl.snap) {
      rigControl.snap = false;
      s.init = false;
    }
    if (!s.init) {
      s.pos.copy(s.a.position);
      s.tgt.copy(s.a.target);
      s.fov = s.a.fov;
      s.init = true;
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    s.pos.lerp(s.a.position, k);
    s.tgt.lerp(s.a.target, k);
    s.fov += (s.a.fov - s.fov) * k;
    const fit = narrowFit(size.width / size.height);
    camera.position.copy(s.pos);
    if (fit.dolly > 1) camera.position.sub(s.tgt).multiplyScalar(fit.dolly).add(s.tgt);
    camera.lookAt(s.tgt);
    const fov = s.fov + fit.fovBoost;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, -2);

  return null;
}
