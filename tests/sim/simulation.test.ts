import { describe, it, expect } from "vitest";
import { tick } from "../../src/sim/simulation";
import { createCarPreset } from "../../src/sim/presets/car";
import { createLocomotivePreset } from "../../src/sim/presets/locomotive";
import type { GearInstance, LayoutState, RemoteLink } from "../../src/sim/types";

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

  it("keeps a differential's two output shafts locked in angular velocity AND accumulated rotation across many ticks of a full crank->bevel->differential train, even when the differential (and everything upstream of it) starts at a non-trivial, unaligned rotation -- not just from a convenient zero state", () => {
    // crank(16t) --mesh(perp)--> inputBevel(8t) --mesh(perp)--> differential(32t) --coupling(x2)--> outA(10t), outB(10t)
    const pitchRadius = (teeth: number) => teeth / 2; // module = 1
    const crankTeeth = 16, bevelTeeth = 8, diffTeeth = 32;
    const bevelX = pitchRadius(crankTeeth) + pitchRadius(bevelTeeth); // 12
    const diffZ = pitchRadius(bevelTeeth) + pitchRadius(diffTeeth); // 20

    const gears: GearInstance[] = [
      makeGear({ id: "crank", type: "crank", teeth: crankTeeth, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 2, rotation: 0.37 }),
      makeGear({ id: "bevel", type: "bevel", teeth: bevelTeeth, module: 1, position: [bevelX, 0, 0], axis: [1, 0, 0], rotation: 1.1 }),
      // The differential itself starts well off zero AND off any tooth-lattice-aligned
      // phase -- the whole point of this scenario per the task: the locked-output
      // guarantee must not secretly depend on starting from a settled/zero phase.
      makeGear({ id: "diff", type: "differential", teeth: diffTeeth, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0], rotation: 2.9 }),
      makeGear({ id: "outA", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0], rotation: 0 }),
      makeGear({ id: "outB", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0], rotation: 0 }),
    ];

    const dt = 1 / 60;
    const steps = 500; // ~8.3 simulated seconds
    let state = gears;
    for (let i = 0; i < steps; i++) {
      const result = tick({ gears: state, remoteLinks: [] }, dt, 1);
      state = result.gears;
      const outA = state.find((g) => g.id === "outA")!;
      const outB = state.find((g) => g.id === "outB")!;
      // Exact, not approximate: both outputs go through byte-for-byte identical arithmetic
      // off the same differential speed every single tick, so any drift at all would be a
      // real bug, not float noise.
      expect(outA.angularVelocity).toBe(outB.angularVelocity);
      expect(outA.rotation).toBe(outB.rotation);
    }

    const diff = state.find((g) => g.id === "diff")!;
    const outA = state.find((g) => g.id === "outA")!;
    const outB = state.find((g) => g.id === "outB")!;
    // Concrete numbers: crank(2 rad/s, 16t) -mesh-> bevel: -2*(16/8) = -4 rad/s;
    // bevel -mesh-> diff: -(-4)*(8/32) = 1 rad/s; diff -coupling-> outA/outB: 1*1 = 1 rad/s.
    // Constant every tick (propagateRotation derives it fresh from teeth ratios and the
    // crank's own speed alone -- never from any gear's accumulated rotation), so pure
    // integration applies: rotation = 0 + 1 * dt * steps.
    expect(diff.angularVelocity).toBeCloseTo(1, 9);
    expect(outA.angularVelocity).toBeCloseTo(1, 9);
    expect(outB.angularVelocity).toBeCloseTo(1, 9);
    expect(outA.rotation).toBeCloseTo(1 * dt * steps, 9);
    expect(outB.rotation).toBeCloseTo(1 * dt * steps, 9);
  });

  it("locks a differential's two outputs to the same VELOCITY, not the same absolute rotation value -- coupling never forces positions together, so two outputs seeded at different starting rotations keep a constant offset forever rather than snapping to each other", () => {
    const pitchRadius = (teeth: number) => teeth / 2;
    const crankTeeth = 16, bevelTeeth = 8, diffTeeth = 32;
    const bevelX = pitchRadius(crankTeeth) + pitchRadius(bevelTeeth);
    const diffZ = pitchRadius(bevelTeeth) + pitchRadius(diffTeeth);

    const gears: GearInstance[] = [
      makeGear({ id: "crank", type: "crank", teeth: crankTeeth, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 2 }),
      makeGear({ id: "bevel", type: "bevel", teeth: bevelTeeth, module: 1, position: [bevelX, 0, 0], axis: [1, 0, 0] }),
      makeGear({ id: "diff", type: "differential", teeth: diffTeeth, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0] }),
      makeGear({ id: "outA", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0], rotation: 0.5 }),
      makeGear({ id: "outB", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0], rotation: -0.2 }),
    ];
    const startOffset = 0.5 - -0.2;

    const dt = 1 / 60;
    let state = gears;
    for (let i = 0; i < 300; i++) {
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      const outA = state.find((g) => g.id === "outA")!;
      const outB = state.find((g) => g.id === "outB")!;
      expect(outA.angularVelocity).toBe(outB.angularVelocity); // speed still locked
      expect(outA.rotation - outB.rotation).toBeCloseTo(startOffset, 9); // offset preserved exactly, not closed
    }
  });

  it("does not disturb a THIRD gear coincident-coupled onto a differential -- it locks to the same speed as the two documented outputs across many ticks, confirming the two-output demo is emergent from the general coincident-coupling rule and not hardcoded to exactly two", () => {
    const pitchRadius = (teeth: number) => teeth / 2;
    const crankTeeth = 16, bevelTeeth = 8, diffTeeth = 32;
    const bevelX = pitchRadius(crankTeeth) + pitchRadius(bevelTeeth);
    const diffZ = pitchRadius(bevelTeeth) + pitchRadius(diffTeeth);

    const gears: GearInstance[] = [
      makeGear({ id: "crank", type: "crank", teeth: crankTeeth, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 2 }),
      makeGear({ id: "bevel", type: "bevel", teeth: bevelTeeth, module: 1, position: [bevelX, 0, 0], axis: [1, 0, 0] }),
      makeGear({ id: "diff", type: "differential", teeth: diffTeeth, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0] }),
      makeGear({ id: "outA", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0] }),
      makeGear({ id: "outB", teeth: 10, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0] }),
      makeGear({ id: "outC", teeth: 6, module: 1, position: [bevelX, 0, diffZ], axis: [0, 1, 0] }), // undocumented third output
    ];

    const dt = 1 / 60;
    let state = gears;
    for (let i = 0; i < 300; i++) {
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
    }
    const outA = state.find((g) => g.id === "outA")!;
    const outB = state.find((g) => g.id === "outB")!;
    const outC = state.find((g) => g.id === "outC")!;
    expect(outC.angularVelocity).toBe(outA.angularVelocity);
    expect(outC.angularVelocity).toBe(outB.angularVelocity);
    expect(outC.rotation).toBe(outA.rotation);
    expect(outC.rotation).toBe(outB.rotation);
  });

  it("drives THREE simultaneous, independent branches off one crank across many ticks with no cross-talk -- two direct mesh partners at different ratios plus one coincident (shaft-coupled) partner", () => {
    // crank(20t, av=3) meshed with spurA(10t) along +X, meshed with spurB(8t) along +Z
    // (far enough apart that spurA/spurB never mesh with each other), and shaft-coupled
    // (coincident) to a load. All three start at non-trivial, mutually unaligned
    // rotations -- not a convenient zero state -- so any settling transient shows up
    // before steady state is measured.
    const crankTeeth = 20, spurATeeth = 10, spurBTeeth = 8;
    const gears: GearInstance[] = [
      makeGear({ id: "crank", type: "crank", teeth: crankTeeth, module: 1, position: [0, 0, 0], angularVelocity: 3, rotation: 0.37 }),
      makeGear({ id: "spurA", teeth: spurATeeth, module: 1, position: [15, 0, 0], rotation: 1.1 }),
      makeGear({ id: "spurB", teeth: spurBTeeth, module: 1, position: [0, 0, 14], rotation: 2.9 }),
      makeGear({ id: "load", type: "load", teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.6 }),
    ];

    const dt = 1 / 60;
    let state = tick({ gears, remoteLinks: [] }, 0, 1).gears; // settle each mesh edge's tooth phase once

    const startA = state.find((g) => g.id === "spurA")!.rotation;
    const startB = state.find((g) => g.id === "spurB")!.rotation;
    const startLoad = state.find((g) => g.id === "load")!.rotation;

    const expectedA = -(crankTeeth / spurATeeth) * 3; // -(20/10)*3 = -6
    const expectedB = -(crankTeeth / spurBTeeth) * 3;  // -(20/8)*3 = -7.5
    const expectedLoad = 3;                            // rigid coupling: same as the crank

    const steps = 300;
    let oscillationsA = 0;
    let oscillationsB = 0;
    for (let i = 0; i < steps; i++) {
      const beforeA = state.find((g) => g.id === "spurA")!.rotation;
      const beforeB = state.find((g) => g.id === "spurB")!.rotation;
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      const afterA = state.find((g) => g.id === "spurA")!.rotation;
      const afterB = state.find((g) => g.id === "spurB")!.rotation;
      if (Math.abs(afterA - beforeA - expectedA * dt) > 1e-9) oscillationsA++;
      if (Math.abs(afterB - beforeB - expectedB * dt) > 1e-9) oscillationsB++;

      // No cross-talk, checked on every single tick: each branch's angular velocity
      // depends only on the crank's fixed speed and its own ratio -- never on the
      // other branch's state.
      expect(state.find((g) => g.id === "spurA")!.angularVelocity).toBeCloseTo(expectedA, 9);
      expect(state.find((g) => g.id === "spurB")!.angularVelocity).toBeCloseTo(expectedB, 9);
      expect(state.find((g) => g.id === "load")!.angularVelocity).toBeCloseTo(expectedLoad, 9);
      expect(state.find((g) => g.id === "crank")!.angularVelocity).toBe(3); // never overwritten
    }

    expect(oscillationsA).toBe(0);
    expect(oscillationsB).toBe(0);

    const endA = state.find((g) => g.id === "spurA")!.rotation;
    const endB = state.find((g) => g.id === "spurB")!.rotation;
    const endLoad = state.find((g) => g.id === "load")!.rotation;
    expect(endA - startA).toBeCloseTo(expectedA * dt * steps, 9);
    expect(endB - startB).toBeCloseTo(expectedB * dt * steps, 9);
    // The coupling edge never gets a phase adjustment (only "mesh" edges do), so the
    // load's rotation is exact pure integration from tick 0 -- no settling needed at all.
    expect(endLoad - startLoad).toBeCloseTo(expectedLoad * dt * steps, 9);
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

  it("accumulates a rack's linearPosition as exact arc-length (angularVelocity * pitchRadius * dt) across many ticks, for two different pinion radii", () => {
    // Proves the conversion is the real formula and not accidentally hardcoded/right for
    // only one specific radius: two very different pitch radii, run for the same elapsed
    // time at the same angular velocity, must land on two different (and independently
    // correct) linearPosition values.
    const dt = 1 / 60;
    const steps = 180; // 3 simulated seconds
    const angularVelocity = 1.5;

    function run(teeth: number, module: number): number {
      const radius = (module * teeth) / 2;
      const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
      // Pinion's perpendicular offset from the rack's travel line must equal its own
      // pitch radius for the two to mesh at all -- see meshing.ts's line-distance check.
      const pinion = makeGear({ id: "pinion", type: "crank", teeth, module, position: [0, 0, radius], axis: [0, 1, 0], angularVelocity });
      let state: GearInstance[] = [pinion, rack];
      for (let i = 0; i < steps; i++) state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      return state.find((g) => g.id === "rack")!.linearPosition!;
    }

    const elapsed = steps * dt;
    const radiusSmall = (1 * 10) / 2; // teeth=10, module=1 -> 5
    const radiusLarge = (2 * 15) / 2; // teeth=15, module=2 -> 15

    const posSmall = run(10, 1);
    const posLarge = run(15, 2);

    expect(posSmall).toBeCloseTo(angularVelocity * radiusSmall * elapsed, 9);
    expect(posLarge).toBeCloseTo(angularVelocity * radiusLarge * elapsed, 9);
    expect(Math.abs(posSmall - posLarge)).toBeGreaterThan(1); // genuinely different, not coincidentally equal
  });
});

