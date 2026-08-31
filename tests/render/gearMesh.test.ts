// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { colorForDurabilityRatio, colorForGear, GEAR_TYPE_COLOR, GearMeshObject } from "../../src/render/gearMesh";
import type { GearInstance, GearType } from "../../src/sim/types";

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

describe("GEAR_TYPE_COLOR", () => {
  it("defines a distinct color for every gear type", () => {
    const types = Object.keys(GEAR_TYPE_COLOR) as GearType[];
    expect(types.length).toBe(12); // one per GearType -- fails loudly if a type is ever added and forgotten here
    const hexes = new Set(types.map((t) => GEAR_TYPE_COLOR[t].getHexString()));
    expect(hexes.size).toBe(types.length); // no two types share a base color
  });
});

describe("colorForGear", () => {
  it("returns each type's own base color at full health", () => {
    const spur = colorForGear("spur", 1, false);
    const worm = colorForGear("worm", 1, false);
    expect(spur.equals(GEAR_TYPE_COLOR.spur)).toBe(true);
    expect(worm.equals(GEAR_TYPE_COLOR.worm)).toBe(true);
    expect(spur.equals(worm)).toBe(false); // the two types must actually look different
  });

  it("converges toward the same damage colors regardless of type once badly worn", () => {
    // Two different types, both nearly destroyed: the durability gradient should
    // dominate and pull both toward the same red, overriding their distinct base colors.
    const spurNearDead = colorForGear("spur", 0.02, false);
    const wormNearDead = colorForGear("worm", 0.02, false);
    expect(spurNearDead.r).toBeGreaterThan(spurNearDead.g); // reads as damaged (red-leaning)
    expect(wormNearDead.r).toBeGreaterThan(wormNearDead.g);
    // Close to each other despite very different healthy base colors.
    expect(Math.abs(spurNearDead.r - wormNearDead.r)).toBeLessThan(0.05);
    expect(Math.abs(spurNearDead.g - wormNearDead.g)).toBeLessThan(0.05);
    expect(Math.abs(spurNearDead.b - wormNearDead.b)).toBeLessThan(0.05);
  });

  it("returns the same gray broken color for every type, ignoring durability ratio", () => {
    const brokenSpur = colorForGear("spur", 0.9, true); // high ratio, but broken=true wins
    const brokenWorm = colorForGear("worm", 0.9, true);
    expect(brokenSpur.equals(brokenWorm)).toBe(true);
    expect(brokenSpur.r).toBeCloseTo(brokenSpur.g, 5);
    expect(brokenSpur.g).toBeCloseTo(brokenSpur.b, 5);
  });

  it("blends smoothly from a type's base color toward yellow as it first wears past full health", () => {
    const full = colorForGear("pulley", 1, false);
    const halfway = colorForGear("pulley", 0.75, false); // partway between 1.0 and the 0.5 yellow point
    const atYellow = colorForGear("pulley", 0.5, false);
    // halfway should sit strictly between the pure type color and pure yellow on each channel
    // (or be flat if that channel doesn't change between the two endpoints).
    for (const channel of ["r", "g", "b"] as const) {
      const lo = Math.min(full[channel], atYellow[channel]);
      const hi = Math.max(full[channel], atYellow[channel]);
      expect(halfway[channel]).toBeGreaterThanOrEqual(lo - 1e-6);
      expect(halfway[channel]).toBeLessThanOrEqual(hi + 1e-6);
    }
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

  it("colors a fully healthy gear's material with its type's base color", () => {
    const spur = new GearMeshObject(makeGear({ type: "spur" }));
    const worm = new GearMeshObject(makeGear({ type: "worm" }));
    const spurMaterial = spur.mesh.material as THREE.MeshStandardMaterial;
    const wormMaterial = worm.mesh.material as THREE.MeshStandardMaterial;
    expect(spurMaterial.color.equals(GEAR_TYPE_COLOR.spur)).toBe(true);
    expect(wormMaterial.color.equals(GEAR_TYPE_COLOR.worm)).toBe(true);
  });

  it("uses MeshStandardMaterial so scene lighting actually shades the gear", () => {
    const obj = new GearMeshObject(makeGear({}));
    expect(obj.mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
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

  describe("color recompute skipping", () => {
    it("keeps the very same Color object across repeated updates with unchanged durability/broken", () => {
      const gear = makeGear({ durabilityCurrent: 100, durabilityMax: 100, broken: false });
      const obj = new GearMeshObject(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      const colorBefore = material.color;
      obj.update(gear);
      obj.update(gear);
      obj.update({ ...gear }); // even a fresh object with numerically identical fields
      expect(material.color).toBe(colorBefore); // same object reference -- no reassignment happened
    });

    it("does not reassign color for a durability drift smaller than the visibility epsilon", () => {
      // Mirrors wear.ts's continuous per-tick float drift (durabilityCurrent -= small amount
      // every frame while spinning) rather than a discrete jump -- this is the exact case the
      // optimization targets: many frames' worth of imperceptible sub-threshold change.
      const gear = makeGear({ durabilityCurrent: 100, durabilityMax: 100, broken: false });
      const obj = new GearMeshObject(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      const colorBefore = material.color;
      obj.update({ ...gear, durabilityCurrent: 99.999999 }); // ratio delta ~1e-8, far under epsilon
      expect(material.color).toBe(colorBefore);
    });

    it("reassigns a new Color once accumulated drift crosses the visibility epsilon", () => {
      const gear = makeGear({ durabilityCurrent: 100, durabilityMax: 100, broken: false });
      const obj = new GearMeshObject(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      const colorBefore = material.color;
      // A ratio drop of 0.5 crosses the 0.001-ish visibility threshold by a wide margin,
      // and actually shifts the rendered color (full health -> the 0.5 yellow midpoint).
      obj.update({ ...gear, durabilityCurrent: 50 });
      expect(material.color).not.toBe(colorBefore);
      expect(material.color.equals(colorForGear("spur", 0.5, false))).toBe(true);
    });

    it("always reassigns color on a broken transition, even with the ratio otherwise unchanged", () => {
      const gear = makeGear({ durabilityCurrent: 0, durabilityMax: 100, broken: false });
      const obj = new GearMeshObject(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      const colorBefore = material.color;
      obj.update({ ...gear, broken: true }); // same ratio (0), only `broken` flips
      expect(material.color).not.toBe(colorBefore);
      expect(material.color.equals(colorForGear("spur", 0, true))).toBe(true);
    });

    it("always applies a color on the very first update of a fresh instance", () => {
      // Regression guard for the "no stale state to compare against yet" requirement --
      // a brand new GearMeshObject must not appear to have unchanged durability/broken by
      // comparing against an uninitialized 0/false default.
      const gear = makeGear({ durabilityCurrent: 0, durabilityMax: 100, broken: false });
      const obj = new GearMeshObject(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      // durabilityCurrent=0 -> ratio=0 -> should already read as the broken/critical color,
      // not the constructor's initial colorForGear(type, 1, false) placeholder.
      expect(material.color.equals(colorForGear("spur", 0, false))).toBe(true);
    });
  });
});
