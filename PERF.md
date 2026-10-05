# PERF

All numbers come from production builds (`next build --turbopack`, `next start`) on the same machine in the same session. BEFORE is commit `bb8d18f` (all 7 stages built, nothing optimized yet); AFTER is the optimization pass. Both builds served side by side and were benchmarked alternately.

**Machine:** MacBook Pro, Apple M1 Pro, Chrome (ANGLE / Metal).
**Desktop:** 1024×768 CSS px at DPR 1.75 (canvas 1792×1344), high tier.
**Mobile:** 375×812 viewport emulation, `?tier=low` (DPR 1, no reflections, ⅓-res bloom).

**How frame cost is measured:** `window.__bench` (in `?debug`) renders 90 frames back to back with `advance()`, forcing a GPU sync after each one, and reports the mean frame cost. This avoids rAF throttling and vsync caps; 1000 / ms gives the fps ceiling. Run-to-run noise on this machine is about ±15%.

> Not measured: a real mid-range phone with CPU/GPU throttling. The mobile row is the low tier on the same M1. Treat it as a ceiling and check the 30 fps floor on a real device before shipping.

## Headline

| | BEFORE | AFTER | Δ |
| --- | --- | --- | --- |
| Padlock GLB as exported by Tripo | **67.0 MB**, 1.95 M triangles | | |
| Padlock GLB shipped | 774 KB, 58 k tris, 3 textures | **295 KB**, 20 k tris, 1 texture | **−62%** (−99.6% vs the Tripo export) |
| JS a visitor downloads (gzip) | 529 KB | **474 KB** | **−10%** (leva now loads only in `?debug`) |
| Everything transferred, full journey | ~1.34 MB | **~0.83 MB** | **−38%** |
| Textures alive after the full journey, back at stage 0 | 68 | **22** | **−68%** (label-texture leak fixed) |
| Globe texture VRAM (land mask + lights) | ~89 MB | **~56 MB** | **−37%** |
| Padlock texture VRAM | ~16.8 MB (3 maps) | **~5.6 MB** (1 map) | **−67%** |
| Main-thread work on the loader's critical path | 154 ms (globe 104 + compile 50) | **26 ms** (compile; globe moved to idle) | **−83%** |

## Desktop: per stage

| Stage | Frame ms BEFORE | Frame ms AFTER | Draw calls BEFORE | Draw calls AFTER | Δ calls | Triangles BEFORE / AFTER |
| --- | --- | --- | --- | --- | --- | --- |
| 0 URL bar | 6.63 / 4.97 | 5.96 | 44 | 44 | 0% | 16.8 k / 16.8 k |
| 1 DNS | 5.11 / 5.27 | 5.72 | 65 | **43** | **−34%** | 17.3 k / 17.3 k |
| 2 TCP | 5.41 / 5.60 | 6.20 | 68 | **43** | **−37%** | 18.6 k / 18.6 k |
| 3 TLS | 5.91 / 5.00 | 6.15 | 61 | **42** | **−31%** | 19.9 k / 19.9 k |
| 4 Edge | 6.13 / 5.91 | 5.46 | 55 | **41** | **−25%** | 17.0 k / 17.0 k |
| 5 Ocean | 6.89 / 6.38 | 6.16 | 36 | 36 | 0% | 71.0 k / 71.0 k |
| 6 Render | 6.44 / 6.00 | 5.17 | 97 | **67** | **−31%** | 25.9 k / 25.9 k |

BEFORE was run twice; both runs are shown.

| Transition | Draw calls BEFORE → AFTER | Triangles BEFORE → AFTER |
| --- | --- | --- |
| 0 → 1 | 81 → 58 | 18.6 k → 18.6 k |
| 1 → 2 | 81 → 50 | 18.0 k → 18.2 k |
| 2 → 3 | 70 → 46 | 22.7 k → 22.7 k |
| 3 → 4 | 82 → 59 | 23.6 k → 21.7 k |
| 4 → 5 (fly up to space) | 26 → 26 | 5.1 k → 5.1 k |
| 5 → 6 (fly back down) | 25 → 27 | **47.1 k → 12.2 k** (globe LOD) |