describe("ratchet one-way lock across many ticks", () => {
  it("never leaks rotation from one driving gear to another THROUGH a shared ratchet, in either gear-array order, across many ticks", () => {
    // driverA(20t) --mesh(15 apart)--> ratchet(10t) <--mesh(9 apart)-- driverB(8t)
    // Both drivers independently sit within mesh distance of the SAME ratchet -- as if
    // the ratchet sat between two other gears, each able to drive it on its own. The
    // one-way lock must hold on BOTH sides of the ratchet at once: rotation.ts's
    // adjacency map never adds an edge to the ratchet's OWN outgoing list for a
    // ratchet-involved edge (oneWay is always resolved away from the ratchet), so the
    // ratchet has zero outgoing edges and physically cannot relay anything it receives
    // to the far driver -- verified here over real ticks, not just the static edge set.
    const pitchR = (teeth: number) => teeth / 2; // module = 1
    const ratchetX = pitchR(20) + pitchR(10); // 15
    const driverBX = ratchetX + pitchR(10) + pitchR(8); // 24

    function build(order: "AfirstInArray" | "BfirstInArray"): GearInstance[] {
      const driverA = makeGear({ id: "driverA", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 5 });
      const ratchet = makeGear({ id: "ratchet", type: "ratchet", teeth: 10, module: 1, position: [ratchetX, 0, 0], axis: [0, 1, 0] });
      const driverB = makeGear({ id: "driverB", type: "crank", teeth: 8, module: 1, position: [driverBX, 0, 0], axis: [0, 1, 0], angularVelocity: 7 });
      return order === "AfirstInArray" ? [driverA, ratchet, driverB] : [driverB, ratchet, driverA];
    }

    // Whichever driver appears first in the gears array wins the race to set the
    // ratchet's speed -- propagateRotation's crank-BFS visits cranks in array order and
    // marks the ratchet visited on first contact, a pre-existing, documented property of
    // the general BFS shared by every gear type, not something specific to ratchets.
    // What must hold regardless of who wins that race: the LOSING driver's own speed is
    // never touched -- that is the actual thing under test here.
    const cases: Array<{ order: "AfirstInArray" | "BfirstInArray"; expectedRatchet: number }> = [
      { order: "AfirstInArray", expectedRatchet: -10 }, // -(20/10) * 5, driverA wins the race
      { order: "BfirstInArray", expectedRatchet: -5.6 }, // -(8/10) * 7, driverB wins the race
    ];

    for (const { order, expectedRatchet } of cases) {
      let state = build(order);
      const dt = 1 / 60;
      for (let i = 0; i < 50; i++) {
        state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
        const driverA = state.find((g) => g.id === "driverA")!;
        const driverB = state.find((g) => g.id === "driverB")!;
        const ratchet = state.find((g) => g.id === "ratchet")!;
        // Neither crank ever deviates from its own commanded speed, tick after tick --
        // this is what confirms no power path leaks from one driver to the other
        // through the ratchet sitting between them.
        expect(driverA.angularVelocity).toBe(5);
        expect(driverB.angularVelocity).toBe(7);
        expect(ratchet.angularVelocity).toBeCloseTo(expectedRatchet, 9);
      }
    }
  });

  it("overwrites a stale residual angularVelocity to exactly zero the instant a tick runs once its driver stops, then holds rotation constant for as long as the driver stays stopped", () => {
    // This sim has no independent inertia/freewheel model for a non-crank gear: every
    // tick, propagateRotation recomputes a gear's angular velocity purely from the
    // CURRENT crank speeds reachable through the mesh graph -- it never blends in
    // whatever velocity the gear happened to carry from a previous tick. So a ratchet
    // "still spinning" (angularVelocity=3 below) from before its driver stopped is stale
    // data with no physical meaning in this model; the very first tick after the driver
    // reads 0 must zero it, and it must then stay at rest indefinitely -- exactly the
    // real-world ratchet behaviour: nothing is pushing it forward, and the pawl is what
    // stops it drifting backward either.
    const driver = makeGear({ id: "driver", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 0, rotation: 1.3 });
    const ratchet = makeGear({ id: "ratchet", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0], axis: [0, 1, 0], angularVelocity: 3, rotation: 0.7 });

    // dt=0 both settles the mesh phase (same convention used elsewhere in this file) AND
    // is itself the first real tick -- so it doubles as proof the residual velocity does
    // not survive even a single pass.
    let state = tick({ gears: [driver, ratchet], remoteLinks: [] }, 0, 1).gears;
    const settledRatchet = state.find((g) => g.id === "ratchet")!;
    // toBeCloseTo, not toBe: propagateRotation derives this as curSpeed(0) * sign(-1) *
    // ratio, which is signed-zero-preserving IEEE-754 arithmetic (-0) rather than +0 --
    // physically meaningless (still "not spinning"), but `toBe`'s Object.is would fail
    // on -0 !== 0 even though the value is correctly zero. The magnitude is what matters.
    expect(settledRatchet.angularVelocity).toBeCloseTo(0, 9); // NOT 3 -- the stale residual is gone immediately
    const settledRotation = settledRatchet.rotation;

    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) {
      state = tick({ gears: state, remoteLinks: [] }, dt, 1).gears;
      const r = state.find((g) => g.id === "ratchet")!;
      const d = state.find((g) => g.id === "driver")!;
      expect(d.angularVelocity).toBeCloseTo(0, 9); // the driver genuinely stays stopped
      expect(r.angularVelocity).toBeCloseTo(0, 9); // the ratchet never starts coasting on its own
      expect(r.rotation).toBeCloseTo(settledRotation, 9); // and holds its position exactly -- no drift
    }
  });
});

