import { useEffect, useRef, useState } from 'react';
import { ManualInputs } from '@/lib/simulation/DroneSimulator';

const AXIS_RATE = 1.5;   // units/s for pitch/roll/yaw
const THROTTLE_RATE = 0.6; // units/s for throttle
const CENTER_RATE = 4.0; // auto-centering rate for pitch/roll/yaw

/** Returns a ref to the currently pressed key set, plus a boolean indicating any activity. */
export function useKeyboard() {
  const keysPressedRef = useRef<Set<string>>(new Set());
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't capture keys when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!keysPressedRef.current.has(e.code)) {
        keysPressedRef.current.add(e.code);
        setIsActive(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
      setIsActive(keysPressedRef.current.size > 0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return { keysPressedRef, isActive };
}

/**
 * Apply currently pressed keys to manual inputs.
 * Call this each animation frame with the current dt.
 */
export function applyKeyboardInputs(
  keysPressed: Set<string>,
  current: ManualInputs,
  dt: number
): ManualInputs {
  let { pitch, roll, yaw, throttle } = current;

  const pitchFwd  = keysPressed.has('KeyW') || keysPressed.has('ArrowUp');
  const pitchBack = keysPressed.has('KeyS') || keysPressed.has('ArrowDown');
  const rollRight = keysPressed.has('KeyD') || keysPressed.has('ArrowRight');
  const rollLeft  = keysPressed.has('KeyA') || keysPressed.has('ArrowLeft');
  const yawRight  = keysPressed.has('KeyE');
  const yawLeft   = keysPressed.has('KeyQ');
  const thrUp     = keysPressed.has('Space');
  const thrDown   = keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight');

  if (pitchFwd)  pitch = Math.min(1, pitch + AXIS_RATE * dt);
  if (pitchBack) pitch = Math.max(-1, pitch - AXIS_RATE * dt);
  if (!pitchFwd && !pitchBack) pitch *= Math.max(0, 1 - CENTER_RATE * dt);

  if (rollRight) roll = Math.min(1, roll + AXIS_RATE * dt);
  if (rollLeft)  roll = Math.max(-1, roll - AXIS_RATE * dt);
  if (!rollRight && !rollLeft) roll *= Math.max(0, 1 - CENTER_RATE * dt);

  if (yawRight) yaw = Math.min(1, yaw + AXIS_RATE * dt);
  if (yawLeft)  yaw = Math.max(-1, yaw - AXIS_RATE * dt);
  if (!yawRight && !yawLeft) yaw *= Math.max(0, 1 - CENTER_RATE * dt);

  if (thrUp)   throttle = Math.min(1, throttle + THROTTLE_RATE * dt);
  if (thrDown) throttle = Math.max(0, throttle - THROTTLE_RATE * dt);

  // Snap tiny values to zero
  if (Math.abs(pitch) < 0.01) pitch = 0;
  if (Math.abs(roll) < 0.01) roll = 0;
  if (Math.abs(yaw) < 0.01) yaw = 0;

  return { pitch, roll, yaw, throttle };
}
