# Scenes: the stage interface

Every stage is one file in `src/scenes/StageN*.tsx`, exporting a `StageModule` (see `src/core/types.ts`). Scroll position is the only clock: there are no time-based animations on the critical path, so everything scrubs forwards and backwards.

```ts
type StageModule = {
  Scene: ComponentType<{ index: number }>; // what to render
  cameraIn: CameraKey;   // pose at local t = 0 (where the incoming fly-over lands)
  cameraOut: CameraKey;  // pose at local t = 1 (where the outgoing fly-over starts)
  camera?: (t, out: CameraPose) => void; // in-stage camera; must match In/Out at 0/1
  packet?: (t, out: PacketPose) => void; // where the hero packet is
  duration: number;      // relative scroll length (mirrors STAGES[i].duration)
  models?: string[];     // GLBs: preloaded on approach, cache-cleared when far
};
```

`cameraPath([{ t, position, target, fov }, ...])` builds `cameraIn`, `cameraOut` and `camera` from keyframes, with eased segments and no allocations.

## Timeline

`src/lib/stages.ts` is the registry: titles, concept copy, hotspots, fog density, the elapsed-ms budget per stage, and the scroll ranges.

```
| stage 0 | fly | stage 1 | fly | ... | stage 6 |
  duration  TRANSITION (0.55 units)
```

- `locate(p, out)` maps global progress to `{ index, t, transitioning, u }` without allocating.
- `stageT(i, p)` gives the local t of stage i: 0 before it, 1 after it. Stage scenes read it inside `useFrame` from `store().progress`, never through React state.
- `ScrollDriver` scrubs one GSAP tween of `progress` 0→1 across a `SCROLL_VH`-tall track.

## Runtime pieces (src/core)

| File | Role |
| --- | --- |
| `CameraRig` | The only owner of the camera. In a stage: `camera(t)`. Between stages: eases `cameraOut(i)` → `cameraIn(i+1)` on a lifted arc. Light damping on top. Free-orbit offset only on the globe stage. |
| `HeroPacket` | The protagonist. Uses `packet(t)` of the active stage; in transitions it flies `packet(1)` → `next.packet(0)`. |
| `Packet` | Emissive core + halo + spring-chain trail (preallocated `Float32Array`). Progress-based API: `followPath(curve, t)`, `setPosition`, `setVisible`, `setScale`. Stages use extra instances for SYN-ACK, subresources, etc. |
| `Stage` | Mounts a stage only within ±1 of the active one, hides it unless on screen, preloads its GLBs two stages ahead, and calls `useGLTF.clear` once it's 2+ stages away. Scenes dispose their own GPU resources on unmount (`disposeObject`). |
| `SharedSet` | The same lifecycle for a set shared by several stages (the canyon for TCP and TLS). |
| `World` | Shared environment: semi-transparent wet floor (shader grid, canyon hole, shoreline), mirrored towers underneath as reflections, instanced city (1 draw call + 1 for reflections), skyline, ocean, dust, stars, moon. It also drives fog density per stage. |
| `Effects` | Bloom using three's own `UnrealBloomPass`, run at 1/2 (high tier) or 1/3 (low tier) resolution, with the composer target MSAA'd on the high tier. |
| `FrameDriver` | `frameloop="demand"`: renders only while scrolling, dragging, settling (1.4 s) or on the landing intro. |
| `Label` / `DynamicLabel` | Canvas-texture text sprites (no font downloads, cached by content). |
| `Tower` | One shared unit box and cached shader materials, so every tower in the app shares geometry and programs. |
| `Hotspots` | Clickable rings, data-driven from `STAGES[i].hotspots`; the HUD renders the card. |

## Rules for a new stage

1. Read local progress with `stageT(INDEX, store().progress)` inside `useFrame`. Use `useState` only for rare discrete changes, such as the status of a cache block.
2. No allocations in `useFrame`: hoist vectors into `useMemo` / module scope.
3. Reuse shared materials (`sharedTowerMaterial`, `TIME`) and `UNIT_BOX`. Dispose anything you create in `useMemo` on unmount.
4. Make `packet(1)` of your stage and `packet(0)` of the next one sit sensibly close; the transition interpolates between them.
5. Add copy and hotspots to `src/lib/stages.ts`, not to the scene.

## Debugging

`?debug` shows renderer counters (fps, draw calls, triangles, geometries, textures, programs), the leva panel (bloom and jump-to-stage) and `window.__perf`. `?tier=low|high` forces a quality tier, and `?geo=0` disables the geolocated origin.
