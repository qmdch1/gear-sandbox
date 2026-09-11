import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getTiledTexture, makeSkyTexture } from "./textures";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Side length of the square ground plane, in world units. Exported as the single source of
 *  truth because two other places reason about it: `showroom.ts` lays machines out inside it,
 *  and `chainGeometry.ts` derives its worst-case chain length from the plane's diagonal. Those
 *  used to hardcode 500 in prose, which is exactly how such a number drifts out of date. */
export const GROUND_SIZE = 800;

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundPlane: THREE.Mesh;
}

/** The box the canvas should fill. `renderer.setSize` writes the size it is given straight
 *  onto the canvas as an INLINE style, so `canvas.clientWidth` afterwards just reports back
 *  whatever was last set -- measuring the canvas to decide how big the canvas should be is a
 *  feedback loop that can only ever preserve the current size. (Concretely: a first load in a
 *  small pane pinned the canvas at 24x12px, and every later resize re-measured that same 24x12
 *  and "resized" it to itself, so the viewport could never grow back.) Measuring the PARENT
 *  element instead breaks the loop, since nothing writes an inline size onto it. */
function containerSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const box = canvas.parentElement;
  const width = box?.clientWidth || canvas.clientWidth || 1;
  const height = box?.clientHeight || canvas.clientHeight || 1;
  return { width, height };
}

/** Re-fits the renderer and camera to the canvas's container. Safe to call at any time. */
export function resizeToContainer(ctx: SceneContext): void {
  const { width, height } = containerSize(ctx.renderer.domElement as HTMLCanvasElement);
  ctx.camera.aspect = width / height;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(width, height, true);
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  // A sky rather than a flat backdrop: deep blue overhead easing to a pale horizon. It gives
  // the yard a skyline to sit against, and because it is an equirectangular texture the same
  // gradient is what polished metal now reflects. Falls back to the old flat colour wherever
  // there is no canvas (jsdom), so a headless run still builds a valid scene.
  const sky = makeSkyTexture("#20293a", "#8fa3bd");
  scene.background = sky ?? new THREE.Color(0x1a1d22);

  const initial = containerSize(canvas);
  // FAR PLANE vs. ORBIT CEILING: the two have to agree. `controls.maxDistance` below lets the
  // camera stand 1500 units back to frame the whole yard, and `fitAll` really does use that --
  // but the far plane was 1000, so at any standoff past that the entire scene fell behind the
  // clip plane and the view emptied out. 5000 clears the orbit ceiling plus the yard's own
  // radius with room to spare; the near plane stays at 0.1, and 0.1..5000 is still a
  // comfortable depth-buffer ratio.
  const camera = new THREE.PerspectiveCamera(50, initial.width / initial.height, 0.1, 5000);
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(initial.width, initial.height, true);
  // Renderer capabilities that only exist once a real WebGL context was acquired. Under jsdom
  // (the render tests' environment) there is no context, and THREE leaves `shadowMap` and
  // friends undefined -- so this is guarded and the scene degrades to an unshadowed but
  // otherwise valid graph rather than throwing during construction.
  if (renderer.shadowMap) {
    // Real shadows: the raking key light below now actually occludes, so a car body sits ON
    // the ground instead of hovering over it, and a windmill's sails sweep a shadow across its
    // tower. Soft (PCF) rather than hard-edged, which at this scale reads as daylight rather
    // than a stencil.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Filmic tone mapping + correct output colour space. Without these the bright key light
    // clips metal highlights to flat white; ACES rolls them off so brass, steel and painted
    // bodywork keep their shading where they are brightest.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  // Far enough out to frame the WHOLE showroom yard. `SceneSync.fitAll` clamps the distance
  // it computes to this ceiling, so a ceiling below what the scene needs silently crops the
  // view instead of failing loudly: with nine machines the yard's bounding half-diagonal is
  // roughly 450 units, and at the camera's 50-degree fov that needs 450 / sin(25 deg) ~= 1065
  // units of standoff -- three and a half times the original 300 ceiling, which is exactly why
  // the expanding yard kept not fitting on screen. 1500 clears that with room to grow again.
  controls.maxDistance = 1500;

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
  // Only the key casts -- one shadow-casting light keeps the cost to a single map while still
  // giving every object a definite contact shadow. The ortho frustum has to cover the whole
  // GROUND, because anything outside it silently stops casting with no error of any kind: the
  // frustum was still the +/-160 that suited the original nine-machine cluster, while the yard
  // has since grown to 5x4 machines spanning +/-375, so most of the outer two columns were
  // quietly shadowless. Tied to GROUND_SIZE now, so the yard cannot outgrow it again.
  key.castShadow = true;
  // 4096 over an 800-unit frustum is about 0.2 units per texel -- roughly a fifth of a gear
  // tooth, which is what it takes for tooth shadows to read as teeth rather than as a smudge.
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.left = -GROUND_SIZE / 2;
  key.shadow.camera.right = GROUND_SIZE / 2;
  key.shadow.camera.top = GROUND_SIZE / 2;
  key.shadow.camera.bottom = -GROUND_SIZE / 2;
  key.shadow.camera.near = 1;
  // The light sits ~74 units out and the far corner of the yard is ~565 beyond that; 1500
  // covers it with margin, and an orthographic shadow camera pays no precision penalty for
  // the extra range the way a perspective one would.
  key.shadow.camera.far = 1500;
  key.shadow.bias = -0.0006; // clears the shadow acne that flat gear faces show without it
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
  // Tiled concrete rather than flat paint. Beyond looking like a floor, it is what makes
  // MOTION legible: a car driving across a featureless plane looks static, because nothing
  // passes it. One tile per 50 units is a 50 cm slab at this scale (units.ts), which is about
  // what a workshop floor is cast in.
  const groundTexture = getTiledTexture("stone", GROUND_SIZE / 50);
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0x3d434e,
      roughness: 0.95,
      map: groundTexture,
      bumpMap: groundTexture,
      bumpScale: 0.6,
      roughnessMap: groundTexture,
    }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  // A generated room environment gives every metal something to REFLECT. Physically metal is
  // pure reflection -- with no environment a metalness:0.8 surface has nothing to mirror and
  // renders near-black, which is why the brass and steel here previously read as flat plastic.
  // Guarded: a jsdom/headless run has no working WebGL context to build the PMREM with, and
  // must degrade to the unlit-but-valid scene rather than throwing.
  try {
    if (!renderer.shadowMap) throw new Error("no WebGL context"); // headless: skip entirely
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    scene.environment = pmrem.fromScene(environment, 0.04).texture;
    scene.environmentIntensity = 0.35; // a hint of reflection, not a chrome showroom
    environment.dispose?.();
    pmrem.dispose();
  } catch {
    scene.environment = null;
  }

  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 10, 0x5a6270, 0x454b56); // 10-unit cells
  grid.position.y = 0.01; // avoid z-fighting with the ground plane
  scene.add(grid);

  return { scene, camera, renderer, controls, groundPlane };
}
