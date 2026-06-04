/**
 * FPV HUD overlay — renders on top of the Three.js canvas in FPV camera mode.
 * Shows artificial horizon, altitude/speed/heading tapes, motor power bars.
 */

import React from 'react';
import { DroneState } from '@/lib/physics/DroneModel';
import { MotorInputs, FlightMode } from '@/lib/simulation/DroneSimulator';

interface FPVHudProps {
  droneState: DroneState;
  motorInputs: MotorInputs;
  flightMode: FlightMode;
  simTime: number;
}

const R2D = 180 / Math.PI;

function ArtificialHorizon({ roll, pitch }: { roll: number; pitch: number }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;
  const pitchPx = Math.max(-75, Math.min(75, pitch * 130)); // px per rad
  const rollDeg = -roll * R2D;

  return (
    <svg width={size} height={size} style={{ overflow: 'hidden' }}>
      <defs>
        <clipPath id="ahi-clip">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>

      {/* Sky + Ground, clipped to instrument circle */}
      <g clipPath="url(#ahi-clip)">
        <g transform={`rotate(${rollDeg}, ${cx}, ${cy})`}>
          <g transform={`translate(0, ${pitchPx})`}>
            {/* Sky */}
            <rect x={cx - 200} y={cy - 500} width={400} height={500} fill="#1d4ed8" />
            {/* Ground */}
            <rect x={cx - 200} y={cy} width={400} height={500} fill="#78350f" />
            {/* Horizon */}
            <line x1={cx - 200} y1={cy} x2={cx + 200} y2={cy} stroke="white" strokeWidth={2} />

            {/* Pitch marks every 5° */}
            {[-20, -15, -10, -5, 5, 10, 15, 20].map(deg => {
              const py = cy - deg * (130 / R2D);
              const len = Math.abs(deg) % 10 === 0 ? 30 : 20;
              return (
                <g key={deg}>
                  <line x1={cx - len} y1={py} x2={cx + len} y2={py} stroke="white" strokeWidth={1} opacity={0.7} />
                  <text x={cx + len + 4} y={py + 4} fill="white" fontSize={9} opacity={0.8}>{Math.abs(deg)}</text>
                </g>
              );
            })}
          </g>
        </g>
      </g>

      {/* Circle border */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth={2} />

      {/* Fixed wings reference */}
      <line x1={cx - 55} y1={cy} x2={cx - 20} y2={cy} stroke="#22c55e" strokeWidth={3} />
      <line x1={cx - 20} y1={cy} x2={cx - 20} y2={cy + 10} stroke="#22c55e" strokeWidth={3} />
      <line x1={cx + 20} y1={cy} x2={cx + 55} y2={cy} stroke="#22c55e" strokeWidth={3} />
      <line x1={cx + 20} y1={cy} x2={cx + 20} y2={cy + 10} stroke="#22c55e" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={3} fill="#22c55e" />

      {/* Bank angle tick marks */}
      {[-45, -30, -20, -10, 0, 10, 20, 30, 45].map(deg => {
        const a = (deg - 90) * (Math.PI / 180);
        const innerR = r - 8;
        const outerR = r;
        return (
          <line
            key={deg}
            x1={cx + innerR * Math.cos(a)} y1={cy + innerR * Math.sin(a)}
            x2={cx + outerR * Math.cos(a)} y2={cy + outerR * Math.sin(a)}
            stroke="#22c55e" strokeWidth={deg % 30 === 0 ? 2 : 1} opacity={0.7}
          />
        );
      })}

      {/* Roll pointer */}
      {(() => {
        const bankDeg = rollDeg;
        const a = (bankDeg - 90) * (Math.PI / 180);
        const pr = r - 12;
        const px1 = cx + pr * Math.cos(a);
        const py1 = cy + pr * Math.sin(a);
        return <circle cx={px1} cy={py1} r={4} fill="#fbbf24" />;
      })()}
    </svg>
  );
}

function BarGauge({ value, label, color = '#22c55e' }: { value: number; label: string; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontSize: 9, color: '#86efac', fontFamily: 'monospace' }}>{label}</div>
      <div style={{ width: 12, height: 50, background: 'rgba(0,0,0,0.5)', border: '1px solid #22c55e33', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: pct > 85 ? '#ef4444' : color, transition: 'height 0.1s' }} />
      </div>
      <div style={{ fontSize: 8, color: '#86efac', fontFamily: 'monospace' }}>{Math.round(pct)}%</div>
    </div>
  );
}

