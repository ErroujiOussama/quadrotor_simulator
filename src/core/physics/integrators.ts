/**
 * Pluggable fixed-step integrators (constitution FR5). Each advances a BodyState
 * by dt given a derivative function. Attitude quaternions are renormalized after
 * each step to prevent drift.
 */
import { Vec3 } from "../math/Vec3";
import { BodyState, DerivativeFn, addScaled } from "./state";

export type IntegratorName = "rk4" | "rk45" | "semi-implicit";

export type Integrator = (s: BodyState, f: DerivativeFn, dt: number) => BodyState;

function renorm(s: BodyState): BodyState {
  return { ...s, attitude: s.attitude.normalize() };
}

/** Classic 4th-order Runge–Kutta. Default — exact for quadratic trajectories. */
export const rk4: Integrator = (s, f, dt) => {
  const k1 = f(s);
  const k2 = f(addScaled(s, k1, dt * 0.5));
  const k3 = f(addScaled(s, k2, dt * 0.5));
  const k4 = f(addScaled(s, k3, dt));

  // Weighted average of the four slopes: (k1 + 2k2 + 2k3 + k4) / 6.
  const w = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
    a.add(b.scale(2)).add(c.scale(2)).add(d).scale(1 / 6);

  const next: BodyState = {
    position: s.position.add(w(k1.dPos, k2.dPos, k3.dPos, k4.dPos).scale(dt)),
    velocity: s.velocity.add(w(k1.dVel, k2.dVel, k3.dVel, k4.dVel).scale(dt)),
    // Quat lacks the chained .scale used above, so sum it explicitly.
    attitude: s.attitude.addScaled(
      k1.dQuat.addScaled(k2.dQuat, 2).addScaled(k3.dQuat, 2).addScaled(k4.dQuat, 1),
      dt / 6,
    ),
    angularVel: s.angularVel.add(w(k1.dOmega, k2.dOmega, k3.dOmega, k4.dOmega).scale(dt)),
  };
  return renorm(next);
};

/**
 * Semi-implicit (symplectic) Euler. Updates velocity/rates first, then advances
 * position/attitude with the new rates — better energy behavior, very fast.
 */
export const semiImplicit: Integrator = (s, f, dt) => {
  const d = f(s);
  const velocity = s.velocity.add(d.dVel.scale(dt));
  const angularVel = s.angularVel.add(d.dOmega.scale(dt));
  // Advance pose using the updated rates.
  const position = s.position.add(velocity.scale(dt));
  const attitude = s.attitude.addScaled(s.attitude.derivative(angularVel), dt);
  return renorm({ position, velocity, attitude, angularVel });
};

/**
 * Runge–Kutta–Fehlberg 4(5), used here as a fixed-step 5th-order step (the error
 * estimate is available for future adaptive stepping). More accurate than RK4
 * for stiff/aggressive maneuvers.
 */
export const rk45: Integrator = (s, f, dt) => {
  // Butcher tableau (RKF45).
  const k1 = f(s);
  const k2 = f(addScaled(s, k1, dt * (1 / 4)));
  const s3 = addScaled(addScaled(s, k1, dt * (3 / 32)), k2, dt * (9 / 32));
  const k3 = f(s3);
  const s4 = addScaled(addScaled(addScaled(s, k1, dt * (1932 / 2197)), k2, dt * (-7200 / 2197)), k3, dt * (7296 / 2197));
  const k4 = f(s4);
  const s5 = addScaled(addScaled(addScaled(addScaled(s, k1, dt * (439 / 216)), k2, dt * -8), k3, dt * (3680 / 513)), k4, dt * (-845 / 4104));
  const k5 = f(s5);
  const s6 = addScaled(addScaled(addScaled(addScaled(addScaled(s, k1, dt * (-8 / 27)), k2, dt * 2), k3, dt * (-3544 / 2565)), k4, dt * (1859 / 4104)), k5, dt * (-11 / 40));
  const k6 = f(s6);

  // 5th-order solution weights.
  const b = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55];
  const ks = [k1, k2, k3, k4, k5, k6];

  let position = s.position;
  let velocity = s.velocity;
  let angularVel = s.angularVel;
  let attitude = s.attitude;
  for (let i = 0; i < 6; i++) {
    const w = b[i] * dt;
    if (w === 0) continue;
    position = position.add(ks[i].dPos.scale(w));
    velocity = velocity.add(ks[i].dVel.scale(w));
    angularVel = angularVel.add(ks[i].dOmega.scale(w));
    attitude = attitude.addScaled(ks[i].dQuat, w);
  }
  return renorm({ position, velocity, attitude, angularVel });
};

export const INTEGRATORS: Record<IntegratorName, Integrator> = {
  rk4,
  rk45,
  "semi-implicit": semiImplicit,
};

export function getIntegrator(name: IntegratorName): Integrator {
  return INTEGRATORS[name] ?? rk4;
}
