// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// PlacementControls' own raycasting is a thin, un-unit-testable wrapper around real WebGL/camera
// math (same reasoning as DragControls, see its class doc comment) -- so, like the render/scene*
// tests in this repo, we mock three's Raycaster to make the "ground point under the cursor" result
// controllable, and test PlacementControls' actual state machine (arm/cancel/commit/fallback)
// against that controlled input.
let nextHitPoint: { x: number; y: number; z: number } | null = null;
// Only used by the DragControls-integration tests below (Bug A regression) -- controls what
// pointerdown's existing-gear-mesh raycast reports, mirroring dragControls.test.ts's own mock.
let nextHitId: string | null = null;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockRaycaster {
    setFromCamera(): void {}
    intersectObject(): Array<{ point: { x: number; y: number; z: number } }> {
      return nextHitPoint ? [{ point: nextHitPoint }] : [];
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

import { PlacementControls } from "../../src/interaction/placementControls";
import { DragControls } from "../../src/interaction/dragControls";
import type { SceneContext } from "../../src/render/scene";
import type { GearInstance, GearType } from "../../src/sim/types";
import { createGear } from "../../src/sim/gearFactory";
import { isOverlapping } from "../../src/sim/meshing";

function makeCtx(): SceneContext {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return {
    scene: {} as SceneContext["scene"],
    camera: {} as SceneContext["camera"],
    renderer: { domElement: canvas } as SceneContext["renderer"],
    controls: {} as SceneContext["controls"],
    groundPlane: {} as SceneContext["groundPlane"],
  };
}

function clickCanvas(ctx: SceneContext): void {
  ctx.renderer.domElement.dispatchEvent(
    new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true }),
  );
}

/** Only used by the DragControls-integration tests below -- a real browser fires pointerdown
 *  and pointerup for the same gesture that later synthesizes "click" on the same element, so
 *  these simulate that ordering ahead of `clickCanvas`. */
function pointerDown(ctx: SceneContext): void {
  ctx.renderer.domElement.dispatchEvent(
    new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }),
  );
}

