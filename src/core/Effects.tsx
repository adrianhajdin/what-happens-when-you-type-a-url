"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useStore, store } from "@/lib/store";

export const BLOOM = { strength: 1.1, radius: 0.25, threshold: 0.9 };

/**
 * Bloom from three's own examples (no extra post-processing dependency).
 * The bloom chain runs at a fraction of the canvas resolution: it is blur,
 * so nobody can tell, and it is the most expensive pass in the frame.
 */
export function Effects() {
  const { gl, scene, camera, size } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  const tier = useStore((s) => s.tier);
  const scale = tier === "high" ? 0.5 : 0.33;

  const { composer, bloom } = useMemo(() => {
    // MSAA on the composer target (the canvas itself has antialias off: post-processing would discard it)
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier === "high" ? 4 : 0 });
    const composer = new EffectComposer(gl, rt);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    // Weight the small mips: tight neon glow instead of a full-screen haze.
    bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.75, 0.35, 0.12, 0.04];
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
  }, [gl, scene, camera, tier]);

  useEffect(() => {
    const base = bloom.setSize.bind(bloom);
    bloom.setSize = (w: number, h: number) => base(Math.round(w * scale), Math.round(h * scale));
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    return () => {
      bloom.setSize = base;
    };
  }, [composer, bloom, size, dpr, scale]);

  useEffect(() => () => composer.dispose(), [composer]);

  useEffect(() => {
    if (store().debug) (window as unknown as { __bloom: typeof BLOOM }).__bloom = BLOOM;
  }, []);

  useFrame(() => {
    bloom.strength = BLOOM.strength;
    bloom.radius = BLOOM.radius;
    bloom.threshold = BLOOM.threshold;
    composer.render();
  }, 1);

  return null;
}
