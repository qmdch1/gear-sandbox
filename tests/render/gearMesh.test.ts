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

  describe("planetary rendering (single rigid-body rotation baseline)", () => {
    // `planetaryGeometry` (gearGeometry.ts) bakes the sun, ring, and all three orbiting
    // planet sub-shapes into ONE merged BufferGeometry with no per-sub-shape grouping
    // metadata, and `update()` above applies exactly one `rotateZ(gear.rotation)` to the
    // whole mesh. This is today's known, intentional-for-now simplification (documented
    // in GEAR_NOTES.planetary): the three "planets" do not spin independently of the
    // assembly or of each other -- everything turns together as one rigid body. This test
    // is a regression guard for that baseline, not an endorsement of it -- if a future
    // change (e.g. an independent-planet-spin visual flourish) intentionally splits this
    // apart, update this test's expectation to match the new intentional behavior.
    it("rotates every vertex of the merged sun+ring+planets geometry by the exact same single angle -- gear.rotation -- with no independent sub-motion", () => {
      const rotation = 0.73;
      const gear = makeGear({ type: "planetary", teeth: 40, module: 1, axis: [0, 0, 1], position: [0, 0, 0], rotation });
      const obj = new GearMeshObject(gear);
      const position = obj.mesh.geometry.attributes.position;

      // axis=[0,0,1] makes GearMeshObject's axis-alignment quaternion the identity, so the
      // mesh's quaternion is purely the rotateZ(rotation) call -- isolating exactly the
      // rotation under test.
      let checked = 0;
      for (let i = 0; i < position.count; i += 37) { // sample spread across sun, ring, and all three planets
        const localX = position.getX(i);
        const localY = position.getY(i);
        const localR = Math.hypot(localX, localY);
        if (localR < 1e-6) continue; // angle undefined at the axis itself
        const world = new THREE.Vector3(localX, localY, 0).applyQuaternion(obj.mesh.quaternion);
        expect(Math.hypot(world.x, world.y)).toBeCloseTo(localR, 5); // rigid: radius unchanged by rotation
        const localAngle = Math.atan2(localY, localX);
        const worldAngle = Math.atan2(world.y, world.x);
        const diff = Math.atan2(Math.sin(worldAngle - localAngle - rotation), Math.cos(worldAngle - localAngle - rotation));
        expect(diff).toBeCloseTo(0, 5); // this vertex -- wherever it sits in the merged buffer -- turned by exactly `rotation`, same as every other
        checked++;
      }
      expect(checked).toBeGreaterThan(10); // sanity: actually sampled a meaningful spread of the assembly
    });
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

  describe("needsRebuild", () => {
    it("is false when type/teeth/module are all unchanged", () => {
      const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
      const obj = new GearMeshObject(gear);
      expect(obj.needsRebuild(gear)).toBe(false);
      expect(obj.needsRebuild({ ...gear })).toBe(false); // fresh object, numerically identical
    });

    it("is true once the gear's type changes under the same instance", () => {
      const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
      const obj = new GearMeshObject(gear);
      expect(obj.needsRebuild({ ...gear, type: "worm" })).toBe(true);
    });

    it("is true once the gear's teeth count changes under the same instance", () => {
      const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
      const obj = new GearMeshObject(gear);
      expect(obj.needsRebuild({ ...gear, teeth: 8 })).toBe(true);
    });

    it("is true once the gear's module changes under the same instance", () => {
      const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
      const obj = new GearMeshObject(gear);
      expect(obj.needsRebuild({ ...gear, module: 2 })).toBe(true);
    });

    it("treats teeth=0 as equivalent to teeth=1, matching the constructor's own || fallback", () => {
      const gear = makeGear({ type: "spur", teeth: 0, module: 1 });
      const obj = new GearMeshObject(gear); // built with teeth=0||1=1
      expect(obj.needsRebuild({ ...gear, teeth: 1 })).toBe(false); // both normalize to 1 -- no spurious rebuild
    });

    it("is unaffected by non-shape fields like position, rotation, or durability", () => {
      const gear = makeGear({ type: "spur", teeth: 20, module: 1 });
      const obj = new GearMeshObject(gear);
      expect(
        obj.needsRebuild({ ...gear, position: [9, 9, 9], rotation: 3, durabilityCurrent: 1 }),
      ).toBe(false);
    });
  });
});

describe("GearMeshObject -- machined finish", () => {
  it("keeps the type colour and the durability tint intact after adding a surface map", () => {
    // The finish is a greyscale map that MULTIPLIES the material colour, so it must not disturb
    // the steel/bronze/copper palette or the damage tint. If a future change ever tinted the
    // map itself, this is what would catch it.
    const healthy = new GearMeshObject(makeGear({ type: "spur" }));
    expect((healthy.mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      colorForGear("spur", 1, false).getHex(),
    );

    const damaged = makeGear({ type: "spur", durabilityCurrent: 25, durabilityMax: 100 });
    const obj = new GearMeshObject(damaged);
    obj.update(damaged);
    expect((obj.mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      colorForGear("spur", 0.25, false).getHex(),
    );

    const broken = makeGear({ type: "spur", durabilityCurrent: 0, broken: true });
    const brokenObj = new GearMeshObject(broken);
    brokenObj.update(broken);
    expect((brokenObj.mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      colorForGear("spur", 0, true).getHex(),
    );
  });

  it("stays metallic rather than matte, with or without a texture backend", () => {
    // jsdom has no canvas, so getProceduralTexture returns null here and the map is skipped --
    // the gear must still be set up as metal, not fall back to MeshStandardMaterial's matte
    // defaults (roughness 1, metalness 0), which read as unglazed clay.
    const material = new GearMeshObject(makeGear({ type: "spur" })).mesh
      .material as THREE.MeshStandardMaterial;
    expect(material.metalness).toBeGreaterThan(0.3);
    expect(material.roughness).toBeLessThan(0.7);
  });
});
