import type { GearInstance, GearType, RemoteLink } from "./sim/types";
import { wouldDuplicateLink } from "./sim/remoteLinks";
import { createGear } from "./sim/gearFactory";
import { createShowroomLayout, createShowroomProps } from "./sim/showroom";
import { removeGear } from "./sim/removeGear";
import { tick } from "./sim/simulation";
import { createScene, resizeToContainer } from "./render/scene";
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
import { PresetPanel } from "./ui/presetPanel";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "./persistence/storage";
import { createFrameRunner } from "./runtime/frameSafety";
import { createDirtyTracker } from "./runtime/dirtyTracker";
import { repairGear, countNeedingRepair } from "./sim/repair";
import { seatOnGround } from "./sim/ground";

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
      <button id="repair-all" title="닳거나 부서진 기어를 모두 처음 상태로 되돌립니다.">전체 수리 (내구도 회복)</button>
    </div>
    <div id="save-load"></div>
    <div id="server-sync"></div>
    <label>예제 모형 (완성된 기계 예시) <div id="presets"></div></label>
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
    dirtyTracker.markDirty();
    durabilityPanel.show(gear);
  },
  (id) => deleteGear(id),
  (id) => repairOne(id),
);

let gears: GearInstance[] = [];
let remoteLinks: RemoteLink[] = [];
// Decorative props for the initial scene -- the showroom seeds a set (car chassis, plane
// fuselage, ...); a loaded/saved layout has none until the user picks a preset again.
let defaultProps: import("./render/props").Prop[] = [];
// True whenever the live layout has edits a save/export/server-sync would capture but hasn't
// yet -- drives the "don't lose your work" beforeunload guard further down. See
// `createDirtyTracker` for exactly which edits count (and, just as importantly, which don't --
// the animate() loop's own per-tick physics update on `gears` must NOT mark this dirty, or the
// warning would fire for a completely untouched layout that's simply sitting there spinning).
const dirtyTracker = createDirtyTracker();
// Tracks which gear (if any) is currently selected via DragControls' onSelect, so the
// Delete/Backspace keyboard shortcut below knows what to remove -- kept in sync with the
// durability panel's own show()/hide() lifecycle rather than duplicating selection state.
// That guarantee now also covers the three layout-replacement paths below (SaveLoadPanel's
// load/importFile, ServerSyncPanel's applyLoadedLayout, via resetTransientUiState()): a
// freshly loaded layout may not contain the previously-selected gear at all, so selection
// (and the durability panel showing it) must not survive the swap either.
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
  dirtyTracker.markDirty();
}
try {
  const loaded = loadFromLocalStorage();
  if (loaded) {
    gears = loaded.gears;
    remoteLinks = loaded.remoteLinks;
  } else {
    // First-ever visit (or cleared storage): seed the finished-object showroom (car,
    // airplane, windmill, bicycle) instead of an empty canvas or an abstract bench of
    // loose gears, so a new user immediately sees recognizable, complete machines running.
    const seeded = createShowroomLayout();
    gears = seeded.gears;
    remoteLinks = seeded.remoteLinks;
    defaultProps = createShowroomProps();
  }
} catch (err) {
  console.error("Failed to load saved layout from localStorage; starting with an empty layout.", err);
}

// Apply the seeded scene's decorative props (empty for a loaded save) BEFORE fitAll, so the
// camera frames the machines' bodies too, not just their bare gears.
sceneSync.setProps(defaultProps);

// The camera's own fixed initial position (see scene.ts: [30,30,30] looking at the
// origin) has no idea how big or where the actual loaded/seeded layout sits -- the
// bundled showcase in particular spans well beyond that framing, so the very first
// thing a user saw was a cropped, disorienting close-up instead of the whole assembled
// scene (confirmed by screenshot, not just reasoning about it). Frame the real starting
// layout properly right away, the same way the "전체 보기" button does by hand.
sceneSync.fitAll(gears);
let timeScale = 1;

