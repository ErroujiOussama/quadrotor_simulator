/**
 * Control Panel — PID tuning, setpoints, simulation speed, drone parameters.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Info, Settings, Target, Plane, Download } from 'lucide-react';
import { ControllerConfig, SetPoints, SimulationConfig } from '@/lib/simulation/DroneSimulator';
import { DroneParameters } from '@/lib/physics/DroneModel';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface ControlPanelProps {
  isRunning: boolean;
  controllerConfig: ControllerConfig;
  setpoints: SetPoints;
  droneParams: DroneParameters;
  simulationConfig: SimulationConfig;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onExport: () => void;
  onControllerConfigChange: (c: Partial<ControllerConfig>) => void;
  onSetpointsChange: (s: Partial<SetPoints>) => void;
  onDroneParamsChange: (p: Partial<DroneParameters>) => void;
  onSimulationConfigChange: (c: Partial<SimulationConfig>) => void;
}

const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent><p className="max-w-xs text-xs">{text}</p></TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface GainRowProps {
  gain: 'kp' | 'ki' | 'kd';
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}
const GainRow: React.FC<GainRowProps> = ({ gain, value, max, disabled, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <Label className="text-xs uppercase font-mono">{gain}</Label>
      <span className="text-xs font-mono text-muted-foreground">{value.toFixed(2)}</span>
    </div>
    <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={0} max={max} step={0.01} disabled={disabled} />
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning, controllerConfig, setpoints, droneParams, simulationConfig,
  onStart, onPause, onReset, onExport,
  onControllerConfigChange, onSetpointsChange, onDroneParamsChange, onSimulationConfigChange,
}) => {
  const updateAltitude = (key: 'kp' | 'ki' | 'kd', v: number) =>
    onControllerConfigChange({ altitude: { ...controllerConfig.altitude, [key]: v } });

  const updateAttitude = (axis: 'roll' | 'pitch' | 'yaw', key: 'kp' | 'ki' | 'kd', v: number) =>
    onControllerConfigChange({
      attitude: { ...controllerConfig.attitude, [axis]: { ...controllerConfig.attitude[axis], [key]: v } },
    });

  const updatePositionOuter = (axis: 'x' | 'y', key: 'kp' | 'ki' | 'kd', v: number) =>
    onControllerConfigChange({
      position: {
        ...controllerConfig.position,
        [axis]: { ...controllerConfig.position[axis], outer: { ...controllerConfig.position[axis].outer, [key]: v } },
      },
    });

  const updatePositionInner = (axis: 'x' | 'y', key: 'kp' | 'ki' | 'kd', v: number) =>
    onControllerConfigChange({
      position: {
        ...controllerConfig.position,
        [axis]: { ...controllerConfig.position[axis], inner: { ...controllerConfig.position[axis].inner, [key]: v } },
      },
    });

  return (
    <div className="space-y-4">
      {/* Simulation control */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Simulation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" variant={isRunning ? 'secondary' : 'default'}
              onClick={isRunning ? onPause : onStart}>
              {isRunning ? <><Pause className="h-3 w-3 mr-1" />Pause</> : <><Play className="h-3 w-3 mr-1" />Start</>}
            </Button>
            <Button size="sm" variant="outline" onClick={onReset}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={onExport} title="Export CSV">
              <Download className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1"><Label className="text-xs">Physics</Label><InfoTip text="Toggle physics integration" /></div>
              <Switch checked={simulationConfig.enablePhysics} onCheckedChange={v => onSimulationConfigChange({ enablePhysics: v })} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1"><Label className="text-xs">Control</Label><InfoTip text="Toggle PID controllers" /></div>
              <Switch checked={simulationConfig.enableControl} onCheckedChange={v => onSimulationConfigChange({ enableControl: v })} />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Sim Speed</Label>
              <Badge variant="outline" className="text-xs font-mono">{simulationConfig.realTimeMultiplier.toFixed(1)}×</Badge>
            </div>
            <Slider
              value={[simulationConfig.realTimeMultiplier]}
              onValueChange={([v]) => onSimulationConfigChange({ realTimeMultiplier: v })}
              min={0.1} max={5} step={0.1}
            />
          </div>
        </CardContent>
      </Card>

      {/* Setpoints */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Setpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map(ax => (
              <div key={ax} className="space-y-1">
                <Label className="text-xs">{ax === 'z' ? 'Alt' : ax.toUpperCase()} (m)</Label>
                <Input
                  type="number" step="0.5" className="h-7 text-xs"
                  value={setpoints.position[ax]}
                  onChange={e => onSetpointsChange({ position: { ...setpoints.position, [ax]: parseFloat(e.target.value) || 0 } })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Yaw</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {setpoints.attitude.yaw.toFixed(2)} rad ({(setpoints.attitude.yaw * 180 / Math.PI).toFixed(0)}°)
              </span>
            </div>
            <Slider
              value={[setpoints.attitude.yaw]}
              onValueChange={([v]) => onSetpointsChange({ attitude: { ...setpoints.attitude, yaw: v } })}
              min={-Math.PI} max={Math.PI} step={0.05}
            />
          </div>
        </CardContent>
      </Card>

      {/* Altitude PID */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plane className="h-4 w-4" /> Altitude PID
            <Switch className="ml-auto" checked={controllerConfig.altitude.enabled}
              onCheckedChange={v => onControllerConfigChange({ altitude: { ...controllerConfig.altitude, enabled: v } })} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['kp', 'ki', 'kd'] as const).map(g => (
            <GainRow key={g} gain={g} value={controllerConfig.altitude[g]}
              max={{ kp: 20, ki: 5, kd: 10 }[g]} disabled={!controllerConfig.altitude.enabled}
              onChange={v => updateAltitude(g, v)} />
          ))}
        </CardContent>
      </Card>

      {/* Attitude PID */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Attitude PID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(['roll', 'pitch', 'yaw'] as const).map(axis => {
            const cfg = controllerConfig.attitude[axis];
            return (
              <div key={axis} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm capitalize font-medium">{axis}</Label>
                  <Switch checked={cfg.enabled}
                    onCheckedChange={v => onControllerConfigChange({ attitude: { ...controllerConfig.attitude, [axis]: { ...cfg, enabled: v } } })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['kp', 'ki', 'kd'] as const).map(g => (
                    <GainRow key={g} gain={g} value={cfg[g]}
                      max={{ kp: 15, ki: 2, kd: 5 }[g]} disabled={!cfg.enabled}
                      onChange={v => updateAttitude(axis, g, v)} />
                  ))}
                </div>
                {axis !== 'yaw' && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Position PID — both outer and inner loops */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Position PID (Cascaded)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(['x', 'y'] as const).map(axis => {
            const cfg = controllerConfig.position[axis];
            return (
              <div key={axis} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{axis.toUpperCase()} Axis</Label>
                  <Switch checked={cfg.enabled}
                    onCheckedChange={v => onControllerConfigChange({ position: { ...controllerConfig.position, [axis]: { ...cfg, enabled: v } } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Outer loop (pos → vel)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['kp', 'ki', 'kd'] as const).map(g => (
                      <GainRow key={g} gain={g} value={cfg.outer[g]}
                        max={{ kp: 6, ki: 1, kd: 2 }[g]} disabled={!cfg.enabled}
                        onChange={v => updatePositionOuter(axis, g, v)} />
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Inner loop (vel → attitude)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['kp', 'ki', 'kd'] as const).map(g => (
                      <GainRow key={g} gain={g} value={cfg.inner[g]}
                        max={{ kp: 8, ki: 1, kd: 3 }[g]} disabled={!cfg.enabled}
                        onChange={v => updatePositionInner(axis, g, v)} />
                    ))}
                  </div>
                </div>
                {axis !== 'y' && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Drone parameters — now actually applied */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Drone Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Mass (kg)',      key: 'mass',    min: 0.3, max: 5,   step: 0.1  },
            { label: 'Arm length (m)', key: 'length',  min: 0.1, max: 0.5, step: 0.01 },
            { label: 'Drag coeff',     key: 'dragCoeff', min: 0, max: 0.1, step: 0.001 },
            { label: 'Max thrust (N)', key: 'maxThrust', min: 5, max: 40,  step: 0.5  },
            { label: 'ESC lag (s)',    key: 'motorTimeConstant', min: 0, max: 0.3, step: 0.005 },
          ].map(({ label, key, min, max, step }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{label}</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {(droneParams[key as keyof DroneParameters] as number).toFixed(step < 0.01 ? 3 : 2)}
                </span>
              </div>
              <Slider
                value={[droneParams[key as keyof DroneParameters] as number]}
                onValueChange={([v]) => onDroneParamsChange({ [key]: v })}
                min={min} max={max} step={step}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
