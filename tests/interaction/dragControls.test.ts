// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// DragControls' own raycasting is a thin, un-unit-testable wrapper around real WebGL/camera
// math (see the class doc comment) -- so, like PlacementControls' tests, we mock three's
// Raycaster to make both the "ground point under the cursor" result AND the "which gear mesh
// did pointerdown hit" result controllable, and test DragControls' actual pointer-event
// wiring (select/drag/drop, and now drop-time overlap avoidance) against that controlled input.
let nextGroundPoint: { x: number; y: number; z: number } | null = null;
let nextHitId: string | null = null;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockRaycaster {
    setFromCamera(): void {}
    intersectObject(): Array<{ point: { x: number; y: number; z: number } }> {
      return nextGroundPoint ? [{ point: nextGroundPoint }] : [];
    }
    intersectObjects(): Array<{ object: { name: string } }> {
      return nextHitId ? [{ object: { name: nextHitId } }] : [];
    }
  }
  return {
    ...actual,
    Raycaster: MockRaycaster,
  };
});

import { DragControls, findNearestCompatiblePartner } from "../../src/interaction/dragControls";
import { LinkModeUI } from "../../src/ui/linkModeUI";
import type { SceneContext } from "../../src/render/scene";
import type { GearInstance } from "../../src/sim/types";
import { isOverlapping } from "../../src/sim/meshing";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("findNearestCompatiblePartner", () => {
  it("picks the gear that would form a valid mesh, ignoring one that would not", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const validPartner = makeGear({ id: "valid", teeth: 20, module: 1, position: [0, 0, 0] }); // dist 15 = 10+20 /2... see below
    const farPartner = makeGear({ id: "far", teeth: 20, module: 1, position: [500, 0, 0] });
    const partner = findNearestCompatiblePartner(dragged, [validPartner, farPartner]);
    expect(partner?.id).toBe("valid");
  });

  it("returns null when nothing nearby would form a valid mesh", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const incompatible = makeGear({ id: "incompatible", teeth: 20, module: 1, position: [900, 0, 0] });
    expect(findNearestCompatiblePartner(dragged, [incompatible])).toBeNull();
  });
});

function makeCtx(): SceneContext {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return {
    scene: { children: [] } as unknown as SceneContext["scene"],
    camera: {} as SceneContext["camera"],
    renderer: { domElement: canvas } as SceneContext["renderer"],
    controls: { enabled: true } as SceneContext["controls"],
    groundPlane: {} as SceneContext["groundPlane"],
  };
}

function pointerDown(ctx: SceneContext): void {
  ctx.renderer.domElement.dispatchEvent(
    new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }),
  );
}

function pointerMove(ctx: SceneContext): void {
  ctx.renderer.domElement.dispatchEvent(
    new PointerEvent("pointermove", { clientX: 50, clientY: 50, bubbles: true }),
  );
}

