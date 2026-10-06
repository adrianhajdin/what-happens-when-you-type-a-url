import { create } from "zustand";
import type { LatLng } from "./journey";
import { EXAMPLE, type Journey } from "./live";

export type Tier = "high" | "low";

export type Origin = LatLng & { city: string; geolocated: boolean };

type State = {
  /** Global scroll progress 0..1 (already smoothed by the ScrollTrigger scrub). Read via getState() inside useFrame. */
  progress: number;
  /** Stage currently owning the screen. Reactive, changes rarely. */
  stage: number;
  hotspot: string | null;
  debug: boolean;
  /** ?video: offline recording mode (no scroll, no hotspots, virtual clock). */
  video: boolean;
  tier: Tier;
  /** Loading screen. */
  loaded: number;
  ready: boolean;
  origin: Origin;
  /** performance.now() of the last thing that needs frames (scroll, drag, hover). */
  lastActivity: number;
  /** The request being told: the scripted example, or a live trace of a typed URL. */
  journey: Journey;
  trace: { status: "idle" | "loading" | "error"; message?: string; host?: string };
  /** Text being typed into the 3D address bar (null when not editing). */
  draft: string | null;
  /** Free-orbit offset for the globe stage, radians. Mutated in place. */
  orbit: { yaw: number; pitch: number; dragging: boolean };
  set: (s: Partial<State>) => void;
  poke: () => void;
};

export const DEFAULT_ORIGIN: Origin = { city: "Rijeka", lat: 45.327, lng: 14.442, geolocated: false };

export const useStore = create<State>((set) => ({
  progress: 0,
  stage: 0,
  hotspot: null,
  debug: false,
  video: false,
  tier: "high",
  loaded: 0,
  ready: false,
  origin: DEFAULT_ORIGIN,
  lastActivity: 0,
  orbit: { yaw: 0, pitch: 0, dragging: false },
  journey: EXAMPLE,
  trace: { status: "idle" },
  draft: null,
  set: (s) => set(s),
  poke: () => set({ lastActivity: performance.now() }),
}));

/** Non-reactive accessor for frame loops. */
export const store = () => useStore.getState();

/** The journey being told (reactive). */
export const useJourney = () => useStore((s) => s.journey);
