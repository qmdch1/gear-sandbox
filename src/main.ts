import type { GearInstance, GearType } from "./sim/types";
import { createGear, toggledAxis, turnedAxis } from "./sim/gearFactory";
import { tick } from "./sim/simulation";
import { resizeConnectedMeshGroup } from "./sim/resize";
import { buildEdges } from "./sim/graph";
import { computePowerPaths } from "./sim/powerPaths";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PaletteUI } from "./ui/paletteUI";
import { PartInfoModal } from "./ui/partInfoModal";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { computeGearLabels } from "./ui/gearLabels";
import { SizeControlPanel } from "./ui/sizeControlPanel";
import { PowerPathPanel } from "./ui/powerPathPanel";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { fetchServerLayout, saveServerLayout } from "./persistence/serverClient";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <section class="panel">
      <h2>부품 담기</h2>
      <div id="palette"></div>
      <ul id="power-hint">
        <li>자동 연결: 다른 부품 가까이 끌어오기</li>
        <li>같이 움직이기: 연결된 부품 하나 끌기</li>
        <li>부품 떼기: <b>Alt</b>+드래그</li>
        <li>높이 조절: <b>Shift</b>+드래그</li>
        <li>눕히기/세우기: 부품 클릭 후 <b>↑</b>/<b>↓</b> (<b>V</b> 키도 동일)</li>
        <li>옆으로 방향 전환(눕지 않음): 부품 클릭 후 <b>←</b>/<b>→</b></li>
        <li>빔·축·벨트 반대쪽 끝 옮기기: <b>Ctrl</b>+드래그</li>
      </ul>
    </section>
    <section class="panel">
      <h2>크기 조절</h2>
      <div id="size-control"></div>
    </section>
    <section class="panel">
      <h2>저장</h2>
      <div id="save-load"></div>
    </section>
    <section class="panel">
      <h2>동력 비교</h2>
      <div id="power-paths"></div>
    </section>
    <section class="panel">
      <h2>확인할 것</h2>
      <div id="diagnostics"></div>
    </section>
  </div>
  <div id="viewport"><canvas id="scene-canvas"></canvas></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#scene-canvas")!;
const ctx = createScene(canvas);
const sceneSync = new SceneSync(ctx);
const diagnosticsPanel = new DiagnosticsPanel(document.querySelector("#diagnostics")!, (id) => {
  sceneSync.focusOn(id);
  sceneSync.flash(id);
});
const powerPathPanel = new PowerPathPanel(document.querySelector("#power-paths")!, (id) => {
  sceneSync.focusOn(id);
  sceneSync.flash(id);
});
const sizeControlPanel = new SizeControlPanel(document.querySelector("#size-control")!, (module) => {
  // Resizing propagates the SAME module out through everything actually
  // tooth-meshed to the selected gear (a mismatched module can't mesh at
  // all, same as real gears with different tooth pitch), repositioning each
  // affected gear to the new correct meshing distance -- see resize.ts.
  if (selectedGearId) resizeConnectedMeshGroup(selectedGearId, module, gears);
});
const partInfoModal = new PartInfoModal(document.body);

let gears: GearInstance[] = [];

// Durability/wear and its time-scale control are disabled for now (kept in the sim
// core, just never advanced) — a fixed 0 keeps every gear at full health indefinitely,
// so the current experience is "place gears, watch them mesh and spin," nothing wearing
// out yet. Re-enabling later is exactly "wire a slider back to this constant."
const WEAR_TIME_SCALE = 0;

function addGear(type: GearType, position: [number, number, number]): void {
  gears.push(createGear(type, position));
}

// Default gears (module 0.5, 20 teeth) need ~10 units of center distance to
// mesh, so a tight spawn grid made every freshly-placed gear register as
// "겹침" (overlapping) instead of a real, draggable starting point. 24 units
// of pitch keeps fresh gears comfortably apart by default while staying in
// easy drag/snap range of each other.
const SPAWN_GRID_PITCH = 24;

/** Square-spiral grid cell for the Nth spawned gear: index 0 is the origin (so the
 *  very first part you place lands dead center, where the default camera looks),
 *  and each following part spirals outward (right, up, left, down, growing) instead
 *  of filling a fixed-size grid whose own center cell isn't index 0. */
function spiralGridCell(index: number): [number, number] {
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  let segmentLength = 1;
  let stepsInSegment = 0;
  let turns = 0;
  for (let i = 0; i < index; i++) {
    x += dx;
    y += dy;
    stepsInSegment++;
    if (stepsInSegment === segmentLength) {
      stepsInSegment = 0;
      [dx, dy] = [-dy, dx]; // rotate 90° counter-clockwise
      turns++;
      if (turns % 2 === 0) segmentLength++;
    }
  }
  return [x, y];
}

function spawnGridPosition(index: number): [number, number, number] {
  const [col, row] = spiralGridCell(index);
  return [col * SPAWN_GRID_PITCH, 0, row * SPAWN_GRID_PITCH];
}

