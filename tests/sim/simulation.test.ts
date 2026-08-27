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
    // Pass in previousEdgeKeys that already includes the crank-b edge, so phase offset isn't applied on this tick
    const result = tick(gears, 1, 1, new Set(["b:crank"]));
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
    const rWith = tick(withLoad, 1, 1, new Set(["b:crank"])).gears.find((g) => g.id === "b")!;
    const rWithout = tick(withoutLoad, 1, 1, new Set(["b:crank"])).gears.find((g) => g.id === "b")!;
    expect(rWith.durabilityCurrent).toBeLessThan(rWithout.durabilityCurrent);
  });

  it("flags an isolated gear as unconnected and does not rotate it", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "lonely", teeth: 20, module: 1, position: [1000, 0, 0] }),
    ];
    const result = tick(gears, 1, 1, new Set());
    expect(result.diagnostics.unconnectedIds.sort()).toEqual(["crank", "lonely"]);
    expect(result.gears.find((g) => g.id === "lonely")!.angularVelocity).toBe(0);
  });

  it("does not re-apply the phase offset to an already-tracked edge, even if its rotation has since drifted out of alignment", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.7 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0 }),
    ];
    const first = tick(gears, 0, 1, new Set());
    const bAfterFirst = first.gears.find((g) => g.id === "b")!;

    // Simulate "b" having drifted out of phase alignment since the edge was first tracked
    // (e.g. a stale localStorage load) -- perturb its rotation away from the aligned value.
    const perturbedGears = first.gears.map((g) => (g.id === "b" ? { ...g, rotation: g.rotation + 1.0 } : g));

    const knownEdgeTick = tick(perturbedGears, 0, 1, first.edgeKeys); // edge already known -> gate should skip re-alignment
    const bKnown = knownEdgeTick.gears.find((g) => g.id === "b")!;
    expect(bKnown.rotation).toBeCloseTo(bAfterFirst.rotation + 1.0); // untouched -- the perturbation survives

    const newEdgeTick = tick(perturbedGears, 0, 1, new Set()); // edge treated as new -> gate should re-align
    const bNew = newEdgeTick.gears.find((g) => g.id === "b")!;
    expect(bNew.rotation).not.toBeCloseTo(bAfterFirst.rotation + 1.0); // corrected -- proves the offset actually applies when ungated
  });
});
