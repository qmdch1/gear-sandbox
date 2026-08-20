import type { GearInstance, GearType } from "./sim/types";
import { createGear, toggledAxis } from "./sim/gearFactory";
import { tick } from "./sim/simulation";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PaletteUI } from "./ui/paletteUI";
import { PartInfoModal } from "./ui/partInfoModal";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { fetchServerLayout, saveServerLayout } from "./persistence/serverClient";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <section class="panel">
      <h2>부품 담기</h2>
      <div id="palette"></div>
      <p id="power-hint">동력원 기어는 놓으면 자동으로 돌아갑니다. 다른 기어를 가까이 끌어오면 맞물리는 위치로 자동으로 붙습니다. 이미 붙어 있는 기어들은 하나를 끌면 같이 움직여요 — <b>Alt</b>+드래그로 하나만 떼어낼 수 있습니다. <b>Shift</b>+드래그로 위아래 높이를 조절할 수 있습니다(베벨 기어처럼 높이를 맞춰야 할 때 사용). 베벨·웜 기어는 클릭해서 고른 뒤 <b>V</b> 키를 누르면 가로/세로 축 방향을 바꿀 수 있습니다. 동력전달축은 평소엔 통째로 움직이고, <b>Ctrl</b>+드래그하면 반대쪽 끝만 따로 옮길 수 있습니다.</p>
    </section>
    <section class="panel">
      <h2>저장</h2>
      <div id="save-load"></div>
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
const diagnosticsPanel = new DiagnosticsPanel(document.querySelector("#diagnostics")!, (id) => sceneSync.focusOn(id));
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

// Default gears (module 1, 20 teeth) need ~20 units of center distance to mesh, so a
// tight spawn grid made every freshly-placed gear register as "겹침" (overlapping)
// instead of a real, draggable starting point. 24 units of pitch keeps fresh gears
// apart by default while staying in easy drag/snap range of each other.
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
const STARTER_TYPES: GearType[] = ["crank", "spur", "helical", "bevel", "worm", "load", "gauge", "fan", "wheel", "shaft"];

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
    // A shaft's far end isn't part of the normal position-delta system anything
    // else uses, so a plain drag has to carry position2 along by the same delta
    // itself, or the rod would stretch/warp instead of moving as a rigid whole.
    if (gear.type === "shaft" && gear.position2) {
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
});

// Click a bevel/worm gear, then press V to flip it between lying flat (its default
// horizontal axis) and standing upright (vertical) -- see gearFactory.ts's
// `toggledAxis`. No-op for every other type or when nothing's selected.
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "v" || !selectedGearId) return;
  const gear = gears.find((g) => g.id === selectedGearId);
  if (!gear) return;
  gear.axis = toggledAxis(gear.type, gear.axis);
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
  diagnosticsPanel.render(result.diagnostics);

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
