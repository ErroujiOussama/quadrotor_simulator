/**
 * Manual Control Panel — flight mode selection, sliders, keyboard/gamepad status.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Gamepad2, Plane, RotateCw, ArrowUp, Keyboard, Info } from 'lucide-react';
import { FlightMode, ManualInputs } from '@/lib/simulation/DroneSimulator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface ManualControlPanelProps {
  flightMode: FlightMode;
  manualInputs: ManualInputs;
  keyboardActive: boolean;
  gamepadConnected: boolean;
  gamepadId: string;
  onFlightModeChange: (m: FlightMode) => void;
  onManualInputsChange: (i: Partial<ManualInputs>) => void;
  onResetInputs: () => void;
}

const modeColor = (m: FlightMode): 'destructive' | 'secondary' | 'default' | 'outline' => (
  {
    manual: 'destructive', stabilized: 'outline', altitude_hold: 'secondary',
    position_hold: 'default', mission: 'default',
  } as const
)[m];

const modeDesc = (m: FlightMode) => ({
  manual: 'Full manual — no stabilization. Challenging but educational.',
  stabilized: 'Manual throttle + automatic attitude stabilization.',
  altitude_hold: 'Altitude locked via PID. Manual roll/pitch/yaw.',
  position_hold: 'Full autonomous hover at setpoint.',
  mission: 'Autonomous waypoint navigation.',
}[m]);

export const ManualControlPanel: React.FC<ManualControlPanelProps> = ({
  flightMode, manualInputs, keyboardActive, gamepadConnected, gamepadId,
  onFlightModeChange, onManualInputsChange, onResetInputs,
}) => {
  const posHold = flightMode === 'position_hold' || flightMode === 'mission';

  return (
    <div className="space-y-4">
      {/* Input device status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Input Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Keyboard */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Keyboard</span>
            </div>
            <Badge variant={keyboardActive ? 'default' : 'secondary'} className="text-xs">
              {keyboardActive ? 'Active' : 'Idle'}
            </Badge>
          </div>
          {/* Gamepad */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">{gamepadConnected ? gamepadId.slice(0, 28) : 'No gamepad'}</span>
            </div>
            <Badge variant={gamepadConnected ? 'default' : 'outline'} className="text-xs">
              {gamepadConnected ? 'Connected' : 'Not found'}
            </Badge>
          </div>

          <Separator />

          {/* Keyboard shortcut reference */}
          <div className="bg-muted/30 rounded p-2 space-y-1 text-[10px] text-muted-foreground font-mono">
            <div className="font-semibold text-foreground text-xs mb-1">Keyboard shortcuts</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <div>W/S or ↑↓ — Pitch</div>
              <div>A/D or ←→ — Roll</div>
              <div>Q/E — Yaw</div>
              <div>Space — Throttle up</div>
              <div>Shift — Throttle down</div>
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2 space-y-0.5 text-[10px] text-muted-foreground">
            <div className="font-semibold text-foreground text-xs mb-1">Gamepad (Xbox/PS) mapping</div>
            <div>Left stick Y → Throttle | Left stick X → Yaw</div>
            <div>Right stick → Pitch / Roll</div>
          </div>
        </CardContent>
      </Card>

      {/* Flight mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plane className="h-4 w-4" /> Flight Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={flightMode} onValueChange={m => onFlightModeChange(m as FlightMode)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual"><div className="flex items-center gap-2"><Gamepad2 className="h-3 w-3" /> Manual</div></SelectItem>
              <SelectItem value="stabilized"><div className="flex items-center gap-2"><RotateCw className="h-3 w-3" /> Stabilized</div></SelectItem>
              <SelectItem value="altitude_hold"><div className="flex items-center gap-2"><ArrowUp className="h-3 w-3" /> Altitude Hold</div></SelectItem>
              <SelectItem value="position_hold"><div className="flex items-center gap-2"><Plane className="h-3 w-3" /> Position Hold</div></SelectItem>
              <SelectItem value="mission"><div className="flex items-center gap-2"><Plane className="h-3 w-3" /> Mission</div></SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Badge variant={modeColor(flightMode)}>{flightMode.replace(/_/g, ' ').toUpperCase()}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{modeDesc(flightMode)}</p>
        </CardContent>
      </Card>

      {/* Manual controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" /> Manual Inputs
            <Button variant="outline" size="sm" className="ml-auto h-6 text-xs" onClick={onResetInputs}>
              Reset
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'throttle' as const, label: 'Throttle', min: 0, max: 1, lo: 'Descent', hi: 'Climb', disabled: posHold },
            { key: 'pitch'    as const, label: 'Pitch',    min: -1, max: 1, lo: 'Backward', hi: 'Forward', disabled: posHold },
            { key: 'roll'     as const, label: 'Roll',     min: -1, max: 1, lo: 'Left', hi: 'Right', disabled: posHold },
            { key: 'yaw'      as const, label: 'Yaw',      min: -1, max: 1, lo: 'CCW', hi: 'CW', disabled: false },
          ].map(({ key, label, min, max, lo, hi, disabled }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{label}</Label>
                <Badge variant="outline" className="text-xs font-mono">
                  {(manualInputs[key] * 100).toFixed(0)}%
                </Badge>
              </div>
              <Slider
                value={[manualInputs[key]]}
                onValueChange={([v]) => onManualInputsChange({ [key]: v })}
                min={min} max={max} step={0.01} disabled={disabled}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{lo}</span>
                <span>{hi}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Virtual joystick visualization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs">Virtual Sticks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: 'Left (Thr/Yaw)', x: manualInputs.yaw, y: manualInputs.throttle - 0.5, color: 'bg-primary' },
              { label: 'Right (Pitch/Roll)', x: manualInputs.roll, y: -manualInputs.pitch, color: 'bg-chart-2' },
            ].map(({ label, x, y, color }) => (
              <div key={label} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <div className="relative w-full aspect-square bg-muted rounded-full border border-border">
                  <div className="absolute inset-0 flex items-center justify-center opacity-20">
                    <div className="w-px h-full bg-foreground" />
                    <div className="absolute h-px w-full bg-foreground" />
                  </div>
                  <div
                    className={`absolute w-4 h-4 ${color} rounded-full shadow-md transition-all duration-75`}
                    style={{ left: `calc(${50 + x * 40}% - 8px)`, top: `calc(${50 + y * 40}% - 8px)` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
