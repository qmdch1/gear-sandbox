// tests/sim/graph.test.ts
import { describe, it, expect } from "vitest";
import { buildEdges, classify } from "../../src/sim/graph";
import type { GearInstance, RemoteLink } from "../../src/sim/types";

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

  it("reports overlapping gears that are placed too close to mesh validly", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [5, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.overlapPairs).toEqual([["a", "b"]]);
  });
});

describe("buildEdges with remote links", () => {
  it("adds a chain edge between two far-apart sprockets that would never mesh geometrically", () => {
    const gears = [
      makeGear({ id: "a", type: "sprocket", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", type: "sprocket", teeth: 10, module: 1, position: [500, 0, 0] }), // far outside mesh distance
    ];
    const links: RemoteLink[] = [{ a: "a", b: "b", kind: "chain" }];
    const edges = buildEdges(gears, links);
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("chain");
    expect(edges[0].ratio).toBeCloseTo(2); // 20/10
  });

  it("ignores a remote link that references a since-deleted gear instead of throwing", () => {
    const gears = [makeGear({ id: "a", type: "sprocket", teeth: 20, module: 1, position: [0, 0, 0] })];
    const links: RemoteLink[] = [{ a: "a", b: "gone", kind: "chain" }];
    expect(() => buildEdges(gears, links)).not.toThrow();
    expect(buildEdges(gears, links)).toHaveLength(0);
  });

  it("computes a belt edge's ratio from pitch radius, not tooth count", () => {
    const gears = [
      makeGear({ id: "a", type: "pulley", teeth: 30, module: 1, position: [0, 0, 0] }), // pitchRadius 15
      makeGear({ id: "b", type: "pulley", teeth: 10, module: 1, position: [500, 0, 0] }), // pitchRadius 5
    ];
    const links: RemoteLink[] = [{ a: "a", b: "b", kind: "belt" }];
    const edges = buildEdges(gears, links);
    expect(edges[0].ratio).toBeCloseTo(3); // 15/5
  });
});
