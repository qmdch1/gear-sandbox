import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 300; // enables the requested zoom-in/zoom-out range

  // Ambient is kept low -- it's just a floor so nothing goes pure black -- with most of
  // the shading coming from the two directional lights below, so tooth flanks and
  // gear-face depth actually read instead of the scene looking flat/shadeless.
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  // Key light: the dominant, brighter source: casts the primary highlight/shadow side.
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(20, 40, 20);
  // Fill light: dim, from roughly the opposite side, so the side facing away from the
  // key isn't crushed to black -- a cheap way to add depth without shadow maps.
  const fill = new THREE.DirectionalLight(0xdbe6ff, 0.35);
  fill.position.set(-25, 15, -15);
  scene.add(ambient, key, fill);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  return { scene, camera, renderer, controls, groundPlane };
}
