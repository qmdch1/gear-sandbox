import type { GearInstance, GearType } from "./sim/types";
import { createGear } from "./sim/gearFactory";
import { tick } from "./sim/simulation";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PaletteUI } from "./ui/paletteUI";
import { PartInfoModal } from "./ui/partInfoModal";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { ServerSyncPanel } from "./ui/serverSyncPanel";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "./persistence/storage";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <section class="panel">
      <h2>부품 담기</h2>
      <div id="palette"></div>
      <p id="power-hint">손잡이 기어·배터리·콘센트는 놓으면 자동으로 돌아갑니다. 다른 기어를 가까이 끌어오면 맞물리는 위치로 자동으로 붙습니다. 이미 붙어 있는 기어들은 하나를 끌면 같이 움직여요 — <b>Alt</b>+드래그로 하나만 떼어낼 수 있습니다.</p>
    </section>
    <section class="panel">
      <h2>내 컴퓨터에 저장</h2>
      <div id="save-load"></div>
    </section>
    <section class="panel">
      <h2>온라인에 공유</h2>
      <div id="server-sync"></div>
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
try {
  gears = loadFromLocalStorage() ?? [];
} catch (err) {
  console.error("Failed to load saved layout from localStorage; starting with an empty layout.", err);
  gears = [];
}

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
// instead of a real, draggable starting point. 24 units of pitch, centered on the
// origin, keeps fresh gears apart by default while staying in easy drag/snap range
// of each other.
const SPAWN_GRID_PITCH = 24;
const SPAWN_GRID_COLUMNS = 5;
new PaletteUI(document.querySelector("#palette")!, (type) => {
  partInfoModal.show(type, () => {
    const column = gears.length % SPAWN_GRID_COLUMNS;
    const row = Math.floor(gears.length / SPAWN_GRID_COLUMNS);
    const center = (SPAWN_GRID_COLUMNS - 1) / 2;
    addGear(type, [(column - center) * SPAWN_GRID_PITCH, 0, (row - center) * SPAWN_GRID_PITCH]);
  });
});

new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: () => saveToLocalStorage(gears),
  load: () => {
    const loaded = loadFromLocalStorage();
    if (loaded) gears = loaded;
  },
  exportFile: () => {
    const blob = exportToFile(gears);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gear-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  importFile: async (file) => {
    try {
      gears = await importFromFile(file);
    } catch (err) {
      console.error("Failed to import gear layout file", err);
    }
  },
});

new ServerSyncPanel(document.querySelector("#server-sync")!, {
  getGears: () => gears,
  applyLoadedGears: (loaded) => {
    gears = loaded;
  },
});

new DragControls({
  ctx,
  getGears: () => gears,
  onMove: (id, position, rotation) => {
    const gear = gears.find((g) => g.id === id);
    if (!gear) return;
    gear.position = position;
    if (rotation !== undefined) gear.rotation = rotation; // tooth-interlocking snap
  },
  onPreview: (partnerId) => sceneSync.setPreviewHighlight(partnerId),
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
