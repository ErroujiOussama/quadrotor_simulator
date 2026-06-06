/**
 * 3D Drone Visualization — Three.js
 * Camera modes: orbit (free), follow (tracks drone), fpv (cockpit view).
 * Features: waypoint markers, planned path line, wind arrow, trajectory ring buffer.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneState } from '@/lib/physics/DroneModel';
import { Waypoint, MissionState } from '@/lib/mission/WaypointPlanner';
import { WindConfig } from '@/lib/physics/DroneModel';
import { buildDrone, buildEnvironment, disposeDrone, type Propeller } from './droneScene';
import type { AirframeSpec } from '@/core';

export type CameraMode = 'orbit' | 'follow' | 'fpv';

interface DroneVisualizationProps {
  stateRef: React.RefObject<DroneState | null>;
  waypoints: Waypoint[];
  missionState: MissionState;
  wind: WindConfig;
  cameraMode: CameraMode;
  airframe?: AirframeSpec;
  onGroundClick?: (position: { x: number; y: number; z: number }) => void;
  className?: string;
}

const TRAIL_LENGTH = 2000;

export const DroneVisualization: React.FC<DroneVisualizationProps> = ({
  stateRef,
  waypoints,
  missionState,
  wind,
  cameraMode,
  airframe,
  onGroundClick,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneDataRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    droneGroup: THREE.Group;
    propellers: Propeller[];
    spinRate: number;
    envDispose?: () => void;
    // Trajectory ring buffer
    trailPoints: Float32Array;
    trailGeo: THREE.BufferGeometry;
    trailLine: THREE.Line;
    trailHead: number;
    trailCount: number;
    // Waypoint objects
    waypointGroup: THREE.Group;
    pathLine: THREE.Line | null;
    windArrow: THREE.ArrowHelper | null;
    // Ground plane for raycasting
    groundPlane: THREE.Mesh;
    frameId?: number;
    // Camera
    controls: OrbitControls;
    followTarget: THREE.Vector3;
  }>();

  const cameraModeRef = useRef<CameraMode>(cameraMode);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);

  const airframeRef = useRef(airframe);
  useEffect(() => { airframeRef.current = airframe; }, [airframe]);

  const waypointsRef = useRef(waypoints);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

  const missionRef = useRef(missionState);
  useEffect(() => { missionRef.current = missionState; }, [missionState]);

  const windRef = useRef(wind);
  useEffect(() => { windRef.current = wind; }, [wind]);

  const onGroundClickRef = useRef(onGroundClick);
  useEffect(() => { onGroundClickRef.current = onGroundClick; }, [onGroundClick]);

  // Rebuild waypoint markers whenever waypoints or mission state changes
  const updateWaypointScene = useCallback(() => {
    const sd = sceneDataRef.current;
    if (!sd) return;
    const { scene, waypointGroup } = sd;

    // Clear old markers and path
    while (waypointGroup.children.length > 0) waypointGroup.remove(waypointGroup.children[0]);
    if (sd.pathLine) { scene.remove(sd.pathLine); sd.pathLine = null; }

    const wps = waypointsRef.current;
    const ms = missionRef.current;

    wps.forEach((wp, i) => {
      const isCurrent = (ms.status === 'running' || ms.status === 'holding') && i === ms.currentWaypointIndex;
      const isCompleted = ms.status !== 'idle' && i < ms.currentWaypointIndex;

      // Marker sphere
      const geo = new THREE.SphereGeometry(0.15, 16, 16);
      const mat = new THREE.MeshLambertMaterial({
        color: isCurrent ? 0xfbbf24 : isCompleted ? 0x22c55e : 0x3b82f6,
        transparent: true,
        opacity: isCompleted ? 0.5 : 0.9,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(wp.position.x, wp.position.z, wp.position.y);
      waypointGroup.add(sphere);

      // Vertical dashed line to ground
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wp.position.x, 0, wp.position.y),
        new THREE.Vector3(wp.position.x, wp.position.z, wp.position.y),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: isCurrent ? 0xfbbf24 : 0x3b82f6, opacity: 0.4, transparent: true });
      waypointGroup.add(new THREE.Line(lineGeo, lineMat));

      // Label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = isCurrent ? '#fbbf24' : '#3b82f6';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(wp.label || `WP${i + 1}`, 64, 40);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(wp.position.x, wp.position.z + 0.5, wp.position.y);
      sprite.scale.set(0.8, 0.4, 1);
      waypointGroup.add(sprite);
    });

    // Path line through all waypoints
    if (wps.length > 1) {
      const pts = wps.map(wp => new THREE.Vector3(wp.position.x, wp.position.z, wp.position.y));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineDashedMaterial({ color: 0x3b82f6, dashSize: 0.3, gapSize: 0.15, opacity: 0.6, transparent: true });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      scene.add(line);
      sd.pathLine = line;
    }
  }, []);

  useEffect(() => { updateWaypointScene(); }, [waypoints, missionState, updateWaypointScene]);

  // Update wind arrow
  useEffect(() => {
    const sd = sceneDataRef.current;
    if (!sd) return;
    const { scene } = sd;
    if (sd.windArrow) { scene.remove(sd.windArrow); sd.windArrow = null; }
    const w = windRef.current;
    if (w.enabled && w.speed > 0.2) {
      const dir = new THREE.Vector3(Math.cos(w.direction), 0, Math.sin(w.direction)).normalize();
      const origin = new THREE.Vector3(-8, 2, -8);
      const len = 0.5 + w.speed * 0.3;
      sd.windArrow = new THREE.ArrowHelper(dir, origin, len, 0x60a5fa, 0.4, 0.3);
      scene.add(sd.windArrow);
    }
  }, [wind]);

  // Initialize Three.js scene once
  useEffect(() => {
    if (!mountRef.current) return;
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(70, w / h, 0.01, 500);
    camera.position.set(6, 5, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    // Realistic daylight environment (sky, IBL, sun + soft shadows, ground).
    const envDispose = buildEnvironment(scene, renderer);

    // Invisible ground for raycasting clicks
    const pickGeo = new THREE.PlaneGeometry(100, 100);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const groundPlane = new THREE.Mesh(pickGeo, pickMat);
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    // ─── Realistic drone model ────────────────────────────────────────
    const { group: droneGroup, propellers } = buildDrone(airframeRef.current);
    scene.add(droneGroup);

    // ─── Trajectory trail (ring buffer as line strip) ──────────────
    const trailPoints = new Float32Array(TRAIL_LENGTH * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.5 });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);

    // Waypoint group
    const waypointGroup = new THREE.Group();
    scene.add(waypointGroup);

    // Smooth, damped camera controls (orbit / zoom / pan). Wheel + drag are
    // captured only over the canvas, so scrolling/clicking elsewhere on the
    // page is unaffected — this resolves the canvas-vs-browser interaction.
    camera.position.set(5, 4, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.7;
    controls.zoomToCursor = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.495; // stay above the ground plane
    controls.target.set(0, 1, 0);
    controls.update();

    sceneDataRef.current = {
      scene, camera, renderer,
      droneGroup, propellers, spinRate: 0, envDispose,
      trailPoints, trailGeo, trailLine, trailHead: 0, trailCount: 0,
      waypointGroup, pathLine: null, windArrow: null,
      groundPlane,
      frameId: undefined,
      controls,
      followTarget: new THREE.Vector3(0, 1, 0),
    };

    // Click-to-place waypoint (raycasting against ground plane)
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    let clickStartX = 0, clickStartY = 0;

    const onMouseDownClick = (e: MouseEvent) => { clickStartX = e.clientX; clickStartY = e.clientY; };
    const onMouseUpClick = (e: MouseEvent) => {
      const dist = Math.sqrt((e.clientX - clickStartX) ** 2 + (e.clientY - clickStartY) ** 2);
      if (dist > 5 || !onGroundClickRef.current) return; // was a drag, not a click
      const rect = renderer.domElement.getBoundingClientRect();
      mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      const hits = raycaster.intersectObject(groundPlane);
      if (hits.length > 0) {
        const p = hits[0].point;
        // Three.js XZ → sim XY, current drone altitude as Z
        const droneState = stateRef.current;
        const z = droneState?.position.z ?? 2;
        onGroundClickRef.current({ x: p.x, y: p.z, z });
      }
    };

    const onResize = () => {
      const sd = sceneDataRef.current;
      if (!sd || !mountRef.current) return;
      const w2 = mountRef.current.clientWidth;
      const h2 = mountRef.current.clientHeight;
      sd.camera.aspect = w2 / h2;
      sd.camera.updateProjectionMatrix();
      sd.renderer.setSize(w2, h2);
    };

    renderer.domElement.addEventListener('mousedown', onMouseDownClick);
    renderer.domElement.addEventListener('mouseup', onMouseUpClick);
    window.addEventListener('resize', onResize);

    // ─── Animation loop ───────────────────────────────────────────────
    let wasFpv = false; // detect FPV→orbit transition to reframe the camera
    const animate = () => {
      const sd = sceneDataRef.current;
      if (!sd) return;
      const { scene: sc, camera: cam, renderer: rend, droneGroup: dg, propellers: props,
              trailPoints: tp, trailGeo: tg } = sd;

      // Read latest true state from ref (updated at 100Hz by sim, zero React overhead)
      const state = stateRef.current;
      if (state) {
        const { position: pos, orientation: ori } = state;
        // Sim: X=east Y=north Z=up  →  Three.js: X=right Y=up Z=toward-camera
        dg.position.set(pos.x, pos.z, pos.y);
        // ZYX Euler → Three.js Euler (order XYZ in Three.js = pitch, yaw, -roll for our convention)
        dg.rotation.set(ori.pitch, -ori.yaw, ori.roll, 'ZYX');

        // Append to trajectory ring buffer
        const idx = (sd.trailHead % TRAIL_LENGTH) * 3;
        tp[idx]   = pos.x;
        tp[idx+1] = pos.z;
        tp[idx+2] = pos.y;
        sd.trailHead++;
        sd.trailCount = Math.min(sd.trailCount + 1, TRAIL_LENGTH);

        // Draw range for line strip (always start from oldest point)
        const posAttr = tg.getAttribute('position') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        tg.setDrawRange(0, sd.trailCount);

        // Camera follow target
        sd.followTarget.lerp(new THREE.Vector3(pos.x, pos.z, pos.y), 0.05);
      }

      // Camera positioning based on mode
      const mode = cameraModeRef.current;
      if (mode === 'fpv' && state) {
        // FPV: camera at drone nose, looking forward in the drone's body frame.
        sd.controls.enabled = false;
        wasFpv = true;
        const pos = state.position;
        const ori = state.orientation;
        // Body-frame forward = +X in sim = (cos(yaw)*cos(pitch), sin(yaw)*cos(pitch), sin(pitch))
        // In Three.js: X=east stays X, Z=south (sim Y → -Three.js Z), Y=up
        const fwdX = Math.cos(ori.yaw) * Math.cos(ori.pitch);
        const fwdY = Math.sin(ori.pitch);
        const fwdZ = Math.sin(ori.yaw) * Math.cos(ori.pitch);
        const camPos = new THREE.Vector3(pos.x + fwdX * 0.05, pos.z + 0.04, pos.y + fwdZ * 0.05);
        cam.position.copy(camPos);
        const lookTarget = new THREE.Vector3(pos.x + fwdX * 5, pos.z + fwdY * 5, pos.y + fwdZ * 5);
        cam.lookAt(lookTarget);
        cam.up.set(0, 1, 0);
      } else {
        // Orbit + follow both use the smooth, damped OrbitControls. In follow
        // mode the orbit pivot tracks the drone so you circle it.
        sd.controls.enabled = true;
        if (wasFpv) {
          // Reframe to a sensible orbit distance after leaving FPV.
          const t = sd.controls.target;
          cam.position.set(t.x + 5, t.y + 4, t.z + 5);
          wasFpv = false;
        }
        if (mode === 'follow') sd.controls.target.copy(sd.followTarget);
        sd.controls.update();
      }

      // Spin propellers: ramp RPM up while flying, decay when idle. At high
      // RPM the blades fade and the motion-blur disc fades in (like a real prop).
      const targetSpin = state ? 1 : 0;
      sd.spinRate += (targetSpin - sd.spinRate) * 0.06;
      const rate = sd.spinRate;
      const blur = Math.min(1, Math.max(0, (rate - 0.35) / 0.5)); // 0→1 as it spins up
      props.forEach((p) => {
        p.pivot.rotation.y += p.dir * (0.15 + rate * 1.2);
        p.discMat.opacity = blur * 0.9;
        p.bladeMat.opacity = 1 - blur * 0.85;
        p.bladeMat.transparent = blur > 0.01;
      });

      rend.render(sc, cam);
      sd.frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      const sd = sceneDataRef.current;
      if (sd?.frameId) cancelAnimationFrame(sd.frameId);
      sd?.envDispose?.();
      sd?.controls.dispose();
      renderer.domElement.removeEventListener('mousedown', onMouseDownClick);
      renderer.domElement.removeEventListener('mouseup', onMouseUpClick);
      window.removeEventListener('resize', onResize);
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once

  // Rebuild the drone model when the airframe changes (quad → hexa → octo …).
  useEffect(() => {
    const sd = sceneDataRef.current;
    if (!sd || !airframe) return;
    const old = sd.droneGroup;
    const { group, propellers } = buildDrone(airframe);
    group.position.copy(old.position);
    group.quaternion.copy(old.quaternion);
    sd.scene.remove(old);
    disposeDrone(old);
    sd.scene.add(group);
    sd.droneGroup = group;
    sd.propellers = propellers;
    sd.spinRate = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airframe?.id]);

  // Reset trail on external reset (caller sets stateRef.current = null briefly)
  useEffect(() => {
    const sd = sceneDataRef.current;
    if (!sd) return;
    // Trail reset: caller should set stateRef to null then back to state
    if (!stateRef.current) {
      sd.trailHead = 0;
      sd.trailCount = 0;
      sd.trailGeo.setDrawRange(0, 0);
      (sd.trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      sd.followTarget.set(0, 0, 0);
    }
  });

  return (
    <div
      ref={mountRef}
      className={`w-full h-full relative ${className}`}
      style={{ minHeight: 300, background: '#0f172a', cursor: cameraMode === 'fpv' ? 'none' : 'grab' }}
    />
  );
};
