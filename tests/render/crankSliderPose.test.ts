import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { crankSliderPose } from "../../src/render/sceneSync";

/** A crank-slider whose crank lies in the XZ plane (axis +Y) and whose slider runs along +X --
 *  the layout a piston engine or a locomotive driving rod uses in this project. */
function solve(angle: number, crankRadius = 4, rodLength = 14) {
  const out = {
    pin: new THREE.Vector3(),
    slider: new THREE.Vector3(),
    rodMid: new THREE.Vector3(),
    rodQuat: new THREE.Quaternion(),
  };
  crankSliderPose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 1, 0),
    angle,
    crankRadius,
    rodLength,
    new THREE.Vector3(1, 0, 0),
    out,
  );
  return out;
}

describe("crankSliderPose", () => {
  it("keeps the pin on the crank circle and the rod exactly rodLength long at every angle", () => {
    const centre = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 72; i++) {
      const { pin, slider } = solve((i / 72) * Math.PI * 2);
      expect(pin.distanceTo(centre)).toBeCloseTo(4, 9); // rigid crank throw
      expect(pin.distanceTo(slider)).toBeCloseTo(14, 9); // rigid connecting rod
      expect(slider.y).toBeCloseTo(0, 9); // slider never leaves its axis
      expect(slider.z).toBeCloseTo(0, 9);
    }
  });

  it("reciprocates the slider between exactly (rod + crank) and (rod - crank) -- top and bottom dead centre", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 720; i++) {
      const { slider } = solve((i / 720) * Math.PI * 2);
      min = Math.min(min, slider.x);
      max = Math.max(max, slider.x);
    }
    expect(max).toBeCloseTo(18, 6); // 14 + 4, pin at the near dead centre
    expect(min).toBeCloseTo(10, 6); // 14 - 4, pin at the far dead centre
    expect(max - min).toBeCloseTo(8, 6); // stroke is exactly twice the crank radius
  });

  it("points the rod's local +Y from the pin toward the slider", () => {
    for (const angle of [0.3, 1.1, 2.4, 4.7]) {
      const { pin, slider, rodMid, rodQuat } = solve(angle);
      expect(rodMid.distanceTo(pin.clone().add(slider).multiplyScalar(0.5))).toBeCloseTo(0, 9);
      const mapped = new THREE.Vector3(0, 1, 0).applyQuaternion(rodQuat);
      const expected = slider.clone().sub(pin).normalize();
      expect(mapped.angleTo(expected)).toBeLessThan(1e-6);
    }
  });

  it("degenerates gracefully (never NaN) when the rod is too short to close the linkage", () => {
    const { pin, slider } = solve(Math.PI / 2, 10, 3); // rod shorter than the crank throw
    for (const v of [pin, slider]) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
  });
});
