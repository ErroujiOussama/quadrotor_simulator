/**
 * Quaternion-based 6DOF quadrotor (X-config). Newton–Euler rigid-body dynamics
 * with ESC motor lag, quadratic body drag, gravity, ground contact, and a
 * battery-coupled powertrain that estimates current draw from total thrust.
 *
 * This is the headless successor to src/lib/physics/DroneModel.ts — same physics
 * intent, but attitude is a quaternion (no gimbal lock) and all randomness is
 * injected (constitution P2/P3). Wind/turbulence/sensors live in Environment and
 * later specs; this file owns the airframe.
 */
import { Vec3 } from "../math/Vec3";
import { Quat } from "../math/Quat";
import { GRAVITY, clamp } from "../math/constants";
import { BodyState, Derivative } from "../physics/state";
import { Integrator, IntegratorName, getIntegrator } from "../physics/integrators";
import { Battery, BatterySpec, DEFAULT_BATTERY } from "../physics/Battery";

export interface MultirotorParams {
  mass: number;            // kg
  armLength: number;       // m (motor distance from center)
  inertia: { Ixx: number; Iyy: number; Izz: number }; // kg·m²
  dragCoeff: number;       // quadratic drag coefficient (per axis)
  maxThrustPerMotor: number; // N at full throttle, per motor
  thrustToTorqueRatio: number; // yaw torque per unit thrust
  motorTimeConstant: number;   // ESC first-order lag (s)
  /** Electrical: how many amps the whole craft draws at full (4× max) thrust. */
  maxCurrentA: number;
}

export const DEFAULT_MULTIROTOR: MultirotorParams = {
  mass: 1.5,
  armLength: 0.25,
  inertia: { Ixx: 0.0347563, Iyy: 0.0347563, Izz: 0.0577 },
  dragCoeff: 0.05,
  maxThrustPerMotor: 7.0,
  thrustToTorqueRatio: 0.016,
  motorTimeConstant: 0.08,
  maxCurrentA: 80,
};

/** Per-motor commanded throttles [0,1], order: FL, FR, RL, RR. */
export type MotorCommand = [number, number, number, number];

export interface MultirotorOptions {
  params?: Partial<MultirotorParams>;
  battery?: BatterySpec;
  integrator?: IntegratorName;
  initialState?: Partial<BodyState>;
}

export class Multirotor {
  state: BodyState;
  readonly battery: Battery;
  private params: MultirotorParams;
  private motorSpeeds: MotorCommand = [0, 0, 0, 0];
  private command: MotorCommand = [0, 0, 0, 0];
  private failed: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private integrate: Integrator;
  private integratorName: IntegratorName;

  constructor(opts: MultirotorOptions = {}) {
    this.params = { ...DEFAULT_MULTIROTOR, ...opts.params };
    this.battery = new Battery(opts.battery ?? DEFAULT_BATTERY);
    this.integratorName = opts.integrator ?? "rk4";
    this.integrate = getIntegrator(this.integratorName);
    this.state = {
      position: Vec3.ZERO,
      velocity: Vec3.ZERO,
      attitude: Quat.IDENTITY,
      angularVel: Vec3.ZERO,
      ...opts.initialState,
    };
  }

  getParams(): MultirotorParams { return { ...this.params }; }
  setParams(p: Partial<MultirotorParams>): void { this.params = { ...this.params, ...p }; }
  setIntegrator(name: IntegratorName): void {
    this.integratorName = name;
    this.integrate = getIntegrator(name);
  }
  getIntegratorName(): IntegratorName { return this.integratorName; }
  setMotorFailures(f: [boolean, boolean, boolean, boolean]): void { this.failed = [...f]; }
  getMotorSpeeds(): MotorCommand { return [...this.motorSpeeds]; }

  /** Set commanded throttles for the next step(s). */
  setCommand(cmd: MotorCommand): void {
    this.command = [clamp(cmd[0], 0, 1), clamp(cmd[1], 0, 1), clamp(cmd[2], 0, 1), clamp(cmd[3], 0, 1)];
  }

  /** Initialize ESC state directly (skip spin-up lag), e.g. to start at hover. */
  primeMotors(cmd: MotorCommand): void {
    this.setCommand(cmd);
    this.motorSpeeds = [...this.command];
  }

