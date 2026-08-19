import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundPlane: THREE.Mesh;
}

// Mock renderer for environments without WebGL (e.g., jsdom)
class MockWebGLRenderer {
  domElement: HTMLCanvasElement;
  constructor(public canvas: HTMLCanvasElement) {
    this.domElement = canvas;
  }
  setSize() {}
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d22);

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 1000);
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  let renderer: any;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  } catch {
    // Fallback for environments without WebGL (e.g., jsdom)
    renderer = new MockWebGLRenderer(canvas);
  }

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