export const FPVHud: React.FC<FPVHudProps> = ({ droneState, motorInputs, flightMode, simTime }) => {
  const { position, velocity, orientation } = droneState;
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
  const horizontalSpeed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
  const headingDeg = ((orientation.yaw * R2D) + 360) % 360;

  const modeColors: Record<FlightMode, string> = {
    manual:       '#ef4444',
    stabilized:   '#f59e0b',
    altitude_hold:'#3b82f6',
    position_hold:'#22c55e',
    mission:      '#a855f7',
  };
  const modeColor = modeColors[flightMode] ?? '#22c55e';

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      fontFamily: 'monospace', color: '#22c55e',
      background: 'transparent',
    }}>
      {/* Top bar */}
      <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 40 }}>
        {/* Heading */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>HDG</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{headingDeg.toFixed(0).padStart(3, '0')}°</div>
        </div>
        {/* Flight mode */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>MODE</div>
          <div style={{ fontSize: 14, color: modeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
            {flightMode.replace('_', ' ')}
          </div>
        </div>
        {/* Time */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>TIME</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{simTime.toFixed(1)}s</div>
        </div>
      </div>

      {/* Center — Artificial Horizon */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
        <ArtificialHorizon roll={orientation.roll} pitch={orientation.pitch} />
      </div>

      {/* Left tape — Speed */}
      <div style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, opacity: 0.7 }}>GND SPD</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', lineHeight: 1 }}>{horizontalSpeed.toFixed(1)}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>m/s</div>
        <div style={{ marginTop: 12, fontSize: 10, opacity: 0.7 }}>3D SPD</div>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>{speed.toFixed(1)}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>m/s</div>
      </div>

      {/* Right tape — Altitude */}
      <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, opacity: 0.7 }}>ALT</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', lineHeight: 1 }}>{position.z.toFixed(2)}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>m</div>
        <div style={{ marginTop: 12, fontSize: 10, opacity: 0.7 }}>V/S</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: velocity.z >= 0 ? '#22c55e' : '#ef4444' }}>
          {velocity.z >= 0 ? '+' : ''}{velocity.z.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>m/s</div>
      </div>

      {/* Motor power bars — bottom center */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 8,
        border: '1px solid #22c55e33',
      }}>
        <BarGauge value={motorInputs.motor1} label="M1" />
        <BarGauge value={motorInputs.motor2} label="M2" />
        <BarGauge value={motorInputs.motor3} label="M3" />
        <BarGauge value={motorInputs.motor4} label="M4" />
      </div>

      {/* Position readout — bottom left */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, fontSize: 11, lineHeight: 1.6, opacity: 0.8, background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: 6 }}>
        <div>X: {position.x.toFixed(2)} m</div>
        <div>Y: {position.y.toFixed(2)} m</div>
        <div>Z: {position.z.toFixed(2)} m</div>
      </div>

      {/* Attitude readout — bottom right */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, fontSize: 11, lineHeight: 1.6, opacity: 0.8, textAlign: 'right', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: 6 }}>
        <div>Roll:  {(orientation.roll * R2D).toFixed(1)}°</div>
        <div>Pitch: {(orientation.pitch * R2D).toFixed(1)}°</div>
        <div>Yaw:   {(orientation.yaw * R2D).toFixed(1)}°</div>
      </div>

      {/* Scan lines effect */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />
    </div>
  );
};