function addGear(type: GearType, position: [number, number, number]): void {
  gears.push(createGear(type, position));
  dirtyTracker.markDirty();
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
  const link: RemoteLink = { a, b, kind };
  if (wouldDuplicateLink(link, remoteLinks)) return;
  remoteLinks.push(link);
  dirtyTracker.markDirty();
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

// A layout swap (load/import/server-sync below) replaces `gears`/`remoteLinks` wholesale, so
// any transient UI state that references a gear id from the *previous* layout must be
// cancelled rather than left dangling -- the durability panel showing a now-nonexistent
// gear, a stale `selectedGearId` that Delete/Backspace would silently no-op against, or a
// pending chain/belt link pick that would otherwise complete into a `RemoteLink` pointing at
// an id `gears` no longer has (SceneSync.sync() would just silently skip rendering it, but
// it'd still sit there dirtying the layout and getting persisted on the next save/export).
// Deliberately does NOT touch chainLinkMode/beltLinkMode's armed/disarmed (`active`) state --
// see LinkModeUI.reset() -- only whatever pick was in flight.
function resetTransientUiState(): void {
  selectedGearId = null;
  durabilityPanel.hide();
  chainPickId = null;
  beltPickId = null;
  lastPickSource = null;
  chainLinkMode.reset();
  beltLinkMode.reset();
  syncLinkPickHighlight();
  // Any layout swap clears the previous preset's decorative body (a plain saved/imported
  // layout has none). A preset load re-adds its own props right AFTER calling this.
  sceneSync.setProps();
}

// "전체 보기": resets/fits the camera to frame every placed gear at once -- the counterpart to
// DiagnosticsPanel's click-to-focus above, for when panning/zooming (or a far-off placement)
// has wandered off the layout entirely.
document
  .querySelector<HTMLButtonElement>("#fit-all-view")!
  .addEventListener("click", () => sceneSync.fitAll(gears));

/** Restores one gear to factory condition. Mutates in place rather than swapping the array,
 *  because `gears` is the single live layout every other handler here closes over. */
function repairOne(id: string): void {
  const gear = gears.find((g) => g.id === id);
  if (!gear) return;
  const fixed = repairGear(gear);
  if (fixed === gear) return; // nothing was damaged
  gear.durabilityCurrent = fixed.durabilityCurrent;
  gear.broken = fixed.broken;
  dirtyTracker.markDirty();
  durabilityPanel.show(gear);
}

// "전체 수리": wear is one-way -- `wear.ts` only subtracts, and a gear worn to zero is `broken`,
// which `rotation.ts` treats as a dead end that stops relaying drive to everything downstream.
// Left running, any layout eventually grinds itself to a halt (the bundled showroom loses its
// first gear at ~67s and has 27 of 72 broken by 150s), and before this there was no way back
// short of reloading and losing your work. This is the counterpart to that: maintenance.
document.querySelector<HTMLButtonElement>("#repair-all")!.addEventListener("click", () => {
  const damaged = countNeedingRepair(gears);
  if (damaged === 0) return;
  for (const gear of gears) {
    const fixed = repairGear(gear);
    gear.durabilityCurrent = fixed.durabilityCurrent;
    gear.broken = fixed.broken;
  }
  dirtyTracker.markDirty();
  const selected = selectedGearId ? gears.find((g) => g.id === selectedGearId) : undefined;
  if (selected) durabilityPanel.show(selected);
});

new TimeScaleSlider(document.querySelector("#time-scale")!, (value) => (timeScale = value), timeScale);

new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: () => {
    saveToLocalStorage({ gears, remoteLinks });
    dirtyTracker.markClean();
  },
  load: () => {
    const loaded = loadFromLocalStorage();
    if (loaded) {
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
      // The loaded state IS the new "saved" baseline until the user edits it further.
      dirtyTracker.markClean();
      resetTransientUiState();
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
    dirtyTracker.markClean();
  },
  importFile: async (file) => {
    try {
      const loaded = await importFromFile(file);
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
      // Same reasoning as `load` above: an imported file is a new saved baseline.
      dirtyTracker.markClean();
      resetTransientUiState();
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
    dirtyTracker.markClean();
    resetTransientUiState();
  },
  onSaved: () => dirtyTracker.markClean(),
});

new PresetPanel(document.querySelector("#presets")!, (rawLayout, rawProps) => {
  // Seat the machine on the ground before showing it. The ground plane is opaque, so anything a
  // preset authored below y = 0 just vanishes into it. A uniform lift is safe: every mesh,
  // coupling, belt and chain depends only on the distance between gears, which translation
  // preserves.
  const { layout, props } = seatOnGround(rawLayout, rawProps);
  gears = layout.gears;
  remoteLinks = layout.remoteLinks;
  // Unlike `load`/`importFile`/`applyLoadedLayout` above (all of which restore a layout
  // that was already persisted somewhere -- localStorage, a file, the server -- and so
  // correctly become the new "saved" baseline), a preset is freshly BUILT in memory by
  // `PRESETS[].build()` every time this callback runs. The user has never saved this exact
  // layout anywhere; it only exists in this tab's live state right now. Calling
  // `markClean()` here would tell `dirtyTracker`/the `beforeunload` guard there's nothing
  // to lose, when in fact closing the tab right after picking a preset loses the whole
  // thing -- exactly the case that guard exists to catch. So a preset load counts as a
  // fresh, unsaved edit (`markDirty()`), the same as adding/moving/deleting a gear by hand.
  dirtyTracker.markDirty();
  resetTransientUiState();
  // AFTER resetTransientUiState (which clears any prior preset's body): render this
  // preset's own decorative props -- the car chassis, clock bezel, etc. -- around its gears.
  sceneSync.setProps(props);
  sceneSync.fitAll(gears);
});

new DragControls({
  ctx,
  getGears: () => gears,
  onMove: (id, position) => {
    const gear = gears.find((g) => g.id === id);
    if (gear) {
      gear.position = position;
      dirtyTracker.markDirty();
    }
  },
  onSelect: (id) => {
    // A click that actually hit an existing gear mesh (id !== null) was never a valid "place a
    // new gear on empty ground" gesture -- regardless of what this same click goes on to do with
    // that hit (plain-select it, drag it, or have a chain/belt link-mode pick below consume it).
    // Cancel any armed placement mode here, unconditionally on a hit, before the browser's own
    // subsequent "click" event reaches PlacementControls (DragControls fires this onSelect from
    // pointerdown, which always precedes the click event for the same gesture, so this runs in
    // time). This single guard fixes both: (1) a plain click on an existing gear no longer also
    // commits an unwanted new gear near it, and (2) dragging an existing gear while placement
    // happens to be armed no longer also commits an unwanted gear at the drop point -- without
    // PlacementControls needing its own duplicate existing-gear raycast.
    if (id) placementControls.cancel();

    if (chainLinkMode.handleSelect(id) || beltLinkMode.handleSelect(id)) return true;
    const gear = id ? gears.find((g) => g.id === id) : undefined;
    if (gear) {
      selectedGearId = gear.id;
      durabilityPanel.show(gear);
    } else {
      selectedGearId = null;
      durabilityPanel.hide();
    }
    return false;
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

// Warns before an accidental tab close/navigate-away while there are unsaved edits (see
// `dirtyTracker` above for exactly what counts). `preventDefault()` + setting `returnValue` is
// the standard, only-reliable-across-browsers way to trigger the browser's own native
// "leave site?" confirmation -- modern browsers ignore any custom message text here, so the
// dialog's wording itself isn't controllable, only whether it appears at all.
window.addEventListener("beforeunload", (event) => {
  if (dirtyTracker.isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Keep the viewport fitted to its container. A window "resize" listener alone misses every
// resize that does not change the window -- a sidebar opening, a split pane being dragged, a
// devtools dock -- so observe the container box itself and re-fit from that.
window.addEventListener("resize", () => resizeToContainer(ctx));
if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
  new ResizeObserver(() => resizeToContainer(ctx)).observe(canvas.parentElement);
}
resizeToContainer(ctx); // fit once up front, in case the container settled after createScene

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
    // Wear off: see TickOptions. Durability is a mechanic, not part of the mechanism, and with
    // it on the machines destroy themselves and stop for good.
    const result = tick({ gears, remoteLinks }, dt, timeScale, { wear: false });
    gears = result.gears;
    sceneSync.sync(gears, remoteLinks, result.diagnostics);
    diagnosticsPanel.render(result.diagnostics, gears);

    ctx.controls.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });

  if (keepGoing) requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