function pointerUp(): void {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

/** Wires an `onMove` that mutates the given gear's `position` in place, matching the real
 *  app's own wiring (see `main.ts`) -- and the assumption `DragControls` itself already relies
 *  on elsewhere (`onPointerMove`'s `onPreview` block reads `getGears()` right after calling
 *  `onMove` in the very same handler, expecting it to already reflect the move). */
function trackingOnMove(gears: GearInstance[]): (id: string, position: [number, number, number]) => void {
  return (id, position) => {
    const gear = gears.find((g) => g.id === id);
    if (gear) gear.position = position;
  };
}

describe("DragControls drop-time overlap avoidance", () => {
  beforeEach(() => {
    nextGroundPoint = null;
    nextHitId = null;
  });

  it("does not nudge while the pointer is still moving -- the gear tracks the raw raycast point exactly", () => {
    const ctx = makeCtx();
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, position: [-50, 0, -50] });
    const existing = makeGear({ id: "existing", type: "spur", teeth: 20, position: [5, 0, 7] });
    const gears = [dragged, existing];
    new DragControls({ ctx, getGears: () => gears, onMove: trackingOnMove(gears) });

    nextHitId = "dragged";
    pointerDown(ctx);
    nextGroundPoint = { x: 5, y: 0, z: 7 }; // exactly on top of `existing`
    pointerMove(ctx);

    expect(dragged.position).toEqual([5, 0, 7]);
  });

  it("nudges the dragged gear clear of an existing gear once dropped", () => {
    const ctx = makeCtx();
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, position: [-50, 0, -50] });
    const existing = makeGear({ id: "existing", type: "spur", teeth: 20, position: [5, 0, 7] });
    const gears = [dragged, existing];
    new DragControls({ ctx, getGears: () => gears, onMove: trackingOnMove(gears) });

    nextHitId = "dragged";
    pointerDown(ctx);
    nextGroundPoint = { x: 5, y: 0, z: 7 }; // exactly on top of `existing`
    pointerMove(ctx);
    pointerUp();

    expect(dragged.position).not.toEqual([5, 0, 7]);
    expect(isOverlapping(dragged, existing)).toBe(false);
  });

  it("does not nudge a legitimate coincident coupling (e.g. a load dragged onto its crank)", () => {
    const ctx = makeCtx();
    const dragged = makeGear({ id: "dragged-load", type: "load", teeth: 0, position: [-50, 0, -50] });
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, position: [5, 0, 7] });
    const gears = [dragged, crank];
    new DragControls({ ctx, getGears: () => gears, onMove: trackingOnMove(gears) });

    nextHitId = "dragged-load";
    pointerDown(ctx);
    nextGroundPoint = { x: 5, y: 0, z: 7 }; // exactly on top of the crank -- the intended shaft coupling
    pointerMove(ctx);
    pointerUp();

    expect(dragged.position).toEqual([5, 0, 7]);
  });

  it("excludes the dragged gear itself from the overlap check, so it never fights its own position", () => {
    const ctx = makeCtx();
    // Only `dragged` exists -- if the overlap check failed to exclude it from the "existing
    // gears" list, it would trivially "overlap" itself (distance 0 from its own position) and
    // get nudged away from the exact spot the user dropped it on.
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, position: [-50, 0, -50] });
    const gears = [dragged];
    const onMove = vi.fn(trackingOnMove(gears));
    new DragControls({ ctx, getGears: () => gears, onMove });

    nextHitId = "dragged";
    pointerDown(ctx);
    nextGroundPoint = { x: 3, y: 0, z: 4 };
    pointerMove(ctx);
    onMove.mockClear();
    pointerUp();

    expect(dragged.position).toEqual([3, 0, 4]);
    // No extra corrective `onMove` call should fire on drop when there was nothing to correct.
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not fire an extra onMove on a plain click/drop with no overlap to correct", () => {
    const ctx = makeCtx();
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, position: [0, 0, 0] });
    const far = makeGear({ id: "far", type: "spur", teeth: 20, position: [500, 0, 0] });
    const gears = [dragged, far];
    const onMove = vi.fn(trackingOnMove(gears));
    new DragControls({ ctx, getGears: () => gears, onMove });

    nextHitId = "dragged";
    pointerDown(ctx);
    pointerUp();

    expect(onMove).not.toHaveBeenCalled();
  });
});

