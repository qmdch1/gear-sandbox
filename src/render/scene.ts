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
  // the shading coming from the directional lights below, so tooth flanks and gear-face
  // depth actually read instead of the scene looking flat/shadeless.
  //
  // Most gears in this sandbox lie flat with `axis: [0,1,0]` (their circular face points
  // straight up). A light positioned nearly overhead therefore hits that face almost
  // head-on, which lights it nearly UNIFORMLY -- no gradient across the face, and no
  // shadow on the tooth side-walls, which is exactly what read as "flat/cardboard" in a
  // real render of this scene (confirmed by screenshot, not just reasoning about it).
  // The fix is a low, RAKING angle for the key light -- grazing across the gears
  // horizontally rather than shining down on them from above -- so the vertical tooth
  // walls catch real highlight-vs-shadow contrast and the flat faces get a visible
  // brightness gradient instead of one flat tone.
  const ambient = new THREE.AmbientLight(0xffffff, 0.32);
  // Key light: raking almost horizontally across the scene (low Y relative to X/Z) so
  // tooth walls -- not just flat tops -- catch real contrast.
  const key = new THREE.DirectionalLight(0xfff4e0, 1.35);
  key.position.set(60, 18, 40);
  // Fill: dim, opposite side, keeps the away-from-key side from crushing to pure black
  // without washing out the key light's own contrast.
  const fill = new THREE.DirectionalLight(0xc9d8ff, 0.28);
  fill.position.set(-50, 25, -35);
  // Rim/back light: a third, cool-toned light from behind-and-above so each gear's
  // silhouette edge picks up a thin highlight against the dark background -- cheap
  // "product shot" separation between overlapping gears without shadow maps.
  const rim = new THREE.DirectionalLight(0x8fb8ff, 0.5);
  rim.position.set(-10, 50, -60);
  scene.add(ambient, key, fill, rim);

  // Ground plane: previously 0x2a2e35 against a 0x1a1d22 background -- close enough in
  // luminance that the "floor" was functionally invisible (confirmed by screenshot: the
  // whole scene read as gears floating in a black void with no spatial reference at
  // all). Lightened well clear of the background, plus a visible grid overlay, so there
  // is an actual sense of ground/scale instead of an empty void.
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x3d434e, roughness: 0.95 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  const grid = new THREE.GridHelper(500, 50, 0x5a6270, 0x454b56);
  grid.position.y = 0.01; // avoid z-fighting with the ground plane
  scene.add(grid);

  return { scene, camera, renderer, controls, groundPlane };
}
