/**
 * Airframe definitions: rotor geometry + control mixer, as plain data
 * (constitution P4 — new frames need no engine changes). Body frame is
 * X-forward, Y-left, Z-up.
 *
 * Each rotor has a body position and a spin direction (+1 = CCW, reaction torque
 * about +Z). The mixer is DERIVED from geometry so it is sign-consistent with the
 * physical wrench (`rotorWrench`): a +roll command always yields +roll torque,
 * etc. — for quad, hexa, octo alike. Per-axis columns are normalized so the
 * strongest rotor gets unit authority (preserving controller tuning).
 */
import { Vec3 } from "../math/Vec3";
import { clamp } from "../math/constants";

export interface RotorDef {
  /** Body-frame position of the rotor (m). */
  position: Vec3;
  /** Spin direction: +1 = CCW (reaction torque +Z), −1 = CW. */
  spin: 1 | -1;
}

export interface AirframeSpec {
  id: string;
  name: string;
  rotorCount: number;
  rotors: RotorDef[];
  /** N×4 mixer rows of [throttle, roll, pitch, yaw] coefficients. */
  mix: number[][];
  /** Hub-to-rotor distance (m). */
  armLength: number;
}

export type AirframeType = "quad_x" | "quad_plus" | "hexa_x" | "octo_x";

/** Map controller outputs to per-rotor throttles in [0,1]. */
export function mixToThrottles(
  spec: AirframeSpec,
  base: number,
  roll: number,
  pitch: number,
  yaw: number,
): number[] {
  return spec.mix.map((row) => clamp(row[0] * base + row[1] * roll + row[2] * pitch + row[3] * yaw, 0, 1));
}

/**
 * Total body thrust (along +Z) and body torque from per-rotor thrusts.
 * Torque = Σ r_i × (0,0,f_i) + Σ spin_i · kT · f_i ẑ.
 * r × ẑ = (p_y, −p_x, 0), so +Y rotors create +roll, +X rotors create −pitch.
 */
export function rotorWrench(
  spec: AirframeSpec,
  thrusts: number[],
  thrustToTorqueRatio: number,
): { thrust: number; torque: Vec3 } {
  let thrust = 0;
  let tx = 0, ty = 0, tz = 0;
  for (let i = 0; i < spec.rotors.length; i++) {
    const f = thrusts[i];
    const p = spec.rotors[i].position;
    thrust += f;
    tx += p.y * f;
    ty += -p.x * f;
    tz += spec.rotors[i].spin * thrustToTorqueRatio * f;
  }
  return { thrust, torque: new Vec3(tx, ty, tz) };
}

/**
 * Derive a geometry-consistent mixer. Roll authority ∝ +p_y, pitch ∝ −p_x
 * (matching `rotorWrench`), yaw = spin. Roll/pitch columns are normalized to
 * unit max magnitude so control authority is comparable across airframes.
 */
function deriveMix(rotors: RotorDef[]): number[][] {
  const rollRaw = rotors.map((r) => r.position.y);
  const pitchRaw = rotors.map((r) => -r.position.x);
  const norm = (arr: number[]) => {
    const m = Math.max(1e-9, ...arr.map((v) => Math.abs(v)));
    return arr.map((v) => v / m);
  };
  const roll = norm(rollRaw);
  const pitch = norm(pitchRaw);
  return rotors.map((r, i) => [1, roll[i], pitch[i], r.spin]);
}

/** Place rotors evenly on a circle of radius `armLength`, starting at `offsetDeg`. */
function ring(count: number, armLength: number, offsetDeg: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (offsetDeg + (360 / count) * i) * (Math.PI / 180);
    out.push(new Vec3(Math.cos(a) * armLength, Math.sin(a) * armLength, 0));
  }
  return out;
}

function spec(id: string, name: string, armLength: number, rotors: RotorDef[]): AirframeSpec {
  return { id, name, rotorCount: rotors.length, rotors, mix: deriveMix(rotors), armLength };
}

export function buildAirframe(type: AirframeType, armLength = 0.25): AirframeSpec {
  switch (type) {
    case "quad_x": {
      const d = armLength * Math.SQRT1_2;
      return spec("quad_x", "Quadcopter (X)", armLength, [
        { position: new Vec3(d, d, 0), spin: 1 },    // FL CCW
        { position: new Vec3(d, -d, 0), spin: -1 },   // FR CW
        { position: new Vec3(-d, d, 0), spin: -1 },   // RL CW
        { position: new Vec3(-d, -d, 0), spin: 1 },   // RR CCW
      ]);
    }
    case "quad_plus": {
      const L = armLength;
      return spec("quad_plus", "Quadcopter (+)", armLength, [
        { position: new Vec3(L, 0, 0), spin: 1 },    // Front CCW
        { position: new Vec3(0, -L, 0), spin: -1 },   // Right CW
        { position: new Vec3(-L, 0, 0), spin: 1 },    // Rear CCW
        { position: new Vec3(0, L, 0), spin: -1 },    // Left CW
      ]);
    }
    case "hexa_x": {
      const pos = ring(6, armLength, 0);
      return spec("hexa_x", "Hexacopter (X)", armLength,
        pos.map((position, i) => ({ position, spin: (i % 2 === 0 ? 1 : -1) as 1 | -1 })));
    }
    case "octo_x": {
      const pos = ring(8, armLength, 0);
      return spec("octo_x", "Octocopter (X)", armLength,
        pos.map((position, i) => ({ position, spin: (i % 2 === 0 ? 1 : -1) as 1 | -1 })));
    }
  }
}

export const AIRFRAME_TYPES: { type: AirframeType; name: string }[] = [
  { type: "quad_x", name: "Quadcopter (X)" },
  { type: "quad_plus", name: "Quadcopter (+)" },
  { type: "hexa_x", name: "Hexacopter (X)" },
  { type: "octo_x", name: "Octocopter (X)" },
];
