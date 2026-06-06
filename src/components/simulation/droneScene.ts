/**
 * Scene builders for the 3D viewport — a realistic procedural quadrotor and a
 * daylight environment. Kept separate from DroneVisualization so the rendering
 * detail can evolve without touching camera/interaction logic.
 *
 * Local model frame: Y is up; arms lie in the XZ plane; propellers spin about Y.
 * (DroneVisualization maps sim ENU → this frame.)
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

const ARM_LENGTH = 0.26;
const PROP_RADIUS = 0.13;
// X-config motor mounts (degrees in the XZ plane). FL, FR, RL, RR.
const ARM_ANGLES = [45, -45, 135, -135];
// Spin directions matching the physics mixer (FL/RR CCW, FR/RL CW).
const ARM_DIR = [1, -1, -1, 1];

/** A single curved, tapered propeller blade as an extruded airfoil planform. */
function buildBlade(mat: THREE.Material, dir: number): THREE.Mesh {
  const len = PROP_RADIUS;
  const shape = new THREE.Shape();
  // Planform in the XY plane: root near origin, tapering tip; one edge curved.
  shape.moveTo(0.012, -0.006);
  shape.quadraticCurveTo(len * 0.55, -0.018, len, -0.004);
  shape.quadraticCurveTo(len * 1.02, 0, len, 0.004);
  shape.quadraticCurveTo(len * 0.55, 0.016, 0.012, 0.006);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0016,
    bevelEnabled: true,
    bevelThickness: 0.0006,
    bevelSize: 0.0006,
    bevelSegments: 1,
  });
  // Lay flat: extrude is in XY(+Z depth) → rotate so span=X, chord=Z, thickness=Y.
  geo.rotateX(-Math.PI / 2);
  const blade = new THREE.Mesh(geo, mat);
  // Blade pitch (angle of attack), sign follows spin direction.
  blade.rotation.x = dir * 0.28;
  blade.castShadow = true;
  return blade;
}

/** Build one propeller (hub + 2 blades) plus its motion-blur disc. */
function buildPropeller(dir: number, blade2Tone: boolean): Propeller {
  const pivot = new THREE.Group();

  const bladeMat = new THREE.MeshStandardMaterial({
    color: blade2Tone ? 0x111418 : 0x14181d,
    metalness: 0.1,
    roughness: 0.55,
  });

  // Hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.7, roughness: 0.35 }),
  );
  hub.castShadow = true;
  pivot.add(hub);

  // Two blades, 180° apart.
  const b1 = buildBlade(bladeMat, dir);
  const b2 = buildBlade(bladeMat, dir);
  b2.rotation.y = Math.PI;
  // Offset blades outward from the hub.
  b1.position.x = 0.012;
  b2.position.x = -0.012;
  pivot.add(b1, b2);

  // Motion-blur disc (radial-gradient texture, fades with RPM).
  const discTex = makeDiscTexture();
  const discMat = new THREE.MeshBasicMaterial({
    map: discTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PROP_RADIUS * 1.02, 48), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.001;
  pivot.add(disc);

  return { pivot, disc, discMat, bladeMat, dir };
}

/** Soft radial gradient used for the spinning-prop blur disc. */
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

