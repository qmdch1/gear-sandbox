// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor() {
      this.domElement = document.createElement("canvas");
    }
    setSize() {}
    render() {}
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

import { computeSyncActions, SceneSync } from "../../src/render/sceneSync";
import { createScene } from "../../src/render/scene";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("computeSyncActions", () => {
  it("adds new gears and removes stale ones", () => {
    const existing = new Set(["a", "stale"]);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "new" })];
    const { toAdd, toRemoveIds } = computeSyncActions(existing, gears);
    expect(toAdd.map((g) => g.id)).toEqual(["new"]);
    expect(toRemoveIds).toEqual(["stale"]);
  });
});

describe("SceneSync", () => {
  it("adds one mesh per gear to the scene", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })];
    sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    const gearMeshes = ctx.scene.children.filter((c) => c.name === "a" || c.name === "b");
    expect(gearMeshes.length).toBe(2);
  });

  it("removes a mesh once its gear disappears from the list", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    sync.sync([], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    expect(ctx.scene.children.some((c) => c.name === "a")).toBe(false);
  });

  it("adds a ribbon mesh for a remote link and removes it once the link disappears", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a", type: "sprocket" }), makeGear({ id: "b", type: "sprocket", position: [500, 0, 0] })];
    const link = { a: "a", b: "b", kind: "chain" as const };
    sync.sync(gears, [link], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    const meshCountWithLink = ctx.scene.children.length;

    sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    expect(ctx.scene.children.length).toBe(meshCountWithLink - 1);
  });

  it("focusOn re-aims controls.target at the given gear without throwing when the id is unknown", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a", position: [7, 0, 3] })], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });

    sync.focusOn("a");
    expect(ctx.controls.target.x).toBeCloseTo(7);
    expect(ctx.controls.target.z).toBeCloseTo(3);

    expect(() => sync.focusOn("missing")).not.toThrow();
  });

  describe("fitAll", () => {
    it("moves controls.target to the centroid of all current gears", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gears = [
        makeGear({ id: "a", position: [0, 0, 0] }),
        makeGear({ id: "b", position: [10, 0, 0] }),
        makeGear({ id: "c", position: [5, 0, 10] }),
      ];
      sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });

      sync.fitAll(gears);

      // centroid of (0,0,0), (10,0,0), (5,0,10) is (5, 0, 3.333...)
      expect(ctx.controls.target.x).toBeCloseTo(5);
      expect(ctx.controls.target.y).toBeCloseTo(0);
      expect(ctx.controls.target.z).toBeCloseTo(10 / 3);
    });

    it("clamps the camera distance to minDistance when gears are clustered very close together", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gears = [
        makeGear({ id: "a", position: [0, 0, 0] }),
        makeGear({ id: "b", position: [0.001, 0, 0] }),
      ];
      sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });

      sync.fitAll(gears);

      const distance = ctx.camera.position.distanceTo(ctx.controls.target);
      expect(distance).toBeCloseTo(ctx.controls.minDistance);
    });

    it("clamps the camera distance to maxDistance when gears are spread very far apart", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gears = [
        makeGear({ id: "a", position: [-5000, 0, 0] }),
        makeGear({ id: "b", position: [5000, 0, 0] }),
      ];
      sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });

      sync.fitAll(gears);

      const distance = ctx.camera.position.distanceTo(ctx.controls.target);
      expect(distance).toBeCloseTo(ctx.controls.maxDistance);
    });

    it("does not throw and leaves the camera untouched when there are no gears", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const positionBefore = ctx.camera.position.clone();
      const targetBefore = ctx.controls.target.clone();

      expect(() => sync.fitAll([])).not.toThrow();

      expect(ctx.camera.position.equals(positionBefore)).toBe(true);
      expect(ctx.controls.target.equals(targetBefore)).toBe(true);
    });
  });

  it("draws a single ribbon when the same pair is stored in both orders", () => {
    // A remote link is an unordered pair, so {a,b} and {b,a} are the same connection.
    // With an unsorted ribbon key they hashed differently and produced two overlapping
    // ribbon meshes for one physical chain.
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a", type: "sprocket" }), makeGear({ id: "b", type: "sprocket", position: [500, 0, 0] })];
    sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    const withoutLinks = ctx.scene.children.length;

    sync.sync(
      gears,
      [{ a: "a", b: "b", kind: "chain" as const }, { a: "b", b: "a", kind: "chain" as const }],
      { unconnectedIds: [], noPowerIds: [], overlapPairs: [] },
    );
    expect(ctx.scene.children.length).toBe(withoutLinks + 1);
  });
});
