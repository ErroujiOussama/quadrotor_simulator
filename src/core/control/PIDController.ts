/**
 * PID controller with derivative low-pass filter and anti-windup.
 * Pure, dependency-free (constitution P3) — the single source of truth for PID
 * (the legacy src/lib copy is removed once the UI is migrated).
 */

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PIDState {
  error: number;
  integral: number;
  derivative: number;
  lastError: number;
  output: number;
}

export class PIDController {
  private gains: PIDGains;
  private state: PIDState;
  private integralMax: number;
  private outputMax: number;
  private outputMin: number;
  private enabled: boolean;
  private filteredDerivative = 0;
  private readonly derivativeFilterCutoff = 20; // Hz

  constructor(gains: PIDGains, integralMax = 10, outputMax = 1, outputMin = -1) {
    this.gains = { ...gains };
    this.integralMax = integralMax;
    this.outputMax = outputMax;
    this.outputMin = outputMin;
    this.enabled = true;
    this.state = { error: 0, integral: 0, derivative: 0, lastError: 0, output: 0 };
  }

  update(setpoint: number, measurement: number, dt: number): number {
    if (!this.enabled) return 0;

    this.state.error = setpoint - measurement;

    this.state.integral += this.state.error * dt;
    this.state.integral = Math.max(-this.integralMax, Math.min(this.integralMax, this.state.integral));

    const rawDerivative = (this.state.error - this.state.lastError) / Math.max(dt, 1e-6);
    const rc = 1 / (2 * Math.PI * this.derivativeFilterCutoff);
    const alpha = dt / (rc + dt);
    this.filteredDerivative += alpha * (rawDerivative - this.filteredDerivative);
    this.state.derivative = this.filteredDerivative;

    const output =
      this.gains.kp * this.state.error +
      this.gains.ki * this.state.integral +
      this.gains.kd * this.state.derivative;

    this.state.output = Math.max(this.outputMin, Math.min(this.outputMax, output));
    this.state.lastError = this.state.error;
    return this.state.output;
  }

  reset(): void {
    this.state = { error: 0, integral: 0, derivative: 0, lastError: 0, output: 0 };
    this.filteredDerivative = 0;
  }

  setGains(gains: Partial<PIDGains>) { this.gains = { ...this.gains, ...gains }; }
  getGains(): PIDGains { return { ...this.gains }; }
  getState(): PIDState { return { ...this.state }; }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.reset(); }
  isEnabled(): boolean { return this.enabled; }
  setLimits(integralMax: number, outputMax: number, outputMin: number) {
    this.integralMax = integralMax;
    this.outputMax = outputMax;
    this.outputMin = outputMin;
  }
}

export class CascadedPIDController {
  private outerController: PIDController;
  private innerController: PIDController;

  constructor(outerGains: PIDGains, innerGains: PIDGains, maxVelocity = 5, maxAcceleration = 10) {
    this.outerController = new PIDController(outerGains, 10, maxVelocity, -maxVelocity);
    this.innerController = new PIDController(innerGains, 10, maxAcceleration, -maxAcceleration);
  }

  update(positionSetpoint: number, position: number, velocity: number, dt: number): number {
    const velocitySetpoint = this.outerController.update(positionSetpoint, position, dt);
    return this.innerController.update(velocitySetpoint, velocity, dt);
  }

  reset() { this.outerController.reset(); this.innerController.reset(); }
  setOuterGains(g: Partial<PIDGains>) { this.outerController.setGains(g); }
  setInnerGains(g: Partial<PIDGains>) { this.innerController.setGains(g); }
  getOuterState(): PIDState { return this.outerController.getState(); }
  getInnerState(): PIDState { return this.innerController.getState(); }
  setEnabled(enabled: boolean) { this.outerController.setEnabled(enabled); this.innerController.setEnabled(enabled); }
}
