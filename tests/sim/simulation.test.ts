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

/** Distance from `x` to the nearest whole multiple of `period`. */
function offLattice(x: number, period: number): number {
  const m = ((x % period) + period) % period;
  return Math.min(m, period - m);
}

describe("tick", () => {
  it("rotates and wears a meshed gear driven by a crank, and reports no diagnostics problems", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    // Settle the mesh phase first (dt = 0 applies the phase offset without advancing
    // time), so this measures the rotation step alone. Once settled the offset is
    // exactly 0 on every later tick, so the pair turns purely at its angular velocity.
    const settled = tick({ gears, remoteLinks: [] }, 0, 1).gears;
    const before = settled.find((g) => g.id === "b")!;
    const result = tick({ gears: settled, remoteLinks: [] }, 1, 1);
    const b = result.gears.find((g) => g.id === "b")!;
    expect(b.angularVelocity).toBeCloseTo(-2);
    expect(b.rotation - before.rotation).toBeCloseTo(-2);
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
    const rWith = tick({ gears: withLoad, remoteLinks: [] }, 1, 1).gears.find((g) => g.id === "b")!;
    const rWithout = tick({ gears: withoutLoad, remoteLinks: [] }, 1, 1).gears.find((g) => g.id === "b")!;
    expect(rWith.durabilityCurrent).toBeLessThan(rWithout.durabilityCurrent);
  });

  it("flags an isolated gear as unconnected and does not rotate it", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "lonely", teeth: 20, module: 1, position: [1000, 0, 0] }),
    ];
    const result = tick({ gears, remoteLinks: [] }, 1, 1);
    expect(result.diagnostics.unconnectedIds.sort()).toEqual(["crank", "lonely"]);
    expect(result.gears.find((g) => g.id === "lonely")!.angularVelocity).toBe(0);
  });

  it("phase-aligns a newly meshed pair on the very first tick they mesh", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.7 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0 }),
    ];
    // dt = 0 isolates the phase-offset jump from the rotation-integration step.
    const first = tick({ gears, remoteLinks: [] }, 0, 1);
    const b = first.gears.find((g) => g.id === "b")!;
    expect(b.rotation).not.toBe(0); // the offset moved it even with zero elapsed time
  });

  it("leaves an already-aligned pair exactly where it is -- re-deriving the offset is a no-op", () => {
    // This is what makes it safe to drop the "new edges only" gate: recomputing the
    // offset on a settled pair must contribute nothing, or every tick would nudge it.
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.7 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0 }),
    ];
    const settled = tick({ gears, remoteLinks: [] }, 0, 1).gears;
    const bSettled = settled.find((g) => g.id === "b")!;
    const again = tick({ gears: settled, remoteLinks: [] }, 0, 1);
    expect(again.gears.find((g) => g.id === "b")!.rotation).toBe(bSettled.rotation);
  });

  it("keeps a spinning pair aligned across many ticks instead of accumulating phase error", () => {
    // Regression guard on the interaction between the phase offset and the rotation
    // integration: over 600 ticks of real motion, b's rotation must be exactly what
    // pure integration would give -- the per-tick offset must stay 0 throughout.
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.4 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: -1.1 }),
    ];
    const dt = 1 / 60;
    let state = tick({ gears, remoteLinks: [] }, 0, 1).gears; // settle the phase
    const start = state.find((g) => g.id === "b")!.rotation;
    for (let i = 0; i < 600; i++) {
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
    }
    const b = state.find((g) => g.id === "b")!;
    expect(b.angularVelocity).toBeCloseTo(-2);
    expect(b.rotation - start).toBeCloseTo(-2 * 600 * dt, 9); // exactly omega * elapsed
  });

  it("re-aligns a meshed pair after one gear is perturbed, instead of leaving it stuck out of phase", () => {
    // The fix for I1. The old code applied the offset only on the tick an edge first
    // appeared, so dragging an already-meshed gear -- which changes the contact geometry
    // every frame without changing the edge set -- could never be corrected.
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.7 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0 }),
    ];
    const aligned = tick({ gears, remoteLinks: [] }, 0, 1).gears;
    const alignedB = aligned.find((g) => g.id === "b")!;

    // Knock b a bit over 1.5 tooth-periods out of phase, as a drag would.
    const perturbed = aligned.map((g) => (g.id === "b" ? { ...g, rotation: g.rotation + 1.0 } : g));
    const corrected = tick({ gears: perturbed, remoteLinks: [] }, 0, 1);
    const correctedB = corrected.gears.find((g) => g.id === "b")!;

    const periodB = (Math.PI * 2) / 10;
    expect(correctedB.rotation).not.toBeCloseTo(alignedB.rotation + 1.0); // perturbation did NOT survive
    // and it landed back on an equivalent tooth phase (a whole number of tooth periods
    // away from the aligned rotation), not just somewhere different
    expect(offLattice(correctedB.rotation - alignedB.rotation, periodB)).toBeLessThan(1e-9);
  });

  it("keeps the pinion turning whichever array order the rack was placed in", () => {
    // Regression guard. `buildEdges` picks an edge's `a`/`b` purely by array index, and
    // that index is just the order the user clicked the gears into the palette. A rack's
    // angularVelocity is always 0 (it moves linearly), so with the rack at `a` the
    // per-tick phase offset was being derived against a stationary reference: instead of
    // being the no-op it is for a genuinely co-rotating pair, it snapped the pinion back
    // onto a fixed tooth lattice every tick and the pinion visually froze.
    const dt = 1 / 60;
    const steps = 600; // 10 simulated seconds

    function runRackPinion(rackFirst: boolean) {
      const pinion = makeGear({ id: "pinion", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 });
      const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
      let state = rackFirst ? [rack, pinion] : [pinion, rack];
      const start = state.find((g) => g.id === "pinion")!.rotation;
      for (let i = 0; i < steps; i++) state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      const after = state.find((g) => g.id === "pinion")!;
      return { rotationDelta: after.rotation - start, linearPosition: state.find((g) => g.id === "rack")!.linearPosition! };
    }

    const pinionFirst = runRackPinion(false);
    const rackFirst = runRackPinion(true);
    // omega(1) * elapsed(10) -- pure integration, no phase snapping in either direction.
    expect(pinionFirst.rotationDelta).toBeCloseTo(10, 9);
    expect(rackFirst.rotationDelta).toBeCloseTo(10, 9);
    // and the rack still travels the same distance either way: omega * pitchRadius * elapsed
    expect(pinionFirst.linearPosition).toBeCloseTo(100, 9);
    expect(rackFirst.linearPosition).toBeCloseTo(-100, 9); // opposite edge direction => opposite sign
  });

  it("does not disturb a still-spinning gear meshed with a broken one, in either array order", () => {
    // A broken gear absorbs rotation (`propagateRotation` refuses to relay through it) and
    // its own rotation is frozen, so the pair is never co-rotating -- deriving a phase
    // offset across that edge is the same non-conjugate-reference bug as the rack case.
    const dt = 1 / 60;
    const steps = 120;

    function runBrokenPair(brokenFirst: boolean) {
      const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.3 });
      const dead = makeGear({ id: "dead", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0.9, broken: true, durabilityCurrent: 0 });
      let state = brokenFirst ? [dead, crank] : [crank, dead];
      const start = state.find((g) => g.id === "crank")!.rotation;
      for (let i = 0; i < steps; i++) state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      return {
        crankDelta: state.find((g) => g.id === "crank")!.rotation - start,
        deadRotation: state.find((g) => g.id === "dead")!.rotation,
      };
    }

    for (const brokenFirst of [false, true]) {
      const r = runBrokenPair(brokenFirst);
      expect(r.crankDelta).toBeCloseTo(steps * dt, 9); // the crank keeps its own speed
      expect(r.deadRotation).toBe(0.9);                // the broken gear stays frozen
    }
  });

  it("does not flicker the phase gate at very low angular velocity (non-issue check for a previously flagged concern)", () => {
    // A prior full-branch review flagged, as a non-blocking observation, that at very low
    // angular velocities (~1e-6 to 1e-7 rad/s -- a near-stationary crank, or the far end
    // of a long gear train) floating-point noise in `wB + edge.ratio * wA` could sit right
    // at the edge of `tolerance`, flickering the phase gate open/closed tick to tick and
    // producing visible micro-jitter in mesh alignment.
    //
    // Investigated and found to be a NON-ISSUE, not fixed:
    //   `tolerance = 1e-6 * Math.max(1, |wA|, |wB|)`. For every |wA|, |wB| < 1 -- true
    //   throughout (and well past) the flagged 1e-6..1e-7 range -- the `1` in that max()
    //   pins the floor at a flat 1e-6; it does NOT shrink alongside the velocities.
    //   `propagateRotation` derives a mesh neighbor's angular velocity from its driver by
    //   a single multiplication (`wOther = wCur * sign * ratio`), so `wB + edge.ratio *
    //   wA` is either exactly 0 -- when the edge is walked "forward" from the driver, the
    //   very same rounded product is added back and cancels bit-for-bit -- or off by at
    //   most a few ULP of wA/wB (~1e-16 relative) when walked "backward" through a
    //   division-then-multiply. Either way the residual sits ~1e10 (forward) to ~1e10
    //   (backward, 1e-16 relative * 1e-7 magnitude vs. a 1e-6 floor) times smaller than
    //   `tolerance` -- nowhere near close enough to flicker, at any velocity down to and
    //   below the flagged range.
    //
    // Verified empirically below (not just algebraically): both array orders (forces both
    // the "forward" and "backward" per-edge computation described above), several
    // non-integer tooth ratios, and both a direct pair and a 6-edge gear train, each run
    // for thousands of ticks at 1e-7 rad/s. In every run the per-tick rotation delta
    // tracks pure `angularVelocity * dt` integration with zero ticks departing by more
    // than 1e-13 (the residual actually observed is ~1e-15, ordinary summation noise --
    // not a phase re-snap, which would show up as a jump of tooth-period scale, i.e.
    // many orders of magnitude larger).
    const dt = 1 / 60;
    const w = 1e-7;

    function runPair(crankFirst: boolean, teethB: number) {
      const dist = 10 + teethB / 2; // pitchRadius(crank=20t) + pitchRadius(b)
      const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: w, rotation: 0.31 });
      const b = makeGear({ id: "b", teeth: teethB, module: 1, position: [dist, 0, 0], rotation: 0.02 });
      let state = (crankFirst ? [crank, b] : [b, crank]) as GearInstance[];
      state = tick({ gears: state, remoteLinks: [] }, 0, 1).gears; // settle
      const ratio = 20 / teethB;
      const start = state.find((g) => g.id === "b")!.rotation;
      let oscillations = 0;
      for (let i = 0; i < 1000; i++) {
        const before = state.find((g) => g.id === "b")!.rotation;
        state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
        const after = state.find((g) => g.id === "b")!.rotation;
        const expectedDelta = -ratio * w * dt;
        if (Math.abs(after - before - expectedDelta) > 1e-13) oscillations++;
      }
      const end = state.find((g) => g.id === "b")!.rotation;
      return { oscillations, totalDelta: end - start, totalExpected: -ratio * w * dt * 1000 };
    }

    for (const crankFirst of [true, false]) {
      for (const teethB of [10, 7, 13]) {
        // 10 => integer ratio (2); 7 and 13 => non-integer ratios, exercising the
        // "backward" division-then-multiply path when crankFirst is false.
        const r = runPair(crankFirst, teethB);
        expect(r.oscillations).toBe(0); // no tick departs from pure integration -> no flicker
        expect(r.totalDelta).toBeCloseTo(r.totalExpected, 9);
      }
    }
  });

  it("does not flicker the phase gate across a long, fully-divided-down gear train at very low velocity", () => {
    // Same non-issue as above, exercised across a 6-edge chain (crank -> g1 -> ... -> g6)
    // with mutually-prime tooth counts, so the last gear's own angular velocity is the
    // one actually sitting in the flagged low range, several multiplications removed from
    // the crank. A fresh multi-edge chain needs a few settling ticks before every edge's
    // phase has propagated (documented above, in `tick()`'s own comment on multi-edge
    // settling) -- that transient is a separate, already-covered behavior, not what's
    // under test here, so this settles fully first and only then measures steady-state
    // per-tick deltas for flicker.
    const teethList = [20, 19, 17, 13, 11, 7, 5];
    const dt = 1 / 60;
    const lastId = `g${teethList.length - 1}`;

    function buildChain(startW: number): GearInstance[] {
      const gears: GearInstance[] = [];
      let x = 0;
      let prevTeeth = teethList[0];
      gears.push(makeGear({ id: "g0", type: "crank", teeth: prevTeeth, module: 1, position: [0, 0, 0], angularVelocity: startW, rotation: 0.13 }));
      for (let i = 1; i < teethList.length; i++) {
        const t = teethList[i];
        x += prevTeeth / 2 + t / 2;
        gears.push(makeGear({ id: `g${i}`, teeth: t, module: 1, position: [x, 0, 0], rotation: 0.07 * i }));
        prevTeeth = t;
      }
      return gears;
    }

    // Find the crank speed that puts the LAST gear's angular velocity at 3e-7 rad/s.
    let probe = tick({ gears: buildChain(1), remoteLinks: [] }, 0, 1).gears;
    const wLastAtStartW1 = probe.find((g) => g.id === lastId)!.angularVelocity;
    const scaledW = 3e-7 / wLastAtStartW1;

    let state = buildChain(scaledW);
    for (let s = 0; s < teethList.length * 3; s++) {
      state = tick({ gears: state, remoteLinks: [] }, 0, 1).gears; // fully settle every edge
    }

    const start = state.find((g) => g.id === lastId)!.rotation;
    let oscillations = 0;
    for (let i = 0; i < 1000; i++) {
      const wBefore = state.find((g) => g.id === lastId)!.angularVelocity;
      const before = state.find((g) => g.id === lastId)!.rotation;
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      const after = state.find((g) => g.id === lastId)!.rotation;
      if (Math.abs(after - before - wBefore * dt) > 1e-13) oscillations++;
    }
    const end = state.find((g) => g.id === lastId)!.rotation;

    expect(oscillations).toBe(0);
    expect(end - start).toBeCloseTo(3e-7 * dt * 1000, 9);
  });

  it("accumulates a rack's linearPosition over time and leaves other gears' linearPosition undefined", () => {
    const pinion = makeGear({ id: "pinion", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 });
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const result = tick({ gears: [pinion, rack], remoteLinks: [] }, 1, 1);
    const rackAfter = result.gears.find((g) => g.id === "rack")!;
    const pinionAfter = result.gears.find((g) => g.id === "pinion")!;
    expect(rackAfter.linearPosition).toBeCloseTo(10); // omega(1) * pitchRadius(10) * dt(1)
    expect(pinionAfter.linearPosition).toBeUndefined();
  });
});