  /** Thrust (N) per motor from its (failure-masked) speed. */
  private motorThrusts(speeds: MotorCommand): MotorCommand {
    const m = this.params.maxThrustPerMotor;
    return [
      (this.failed[0] ? 0 : speeds[0]) * m,
      (this.failed[1] ? 0 : speeds[1]) * m,
      (this.failed[2] ? 0 : speeds[2]) * m,
      (this.failed[3] ? 0 : speeds[3]) * m,
    ];
  }

  /** Total body-frame thrust (along +Z body) and body torques. */
  private forcesAndTorques(speeds: MotorCommand): { thrust: number; torque: Vec3 } {
    const f = this.motorThrusts(speeds);
    const L = this.params.armLength * 0.5; // X-config moment arm component
    const kT = this.params.thrustToTorqueRatio;
    // X-config: M1=FL(CCW) M2=FR(CW) M3=RL(CW) M4=RR(CCW)
    const roll = L * (f[1] + f[3] - f[0] - f[2]);   // right − left
    const pitch = L * (f[0] + f[1] - f[2] - f[3]);  // front − rear
    const yaw = kT * (f[0] + f[3] - f[1] - f[2]);   // CCW − CW
    return { thrust: f[0] + f[1] + f[2] + f[3], torque: new Vec3(roll, pitch, yaw) };
  }

  /** Newton–Euler derivative of the body state. `windWorld` is air velocity (m/s). */
  private derivative(s: BodyState, windWorld: Vec3): Derivative {
    const { thrust, torque } = this.forcesAndTorques(this.motorSpeeds);
    const { mass, dragCoeff } = this.params;
    const { Ixx, Iyy, Izz } = this.params.inertia;

    // Thrust acts along the body +Z axis, rotated into the world frame.
    const thrustWorld = s.attitude.rotate(new Vec3(0, 0, thrust));

    // Quadratic drag opposing motion relative to the air.
    const rel = s.velocity.sub(windWorld);
    const drag = new Vec3(
      -dragCoeff * rel.x * Math.abs(rel.x),
      -dragCoeff * rel.y * Math.abs(rel.y),
      -dragCoeff * rel.z * Math.abs(rel.z),
    );

    const gravity = new Vec3(0, 0, -mass * GRAVITY);
    const dVel = thrustWorld.add(drag).add(gravity).scale(1 / mass);

    // Rotational dynamics: I·ω̇ = τ − ω × (I·ω)
    const w = s.angularVel;
    const Iw = new Vec3(Ixx * w.x, Iyy * w.y, Izz * w.z);
    const gyro = w.cross(Iw);
    const dOmega = new Vec3(
      (torque.x - gyro.x) / Ixx,
      (torque.y - gyro.y) / Iyy,
      (torque.z - gyro.z) / Izz,
    );

    return {
      dPos: s.velocity,
      dVel,
      dQuat: s.attitude.derivative(w),
      dOmega,
    };
  }

  /** Advance the simulation by dt seconds. `windWorld` defaults to still air. */
  step(dt: number, windWorld: Vec3 = Vec3.ZERO): void {
    // ESC first-order lag toward the commanded throttle.
    const tau = this.params.motorTimeConstant;
    const alpha = dt / (tau + dt);
    for (let i = 0; i < 4; i++) {
      this.motorSpeeds[i] += alpha * (this.command[i] - this.motorSpeeds[i]);
    }

    // Integrate rigid body. The derivative closes over current motor speeds.
    this.state = this.integrate(this.state, (st) => this.derivative(st, windWorld), dt);

    // Battery: approximate current draw ∝ total throttle fraction.
    const throttleFrac = (this.motorSpeeds[0] + this.motorSpeeds[1] + this.motorSpeeds[2] + this.motorSpeeds[3]) / 4;
    this.battery.update(throttleFrac * this.params.maxCurrentA, dt);

    // Ground contact: floor at z=0 with simple restitution + friction.
    if (this.state.position.z < 0) {
      const v = this.state.velocity;
      this.state = {
        ...this.state,
        position: new Vec3(this.state.position.x, this.state.position.y, 0),
        velocity: new Vec3(v.x * 0.7, v.y * 0.7, Math.max(0, v.z)),
      };
    }
  }

  /** Throttle that makes total thrust equal weight (hover), per motor [0,1]. */
  hoverThrottle(): number {
    const weight = this.params.mass * GRAVITY;
    return clamp(weight / (4 * this.params.maxThrustPerMotor), 0, 1);
  }

  /** Euler angles for display/IO only (constitution Article III). */
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
    this.motorSpeeds = [0, 0, 0, 0];
    this.command = [0, 0, 0, 0];
    this.battery.reset();
  }
}
