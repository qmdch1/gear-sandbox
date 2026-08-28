import type { GearInstance, GearType, RemoteLink } from "./sim/types";
import { createGear } from "./sim/gearFactory";
import { createDefaultLayout } from "./sim/defaultLayout";
import { tick } from "./sim/simulation";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PaletteUI } from "./ui/paletteUI";
import { LinkModeUI } from "./ui/linkModeUI";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { DurabilityPanel } from "./ui/durabilityPanel";
import { TimeScaleSlider } from "./ui/timeScaleSlider";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { ServerSyncPanel } from "./ui/serverSyncPanel";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "./persistence/storage";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <div id="palette"></div>
    <div id="link-mode-buttons">
      <button id="chain-link-mode">체인 연결 모드</button>
      <button id="belt-link-mode">벨트 연결 모드</button>
    </div>
    <div id="save-load"></div>
    <div id="server-sync"></div>
    <label>시간배율 <div id="time-scale"></div></label>
    <div id="diagnostics"></div>
    <div id="durability-panel" hidden></div>
  </div>
  <div id="viewport"><canvas id="scene-canvas"></canvas></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#scene-canvas")!;
const ctx = createScene(canvas);
const sceneSync = new SceneSync(ctx);
const diagnosticsPanel = new DiagnosticsPanel(document.querySelector("#diagnostics")!, (id) => sceneSync.focusOn(id));
const durabilityPanel = new DurabilityPanel(document.querySelector("#durability-panel")!);

let gears: GearInstance[] = [];
let remoteLinks: RemoteLink[] = [];
try {
  const loaded = loadFromLocalStorage();
  if (loaded) {
    gears = loaded.gears;
    remoteLinks = loaded.remoteLinks;
  } else {
    // First-ever visit (or cleared storage): seed a working showcase layout instead of
    // an empty canvas, so a new user sees gears actually meshing before they place any.
    const seeded = createDefaultLayout();
    gears = seeded.gears;
    remoteLinks = seeded.remoteLinks;
  }
} catch (err) {
  console.error("Failed to load saved layout from localStorage; starting with an empty layout.", err);
}
let timeScale = 1;

function addGear(type: GearType, position: [number, number, number]): void {
  gears.push(createGear(type, position));
}

new PaletteUI(document.querySelector("#palette")!, (type) =>
  addGear(type, [(gears.length % 5) * 3, 0, Math.floor(gears.length / 5) * 3]),
);

function addRemoteLink(a: string, b: string, kind: "chain" | "belt"): void {
  // A link is an unordered pair, so connecting the same two objects again -- in either
  // order -- must not stack up duplicate links (and duplicate ribbons) on the layout.
  const alreadyLinked = remoteLinks.some(
    (link) => link.kind === kind && ((link.a === a && link.b === b) || (link.a === b && link.b === a)),
  );
  if (alreadyLinked) return;
  remoteLinks.push({ a, b, kind });
}

const chainLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#chain-link-mode")!,
  "sprocket",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "chain"),
);

const beltLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#belt-link-mode")!,
  "pulley",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "belt"),
);

new TimeScaleSlider(document.querySelector("#time-scale")!, (value) => (timeScale = value), timeScale);

new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: () => saveToLocalStorage({ gears, remoteLinks }),
  load: () => {
    const loaded = loadFromLocalStorage();
    if (loaded) {
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
    }
  },
  exportFile: () => {
    const blob = exportToFile({ gears, remoteLinks });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gear-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  importFile: async (file) => {
    try {
      const loaded = await importFromFile(file);
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
    } catch (err) {
      console.error("Failed to import gear layout file", err);
    }
  },
});

new ServerSyncPanel(document.querySelector("#server-sync")!, {
  getLayout: () => ({ gears, remoteLinks }),
  applyLoadedLayout: (loaded) => {
    gears = loaded.gears;
    remoteLinks = loaded.remoteLinks;
  },
});

new DragControls({
  ctx,
  getGears: () => gears,
  onMove: (id, position) => {
    const gear = gears.find((g) => g.id === id);
    if (gear) gear.position = position;
  },
  onSelect: (id) => {
    if (chainLinkMode.handleSelect(id) || beltLinkMode.handleSelect(id)) return;
    const gear = id ? gears.find((g) => g.id === id) : undefined;
    if (gear) durabilityPanel.show(gear);
    else durabilityPanel.hide();
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

  const result = tick({ gears, remoteLinks }, dt, timeScale);
  gears = result.gears;
  sceneSync.sync(gears, remoteLinks, result.diagnostics);
  diagnosticsPanel.render(result.diagnostics, gears);

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
