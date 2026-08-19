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
  // Mostly top-down by default (parts are laid out flat on the ground plane, so a
  // bird's-eye view frames them best) -- a small x/z offset instead of a perfectly
  // vertical (0, y, 0) position avoids the camera-look-direction/up-vector singularity
  // that would otherwise make OrbitControls' orbiting ill-defined at startup.
  camera.position.set(0.1, 75, 35);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 300; // enables the requested zoom-in/zoom-out range

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(ambient, directional);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  return { scene, camera, renderer, controls, groundPlane };
}
