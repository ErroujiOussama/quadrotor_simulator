/**
 * Scene builders for the 3D viewport — a realistic procedural multirotor and a
 * daylight environment. The drone is built from an AirframeSpec's rotor geometry
 * so quad / hexa / octo render with the correct arm/motor/prop count and layout.
 *
 * Local model frame: Y is up; arms lie in the XZ plane (body X→local X forward,
 * body Y→local Z). DroneVisualization maps sim ENU → this frame.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildAirframe, type AirframeSpec } from "@/core";

export interface Propeller {
  /** Spins about local Y. Holds the blades + hub. */
  pivot: THREE.Group;
  /** Translucent disc that fades in as RPM rises (motion blur). */
  disc: THREE.Mesh;
  discMat: THREE.MeshBasicMaterial;
  bladeMat: THREE.MeshStandardMaterial;
  /** +1 for CCW, -1 for CW. */
  dir: number;
}

export interface DroneModel {
  group: THREE.Group;
  propellers: Propeller[];
}

/** A single curved, tapered propeller blade as an extruded airfoil planform. */
function buildBlade(mat: THREE.Material, dir: number, len: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0.012, -0.006);
  shape.quadraticCurveTo(len * 0.55, -0.018, len, -0.004);
  shape.quadraticCurveTo(len * 1.02, 0, len, 0.004);
  shape.quadraticCurveTo(len * 0.55, 0.016, 0.012, 0.006);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  const blade = new THREE.Mesh(geo, mat);
  blade.rotation.x = dir * 0.28; // blade pitch follows spin direction
  blade.castShadow = true;
  return blade;
}

function buildPropeller(dir: number, twoTone: boolean, radius: number): Propeller {
  const pivot = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: twoTone ? 0x111418 : 0x14181d, metalness: 0.1, roughness: 0.55 });

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.7, roughness: 0.35 }),
  );
  hub.castShadow = true;
  pivot.add(hub);

  const b1 = buildBlade(bladeMat, dir, radius);
  const b2 = buildBlade(bladeMat, dir, radius);
  b2.rotation.y = Math.PI;
  b1.position.x = 0.012;
  b2.position.x = -0.012;
  pivot.add(b1, b2);

  const discMat = new THREE.MeshBasicMaterial({ map: makeDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.02, 48), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.001;
  pivot.add(disc);

  return { pivot, disc, discMat, bladeMat, dir };
}

function makeDiscTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(180,190,200,0.25)");
  g.addColorStop(0.7, "rgba(150,160,170,0.12)");
  g.addColorStop(1, "rgba(140,150,160,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Build the multirotor model for the given airframe (defaults to quad-X). */
export function buildDrone(airframe?: AirframeSpec): DroneModel {
  const af = airframe ?? buildAirframe("quad_x", 0.25);
  const arm = af.armLength;
  const rotors = af.rotors;
  const n = rotors.length;
  const group = new THREE.Group();

  const carbon = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.35, roughness: 0.45 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0c0e11, metalness: 0.85, roughness: 0.3 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb5703a, metalness: 0.9, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.5, roughness: 0.3 });

  // Central frame scales gently with the airframe size.
  const bodyR = Math.max(0.045, arm * 0.22);
  const sides = n <= 4 ? 6 : n;
  const bottomPlate = new THREE.Mesh(new THREE.CylinderGeometry(bodyR * 1.04, bodyR * 1.04, 0.006, sides), carbon);
  bottomPlate.position.y = -0.004;
  group.add(bottomPlate);
  const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, 0.006, sides), carbon);
  topPlate.position.y = 0.02;
  group.add(topPlate);

  const battery = new THREE.Mesh(new THREE.BoxGeometry(bodyR * 1.3, 0.018, bodyR * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1b1f24, metalness: 0.2, roughness: 0.6 }));
  battery.position.y = -0.014; battery.castShadow = true;
  group.add(battery);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.03), accent);
  canopy.position.y = 0.03; canopy.castShadow = true;
  group.add(canopy);

  // Front camera pod (also the visual "forward" indicator) at +X.
  const podHousing = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.026), darkMetal);
  podHousing.position.set(bodyR * 0.9, -0.002, 0); podHousing.castShadow = true;
  group.add(podHousing);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.01, 16),
    new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.6, roughness: 0.1 }));
  lens.rotation.z = Math.PI / 2; lens.position.set(bodyR * 0.9 + 0.016, -0.002, 0);
  group.add(lens);

  // Prop radius from rotor spacing so blades don't overlap on hexa/octo.
  const propRadius = Math.min(0.14, Math.max(0.05, (2 * Math.PI * arm / n) * 0.4));
  const propellers: Propeller[] = [];

  rotors.forEach((r, i) => {
    const ex = r.position.x;   // body forward → local X
    const ez = r.position.y;   // body left → local Z
    const ang = Math.atan2(ez, ex);
    const len = Math.hypot(ex, ez);

    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, len, 10), carbon);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.rotation.y = -ang;
    armMesh.position.set(ex / 2, 0, ez / 2);
    armMesh.castShadow = true;
    group.add(armMesh);

    const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), copper);
    stator.position.set(ex, 0.004, ez);
    group.add(stator);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.017, 0.014, 16), darkMetal);
    bell.position.set(ex, 0.014, ez); bell.castShadow = true;
    group.add(bell);

    const prop = buildPropeller(r.spin, i % 2 === 0, propRadius);
    prop.pivot.position.set(ex, 0.024, ez);
    group.add(prop.pivot);
    propellers.push(prop);

    // Nav LED: front rotors white, rear red.
    const ledColor = ex > 0.001 ? 0xffffff : 0xff3344;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 10),
      new THREE.MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 2.5 }));
    led.position.set(ex * 0.9, -0.004, ez * 0.9);
    group.add(led);
  });

  // Landing skids.
  for (const sign of [1, -1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, arm * 1.3, 8), darkMetal);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sign * arm * 0.45, -0.062, 0);
    group.add(skid);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 8), darkMetal);
    leg.position.set(sign * arm * 0.45, -0.034, 0);
    group.add(leg);
  }

  return { group, propellers };
}

/** Dispose all geometries/materials in a drone group (on airframe rebuild). */
export function disposeDrone(group: THREE.Group): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

/**
 * Build a realistic daylight environment: gradient sky, image-based lighting for
 * believable metal/carbon, a warm sun with soft shadows, and a detailed ground.
 * Returns a disposer for the PMREM resources.
 */
export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xbcd2e8, 18, 90);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4636, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
  sun.position.set(14, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const groundTex = makeGroundTexture();
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(24, 24);
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x6b7280, 0x3f4854);
  (grid.material as THREE.Material).opacity = 0.25;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.002;
  scene.add(grid);

  return () => {
    envRT.dispose();
    pmrem.dispose();
  };
}

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#3b76c4");
  g.addColorStop(0.45, "#7fb0e6");
  g.addColorStop(0.8, "#c4dbf0");
  g.addColorStop(1.0, "#dbe7f2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8d9499";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) {
    const v = 120 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.06)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  ctx.strokeStyle = "rgba(70,80,90,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, s, s);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(70,80,90,0.25)";
  for (let i = 1; i < 4; i++) {
    const p = (s / 4) * i;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
