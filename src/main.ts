import type { GearInstance, GearType, RemoteLink } from "./sim/types";
import { createGear } from "./sim/gearFactory";
import { createDefaultLayout } from "./sim/defaultLayout";
import { removeGear } from "./sim/removeGear";
import { tick } from "./sim/simulation";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PlacementControls } from "./interaction/placementControls";
import { PaletteUI } from "./ui/paletteUI";
import { LinkModeUI } from "./ui/linkModeUI";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { DurabilityPanel } from "./ui/durabilityPanel";
import { TimeScaleSlider } from "./ui/timeScaleSlider";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { ServerSyncPanel } from "./ui/serverSyncPanel";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "./persistence/storage";
import { createFrameRunner } from "./runtime/frameSafety";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <div id="palette"></div>
    <div id="link-mode-buttons">
      <button id="chain-link-mode">체인 연결 모드</button>
      <button id="belt-link-mode">벨트 연결 모드</button>
    </div>
    <div id="view-controls">
      <button id="fit-all-view">전체 보기 (카메라 리셋)</button>
    </div>
    <div id="save-load"></div>
    <div id="server-sync"></div>
    <label>시간배율 <div id="time-scale"></div></label>
    <div id="diagnostics"></div>
    <div id="durability-panel" hidden></div>
  </div>
  <div id="viewport"><canvas id="scene-canvas"></canvas></div>
  <div id="frame-error-banner" role="alert" hidden></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#scene-canvas")!;
const ctx = createScene(canvas);
const sceneSync = new SceneSync(ctx);
const diagnosticsPanel = new DiagnosticsPanel(document.querySelector("#diagnostics")!, (id) => sceneSync.focusOn(id));
const durabilityPanel = new DurabilityPanel(
  document.querySelector("#durability-panel")!,
  (id, axis) => {
    const gear = gears.find((g) => g.id === id);
    if (!gear) return;
    gear.axis = axis;
    durabilityPanel.show(gear);
  },
  (id) => deleteGear(id),
);

let gears: GearInstance[] = [];
let remoteLinks: RemoteLink[] = [];
// Tracks which gear (if any) is currently selected via DragControls' onSelect, so the
// Delete/Backspace keyboard shortcut below knows what to remove -- kept in sync with the
// durability panel's own show()/hide() lifecycle rather than duplicating selection state.
let selectedGearId: string | null = null;

// Deletes a gear from the live layout: drops it from `gears`, drops any remote link
// (chain/belt) referencing it as an endpoint (see `removeGear` for why a dangling link
// can't be left behind -- `sceneSync` would never dispose its ribbon mesh otherwise),
// and hides the durability panel since the gear it was showing no longer exists.
function deleteGear(id: string): void {
  const result = removeGear(id, gears, remoteLinks);
  gears = result.gears;
  remoteLinks = result.remoteLinks;
  if (selectedGearId === id) selectedGearId = null;
  durabilityPanel.hide();
}
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

// Rigid grid-slot formula, kept as the fallback placement when a placement click's raycast
// doesn't hit the ground plane (see PlacementControls' fallbackPosition option).
function gridSlotPosition(): [number, number, number] {
  return [(gears.length % 5) * 3, 0, Math.floor(gears.length / 5) * 3];
}

const paletteUI = new PaletteUI(document.querySelector("#palette")!, (type) => placementControls.handlePick(type));

const placementControls = new PlacementControls({
  ctx,
  onPlace: (type, position) => addGear(type, position),
  onModeChange: (activeType) => paletteUI.setActive(activeType),
  fallbackPosition: () => gridSlotPosition(),
  getGears: () => gears,
});

function addRemoteLink(a: string, b: string, kind: "chain" | "belt"): void {
  // A link is an unordered pair, so connecting the same two objects again -- in either
  // order -- must not stack up duplicate links (and duplicate ribbons) on the layout.
  const alreadyLinked = remoteLinks.some(
    (link) => link.kind === kind && ((link.a === a && link.b === b) || (link.a === b && link.b === a)),
  );
  if (alreadyLinked) return;
  remoteLinks.push({ a, b, kind });
}

// Tracks each link mode's pending first-pick, purely so the two independent LinkModeUI
// instances (see below -- their buttons don't mutually exclude each other, so both could in
// theory have a pending pick at once) can share the single `sceneSync` preview-highlight
// slot sanely: the most recently picked gear wins the highlight, and clearing it reveals
// the other pending pick (if any) rather than blanking the highlight outright. In the
// overwhelmingly common case -- only one link mode active at a time -- this simplifies to
// "the pending pick is highlighted, and nothing else is."
let chainPickId: string | null = null;
let beltPickId: string | null = null;
let lastPickSource: "chain" | "belt" | null = null;

function syncLinkPickHighlight(): void {
  if (chainPickId && beltPickId) {
    sceneSync.setPreviewHighlight(lastPickSource === "belt" ? beltPickId : chainPickId);
    return;
  }
  sceneSync.setPreviewHighlight(chainPickId ?? beltPickId ?? null);
}

const chainLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#chain-link-mode")!,
  "sprocket",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "chain"),
  (id) => {
    chainPickId = id;
    if (id) lastPickSource = "chain";
    syncLinkPickHighlight();
  },
);

const beltLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#belt-link-mode")!,
  "pulley",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "belt"),
  (id) => {
    beltPickId = id;
    if (id) lastPickSource = "belt";
    syncLinkPickHighlight();
  },
);

// "전체 보기": resets/fits the camera to frame every placed gear at once -- the counterpart to
// DiagnosticsPanel's click-to-focus above, for when panning/zooming (or a far-off placement)
// has wandered off the layout entirely.
document
  .querySelector<HTMLButtonElement>("#fit-all-view")!
  .addEventListener("click", () => sceneSync.fitAll(gears));

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
    if (gear) {
      selectedGearId = gear.id;
      durabilityPanel.show(gear);
    } else {
      selectedGearId = null;
      durabilityPanel.hide();
    }
  },
  // Precedence rule vs. link-mode's pick highlight (see syncLinkPickHighlight above): while
  // either chain or belt link mode has a pending first-pick, that pick highlight owns the
  // single `sceneSync` preview slot and this hover-drag preview must not touch it. This
  // isn't just about which signal is "more important" -- it's load-bearing: DragControls
  // calls onPreview(null) unconditionally on every pointerup, including a plain click with
  // no movement (see dragControls.ts). Without this guard, the very click that sets a pick
  // highlight (via LinkModeUI.onPickChange, fired from the same click's pointerdown-driven
  // onSelect) would have it wiped out a moment later by that same click's pointerup.
  onPreview: (partnerId) => {
    if (chainPickId || beltPickId) return;
    sceneSync.setPreviewHighlight(partnerId);
  },
});

// Delete/Backspace deletes the currently selected gear -- a plain shortcut for the same
// action as the durability panel's 삭제 button. Distinct key from PlacementControls'
// Escape-cancels-placement handler, so the two don't conflict. Guarded against firing
// while a text input (e.g. ServerSyncPanel's server-name field) has focus, so pressing
// Backspace to edit text doesn't also delete the selected gear.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (!selectedGearId) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  deleteGear(selectedGearId);
});

window.addEventListener("resize", () => {
  ctx.camera.aspect = canvas.clientWidth / canvas.clientHeight;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
});

// Small, visible (non-console) indicator for the render-loop resilience below -- this app's
// audience is non-technical, so a console.error alone would never be seen. Kept as a slim,
// non-interactive fixed banner (see #frame-error-banner in style.css) so it never covers the
// canvas or sidebar controls, and never blocks clicks/keys reaching them (pointer-events: none).
const frameErrorBanner = document.querySelector<HTMLDivElement>("#frame-error-banner")!;
let frameErrorBannerHideTimer: number | undefined;
function showFrameErrorBanner(message: string, persistent: boolean): void {
  frameErrorBanner.textContent = message;
  frameErrorBanner.hidden = false;
  if (frameErrorBannerHideTimer !== undefined) {
    window.clearTimeout(frameErrorBannerHideTimer);
    frameErrorBannerHideTimer = undefined;
  }
  if (!persistent) {
    frameErrorBannerHideTimer = window.setTimeout(() => {
      frameErrorBanner.hidden = true;
    }, 5000);
  }
}

// Wraps the per-frame work below in a try/catch (via `frameRunner`) so that an uncaught throw
// anywhere in `tick`/`sceneSync.sync`/`diagnosticsPanel.render` -- e.g. from a corrupted
// localStorage layout or a malformed imported file that slipped past validation -- can never
// again silently and permanently freeze the loop the way it once did. A single bad frame is
// logged and retried on the next frame (the loop keeps calling requestAnimationFrame), so the
// rest of the app (buttons, panels) stays usable regardless. Only if the *same* failure recurs
// on every single frame, back to back, for `maxConsecutiveErrors` frames in a row does the
// runner give up for good -- that pattern means retrying is never going to help and would
// otherwise spam console.error forever at 60fps, so it stops scheduling further frames and
// leaves a persistent banner up instead.
const frameRunner = createFrameRunner({
  onError: ({ error, frame, consecutiveCount }) => {
    console.error(`Render loop error on frame ${frame} (${consecutiveCount} in a row) -- retrying next frame.`, error);
    showFrameErrorBanner("문제가 발생했습니다 — 일부 기능이 일시적으로 중단되었을 수 있습니다", false);
  },
  onGiveUp: ({ error, frame, consecutiveCount }) => {
    console.error(
      `Render loop failed ${consecutiveCount} frames in a row (through frame ${frame}); stopping the loop instead of retrying forever.`,
      error,
    );
    showFrameErrorBanner("문제가 계속 발생하여 애니메이션을 중단했습니다 — 페이지를 새로고침해 주세요", true);
  },
});

let lastTime = performance.now();
function animate(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const keepGoing = frameRunner.runFrame(() => {
    const result = tick({ gears, remoteLinks }, dt, timeScale);
    gears = result.gears;
    sceneSync.sync(gears, remoteLinks, result.diagnostics);
    diagnosticsPanel.render(result.diagnostics, gears);

    ctx.controls.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });

  if (keepGoing) requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
