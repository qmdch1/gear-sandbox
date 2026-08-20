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

  it("spins a bevel gear meshed with a crank in the SAME sense, not flipped", () => {
    // Unlike a parallel-axis mesh (spur/helical/crank), a bevel gear only ever
    // meshes on a perpendicular axis -- there's no "opposite direction about a
    // shared axis" relationship to preserve there, so it shouldn't get the -1 flip.
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "bevel", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [20, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("bevel")).toBeCloseTo(1); // same sign, (20/20) * 1
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

  it("still drives a worm from a coincident crank at their DEFAULT (mismatched) axes", () => {
    // Regression: gearFactory.ts's defaultAxisForType gives a crank +Y and a worm
    // +X -- if a worm ever required the powering gear's axis to match its own, a
    // freshly-placed crank could never actually power a freshly-placed worm at all.
    const crank = makeGear({
      id: "crank", type: "crank", axis: [0, 1, 0], teeth: 20, module: 1,
      position: [0, 0, 0], angularVelocity: 3,
    });
    const worm = makeGear({
      id: "worm", type: "worm", axis: [1, 0, 0], teeth: 1, module: 1,
      position: [0, 0, 0],
    });
    const gears = [crank, worm];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("worm")).toBeCloseTo(3);
  });

  it("bridges two gears' rotation through a shaft connecting them at a distance", () => {
    const crank = makeGear({
      id: "crank", type: "crank", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [0, 0, 0], angularVelocity: 2,
    });
    const shaft = makeGear({
      id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
    });
    const wheel = makeGear({
      id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1, position: [30, 0, 0],
    });
    const gears = [crank, shaft, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    // Both ends of the rigid rod (ratio 1, same direction) end up at the crank's speed.
    expect(angularVelocities.get("shaft")).toBeCloseTo(2);
    expect(angularVelocities.get("wheel")).toBeCloseTo(2);
  });

  it("drives propagation via the generalized POWER_SOURCE_TYPES check, not a literal 'crank' comparison", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBeCloseTo(-4); // -(20/10) * 2
  });

  it("does NOT propagate rotation across a structural beam joint, unlike a shaft", () => {
    // A beam is a purely rigid, non-rotating structural joint (see meshing.ts's
    // "structural" edge kind / beamJoinsAt) -- it should group with its neighbor
    // for dragging (graph.ts, untouched here) but never relay rotation, unlike a
    // shaft (tested above), which explicitly does.
    const crank = makeGear({
      id: "crank", type: "crank", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [0, 0, 0], angularVelocity: 2,
    });
    const beam = makeGear({
      id: "beam", type: "beam", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
    });
    const wheel = makeGear({
      id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1, position: [30, 0, 0],
    });
    const gears = [crank, beam, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("beam")).toBe(0);
    expect(angularVelocities.get("wheel")).toBe(0);
  });

  it("drives a pulley the SAME direction as the crank via a belt, scaled by relative pitch radius (not tooth ratio flipped)", () => {
    // Unlike a tooth mesh (opposite direction), a belt/chain keeps both pulleys
    // spinning the SAME way -- and unlike a shaft (rigid 1:1), the speed scales
    // by the relative pitch radii, exactly like a real bicycle chain.
    const crank = makeGear({
      id: "crank", type: "crank", axis: [1, 0, 0], teeth: 20, module: 1, // pitchRadius = 10
      position: [0, 0, 0], angularVelocity: 2,
    });
    const belt = makeGear({
      id: "belt", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
    });
    const pulley = makeGear({
      id: "pulley", type: "spur", axis: [1, 0, 0], teeth: 10, module: 1, // pitchRadius = 5
      position: [30, 0, 0],
    });
    const gears = [crank, belt, pulley];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    // linear belt speed = crank's angularVelocity * crank's pitchRadius = 2*10 = 20
    // pulley's angularVelocity = linear speed / pulley's pitchRadius = 20/5 = 4
    expect(angularVelocities.get("pulley")).toBeCloseTo(4); // same SIGN as the crank (2), not flipped
    expect(Math.sign(angularVelocities.get("pulley")!)).toBe(Math.sign(crank.angularVelocity));
  });

  it("drives the belt-pulley pair correctly when the host, not the belt, is the earlier array element", () => {
    // Regression for the ratio's direction-dependent sign (see meshing.ts's belt
    // branch, `ratio = a.type === "belt" ? 1/pitchRadius(host) : pitchRadius(host)`)
    // -- the test above's array order ([crank, belt, pulley]) happens to put the
    // belt BEFORE the pulley for that pair's evaluatePair(belt, pulley) call; this
    // one puts both hosts before the belt instead, so both belt edges exercise the
    // opposite ("host is a") branch, confirming the physics comes out the same
    // either way `buildEdges`' i<j loop happens to encounter the pair.
    const pulley = makeGear({
      id: "pulley", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1, // pitchRadius = 10
      position: [30, 0, 0],
    });
    const crank = makeGear({
      id: "crank", type: "crank", axis: [1, 0, 0], teeth: 10, module: 1, // pitchRadius = 5
      position: [0, 0, 0], angularVelocity: 3,
    });
    const belt = makeGear({
      id: "belt", type: "belt", teeth: 0, position: [0, 0, 0], position2: [30, 0, 0],
    });
    const gears = [pulley, crank, belt];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    // linear speed = 3*5 = 15; pulley's angularVelocity = 15/10 = 1.5
    expect(angularVelocities.get("pulley")).toBeCloseTo(1.5);
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
