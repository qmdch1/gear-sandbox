// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type * as THREE from "three";

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

  describe("stale geometry rebuild (same id, changed type/teeth/module)", () => {
    // Regression coverage for the bug where a re-imported layout reuses a gear's id but
    // changes its type/teeth/module: computeSyncActions only diffs by id, so the gear was
    // never in toAdd/toRemoveIds, and the main sync() loop called obj.update() on the
    // stale GearMeshObject -- which never touches mesh.geometry -- leaving the old shape
    // on screen forever.

    it("disposes and rebuilds the mesh (new instance, new geometry) when a gear's type changes under the same id", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshBefore = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;
      const geometryBefore = meshBefore.geometry;
      const vertexCountBefore = geometryBefore.attributes.position.count;

      const changed = { ...gear, type: "worm" as const };
      sync.sync([changed], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      expect(meshAfter).not.toBe(meshBefore); // a genuinely new mesh object, not the same one mutated
      expect(meshAfter.geometry).not.toBe(geometryBefore); // and a genuinely new geometry instance
      expect(meshAfter.geometry.attributes.position.count).not.toBe(vertexCountBefore); // spur(20 teeth) vs worm actually differ in shape
    });

    it("disposes and rebuilds the mesh when a gear's teeth count changes under the same id", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshBefore = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;
      const vertexCountBefore = meshBefore.geometry.attributes.position.count;

      const changed = { ...gear, teeth: 8 };
      sync.sync([changed], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      expect(meshAfter).not.toBe(meshBefore);
      expect(meshAfter.geometry.attributes.position.count).not.toBe(vertexCountBefore); // fewer teeth -> fewer vertices
    });

    it("disposes and rebuilds the mesh when a gear's module changes under the same id", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshBefore = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      const changed = { ...gear, module: 2 };
      sync.sync([changed], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      expect(meshAfter).not.toBe(meshBefore);
      expect(meshAfter.geometry).not.toBe(meshBefore.geometry);
    });

    it("re-applies the initial (not stale-cached) color on a rebuilt gear, same as a genuinely new gear", () => {
      // A rebuild disposes and reconstructs, which resets lastColorRatio/lastColorBroken to
      // null (see GearMeshObject) -- so the very next update() must re-paint the color from
      // scratch instead of appearing to have "no meaningful change" against stale state.
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1, durabilityCurrent: 100, durabilityMax: 100 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });

      // Change both the shape (forces rebuild) and durability, in the same sync() call.
      const changed = { ...gear, type: "worm" as const, durabilityCurrent: 0, broken: true };
      sync.sync([changed], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;
      const material = meshAfter.material as THREE.MeshStandardMaterial;
      expect(material.color.r).toBeCloseTo(material.color.g, 1); // broken -> gray, not the type's healthy color
    });

    it("does NOT dispose/recreate the mesh when a gear's fields are unchanged across two sync() calls (fast path)", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshBefore = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;
      const geometryBefore = meshBefore.geometry;

      // A fresh object, numerically identical fields -- exactly what re-reading the same
      // sim state on the next frame looks like.
      sync.sync([{ ...gear }], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      expect(meshAfter).toBe(meshBefore); // same mesh instance -- not disposed/recreated
      expect(meshAfter.geometry).toBe(geometryBefore); // same geometry instance too
    });

    it("does not rebuild when only non-shape fields (position, rotation, durability) change", () => {
      const ctx = createScene(document.createElement("canvas"));
      const sync = new SceneSync(ctx);
      const gear = makeGear({ id: "a", type: "spur", teeth: 20, module: 1 });
      sync.sync([gear], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshBefore = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;
      const geometryBefore = meshBefore.geometry;

      const moved = { ...gear, position: [9, 9, 9] as [number, number, number], rotation: 2, durabilityCurrent: 40 };
      sync.sync([moved], [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
      const meshAfter = ctx.scene.children.find((c) => c.name === "a") as THREE.Mesh;

      expect(meshAfter).toBe(meshBefore);
      expect(meshAfter.geometry).toBe(geometryBefore);
      expect(meshAfter.position.x).toBeCloseTo(9); // update() still did its job
    });
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