function pointerUp(): void {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

/** Like `makeCtx`, but with a real `scene.children` list and mutable `controls.enabled` --
 *  needed only by the DragControls-integration tests below, since DragControls (unlike
 *  PlacementControls) reads both of those. */
function makeIntegrationCtx(sceneChildren: Array<{ name: string }>): SceneContext {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return {
    scene: { children: sceneChildren } as unknown as SceneContext["scene"],
    camera: {} as SceneContext["camera"],
    renderer: { domElement: canvas } as SceneContext["renderer"],
    controls: { enabled: true } as SceneContext["controls"],
    groundPlane: {} as SceneContext["groundPlane"],
  };
}

/** A fixed-id existing gear for overlap tests, matching the real `GearInstance` shape (same
 *  conventions as `defaultLayout.ts`'s `seedGear`) rather than a partial stand-in. */
function seedGear(
  id: string,
  type: GearInstance["type"],
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
): GearInstance {
  return {
    id,
    type,
    position,
    axis,
    teeth,
    module: 1,
    durabilityMax: 100,
    durabilityCurrent: 100,
    broken: false,
    rotation: 0,
    angularVelocity: 0,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

describe("PlacementControls", () => {
  beforeEach(() => {
    nextHitPoint = null;
  });

  it("arms placement mode on the picked type without creating a gear", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    const onModeChange = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace,
      onModeChange,
      fallbackPosition: () => [0, 0, 0],
    });

    controls.handlePick("spur" satisfies GearType);

    expect(onPlace).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledWith("spur");
    expect(controls.isActive).toBe(true);
    expect(controls.active).toBe("spur");
    expect(ctx.renderer.domElement.style.cursor).toBe("crosshair");
  });

  it("clicking the viewport while armed creates exactly one gear at the raycast position", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace,
      fallbackPosition: () => [99, 0, 99],
    });

    controls.handlePick("spur" satisfies GearType);
    nextHitPoint = { x: 5, y: 0, z: 7 };
    clickCanvas(ctx);

    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace).toHaveBeenCalledWith("spur", [5, 0, 7]);
    expect(controls.isActive).toBe(false);
    expect(ctx.renderer.domElement.style.cursor).toBe("");
  });

  it("falls back to the grid-slot position when the raycast misses the ground plane", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace,
      fallbackPosition: () => [9, 0, 12],
    });

    controls.handlePick("worm" satisfies GearType);
    nextHitPoint = null; // raycast misses
    clickCanvas(ctx);

    expect(onPlace).toHaveBeenCalledWith("worm", [9, 0, 12]);
  });

  it("clicking the viewport while not armed does nothing", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    new PlacementControls({ ctx, onPlace, fallbackPosition: () => [0, 0, 0] });

    nextHitPoint = { x: 1, y: 0, z: 1 };
    clickCanvas(ctx);

    expect(onPlace).not.toHaveBeenCalled();
  });

  it("picking the same type again cancels placement without creating a gear", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    const onModeChange = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace,
      onModeChange,
      fallbackPosition: () => [0, 0, 0],
    });

    controls.handlePick("spur" satisfies GearType);
    onModeChange.mockClear();
    controls.handlePick("spur" satisfies GearType);

    expect(onPlace).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledWith(null);
    expect(controls.isActive).toBe(false);
    expect(ctx.renderer.domElement.style.cursor).toBe("");
  });

  it("picking a different type while armed switches placement to the new type", () => {
    const ctx = makeCtx();
    const onModeChange = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace: vi.fn(),
      onModeChange,
      fallbackPosition: () => [0, 0, 0],
    });

    controls.handlePick("spur" satisfies GearType);
    controls.handlePick("worm" satisfies GearType);

    expect(controls.active).toBe("worm");
    expect(onModeChange).toHaveBeenLastCalledWith("worm");
  });

  it("Escape cancels placement mode without creating a gear", () => {
    const ctx = makeCtx();
    const onPlace = vi.fn();
    const onModeChange = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace,
      onModeChange,
      fallbackPosition: () => [0, 0, 0],
    });

    controls.handlePick("spur" satisfies GearType);
    onModeChange.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onPlace).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledWith(null);
    expect(controls.isActive).toBe(false);

    // A subsequent canvas click after cancel must not place anything either.
    nextHitPoint = { x: 3, y: 0, z: 3 };
    clickCanvas(ctx);
    expect(onPlace).not.toHaveBeenCalled();
  });

  it("Escape is a no-op when nothing is armed", () => {
    const ctx = makeCtx();
    const onModeChange = vi.fn();
    const controls = new PlacementControls({
      ctx,
      onPlace: vi.fn(),
      onModeChange,
      fallbackPosition: () => [0, 0, 0],
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onModeChange).not.toHaveBeenCalled();
    expect(controls.isActive).toBe(false);
  });

  describe("overlap avoidance", () => {
    it("nudges a new gear clear of an existing gear it would otherwise land on top of", () => {
      const ctx = makeCtx();
      const onPlace = vi.fn();
      const existing = seedGear("existing-spur", "spur", [5, 0, 7], [0, 1, 0], 20);
      const controls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
        getGears: () => [existing],
      });

      controls.handlePick("spur" satisfies GearType);
      nextHitPoint = { x: 5, y: 0, z: 7 }; // exactly on top of `existing`
      clickCanvas(ctx);

      expect(onPlace).toHaveBeenCalledTimes(1);
      const [placedType, placedPosition] = onPlace.mock.calls[0] as [GearType, [number, number, number]];
      expect(placedType).toBe("spur");
      // The click "roughly worked" -- it wasn't rejected -- but the raw raycast point [5, 0, 7]
      // must not be where the gear actually landed, since that would sit inside `existing`.
      expect(placedPosition).not.toEqual([5, 0, 7]);
      const placedGear = createGear("spur", placedPosition);
      expect(isOverlapping(placedGear, existing)).toBe(false);
    });

    it("keeps nudging until clear of a second gear the first nudge would have landed on", () => {
      const ctx = makeCtx();
      const onPlace = vi.fn();
      // `gearA` sits exactly at the click point; a single-pass nudge away from it (spur pitch
      // radius 10 + 10, x1.02 clearance) lands at exactly [20.4, 0, 0] -- so `gearB` is planted
      // right there to force a second nudge iteration.
      const gearA = seedGear("gear-a", "spur", [0, 0, 0], [0, 1, 0], 20);
      const gearB = seedGear("gear-b", "spur", [20.4, 0, 0], [0, 1, 0], 20);
      const controls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
        getGears: () => [gearA, gearB],
      });

      controls.handlePick("spur" satisfies GearType);
      nextHitPoint = { x: 0, y: 0, z: 0 };
      clickCanvas(ctx);

      expect(onPlace).toHaveBeenCalledTimes(1);
      const [, placedPosition] = onPlace.mock.calls[0] as [GearType, [number, number, number]];
      const placedGear = createGear("spur", placedPosition);
      // A single-pass nudge (checking only the gear just avoided) would have stopped at
      // [20.4, 0, 0], which still overlaps gearB -- so this is the real regression guard.
      expect(isOverlapping(placedGear, gearA)).toBe(false);
      expect(isOverlapping(placedGear, gearB)).toBe(false);
    });

    it("does not nudge a legitimate coincident placement (e.g. a load onto its crank)", () => {
      const ctx = makeCtx();
      const onPlace = vi.fn();
      const crank = seedGear("existing-crank", "crank", [5, 0, 7], [0, 1, 0], 20);
      const controls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
        getGears: () => [crank],
      });

      controls.handlePick("load" satisfies GearType);
      nextHitPoint = { x: 5, y: 0, z: 7 }; // exactly on top of the crank -- the intended shaft coupling
      clickCanvas(ctx);

      expect(onPlace).toHaveBeenCalledTimes(1);
      // Unlike the accidental-overlap cases above, this placement must land exactly where clicked --
      // a load is *meant* to be coincident with the crank it couples to.
      expect(onPlace).toHaveBeenCalledWith("load", [5, 0, 7]);
    });

    it("falls back to no-op overlap avoidance when getGears is not supplied", () => {
      const ctx = makeCtx();
      const onPlace = vi.fn();
      const controls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
      });

      controls.handlePick("spur" satisfies GearType);
      nextHitPoint = { x: 5, y: 0, z: 7 };
      clickCanvas(ctx);

      expect(onPlace).toHaveBeenCalledWith("spur", [5, 0, 7]);
    });
  });

  // Bug A (see track task): PlacementControls' "click" handler only ever checked whether
  // placement was armed (`if (!type) return;`) -- it never checked whether the click actually
  // hit an EXISTING gear mesh, which DragControls independently raycasts for on the very same
  // pointerdown/pointerup/click gesture. That let a plain click on an existing gear both select
  // it (DragControls) AND commit an unwanted brand-new gear near it (PlacementControls), and let
  // dragging an existing gear to reposition it ALSO commit an extra gear at the release point.
  //
  // The fix lives in main.ts's DragControls.onSelect wiring, not in PlacementControls itself:
  // `onSelect` now calls `placementControls.cancel()` whenever pointerdown's raycast actually
  // hit an existing gear (id !== null), before the browser's later "click" event ever reaches
  // PlacementControls. These tests wire PlacementControls + DragControls together exactly the
  // way main.ts does, to prove the combination actually closes both bugs end-to-end.
  describe("canceled by an existing-gear hit -- Bug A regression (main.ts's onSelect wiring)", () => {
    beforeEach(() => {
      nextHitPoint = null;
      nextHitId = null;
    });

    it("a plain click on an existing gear does not also commit an unwanted new placement", () => {
      const ctx = makeIntegrationCtx([{ name: "existing" }]);
      const onPlace = vi.fn();
      const placementControls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
      });

      // Mirrors main.ts's exact wiring: cancel any armed placement whenever the click hit an
      // existing gear, regardless of what else consumes the selection.
      new DragControls({
        ctx,
        getGears: () => [],
        onMove: vi.fn(),
        onSelect: (id) => {
          if (id) placementControls.cancel();
          return false;
        },
      });

      placementControls.handlePick("spur" satisfies GearType);
      expect(placementControls.isActive).toBe(true);

      nextHitId = "existing"; // pointerdown's gear raycast hits the existing gear
      pointerDown(ctx);
      pointerUp();
      // The browser synthesizes "click" after pointerdown/pointerup on the same element --
      // simulate that ordering here, same as the real canvas.
      clickCanvas(ctx);

      expect(placementControls.isActive).toBe(false); // canceled at pointerdown time
      expect(onPlace).not.toHaveBeenCalled(); // no unwanted gear committed
    });

    it("dragging an existing gear while placement is armed does not also commit a gear at the drop point", () => {
      const ctx = makeIntegrationCtx([{ name: "existing" }]);
      const onPlace = vi.fn();
      const placementControls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
      });
      new DragControls({
        ctx,
        getGears: () => [],
        onMove: vi.fn(),
        onSelect: (id) => {
          if (id) placementControls.cancel();
          return false;
        },
      });

      placementControls.handlePick("spur" satisfies GearType);

      nextHitId = "existing";
      pointerDown(ctx); // starts a drag on the existing gear
      pointerUp(); // drops it
      clickCanvas(ctx); // the same gesture's synthesized click

      expect(placementControls.isActive).toBe(false);
      expect(onPlace).not.toHaveBeenCalled();
    });

    it("a click on empty ground still places normally -- placement is only canceled on an actual existing-gear hit", () => {
      const ctx = makeIntegrationCtx([]);
      const onPlace = vi.fn();
      const placementControls = new PlacementControls({
        ctx,
        onPlace,
        fallbackPosition: () => [0, 0, 0],
      });
      new DragControls({
        ctx,
        getGears: () => [],
        onMove: vi.fn(),
        onSelect: (id) => {
          if (id) placementControls.cancel();
          return false;
        },
      });

      placementControls.handlePick("spur" satisfies GearType);

      nextHitId = null; // pointerdown's gear raycast hits nothing
      pointerDown(ctx);
      pointerUp();
      nextHitPoint = { x: 5, y: 0, z: 7 };
      clickCanvas(ctx);

      expect(placementControls.isActive).toBe(false); // committed normally
      expect(onPlace).toHaveBeenCalledWith("spur", [5, 0, 7]);
    });
  });
});
