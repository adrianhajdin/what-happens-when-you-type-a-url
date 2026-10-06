# What happens when you type a URL

A scroll-driven 3D journey of a single request to jsmastery.com: from your address bar through the browser and OS caches, recursive DNS, the TCP handshake and TLS 1.3, to a CDN edge in Frankfurt. There it's a cache miss, so the request crosses the Atlantic on the real Dunant submarine cable to an origin in Ashburn, then comes back as HTML that becomes a DOM, a CSSOM and finally a page.

**1.2 s. That's what just happened.**

![Stage 5: the packet on the Dunant cable](design/s5.png)

## The route

Rijeka → Frankfurt edge (DE-CIX) → **MISS** → Paris → Saint-Hilaire-de-Riez → **Dunant cable** (≈6,400 km, ≈33 ms one-way) → Virginia Beach → origin in Ashburn.

The edge comes before the ocean on purpose: anycast sends you to the nearest edge first, and only a cache miss crosses the ocean. Coordinates and latencies are approximate and marked as such in `src/lib/journey.ts`. On Vercel, European visitors start from their own city (geo-IP headers, no third-party lookup); everyone else starts from Rijeka.

## Stack

Next.js 15 (App Router, TypeScript, Turbopack) · React Three Fiber · drei · GSAP ScrollTrigger · zustand · leva (only with `?debug`).

Nothing else 3D: bloom is three's own `UnrealBloomPass`. The globe, cables, towers, packet and every label are procedural. The one modelled asset is the TLS padlock (Tripo image-to-3D).

## Performance

Full methodology and per-stage tables are in [PERF.md](PERF.md).

| | Before | After |
| --- | --- | --- |
| Padlock GLB | 67.0 MB Tripo export, 1.95 M triangles | **295 KB**, 20 k triangles (−99.6%) |
| JS a visitor downloads (gzip) | 529 KB | **474 KB** |
| Everything transferred, full journey | ~1.34 MB | **~0.83 MB** |
| Draw calls, DNS / TCP / render stages | 65 / 68 / 97 | **43 / 43 / 67** |
| Textures alive after a full journey | 68 (leak) | **22** |
| Main-thread work before the first frame | 154 ms | **26 ms** |

Every stage renders at 5–7 ms/frame on an M1 Pro at 1792×1344 with bloom (140–200 fps-equivalent). Rendering is on demand: when you stop scrolling, the GPU stops working.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and scroll.

| Flag | What it does |
| --- | --- |
| `?debug` | fps / draw calls / triangles / memory readout, leva panel (bloom + jump to stage), `window.__bench` |
| `?tier=low` / `?tier=high` | force the quality tier (auto-detected otherwise) |
| `?geo=0` | disable the geolocated starting city |
| `?video` | recording mode used by `npm run record` (no scroll, hints or hotspots; frame-by-frame on a virtual clock) |

### Record the shareable video

```bash
npm run build && npm start
npm run record                                              # full cut, 16:9
npm run record -- --cut short --width 1080 --height 1350    # ~40 s cut, 4:5
```

Writes `video/journey-<cut>-<w>x<h>.mp4` (H.264 1080p60 + AAC, X/Twitter-ready). Each video opens cold on the globe shot under a hook line, hard-cuts to typing, and carries an original soundtrack synthesised in `scripts/soundtrack.mjs` (pad, pulse, whooshes and event-synced blips; no samples, nothing to license). Pacing presets live at the top of `scripts/record-video.mjs`. `--audio-only` re-synthesises the soundtrack onto an existing file without re-rendering, and `--from/--to` renders part of the timeline silently for checks.

## How it's built

- `STORYBOARD.md` is the script; `design/` holds the reference stills each stage was matched against.
- `SCENES.md` documents the stage interface: each stage is one file exporting `{ Scene, cameraIn, cameraOut, camera?, packet?, duration, models? }`.
- `src/lib/stages.ts` is the registry: copy, hotspots, fog, the elapsed-ms budget and scroll ranges.
- `src/core/` holds the runtime: camera rig, hero packet, stage lifecycle (mount ±1, preload ahead, unload behind), shared world, bloom, the demand-frame driver and adaptive resolution.
- `scripts/extract-padlock.mjs` turns the Tripo diorama into a padlock-only GLB; then run `gltf-transform optimize` (command in the file header).

## Assets

- `design/*.png`: GPT Image reference stills (hero, s1–s6, s5 4:5 crop).
- `public/models/padlock.min.glb`: the only model (meshopt + WebP).
- `public/og.jpg`: the share image, cropped from `design/s5.png`.
- `raw-models/` (git-ignored): the uncompressed Tripo export.