/** Build the full realistic quadrotor model. */
export function buildDrone(): DroneModel {
  const group = new THREE.Group();

  // Materials
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.35, roughness: 0.45 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0c0e11, metalness: 0.85, roughness: 0.3 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb5703a, metalness: 0.9, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.5, roughness: 0.3 });

  // ── Central frame: stacked carbon plates ──────────────────────
  const bottomPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.006, 6), carbon);
  bottomPlate.rotation.y = Math.PI / 6;
  bottomPlate.position.y = -0.004;
  group.add(bottomPlate);

  const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 6), carbon);
  topPlate.rotation.y = Math.PI / 6;
  topPlate.position.y = 0.02;
  group.add(topPlate);

  // Standoffs between plates
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.024, 8), darkMetal);
    post.position.set(Math.cos(a) * 0.03, 0.008, Math.sin(a) * 0.03);
    group.add(post);
  }

  // Battery (under the body)
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.018, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x1b1f24, metalness: 0.2, roughness: 0.6 }),
  );
  battery.position.y = -0.014;
  battery.castShadow = true;
  group.add(battery);

  // Canopy / flight controller stack
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.03), accent);
  canopy.position.y = 0.03;
  canopy.castShadow = true;
  group.add(canopy);

  // ── Front camera pod + gimbal ─────────────────────────────────
  const podHousing = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.026), darkMetal);
  podHousing.position.set(0.05, -0.002, 0);
  podHousing.castShadow = true;
  group.add(podHousing);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.009, 0.01, 16),
    new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.6, roughness: 0.1 }),
  );
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.066, -0.002, 0);
  group.add(lens);
  // Glass glint
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.006, 16),
    new THREE.MeshStandardMaterial({ color: 0x1b3a5b, metalness: 0.9, roughness: 0.05, emissive: 0x0a1a2a, emissiveIntensity: 0.4 }),
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(0.0715, -0.002, 0);
  group.add(glass);

  // ── Arms, motors, propellers, LEDs, landing gear ──────────────
  const propellers: Propeller[] = [];

  ARM_ANGLES.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const ex = Math.cos(a) * ARM_LENGTH;
    const ez = Math.sin(a) * ARM_LENGTH;

    // Tapered carbon arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, ARM_LENGTH, 10), carbon);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -a;
    arm.position.set(ex / 2, 0, ez / 2);
    arm.castShadow = true;
    group.add(arm);

    // Motor bell (stator + rotor cap) with copper windings hint
    const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), copper);
    stator.position.set(ex, 0.004, ez);
    group.add(stator);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.017, 0.014, 16), darkMetal);
    bell.position.set(ex, 0.014, ez);
    bell.castShadow = true;
    group.add(bell);

    // Propeller on top of the motor
    const prop = buildPropeller(ARM_DIR[i], i % 2 === 0);
    prop.pivot.position.set(ex, 0.024, ez);
    group.add(prop.pivot);
    propellers.push(prop);

    // Arm-tip LED (front pair white, rear pair red)
    const front = deg === 45 || deg === -45;
    const ledColor = front ? 0xffffff : 0xff3344;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 10, 10),
      new THREE.MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 2.5 }),
    );
    led.position.set(ex * 0.92, -0.004, ez * 0.92);
    group.add(led);

    // Landing leg
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 8), darkMetal);
    leg.position.set(ex * 0.45, -0.034, ez * 0.45);
    leg.rotation.set(ez * 0.6, 0, -ex * 0.6);
    group.add(leg);
  });

  // Foot skids (two bars under the legs)
  for (const sign of [1, -1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 8), darkMetal);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sign * 0.12, -0.062, 0);
    group.add(skid);
  }

  return { group, propellers };
}

/**
 * Build a realistic daylight environment: gradient sky, image-based lighting for
 * believable metal/carbon, a warm sun with soft shadows, and a detailed ground.
 * Returns a disposer for the PMREM resources.
 */
export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  // Sky gradient as the background.
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xbcd2e8, 18, 90);

  // Image-based lighting for PBR reflections (makes metal read as metal).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  // Sky/ground hemisphere fill.
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4636, 1.1);
  scene.add(hemi);

  // Warm directional sun with soft shadows.
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

  // Detailed ground: large textured plane (concrete + survey grid).
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

  // Subtle near-origin reference grid for the engineering feel.
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
  g.addColorStop(0.0, "#3b76c4"); // high sky
  g.addColorStop(0.45, "#7fb0e6");
  g.addColorStop(0.8, "#c4dbf0"); // horizon haze
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
  // Concrete base with subtle noise.
  ctx.fillStyle = "#8d9499";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) {
    const v = 120 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.06)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  // Survey grid lines.
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
