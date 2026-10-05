"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BRIDGES, CLIENT, CZ, SERVER, TOWER_H, reversed } from "./parts/Canyon";
import { Packet, type PacketHandle } from "@/core/Packet";
import { DynamicLabel, Label, type DynamicLabelHandle } from "@/core/Label";
import { FlowLine, setReveal } from "@/core/FlowLine";
import { COLORS, HEX } from "@/core/materials";
import { cameraPath, type StageModule } from "@/core/types";
import { STAGES, stageT } from "@/lib/stages";
import { remap } from "@/lib/math";
import { store } from "@/lib/store";

const INDEX = 2;

const ISN_C = 2847193600;
const ISN_S = 1093847261;

/** The three-way handshake, staggered along the stage. */
const STEPS = [
  { id: "syn", from: 0.08, to: 0.36, bridge: 0, dir: 1, color: COLORS.cyan, text: "SYN →", sub: `seq=${ISN_C}` },
  { id: "synack", from: 0.38, to: 0.66, bridge: 1, dir: -1, color: COLORS.magenta, text: "← SYN-ACK", sub: `seq=${ISN_S}  ack=${ISN_C + 1}` },
  { id: "ack", from: 0.68, to: 0.94, bridge: 2, dir: 1, color: COLORS.cyan, text: "ACK →", sub: `seq=${ISN_C + 1}  ack=${ISN_S + 1}` },
] as const;

const CLIENT_DOCK = new THREE.Vector3(CLIENT[0] + 1.5, 5, CZ + 5);
const START = new THREE.Vector3(CLIENT[0] + 6, 0.8, CZ + 26);

function state(t: number): [string, string] {
  if (t < STEPS[0].from) return ["CLOSED", "LISTEN"];
  if (t < STEPS[0].to) return ["SYN_SENT", "LISTEN"];
  if (t < STEPS[1].to) return ["SYN_SENT", "SYN_RECEIVED"];
  if (t < STEPS[2].to) return ["ESTABLISHED", "SYN_RECEIVED"];
  return ["ESTABLISHED", "ESTABLISHED"];
}

function Scene() {
  const packets = useRef<(PacketHandle | null)[]>([]);
  const labels = useRef<(DynamicLabelHandle | null)[]>([]);
  const lines = useRef<(THREE.Mesh | null)[]>([]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const [states, setStates] = useState<[string, string]>(["CLOSED", "LISTEN"]);
  const key = useRef("");
  const curves = useMemo(() => STEPS.map((s) => (s.dir === 1 ? BRIDGES[s.bridge] : reversed(BRIDGES[s.bridge]))), []);

  useFrame(() => {
    const t = stageT(INDEX, store().progress);
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      const u = remap(t, s.from, s.to);
      const moving = t > s.from && t < s.to;
      // the hero packet plays SYN; the other two are local
      const p = packets.current[i];
      if (p) {
        p.setVisible(i > 0 && moving);
        curves[i].getPoint(u, tmp);
        p.setPosition(tmp);
      }
      const l = labels.current[i];
      if (l?.sprite) {
        l.sprite.visible = moving || (t > s.to && t < s.to + 0.06);
        curves[i].getPoint(u, tmp);
        l.sprite.position.set(tmp.x, tmp.y + 1.6, tmp.z);
      }
      // the bridge lights up behind the packet and stays lit
      const line = lines.current[i];
      if (line) setReveal(line, u);
    }
    const st = state(t);
    const k = st.join();
    if (k !== key.current) {
      key.current = k;
      setStates(st);
    }
  });

  return (
    <group>
      {BRIDGES.map((c, i) => (
        <FlowLine
          key={i}
          ref={(m) => {
            lines.current[i] = m;
          }}
          curve={c}
          color={STEPS[i].color}
          radius={0.07}
          segments={48}
          dash={10}
          speed={0.8}
          flip={STEPS[i].dir === -1}
          reveal={0}
        />
      ))}
      {STEPS.map((s, i) => (
        <group key={s.id}>
          {i > 0 && (
            <Packet
              ref={(h) => {
                packets.current[i] = h;
              }}
              color={s.color}
              size={0.5}
              visible={false}
            />
          )}
          <DynamicLabel
            ref={(h) => {
              labels.current[i] = h;
              h?.setText(s.text);
            }}
            initial={s.text}
            sub={[s.sub]}
            size={0.62}
            color={i === 1 ? HEX.magenta : "#eaffff"}
            bg="rgba(6,8,20,0.85)"
            border={i === 1 ? HEX.magenta : HEX.cyan}
            weight={700}
          />
        </group>
      ))}
      <Label
        text={states[0]}
        size={0.5}
        position={[CLIENT[0], TOWER_H + 2.4, CZ + 3]}
        color={states[0] === "ESTABLISHED" ? "#7dffb0" : HEX.cyan}
        bg="rgba(6,8,20,0.85)"
        border={states[0] === "ESTABLISHED" ? "#7dffb0" : HEX.cyan}
        weight={700}
      />
      <Label
        text={states[1]}
        size={0.5}
        position={[SERVER[0], TOWER_H + 2.4, CZ + 3]}
        color={states[1] === "ESTABLISHED" ? "#7dffb0" : HEX.magenta}
        bg="rgba(6,8,20,0.85)"
        border={states[1] === "ESTABLISHED" ? "#7dffb0" : HEX.magenta}
        weight={700}
      />
    </group>
  );
}

const path = cameraPath([
  { t: 0, position: [-10, 16, CZ + 58], target: [-4, 4, CZ], fov: 50 },
  { t: 0.12, position: [0, 21, CZ + 50], target: [0, 4, CZ], fov: 50 },
  { t: 0.9, position: [0, 19, CZ + 46], target: [0, 5, CZ], fov: 50 },
  { t: 1, position: [0, 19, CZ + 46], target: [0, 6, CZ], fov: 50 },
]);

export const Stage2Tcp: StageModule & { id: string } = {
  id: STAGES[INDEX].id,
  Scene,
  ...path,
  duration: STAGES[INDEX].duration,
  packet(t, out) {
    const syn = STEPS[0];
    if (t <= syn.from) {
      out.visible = true;
      out.position.lerpVectors(START, CLIENT_DOCK, remap(t, 0, syn.from));
    } else if (t < syn.to) {
      out.visible = true;
      BRIDGES[0].getPoint(remap(t, syn.from, syn.to), out.position);
    } else if (t > 0.96) {
      // ready on the client side for the TLS ClientHello
      out.visible = true;
      out.position.copy(CLIENT_DOCK);
      out.position.z = CZ;
    } else {
      out.visible = false;
    }
  },
};
