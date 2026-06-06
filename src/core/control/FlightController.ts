/**
 * FlightController — cascaded position→velocity→attitude control with altitude
 * hold, plus per-mode motor mixing for an X-config quad. Ported from the legacy
 * DroneSimulator control path, operating on the quaternion core's Euler view.
 */
import { PIDController, CascadedPIDController, PIDGains } from "./PIDController";
import { clamp } from "../math/constants";

export type FlightMode =
  | "manual"
  | "stabilized"
  | "altitude_hold"
  | "position_hold"
  | "mission";

export interface ManualInputs {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
}

export interface ControllerConfig {
  altitude: PIDGains & { enabled: boolean };
  attitude: {
    roll: PIDGains & { enabled: boolean };
    pitch: PIDGains & { enabled: boolean };
    yaw: PIDGains & { enabled: boolean };
  };
  position: {
    x: { outer: PIDGains; inner: PIDGains; enabled: boolean };
    y: { outer: PIDGains; inner: PIDGains; enabled: boolean };
  };
}

export interface SetPoints {
  position: { x: number; y: number; z: number };
  attitude: { roll: number; pitch: number; yaw: number };
}

export interface ControlOutputs {
  altitude: number;
  roll: number;
  pitch: number;
  yaw: number;
  positionX: number;
  positionY: number;
}

export interface ControlErrors {
  altitude: number;
  roll: number;
  pitch: number;
  yaw: number;
  positionX: number;
  positionY: number;
}

/** Plant feedback the controller needs (world position/velocity + Euler attitude). */
export interface ControlInput {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  euler: { roll: number; pitch: number; yaw: number };
}

export const DEFAULT_CONTROLLER_CONFIG: ControllerConfig = {
  altitude: { kp: 8.0, ki: 0.5, kd: 2.0, enabled: true },
  attitude: {
    roll: { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
    pitch: { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
    yaw: { kp: 4.0, ki: 0.05, kd: 1.0, enabled: true },
  },
  position: {
    x: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
    y: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
  },
};

export class FlightController {
  private config: ControllerConfig;
  private altitude: PIDController;
  private roll: PIDController;
  private pitch: PIDController;
  private yaw: PIDController;
  private posX: CascadedPIDController;
  private posY: CascadedPIDController;

  constructor(config: ControllerConfig = DEFAULT_CONTROLLER_CONFIG) {
    this.config = structuredClone(config);
    const { altitude, attitude, position } = this.config;
    // Altitude PID is a *correction* around a hover feed-forward, so it must be
    // able to go negative to descend. Range ±0.5 throttle.
    this.altitude = new PIDController(altitude, 10, 0.5, -0.5);
    this.roll = new PIDController(attitude.roll, 5, 0.5, -0.5);
    this.pitch = new PIDController(attitude.pitch, 5, 0.5, -0.5);
    this.yaw = new PIDController(attitude.yaw, 5, 0.3, -0.3);
    this.posX = new CascadedPIDController(position.x.outer, position.x.inner, 3, 0.35);
    this.posY = new CascadedPIDController(position.y.outer, position.y.inner, 3, 0.35);
  }

  setConfig(c: ControllerConfig) {
    this.config = structuredClone(c);
    this.applyGains();
  }

  getConfig(): ControllerConfig {
    return structuredClone(this.config);
  }

  private applyGains() {
    const { altitude, attitude, position } = this.config;
    this.altitude.setGains(altitude); this.altitude.setEnabled(altitude.enabled);
    this.roll.setGains(attitude.roll); this.roll.setEnabled(attitude.roll.enabled);
    this.pitch.setGains(attitude.pitch); this.pitch.setEnabled(attitude.pitch.enabled);
    this.yaw.setGains(attitude.yaw); this.yaw.setEnabled(attitude.yaw.enabled);
    this.posX.setOuterGains(position.x.outer); this.posX.setInnerGains(position.x.inner); this.posX.setEnabled(position.x.enabled);
    this.posY.setOuterGains(position.y.outer); this.posY.setInnerGains(position.y.inner); this.posY.setEnabled(position.y.enabled);
  }

  reset() {
    this.altitude.reset(); this.roll.reset(); this.pitch.reset();
    this.yaw.reset(); this.posX.reset(); this.posY.reset();
  }

  /** Compute control outputs from feedback and setpoints. */
  control(input: ControlInput, setpoints: SetPoints, dt: number): ControlOutputs {
    const { position, velocity, euler } = input;
    const altOut = this.altitude.update(setpoints.position.z, position.z, dt);
    const pitchDes = this.posX.update(setpoints.position.x, position.x, velocity.x, dt);
    const rollDes = -this.posY.update(setpoints.position.y, position.y, velocity.y, dt);
    const rollOut = this.roll.update(rollDes, euler.roll, dt);
    const pitchOut = this.pitch.update(pitchDes, euler.pitch, dt);
    const yawOut = this.yaw.update(setpoints.attitude.yaw, euler.yaw, dt);
    return { altitude: altOut, roll: rollOut, pitch: pitchOut, yaw: yawOut, positionX: pitchDes, positionY: rollDes };
  }

  getErrors(): ControlErrors {
    return {
      altitude: this.altitude.getState().error,
      roll: this.roll.getState().error,
      pitch: this.pitch.getState().error,
      yaw: this.yaw.getState().error,
      positionX: this.posX.getOuterState().error,
      positionY: this.posY.getOuterState().error,
    };
  }

  /**
   * Mix control outputs + manual inputs into [FL, FR, RL, RR] throttles.
   * `hoverThrottle` is the per-motor throttle that balances gravity — used as a
   * feed-forward in the altitude-stabilized modes so the PID only trims around it.
   */
  mix(
    mode: FlightMode,
    ctrl: ControlOutputs,
    manual: ManualInputs,
    hoverThrottle: number,
  ): [number, number, number, number] {
    const { altitude, roll, pitch, yaw } = ctrl;
    let base: number, r: number, p: number, y: number;

    switch (mode) {
      case "manual":
        base = manual.throttle;
        r = manual.roll * 0.3; p = manual.pitch * 0.3; y = manual.yaw * 0.3;
        break;
      case "stabilized":
        base = manual.throttle;
        r = roll + manual.roll * 0.2; p = pitch + manual.pitch * 0.2; y = yaw + manual.yaw * 0.2;
        break;
      case "altitude_hold":
        base = hoverThrottle + altitude;
        r = manual.roll * 0.25; p = manual.pitch * 0.25; y = yaw + manual.yaw * 0.2;
        break;
      case "position_hold":
      case "mission":
      default:
        base = hoverThrottle + altitude;
        r = roll; p = pitch; y = yaw;
        break;
    }

    const c = (v: number) => clamp(v, 0, 1);
    // X-config: M1=FL(CCW) M2=FR(CW) M3=RL(CW) M4=RR(CCW)
    return [
      c(base + p - r + y),
      c(base + p + r - y),
      c(base - p - r - y),
      c(base - p + r + y),
    ];
  }
}
