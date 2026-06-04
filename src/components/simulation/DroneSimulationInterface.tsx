/**
 * Main Drone Simulation Interface
 * Wires simulator, visualization, mission planner, environment, controls, and telemetry.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DroneSimulator, SimulationData, FlightMode, ManualInputs, ControllerConfig, SetPoints, SimulationConfig } from '@/lib/simulation/DroneSimulator';
import { DroneState } from '@/lib/physics/DroneModel';
import { WindConfig, FailureConfig, DroneParameters } from '@/lib/physics/DroneModel';
import { DroneVisualization, CameraMode } from './DroneVisualization';
import { SimulationCharts } from '../charts/SimulationCharts';
import { ControlPanel } from '../controls/ControlPanel';
import { ManualControlPanel } from '../controls/ManualControlPanel';
import { MissionPanel } from '../mission/MissionPanel';
import { EnvironmentPanel } from '../environment/EnvironmentPanel';
import { FPVHud } from './FPVHud';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useKeyboard, applyKeyboardInputs } from '@/hooks/useKeyboard';
import { useGamepad, applyGamepadInputs } from '@/hooks/useGamepad';
import { createWaypoint } from '@/lib/mission/WaypointPlanner';
import {
  Activity, BarChart3, Settings, Monitor, BookOpen, Zap,
  MapPin, Wind, Gamepad2, Eye, EyeOff, Camera, Navigation, Crosshair
} from 'lucide-react';

export const DroneSimulationInterface: React.FC = () => {
  const simulatorRef = useRef<DroneSimulator>();
  const stateRef = useRef<DroneState | null>(null);
  const manualInputsRef = useRef<ManualInputs>({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 });
  const inputPollRef = useRef<number>();

  // ─── React state (30 Hz from simulator callback) ───────────────────
  const [currentData, setCurrentData] = useState<SimulationData | null>(null);
  const [dataHistory, setDataHistory] = useState<SimulationData[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [flightMode, setFlightMode] = useState<FlightMode>('position_hold');
  const [manualInputs, setManualInputs] = useState<ManualInputs>({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 });
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [missionTick, setMissionTick] = useState(0); // force re-render on mission change

  // ─── Config state (user controls) ─────────────────────────────────
  const [controllerConfig, setControllerConfig] = useState<ControllerConfig>(() => ({
    altitude: { kp: 8.0, ki: 0.5, kd: 2.0, enabled: true },
    attitude: {
      roll:  { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
      pitch: { kp: 6.0, ki: 0.1, kd: 1.5, enabled: true },
      yaw:   { kp: 4.0, ki: 0.05, kd: 1.0, enabled: true },
    },
    position: {
      x: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
      y: { outer: { kp: 2.0, ki: 0.1, kd: 0.5 }, inner: { kp: 3.0, ki: 0.0, kd: 0.8 }, enabled: true },
    },
  }));

  const [setpoints, setSetpoints] = useState<SetPoints>({ position: { x: 0, y: 0, z: 2 }, attitude: { roll: 0, pitch: 0, yaw: 0 } });
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({ timestep: 0.01, realTimeMultiplier: 1.0, enablePhysics: true, enableControl: true });
  const [droneParams, setDroneParams] = useState<DroneParameters>({
    mass: 1.5, length: 0.25, inertia: { Ixx: 0.0347563, Iyy: 0.0347563, Izz: 0.0577 },
    dragCoeff: 0.01, maxThrust: 15, thrustToTorqueRatio: 0.016, motorTimeConstant: 0.08,
  });
  const [wind, setWind] = useState<WindConfig>({ enabled: false, speed: 0, direction: 0, turbulenceIntensity: 0 });
  const [failures, setFailures] = useState<FailureConfig>({ motorFailures: [false, false, false, false], sensorNoise: 0 });

  // ─── Input hooks ───────────────────────────────────────────────────
  const { keysPressedRef, isActive: keyboardActive } = useKeyboard();
  const gamepadState = useGamepad();

  // ─── Initialize simulator ──────────────────────────────────────────
  useEffect(() => {
    const sim = new DroneSimulator();
    simulatorRef.current = sim;

    sim.setUpdateCallback((data: SimulationData) => {
      stateRef.current = data.state;
      setCurrentData(data);
      setDataHistory(prev => {
        const next = prev.length >= 1000 ? prev.slice(-999) : prev;
        return [...next, data];
      });
    });

    sim.setResetCallback(() => {
      stateRef.current = null;
      setCurrentData(null);
      setDataHistory([]);
      setIsRunning(false);
      setFlightMode('position_hold');
      const resetInputs: ManualInputs = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
      setManualInputs(resetInputs);
      manualInputsRef.current = resetInputs;
    });

    return () => {
      sim.pause();
      if (inputPollRef.current) cancelAnimationFrame(inputPollRef.current);
    };
  }, []);

  // ─── Input polling loop (keyboard + gamepad → simulator) ───────────
  useEffect(() => {
    let lastTime = performance.now();

    const poll = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const sim = simulatorRef.current;
      if (!sim) { inputPollRef.current = requestAnimationFrame(poll); return; }

      const mode = sim.getFlightMode();
      if (mode === 'position_hold' || mode === 'mission') {
        inputPollRef.current = requestAnimationFrame(poll);
        return;
      }

      let inputs = { ...manualInputsRef.current };

      // Gamepad takes priority over keyboard
      if (gamepadState.connected) {
        inputs = applyGamepadInputs(gamepadState, inputs);
      } else {
        inputs = applyKeyboardInputs(keysPressedRef.current, inputs, dt);
      }

      // Only update if changed
      const prev = manualInputsRef.current;
      if (inputs.pitch !== prev.pitch || inputs.roll !== prev.roll || inputs.yaw !== prev.yaw || inputs.throttle !== prev.throttle) {
        manualInputsRef.current = inputs;
        sim.setManualInputs(inputs);
        setManualInputs({ ...inputs });
      }

      inputPollRef.current = requestAnimationFrame(poll);
    };

    inputPollRef.current = requestAnimationFrame(poll);
    return () => { if (inputPollRef.current) cancelAnimationFrame(inputPollRef.current); };
  }, [gamepadState, keysPressedRef]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleStart = () => { simulatorRef.current?.start(); setIsRunning(true); };
  const handlePause = () => { simulatorRef.current?.pause(); setIsRunning(false); };
  const handleReset = () => { simulatorRef.current?.reset(); };
  const handleExport = () => { simulatorRef.current?.exportCSV(); };

  const handleControllerConfigChange = useCallback((c: Partial<ControllerConfig>) => {
    const merged = { ...controllerConfig, ...c };
    setControllerConfig(merged);
    simulatorRef.current?.setControllerConfig(merged);
  }, [controllerConfig]);

  const handleSetpointsChange = useCallback((s: Partial<SetPoints>) => {
    const merged = { ...setpoints, ...s };
    setSetpoints(merged);
    simulatorRef.current?.setSetpoints(merged);
  }, [setpoints]);

  const handleDroneParamsChange = useCallback((p: Partial<DroneParameters>) => {
    const merged = { ...droneParams, ...p };
    setDroneParams(merged);
    simulatorRef.current?.updateDroneParameters(merged);
  }, [droneParams]);

  const handleSimConfigChange = useCallback((c: Partial<SimulationConfig>) => {
    const merged = { ...simulationConfig, ...c };
    setSimulationConfig(merged);
    simulatorRef.current?.setConfig(merged);
  }, [simulationConfig]);

  const handleFlightModeChange = useCallback((m: FlightMode) => {
    simulatorRef.current?.setFlightMode(m);
    setFlightMode(m);
    if (m === 'mission') simulatorRef.current?.waypoints.start();
  }, []);

  const handleManualInputsChange = useCallback((i: Partial<ManualInputs>) => {
    const merged = { ...manualInputsRef.current, ...i };
    manualInputsRef.current = merged;
    simulatorRef.current?.setManualInputs(merged);
    setManualInputs(merged);
  }, []);

  const handleResetManualInputs = useCallback(() => {
    const reset: ManualInputs = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 };
    manualInputsRef.current = reset;
    simulatorRef.current?.setManualInputs(reset);
    setManualInputs(reset);
  }, []);

  const handleWindChange = useCallback((w: Partial<WindConfig>) => {
    const merged = { ...wind, ...w };
    setWind(merged);
    simulatorRef.current?.setWind(merged);
  }, [wind]);

  const handleFailureChange = useCallback((f: Partial<FailureConfig>) => {
    const merged = { ...failures, ...f };
    setFailures(merged);
    simulatorRef.current?.setFailures(merged);
  }, [failures]);

  const handleGroundClick = useCallback((pos: { x: number; y: number; z: number }) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    const alt = stateRef.current?.position.z ?? 2;
    sim.waypoints.addWaypoint(createWaypoint({ ...pos, z: alt }, `WP${sim.waypoints.getWaypoints().length + 1}`));
    setMissionTick(t => t + 1);
  }, []);

  const handleMissionChange = useCallback(() => { setMissionTick(t => t + 1); }, []);

  // Derived display state
  const droneState: DroneState = currentData?.state ?? {
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    orientation: { roll: 0, pitch: 0, yaw: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
  };

  const sim = simulatorRef.current;
  const waypoints = sim ? sim.waypoints.getWaypoints() : [];
  const missionState = sim ? sim.waypoints.getMissionState() : { status: 'idle' as const, currentWaypointIndex: 0, holdTimer: 0, distanceToNext: 0, totalWaypoints: 0, looping: false };

  // Camera mode label
  const cameraModeIcon = { orbit: <Eye className="h-3 w-3" />, follow: <Camera className="h-3 w-3" />, fpv: <Crosshair className="h-3 w-3" /> }[cameraMode];

  const isFPV = cameraMode === 'fpv';

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="border-b bg-card/50 backdrop-blur shrink-0">
        <div className="px-4 flex h-14 items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold tracking-tight">Quadrotor Simulator</h1>
            <Badge variant="secondary" className="text-[10px]">v2.0</Badge>
          </div>

          <div className="flex items-center gap-3 ml-auto text-xs font-mono">
            {currentData && (
              <>
                <span className="text-muted-foreground">T: <span className="text-foreground">{currentData.time.toFixed(1)}s</span></span>
                <span className="text-muted-foreground">Alt: <span className="text-foreground">{droneState.position.z.toFixed(2)}m</span></span>
                <span className="text-muted-foreground">
                  Spd: <span className="text-foreground">
                    {Math.sqrt(droneState.velocity.x**2 + droneState.velocity.y**2 + droneState.velocity.z**2).toFixed(2)}m/s
                  </span>
                </span>
              </>
            )}
            <Badge variant={isRunning ? 'default' : 'secondary'}>{isRunning ? 'Running' : 'Paused'}</Badge>
            <Badge variant="outline" className="capitalize">{flightMode.replace(/_/g, ' ')}</Badge>
            {gamepadState.connected && <Badge variant="outline" className="text-green-500"><Gamepad2 className="h-3 w-3 mr-1" />Pad</Badge>}
            {keyboardActive && <Badge variant="outline" className="text-blue-500">Keys</Badge>}
            {wind.enabled && <Badge variant="outline" className="text-cyan-500"><Wind className="h-3 w-3 mr-1" />{wind.speed.toFixed(0)}m/s</Badge>}
            {failures.motorFailures.some(Boolean) && <Badge variant="destructive">Motor Fail</Badge>}
          </div>
        </div>
      </div>

      {/* ─── Main layout ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left sidebar */}
          <ResizablePanel defaultSize={24} minSize={18} maxSize={35}>
            <div className="h-full border-r bg-card/30 flex flex-col">
              <Tabs defaultValue="pid" className="flex flex-col h-full">
                <div className="px-3 pt-3 pb-1 border-b bg-card/50 shrink-0">
                  <TabsList className="grid grid-cols-4 w-full h-8">
                    <TabsTrigger value="pid" className="text-[10px] px-1">
                      <Settings className="h-3 w-3 mr-0.5" />PID
                    </TabsTrigger>
                    <TabsTrigger value="mission" className="text-[10px] px-1">
                      <Navigation className="h-3 w-3 mr-0.5" />Plan
                    </TabsTrigger>
                    <TabsTrigger value="env" className="text-[10px] px-1">
                      <Wind className="h-3 w-3 mr-0.5" />Env
                    </TabsTrigger>
                    <TabsTrigger value="manual" className="text-[10px] px-1">
                      <Gamepad2 className="h-3 w-3 mr-0.5" />RC
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 min-h-0">
                  <TabsContent value="pid" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3">
                        <ControlPanel
                          isRunning={isRunning}
                          controllerConfig={controllerConfig}
                          setpoints={setpoints}
                          droneParams={droneParams}
                          simulationConfig={simulationConfig}
                          onStart={handleStart}
                          onPause={handlePause}
                          onReset={handleReset}
                          onExport={handleExport}
                          onControllerConfigChange={handleControllerConfigChange}
                          onSetpointsChange={handleSetpointsChange}
                          onDroneParamsChange={handleDroneParamsChange}
                          onSimulationConfigChange={handleSimConfigChange}
                        />
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="mission" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3">
                        {sim && (
                          <MissionPanel
                            planner={sim.waypoints}
                            missionState={missionState}
                            onMissionChange={handleMissionChange}
                            isSimRunning={isRunning}
                          />
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="env" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3">
                        <EnvironmentPanel
                          wind={wind}
                          failures={failures}
                          onWindChange={handleWindChange}
                          onFailureChange={handleFailureChange}
                        />
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="manual" className="h-full m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3">
                        <ManualControlPanel
                          flightMode={flightMode}
                          manualInputs={manualInputs}
                          keyboardActive={keyboardActive}
                          gamepadConnected={gamepadState.connected}
                          gamepadId={gamepadState.id}
                          onFlightModeChange={handleFlightModeChange}
                          onManualInputsChange={handleManualInputsChange}
                          onResetInputs={handleResetManualInputs}
                        />
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right area */}
          <ResizablePanel defaultSize={76} minSize={50}>
            <ResizablePanelGroup direction="vertical" className="h-full">
              {/* 3D viewport */}
              <ResizablePanel defaultSize={62} minSize={35}>
                <div className="h-full flex flex-col">
                  {/* Viewport toolbar */}
                  <div className="px-4 py-2 border-b bg-card/30 flex items-center gap-3 shrink-0">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">3D View</span>
                    <div className="ml-auto flex items-center gap-2">
                      {/* Camera mode buttons */}
                      {(['orbit', 'follow', 'fpv'] as CameraMode[]).map(m => (
                        <Button
                          key={m} size="sm" variant={cameraMode === m ? 'default' : 'outline'}
                          className="h-7 text-xs gap-1"
                          onClick={() => setCameraMode(m)}
                        >
                          {{ orbit: <Eye className="h-3 w-3" />, follow: <Camera className="h-3 w-3" />, fpv: <Crosshair className="h-3 w-3" /> }[m]}
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Button>
                      ))}
                      {waypoints.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />{waypoints.length} WP
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Three.js canvas + FPV HUD */}
                  <div className="flex-1 min-h-0 relative">
                    <DroneVisualization
                      stateRef={stateRef}
                      waypoints={waypoints}
                      missionState={missionState}
                      wind={wind}
                      cameraMode={cameraMode}
                      onGroundClick={handleGroundClick}
                      className="w-full h-full"
                    />
                    {isFPV && currentData && (
                      <FPVHud
                        droneState={droneState}
                        motorInputs={currentData.motorInputs}
                        flightMode={flightMode}
                        simTime={currentData.time}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Bottom panel — charts, telemetry, help */}
              <ResizablePanel defaultSize={38} minSize={25}>
                <Tabs defaultValue="charts" className="h-full flex flex-col">
                  <div className="border-b bg-card/30 shrink-0">
                    <TabsList className="mx-4 mt-2 mb-1 grid grid-cols-4 w-auto h-8">
                      <TabsTrigger value="charts" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Charts</TabsTrigger>
                      <TabsTrigger value="data" className="text-xs"><Activity className="h-3 w-3 mr-1" />State</TabsTrigger>
                      <TabsTrigger value="motors" className="text-xs"><Zap className="h-3 w-3 mr-1" />Motors</TabsTrigger>
                      <TabsTrigger value="help" className="text-xs"><BookOpen className="h-3 w-3 mr-1" />Help</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="charts" className="flex-1 min-h-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3">
                        <SimulationCharts data={dataHistory} />
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="data" className="flex-1 min-h-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3 grid grid-cols-2 gap-3">
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Position (m)</CardTitle></CardHeader>
                          <CardContent className="text-xs font-mono space-y-1">
                            <div>X: <span className="text-foreground">{droneState.position.x.toFixed(4)}</span></div>
                            <div>Y: <span className="text-foreground">{droneState.position.y.toFixed(4)}</span></div>
                            <div>Z: <span className="text-foreground">{droneState.position.z.toFixed(4)}</span></div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Velocity (m/s)</CardTitle></CardHeader>
                          <CardContent className="text-xs font-mono space-y-1">
                            <div>Vx: <span className="text-foreground">{droneState.velocity.x.toFixed(4)}</span></div>
                            <div>Vy: <span className="text-foreground">{droneState.velocity.y.toFixed(4)}</span></div>
                            <div>Vz: <span className="text-foreground">{droneState.velocity.z.toFixed(4)}</span></div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Attitude (rad / °)</CardTitle></CardHeader>
                          <CardContent className="text-xs font-mono space-y-1">
                            <div>Roll:  <span className="text-foreground">{droneState.orientation.roll.toFixed(3)}</span> ({(droneState.orientation.roll*180/Math.PI).toFixed(1)}°)</div>
                            <div>Pitch: <span className="text-foreground">{droneState.orientation.pitch.toFixed(3)}</span> ({(droneState.orientation.pitch*180/Math.PI).toFixed(1)}°)</div>
                            <div>Yaw:   <span className="text-foreground">{droneState.orientation.yaw.toFixed(3)}</span> ({(droneState.orientation.yaw*180/Math.PI).toFixed(1)}°)</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Angular Velocity (rad/s)</CardTitle></CardHeader>
                          <CardContent className="text-xs font-mono space-y-1">
                            <div>P: <span className="text-foreground">{droneState.angularVelocity.x.toFixed(4)}</span></div>
                            <div>Q: <span className="text-foreground">{droneState.angularVelocity.y.toFixed(4)}</span></div>
                            <div>R: <span className="text-foreground">{droneState.angularVelocity.z.toFixed(4)}</span></div>
                          </CardContent>
                        </Card>
                        {currentData && (
                          <>
                            <Card>
                              <CardHeader className="pb-2"><CardTitle className="text-xs">Setpoints</CardTitle></CardHeader>
                              <CardContent className="text-xs font-mono space-y-1">
                                <div>X: {currentData.setpoints.position.x.toFixed(2)}</div>
                                <div>Y: {currentData.setpoints.position.y.toFixed(2)}</div>
                                <div>Z: {currentData.setpoints.position.z.toFixed(2)}</div>
                                <div>Yaw: {(currentData.setpoints.attitude.yaw*180/Math.PI).toFixed(1)}°</div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2"><CardTitle className="text-xs">Control Errors</CardTitle></CardHeader>
                              <CardContent className="text-xs font-mono space-y-1">
                                <div>Alt: {currentData.errors.altitude.toFixed(4)} m</div>
                                <div>Roll: {currentData.errors.roll.toFixed(4)} rad</div>
                                <div>Pitch: {currentData.errors.pitch.toFixed(4)} rad</div>
                                <div>X: {currentData.errors.positionX.toFixed(4)} m</div>
                                <div>Y: {currentData.errors.positionY.toFixed(4)} m</div>
                              </CardContent>
                            </Card>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="motors" className="flex-1 min-h-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3 space-y-3">
                        {currentData && (
                          <>
                            <Card>
                              <CardHeader className="pb-2"><CardTitle className="text-xs">Motor Commands (%)</CardTitle></CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 gap-2">
                                  {(['motor1','motor2','motor3','motor4'] as const).map((m, i) => {
                                    const val = currentData.motorInputs[m];
                                    const failed = failures.motorFailures[i];
                                    return (
                                      <div key={m} className={`space-y-1 ${failed ? 'opacity-40' : ''}`}>
                                        <div className="flex items-center justify-between text-xs font-mono">
                                          <span className={failed ? 'text-destructive' : ''}>{`M${i+1} ${['FL','FR','RL','RR'][i]}`}</span>
                                          <span>{(val*100).toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                          <div className="h-full bg-primary rounded-full transition-all duration-100" style={{ width: `${val*100}%` }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2"><CardTitle className="text-xs">Actual Motor Speeds (ESC output)</CardTitle></CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 gap-2">
                                  {currentData.motorSpeeds.map((spd, i) => (
                                    <div key={i} className="space-y-1">
                                      <div className="flex justify-between text-xs font-mono">
                                        <span>M{i+1}</span><span>{(spd*100).toFixed(1)}%</span>
                                      </div>
                                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-chart-2 rounded-full transition-all duration-100" style={{ width: `${spd*100}%` }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="help" className="flex-1 min-h-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-3 space-y-3 text-xs">
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Quick Start</CardTitle></CardHeader>
                          <CardContent className="space-y-2 text-muted-foreground">
                            <p>1. Click <strong>Start</strong> in the PID tab — drone hovers at Z=2m.</p>
                            <p>2. Adjust <strong>Setpoints</strong> to move the drone to a new position.</p>
                            <p>3. Use <strong>Plan</strong> tab to define waypoints and click <strong>Mission</strong> mode.</p>
                            <p>4. Switch to <strong>FPV</strong> camera for the cockpit view.</p>
                            <p>5. Flip to <strong>RC</strong> tab and press <strong>Manual/Stabilized</strong>, then fly with WASD keys or gamepad.</p>
                            <p>6. Add wind in the <strong>Env</strong> tab and tune PIDs to reject disturbances.</p>
                            <p>7. Click the grid to drop waypoints. Use <strong>Export CSV</strong> (↓ button) to download logs.</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Physics</CardTitle></CardHeader>
                          <CardContent className="space-y-1 text-muted-foreground">
                            <p>• 6DOF Newton-Euler dynamics with RK4 integration</p>
                            <p>• Motor ESC first-order dynamics (configurable lag)</p>
                            <p>• Quadratic aerodynamic drag (body + wind-relative)</p>
                            <p>• Dryden-style turbulence (colored noise, 0.5s time constant)</p>
                            <p>• Ground collision with friction</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-xs">Control Architecture</CardTitle></CardHeader>
                          <CardContent className="space-y-1 text-muted-foreground">
                            <p>• Outer position loop (pos → velocity setpoint)</p>
                            <p>• Inner velocity loop (vel → attitude command)</p>
                            <p>• Attitude loop (roll/pitch/yaw PID)</p>
                            <p>• Altitude hold (independent Z PID)</p>
                            <p>• All gains tunable live with derivative filter</p>
                          </CardContent>
                        </Card>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};
