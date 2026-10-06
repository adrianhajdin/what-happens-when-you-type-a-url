/**
 * Records the whole journey as a shareable MP4, auto-scrolled at a natural pace.
 *
 *   npm run build && npm start            # production server on :3000 (or pass --url)
 *   node scripts/record-video.mjs         # → video/journey-1080p60.mp4
 *
 * Options: --url http://localhost:3000  --width 1920 --height 1080  --fps 60
 *          --out video/journey-1080p60.mp4  --from 0 --to <seconds> (partial renders)
 *
 * How: the page runs in ?video mode (frameloop "never", no hints/hotspots). This
 * script patches performance.now with a virtual clock, then for every output
 * frame advances the clock by 1/fps, sets the scroll progress from the pacing
 * curve below, renders one frame and screenshots it (HUD included). Render speed
 * doesn't matter: playback is exactly real time.
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const URL_ = arg("url", "http://localhost:3000");
const W = +arg("width", 1920);
const H = +arg("height", 1080);
const FPS = +arg("fps", 60);
const OUT = arg("out", `video/journey-${H}p${FPS}.mp4`);
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

/* ------------------------------ pacing ------------------------------ */
// Seconds on screen per stage, and per fly-over between stages.
const HEAD = 2.2; // hold on the empty address bar
const STAGE_S = [6.5, 8.5, 5.5, 8.0, 5.5, 11.0, 10.0]; // URL, DNS, TCP, TLS, Edge, Ocean, Render
const FLY_S = [1.6, 1.8, 1.4, 1.8, 3.0, 3.0]; // the two globe flights are long
const TAIL = 4.0; // hold on "1.2 s. That's what just happened."

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
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  m[0] = 0;
  m[n - 1] = 0;
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
  const xs = [0, HEAD];
  const ys = [0, 0];
  let t = HEAD;
  ranges.forEach((r, i) => {
    // midpoint key keeps each stage's speed steady instead of sagging between boundaries
    t += STAGE_S[i] / 2;
    xs.push(t);
    ys.push((r.start + r.end) / 2);
    t += STAGE_S[i] / 2;
    xs.push(t);
    ys.push(r.end);
    if (i < ranges.length - 1) {
      t += FLY_S[i];
      xs.push(t);
      ys.push(ranges[i + 1].start);
    }
  });
  xs.push(t + TAIL);
  ys.push(1);
  return { at: pchip(xs, ys), duration: t + TAIL };
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
await page.evaluate(() => window.__video.ready());
const ranges = await page.evaluate(() => window.__video.ranges);
await page.evaluate(() => {
  window.__virtual.t = performance.now();
  window.__virtual.on = true;
});

const { at, duration } = timeline(ranges);
const from = +arg("from", 0);
const to = Math.min(+arg("to", duration), duration);
const frames = Math.round((to - from) * FPS);
console.log(`duration ${duration.toFixed(1)} s · rendering ${from}–${to.toFixed(1)} s · ${frames} frames · ${W}×${H}@${FPS}`);

mkdirSync(dirname(OUT), { recursive: true });
const ff = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    // JPEG frames are full-range: convert to TV range or X/YouTube show grey blacks
    "-vf", "scale=in_range=full:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "12M", "-bufsize", "24M", "-profile:v", "high",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-an", "-r", String(FPS), OUT],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const cdp = await page.createCDPSession();
const dt = 1000 / FPS;
// settle: run up to the first frame's position so damping/trails start in place
const p0 = at(from);
for (let i = 0; i < 30; i++) await page.evaluate((p, d) => window.__video.frame(p, d), p0, dt);

const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const p = at(from + f / FPS);
  await page.evaluate((p, d) => window.__video.frame(p, d), p, dt);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 94, optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % (FPS * 5) === 0) {
    const el = (Date.now() - t0) / 1000;
    const eta = f ? (el / f) * (frames - f) : 0;
    console.log(`frame ${f}/${frames} · video ${(from + f / FPS).toFixed(1)} s · elapsed ${el.toFixed(0)} s · eta ${eta.toFixed(0)} s`);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`wrote ${OUT}`);
