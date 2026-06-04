/**
 * Environment Panel — wind/turbulence, motor failures, sensor noise, battery sim.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { WindConfig, FailureConfig } from '@/lib/physics/DroneModel';
import { Wind, AlertTriangle, Radio } from 'lucide-react';

interface EnvironmentPanelProps {
  wind: WindConfig;
  failures: FailureConfig;
  onWindChange: (w: Partial<WindConfig>) => void;
  onFailureChange: (f: Partial<FailureConfig>) => void;
}

const MotorDiagram: React.FC<{
  failures: [boolean, boolean, boolean, boolean];
  onChange: (i: number, v: boolean) => void;
}> = ({ failures, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: 120, margin: '0 auto' }}>
    {/* Top-left = M1 Front-Left, Top-right = M2 Front-Right
        Bot-left = M3 Rear-Left, Bot-right = M4 Rear-Right */}
    {[0, 1, 2, 3].map(i => (
      <button
        key={i}
        onClick={() => onChange(i, !failures[i])}
        className={`rounded-full w-14 h-14 text-xs font-bold border-2 flex flex-col items-center justify-center transition-colors ${
          failures[i]
            ? 'border-destructive bg-destructive/20 text-destructive'
            : 'border-green-500 bg-green-500/10 text-green-600'
        }`}
      >
        <span>M{i + 1}</span>
        <span className="text-[9px] opacity-70">{failures[i] ? 'FAIL' : 'OK'}</span>
      </button>
    ))}
  </div>
);

export const EnvironmentPanel: React.FC<EnvironmentPanelProps> = ({
  wind, failures, onWindChange, onFailureChange,
}) => {
  const windSpeedLabel = wind.speed < 2 ? 'Calm' : wind.speed < 5 ? 'Light' : wind.speed < 10 ? 'Moderate' : 'Strong';
  const windDirDeg = Math.round(wind.direction * 180 / Math.PI);

  const toggleMotorFailure = (index: number, failed: boolean) => {
    const next: [boolean, boolean, boolean, boolean] = [...failures.motorFailures] as [boolean, boolean, boolean, boolean];
    next[index] = failed;
    onFailureChange({ motorFailures: next });
  };

  return (
    <div className="space-y-4">
      {/* Wind */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wind className="h-4 w-4" />
            Wind & Turbulence
            <Switch
              checked={wind.enabled}
              onCheckedChange={v => onWindChange({ enabled: v })}
              className="ml-auto"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={wind.enabled ? '' : 'opacity-40 pointer-events-none'}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Wind Speed</Label>
                <Badge variant="outline" className="text-xs">{wind.speed.toFixed(1)} m/s — {windSpeedLabel}</Badge>
              </div>
              <Slider
                value={[wind.speed]}
                onValueChange={([v]) => onWindChange({ speed: v })}
                min={0} max={15} step={0.1}
              />
            </div>

            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Wind Direction</Label>
                <Badge variant="outline" className="text-xs">{windDirDeg}°</Badge>
              </div>
              <Slider
                value={[wind.direction]}
                onValueChange={([v]) => onWindChange({ direction: v })}
                min={0} max={2 * Math.PI} step={0.05}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>East (0°)</span>
                <span>North (90°)</span>
                <span>West (180°)</span>
              </div>
            </div>

            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Turbulence Intensity</Label>
                <Badge variant="outline" className="text-xs">
                  {wind.turbulenceIntensity === 0 ? 'None' :
                   wind.turbulenceIntensity < 0.3 ? 'Light' :
                   wind.turbulenceIntensity < 0.7 ? 'Moderate' : 'Severe'}
                </Badge>
              </div>
              <Slider
                value={[wind.turbulenceIntensity]}
                onValueChange={([v]) => onWindChange({ turbulenceIntensity: v })}
                min={0} max={1} step={0.05}
              />
            </div>

            {/* Compass rose */}
            <div className="flex justify-center mt-3">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border border-border" />
                <div
                  className="absolute top-1/2 left-1/2 w-0.5 h-6 bg-blue-500 origin-bottom -translate-x-1/2 -translate-y-full"
                  style={{ transform: `translate(-50%, -100%) rotate(${windDirDeg}deg)`, transformOrigin: '50% 100%' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
                </div>
                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">N</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Motor Failures */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Motor Failures
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Click a motor to toggle failure. Failed motors output zero thrust.</p>
          <MotorDiagram failures={failures.motorFailures} onChange={toggleMotorFailure} />
          {failures.motorFailures.some(Boolean) && (
            <Badge variant="destructive" className="w-full justify-center">
              {failures.motorFailures.filter(Boolean).length} motor(s) failed
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Sensor Noise */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Sensor Noise
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Position Noise (σ)</Label>
              <Badge variant="outline" className="text-xs">
                {failures.sensorNoise === 0 ? 'None' : `${failures.sensorNoise.toFixed(3)} m`}
              </Badge>
            </div>
            <Slider
              value={[failures.sensorNoise]}
              onValueChange={([v]) => onFailureChange({ sensorNoise: v })}
              min={0} max={0.5} step={0.005}
            />
            <p className="text-[10px] text-muted-foreground">
              Gaussian noise added to position measurement seen by the controller.
              Simulates GPS/sensor imperfection.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardContent className="pt-3 text-xs text-muted-foreground space-y-1">
          <p><strong>Wind</strong> — Creates aerodynamic forces proportional to relative velocity. Tune your position PID to reject disturbances.</p>
          <p><strong>Turbulence</strong> — Dryden-style colored noise with 0.5s time constant.</p>
          <p><strong>Motor failure</strong> — Tests partial-authority control recovery.</p>
        </CardContent>
      </Card>
    </div>
  );
};
