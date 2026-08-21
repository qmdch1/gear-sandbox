import { describe, it, expect } from "vitest";
import { tick } from "../../src/sim/simulation";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("tick", () => {
  it("rotates and wears a meshed gear driven by a crank, and reports no diagnostics problems", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const result = tick(gears, 1, 1);
    const b = result.gears.find((g) => g.id === "b")!;
    expect(b.angularVelocity).toBeCloseTo(-2);
    expect(b.rotation).toBeCloseTo(-2);
    expect(b.durabilityCurrent).toBeLessThan(100);
    expect(result.diagnostics.unconnectedIds).toEqual([]);
    expect(result.diagnostics.noPowerIds).toEqual([]);
  });

  it("increases wear rate on gears sharing a component with a load object", () => {
    const withLoad = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
      makeGear({ id: "load", type: "load", teeth: 0, position: [15, 0, 0] }), // coincident with b
    ];
    const withoutLoad = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const rWith = tick(withLoad, 1, 1).gears.find((g) => g.id === "b")!;
    const rWithout = tick(withoutLoad, 1, 1).gears.find((g) => g.id === "b")!;
    expect(rWith.durabilityCurrent).toBeLessThan(rWithout.durabilityCurrent);
  });

  it("populates a connected belt's beltEndRadius fields from its live hosts, for rendering (see gearMesh.ts)", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }), // pitchRadius = 10
      makeGear({ id: "belt", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0] }),
      makeGear({ id: "pulley", teeth: 10, module: 1, position: [30, 0, 0] }), // pitchRadius = 5
    ];
    const belt = tick(gears, 1, 1).gears.find((g) => g.id === "belt")!;
    expect(belt.beltEndRadius1).toBeCloseTo(10);
    expect(belt.beltEndRadius2).toBeCloseTo(5);
  });

  it("leaves an unconnected belt's beltEndRadius fields undefined", () => {
    const gears = [
      makeGear({ id: "belt", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0] }),
    ];
    const belt = tick(gears, 1, 1).gears.find((g) => g.id === "belt")!;
    expect(belt.beltEndRadius1).toBeUndefined();
    expect(belt.beltEndRadius2).toBeUndefined();
  });

  it("does not set beltEndRadius fields on non-belt gears", () => {
    const gears = [makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] })];
    const a = tick(gears, 1, 1).gears.find((g) => g.id === "a")!;
    expect(a.beltEndRadius1).toBeUndefined();
    expect(a.beltEndRadius2).toBeUndefined();
  });

  it("flags an isolated gear as unconnected and does not rotate it", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "lonely", teeth: 20, module: 1, position: [1000, 0, 0] }),
    ];
    const result = tick(gears, 1, 1);
    expect(result.diagnostics.unconnectedIds.sort()).toEqual(["crank", "lonely"]);
    expect(result.gears.find((g) => g.id === "lonely")!.angularVelocity).toBe(0);
  });
});
