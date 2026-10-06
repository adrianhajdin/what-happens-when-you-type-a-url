/**
 * Records the journey as a shareable MP4 with an original synthesised soundtrack.
 *
 *   npm run build && npm start                 # production server on :3000 (or pass --url)
 *   node scripts/record-video.mjs              # → video/journey-full-1920x1080.mp4
 *   node scripts/record-video.mjs --cut short --width 1080 --height 1350
 *
 * Options:
 *   --cut full|short     pacing preset (~72 s / ~38 s)
 *   --width/--height     1920×1080 (16:9) or 1080×1350 (4:5) …
 *   --fps 60             --url http://localhost:3000   --out <file>
 *   --from/--to <s>      render part of the timeline (silent; for checks)
 *   --no-audio           picture only
 *   --audio-only         re-synthesise the soundtrack and re-mux onto an existing --out (no re-render)
 *
 * How: the page runs in ?video mode (frameloop "never", no hints/hotspots). This
 * script patches performance.now with a virtual clock, and for every output frame
 * advances it by 1/fps, sets the scroll progress from the pacing curve, renders one
 * frame and screenshots it (HUD included). Playback is exactly real time however
 * slow capture is. The soundtrack is placed from the same curve, so it stays in sync.
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { renderSoundtrack, writeWav } from "./soundtrack.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes(`--${name}`);
const URL_ = arg("url", "http://localhost:3000");
const W = +arg("width", 1920);
const H = +arg("height", 1080);
const FPS = +arg("fps", 60);
const CUT = arg("cut", "full");
const OUT = arg("out", `video/journey-${CUT}-${W}x${H}.mp4`);
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

/* ------------------------------ pacing ------------------------------ */
// Seconds per stage (URL, DNS, TCP, TLS, Edge, Ocean, Render) and per fly-over between them.
const PRESETS = {
  full: { head: 0.3, stages: [6.5, 8.5, 5.5, 8.0, 5.5, 11.0, 10.0], flies: [1.6, 1.8, 1.4, 1.8, 3.0, 1.0], tail: 4.0 },
  short: { head: 0.2, stages: [3.6, 3.6, 2.6, 4.4, 3.0, 6.0, 5.6], flies: [0.9, 1.0, 0.8, 1.0, 1.8, 0.8], tail: 2.8 },
};
const P = PRESETS[CUT];
if (!P) throw new Error(`unknown --cut ${CUT}`);

/** Cold open: the hero shot under a hook line, then a hard cut to the typing. */
const COLD = 1.7;
const COLD_FROM_T = 0.36; // ocean-stage local progress at the start / end of the cold open
const COLD_TO_T = 0.5;
const HOOK = { title: "What actually happens when you type a URL?", sub: "1.2 seconds. In 3D." };

/** Monotone cubic (Fritsch–Carlson): smooth speed changes, never scrolls backwards, flat on holds. */
function pchip(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = xs[i + 1] - xs[i] + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function timeline(ranges) {
  const xs = [0, P.head];
  const ys = [0, 0];
  let t = P.head;
  ranges.forEach((r, i) => {
    t += P.stages[i] / 2; // midpoint key keeps each stage's speed steady
    xs.push(t);
    ys.push((r.start + r.end) / 2);
    t += P.stages[i] / 2;
    xs.push(t);
    ys.push(r.end);
    if (i < ranges.length - 1) {
      t += P.flies[i];
      xs.push(t);
      ys.push(ranges[i + 1].start);
    }
  });
  xs.push(t + P.tail);
  ys.push(1);
  const main = pchip(xs, ys);
  const mainDuration = t + P.tail;
  const ocean = ranges[5];
  const coldP = (u) => ocean.start + (ocean.end - ocean.start) * (COLD_FROM_T + (COLD_TO_T - COLD_FROM_T) * u);
  return {
    duration: COLD + mainDuration,
    /** progress at video time τ */
    at: (tau) => (tau < COLD ? coldP(tau / COLD) : main(tau - COLD)),
    /** video time at which stage i reaches local progress lt (inverse of the curve) */
    timeOf(i, lt) {
      const p = ranges[i].start + (ranges[i].end - ranges[i].start) * lt;
      let lo = 0;
      let hi = mainDuration;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (main(mid) < p) lo = mid;
        else hi = mid;
      }
      return COLD + hi;
    },
  };
}

