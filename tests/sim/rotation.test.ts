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

describe("v2 propagation rules", () => {
  it("transmits chain rotation in the SAME direction (not reversed, unlike a direct gear mesh)", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "sprocket", type: "sprocket", teeth: 10, module: 1, position: [500, 0, 0] }),
    ];
    // manually construct the chain edge the way buildEdges(gears, remoteLinks) would
    const edges = [{ a: "crank", b: "sprocket", kind: "chain" as const, ratio: 2, oneWay: "none" as const }];
    const { angularVelocities } = propagateRotation(gears, edges);
    expect(angularVelocities.get("sprocket")).toBeCloseTo(2); // same sign as the crank, scaled by ratio
  });

  it("converts a driving pinion's angular velocity into a rack's linear velocity", () => {
    const pinion = makeGear({ id: "pinion", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 });
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const gears = [pinion, rack];
    const { angularVelocities, linearVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("rack")).toBe(0); // a rack never has an angular velocity
    expect(linearVelocities.get("rack")).toBeCloseTo(2 * 10); // omega * pinion pitch radius (teeth=20,module=1 -> r=10)
  });

  it("gives a differential's two coupled output shafts the same speed as the input (locked-differential simplification, spec §3.6)", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const inputBevel = makeGear({
      id: "in", type: "crank", teeth: 15, module: 1, position: [22.5, 0, 0], axis: [1, 0, 0], angularVelocity: 4,
    });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputB = makeGear({ id: "outB", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const gears = [diff, inputBevel, outputA, outputB];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    const diffSpeed = angularVelocities.get("diff")!;
    expect(angularVelocities.get("outA")).toBeCloseTo(diffSpeed);
    expect(angularVelocities.get("outB")).toBeCloseTo(diffSpeed);
  });

  it("gives a THIRD coincident gear on a differential the same locked speed too -- the two-output demo layout is a consequence of the general coincident-coupling rule in evaluatePair, not something propagateRotation or buildEdges hardcodes to exactly two", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const inputBevel = makeGear({
      id: "in", type: "crank", teeth: 15, module: 1, position: [22.5, 0, 0], axis: [1, 0, 0], angularVelocity: 4,
    });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputB = makeGear({ id: "outB", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputC = makeGear({ id: "outC", teeth: 12, module: 1, position: [0, 0, 0], axis: [0, 1, 0] }); // the third, undocumented partner
    const gears = [diff, inputBevel, outputA, outputB, outputC];
    const edges = buildEdges(gears);

    // Confirm the edge set itself is sane before checking propagation: exactly the 1 mesh
    // (input) + 3 coincident couplings (outA/outB/outC) from the differential -- and no
    // accidental edges between the three outputs themselves, even though they're all
    // coincident with EACH OTHER too (plain spur gears at zero center-distance satisfy
    // none of evaluatePair's own mesh rules, since those require a nonzero pitch-radius-sum
    // distance).
    const diffEdges = edges.filter((e) => e.a === "diff" || e.b === "diff");
    expect(diffEdges.length).toBe(4);
    expect(edges.some((e) => new Set([e.a, e.b]).size === 2 && [e.a, e.b].every((id) => id.startsWith("out")))).toBe(false);

    const { angularVelocities } = propagateRotation(gears, edges);
    const diffSpeed = angularVelocities.get("diff")!;
    expect(diffSpeed).not.toBe(0); // sanity: the differential is actually being driven
    expect(angularVelocities.get("outA")).toBe(diffSpeed);
    expect(angularVelocities.get("outB")).toBe(diffSpeed);
    expect(angularVelocities.get("outC")).toBe(diffSpeed); // the undocumented third output locks too
  });
});