describe("chain-linked sprockets, full end-to-end power path (crank -> coupling -> sprocketA -> chain -> sprocketB -> coupling -> load)", () => {
  // crank(av=2) --coupling(coincident)--> sprocketA(16t) --chain(RemoteLink)--> sprocketB(8t) --coupling(coincident)--> load
  // sprocketA and sprocketB are placed far apart (never within mesh distance of each
  // other) -- the ONLY thing connecting them is the chain RemoteLink, exercising the
  // full crossing between meshing.ts's COINCIDENT_ONLY coupling (spec §3.3: how a
  // sprocket receives power at all) and graph.ts's remote-link edge (how it hands
  // power to its chain partner), through one real `tick()` call, not two separate
  // unit tests of each half.
  const crankTeeth = 16;
  const sprocketATeeth = 16;
  const sprocketBTeeth = 8; // deliberately UNEQUAL to sprocketA -- see the ratio assertion below
  const crankAV = 2;

  function buildGears(order: "forward" | "reversed"): GearInstance[] {
    const crank = makeGear({ id: "crank", type: "crank", teeth: crankTeeth, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: crankAV });
    const sprocketA = makeGear({ id: "sprocketA", type: "sprocket", teeth: sprocketATeeth, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const sprocketB = makeGear({ id: "sprocketB", type: "sprocket", teeth: sprocketBTeeth, module: 1, position: [200, 0, 0], axis: [0, 1, 0] });
    const load = makeGear({ id: "load", type: "load", teeth: 0, module: 1, position: [200, 0, 0], axis: [0, 1, 0] });
    return order === "forward" ? [crank, sprocketA, sprocketB, load] : [load, sprocketB, sprocketA, crank];
  }

  it("propagates the crank's speed through the coincident coupling, the chain link, and the second coupling, with the chain ratio scaled by the two sprockets' tooth counts (NOT a flat 1:1)", () => {
    const gears = buildGears("forward");
    const links: RemoteLink[] = [{ a: "sprocketA", b: "sprocketB", kind: "chain" }];

    const dt = 1 / 60;
    const steps = 180; // 3 simulated seconds
    let state = { gears, remoteLinks: links };
    let result = tick(state, 0, 1); // no mesh edges anywhere in this graph, so dt=0 is not needed for phase settling -- kept only for symmetry with the rest of this file's convention

    for (let i = 0; i < steps; i++) {
      result = tick({ gears: result.gears, remoteLinks: links }, dt, 1);

      const crank = result.gears.find((g) => g.id === "crank")!;
      const sprocketA = result.gears.find((g) => g.id === "sprocketA")!;
      const sprocketB = result.gears.find((g) => g.id === "sprocketB")!;
      const load = result.gears.find((g) => g.id === "load")!;

      // Read the actual code (graph.ts buildEdges, rotation.ts propagateRotation) rather
      // than assuming: a "coupling" edge is sign=+1, ratio=1 (rigid shaft), and a "chain"
      // edge is ALSO sign=+1 (a chain doesn't reverse direction the way a tooth mesh
      // does) but ratio = drivingSprocket.teeth / drivenSprocket.teeth -- exactly the real
      // bicycle-chain relationship (teethA * omegaA = teethB * omegaB), not a flat 1:1.
      expect(crank.angularVelocity).toBe(crankAV); // never overwritten
      expect(sprocketA.angularVelocity).toBeCloseTo(crankAV, 9); // coupling: same speed, same sign
      expect(sprocketB.angularVelocity).toBeCloseTo(crankAV * (sprocketATeeth / sprocketBTeeth), 9); // 2 * (16/8) = 4
      expect(load.angularVelocity).toBeCloseTo(sprocketB.angularVelocity, 9); // coupling: same speed, same sign
    }

    // Pure integration the whole way (no mesh edge anywhere in this graph means
    // `computeMeshPhaseOffset` never applies to any of these four gears -- see tick()'s
    // `edge.kind !== "mesh"` gate), so rotation should be exact constant-velocity
    // integration from the very first real tick, no settling transient to account for.
    const finalSprocketA = result.gears.find((g) => g.id === "sprocketA")!;
    const finalSprocketB = result.gears.find((g) => g.id === "sprocketB")!;
    const finalLoad = result.gears.find((g) => g.id === "load")!;
    expect(finalSprocketA.rotation).toBeCloseTo(crankAV * dt * steps, 9);
    expect(finalSprocketB.rotation).toBeCloseTo(crankAV * (sprocketATeeth / sprocketBTeeth) * dt * steps, 9);
    expect(finalLoad.rotation).toBeCloseTo(finalSprocketB.rotation, 9);

    // Diagnostics: the whole graph is one connected, powered component -- BFS in
    // classify() walks the chain edge exactly like any other edge when deciding
    // reachability from a crank.
    expect(result.diagnostics.unconnectedIds).toEqual([]);
    expect(result.diagnostics.noPowerIds).toEqual([]);
  });

  it("is NOT a bug that unequal sprocket teeth counts change the chain ratio -- this matches a real chain drive (a small sprocket driven by a big one speeds up), and is exercised here explicitly as a documented, intentional behavior rather than left implicit in the test above", () => {
    // 3 teeth combinations, including sprocketA both bigger and smaller than sprocketB,
    // plus the equal-teeth case (which must reduce to a plain 1:1).
    const cases: Array<{ teethA: number; teethB: number; expectedRatio: number }> = [
      { teethA: 16, teethB: 8, expectedRatio: 2 },     // big drives small -> small speeds up
      { teethA: 8, teethB: 16, expectedRatio: 0.5 },   // small drives big -> big slows down
      { teethA: 12, teethB: 12, expectedRatio: 1 },    // equal teeth -> reduces to flat 1:1
    ];
    for (const { teethA, teethB, expectedRatio } of cases) {
      const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 1 });
      const sprocketA = makeGear({ id: "sprocketA", type: "sprocket", teeth: teethA, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
      const sprocketB = makeGear({ id: "sprocketB", type: "sprocket", teeth: teethB, module: 1, position: [200, 0, 0], axis: [0, 1, 0] });
      const links: RemoteLink[] = [{ a: "sprocketA", b: "sprocketB", kind: "chain" }];
      const result = tick({ gears: [crank, sprocketA, sprocketB], remoteLinks: links }, 1 / 60, 1);
      const b = result.gears.find((g) => g.id === "sprocketB")!;
      expect(b.angularVelocity).toBeCloseTo(1 * expectedRatio, 9);
    }
  });

  it("gives the identical end-to-end result regardless of the gears array order or which sprocket is `a`/`b` in the chain RemoteLink", () => {
    const dt = 1 / 60;
    const steps = 90;

    function run(order: "forward" | "reversed", linkOrder: "AtoB" | "BtoA"): { sprocketA: GearInstance; sprocketB: GearInstance; load: GearInstance } {
      const links: RemoteLink[] =
        linkOrder === "AtoB" ? [{ a: "sprocketA", b: "sprocketB", kind: "chain" }] : [{ a: "sprocketB", b: "sprocketA", kind: "chain" }];
      let gears = buildGears(order);
      for (let i = 0; i < steps; i++) gears = tick({ gears, remoteLinks: links }, dt, 1).gears;
      return {
        sprocketA: gears.find((g) => g.id === "sprocketA")!,
        sprocketB: gears.find((g) => g.id === "sprocketB")!,
        load: gears.find((g) => g.id === "load")!,
      };
    }

    const combos: Array<["forward" | "reversed", "AtoB" | "BtoA"]> = [
      ["forward", "AtoB"],
      ["reversed", "AtoB"],
      ["forward", "BtoA"],
      ["reversed", "BtoA"],
    ];
    const results = combos.map(([order, linkOrder]) => run(order, linkOrder));
    const baseline = results[0];
    for (const r of results.slice(1)) {
      expect(r.sprocketA.angularVelocity).toBeCloseTo(baseline.sprocketA.angularVelocity, 9);
      expect(r.sprocketB.angularVelocity).toBeCloseTo(baseline.sprocketB.angularVelocity, 9);
      expect(r.load.angularVelocity).toBeCloseTo(baseline.load.angularVelocity, 9);
      expect(r.sprocketA.rotation).toBeCloseTo(baseline.sprocketA.rotation, 9);
      expect(r.sprocketB.rotation).toBeCloseTo(baseline.sprocketB.rotation, 9);
      expect(r.load.rotation).toBeCloseTo(baseline.load.rotation, 9);
    }
    // Sanity: this isn't trivially true because everything is zero -- the chain link is
    // genuinely doing work (unequal teeth -> unequal, nonzero speed).
    expect(baseline.sprocketB.angularVelocity).toBeCloseTo(crankAV * (sprocketATeeth / sprocketBTeeth), 9);
  });

  it("drops a chain RemoteLink referencing a since-deleted gear without throwing, and the surviving sprocket simply loses that power path instead of propagating to nothing", () => {
    // sprocketB (and the load coupled to it) no longer exist in `gears` -- only the
    // RemoteLink still names sprocketB's id, exactly as if the user deleted sprocketB
    // after chaining it to sprocketA (see src/sim/removeGear.ts for the deletion path
    // this simulates the aftermath of).
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 3 });
    const sprocketA = makeGear({ id: "sprocketA", type: "sprocket", teeth: 16, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const danglingLink: RemoteLink[] = [{ a: "sprocketA", b: "sprocketB-gone", kind: "chain" }];

    let state = { gears: [crank, sprocketA], remoteLinks: danglingLink };
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) {
      const currentState = state;
      expect(() => tick(currentState, dt, 1)).not.toThrow();
      const result = tick(currentState, dt, 1);
      state = { gears: result.gears, remoteLinks: danglingLink };

      const sprocketAAfter = result.gears.find((g) => g.id === "sprocketA")!;
      // sprocketA still gets its power from the coincident coupling to the crank --
      // buildEdges drops only the dangling chain edge (graph.ts: `if (!a || !b) continue`),
      // not the perfectly valid coupling edge sitting alongside it.
      expect(sprocketAAfter.angularVelocity).toBeCloseTo(3, 9);
      expect(result.diagnostics.unconnectedIds).toEqual([]);
      expect(result.diagnostics.noPowerIds).toEqual([]);
    }
  });
});

describe("pulley / belt end-to-end power path (spec §3.4)", () => {
  // Full chain: crank -> (coincident shaft coupling) -> pulleyA -> (belt RemoteLink) ->
  // pulleyB -> (coincident shaft coupling) -> load. Deliberately gives the two pulleys
  // the SAME pitch radius (10) via DIFFERENT teeth/module combinations (20t/module 1 vs.
  // 10t/module 2) -- if the belt edge's ratio were ever computed from tooth count (like a
  // chain's) instead of pitch radius (physically correct for a smooth, toothless belt
  // wheel), this would immediately diverge: teeth-ratio would be 20/10 = 2, but the
  // physically-correct radius-ratio is 10/10 = 1. `buildEdges` (src/sim/graph.ts) already
  // computes `pitchRadius(a) / pitchRadius(b)` for any non-"chain" RemoteLink kind, so this
  // is a real regression guard on that formula, not a coincidence-masking case like
  // graph.test.ts's existing belt-ratio test (which happens to use equal modules, so
  // teeth-ratio and radius-ratio can't be told apart there).
  function buildLayout(gearOrder: GearInstance[], link: RemoteLink) {
    return { gears: gearOrder, remoteLinks: [link] };
  }

  function makePulleyChain() {
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 2 });
    const pulleyA = makeGear({ id: "pulleyA", type: "pulley", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] }); // pitchRadius 10, coincident with crank
    const pulleyB = makeGear({ id: "pulleyB", type: "pulley", teeth: 10, module: 2, position: [500, 0, 0], axis: [0, 1, 0] }); // pitchRadius 10, different teeth/module
    const load = makeGear({ id: "load", type: "load", teeth: 0, module: 1, position: [500, 0, 0], axis: [0, 1, 0] }); // coincident with pulleyB
    return { crank, pulleyA, pulleyB, load };
  }

  it("drives the full chain at the belt's pitch-radius ratio (1, here), NOT a tooth-count ratio (which would be 2)", () => {
    const { crank, pulleyA, pulleyB, load } = makePulleyChain();
    const link: RemoteLink = { a: "pulleyA", b: "pulleyB", kind: "belt" };
    const result = tick(buildLayout([crank, pulleyA, pulleyB, load], link), 1, 1);

    const gCrank = result.gears.find((g) => g.id === "crank")!;
    const gA = result.gears.find((g) => g.id === "pulleyA")!;
    const gB = result.gears.find((g) => g.id === "pulleyB")!;
    const gLoad = result.gears.find((g) => g.id === "load")!;

    expect(gCrank.angularVelocity).toBe(2);              // the crank's own commanded input
    expect(gA.angularVelocity).toBeCloseTo(2);            // coincident coupling: same speed, same direction
    expect(gB.angularVelocity).toBeCloseTo(2);            // belt, pitch-radius ratio 10/10 = 1, same direction (NOT 4, which a teeth-ratio of 2 would give)
    expect(gLoad.angularVelocity).toBeCloseTo(2);          // coincident coupling: same speed, same direction

    // No diagnostics problems -- the whole chain is one powered component.
    expect(result.diagnostics.unconnectedIds).toEqual([]);
    expect(result.diagnostics.noPowerIds).toEqual([]);

    // Multi-tick: rotations integrate exactly (belt/coupling edges never go through the
    // tooth-phase-offset logic -- that's gated to `edge.kind === "mesh"` only -- so there
    // is no settling tick needed and no phase drift to guard against).
    const dt = 1 / 60;
    let state = result.gears;
    const startA = state.find((g) => g.id === "pulleyA")!.rotation;
    const startB = state.find((g) => g.id === "pulleyB")!.rotation;
    for (let i = 0; i < 120; i++) state = tick({ gears: state, remoteLinks: [link] }, dt, 1).gears;
    const finalA = state.find((g) => g.id === "pulleyA")!;
    const finalB = state.find((g) => g.id === "pulleyB")!;
    expect(finalA.rotation - startA).toBeCloseTo(2 * 120 * dt, 9);
    expect(finalB.rotation - startB).toBeCloseTo(2 * 120 * dt, 9); // same delta as A: ratio 1, same direction
  });

  it("gives the SAME end-to-end result no matter the gears array order or which pulley is a/b in the RemoteLink", () => {
    // Use unequal pitch radii here (10 vs 5) so a/b-swap actually exercises the
    // isForward=false branch of propagateRotation's ratio inversion (1/ratio), not just a
    // trivial ratio-of-1 case.
    function scenario(gearOrder: (g: ReturnType<typeof makePulleyChain>) => GearInstance[], link: RemoteLink) {
      const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 2 });
      const pulleyA = makeGear({ id: "pulleyA", type: "pulley", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] }); // pitchRadius 10
      const pulleyB = makeGear({ id: "pulleyB", type: "pulley", teeth: 20, module: 0.5, position: [500, 0, 0], axis: [0, 1, 0] }); // pitchRadius 5
      const load = makeGear({ id: "load", type: "load", teeth: 0, module: 1, position: [500, 0, 0], axis: [0, 1, 0] });
      const gears = gearOrder({ crank, pulleyA, pulleyB, load });
      const result = tick({ gears, remoteLinks: [link] }, 1, 1);
      return {
        crank: result.gears.find((g) => g.id === "crank")!.angularVelocity,
        pulleyA: result.gears.find((g) => g.id === "pulleyA")!.angularVelocity,
        pulleyB: result.gears.find((g) => g.id === "pulleyB")!.angularVelocity,
        load: result.gears.find((g) => g.id === "load")!.angularVelocity,
      };
    }

    const orderings: Array<(g: ReturnType<typeof makePulleyChain>) => GearInstance[]> = [
      ({ crank, pulleyA, pulleyB, load }) => [crank, pulleyA, pulleyB, load],
      ({ crank, pulleyA, pulleyB, load }) => [load, pulleyB, pulleyA, crank],
      ({ crank, pulleyA, pulleyB, load }) => [pulleyB, crank, load, pulleyA],
    ];
    const linkVariants: RemoteLink[] = [
      { a: "pulleyA", b: "pulleyB", kind: "belt" },
      { a: "pulleyB", b: "pulleyA", kind: "belt" }, // swapped a/b
    ];

    for (const order of orderings) {
      for (const link of linkVariants) {
        const r = scenario(order, link);
        expect(r.crank).toBe(2);
        expect(r.pulleyA).toBeCloseTo(2);        // coupled 1:1 with the crank
        expect(r.pulleyB).toBeCloseTo(4);         // belt: rA/rB = 10/5 = 2 -> pulleyB spins twice as fast, same direction
        expect(r.load).toBeCloseTo(4);            // coupled 1:1 with pulleyB
      }
    }
  });

  it("does not crash and leaves the surviving pulley on its own local power path when a belt link dangles after its partner is deleted", () => {
    // Mirrors buildEdges' own defensive check (src/sim/graph.ts: "a linked gear was
    // deleted -- drop the stale link rather than crash") at the full tick() level: a
    // RemoteLink whose other endpoint id no longer exists in `gears` (e.g. the owning
    // pulley was deleted through a path that didn't go through removeGear, or a
    // hand-edited save file) must not throw, and the surviving pulley must fall back to
    // whatever power it still gets through ordinary coincident coupling.
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], angularVelocity: 3 });
    const pulleyA = makeGear({ id: "pulleyA", type: "pulley", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] }); // coincident with crank
    const danglingLink: RemoteLink = { a: "pulleyA", b: "pulleyB-deleted", kind: "belt" };

    expect(() => tick({ gears: [crank, pulleyA], remoteLinks: [danglingLink] }, 1, 1)).not.toThrow();

    const result = tick({ gears: [crank, pulleyA], remoteLinks: [danglingLink] }, 1, 1);
    const gA = result.gears.find((g) => g.id === "pulleyA")!;
    expect(gA.angularVelocity).toBeCloseTo(3); // still gets power through the coincident coupling with the crank
    expect(result.diagnostics.unconnectedIds).toEqual([]);
    expect(result.diagnostics.noPowerIds).toEqual([]);

    // And with NO other power path at all (no crank coupling either), the dangling link
    // still must not crash -- the gear just sits unpowered.
    const lonelyPulley = makeGear({ id: "pulleyA", type: "pulley", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    expect(() => tick({ gears: [lonelyPulley], remoteLinks: [danglingLink] }, 1, 1)).not.toThrow();
    const lonelyResult = tick({ gears: [lonelyPulley], remoteLinks: [danglingLink] }, 1, 1);
    expect(lonelyResult.gears.find((g) => g.id === "pulleyA")!.angularVelocity).toBe(0);
    expect(lonelyResult.diagnostics.unconnectedIds).toEqual(["pulleyA"]);
  });
});

