"use client";

import { forwardRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { flowMaterial } from "./materials";

type Props = {
  curve: THREE.Curve<THREE.Vector3>;
  color: THREE.Color;
  radius?: number;
  segments?: number;
  speed?: number;
  dash?: number;
  base?: number;
  opacity?: number;
  reveal?: number;
  /** Draw on (and flow) from the curve's end instead of its start. */
  flip?: boolean;
};

/**
 * A glowing data line along a curve: thin tube + flowing-dash shader.
 * The ref is the mesh; drive `material.uniforms.uReveal` to draw it on.
 */
export const FlowLine = forwardRef<THREE.Mesh, Props>(function FlowLine(
  { curve, color, radius = 0.06, segments = 64, speed, dash, base, opacity, reveal = 1, flip = false },
  ref,
) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, segments, radius, 6, false), [curve, segments, radius]);
  const mat = useMemo(() => flowMaterial(color, { speed, dash, base, opacity, flip }), [color, speed, dash, base, opacity, flip]);
  useEffect(() => {
    mat.uniforms.uReveal.value = reveal;
  }, [mat, reveal]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
});

/** Set reveal on a FlowLine mesh ref without React state. */
export function setReveal(mesh: THREE.Mesh | null, v: number) {
  if (!mesh) return;
  const m = mesh.material as THREE.ShaderMaterial;
  m.uniforms.uReveal.value = v;
  mesh.visible = v > 0.001;
}

export function setOpacity(mesh: THREE.Mesh | null, v: number) {
  if (!mesh) return;
  const m = mesh.material as THREE.ShaderMaterial;
  m.uniforms.uOpacity.value = v;
  mesh.visible = v > 0.001;
}
