/**
 * Waypoint Mission Planner Panel
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Waypoint, WaypointPlanner, MissionState, createWaypoint } from '@/lib/mission/WaypointPlanner';
import {
  MapPin, Plus, Trash2, Play, Pause, RotateCcw,
  Navigation, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';

interface MissionPanelProps {
  planner: WaypointPlanner;
  missionState: MissionState;
  onMissionChange: () => void;
  isSimRunning: boolean;
}

function statusColor(status: MissionState['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':  return 'default';
    case 'holding':  return 'default';
    case 'paused':   return 'secondary';
    case 'completed': return 'outline';
    default: return 'secondary';
  }
}

interface WaypointRowProps {
  waypoint: Waypoint;
  index: number;
  isCurrent: boolean;
  onUpdate: (id: string, updates: Partial<Omit<Waypoint, 'id'>>) => void;
  onRemove: (id: string) => void;
}

const WaypointRow: React.FC<WaypointRowProps> = ({ waypoint, index, isCurrent, onUpdate, onRemove }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-md border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'} p-2 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          {index + 1}
        </div>
        <Input
          value={waypoint.label}
          onChange={e => onUpdate(waypoint.id, { label: e.target.value })}
          className="h-6 text-xs flex-1 min-w-0"
          placeholder="Label"
        />
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => onRemove(waypoint.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Position always visible */}
      <div className="grid grid-cols-3 gap-1">
        {(['x', 'y', 'z'] as const).map(axis => (
          <div key={axis} className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">{axis.toUpperCase()} (m)</Label>
            <Input
              type="number"
              value={waypoint.position[axis].toFixed(1)}
              onChange={e => onUpdate(waypoint.id, { position: { ...waypoint.position, [axis]: parseFloat(e.target.value) || 0 } })}
              step="0.5"
              className="h-6 text-xs"
            />
          </div>
        ))}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Hold Time (s)</Label>
            <Input
              type="number"
              value={waypoint.holdTime}
              onChange={e => onUpdate(waypoint.id, { holdTime: parseFloat(e.target.value) || 0 })}
              min="0" max="60" step="0.5"
              className="h-6 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Acceptance (m)</Label>
            <Input
              type="number"
              value={waypoint.acceptanceRadius}
              onChange={e => onUpdate(waypoint.id, { acceptanceRadius: parseFloat(e.target.value) || 0.3 })}
              min="0.1" max="3" step="0.1"
              className="h-6 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const MissionPanel: React.FC<MissionPanelProps> = ({
  planner, missionState, onMissionChange, isSimRunning
}) => {
  const waypoints = planner.getWaypoints();
  const { status, currentWaypointIndex, holdTimer, totalWaypoints, looping } = missionState;

  const addWaypoint = () => {
    const lastWp = waypoints[waypoints.length - 1];
    const pos = lastWp
      ? { x: lastWp.position.x + 2, y: lastWp.position.y, z: lastWp.position.z }
      : { x: 2, y: 0, z: 2 };
    planner.addWaypoint(createWaypoint(pos, `WP${waypoints.length + 1}`));
    onMissionChange();
  };

  const addCirclePattern = () => {
    const radius = 4;
    const count = 6;
    const height = 3;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      planner.addWaypoint(createWaypoint(
        { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: height },
        `C${i + 1}`
      ));
    }
    onMissionChange();
  };

  const addSquarePattern = () => {
    const half = 3;
    const h = 3;
    const corners = [
      { x: half, y: half, z: h }, { x: -half, y: half, z: h },
      { x: -half, y: -half, z: h }, { x: half, y: -half, z: h },
    ];
    corners.forEach((p, i) => planner.addWaypoint(createWaypoint(p, `S${i + 1}`)));
    onMissionChange();
  };

  return (
    <div className="space-y-4">
      {/* Mission status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            Mission Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant={statusColor(status)} className="capitalize">
              {status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {status === 'completed' ? 'Done' :
               status === 'idle' ? 'Not started' :
               `WP ${currentWaypointIndex + 1} / ${totalWaypoints}`}
            </span>
          </div>

          {totalWaypoints > 0 && (
            <Progress
              value={(currentWaypointIndex / Math.max(1, totalWaypoints)) * 100}
              className="h-2"
            />
          )}

          {status === 'holding' && (
            <div className="text-xs text-muted-foreground">
              Holding: {holdTimer.toFixed(1)}s / {waypoints[currentWaypointIndex]?.holdTime ?? 0}s
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm" className="flex-1 h-7 text-xs"
              disabled={!isSimRunning || totalWaypoints === 0}
              onClick={() => { if (status === 'paused') { planner.resume(); } else { planner.start(); } onMissionChange(); }}
            >
              <Play className="h-3 w-3 mr-1" />
              {status === 'paused' ? 'Resume' : 'Start'}
            </Button>
            <Button
              size="sm" variant="outline" className="flex-1 h-7 text-xs"
              disabled={status === 'idle' || status === 'completed'}
              onClick={() => { planner.pause(); onMissionChange(); }}
            >
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => { planner.reset(); onMissionChange(); }}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={looping}
              onCheckedChange={v => { planner.setLooping(v); onMissionChange(); }}
            />
            <Label className="text-xs flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Loop mission
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Waypoints */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Waypoints ({waypoints.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick patterns */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick patterns</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={addCirclePattern}>
                Circle
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={addSquarePattern}>
                Square
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs text-destructive"
                onClick={() => { planner.clearWaypoints(); onMissionChange(); }}
                disabled={waypoints.length === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          <Separator />

          {/* Waypoint list */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {waypoints.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No waypoints. Add some or click on the 3D view.
              </div>
            )}
            {waypoints.map((wp, i) => (
              <WaypointRow
                key={wp.id}
                waypoint={wp}
                index={i}
                isCurrent={status !== 'idle' && status !== 'completed' && i === currentWaypointIndex}
                onUpdate={(id, updates) => { planner.updateWaypoint(id, updates); onMissionChange(); }}
                onRemove={id => { planner.removeWaypoint(id); onMissionChange(); }}
              />
            ))}
          </div>

          <Button size="sm" className="w-full h-8 text-xs" variant="outline" onClick={addWaypoint}>
            <Plus className="h-3 w-3 mr-1" /> Add Waypoint
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-3 text-xs text-muted-foreground space-y-1">
          <p><strong>Tip:</strong> Click on the 3D ground plane to place a waypoint at that position.</p>
          <p>Switch flight mode to <strong>Mission</strong> to execute the plan.</p>
        </CardContent>
      </Card>
    </div>
  );
};