**Frame time did not change.** Every stage costs 5–7 ms before and after, inside the noise band. On an M1 Pro this scene is bound by fill rate and bloom, not by draw calls, so cutting ~30% of calls doesn't show up here. That's the honest result. The call cuts are aimed at the devices that do pay per call (mobile drivers, integrated GPUs). Everything renders at 140–200 fps-equivalent, far above the 60 fps target.

## Mobile tier (375×812, `?tier=low`, same M1)

| Stage | Frame ms BEFORE | Frame ms AFTER | Draw calls BEFORE | Draw calls AFTER |
| --- | --- | --- | --- | --- |
| 0 URL bar | 1.79 | 1.54 | 32 | 32 |
| 1 DNS | 1.97 | 1.54 | 48 | 35 |
| 2 TCP | 2.13 | 1.66 | 54 | 36 |
| 3 TLS | 1.90 | 1.46 | 40 | 35 |
| 4 Edge | 2.14 | 1.66 | 43 | 38 |
| 5 Ocean | 1.92 | 1.90 | 29 | 26 |
| 6 Render | 2.28 | 1.72 | 28 | 28* |

\* An early AFTER run measured 42 because I had disabled frustum culling on the instanced tree; I fixed it (bounds now come from the fully grown tree).

## Load

| | BEFORE | AFTER |
| --- | --- | --- |
| Globe texture generation | 104 ms, **blocking the loader** | 82 ms, in `requestIdleCallback` after the first frame |
| Shader compile (`compileAsync`) | 50 ms | 26 ms |
| Assets on first paint | HTML 2.6 KB + CSS 3.1 KB + 2 fonts 52 KB + JS 529 KB | HTML 2.6 KB + CSS 3.1 KB + 2 fonts 52 KB + JS 474 KB |
| Loaded later, on approach to TLS | padlock 774 KB | padlock 295 KB |

The preview pane I measured in throttles timers, so wall-clock time-to-first-frame came out inflated and isn't reported. The numbers above are the real main-thread work on the critical path.

## What changed

1. **Padlock extracted offline** (`scripts/extract-padlock.mjs`). The Tripo export was the whole S3 reference image as one diorama (towers, tube, keys and padlock: 1.95 M triangles). The script keeps only the padlock's triangles (bounds measured from a vertex-density plot), drops the normal and metallic-roughness maps (it's rendered unlit with the neon baked into the base colour), then runs meshopt + WebP + 30% simplify.
2. **leva behind a dynamic import** that only loads with `?debug`.
3. **Label textures are reference-counted**, so stages unmount *and* free their text textures (68 → 22 textures after a full journey).
4. **Globe land mask at half resolution** (blurred anyway, no visible change). Generation moved off the loader to idle time after the first frame; it's done long before stage 4 mounts the globe.
5. **Batched towers**: every hero tower (DNS, canyon, edge fortress, bridge pillars) is now one `InstancedMesh` per LED density, plus one for its reflection, instead of two meshes per tower.
6. **Render-stage trees**: node boxes are instanced, and all connectors are one `LineSegments2` revealed via `instanceCount` in parse order (2 calls per tree instead of ~2 per node).
7. **Globe LOD**: 160×120 sphere only within 6 radii; 48×32 during the fly-in and fly-out.
8. **No per-frame allocations in the frame loops**: URL typing uses precomputed prefixes; the TTL chip and latency readout rebuild their strings only when the number on screen changes; `forEach` closures in `useFrame` replaced by loops; the address-bar texture compares fields instead of building a key string.
9. **Already in place before this pass:** `frameloop="demand"` (renders only while scrolling, dragging, settling for 1.4 s, or on the landing intro); stages mounted only within ±1 of the active one; GLBs preloaded two stages ahead and cache-cleared two stages behind.

## Tradeoffs (flagged, not silent)

- **Bloom stays.** It's the single most expensive pass and the main thing the art direction depends on. It already runs at ½ resolution (high tier) or ⅓ (low tier). Dropping it entirely on low tier would be the next lever if a real phone misses 30 fps.
- **Padlock texture stays at 1024²**, even though the padlock uses only part of the atlas. Cropping UVs to the used region would save roughly another 100–150 KB; not done.
