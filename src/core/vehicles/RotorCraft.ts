/**
 * RotorCraft — generalized N-rotor multirotor driven by an AirframeSpec. Same
 * quaternion 6DOF Newton–Euler dynamics as the X-quad Multirotor (spec 001), but
 * thrust and torque are summed over an arbitrary rotor geometry, so quad / hexa /
 * octo (and future layouts) all work from data alone. Implements `Vehicle` (P4).
 */
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { GRAVITY, clamp } from "../math/constants";
import { BodyState } from "../physics/state";
import { Integrator, IntegratorName, getIntegrator } from "../physics/integrators";
import { Battery, BatterySpec, DEFAULT_BATTERY } from "../physics/Battery";
import type { Vehicle } from "./Vehicle";
import { AirframeSpec, rotorWrench } from "./airframes";

export interface RotorCraftParams {
  mass: number;                 // kg
  inertia: { Ixx: number; Iyy: number; Izz: number };
  dragCoeff: number;
  maxThrustPerMotor: number;    // N
  thrustToTorqueRatio: number;
  motorTimeConstant: number;    // ESC lag (s)
  maxCurrentA: number;
}

export const DEFAULT_ROTORCRAFT_PARAMS: RotorCraftParams = {
  mass: 1.5,
  inertia: { Ixx: 0.0347563, Iyy: 0.0347563, Izz: 0.0577 },
  dragCoeff: 0.05,
  maxThrustPerMotor: 7.0,
  thrustToTorqueRatio: 0.016,
  motorTimeConstant: 0.08,
  maxCurrentA: 80,
};

export interface RotorCraftOptions {
  airframe: AirframeSpec;
  params?: Partial<RotorCraftParams>;
  battery?: BatterySpec;
  integrator?: IntegratorName;
  initialState?: Partial<BodyState>;
}

export class RotorCraft implements Vehicle {
  state: BodyState;
  readonly battery: Battery;
  readonly actuatorCount: number;
  private airframe: AirframeSpec;
  private params: RotorCraftParams;
  private motorSpeeds: number[];
  private command: number[];
  private failed: boolean[];
  private integrate: Integrator;

  constructor(opts: RotorCraftOptions) {
    this.airframe = opts.airframe;
    this.actuatorCount = opts.airframe.rotorCount;
    this.params = { ...DEFAULT_ROTORCRAFT_PARAMS, ...opts.params };
    this.battery = new Battery(opts.battery ?? DEFAULT_BATTERY);
    this.integrate = getIntegrator(opts.integrator ?? "rk4");
    this.motorSpeeds = new Array(this.actuatorCount).fill(0);
    this.command = new Array(this.actuatorCount).fill(0);
    this.failed = new Array(this.actuatorCount).fill(false);
    this.state = {
      position: Vec3.ZERO,
      velocity: Vec3.ZERO,
      attitude: Quat.IDENTITY,
      angularVel: Vec3.ZERO,
      ...opts.initialState,
    };
  }

  getAirframe(): AirframeSpec { return this.airframe; }
  getParams(): RotorCraftParams { return { ...this.params }; }
  setParams(p: Partial<RotorCraftParams>): void { this.params = { ...this.params, ...p }; }
  getMotorSpeeds(): number[] { return [...this.motorSpeeds]; }
  setMotorFailures(f: boolean[]): void { this.failed = this.failed.map((_, i) => !!f[i]); }

  setCommand(cmd: number[]): void {
    for (let i = 0; i < this.actuatorCount; i++) this.command[i] = clamp(cmd[i] ?? 0, 0, 1);
  }

  /** Initialize ESC state directly (skip spin-up), e.g. to start at hover. */
  primeMotors(cmd: number[]): void {
    this.setCommand(cmd);
    this.motorSpeeds = [...this.command];
  }

  hoverThrottle(): number {
    const weight = this.params.mass * GRAVITY;
    return clamp(weight / (this.actuatorCount * this.params.maxThrustPerMotor), 0, 1);
  }

  private rotorThrusts(): number[] {
    const m = this.params.maxThrustPerMotor;
    return this.motorSpeeds.map((s, i) => (this.failed[i] ? 0 : s) * m);
  }

  private derivative(s: BodyState, windWorld: Vec3) {
    const { thrust, torque } = rotorWrench(this.airframe, this.rotorThrusts(), this.params.thrustToTorqueRatio);
    const { mass, dragCoeff } = this.params;
    const { Ixx, Iyy, Izz } = this.params.inertia;

    const thrustWorld = s.attitude.rotate(new Vec3(0, 0, thrust));
    const rel = s.velocity.sub(windWorld);
    const drag = new Vec3(
      -dragCoeff * rel.x * Math.abs(rel.x),
      -dragCoeff * rel.y * Math.abs(rel.y),
      -dragCoeff * rel.z * Math.abs(rel.z),
    );
    const gravity = new Vec3(0, 0, -mass * GRAVITY);
    const dVel = thrustWorld.add(drag).add(gravity).scale(1 / mass);

    const w = s.angularVel;
    const Iw = new Vec3(Ixx * w.x, Iyy * w.y, Izz * w.z);
    const gyro = w.cross(Iw);
    const dOmega = new Vec3(
      (torque.x - gyro.x) / Ixx,
      (torque.y - gyro.y) / Iyy,
      (torque.z - gyro.z) / Izz,
    );

    return { dPos: s.velocity, dVel, dQuat: s.attitude.derivative(w), dOmega };
  }

  step(dt: number, windWorld: Vec3 = Vec3.ZERO): void {
    const tau = this.params.motorTimeConstant;
    const alpha = dt / (tau + dt);
    for (let i = 0; i < this.actuatorCount; i++) {
      this.motorSpeeds[i] += alpha * (this.command[i] - this.motorSpeeds[i]);
    }

    this.state = this.integrate(this.state, (st) => this.derivative(st, windWorld), dt);

    const avg = this.motorSpeeds.reduce((a, b) => a + b, 0) / this.actuatorCount;
    this.battery.update(avg * this.params.maxCurrentA, dt);

    if (this.state.position.z < 0) {
      const v = this.state.velocity;
      this.state = {
        ...this.state,
        position: new Vec3(this.state.position.x, this.state.position.y, 0),
        velocity: new Vec3(v.x * 0.7, v.y * 0.7, Math.max(0, v.z)),
      };
    }
  }

  eulerAngles(): { roll: number; pitch: number; yaw: number } {
    return this.state.attitude.toEuler();
  }

  reset(initialState: Partial<BodyState> = {}): void {
    this.state = {
      position: Vec3.ZERO,
      velocity: Vec3.ZERO,
      attitude: Quat.IDENTITY,
      angularVel: Vec3.ZERO,
      ...initialState,
    };
    this.motorSpeeds = new Array(this.actuatorCount).fill(0);
    this.command = new Array(this.actuatorCount).fill(0);
    this.battery.reset();
  }
}
