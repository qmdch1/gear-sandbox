// tests/sim/graph.test.ts
import { describe, it, expect } from "vitest";
import { buildEdges, classify, connectedComponentIds } from "../../src/sim/graph";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("classify", () => {
  it("flags a lone gear as unconnected", () => {
    const gears = [makeGear({ id: "a", position: [0, 0, 0] })];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.unconnectedIds).toEqual(["a"]);
    expect(diagnostics.noPowerIds).toEqual([]);
  });

  it("flags a meshed pair with no crank as no-power, not unconnected", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds.sort()).toEqual(["a", "b"]);
  });

  it("clears no-power once a crank joins the same mesh chain", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.unconnectedIds).toEqual([]);
  });

  it("also clears no-power for a battery or outlet power source, just like a crank", () => {
    const gears = [
      makeGear({ id: "outlet", type: "outlet", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.noPowerIds).toEqual([]);
  });

  it("reports overlapping gears that are placed too close to mesh validly", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [5, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.overlapPairs).toEqual([["a", "b"]]);
  });
});

describe("connectedComponentIds", () => {
  it("includes only the gear itself when nothing is meshed to it", () => {
    const gears = [makeGear({ id: "a", position: [0, 0, 0] })];
    expect(connectedComponentIds("a", gears, buildEdges(gears))).toEqual(new Set(["a"]));
  });

  it("includes every gear in a meshed chain, transitively", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 20, module: 1, position: [20, 0, 0] }),
      makeGear({ id: "c", teeth: 20, module: 1, position: [40, 0, 0] }),
    ];
    const component = connectedComponentIds("a", gears, buildEdges(gears));
    expect(component).toEqual(new Set(["a", "b", "c"]));
  });

  it("does not pull in a gear from a separate, unconnected chain", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 20, module: 1, position: [20, 0, 0] }),
      makeGear({ id: "far", teeth: 20, module: 1, position: [1000, 0, 0] }),
    ];
    expect(connectedComponentIds("a", gears, buildEdges(gears))).toEqual(new Set(["a", "b"]));
  });
});
