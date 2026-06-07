/**
 * FlyLab Studio — the application shell.
 *
 * A pro "studio" layout: top command bar (transport + flight-mode + status),
 * a left activity rail that switches collapsible tool panels, a center 3D
 * viewport with a floating toolbar, an always-on telemetry inspector on the
 * right, a collapsible charts dock at the bottom, a global status bar, a
 * command palette (⌘K), and keyboard shortcuts. All simulator wiring and the
 * tool panels are reused unchanged — only the shell is new.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DroneSimulator, SimulationData, FlightMode, ManualInputs, ControllerConfig, SetPoints, SimulationConfig, AirframeType } from '@/lib/simulation/DroneSimulator';
import { DroneState } from '@/lib/physics/DroneModel';
import { WindConfig, FailureConfig, DroneParameters } from '@/lib/physics/DroneModel';
import { DroneVisualization, CameraMode } from './DroneVisualization';
import { SimulationCharts } from '../charts/SimulationCharts';
import { ControlPanel } from '../controls/ControlPanel';
import { ManualControlPanel } from '../controls/ManualControlPanel';
import { MissionPanel } from '../mission/MissionPanel';
import { EnvironmentPanel } from '../environment/EnvironmentPanel';
import { ExperimentPanel } from '../experiments/ExperimentPanel';
import { FPVHud } from './FPVHud';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useKeyboard, applyKeyboardInputs } from '@/hooks/useKeyboard';
import { useGamepad, applyGamepadInputs, buttonEdges, GP, controllerLabel } from '@/hooks/useGamepad';
import { createWaypoint } from '@/lib/mission/WaypointPlanner';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import {
  Play, Pause, RotateCcw, Download, Zap, Wind, Gamepad2, Eye, Camera, Crosshair,
  Navigation, SlidersHorizontal, BatteryMedium, Command as CommandIcon, Keyboard,
  Activity, Plane, Cpu, Gauge, ChevronDown, LocateFixed, FlaskConical,
} from 'lucide-react';

type LeftSection = 'tune' | 'mission' | 'env' | 'rc' | 'lab';

const FLIGHT_MODES: { id: FlightMode; short: string; label: string }[] = [
  { id: 'manual', short: 'MAN', label: 'Manual' },
  { id: 'stabilized', short: 'STAB', label: 'Stabilized' },
  { id: 'altitude_hold', short: 'ALT', label: 'Altitude Hold' },
  { id: 'position_hold', short: 'POS', label: 'Position Hold' },
  { id: 'mission', short: 'MISN', label: 'Mission' },
];

const AIRFRAMES: { id: AirframeType; label: string }[] = [
  { id: 'quad_x', label: 'Quad X' },
  { id: 'quad_plus', label: 'Quad +' },
  { id: 'hexa_x', label: 'Hexa X' },
  { id: 'octo_x', label: 'Octo X' },
];

const CAMERA_MODES: { id: CameraMode; icon: React.ReactNode; label: string }[] = [
  { id: 'orbit', icon: <Eye className="h-3.5 w-3.5" />, label: 'Orbit' },
  { id: 'follow', icon: <Camera className="h-3.5 w-3.5" />, label: 'Follow' },
  { id: 'fpv', icon: <Crosshair className="h-3.5 w-3.5" />, label: 'FPV' },
];

const RAIL: { id: LeftSection; icon: React.ReactNode; label: string }[] = [
  { id: 'tune', icon: <SlidersHorizontal className="h-5 w-5" />, label: 'Tuning & Setup' },
  { id: 'mission', icon: <Navigation className="h-5 w-5" />, label: 'Mission Planner' },
  { id: 'env', icon: <Wind className="h-5 w-5" />, label: 'Environment & Faults' },
  { id: 'rc', icon: <Gamepad2 className="h-5 w-5" />, label: 'Manual / RC' },
  { id: 'lab', icon: <FlaskConical className="h-5 w-5" />, label: 'Experiments' },
];

const RAD2DEG = 180 / Math.PI;

export const DroneSimulationInterface: React.FC = () => {
  const simulatorRef = useRef<DroneSimulator>();
  const stateRef = useRef<DroneState | null>(null);
  const manualInputsRef = useRef<ManualInputs>({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 });
  const inputPollRef = useRef<number>();
  // Gamepad button actions, kept fresh each render so the poll loop isn't stale.
  const padActionsRef = useRef<{ togglePlay: () => void; reset: () => void; cycleCamera: () => void; setMode: (m: FlightMode) => void } | null>(null);

  // ─── React state (30 Hz from simulator callback) ───────────────────
  const [currentData, setCurrentData] = useState<SimulationData | null>(null);
  const [dataHistory, setDataHistory] = useState<SimulationData[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [flightMode, setFlightMode] = useState<FlightMode>('position_hold');
  const [manualInputs, setManualInputs] = useState<ManualInputs>({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 });
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [airframe, setAirframe] = useState<AirframeType>('quad_x');
  const [estimationOn, setEstimationOn] = useState(false);
  const [missionTick, setMissionTick] = useState(0); // force re-render on mission change

  // ─── Shell state ───────────────────────────────────────────────────
  const [leftSection, setLeftSection] = useState<LeftSection>('tune');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fps, setFps] = useState(0);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const bottomPanelRef = useRef<ImperativePanelHandle>(null);

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
  const gamepad = useGamepad();

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
    let prevButtons: boolean[] = [];

    const poll = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const sim = simulatorRef.current;
      if (!sim) { inputPollRef.current = requestAnimationFrame(poll); return; }

      const snap = gamepad.snapshotRef.current;
      const hasPadAxes = snap.axes.length >= 4;

      // Gamepad button actions — work in ANY flight mode (edge-triggered).
      if (snap.buttons.length) {
        const act = padActionsRef.current;
        for (const b of buttonEdges(snap, prevButtons)) {
          if (!act) break;
          if (b === GP.OPTIONS) act.togglePlay();          // Options/Start → start/pause
          else if (b === GP.SHARE) act.reset();            // Share → reset
          else if (b === GP.TRIANGLE) act.cycleCamera();   // Triangle → camera
          else if (b === GP.R1 || b === GP.L1) {           // shoulders → cycle flight mode
            const cur = sim.getFlightMode();
            const i = FLIGHT_MODES.findIndex(m => m.id === cur);
            const n = FLIGHT_MODES.length;
            const next = b === GP.R1 ? (i + 1) % n : (i - 1 + n) % n;
            act.setMode(FLIGHT_MODES[next].id);
          }
        }
        prevButtons = snap.buttons.slice();
      }

      // Stick → manual inputs only in pilot-controllable modes.
      const mode = sim.getFlightMode();
      if (mode === 'position_hold' || mode === 'mission') {
        inputPollRef.current = requestAnimationFrame(poll);
        return;
      }

      let inputs = { ...manualInputsRef.current };
      if (hasPadAxes) {
        inputs = applyGamepadInputs(snap, inputs); // gamepad takes priority over keyboard
      } else {
        inputs = applyKeyboardInputs(keysPressedRef.current, inputs, dt);
      }

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
  }, [gamepad.snapshotRef, keysPressedRef]);

  // ─── FPS meter ─────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now();
    const loop = (t: number) => {
      frames++;
      if (t - last >= 1000) { setFps(Math.round((frames * 1000) / (t - last))); frames = 0; last = t; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleStart = () => { simulatorRef.current?.start(); setIsRunning(true); };
  const handlePause = () => { simulatorRef.current?.pause(); setIsRunning(false); };
  const handleReset = () => { simulatorRef.current?.reset(); };
  const handleExport = () => { simulatorRef.current?.exportCSV(); };
  const togglePlay = useCallback(() => { if (isRunning) { handlePause(); } else { handleStart(); } }, [isRunning]);

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

  const handleAirframeChange = useCallback((type: AirframeType) => {
    simulatorRef.current?.setAirframe(type);
    setAirframe(type);
    simulatorRef.current?.reset(); // clear telemetry of the previous rotor count
  }, []);

  const toggleEstimation = useCallback(() => {
    setEstimationOn(on => {
      const next = !on;
      simulatorRef.current?.setEstimation({ enabled: next });
      return next;
    });
  }, []);

  // ─── Panel collapse helpers ────────────────────────────────────────
  const togglePanel = (ref: React.RefObject<ImperativePanelHandle>) => {
    const p = ref.current; if (!p) return;
    if (p.isCollapsed()) { p.expand(); } else { p.collapse(); }
  };
  const selectSection = (s: LeftSection) => {
    setLeftSection(s);
    const p = leftPanelRef.current;
    if (p?.isCollapsed()) p.expand();
  };
  const cycleCamera = useCallback(() => {
    setCameraMode(m => CAMERA_MODES[(CAMERA_MODES.findIndex(c => c.id === m) + 1) % CAMERA_MODES.length].id);
  }, []);

  // ─── Global keyboard shortcuts (avoid flight keys WASD/QE/Space/Shift/arrows) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'p': case 'P': e.preventDefault(); togglePlay(); break;
        case 'r': case 'R': e.preventDefault(); handleReset(); break;
        case 'c': case 'C': e.preventDefault(); cycleCamera(); break;
        case '?': e.preventDefault(); setShortcutsOpen(o => !o); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, cycleCamera]);

  // ─── Derived display state ─────────────────────────────────────────
  const droneState: DroneState = currentData?.state ?? {
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    orientation: { roll: 0, pitch: 0, yaw: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
  };

  // Keep gamepad button actions pointing at the latest handlers (avoids stale closures).
  padActionsRef.current = { togglePlay, reset: handleReset, cycleCamera, setMode: handleFlightModeChange };

  const sim = simulatorRef.current;
  const metrics = currentData ? sim?.getMetrics() : undefined;
  const waypoints = sim ? sim.waypoints.getWaypoints() : [];
  const missionState = sim ? sim.waypoints.getMissionState() : { status: 'idle' as const, currentWaypointIndex: 0, holdTimer: 0, distanceToNext: 0, totalWaypoints: 0, looping: false };
  const isFPV = cameraMode === 'fpv';
  const speed = Math.sqrt(droneState.velocity.x ** 2 + droneState.velocity.y ** 2 + droneState.velocity.z ** 2);
  const battery = currentData?.battery;

  const runPalette = (fn: () => void) => { fn(); setPaletteOpen(false); };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden select-none">
        {/* ═══ Top command bar ═══════════════════════════════════════ */}
        <header className="h-12 shrink-0 border-b border-border bg-card/60 backdrop-blur flex items-center gap-3 px-3">
          {/* Brand */}
          <div className="flex items-center gap-2 pr-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-cyan-300 flex items-center justify-center shadow-sm">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="leading-none">
              <div className="text-sm font-bold tracking-tight">FlyLab</div>
              <div className="text-[9px] text-muted-foreground -mt-0.5">Flight Studio</div>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Transport */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset <kbd className="ml-1 text-[10px]">R</kbd></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5 min-w-[92px]" onClick={togglePlay}>
                  {isRunning ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Start</>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start / Pause <kbd className="ml-1 text-[10px]">P</kbd></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export flight log (CSV)</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Flight-mode segmented control */}
          <div className="flex items-center rounded-md border border-border bg-background/50 p-0.5">
            {FLIGHT_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => handleFlightModeChange(m.id)}
                className={`px-2 h-7 rounded text-[11px] font-medium tracking-wide transition-colors ${
                  flightMode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={m.label}
              >
                {m.short}
              </button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Airframe selector */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={airframe}
                  onChange={(e) => handleAirframeChange(e.target.value as AirframeType)}
                  className="h-8 rounded-md border border-border bg-background/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {AIRFRAMES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </TooltipTrigger>
            <TooltipContent>Airframe (resets the sim)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={estimationOn ? 'default' : 'outline'}
                className="h-8 gap-1.5 text-xs"
                onClick={toggleEstimation}
              >
                <LocateFixed className="h-3.5 w-3.5" />EKF
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle state estimation (sensors + estimator, display-only)</TooltipContent>
          </Tooltip>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span>T <span className="text-foreground">{(currentData?.time ?? 0).toFixed(1)}s</span></span>
              <span>·</span>
              <span>FPS <span className="text-foreground">{fps}</span></span>
              {battery && (
                <>
                  <span>·</span>
                  <span className={battery.soc < 0.15 ? 'text-red-400' : battery.soc < 0.35 ? 'text-amber-400' : 'text-emerald-400'}>
                    <BatteryMedium className="h-3.5 w-3.5 inline -mt-0.5 mr-0.5" />{(battery.soc * 100).toFixed(0)}%
                  </span>
                </>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => setPaletteOpen(true)}>
              <CommandIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Commands</span>
              <kbd className="ml-1 px-1 rounded bg-muted text-[10px]">⌘K</kbd>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts <kbd className="ml-1 text-[10px]">?</kbd></TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* ═══ Body: rail + docks ════════════════════════════════════ */}
        <div className="flex-1 min-h-0 flex">
          {/* Activity rail */}
          <nav className="w-12 shrink-0 border-r border-border bg-card/40 flex flex-col items-center py-2 gap-1">
            {RAIL.map(item => {
              const active = leftSection === item.id && !leftCollapsed;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => (active ? togglePanel(leftPanelRef) : selectSection(item.id))}
                      className={`relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />}
                      {item.icon}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
            <div className="mt-auto flex flex-col gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => togglePanel(rightPanelRef)}
                    className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                      rightCollapsed ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-primary bg-primary/10'
                    }`}
                  >
                    <Activity className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Toggle telemetry</TooltipContent>
              </Tooltip>
            </div>
          </nav>

          {/* Resizable docks */}
          <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
            {/* Left tool panel */}
            <ResizablePanel
              ref={leftPanelRef}
              id="left" order={1}
              defaultSize={23} minSize={16} collapsible collapsedSize={0}
              onCollapse={() => setLeftCollapsed(true)} onExpand={() => setLeftCollapsed(false)}
              className="bg-card/30"
            >
              <div className="h-full flex flex-col">
                <PanelHeader
                  icon={RAIL.find(r => r.id === leftSection)!.icon}
                  title={RAIL.find(r => r.id === leftSection)!.label}
                  onClose={() => togglePanel(leftPanelRef)}
                />
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-3">
                    {leftSection === 'tune' && (
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
                    )}
                    {leftSection === 'mission' && sim && (
                      <MissionPanel
                        planner={sim.waypoints}
                        missionState={missionState}
                        onMissionChange={handleMissionChange}
                        isSimRunning={isRunning}
                      />
                    )}
                    {leftSection === 'env' && (
                      <EnvironmentPanel
                        wind={wind}
                        failures={failures}
                        onWindChange={handleWindChange}
                        onFailureChange={handleFailureChange}
                      />
                    )}
                    {leftSection === 'rc' && (
                      <ManualControlPanel
                        flightMode={flightMode}
                        manualInputs={manualInputs}
                        keyboardActive={keyboardActive}
                        gamepadConnected={gamepad.connected}
                        gamepadId={gamepad.connected ? controllerLabel(gamepad.id) : gamepad.id}
                        onFlightModeChange={handleFlightModeChange}
                        onManualInputsChange={handleManualInputsChange}
                        onResetInputs={handleResetManualInputs}
                      />
                    )}
                    {leftSection === 'lab' && <ExperimentPanel />}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center: viewport + bottom dock */}
            <ResizablePanel id="center" order={2} defaultSize={54} minSize={30}>
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel id="viewport" order={1} defaultSize={66} minSize={30}>
                  <div className="h-full relative bg-[#0b1220]">
                    <DroneVisualization
                      stateRef={stateRef}
                      waypoints={waypoints}
                      missionState={missionState}
                      wind={wind}
                      cameraMode={cameraMode}
                      airframe={sim?.getAirframe()}
                      onGroundClick={handleGroundClick}
                      className="w-full h-full"
                    />
                    {isFPV && currentData && (
                      <FPVHud
                        droneState={droneState}
                        motorThrottles={currentData.motorThrottles}
                        flightMode={flightMode}
                        simTime={currentData.time}
                      />
                    )}

                    {/* Floating top-left status */}
                    <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                      <div className="px-2.5 h-7 rounded-md bg-background/70 backdrop-blur border border-border flex items-center gap-2 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
                        <span className="font-medium">{isRunning ? 'LIVE' : 'PAUSED'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="capitalize text-muted-foreground">{flightMode.replace(/_/g, ' ')}</span>
                      </div>
                      {waypoints.length > 0 && (
                        <div className="px-2 h-7 rounded-md bg-background/70 backdrop-blur border border-border flex items-center gap-1 text-xs text-muted-foreground">
                          <Navigation className="h-3 w-3" />{waypoints.length}
                        </div>
                      )}
                    </div>

                    {/* Floating camera toolbar */}
                    <div className="absolute top-3 right-3 flex items-center gap-1 p-0.5 rounded-lg bg-background/70 backdrop-blur border border-border">
                      {CAMERA_MODES.map(c => (
                        <Tooltip key={c.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setCameraMode(c.id)}
                              className={`h-7 px-2 rounded-md flex items-center gap-1.5 text-xs transition-colors ${
                                cameraMode === c.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                              }`}
                            >
                              {c.icon}<span className="hidden xl:inline">{c.label}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{c.label} view</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>

                    {/* Floating bottom-left HUD readout */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 h-8 rounded-md bg-background/70 backdrop-blur border border-border font-mono text-[11px] pointer-events-none">
                      <span className="text-muted-foreground">ALT <span className="text-foreground">{droneState.position.z.toFixed(2)}m</span></span>
                      <span className="text-muted-foreground">SPD <span className="text-foreground">{speed.toFixed(2)}m/s</span></span>
                      <span className="text-muted-foreground">HDG <span className="text-foreground">{((droneState.orientation.yaw * RAD2DEG + 360) % 360).toFixed(0)}°</span></span>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Bottom charts dock */}
                <ResizablePanel
                  ref={bottomPanelRef}
                  id="dock" order={2}
                  defaultSize={34} minSize={12} collapsible collapsedSize={0}
                  onCollapse={() => setBottomCollapsed(true)} onExpand={() => setBottomCollapsed(false)}
                >
                  <div className="h-full flex flex-col bg-card/20">
                    <PanelHeader
                      icon={<Gauge className="h-3.5 w-3.5" />}
                      title="Telemetry Charts"
                      onClose={() => togglePanel(bottomPanelRef)}
                    />
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-3"><SimulationCharts data={dataHistory} /></div>
                    </ScrollArea>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right telemetry inspector */}
            <ResizablePanel
              ref={rightPanelRef}
              id="right" order={3}
              defaultSize={23} minSize={16} collapsible collapsedSize={0}
              onCollapse={() => setRightCollapsed(true)} onExpand={() => setRightCollapsed(false)}
              className="bg-card/30"
            >
              <div className="h-full flex flex-col">
                <PanelHeader icon={<Activity className="h-3.5 w-3.5" />} title="Telemetry" onClose={() => togglePanel(rightPanelRef)} />
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-3 space-y-3">
                    <InspectorSection icon={<Plane className="h-3.5 w-3.5" />} title="State">
                      <TeleRow label="Position" value={`${droneState.position.x.toFixed(2)}, ${droneState.position.y.toFixed(2)}, ${droneState.position.z.toFixed(2)} m`} />
                      <TeleRow label="Velocity" value={`${speed.toFixed(2)} m/s`} />
                      <TeleRow label="Roll" value={`${(droneState.orientation.roll * RAD2DEG).toFixed(1)}°`} />
                      <TeleRow label="Pitch" value={`${(droneState.orientation.pitch * RAD2DEG).toFixed(1)}°`} />
                      <TeleRow label="Yaw" value={`${(droneState.orientation.yaw * RAD2DEG).toFixed(1)}°`} />
                    </InspectorSection>

                    {battery && (
                      <InspectorSection icon={<BatteryMedium className="h-3.5 w-3.5" />} title="Battery / Powertrain">
                        <TeleRow label="State of charge" value={`${(battery.soc * 100).toFixed(1)}%`} />
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${battery.soc < 0.15 ? 'bg-red-500' : battery.soc < 0.35 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${battery.soc * 100}%` }} />
                        </div>
                        <TeleRow label="Voltage" value={`${battery.voltage.toFixed(2)} V`} />
                        <TeleRow label="Drawn" value={`${(battery.drawnAh * 1000).toFixed(0)} mAh`} />
                        <TeleRow label="Est. flight time" value={`${battery.flightTimeS.toFixed(0)} s`} />
                      </InspectorSection>
                    )}

                    {currentData && (
                      <InspectorSection icon={<Cpu className="h-3.5 w-3.5" />} title="Motors">
                        <div className="grid grid-cols-2 gap-2">
                          {currentData.motorThrottles.map((val, i) => {
                            const failed = failures.motorFailures[i];
                            const quadLabel = currentData.motorThrottles.length === 4 ? ['FL', 'FR', 'RL', 'RR'][i] : '';
                            return (
                              <div key={i} className={failed ? 'opacity-40' : ''}>
                                <div className="flex justify-between text-[10px] font-mono mb-0.5">
                                  <span className={failed ? 'text-destructive' : 'text-muted-foreground'}>M{i + 1} {quadLabel}</span>
                                  <span>{(val * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${val * 100}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </InspectorSection>
                    )}

                    {metrics && (
                      <InspectorSection icon={<Gauge className="h-3.5 w-3.5" />} title="Performance">
                        <TeleRow label="Rise time" value={metrics.altitudeRiseTime != null ? `${metrics.altitudeRiseTime.toFixed(2)} s` : '—'} />
                        <TeleRow label="Settling" value={metrics.altitudeSettlingTime != null ? `${metrics.altitudeSettlingTime.toFixed(2)} s` : '—'} />
                        <TeleRow label="Overshoot" value={metrics.altitudeOvershoot != null ? `${metrics.altitudeOvershoot.toFixed(1)}%` : '—'} />
                        <TeleRow label="Position RMSE" value={`${metrics.positionRMSE.toFixed(3)} m`} />
                        <TeleRow label="Attitude RMSE" value={`${metrics.attitudeRMSE.toFixed(3)} rad`} />
                      </InspectorSection>
                    )}

                    {currentData?.estimated && currentData.estimationError && (
                      <InspectorSection icon={<LocateFixed className="h-3.5 w-3.5" />} title="State Estimation (vs truth)">
                        <TeleRow label="Est. position" value={`${currentData.estimated.position.x.toFixed(2)}, ${currentData.estimated.position.y.toFixed(2)}, ${currentData.estimated.position.z.toFixed(2)} m`} />
                        <TeleRow label="Position error" value={`${currentData.estimationError.position.toFixed(3)} m`} />
                        <TeleRow label="Attitude error" value={`${(currentData.estimationError.attitude * RAD2DEG).toFixed(2)}°`} />
                        <div className="text-[10px] text-muted-foreground pt-1">IMU + GPS + baro + mag → Mahony + KF</div>
                      </InspectorSection>
                    )}

                    {currentData && (
                      <InspectorSection icon={<Navigation className="h-3.5 w-3.5" />} title="Setpoints">
                        <TeleRow label="Target" value={`${currentData.setpoints.position.x.toFixed(1)}, ${currentData.setpoints.position.y.toFixed(1)}, ${currentData.setpoints.position.z.toFixed(1)} m`} />
                        <TeleRow label="Alt error" value={`${currentData.errors.altitude.toFixed(3)} m`} />
                      </InspectorSection>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* ═══ Status bar ════════════════════════════════════════════ */}
        <footer className="h-7 shrink-0 border-t border-border bg-card/60 backdrop-blur flex items-center gap-3 px-3 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
            {isRunning ? 'RUNNING' : 'PAUSED'}
          </span>
          <Separator orientation="vertical" className="h-3.5" />
          <span className="capitalize">{flightMode.replace(/_/g, ' ')}</span>
          <Separator orientation="vertical" className="h-3.5" />
          <span>T {(currentData?.time ?? 0).toFixed(2)}s</span>
          <span>RTF {simulationConfig.realTimeMultiplier.toFixed(1)}×</span>
          <span>FPS {fps}</span>
          <div className="ml-auto flex items-center gap-3">
            {wind.enabled && <span className="text-cyan-400"><Wind className="h-3 w-3 inline -mt-0.5 mr-0.5" />{wind.speed.toFixed(0)} m/s</span>}
            {failures.motorFailures.some(Boolean) && <span className="text-destructive">MOTOR FAIL</span>}
            {gamepad.connected && <span className="text-emerald-400" title={gamepad.id}>🎮 {controllerLabel(gamepad.id)}</span>}
            {keyboardActive && <span className="text-primary">KEYS</span>}
            <span className="flex items-center gap-1 capitalize">{CAMERA_MODES.find(c => c.id === cameraMode)?.icon}{cameraMode}</span>
          </div>
        </footer>
      </div>

      {/* ═══ Command palette ═══════════════════════════════════════ */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Simulation">
            <CommandItem onSelect={() => runPalette(togglePlay)}>
              {isRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isRunning ? 'Pause' : 'Start'} simulation <CommandShortcut>P</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runPalette(handleReset)}>
              <RotateCcw className="mr-2 h-4 w-4" />Reset <CommandShortcut>R</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runPalette(handleExport)}>
              <Download className="mr-2 h-4 w-4" />Export flight log (CSV)
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Flight mode">
            {FLIGHT_MODES.map(m => (
              <CommandItem key={m.id} onSelect={() => runPalette(() => handleFlightModeChange(m.id))}>
                <Plane className="mr-2 h-4 w-4" />{m.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Camera">
            {CAMERA_MODES.map(c => (
              <CommandItem key={c.id} onSelect={() => runPalette(() => setCameraMode(c.id))}>
                <span className="mr-2">{c.icon}</span>{c.label} view <CommandShortcut>C</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Panels">
            <CommandItem onSelect={() => runPalette(() => togglePanel(leftPanelRef))}><SlidersHorizontal className="mr-2 h-4 w-4" />Toggle tools panel</CommandItem>
            <CommandItem onSelect={() => runPalette(() => togglePanel(rightPanelRef))}><Activity className="mr-2 h-4 w-4" />Toggle telemetry panel</CommandItem>
            <CommandItem onSelect={() => runPalette(() => togglePanel(bottomPanelRef))}><Gauge className="mr-2 h-4 w-4" />Toggle charts dock</CommandItem>
            <CommandItem onSelect={() => runPalette(() => setShortcutsOpen(true))}><Keyboard className="mr-2 h-4 w-4" />Keyboard shortcuts</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* ═══ Shortcuts dialog ══════════════════════════════════════ */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Keyboard className="h-4 w-4" />Keyboard Shortcuts</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <ShortcutGroup title="Global" rows={[
              ['Open command palette', '⌘K / Ctrl K'],
              ['Start / Pause', 'P'],
              ['Reset', 'R'],
              ['Cycle camera', 'C'],
              ['This dialog', '?'],
            ]} />
            <ShortcutGroup title="Manual flight (Manual / Stabilized modes)" rows={[
              ['Pitch / Roll', 'W A S D  ·  Arrows'],
              ['Yaw', 'Q / E'],
              ['Throttle up / down', 'Space / Shift'],
            ]} />
            <ShortcutGroup title="Controller (PS4 / Xbox / generic — auto-detected)" rows={[
              ['Throttle / Yaw', 'Left stick'],
              ['Pitch / Roll', 'Right stick'],
              ['Start / Pause', 'Options'],
              ['Reset', 'Share'],
              ['Cycle camera', 'Triangle / Y'],
              ['Flight mode −/+', 'L1 / R1'],
            ]} />
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

// ─── Small presentational helpers ────────────────────────────────────
const PanelHeader: React.FC<{ icon: React.ReactNode; title: string; onClose: () => void }> = ({ icon, title, onClose }) => (
  <div className="h-9 shrink-0 px-3 flex items-center gap-2 border-b border-border bg-card/50">
    <span className="text-primary">{icon}</span>
    <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{title}</span>
    <button onClick={onClose} className="ml-auto h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
      <ChevronDown className="h-4 w-4" />
    </button>
  </div>
);

const InspectorSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
    <div className="px-2.5 h-8 flex items-center gap-1.5 border-b border-border bg-muted/30">
      <span className="text-primary">{icon}</span>
      <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">{title}</span>
    </div>
    <div className="p-2.5 space-y-1.5">{children}</div>
  </div>
);

const TeleRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-[11px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono text-foreground">{value}</span>
  </div>
);

const ShortcutGroup: React.FC<{ title: string; rows: [string, string][] }> = ({ title, rows }) => (
  <div>
    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</div>
    <div className="space-y-1.5">
      {rows.map(([label, keys]) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-muted-foreground">{label}</span>
          <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-[11px] font-mono">{keys}</kbd>
        </div>
      ))}
    </div>
  </div>
);
