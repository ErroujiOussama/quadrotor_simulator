/**
 * Quadrotor Drone Physics Model
 * 6DOF Newton-Euler dynamics with RK4 integration.
 * Includes: motor ESC dynamics, wind/turbulence, motor failures, sensor noise.
 */

export interface DroneState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { roll: number; pitch: number; yaw: number };
  angularVelocity: { x: number; y: number; z: number };
}

export interface DroneParameters {
  mass: number;
  length: number;
  inertia: { Ixx: number; Iyy: number; Izz: number };
  dragCoeff: number;
  maxThrust: number;
  thrustToTorqueRatio: number;
  motorTimeConstant: number; // ESC lag (s)
}

export interface MotorInputs {
  motor1: number; // [0, 1] — Front-Left
  motor2: number; //          Front-Right
  motor3: number; //          Rear-Left
  motor4: number; //          Rear-Right
}

export interface WindConfig {
  enabled: boolean;
  speed: number;      // m/s
  direction: number;  // radians (0 = +X/east, π/2 = +Y/north)
  turbulenceIntensity: number; // 0–1
}

export interface FailureConfig {
  motorFailures: [boolean, boolean, boolean, boolean];
  sensorNoise: number; // position noise std-dev (m)
}

interface StateDerivative {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { roll: number; pitch: number; yaw: number };
  angularVelocity: { x: number; y: number; z: number };
}

export class DroneModel {
  private state: DroneState;
  private params: DroneParameters;
  private motorSpeeds: [number, number, number, number] = [0, 0, 0, 0];
  private wind: WindConfig;
  private failures: FailureConfig;
  private turbulence = { x: 0, y: 0, z: 0 };
  private readonly gravity = 9.81;