describe("tick -- reciprocating cranks (reverseAt)", () => {
  it("flips a crank's commanded direction at each bound and keeps its rotation inside them", () => {
    let layout = {
      gears: [makeGear({ id: "c", type: "crank", angularVelocity: 1, reverseAt: [0, 2] as [number, number] })],
      remoteLinks: [] as RemoteLink[],
    };
    let min = Infinity;
    let max = -Infinity;
    const signs = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      layout = { gears: tick(layout, 1 / 60, 1).gears, remoteLinks: layout.remoteLinks };
      const c = layout.gears[0];
      min = Math.min(min, c.rotation);
      max = Math.max(max, c.rotation);
      signs.add(Math.sign(c.angularVelocity));
    }
    // It ran in both directions, and its speed magnitude never changed -- only the sign.
    expect(signs).toEqual(new Set([1, -1]));
    expect(Math.abs(layout.gears[0].angularVelocity)).toBe(1);
    // It swept the whole stroke, overshooting each bound by at most one tick's worth
    // (1 rad/s * 1/60 s), which is what keeps a driven rack's separately integrated travel
    // in step with this rotation.
    expect(max).toBeGreaterThan(2 - 0.02);
    expect(max).toBeLessThan(2 + 0.02);
    expect(min).toBeGreaterThan(-0.02);
    expect(min).toBeLessThan(0.02);
  });

  it("reverses everything the crank drives, not just the crank", () => {
    let layout = {
      gears: [
        makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, reverseAt: [0, 1] as [number, number] }),
        makeGear({ id: "driven", teeth: 10, module: 1, position: [15, 0, 0] }),
      ],
      remoteLinks: [] as RemoteLink[],
    };
    const drivenSigns = new Set<number>();
    for (let i = 0; i < 400; i++) {
      layout = { gears: tick(layout, 1 / 60, 1).gears, remoteLinks: layout.remoteLinks };
      drivenSigns.add(Math.sign(layout.gears.find((g) => g.id === "driven")!.angularVelocity));
    }
    expect(drivenSigns.has(1)).toBe(true);
    expect(drivenSigns.has(-1)).toBe(true);
  });

  it("leaves a crank without reverseAt turning one way forever", () => {
    let layout = {
      gears: [makeGear({ id: "c", type: "crank", angularVelocity: 1 })],
      remoteLinks: [] as RemoteLink[],
    };
    for (let i = 0; i < 600; i++) {
      layout = { gears: tick(layout, 1 / 60, 1).gears, remoteLinks: layout.remoteLinks };
    }
    expect(layout.gears[0].angularVelocity).toBe(1);
    expect(layout.gears[0].rotation).toBeCloseTo(10, 6);
  });
});

