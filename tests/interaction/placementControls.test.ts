// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// PlacementControls' own raycasting is a thin, un-unit-testable wrapper around real WebGL/camera
// math (same reasoning as DragControls, see its class doc comment) -- so, like the render/scene*
// tests in this repo, we mock three's Raycaster to make the "ground point under the cursor" result
// controllable, and test PlacementControls' actual state machine (arm/cancel/commit/fallback)
// against that controlled input.
let nextHitPoint: { x: number; y: number; z: number } | null = null;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockRaycaster {
    setFromCamera(): void {}
    intersectObject(): Array<{ point: { x: number; y: number; z: number } }> {
      return nextHitPoint ? [{ point: nextHitPoint }] : [];
    }
  }
  return {
    ...actual,
    Raycaster: MockRaycaster,
  };
});

import { PlacementControls } from "../../src/interaction/placementControls";
import type { SceneContext } from "../../src/render/scene";
import type { GearType } from "../../src/sim/types";

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
});