  constructor(initialState?: Partial<DroneState>, parameters?: Partial<DroneParameters>) {
    this.state = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      ...initialState,
    };
    this.params = {
      mass: 1.5,
      length: 0.25,
      inertia: { Ixx: 0.0347563, Iyy: 0.0347563, Izz: 0.0577 },
      dragCoeff: 0.01,
      maxThrust: 15,
      thrustToTorqueRatio: 0.016,
      motorTimeConstant: 0.08,
      ...parameters,
    };
    this.wind = { enabled: false, speed: 0, direction: 0, turbulenceIntensity: 0 };
    this.failures = { motorFailures: [false, false, false, false], sensorNoise: 0 };
  }

  /** Returns state with optional sensor noise applied (what the controller sees). */
  getState(): DroneState {
    const s = this.getTrueState();
    if (this.failures.sensorNoise > 0) {
      const n = this.failures.sensorNoise;
      s.position.x += (Math.random() - 0.5) * 2 * n;
      s.position.y += (Math.random() - 0.5) * 2 * n;
      s.position.z += (Math.random() - 0.5) * 2 * n;
    }
    return s;
  }

  /** Returns the true simulation state (no noise). Use for display and logging. */
  getTrueState(): DroneState {
    return {
      position: { ...this.state.position },
      velocity: { ...this.state.velocity },
      orientation: { ...this.state.orientation },
      angularVelocity: { ...this.state.angularVelocity },
    };
  }

  setState(s: Partial<DroneState>) { this.state = { ...this.state, ...s }; }
  getParameters(): DroneParameters { return { ...this.params }; }
  updateParameters(p: Partial<DroneParameters>) { this.params = { ...this.params, ...p }; }
  setWind(w: Partial<WindConfig>) { this.wind = { ...this.wind, ...w }; }
  setFailures(f: Partial<FailureConfig>) { this.failures = { ...this.failures, ...f }; }
  getMotorSpeeds(): [number, number, number, number] { return [...this.motorSpeeds] as [number, number, number, number]; }

  // Rotation matrix from body frame to world frame (ZYX Euler)
  private rotMatrix(o: { roll: number; pitch: number; yaw: number }) {
    const { roll: r, pitch: p, yaw: y } = o;
    const cr = Math.cos(r), sr = Math.sin(r);
    const cp = Math.cos(p), sp = Math.sin(p);
    const cy = Math.cos(y), sy = Math.sin(y);
    return {
      R11: cp * cy,
      R12: sr * sp * cy - cr * sy,
      R13: cr * sp * cy + sr * sy,
      R21: cp * sy,
      R22: sr * sp * sy + cr * cy,
      R23: cr * sp * sy - sr * cy,
      R31: -sp,
      R32: sr * cp,
      R33: cr * cp,
    };
  }

  private forcesAndTorques(speeds: [number, number, number, number]) {
    const { maxThrust, length, thrustToTorqueRatio } = this.params;
    const f = speeds.map((s, i) =>
      (this.failures.motorFailures[i] ? 0 : s) * maxThrust
    ) as [number, number, number, number];

    // X-config: M1=FL(CCW) M2=FR(CW) M3=RL(CW) M4=RR(CCW)
    return {
      thrust: f[0] + f[1] + f[2] + f[3],
      torques: {
        roll:  length * 0.5 * (f[1] + f[3] - f[0] - f[2]), // right - left
        pitch: length * 0.5 * (f[0] + f[1] - f[2] - f[3]), // front - rear
        yaw:   thrustToTorqueRatio * (f[0] + f[3] - f[1] - f[2]), // CCW - CW
      },
    };
  }

  private derivatives(
    state: DroneState,
    speeds: [number, number, number, number],
    windF: { x: number; y: number; z: number }
  ): StateDerivative {
    const { thrust, torques } = this.forcesAndTorques(speeds);
    const R = this.rotMatrix(state.orientation); // uses passed state — RK4 fix
    const { mass, dragCoeff } = this.params;
    const v = state.velocity;

    // Relative velocity for drag (wind moves air, so drag opposes drone-relative-to-air motion)
    const relVx = v.x - windF.x;
    const relVy = v.y - windF.y;
    const relVz = v.z - windF.z;

    const dragX = -dragCoeff * relVx * Math.abs(relVx);
    const dragY = -dragCoeff * relVy * Math.abs(relVy);
    const dragZ = -dragCoeff * relVz * Math.abs(relVz);

    // Translational dynamics (world frame)
    const velocityDot = {
      x: (R.R13 * thrust + dragX) / mass,
      y: (R.R23 * thrust + dragY) / mass,
      z: (R.R33 * thrust - mass * this.gravity + dragZ) / mass,
    };

    // Euler kinematics (body rates → Euler angle rates)
    const { roll, pitch } = state.orientation;
    const { x: p, y: q, z: r } = state.angularVelocity;
    // Clamp pitch to avoid singularity
    const cp = Math.cos(Math.max(-1.5, Math.min(1.5, pitch)));
    const safeCP = Math.abs(cp) < 1e-4 ? 1e-4 * Math.sign(cp) : cp;

    const orientationDot = {
      roll:  p + q * Math.sin(roll) * Math.tan(pitch) + r * Math.cos(roll) * Math.tan(pitch),
      pitch: q * Math.cos(roll) - r * Math.sin(roll),
      yaw:   (q * Math.sin(roll) + r * Math.cos(roll)) / safeCP,
    };

    // Rotational dynamics (Newton-Euler)
    const { Ixx, Iyy, Izz } = this.params.inertia;
    const angularVelocityDot = {
      x: (torques.roll  + (Iyy - Izz) * q * r) / Ixx,
      y: (torques.pitch + (Izz - Ixx) * p * r) / Iyy,
      z: (torques.yaw   + (Ixx - Iyy) * p * q) / Izz,
    };

    return { position: { ...state.velocity }, velocity: velocityDot, orientation: orientationDot, angularVelocity: angularVelocityDot };
  }

  private addDerivative(s: DroneState, d: StateDerivative, dt: number): DroneState {
    return {
      position:        { x: s.position.x + d.position.x * dt,               y: s.position.y + d.position.y * dt,               z: s.position.z + d.position.z * dt },
      velocity:        { x: s.velocity.x + d.velocity.x * dt,               y: s.velocity.y + d.velocity.y * dt,               z: s.velocity.z + d.velocity.z * dt },
      orientation:     { roll: s.orientation.roll + d.orientation.roll * dt, pitch: s.orientation.pitch + d.orientation.pitch * dt, yaw: s.orientation.yaw + d.orientation.yaw * dt },
      angularVelocity: { x: s.angularVelocity.x + d.angularVelocity.x * dt, y: s.angularVelocity.y + d.angularVelocity.y * dt, z: s.angularVelocity.z + d.angularVelocity.z * dt },
    };
  }

  update(inputs: MotorInputs, dt: number): void {
    // ESC motor dynamics: first-order lag toward commanded speed
    const tau = this.params.motorTimeConstant;
    const alpha = dt / (tau + dt);
    const cmds = [inputs.motor1, inputs.motor2, inputs.motor3, inputs.motor4];
    for (let i = 0; i < 4; i++) {
      this.motorSpeeds[i] += alpha * (cmds[i] - this.motorSpeeds[i]);
    }

    // Dryden-style turbulence: colored noise via first-order filter
    const tTau = 0.5;
    const tAlpha = dt / (tTau + dt);
    const sig = this.wind.turbulenceIntensity * 2.5;
    if (this.wind.enabled && sig > 0) {
      this.turbulence.x += tAlpha * ((Math.random() - 0.5) * 2 * sig - this.turbulence.x);
      this.turbulence.y += tAlpha * ((Math.random() - 0.5) * 2 * sig - this.turbulence.y);
      this.turbulence.z += tAlpha * ((Math.random() - 0.5) * 2 * sig * 0.3 - this.turbulence.z);
    } else {
      this.turbulence = { x: 0, y: 0, z: 0 };
    }

    // Wind velocity in world frame
    const windF = this.wind.enabled
      ? {
          x: Math.cos(this.wind.direction) * this.wind.speed + this.turbulence.x,
          y: Math.sin(this.wind.direction) * this.wind.speed + this.turbulence.y,
          z: this.turbulence.z,
        }
      : { x: 0, y: 0, z: 0 };

    // RK4
    const k1 = this.derivatives(this.state, this.motorSpeeds, windF);
    const s2 = this.addDerivative(this.state, k1, dt * 0.5);
    const k2 = this.derivatives(s2, this.motorSpeeds, windF);
    const s3 = this.addDerivative(this.state, k2, dt * 0.5);
    const k3 = this.derivatives(s3, this.motorSpeeds, windF);
    const s4 = this.addDerivative(this.state, k3, dt);
    const k4 = this.derivatives(s4, this.motorSpeeds, windF);

    const rk4 = (a: number, b: number, c: number, d: number) => (a + 2 * b + 2 * c + d) / 6;

    this.state.position.x        += rk4(k1.position.x, k2.position.x, k3.position.x, k4.position.x) * dt;
    this.state.position.y        += rk4(k1.position.y, k2.position.y, k3.position.y, k4.position.y) * dt;
    this.state.position.z        += rk4(k1.position.z, k2.position.z, k3.position.z, k4.position.z) * dt;
    this.state.velocity.x        += rk4(k1.velocity.x, k2.velocity.x, k3.velocity.x, k4.velocity.x) * dt;
    this.state.velocity.y        += rk4(k1.velocity.y, k2.velocity.y, k3.velocity.y, k4.velocity.y) * dt;
    this.state.velocity.z        += rk4(k1.velocity.z, k2.velocity.z, k3.velocity.z, k4.velocity.z) * dt;
    this.state.orientation.roll  += rk4(k1.orientation.roll, k2.orientation.roll, k3.orientation.roll, k4.orientation.roll) * dt;
    this.state.orientation.pitch += rk4(k1.orientation.pitch, k2.orientation.pitch, k3.orientation.pitch, k4.orientation.pitch) * dt;
    this.state.orientation.yaw   += rk4(k1.orientation.yaw, k2.orientation.yaw, k3.orientation.yaw, k4.orientation.yaw) * dt;
    this.state.angularVelocity.x += rk4(k1.angularVelocity.x, k2.angularVelocity.x, k3.angularVelocity.x, k4.angularVelocity.x) * dt;
    this.state.angularVelocity.y += rk4(k1.angularVelocity.y, k2.angularVelocity.y, k3.angularVelocity.y, k4.angularVelocity.y) * dt;
    this.state.angularVelocity.z += rk4(k1.angularVelocity.z, k2.angularVelocity.z, k3.angularVelocity.z, k4.angularVelocity.z) * dt;

    // Ground collision
    if (this.state.position.z < 0) {
      this.state.position.z = 0;
      this.state.velocity.z = Math.max(0, this.state.velocity.z);
      this.state.velocity.x *= 0.7;
      this.state.velocity.y *= 0.7;
    }

    this.state.orientation.roll  = this.wrap(this.state.orientation.roll);
    this.state.orientation.pitch = this.wrap(this.state.orientation.pitch);
    this.state.orientation.yaw   = this.wrap(this.state.orientation.yaw);
  }

  private wrap(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  reset(): void {
    this.state = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    };
    this.motorSpeeds = [0, 0, 0, 0];
    this.turbulence = { x: 0, y: 0, z: 0 };
  }
}
