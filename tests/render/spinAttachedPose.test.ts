import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { spinAttachedPose } from "../../src/render/sceneSync";

describe("spinAttachedPose", () => {
  const outPos = new THREE.Vector3();
  const outQuat = new THREE.Quaternion();

  it("leaves a prop at its rest pose when the gear rotation is 0", () => {
    const base = new THREE.Vector3(11, 26, 4);
    const baseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.3));
    const center = new THREE.Vector3(0, 26, 4);
    const axis = new THREE.Vector3(0, 0, 1);
    spinAttachedPose(base, baseQ, center, axis, 0, outPos, outQuat);
    expect(outPos.distanceTo(base)).toBeCloseTo(0, 9);
    // angleTo is numerically sensitive near identity; ~1e-8 rad is exact-to-float, i.e. no
    // perceptible rotation at all.
    expect(outQuat.angleTo(baseQ)).toBeLessThan(1e-6);
  });

  it("orbits the prop around the gear centre by the gear's rotation (a sail out along +X swings to +Y after a quarter turn about Z)", () => {
    // Sail spar tip at (10,0,0) relative to a hub at the origin, hub axis +Z. A +90° turn
    // about Z takes +X -> +Y, so the tip should land at roughly (0,10,0).
    const base = new THREE.Vector3(10, 0, 0);
    const baseQ = new THREE.Quaternion(); // identity
    const center = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 0, 1);
    spinAttachedPose(base, baseQ, center, axis, Math.PI / 2, outPos, outQuat);
    expect(outPos.x).toBeCloseTo(0, 6);
    expect(outPos.y).toBeCloseTo(10, 6);
    expect(outPos.z).toBeCloseTo(0, 6);
  });

  it("keeps the orbit radius (distance to the gear centre) constant as it spins", () => {
    const base = new THREE.Vector3(70 + 8, 26, 4); // showroom-translated windmill sail tip
    const center = new THREE.Vector3(70, 26, 4); // translated hub centre
    const axis = new THREE.Vector3(0, 0, 1);
    const restRadius = base.distanceTo(center);
    for (const angle of [0.5, 1.7, 3.14, 5.0]) {
      spinAttachedPose(base, new THREE.Quaternion(), center, axis, angle, outPos, outQuat);
      expect(outPos.distanceTo(center)).toBeCloseTo(restRadius, 6);
    }
  });

  it("normalizes a non-unit axis (raw gear.axis like [0,2,0]) rather than distorting the rotation", () => {
    const base = new THREE.Vector3(10, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const rawAxis = new THREE.Vector3(0, 0, 2); // deliberately not unit length
    spinAttachedPose(base, new THREE.Quaternion(), center, rawAxis, Math.PI / 2, outPos, outQuat);
    expect(outPos.x).toBeCloseTo(0, 6);
    expect(outPos.y).toBeCloseTo(10, 6);
  });
});
