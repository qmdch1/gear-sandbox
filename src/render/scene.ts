import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { hasRealCanvasSupport } from "./metalTexture";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundPlane: THREE.Mesh;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d22);

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 1000);
  // Mostly top-down by default (parts are laid out flat on the ground plane, so a
  // bird's-eye view frames them best) -- a small x/z offset instead of a perfectly
  // vertical (0, y, 0) position avoids the camera-look-direction/up-vector singularity
  // that would otherwise make OrbitControls' orbiting ill-defined at startup.
  camera.position.set(0.1, 75, 35);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  // Metallic materials (metalness > 0, the gears' whole look) need something to
  // reflect to read as actual metal -- without an environment map they just look
  // like flat matte color no matter the texture, which is exactly the "just looks
  // like a red blob, not steel" complaint. A generated studio-room environment
  // (three's standard PMREM approach, no external HDRI file/download needed) gives
  // every metallic surface believable highlights and reflections. Skipped under
  // jsdom (this project's DOM-touching tests) -- there's no real WebGL context
  // there for PMREMGenerator's render passes to run against (same guard used for
  // the canvas textures in metalTexture.ts).
  if (hasRealCanvasSupport()) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 300; // enables the requested zoom-in/zoom-out range

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(ambient, directional);

  // Invisible (not removed!) -- dragControls.ts raycasts against this specific mesh to
  // turn pointer position into a world (x, z) point, and a hidden (`visible = false`)
  // object is skipped by the raycaster entirely, which would break dragging outright.
  // A solid fill color here used to visually compete with parts sitting low/at ground
  // level (bevel gears especially), so it's fully transparent instead.
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35, transparent: true, opacity: 0 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  // A faint reference grid instead -- enough to judge position/height by without the
  // opaque fill's visual competition with the parts themselves.
  const grid = new THREE.GridHelper(500, 50, 0x3a3f47, 0x2a2e35);
  scene.add(grid);

  return { scene, camera, renderer, controls, groundPlane };
}
