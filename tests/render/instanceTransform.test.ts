// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { computeInstanceMatrix } from "../../src/render/instanceTransform";
import { GearMeshObject } from "../../src/render/gearMesh";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

/** computeInstanceMatrix is a deliberately independent reimplementation of
 *  GearMeshObject's own per-mesh transform (see instanceTransform.ts's doc
 *  comment for why) -- this suite verifies the two actually agree, by building
 *  a real GearMeshObject for the same gear and comparing its resulting
 *  position/quaternion/scale against what computeInstanceMatrix decomposes to. */
function expectMatchesGearMeshObject(gear: GearInstance): void {
  const obj = new GearMeshObject(gear);
  const matrix = computeInstanceMatrix(gear);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);

  expect(position.x).toBeCloseTo(obj.mesh.position.x, 5);
  expect(position.y).toBeCloseTo(obj.mesh.position.y, 5);
  expect(position.z).toBeCloseTo(obj.mesh.position.z, 5);
  expect(quaternion.x).toBeCloseTo(obj.mesh.quaternion.x, 5);
  expect(quaternion.y).toBeCloseTo(obj.mesh.quaternion.y, 5);
  expect(quaternion.z).toBeCloseTo(obj.mesh.quaternion.z, 5);
  expect(quaternion.w).toBeCloseTo(obj.mesh.quaternion.w, 5);
  expect(scale.x).toBeCloseTo(obj.mesh.scale.x, 5);
  expect(scale.y).toBeCloseTo(obj.mesh.scale.y, 5);
  expect(scale.z).toBeCloseTo(obj.mesh.scale.z, 5);
}

describe("computeInstanceMatrix", () => {
  it("matches GearMeshObject for a plain, position-only gear (default axis)", () => {
    expectMatchesGearMeshObject(makeGear({ position: [3, 0, 7], axis: [0, 1, 0], rotation: 0.4 }));
  });

  it("matches GearMeshObject for a gear on the toggled (world +X) axis", () => {
    expectMatchesGearMeshObject(makeGear({ type: "bevel", axis: [1, 0, 0], position: [1, 2, 3], rotation: 1.1 }));
  });

  it("matches GearMeshObject for a rod (shaft) spanning two endpoints", () => {
    expectMatchesGearMeshObject(
      makeGear({ type: "shaft", teeth: 0, position: [0, 0, 0], position2: [12, 5, -8], rotation: 0.9 }),
    );
  });

  it("matches GearMeshObject for a rod with a degenerate (near-zero-length) span", () => {
    expectMatchesGearMeshObject(
      makeGear({ type: "beam", teeth: 0, position: [4, 0, 4], position2: [4, 0, 4 + 1e-9] }),
    );
  });

  it("scales a rod's Z axis to exactly its endpoint-to-endpoint distance", () => {
    const gear = makeGear({ type: "shaft", teeth: 0, position: [0, 0, 0], position2: [30, 40, 0] }); // 3-4-5 triangle * 10
    const matrix = computeInstanceMatrix(gear);
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.z).toBeCloseTo(50);
  });

  it("positions a rod at the exact midpoint of its two endpoints", () => {
    const gear = makeGear({ type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 10, -6] });
    const matrix = computeInstanceMatrix(gear);
    const position = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.toArray()).toEqual([10, 5, -3]);
  });
});
