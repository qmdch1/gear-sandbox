// @vitest-environment jsdom
import * as THREE from "three";
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

const NO_PROBLEMS = { unconnectedIds: [], noPowerIds: [], overlapPairs: [] };

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
  it("collapses two gears sharing type/teeth/module into ONE InstancedMesh, not two separate meshes", () => {
    // The whole point of instancing -- see sceneSync.ts's isInstanced doc comment.
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })];
    sync.sync(gears, NO_PROBLEMS);
    const instancedMeshes = ctx.scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes.length).toBe(1);
    expect((instancedMeshes[0] as THREE.InstancedMesh).count).toBe(2);
  });

  it("resolves a raycast-style (mesh, instanceId) hit back to the specific gear id occupying that slot", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })];
    sync.sync(gears, NO_PROBLEMS);
    const instancedMesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    // Both instance ids (0 and 1) must resolve to ONE of the two real gear ids,
    // and between them, to BOTH -- not the same id twice, not something else.
    const resolved = new Set([sync.resolveHitId(instancedMesh, 0), sync.resolveHitId(instancedMesh, 1)]);
    expect(resolved).toEqual(new Set(["a", "b"]));
  });

  it("uses a SEPARATE InstancedMesh group for a different type/teeth/module combination", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [
      makeGear({ id: "a", type: "spur", teeth: 20 }),
      makeGear({ id: "b", type: "helical", teeth: 20 }),
      makeGear({ id: "c", type: "spur", teeth: 10 }),
    ];
    sync.sync(gears, NO_PROBLEMS);
    const instancedMeshes = ctx.scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes.length).toBe(3); // spur/20, helical/20, spur/10 -- all distinct
  });

  it("removes an instanced gear's slot when it disappears from the list, without touching its group-mates", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })], NO_PROBLEMS);
    sync.sync([makeGear({ id: "b", position: [5, 0, 0] })], NO_PROBLEMS);
    const instancedMesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instancedMesh.count).toBe(1);
    expect(sync.resolveHitId(instancedMesh, 0)).toBe("b");
  });

  it("detaches an InstancedMesh group entirely once its last gear is removed", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    sync.sync([], NO_PROBLEMS);
    expect(ctx.scene.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
  });

  it("still renders a belt as its own individual, named mesh -- never instanced", () => {
    // Belts have bespoke, per-instance geometry (see gearGeometry.ts's
    // beltTangentGeometry) -- they must keep the pre-instancing per-mesh path.
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const belt = makeGear({ id: "belt-1", type: "belt", teeth: 0, position: [0, 0, 0], position2: [12, 0, 0] });
    sync.sync([belt], NO_PROBLEMS);
    expect(ctx.scene.children.some((c) => c.name === "belt-1")).toBe(true);
    expect(ctx.scene.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
  });

  it("removes a belt's individual mesh once its gear disappears from the list", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "belt-1", type: "belt", teeth: 0, position: [0, 0, 0], position2: [12, 0, 0] })], NO_PROBLEMS);
    sync.sync([], NO_PROBLEMS);
    expect(ctx.scene.children.some((c) => c.name === "belt-1")).toBe(false);
  });

  it("resolves a plain (non-instanced) hit via the object's own name, for a belt", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "belt-1", type: "belt", teeth: 0, position: [0, 0, 0], position2: [12, 0, 0] })], NO_PROBLEMS);
    const beltMesh = ctx.scene.children.find((c) => c.name === "belt-1")!;
    expect(sync.resolveHitId(beltMesh, undefined)).toBe("belt-1");
  });

  it("grows an InstancedMesh's capacity to fit more instances than it started with", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = Array.from({ length: 20 }, (_, i) => makeGear({ id: `g${i}`, position: [i * 20, 0, 0] }));
    sync.sync(gears, NO_PROBLEMS);
    const instancedMesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instancedMesh.count).toBe(20);
    // Every gear must still resolve correctly after growing -- a naive resize
    // that didn't carry existing instance data across would leave stale/blank slots.
    const resolvedIds = new Set(Array.from({ length: 20 }, (_, i) => sync.resolveHitId(instancedMesh, i)));
    expect(resolvedIds).toEqual(new Set(gears.map((g) => g.id)));
  });

  it("moves a gear into a different InstancedMesh group once its module changes (the size slider)", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a", module: 1 })], NO_PROBLEMS);
    const originalMesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(sync.resolveHitId(originalMesh, 0)).toBe("a");

    sync.sync([makeGear({ id: "a", module: 2 })], NO_PROBLEMS); // resized
    const instancedMeshes = ctx.scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    // The old (module=1) group had exactly one gear, which just left it -- it
    // should be torn down entirely rather than left behind, empty, forever.
    expect(instancedMeshes.length).toBe(1);
    const newMesh = instancedMeshes[0] as THREE.InstancedMesh;
    expect(sync.resolveHitId(newMesh, 0)).toBe("a");
  });

  it("keeps a resized gear's OTHER group-mates (same new module) intact, not duplicated or lost", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync(
      [makeGear({ id: "a", module: 1 }), makeGear({ id: "b", module: 2, position: [5, 0, 0] })],
      NO_PROBLEMS,
    );
    sync.sync(
      [makeGear({ id: "a", module: 2 }), makeGear({ id: "b", module: 2, position: [5, 0, 0] })],
      NO_PROBLEMS,
    );
    const instancedMeshes = ctx.scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes.length).toBe(1); // both now module=2 -- one shared group
    const mesh = instancedMeshes[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(2);
    const resolved = new Set([sync.resolveHitId(mesh, 0), sync.resolveHitId(mesh, 1)]);
    expect(resolved).toEqual(new Set(["a", "b"]));
  });

  it("does not move a gear that hasn't actually resized, on every ordinary sync() call", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a", module: 1 })], NO_PROBLEMS);
    const meshBefore = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    sync.sync([makeGear({ id: "a", module: 1 })], NO_PROBLEMS); // same module again
    const meshAfter = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(meshAfter).toBe(meshBefore); // same group instance, never torn down/rebuilt
  });

  it("does NOT tint an unconnected gear's color -- unconnected is not a problem", () => {
    // Regression: "미연결" (unconnected) used to be treated as a "problem" and
    // got the red warning tint -- but a freshly-placed, not-yet-hooked-up part
    // is normal, not wrong (see diagnosticsPanel.ts's matching split).
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], { unconnectedIds: ["a"], noPowerIds: [], overlapPairs: [] });
    const mesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const color = new THREE.Color();
    mesh.getColorAt(0, color);
    const plainDurabilityColor = new THREE.Color(0x3ddc73); // colorForDurabilityRatio's HEALTHY at full durability, un-tinted
    expect(color.getHexString()).not.toBe(
      plainDurabilityColor.clone().lerp(new THREE.Color(0xff3b30), 0.5).getHexString(),
    );
  });

  it("DOES tint a gear listed under noPowerIds -- that's a real problem", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], { unconnectedIds: [], noPowerIds: ["a"], overlapPairs: [] });
    const mesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const withProblem = new THREE.Color();
    mesh.getColorAt(0, withProblem);

    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const withoutProblem = new THREE.Color();
    mesh.getColorAt(0, withoutProblem);

    expect(withProblem.getHexString()).not.toBe(withoutProblem.getHexString());
  });

  it("flashes a gear's color right after flash() is called", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const mesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const before = new THREE.Color();
    mesh.getColorAt(0, before);

    sync.flash("a");
    now.mockReturnValue(1000); // no time has passed yet -- right at the start of the flash
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const atStart = new THREE.Color();
    mesh.getColorAt(0, atStart);
    expect(atStart.getHexString()).toBe(before.getHexString()); // sin(0) = 0 -- no visible blend yet

    // Check partway through the first blink instead, where it's clearly lit.
    now.mockReturnValue(1000 + 1400 / 12); // a twelfth of the way into the first of 3 blinks
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const midBlink = new THREE.Color();
    mesh.getColorAt(0, midBlink);
    expect(midBlink.getHexString()).not.toBe(before.getHexString());

    now.mockRestore();
  });

  it("fades a flash back to normal once its duration has fully elapsed", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const mesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const before = new THREE.Color();
    mesh.getColorAt(0, before);

    sync.flash("a");
    now.mockReturnValue(1000 + 1400 + 1); // just past the flash's full duration
    sync.sync([makeGear({ id: "a" })], NO_PROBLEMS);
    const after = new THREE.Color();
    mesh.getColorAt(0, after);
    expect(after.getHexString()).toBe(before.getHexString());

    now.mockRestore();
  });

  it("only flashes the specific gear that was flash()-ed, not its group-mates", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })], NO_PROBLEMS);
    sync.flash("a");
    now.mockReturnValue(1000 + 1400 / 12);
    sync.sync([makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })], NO_PROBLEMS);
    const mesh = ctx.scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    mesh.getColorAt(0, colorA);
    mesh.getColorAt(1, colorB);
    expect(colorA.getHexString()).not.toBe(colorB.getHexString());

    now.mockRestore();
  });

  it("focuses the camera on a gear's own position", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a", position: [7, 0, 9] })], NO_PROBLEMS);
    sync.focusOn("a");
    const [x, y, z] = ctx.controls.target.toArray();
    expect(x).toBeCloseTo(7);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(9);
  });

  it("focuses the camera on a rod's MIDPOINT, matching where it's actually rendered", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "shaft-1", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] })], NO_PROBLEMS);
    sync.focusOn("shaft-1");
    const [x, y, z] = ctx.controls.target.toArray();
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
  });
});
