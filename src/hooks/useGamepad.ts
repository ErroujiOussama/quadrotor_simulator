import { useEffect, useRef, useState } from 'react';
import { ManualInputs } from '@/lib/simulation/DroneSimulator';

const DEAD_ZONE = 0.08;

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEAD_ZONE) return 0;
  return (v - Math.sign(v) * DEAD_ZONE) / (1 - DEAD_ZONE);
}

/** Live axis/button snapshot, read every frame from a ref (no React re-render). */
export interface GamepadSnapshot {
  axes: number[];
  buttons: boolean[];
}

export interface UseGamepad {
  /** True when any controller is connected. (React state — changes rarely.) */
  connected: boolean;
  /** Controller name (e.g. "DualShock 4", "Xbox Controller"). */
  id: string;
  /** Live snapshot ref — poll this in your animation loop. */
  snapshotRef: React.MutableRefObject<GamepadSnapshot>;
}

/**
 * Standard Gamepad-API button indices. PS4 (DualShock/DualSense) and Xbox both
 * report the "standard" mapping in modern browsers, so these line up.
 */
export const GP = {
  CROSS: 0, A: 0,
  CIRCLE: 1, B: 1,
  SQUARE: 2, X: 2,
  TRIANGLE: 3, Y: 3,
  L1: 4, R1: 5, L2: 6, R2: 7,
  SHARE: 8, OPTIONS: 9, START: 9,
  L3: 10, R3: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
  PS: 16,
} as const;

/**
 * Detects any connected controller (PS4/PS5/Xbox/generic) via the Gamepad API.
 * Axes/buttons live in a ref updated each animation frame; only connected/id are
 * React state, so a steady stream of stick movement does NOT re-render the app.
 */
export function useGamepad(): UseGamepad {
  const [info, setInfo] = useState<{ connected: boolean; id: string; index: number }>({
    connected: false, id: '', index: -1,
  });
  const snapshotRef = useRef<GamepadSnapshot>({ axes: [], buttons: [] });
  const rafRef = useRef<number>();

  useEffect(() => {
    const poll = () => {
      const pads = navigator.getGamepads();
      let active: Gamepad | null = null;
      for (const p of pads) { if (p) { active = p; break; } }

      if (active) {
        snapshotRef.current = {
          axes: Array.from(active.axes),
          buttons: Array.from(active.buttons, (b) => b.pressed),
        };
        setInfo((prev) =>
          prev.connected && prev.index === active!.index && prev.id === active!.id
            ? prev
            : { connected: true, id: active!.id, index: active!.index },
        );
      } else {
        if (snapshotRef.current.axes.length || snapshotRef.current.buttons.length) {
          snapshotRef.current = { axes: [], buttons: [] };
        }
        setInfo((prev) => (prev.connected ? { connected: false, id: '', index: -1 } : prev));
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return { connected: info.connected, id: info.id, snapshotRef };
}

/**
 * Map gamepad sticks to ManualInputs (Mode-2 RC layout):
 *   Left stick  → yaw (X), throttle (Y, inverted)
 *   Right stick → roll (X), pitch (Y, inverted)
 */
export function applyGamepadInputs(snap: GamepadSnapshot, current: ManualInputs): ManualInputs {
  const axes = snap.axes;
  if (axes.length < 4) return current;
  return {
    yaw:      applyDeadzone(axes[0] ?? 0),
    throttle: 0.5 - applyDeadzone(axes[1] ?? 0) * 0.5,
    roll:     applyDeadzone(axes[2] ?? 0),
    pitch:    -applyDeadzone(axes[3] ?? 0),
  };
}

/** Returns indices of buttons that went from up→down since `prev`. */
export function buttonEdges(snap: GamepadSnapshot, prev: boolean[]): number[] {
  const edges: number[] = [];
  for (let i = 0; i < snap.buttons.length; i++) {
    if (snap.buttons[i] && !prev[i]) edges.push(i);
  }
  return edges;
}

/** Short label for a known controller id. */
export function controllerLabel(id: string): string {
  const s = id.toLowerCase();
  if (s.includes('dualsense') || s.includes('0ce6')) return 'PS5 DualSense';
  if (s.includes('dualshock') || s.includes('054c') || s.includes('09cc') || s.includes('05c4')) return 'PS4 DualShock';
  if (s.includes('xbox') || s.includes('xinput') || s.includes('045e')) return 'Xbox Controller';
  // Gamepad ids are often "Name (Vendor: xxxx Product: yyyy)" — keep the name part.
  return id.split('(')[0].trim() || 'Controller';
}
