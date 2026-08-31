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