// Bug B (see track task): DragControls.onPointerDown used to unconditionally start a drag
// (and disable orbit controls) for whatever gear pointerdown hit, BEFORE calling onSelect --
// leaving callers like main.ts's chain/belt link-mode wiring with no way to say "this click
// was consumed as a link-mode pick, don't also drag it." That let an ordinary click (mousedown,
// tiny pointer drift, mouseup -- routine, not a deliberate drag gesture) silently relocate the
// picked gear. onSelect now returns a boolean: `true` means "consumed elsewhere," and
// DragControls must skip both the drag-start and the orbit-controls-disable side effects for it,
// while still calling onSelect unconditionally either way.
describe("DragControls onSelect consumption gating (Bug B fix)", () => {
  beforeEach(() => {
    nextGroundPoint = null;
    nextHitId = null;
  });

  it("does not start a drag or disable orbit controls when onSelect returns true (consumed elsewhere)", () => {
    const ctx = makeCtx();
    const gear = makeGear({ id: "g1", position: [1, 0, 1] });
    const gears = [gear];
    const onMove = vi.fn(trackingOnMove(gears));
    const onSelect = vi.fn(() => true);
    new DragControls({ ctx, getGears: () => gears, onMove, onSelect });

    nextHitId = "g1";
    pointerDown(ctx);
    expect(onSelect).toHaveBeenCalledWith("g1");
    // Orbit controls must stay enabled -- no drag was started for this consumed click.
    expect(ctx.controls.enabled).toBe(true);

    nextGroundPoint = { x: 9, y: 0, z: 9 };
    pointerMove(ctx);
    pointerUp();

    expect(onMove).not.toHaveBeenCalled();
    expect(gear.position).toEqual([1, 0, 1]);
  });

  it("still drags normally when onSelect returns false (no regression)", () => {
    const ctx = makeCtx();
    const gear = makeGear({ id: "g1", position: [1, 0, 1] });
    const gears = [gear];
    const onMove = vi.fn(trackingOnMove(gears));
    const onSelect = vi.fn(() => false);
    new DragControls({ ctx, getGears: () => gears, onMove, onSelect });

    nextHitId = "g1";
    pointerDown(ctx);
    expect(ctx.controls.enabled).toBe(false);

    nextGroundPoint = { x: 9, y: 0, z: 9 };
    pointerMove(ctx);
    expect(gear.position).toEqual([9, 0, 9]);

    pointerUp();
    expect(ctx.controls.enabled).toBe(true);
  });

  it("still drags normally when onSelect is omitted entirely (existing callers with no onSelect)", () => {
    const ctx = makeCtx();
    const gear = makeGear({ id: "g1", position: [1, 0, 1] });
    const gears = [gear];
    const onMove = vi.fn(trackingOnMove(gears));
    new DragControls({ ctx, getGears: () => gears, onMove });

    nextHitId = "g1";
    pointerDown(ctx);
    expect(ctx.controls.enabled).toBe(false);

    nextGroundPoint = { x: 2, y: 0, z: 3 };
    pointerMove(ctx);
    expect(gear.position).toEqual([2, 0, 3]);
  });

  it("still calls onSelect unconditionally with the hit id, whether or not the click is consumed", () => {
    const ctx = makeCtx();
    const onSelect = vi.fn(() => true);
    new DragControls({ ctx, getGears: () => [], onMove: vi.fn(), onSelect });

    nextHitId = "g1";
    pointerDown(ctx);
    expect(onSelect).toHaveBeenCalledWith("g1");

    nextHitId = null;
    pointerDown(ctx);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  // Integration-level proof, wired the same way main.ts actually wires it
  // (`chainLinkMode.handleSelect(id) || beltLinkMode.handleSelect(id)`), using the real
  // LinkModeUI class rather than a stand-in -- this is the exact end-to-end scenario Bug B
  // described: picking a gear for a chain/belt link, with the pointer drifting before release.
  it("a real LinkModeUI pick on a gear does not start a drag, even if the pointer moves before release", () => {
    const ctx = makeCtx();
    const sprocketA = makeGear({ id: "sprocket-a", type: "sprocket", position: [0, 0, 0] });
    const sprocketB = makeGear({ id: "sprocket-b", type: "sprocket", position: [10, 0, 0] });
    const gears = [sprocketA, sprocketB];
    const onMove = vi.fn(trackingOnMove(gears));

    const button = document.createElement("button");
    const onLink = vi.fn();
    const chainLinkMode = new LinkModeUI(
      button,
      "sprocket",
      (id) => gears.find((g) => g.id === id)?.type,
      onLink,
    );
    button.click(); // arms chain link mode, mirroring the sidebar button in main.ts

    new DragControls({
      ctx,
      getGears: () => gears,
      onMove,
      onSelect: (id) => chainLinkMode.handleSelect(id),
    });

    nextHitId = "sprocket-a";
    pointerDown(ctx); // picked as the first link-mode target -- handleSelect returns true
    expect(ctx.controls.enabled).toBe(true); // never disabled -- no drag started

    // The pointer drifts far away before release -- routine for an ordinary click. Without the
    // fix, this relocated the picked gear to wherever the pointer ended up.
    nextGroundPoint = { x: 500, y: 0, z: 500 };
    pointerMove(ctx);
    pointerUp();

    expect(sprocketA.position).toEqual([0, 0, 0]);
    expect(onMove).not.toHaveBeenCalled();
    expect(onLink).not.toHaveBeenCalled(); // only the first pick landed; no second gear clicked yet

    // The second click, on a different sprocket, completes the link and also must not drag.
    nextHitId = "sprocket-b";
    pointerDown(ctx);
    pointerUp();

    expect(onLink).toHaveBeenCalledWith("sprocket-a", "sprocket-b");
    expect(sprocketB.position).toEqual([10, 0, 0]);
  });
});
