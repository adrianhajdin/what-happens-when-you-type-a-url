/**
 * An original soundtrack, synthesised sample by sample — no samples, no
 * licensing. Everything is placed from an event list the recorder derives
 * from the same pacing curve as the picture, so sound and image stay locked.
 *
 * Layers:
 *   pad     additive, detuned chord per stage (A minor world), filter opens on the globe
 *   pulse   soft sub kick from the packet's birth to the finale
 *   whoosh  band-passed noise sweep on every camera fly-over
 *   sfx     keystrokes, blips (hops / packets), MISS buzzer, lock click, pops, impacts
 */
import { writeFileSync } from "node:fs";

const SR = 48000;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// One chord per stage: URL, DNS, TCP, TLS, Edge, Ocean, Render
const CHORDS = [
  [45, 52, 59, 60], // Am(add9)
  [41, 48, 55, 57], // Fmaj7
  [48, 55, 59, 62], // Cmaj7(9)
  [43, 50, 57, 59], // G(add9)
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57, 64], // Fmaj7 (wide, the hero shot)
  [45, 52, 59, 60, 64], // Am(add9), resolves
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function renderSoundtrack({ duration, events, stageStarts, pulseFrom, pulseTo, bpm = 100 }) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = rng(7);

  /* ---------------- pad ---------------- */
  // each stage's chord fades in over 1.2 s and out over 1.6 s into the next
  const segs = stageStarts.map((t, i) => ({ chord: CHORDS[i % CHORDS.length], from: t, to: stageStarts[i + 1] ?? duration }));
  segs[0].from = 0;
  for (const seg of segs) {
    const a = Math.max(0, Math.floor((seg.from - 0.6) * SR));
    const b = Math.min(n, Math.floor((seg.to + 1.6) * SR));
    seg.chord.forEach((note, vi) => {
      const f = midi(note);
      const det = [Math.pow(2, 4 / 1200), Math.pow(2, -4 / 1200)];
      const ph = [0, 0];
      for (let i = a; i < b; i++) {
        const t = i / SR;
        const fadeIn = Math.min(1, (t - (seg.from - 0.6)) / 1.2);
        const fadeOut = Math.min(1, (seg.to + 1.6 - t) / 1.6);
        const env = Math.max(0, Math.min(fadeIn, fadeOut));
        if (env <= 0) continue;
        for (let c = 0; c < 2; c++) {
          ph[c] += (2 * Math.PI * f * det[c]) / SR;
          let s = 0;
          for (let h = 1; h <= 5; h++) s += Math.sin(ph[c] * h) / Math.pow(h, 1.4);
          const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * (0.13 + vi * 0.05) * t + vi);
          const v = s * env * trem * 0.028;
          if (c === 0) L[i] += v;
          else R[i] += v;
        }
      }
    });
  }
  // gentle low-pass over the pad; opens up during the ocean stage
  const oceanFrom = stageStarts[5] ?? 0;
  const oceanTo = stageStarts[6] ?? 0;
  let zl = 0;
  let zr = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const open = t > oceanFrom - 1 && t < oceanTo ? 1 : 0;
    const fc = 900 + open * 2200;
    const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    zl += (L[i] - zl) * k;
    zr += (R[i] - zr) * k;
    L[i] = zl;
    R[i] = zr;
  }

  /* --------------- helpers --------------- */
  const add = (t0, len, fn, pan = 0) => {
    const a = Math.max(0, Math.floor(t0 * SR));
    const b = Math.min(n, a + Math.floor(len * SR));
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = a; i < b; i++) {
      const v = fn((i - a) / SR, i);
      L[i] += v * gl * 1.4;
      R[i] += v * gr * 1.4;
    }
  };
  const blip = (t, f, gain = 0.16, decay = 0.12, pan = 0) =>
    add(t, decay * 5, (x) => (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(4 * Math.PI * f * x)) * Math.exp(-x / decay) * gain * Math.min(1, x * 400), pan);
  const kick = (t, gain = 0.5) =>
    add(t, 0.45, (x) => {
      const f = 45 + 55 * Math.exp(-x / 0.05);
      return Math.sin(2 * Math.PI * f * x) * Math.exp(-x / 0.16) * gain;
    });
  // state-variable band-pass noise sweep
  // airy, not hissy: band-pass sweep, then a gentle 4.5 kHz low-pass on top
  const sweep = (t, len, f0, f1, gain) => {
    let lp = 0;
    let bp = 0;
    let smooth = 0;
    const k = 1 - Math.exp((-2 * Math.PI * 4500) / SR);
    add(t, len, (x) => {
      const u = x / len;
      const fc = f0 * Math.pow(f1 / f0, u);
      const F = 2 * Math.sin((Math.PI * fc) / SR);
      const hp = noise() * 2 - 1 - lp - 0.9 * bp;
      bp += F * hp;
      lp += F * bp;
      smooth += (bp - smooth) * k;
      return smooth * Math.pow(Math.sin(Math.PI * u), 2) * gain * 0.5;
    });
  };

  /* ---------------- pulse ---------------- */
  const beat = 60 / bpm;
  for (let t = pulseFrom; t < pulseTo; t += beat) kick(t, 0.28);

  /* ---------------- events ---------------- */
  for (const e of events) {
    switch (e.type) {
      case "key":
        // soft mechanical tick: noise burst through a one-pole low-pass
        {
          let z = 0;
          add(e.t, 0.03, (x) => {
            z += (noise() * 2 - 1 - z) * 0.35;
            return z * Math.exp(-x / 0.006) * 0.16;
          }, (noise() - 0.5) * 0.6);
        }
        break;
      case "blip":
        blip(e.t, e.f ?? 1400, e.gain ?? 0.14, e.decay ?? 0.12, e.pan ?? 0);
        break;
      case "pop":
        blip(e.t, e.f ?? 900, 0.08, 0.05, e.pan ?? 0);
        break;
      case "miss":
        blip(e.t, 466, 0.16, 0.08);
        blip(e.t + 0.12, 349, 0.18, 0.12);
        break;
      case "chime":
        [0, 0.07, 0.14].forEach((d, i) => blip(e.t + d, [1318, 1568, 1976][i], 0.1, 0.35));
        break;
      case "lock":
        blip(e.t, 2637, 0.12, 0.04);
        blip(e.t + 0.03, 3951, 0.08, 0.05);
        kick(e.t, 0.45);
        break;
      case "whoosh":
        sweep(e.t, e.len, e.up === false ? 3200 : 260, e.up === false ? 260 : 3200, e.gain ?? 0.22);
        break;
      case "riser":
        sweep(e.t, e.len, 200, 6000, 0.18);
        break;
      case "hit":
        kick(e.t, 0.7);
        sweep(e.t, 0.6, 5000, 400, 0.12);
        break;
      case "boom":
        add(e.t, 3.5, (x) => {
          const f = 38 + 72 * Math.exp(-x / 0.25);
          return Math.sin(2 * Math.PI * f * x) * Math.exp(-x / 1.1) * 0.6;
        });
        sweep(e.t, 2.4, 6000, 900, 0.07);
        [2637, 3136, 3951].forEach((f, i) => blip(e.t + 0.05 * i, f, 0.05, 0.9));
        break;
    }
  }

  /* ---------------- master ---------------- */
  let peak = 0;
  for (let i = 0; i < n; i++) {
    L[i] = Math.tanh(L[i] * 1.2);
    R[i] = Math.tanh(R[i] * 1.2);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (peak || 1); // -1 dBFS
  const fadeOut = Math.floor(1.0 * SR);
  for (let i = 0; i < n; i++) {
    const f = i > n - fadeOut ? (n - i) / fadeOut : 1;
    const fi = Math.min(1, i / (0.02 * SR));
    L[i] *= g * f * fi;
    R[i] *= g * f * fi;
  }
  return [L, R];
}

export function writeWav(path, [L, R]) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
}
