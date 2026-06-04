import { useEffect, useRef, useState } from 'react';
import { ManualInputs } from '@/lib/simulation/DroneSimulator';

const DEAD_ZONE = 0.08;

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEAD_ZONE) return 0;
  return (v - Math.sign(v) * DEAD_ZONE) / (1 - DEAD_ZONE);
}

export interface GamepadState {
  connected: boolean;
  id: string;
  axes: number[];
  buttons: boolean[];
}

/** Returns current gamepad state (polled). Call applyGamepadInputs separately. */
export function useGamepad() {
  const [state, setState] = useState<GamepadState>({ connected: false, id: '', axes: [], buttons: [] });
  const frameRef = useRef<number>();

  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      setState(prev => ({ ...prev, connected: true, id: e.gamepad.id }));
    };
    const onDisconnect = () => {
      setState({ connected: false, id: '', axes: [], buttons: [] });
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    const poll = () => {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad) {
          setState({
            connected: true,
            id: pad.id,
            axes: Array.from(pad.axes),
            buttons: Array.from(pad.buttons).map(b => b.pressed),
          });
          break;
        }
      }
      frameRef.current = requestAnimationFrame(poll);
    };
    frameRef.current = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return state;
}

/**
 * Map gamepad axes to ManualInputs.
 * Standard mapping (Xbox / generic):
 *   Axis 0 = Left stick X (yaw)
 *   Axis 1 = Left stick Y (throttle, inverted)
 *   Axis 2 = Right stick X (roll)
 *   Axis 3 = Right stick Y (pitch, inverted)
 */
export function applyGamepadInputs(gamepad: GamepadState, current: ManualInputs): ManualInputs {
  if (!gamepad.connected || gamepad.axes.length < 4) return current;
  const axes = gamepad.axes;
  return {
    yaw:      applyDeadzone(axes[0] ?? 0),
    throttle: 0.5 - applyDeadzone(axes[1] ?? 0) * 0.5,
    roll:     applyDeadzone(axes[2] ?? 0),
    pitch:    -applyDeadzone(axes[3] ?? 0),
  };
}