/* ----------------------------- sound map ---------------------------- */
// Local-progress beats, mirrored from the stage files (src/scenes/Stage*.tsx).
function soundEvents(tl) {
  const ev = [];
  const at = (i, lt) => tl.timeOf(i, lt);
  // cold open: riser into the cut, impact on the cut
  ev.push({ type: "riser", t: COLD - 1.25, len: 1.25 }, { type: "hit", t: COLD });
  // 0 · URL: ten keystrokes, enter, two cache MISSes, the packet is born and drops
  for (let k = 1; k <= 10; k++) ev.push({ type: "key", t: at(0, 0.06 + (0.28 * (k - 0.5)) / 10) });
  ev.push({ type: "blip", t: at(0, 0.38), f: 1760, gain: 0.12 });
  ev.push({ type: "miss", t: at(0, 0.56) }, { type: "miss", t: at(0, 0.7) });
  ev.push({ type: "blip", t: at(0, 0.74), f: 880, decay: 0.4, gain: 0.16 });
  ev.push({ type: "whoosh", t: at(0, 0.84), len: Math.max(0.3, at(0, 1) - at(0, 0.84)), up: false, gain: 0.12 });
  // 1 · DNS: one blip per hop, queries high, answers lower, the final answer brightest
  for (let k = 1; k <= 8; k++) {
    const answer = k === 3 || k === 5 || k === 7 || k === 8;
    ev.push({ type: "blip", t: at(1, 0.04 + (0.86 * k) / 8), f: answer ? 1046 + k * 40 : 1568 + k * 60, gain: k === 8 ? 0.18 : 0.12, pan: k % 2 ? -0.4 : 0.4 });
  }
  ev.push({ type: "chime", t: at(1, 0.9) });
  // 2 · TCP: SYN, SYN-ACK, ACK arrive; connection established
  ev.push({ type: "blip", t: at(2, 0.36), f: 1318, pan: 0.5 }, { type: "blip", t: at(2, 0.66), f: 1046, pan: -0.5 }, { type: "blip", t: at(2, 0.94), f: 1318, pan: 0.5 });
  ev.push({ type: "chime", t: at(2, 0.95) });
  // 3 · TLS: hello arrives, server answers, three certificate checks, the lock snaps shut
  ev.push({ type: "blip", t: at(3, 0.26), f: 1568, pan: 0.5 }, { type: "blip", t: at(3, 0.5), f: 1174, pan: -0.5 });
  for (let k = 0; k < 3; k++) ev.push({ type: "pop", t: at(3, 0.5 + k * 0.02 + 0.005), f: 1760 + k * 220 });
  ev.push({ type: "lock", t: at(3, 0.735) }, { type: "chime", t: at(3, 0.86) });
  // 4 · Edge: arrive, cache MISS, gate opens
  ev.push({ type: "blip", t: at(4, 0.2), f: 1318 }, { type: "miss", t: at(4, 0.44) }, { type: "whoosh", t: at(4, 0.5), len: 0.6, gain: 0.14 });
  // 5 · Ocean: dive into the cable, land in Virginia, reach the origin
  ev.push({ type: "whoosh", t: at(5, 0.15), len: 0.9, up: false, gain: 0.16 });
  ev.push({ type: "blip", t: at(5, 0.86), f: 1046, decay: 0.3 }, { type: "chime", t: at(5, 0.92) });
  // 6 · Render: DOM nodes pop in parse order, CSSOM, the page snaps together, the finale
  for (let k = 0; k < 13; k++) ev.push({ type: "pop", t: at(6, 0.14 + k * 0.028 + 0.02), f: 700 + k * 45, pan: 0.4 });
  for (let k = 0; k < 5; k++) ev.push({ type: "pop", t: at(6, 0.4 + k * 0.03 + 0.02), f: 1100 + k * 60, pan: -0.4 });
  for (let k = 0; k < 11; k++) ev.push({ type: "pop", t: at(6, 0.7 + (k / 11) * 0.12 + 0.03), f: 520 + k * 30 });
  ev.push({ type: "boom", t: at(6, 0.9) });
  // fly-overs
  for (let i = 0; i < 6; i++) {
    const a = at(i, 1);
    const b = at(i + 1, 0);
    ev.push({ type: "whoosh", t: a - 0.15, len: b - a + 0.3, gain: i === 4 ? 0.26 : 0.2 });
  }
  return ev;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function muxAudio(tl, ranges, videoPath) {
  const wav = OUT.replace(/\.mp4$/, ".wav");
  const stageStarts = ranges.map((_, i) => (i === 0 ? COLD : tl.timeOf(i, 0)));
  const tracks = renderSoundtrack({
    duration: tl.duration,
    events: soundEvents(tl),
    stageStarts,
    pulseFrom: tl.timeOf(0, 0.74),
    pulseTo: tl.timeOf(6, 0.9) - 0.05,
  });
  writeWav(wav, tracks);
  const tmp = OUT + ".mux.mp4";
  await ffmpeg(["-i", videoPath, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmp]);
  renameSync(tmp, OUT);
  rmSync(wav);
}

/* ------------------------------ capture ----------------------------- */

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--hide-scrollbars", "--mute-audio", `--window-size=${W},${H}`],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.evaluateOnNewDocument(() => {
  const real = performance.now.bind(performance);
  const v = { on: false, t: 0 };
  window.__virtual = v;
  performance.now = () => (v.on ? v.t : real());
});
await page.goto(`${URL_}/?video&tier=high&geo=0`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.__video, { timeout: 60000 });
const ranges = await page.evaluate(() => window.__video.ranges);
const tl = timeline(ranges);

