// tests/sim/powerPaths.test.ts
import { describe, it, expect } from "vitest";
import { computePowerPaths } from "../../src/sim/powerPaths";
import { buildEdges } from "../../src/sim/graph";
import { propagateRotation } from "../../src/sim/rotation";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

/** Runs propagateRotation and returns the gears with angularVelocity actually
 *  filled in -- computePowerPaths reads that field directly, so every test
 *  below exercises the real tick-time value, not a hand-set stand-in. */
function withRotation(gears: GearInstance[]): GearInstance[] {
  const edges = buildEdges(gears);
  const { angularVelocities } = propagateRotation(gears, edges);
  return gears.map((g) => ({ ...g, angularVelocity: angularVelocities.get(g.id) ?? g.angularVelocity }));
}

describe("computePowerPaths", () => {
  it("reports a wheel's speed ratio relative to its crank", () => {
    const gears = withRotation([
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }), // meshed, ratio 2 (opposite sign)
      makeGear({ id: "wheel", type: "wheel", position: [15, 0, 0] }), // coupled onto b's shaft
    ]);
    const edges = buildEdges(gears);
    const entries = computePowerPaths(gears, edges);
    const wheelEntry = entries.find((e) => e.outputId === "wheel");
    expect(wheelEntry).toBeDefined();
    expect(wheelEntry!.sourceId).toBe("crank");
    expect(wheelEntry!.ratio).toBeCloseTo(2); // |(-4)| / |2|
  });

  it("gives two independent builds in the same scene their own, separate entries", () => {
    const gears = withRotation([
      makeGear({ id: "crankA", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "wheelA", type: "wheel", position: [0, 0, 0] }),
      makeGear({ id: "crankB", type: "crank", teeth: 10, module: 1, position: [500, 0, 0], angularVelocity: 3 }),
      makeGear({ id: "wheelB", type: "wheel", position: [500, 0, 0] }),
    ]);
    const edges = buildEdges(gears);
    const entries = computePowerPaths(gears, edges);
    expect(entries.find((e) => e.sourceId === "crankA" && e.outputId === "wheelA")).toBeDefined();
    expect(entries.find((e) => e.sourceId === "crankB" && e.outputId === "wheelB")).toBeDefined();
    // Never cross-attributed to the other build's crank.
    expect(entries.find((e) => e.sourceId === "crankA" && e.outputId === "wheelB")).toBeUndefined();
  });

  it("excludes load -- a burden marker, not a speed the user is comparing", () => {
    const gears = withRotation([
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "load", type: "load", position: [0, 0, 0] }),
    ]);
    const edges = buildEdges(gears);
    const entries = computePowerPaths(gears, edges);
    expect(entries.some((e) => e.outputType === "load")).toBe(false);
  });

  it("omits an output only structurally (not rotationally) reachable from the crank", () => {
    const gears = withRotation([
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "beam", type: "beam", teeth: 0, position: [0, 0, 0], position2: [12, 0, 0] }),
      makeGear({ id: "wheel", type: "wheel", position: [12, 0, 0] }), // coupled onto the beam's far end -- but a beam carries no rotation
    ]);
    const edges = buildEdges(gears);
    const entries = computePowerPaths(gears, edges);
    // A structural-only bridge must not credit this crank with an output it
    // has no real rotational path to -- e.g. a tank's turret sharing a
    // welded hull with the main drivetrain shouldn't misattribute the
    // drivetrain's speed to the turret's own (unrelated) motor.
    expect(entries.find((e) => e.outputId === "wheel")).toBeUndefined();
  });

  it("does not credit one crank's output to another crank that's only structurally (not rotationally) bridged to it", () => {
    // Mirrors a tank whose turret (its own slow traverse crank) and main
    // drivetrain (its own fast crank) both happen to be welded to the same
    // hull -- a purely structural bridge, no shared rotation at all.
    const gears = withRotation([
      makeGear({ id: "turretCrank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 0.4 }),
      makeGear({ id: "beamToHull", type: "beam", teeth: 0, position: [0, 0, 0], position2: [50, 0, 0] }),
      makeGear({ id: "driveCrank", type: "crank", teeth: 20, module: 1, position: [50, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "gauge", type: "gauge", position: [50, 0, 0] }), // directly coupled to driveCrank only
    ]);
    const edges = buildEdges(gears);
    const entries = computePowerPaths(gears, edges);
    expect(entries.find((e) => e.sourceId === "driveCrank" && e.outputId === "gauge")?.ratio).toBeCloseTo(1);
    // The turret's own (much slower) crank must not also claim this gauge.
    expect(entries.find((e) => e.sourceId === "turretCrank" && e.outputId === "gauge")).toBeUndefined();
  });

  it("returns a null ratio when the source itself has stopped (e.g. broken)", () => {
    const gears = withRotation([
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, broken: true }),
      makeGear({ id: "wheel", type: "wheel", position: [0, 0, 0] }),
    ]);
    // Force the source's OWN recorded speed to 0, mirroring a stopped crank.
    const stoppedGears = gears.map((g) => (g.id === "crank" ? { ...g, angularVelocity: 0 } : g));
    const edges = buildEdges(stoppedGears);
    const entries = computePowerPaths(stoppedGears, edges);
    const wheelEntry = entries.find((e) => e.outputId === "wheel");
    expect(wheelEntry!.ratio).toBeNull();
  });
});
