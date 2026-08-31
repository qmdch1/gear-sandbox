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

describe("two cranks coupled into one connected component (user-mistake scenario)", () => {
  // A user can accidentally (or deliberately) mesh two cranks together, or otherwise
  // couple them into the same connected component, each carrying its own commanded
  // angularVelocity. propagateRotation has no concept of "conflict" -- it just BFS's
  // outward from every unvisited crank in `gears` array order. The FIRST crank (by
  // array position) in a component is still unvisited when its turn comes, so it always
  // wins the outer loop and gets to walk the whole component, including any OTHER
  // crank(s) inside it. Once that walk reaches a second crank as an ordinary neighbor,
  // it is treated exactly like any other driven gear: `angularVelocities.set(otherId, ...)`
  // overwrites its map entry (silently discarding its own commanded speed), and it is
  // marked visited -- so when the outer loop later reaches it, `visited.has(crank.id)`
  // is already true and it is skipped entirely, never getting its own BFS turn.
  //
  // Net effect: deterministic, not undefined/random, and not a crash -- but silent.
  // Whichever crank happens to sit earlier in the gears array becomes the sole "real"
  // driver for the whole component; every other crank downstream of it has its own
  // angularVelocity field quietly ignored and instead driven by the winner, with no
  // diagnostic raised anywhere. Confirmed here in both array orders to show the
  // determinism is real (a simple order swap flips which crank wins), not coincidence.
  it("lets the FIRST crank in array order win as sole driver; the second crank's own commanded speed is silently overwritten", () => {
    const crank1 = makeGear({ id: "crank1", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 });
    const crank2 = makeGear({ id: "crank2", type: "crank", teeth: 10, module: 1, position: [15, 0, 0], angularVelocity: 5 });
    const gears = [crank1, crank2]; // crank1 listed first
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("crank1")).toBe(2);           // untouched: its own commanded speed
    expect(angularVelocities.get("crank2")).toBeCloseTo(-4);   // overwritten: -(20/10) * 2, its own "5" is discarded
  });

  it("flips which crank wins when the array order is reversed -- proving the rule is array order, not id or anything else", () => {
    const crank1 = makeGear({ id: "crank1", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 });
    const crank2 = makeGear({ id: "crank2", type: "crank", teeth: 10, module: 1, position: [15, 0, 0], angularVelocity: 5 });
    const gears = [crank2, crank1]; // crank2 listed first this time
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("crank2")).toBe(5);            // untouched: its own commanded speed
    expect(angularVelocities.get("crank1")).toBeCloseTo(-2.5);  // overwritten: -(10/20) * 5, its own "2" is discarded
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

  it("drives THREE simultaneous, independent branches straight off one crank -- two direct mesh partners plus one coincident (shaft-coupled) partner -- with no cross-talk between them", () => {
    // crank(20t, av=3) at origin, meshed with spurA(10t) along +X, meshed with spurB(8t)
    // along +Z (far enough from spurA that the two never mesh with each other), and
    // shaft-coupled (coincident, same axis) to a load. All three read `curSpeed` off the
    // SAME crank map entry inside propagateRotation's BFS -- this pins down that reading
    // it three times for three different neighbors produces three independently-correct
    // results, not some shared/mutated intermediate.
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 3 });
    const spurA = makeGear({ id: "spurA", teeth: 10, module: 1, position: [15, 0, 0] }); // mesh dist = 10+5
    const spurB = makeGear({ id: "spurB", teeth: 8, module: 1, position: [0, 0, 14] });  // mesh dist = 10+4
    const load = makeGear({ id: "load", type: "load", teeth: 20, module: 1, position: [0, 0, 0] }); // coincident coupling

    const gears = [crank, spurA, spurB, load];
    const edges = buildEdges(gears);

    // Sanity on the edge set itself: exactly the 3 branches off the crank, and no
    // accidental edge between spurA and spurB (they're ~20.5 apart, far past mesh range).
    const crankEdges = edges.filter((e) => e.a === "crank" || e.b === "crank");
    expect(crankEdges.length).toBe(3);
    expect(edges.some((e) => new Set([e.a, e.b]).size === 2 && [e.a, e.b].every((id) => id.startsWith("spur")))).toBe(false);

    const { angularVelocities } = propagateRotation(gears, edges);
    expect(angularVelocities.get("crank")).toBe(3);            // the crank's own input, untouched
    expect(angularVelocities.get("spurA")).toBeCloseTo(-6);     // -(20/10) * 3
    expect(angularVelocities.get("spurB")).toBeCloseTo(-7.5);   // -(20/8) * 3
    expect(angularVelocities.get("load")).toBeCloseTo(3);       // rigid coupling: same speed as the crank
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
