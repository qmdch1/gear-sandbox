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
});
