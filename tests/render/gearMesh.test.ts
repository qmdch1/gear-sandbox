// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect } from "vitest";
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

  it("translates a rack along its axis by linearPosition instead of rotating it", () => {
    const gear = makeGear({ type: "rack", teeth: 8, axis: [1, 0, 0], position: [0, 0, 0], linearPosition: 5, rotation: 99 });
    const obj = new GearMeshObject(gear);
    expect(obj.mesh.position.x).toBeCloseTo(5);
    expect(obj.mesh.rotation.z).toBe(0); // rotation is never applied to a rack, regardless of gear.rotation
  });

  it("orients a rack's teeth (local +Y) toward its meshing pinion, not an arbitrary roll", () => {
    // axis=[1,0,0] is the case where THREE's axis-only setFromUnitVectors(Z, axis)
    // happens to rotate purely about world Y -- meaning local +Y maps to world [0,1,0]
    // regardless of where any pinion actually is. Facing the pinion at [0,0,5] (straight
    // out along world Z, perpendicular to the travel axis) must override that and give
    // local +Y -> [0,0,1] instead; if this test used a pinion direction that happened to
    // coincide with the axis-only roll's own [0,1,0], it would pass even without reading
    // `facePinionPosition` at all.
    const gear = makeGear({ type: "rack", teeth: 8, axis: [1, 0, 0], position: [0, 0, 0] });
    const obj = new GearMeshObject(gear);
    obj.update(gear, [0, 0, 5]);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.mesh.quaternion);
    expect(localUp.x).toBeCloseTo(0);
    expect(localUp.y).toBeCloseTo(0);
    expect(localUp.z).toBeCloseTo(1);
  });

  it("projects out the along-axis component of the pinion direction before facing it", () => {
    // Pinion sits off to the side AND partly along the rack's own travel axis -- only
    // the perpendicular part should determine the facing direction.
    const gear = makeGear({ type: "rack", teeth: 8, axis: [1, 0, 0], position: [0, 0, 0] });
    const obj = new GearMeshObject(gear);
    obj.update(gear, [3, 0, 5]); // perpendicular component is [0,0,5] -> same facing as the test above
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.mesh.quaternion);
    expect(localUp.x).toBeCloseTo(0);
    expect(localUp.y).toBeCloseTo(0);
    expect(localUp.z).toBeCloseTo(1);
  });

  it("falls back to axis-only alignment when a rack has no meshing pinion to face", () => {
    const gear = makeGear({ type: "rack", teeth: 8, axis: [1, 0, 0], position: [0, 0, 0] });
    const obj = new GearMeshObject(gear);
    expect(() => obj.update(gear, undefined)).not.toThrow();
    // Local Z still maps to the travel axis regardless of the (arbitrary) roll.
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.mesh.quaternion);
    expect(localZ.x).toBeCloseTo(1);
    expect(localZ.y).toBeCloseTo(0);
    expect(localZ.z).toBeCloseTo(0);
  });

  it("leaves a non-rack gear's orientation unaffected by a facePinionPosition argument", () => {
    const gear = makeGear({ type: "spur", axis: [0, 1, 0], position: [0, 0, 0], rotation: 0.5 });
    const withoutFace = new GearMeshObject(gear);
    const withFace = new GearMeshObject(gear);
    withFace.update(gear, [3, 4, 0]);
    expect(withFace.mesh.quaternion.equals(withoutFace.mesh.quaternion)).toBe(true);
  });
});
