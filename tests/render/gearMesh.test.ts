// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { colorForDurabilityRatio, GearMeshObject } from "../../src/render/gearMesh";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("colorForDurabilityRatio", () => {
  it("is green at full durability and red near zero", () => {
    const full = colorForDurabilityRatio(1);
    const empty = colorForDurabilityRatio(0.01);
    expect(full.g).toBeGreaterThan(full.r);
    expect(empty.r).toBeGreaterThan(empty.g);
  });
});

describe("GearMeshObject", () => {
  it("positions the mesh at the gear's position", () => {
    const gear = makeGear({ position: [3, 0, 5] });
    const obj = new GearMeshObject(gear);
    expect(obj.mesh.position.toArray()).toEqual([3, 0, 5]);
  });

  it("darkens toward the broken color once the gear is marked broken", () => {
    const gear = makeGear({ durabilityCurrent: 0, broken: true });
    const obj = new GearMeshObject(gear);
    const material = obj.mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.r).toBeCloseTo(material.color.g, 1); // gray, not red or green
  });

  it("shares one cached geometry instance across two gears with identical type/teeth/module", () => {
    const a = new GearMeshObject(makeGear({ id: "a", type: "spur", teeth: 20, module: 1 }));
    const b = new GearMeshObject(makeGear({ id: "b", type: "spur", teeth: 20, module: 1 }));
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
  });

  it("does not dispose the shared/cached geometry when a mesh is removed -- other gears may still use it", () => {
    const gear = makeGear({ type: "wheel", teeth: 0, module: 1 });
    const obj = new GearMeshObject(gear);
    const disposeSpy = vi.spyOn(obj.mesh.geometry, "dispose");
    obj.dispose();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it("still disposes its own (per-instance) material", () => {
    const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
    const obj = new GearMeshObject(gear);
    const disposeSpy = vi.spyOn(obj.mesh.material as THREE.Material, "dispose");
    obj.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it("keeps a belt on the shared/cached single-strap geometry while neither end is connected", () => {
    const gear = makeGear({ type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0] });
    const other = new GearMeshObject(makeGear({ id: "other-belt", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0] }));
    const obj = new GearMeshObject(gear);
    // Same cached geometry as any other unconnected belt -- no bespoke shape yet.
    expect(obj.mesh.geometry).toBe(other.mesh.geometry);
  });

  it("refreshes a disconnected belt's geometry when its module changes (the size slider)", () => {
    // Regression: the disconnected-default branch used to only re-fetch cached
    // geometry when transitioning AWAY from a bespoke tangent shape -- a belt
    // that stayed disconnected the whole time never picked up a module change.
    const gear = makeGear({ type: "belt", teeth: 0, module: 1, position: [0, 0, 0], position2: [30, 0, 0] });
    const obj = new GearMeshObject(gear);
    const atModule1 = obj.mesh.geometry;
    obj.update({ ...gear, module: 2 });
    const atModule2 = obj.mesh.geometry;
    expect(atModule2).not.toBe(atModule1);
  });

  it("swaps in a bespoke tangent geometry once a belt is connected on at least one end", () => {
    const gear = makeGear({
      type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
      beltEndRadius1: 10, beltEndRadius2: 5,
    });
    const unconnected = new GearMeshObject(makeGear({ id: "u", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0] }));
    const obj = new GearMeshObject(gear);
    expect(obj.mesh.geometry).not.toBe(unconnected.mesh.geometry);
    // The tangent geometry bakes absolute world coordinates directly into its
    // vertices -- the mesh's own transform must stay at the identity, or the
    // shape would be double-transformed.
    expect(obj.mesh.position.toArray()).toEqual([0, 0, 0]);
    expect(obj.mesh.quaternion.x).toBeCloseTo(0);
    expect(obj.mesh.quaternion.y).toBeCloseTo(0);
    expect(obj.mesh.quaternion.z).toBeCloseTo(0);
    expect(obj.mesh.quaternion.w).toBeCloseTo(1);
  });

  it("disposes a bespoke tangent geometry it owns when replaced or removed, but never the shared default", () => {
    const gear = makeGear({
      type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
      beltEndRadius1: 10, beltEndRadius2: 5,
    });
    const obj = new GearMeshObject(gear);
    const bespokeGeometry = obj.mesh.geometry;
    const disposeSpy = vi.spyOn(bespokeGeometry, "dispose");

    // Disconnecting (both radii drop to undefined) must dispose the bespoke
    // shape and revert to the shared cached default, not leak it.
    obj.update({ ...gear, beltEndRadius1: undefined, beltEndRadius2: undefined });
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(obj.mesh.geometry).not.toBe(bespokeGeometry);

    // Now on the shared default -- dispose() must NOT call its dispose (it's
    // cached, other belts may still use it).
    const defaultDisposeSpy = vi.spyOn(obj.mesh.geometry, "dispose");
    obj.dispose();
    expect(defaultDisposeSpy).not.toHaveBeenCalled();
  });
});
