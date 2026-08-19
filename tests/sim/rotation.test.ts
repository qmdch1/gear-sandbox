// tests/sim/rotation.test.ts
import { describe, it, expect } from "vitest";
import { propagateRotation } from "../../src/sim/rotation";
import { buildEdges } from "../../src/sim/graph";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("propagateRotation", () => {
  it("spins a meshed gear opposite the crank, scaled by tooth ratio", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBeCloseTo(-2); // -(20/10) * 1
  });

  it("leaves a gear with no path to a crank at zero angular velocity", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBe(0);
  });

  it("only lets a worm drive its wheel, never the reverse", () => {
    const worm = makeGear({
      id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1,
      position: [0, 0, 0],
    });
    const wheel = makeGear({
      id: "wheel", type: "crank", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [11, 0, 0], angularVelocity: 5,
    });
    const gears = [worm, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    // "wheel" is the crank here (power source) but the edge is one-way toward
    // the worm's *other* side only when the worm itself is the "a" driver —
    // since the crank is the wheel, the wheel must NOT be able to drive the worm.
    expect(angularVelocities.get("worm")).toBe(0);
  });

  it("lets a crank drive a worm via direct shaft coupling, which then drives its wheel one-way", () => {
    const crank = makeGear({
      id: "crank", type: "crank", axis: [0, 1, 0], teeth: 20, module: 1,
      position: [0, 0, 0], angularVelocity: 3,
    });
    const worm = makeGear({
      id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1,
      position: [0, 0, 0], // coincident with the crank -> shaft coupling, not a tooth mesh
    });
    const wheel = makeGear({
      id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [11, 0, 0], // perpendicular to the worm's axis -> one-way mesh
    });
    const gears = [crank, worm, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("worm")).toBeCloseTo(3);      // rigid coupling: same speed as the crank
    expect(angularVelocities.get("wheel")).toBeCloseTo(-0.3);  // -(2/20) * 3, one-way from the worm
  });

  it("treats battery and outlet as power sources, exactly like a crank", () => {
    const gears = [
      makeGear({ id: "battery", type: "battery", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBeCloseTo(-4); // -(20/10) * 2
  });

  it("stops propagation at a broken gear", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "mid", teeth: 20, module: 1, position: [20, 0, 0], broken: true }),
      makeGear({ id: "end", teeth: 20, module: 1, position: [40, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("mid")).toBe(0);
    expect(angularVelocities.get("end")).toBe(0);
  });
});
