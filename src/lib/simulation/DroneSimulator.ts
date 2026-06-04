/**
 * Main Drone Simulation Engine
 * Orchestrates physics, cascaded PID control, waypoint mission, telemetry logging and export.
 */

import { DroneModel, DroneState, MotorInputs, WindConfig, FailureConfig } from '../physics/DroneModel';
import { PIDController, CascadedPIDController } from '../control/PIDController';
import { WaypointPlanner, MissionState } from '../mission/WaypointPlanner';

export interface SimulationConfig {
  timestep: number;
  realTimeMultiplier: number;
  enablePhysics: boolean;
  enableControl: boolean;
}

export type FlightMode = 'manual' | 'stabilized' | 'altitude_hold' | 'position_hold' | 'mission';

export interface ManualInputs {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
}

export interface ControllerConfig {
  altitude: { kp: number; ki: number; kd: number; enabled: boolean };
  attitude: {
    roll:  { kp: number; ki: number; kd: number; enabled: boolean };
    pitch: { kp: number; ki: number; kd: number; enabled: boolean };
    yaw:   { kp: number; ki: number; kd: number; enabled: boolean };
  };
  position: {
    x: { outer: { kp: number; ki: number; kd: number }; inner: { kp: number; ki: number; kd: number }; enabled: boolean };
    y: { outer: { kp: number; ki: number; kd: number }; inner: { kp: number; ki: number; kd: number }; enabled: boolean };
  };
}

export interface SetPoints {
  position: { x: number; y: number; z: number };
  attitude: { roll: number; pitch: number; yaw: number };
}

export interface SimulationData {
  time: number;
  state: DroneState;
  motorInputs: MotorInputs;
  motorSpeeds: [number, number, number, number];
  controlOutputs: { altitude: number; roll: number; pitch: number; yaw: number; positionX: number; positionY: number };
  errors: { altitude: number; roll: number; pitch: number; yaw: number; positionX: number; positionY: number };
  setpoints: SetPoints;
  flightMode: FlightMode;
  manualInputs: ManualInputs;
  missionState: MissionState;
}

export interface PerformanceMetrics {
  altitudeRiseTime: number | null;
  altitudeSettlingTime: number | null;
  altitudeOvershoot: number | null;
  altitudeSteadyStateError: number | null;
  positionRMSE: number;
  attitudeRMSE: number;
}

export class DroneSimulator {
  private drone: DroneModel;
  private config: SimulationConfig;
  private controllerConfig: ControllerConfig;

  private altitudeController: PIDController;
  private rollController: PIDController;
  private pitchController: PIDController;
  private yawController: PIDController;
  private positionXController: CascadedPIDController;
  private positionYController: CascadedPIDController;

  private setpoints: SetPoints;
  private flightMode: FlightMode;
  private manualInputs: ManualInputs;
  private currentTime = 0;
  private isRunning = false;
  private animationId: number | null = null;
  private lastFrameTime = 0;
  private accumulatedTime = 0;

  private dataHistory: SimulationData[] = [];
  private readonly maxHistoryLength = 12000;
  // Separate fast-path ref for Three.js (updated at sim rate, not React rate)
  private latestTrueState: DroneState | null = null;

  // Callbacks — update at 30 Hz to avoid React re-render overload
  private onUpdate?: (data: SimulationData) => void;
  private onReset?: () => void;
  private lastCallbackTime = 0;
  private readonly callbackIntervalMs = 1000 / 30;

  // Mission planner
  public waypoints: WaypointPlanner = new WaypointPlanner();

  constructor() {
    this.drone = new DroneModel();
    this.flightMode = 'position_hold';
    this.manualInputs = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };

    this.config = {
      timestep: 0.01,
      realTimeMultiplier: 1.0,
      enablePhysics: true,
      enableControl: true,
    };