if (flag("audio-only")) {
  await browser.close();
  if (!existsSync(OUT)) throw new Error(`${OUT} not found`);
  const tmp = OUT + ".video.mp4";
  await ffmpeg(["-i", OUT, "-map", "0:v", "-c:v", "copy", tmp]);
  await muxAudio(tl, ranges, tmp);
  rmSync(tmp);
  console.log(`re-muxed audio onto ${OUT}`);
  process.exit(0);
}

await page.evaluate(() => window.__video.ready());
await page.evaluate(() => {
  window.__virtual.t = performance.now();
  window.__virtual.on = true;
});

const from = +arg("from", 0);
const to = Math.min(+arg("to", tl.duration), tl.duration);
const frames = Math.round((to - from) * FPS);
const partial = from > 0 || to < tl.duration;
console.log(`${CUT} cut · ${tl.duration.toFixed(1)} s · rendering ${from}–${to.toFixed(1)} s · ${frames} frames · ${W}×${H}@${FPS}`);

mkdirSync(dirname(OUT), { recursive: true });
const silent = flag("no-audio") || partial; // audio is laid against the full timeline only
const videoOnly = silent ? OUT : OUT + ".video.mp4";
const ff = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    // JPEG frames are full-range: convert to TV range or X/YouTube show grey blacks
    "-vf", "scale=in_range=full:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "12M", "-bufsize", "24M", "-profile:v", "high",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-an", "-r", String(FPS), videoOnly],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const cdp = await page.createCDPSession();
const dt = 1000 / FPS;
const hookOpacity = (tau) => (tau >= COLD ? 0 : Math.max(0, Math.min(1, tau / 0.25, (COLD - tau) / 0.2)));

// settle at the first frame's position so damping and trails start in place
for (let i = 0; i < 40; i++) await page.evaluate((p, d) => window.__video.frame(p, d, { cut: true }), tl.at(from), dt);

const t0 = Date.now();
let prevCold = from < COLD;
for (let f = 0; f < frames; f++) {
  const tau = from + f / FPS;
  const cold = tau < COLD;
  const o = hookOpacity(tau);
  await page.evaluate((hook, o) => window.__video.overlay(o > 0 ? { ...hook, opacity: o } : null), HOOK, o);
  // hard cut out of the cold open: snap the camera instead of flying across the world
  await page.evaluate((p, d, cut) => window.__video.frame(p, d, { cut }), tl.at(tau), dt, prevCold && !cold);
  prevCold = cold;
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 94, optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % (FPS * 5) === 0) {
    const el = (Date.now() - t0) / 1000;
    const eta = f ? (el / f) * (frames - f) : 0;
    console.log(`frame ${f}/${frames} · video ${tau.toFixed(1)} s · elapsed ${el.toFixed(0)} s · eta ${eta.toFixed(0)} s`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();

if (!silent) {
  await muxAudio(tl, ranges, videoOnly);
  rmSync(videoOnly);
}
console.log(`wrote ${OUT}`);