describe("the 시간배율 (time scale) multiplier", () => {
  it("multiplies how much simulated time a frame is worth, not just the wear rate", () => {
    // It reached `applyWear` and nothing else, so with wear off -- which is how the app runs --
    // dragging the slider changed absolutely nothing on screen.
    const spin = (timeScale: number) => {
      let layout: LayoutState = {
        gears: [
          {
            id: "c", type: "crank", position: [0, 0, 0], axis: [0, 1, 0], teeth: 10, module: 1,
            durabilityMax: 200, durabilityCurrent: 200, broken: false, rotation: 0,
            angularVelocity: 2,
          },
        ],
        remoteLinks: [],
      };
      for (let i = 0; i < 60; i++) {
        const r = tick(layout, 1 / 60, timeScale, { wear: false });
        layout = { ...layout, gears: r.gears };
      }
      return layout.gears[0].rotation;
    };
    expect(spin(1)).toBeCloseTo(2, 6); // 2 rad/s for one second
    expect(spin(3)).toBeCloseTo(6, 6); // three times the simulated time, three times the angle
    expect(spin(0.5)).toBeCloseTo(1, 6);
  });
});

describe("a vehicle is carried by its wheel, not by a number of its own", () => {
  it("stops dead when its road wheel breaks", () => {
    // `updatedGears` freezes a broken gear's rotation, so a vehicle that kept travelling would
    // be sliding along on a wheel that has visibly stopped -- breaking the no-slip relation the
    // travel is supposed to BE. The case is real rather than theoretical: a broken CRANK keeps
    // its stored angularVelocity in the map (propagateRotation seeds every crank from its own
    // field before excluding broken ones from driving), and the locomotive's road wheel IS its
    // motorised crank.
    let layout: LayoutState = createLocomotivePreset();
    for (let i = 0; i < 180; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
    }
    const movedWhileWell = layout.vehicles![0].distance;
    expect(movedWhileWell).toBeGreaterThan(0);

    layout = {
      ...layout,
      gears: layout.gears.map((g) => (g.id === layout.vehicles![0].wheel ? { ...g, broken: true } : g)),
    };
    for (let i = 0; i < 180; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
    }
    expect(layout.vehicles![0].distance).toBe(movedWhileWell); // not one unit further
  });

  it("is stopped by its limit while the wheels keep turning, like a kerb", () => {
    const fresh = createCarPreset();
    const stop = 6; // a kerb only six units down the road, so it is certainly reached
    let layout: LayoutState = {
      ...fresh,
      gears: fresh.gears.map((g) => ({ ...g, reverseAt: undefined })),
      vehicles: fresh.vehicles!.map((v) => ({ ...v, limit: [-stop, stop] })),
    };
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
      expect(layout.vehicles![0].distance).toBeLessThanOrEqual(stop);
    }
    expect(layout.vehicles![0].distance).toBe(stop); // parked against it, not short of it
    const wheel = layout.gears.find((g) => g.id === layout.vehicles![0].wheel)!;
    expect(Math.abs(wheel.angularVelocity)).toBeGreaterThan(0.1); // wheels still spinning
    expect(wheel.rotation * 8).toBeGreaterThan(stop); // and they have out-turned the travel
  });
});