// With this few part types total, a brand-new session showing just one lone gear
// left everything else undiscoverable unless you dug through the palette -- one of
// every type instead, spiraling out from the origin (crank first, so the one
// power-source gear still lands dead center where the default camera looks).
const STARTER_TYPES: GearType[] = [
  "crank", "spur", "helical", "bevel", "worm", "load", "gauge", "fan", "wheel", "shaft", "beam", "belt",
  "joint", "bearing", "spring", "rotor", "track",
];

// No user accounts, so there's exactly one saved layout on the server (see
// serverClient.ts) -- fetch it once on startup. A brand-new server (or a fresh
// visit before anyone's ever hit "저장") has nothing saved yet, which would
// otherwise start on a completely empty canvas with nothing to see or connect to;
// pre-place one of every part type instead, so there's always something to look
// at and build onto right away.
async function loadInitialGears(): Promise<void> {
  try {
    gears = await fetchServerLayout();
  } catch (err) {
    console.error("Failed to load the saved layout from the server; starting with an empty layout.", err);
    gears = [];
  }
  if (gears.length === 0) {
    for (const type of STARTER_TYPES) addGear(type, spawnGridPosition(gears.length));
  }
}
void loadInitialGears();

new PaletteUI(document.querySelector("#palette")!, (type) => {
  partInfoModal.show(type, () => addGear(type, spawnGridPosition(gears.length)));
});

new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: async () => {
    try {
      await saveServerLayout(gears);
    } catch (err) {
      console.error("Failed to save the layout to the server", err);
    }
  },
  load: async () => {
    try {
      gears = await fetchServerLayout();
    } catch (err) {
      console.error("Failed to load the saved layout from the server", err);
    }
  },
});

let selectedGearId: string | null = null;

new DragControls({
  ctx,
  getGears: () => gears,
  onMove: (id, position, rotation) => {
    const gear = gears.find((g) => g.id === id);
    if (!gear) return;
    // A rod's (shaft or beam) far end isn't part of the normal position-delta
    // system anything else uses, so a plain drag has to carry position2 along
    // by the same delta itself, or the rod would stretch/warp instead of
    // moving as a rigid whole.
    if (gear.position2) {
      const delta: [number, number, number] = [
        position[0] - gear.position[0],
        position[1] - gear.position[1],
        position[2] - gear.position[2],
      ];
      gear.position2 = [gear.position2[0] + delta[0], gear.position2[1] + delta[1], gear.position2[2] + delta[2]];
    }
    gear.position = position;
    if (rotation !== undefined) gear.rotation = rotation; // tooth-interlocking snap
  },
  onMoveSecondEnd: (id, position2) => {
    const gear = gears.find((g) => g.id === id);
    if (gear) gear.position2 = position2;
  },
  onPreview: (partnerId) => sceneSync.setPreviewHighlight(partnerId),
  onSelect: (id) => {
    selectedGearId = id;
  },
  resolveHitId: (object, instanceId) => sceneSync.resolveHitId(object, instanceId),
});

// Click any gear, then press Up/Down (or the older V shortcut, kept working
// the same way) to flip it between lying flat (horizontal axis) and standing
// upright (vertical) -- see gearFactory.ts's `toggledAxis`. Up/Down mirrors
// Left/Right's own turn-sideways keys below, so all four arrow keys read as
// one spatial control: left/right turns which way it faces, up/down flips it
// between lying down and standing up. A no-op for "shaft"/"beam" (rods, whose
// orientation comes from position/position2 instead of `axis`) or when
// nothing's selected.
window.addEventListener("keydown", (event) => {
  const isArrow = event.key === "ArrowUp" || event.key === "ArrowDown";
  if ((event.key.toLowerCase() !== "v" && !isArrow) || !selectedGearId) return;
  const gear = gears.find((g) => g.id === selectedGearId);
  if (!gear) return;
  if (isArrow) event.preventDefault(); // arrow keys would otherwise also scroll/pan the page
  gear.axis = toggledAxis(gear.axis);
});

// Left/Right arrow: turn the selected part sideways, between the sim's two
// horizontal directions (see gearFactory.ts's `turnedAxis`) -- e.g. for
// orienting a wheel/gear to spin around a car's own width axis instead of its
// length axis, WITHOUT ever passing through the lying-flat state Up/Down (see
// above) toggles (both arrow keys trigger the same 2-state flip; there's no
// separate "forward" vs "backward" with only two reachable directions).
window.addEventListener("keydown", (event) => {
  if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || !selectedGearId) return;
  const gear = gears.find((g) => g.id === selectedGearId);
  if (!gear) return;
  event.preventDefault(); // arrow keys would otherwise also scroll/pan the page
  gear.axis = turnedAxis(gear.axis);
});

window.addEventListener("resize", () => {
  ctx.camera.aspect = canvas.clientWidth / canvas.clientHeight;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
});

let lastTime = performance.now();
function animate(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const result = tick(gears, dt, WEAR_TIME_SCALE);
  gears = result.gears;
  sceneSync.sync(gears, result.diagnostics);
  const labels = computeGearLabels(gears);
  diagnosticsPanel.render(result.diagnostics, labels);
  powerPathPanel.render(computePowerPaths(gears, buildEdges(gears)), labels);
  sizeControlPanel.render(gears.find((g) => g.id === selectedGearId) ?? null);

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