    this.controllerConfig = {
      altitude: { kp: 8.0, ki: 0.5, kd: 2.0, enabled: true },
      attitude: {
        roll:  { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
        pitch: { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
        yaw:   { kp: 4.0, ki: 0.05, kd: 1.0, enabled: true },
      },
      position: {
        x: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
        y: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
      },
    };

    this.setpoints = { position: { x: 0, y: 0, z: 2 }, attitude: { roll: 0, pitch: 0, yaw: 0 } };
    this.initControllers();
  }

  private initControllers() {
    const { altitude, attitude, position } = this.controllerConfig;
    this.altitudeController = new PIDController(altitude, 10, 1, 0);
    this.rollController     = new PIDController(attitude.roll, 5, 0.5, -0.5);
    this.pitchController    = new PIDController(attitude.pitch, 5, 0.5, -0.5);
    this.yawController      = new PIDController(attitude.yaw, 5, 0.3, -0.3);
    this.positionXController = new CascadedPIDController(position.x.outer, position.x.inner, 3, 0.35);
    this.positionYController = new CascadedPIDController(position.y.outer, position.y.inner, 3, 0.35);
  }

  setConfig(c: Partial<SimulationConfig>) { this.config = { ...this.config, ...c }; }
  getConfig(): SimulationConfig { return { ...this.config }; }

  setControllerConfig(c: Partial<ControllerConfig>) {
    this.controllerConfig = { ...this.controllerConfig, ...c };
    this.applyGains();
  }

  private applyGains() {
    const { altitude, attitude, position } = this.controllerConfig;
    this.altitudeController.setGains(altitude);
    this.altitudeController.setEnabled(altitude.enabled);
    this.rollController.setGains(attitude.roll);
    this.rollController.setEnabled(attitude.roll.enabled);
    this.pitchController.setGains(attitude.pitch);
    this.pitchController.setEnabled(attitude.pitch.enabled);
    this.yawController.setGains(attitude.yaw);
    this.yawController.setEnabled(attitude.yaw.enabled);
    this.positionXController.setOuterGains(position.x.outer);
    this.positionXController.setInnerGains(position.x.inner);
    this.positionXController.setEnabled(position.x.enabled);
    this.positionYController.setOuterGains(position.y.outer);
    this.positionYController.setInnerGains(position.y.inner);
    this.positionYController.setEnabled(position.y.enabled);
  }

  setSetpoints(s: Partial<SetPoints>) { this.setpoints = { ...this.setpoints, ...s }; }
  getSetpoints(): SetPoints { return { ...this.setpoints }; }
  setFlightMode(m: FlightMode) { this.flightMode = m; }
  getFlightMode(): FlightMode { return this.flightMode; }
  setManualInputs(i: Partial<ManualInputs>) { this.manualInputs = { ...this.manualInputs, ...i }; }
  getManualInputs(): ManualInputs { return { ...this.manualInputs }; }
  getControllerConfig(): ControllerConfig { return JSON.parse(JSON.stringify(this.controllerConfig)); }
  setWind(w: Partial<WindConfig>) { this.drone.setWind(w); }
  setFailures(f: Partial<FailureConfig>) { this.drone.setFailures(f); }
  updateDroneParameters(p: Parameters<DroneModel['updateParameters']>[0]) { this.drone.updateParameters(p); }

  /** Latest true state for Three.js (available at full sim rate). */
  getLatestTrueState(): DroneState | null { return this.latestTrueState; }

  private controlOutputs(state: DroneState, dt: number) {
    const { position, orientation, velocity } = state;

    // Update waypoint setpoints in mission mode
    if ((this.flightMode === 'mission' || this.flightMode === 'position_hold') && this.flightMode === 'mission') {
      const target = this.waypoints.update(position, dt);
      if (target) {
        this.setpoints.position.x = target.x;
        this.setpoints.position.y = target.y;
        this.setpoints.position.z = target.z;
      }
    }
    // Also allow mission updates when flightMode === 'mission'
    const altOut  = this.altitudeController.update(this.setpoints.position.z, position.z, dt);
    const pitchDes = this.positionXController.update(this.setpoints.position.x, position.x, velocity.x, dt);
    const rollDes  = -this.positionYController.update(this.setpoints.position.y, position.y, velocity.y, dt);
    const rollOut  = this.rollController.update(rollDes, orientation.roll, dt);
    const pitchOut = this.pitchController.update(pitchDes, orientation.pitch, dt);
    const yawOut   = this.yawController.update(this.setpoints.attitude.yaw, orientation.yaw, dt);

    return { altitude: altOut, roll: rollOut, pitch: pitchOut, yaw: yawOut, positionX: pitchDes, positionY: rollDes };
  }

  private mixToMotors(ctrl: ReturnType<typeof this.controlOutputs>): MotorInputs {
    const { altitude, roll, pitch, yaw } = ctrl;
    let base: number, r: number, p: number, y: number;

    switch (this.flightMode) {
      case 'manual':
        base = this.manualInputs.throttle;
        r = this.manualInputs.roll * 0.3;
        p = this.manualInputs.pitch * 0.3;
        y = this.manualInputs.yaw * 0.3;
        break;
      case 'stabilized':
        base = this.manualInputs.throttle;
        r = roll + this.manualInputs.roll * 0.2;
        p = pitch + this.manualInputs.pitch * 0.2;
        y = yaw + this.manualInputs.yaw * 0.2;
        break;
      case 'altitude_hold':
        base = 0.65 + altitude;
        r = this.manualInputs.roll * 0.25;
        p = this.manualInputs.pitch * 0.25;
        y = yaw + this.manualInputs.yaw * 0.2;
        break;
      case 'position_hold':
      case 'mission':
      default:
        base = 0.65 + altitude;
        r = roll;
        p = pitch;
        y = yaw;
        break;
    }

    // X-config motor mixing: M1=FL(CCW) M2=FR(CW) M3=RL(CW) M4=RR(CCW)
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return {
      motor1: clamp(base + p - r + y),
      motor2: clamp(base + p + r - y),
      motor3: clamp(base - p - r - y),
      motor4: clamp(base - p + r + y),
    };
  }

  private step(dt: number): void {
    const state = this.drone.getState(); // noisy state for controller
    let motorInputs: MotorInputs;
    let ctrl: ReturnType<typeof this.controlOutputs>;
    let errors: SimulationData['errors'];

    // Mission waypoint update (runs even in non-mission mode if waypoints exist & status running)
    if (this.flightMode === 'mission') {
      const target = this.waypoints.update(state.position, dt);
      if (target) {
        this.setpoints.position.x = target.x;
        this.setpoints.position.y = target.y;
        this.setpoints.position.z = target.z;
      }
    }

    if (this.config.enableControl && this.flightMode !== 'manual') {
      ctrl = this.controlOutputs(state, dt);
      motorInputs = this.mixToMotors(ctrl);
      errors = {
        altitude:  this.altitudeController.getState().error,
        roll:      this.rollController.getState().error,
        pitch:     this.pitchController.getState().error,
        yaw:       this.yawController.getState().error,
        positionX: this.positionXController.getOuterState().error,
        positionY: this.positionYController.getOuterState().error,
      };
    } else {
      ctrl = { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };
      motorInputs = this.flightMode === 'manual'
        ? this.mixToMotors(ctrl)
        : { motor1: 0.6, motor2: 0.6, motor3: 0.6, motor4: 0.6 };
      errors = { altitude: 0, roll: 0, pitch: 0, yaw: 0, positionX: 0, positionY: 0 };
    }

    if (this.config.enablePhysics) this.drone.update(motorInputs, dt);

    this.latestTrueState = this.drone.getTrueState();

    const data: SimulationData = {
      time: this.currentTime,
      state: this.drone.getTrueState(),
      motorInputs,
      motorSpeeds: this.drone.getMotorSpeeds(),
      controlOutputs: ctrl,
      errors,
      setpoints: { ...this.setpoints },
      flightMode: this.flightMode,
      manualInputs: { ...this.manualInputs },
      missionState: this.waypoints.getMissionState(),
    };

    this.dataHistory.push(data);
    if (this.dataHistory.length > this.maxHistoryLength) this.dataHistory.shift();
    this.currentTime += dt;
  }

  private animate = (frameTime: number): void => {
    if (!this.isRunning) return;

    const wallDelta = Math.min(frameTime - this.lastFrameTime, 100); // cap at 100ms to prevent spiral
    this.lastFrameTime = frameTime;
    this.accumulatedTime += wallDelta * this.config.realTimeMultiplier;

    const stepMs = this.config.timestep * 1000;
    let stepsThisFrame = 0;
    const maxStepsPerFrame = 20; // prevent spiral of death

    while (this.accumulatedTime >= stepMs && stepsThisFrame < maxStepsPerFrame) {
      this.step(this.config.timestep);
      this.accumulatedTime -= stepMs;
      stepsThisFrame++;
    }

    // Throttle React callbacks to ~30Hz
    if (this.onUpdate && frameTime - this.lastCallbackTime >= this.callbackIntervalMs) {
      const latest = this.dataHistory[this.dataHistory.length - 1];
      if (latest) this.onUpdate(latest);
      this.lastCallbackTime = frameTime;
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.accumulatedTime = 0;
      this.animationId = requestAnimationFrame(this.animate);
    }
  }

  pause() {
    this.isRunning = false;
    if (this.animationId !== null) { cancelAnimationFrame(this.animationId); this.animationId = null; }
  }

  reset() {
    this.pause();
    this.drone.reset();
    this.currentTime = 0;
    this.accumulatedTime = 0;
    this.dataHistory = [];
    this.latestTrueState = null;
    this.lastCallbackTime = 0;
    this.altitudeController.reset();
    this.rollController.reset();
    this.pitchController.reset();
    this.yawController.reset();
    this.positionXController.reset();
    this.positionYController.reset();
    this.setpoints = { position: { x: 0, y: 0, z: 2 }, attitude: { roll: 0, pitch: 0, yaw: 0 } };
    if (this.onReset) this.onReset();
  }

  getDroneState(): DroneState { return this.drone.getTrueState(); }
  getDataHistory(): SimulationData[] { return [...this.dataHistory]; }
  getCurrentData(): SimulationData | null { return this.dataHistory[this.dataHistory.length - 1] ?? null; }
  isSimulationRunning(): boolean { return this.isRunning; }
  setUpdateCallback(cb: (data: SimulationData) => void) { this.onUpdate = cb; }
  setResetCallback(cb: () => void) { this.onReset = cb; }

  /** Export telemetry as a CSV file download. */
  exportCSV() {
    const header = 'time,x,y,z,vx,vy,vz,roll,pitch,yaw,wx,wy,wz,m1,m2,m3,m4,alt_err,roll_err,pitch_err,yaw_err\n';
    const rows = this.dataHistory.map(d => {
      const s = d.state;
      return [
        d.time.toFixed(4),
        s.position.x.toFixed(4), s.position.y.toFixed(4), s.position.z.toFixed(4),
        s.velocity.x.toFixed(4), s.velocity.y.toFixed(4), s.velocity.z.toFixed(4),
        s.orientation.roll.toFixed(4), s.orientation.pitch.toFixed(4), s.orientation.yaw.toFixed(4),
        s.angularVelocity.x.toFixed(4), s.angularVelocity.y.toFixed(4), s.angularVelocity.z.toFixed(4),
        d.motorInputs.motor1.toFixed(4), d.motorInputs.motor2.toFixed(4),
        d.motorInputs.motor3.toFixed(4), d.motorInputs.motor4.toFixed(4),
        d.errors.altitude.toFixed(4), d.errors.roll.toFixed(4),
        d.errors.pitch.toFixed(4), d.errors.yaw.toFixed(4),
      ].join(',');
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flight_log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Compute performance metrics from recent history. */
  getMetrics(): PerformanceMetrics {
    if (this.dataHistory.length < 10) {
      return { altitudeRiseTime: null, altitudeSettlingTime: null, altitudeOvershoot: null, altitudeSteadyStateError: null, positionRMSE: 0, attitudeRMSE: 0 };
    }
    const recent = this.dataHistory.slice(-500);
    const posRMSE = Math.sqrt(
      recent.reduce((s, d) => s + Math.pow(d.errors.positionX, 2) + Math.pow(d.errors.positionY, 2), 0) / (recent.length * 2)
    );
    const attRMSE = Math.sqrt(
      recent.reduce((s, d) => s + Math.pow(d.errors.roll, 2) + Math.pow(d.errors.pitch, 2), 0) / (recent.length * 2)
    );
    const lastErr = recent[recent.length - 1].errors.altitude;
    return {
      altitudeRiseTime: null,
      altitudeSettlingTime: null,
      altitudeOvershoot: null,
      altitudeSteadyStateError: Math.abs(lastErr),
      positionRMSE: posRMSE,
      attitudeRMSE: attRMSE,
    };
  }
}
