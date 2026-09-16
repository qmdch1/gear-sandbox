import { describe, it, expect } from "vitest";
import {
  createConveyorPreset,
  createConveyorProps,
  MOTOR_ID,
  HEAD_ID,
  TAIL_ID,
  HEAD_R,
  TAIL_R,
  PULLEY_RATIO,
  MOTOR_SPEED,
  CARRY_TRAVEL,
  CARRY_STROKE,
  PARCEL_COUNT,
  PARCEL_LENGTH,
  parcelStartZ,
  HEAD_Z,
  TAIL_Z,
  MOTOR_TEETH,
  HEAD_TEETH,
  BELT_Y,
  RUN_MIN_Z,
} from "../../../src/sim/presets/conveyor";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createConveyorPreset", () => {
  it("builds a motor keyed to the head pulley, belted to an equal tail pulley", () => {
    const layout = createConveyorPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([MOTOR_ID, HEAD_ID, TAIL_ID]);
    expect(layout.remoteLinks).toEqual([{ a: HEAD_ID, b: TAIL_ID, kind: "belt" }]);

    const [motor, head, tail] = layout.gears;
    expect(motor.type).toBe("crank");
    expect(head.type).toBe("pulley");
    expect(tail.type).toBe("pulley");
    expect(head.position).toEqual(motor.position); // keyed onto the motor shaft
    expect(head.axis).toEqual(motor.axis);
    // Equal pulleys are what force both ends of the belt to the same rim speed.
    expect(HEAD_R).toBe(TAIL_R);
    expect(PULLEY_RATIO).toBe(1);
  });

  it("keeps the motor's tooth tips clear of the belt it drives", () => {
    // Motor and head pulley are drawn at the SAME point (that is what a coincident coupling
    // means), so the larger body is what you see. The pulley's rim just touches the belt slab's
    // underside at BELT_Y + HEAD_R; a motor whose TOOTH TIPS (pitch radius + one module of
    // addendum, gearGeometry's ADDENDUM_FACTOR = 1) reach past that pokes up through the belt.
    expect(MOTOR_TEETH).toBeLessThanOrEqual(HEAD_TEETH);
    const motor = createConveyorPreset().gears[0];
    const motorTipRadius = (motor.module * motor.teeth) / 2 + motor.module;
    expect(BELT_Y + motorTipRadius).toBeLessThanOrEqual(BELT_Y + HEAD_R);
  });

  it("forms a real coincident coupling and a real belt edge via the real buildEdges", () => {
    const layout = createConveyorPreset();
    const [motor, head, tail] = layout.gears;

    const coupling = evaluatePair(motor, head);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");

    // A belt is declared, not derived from geometry -- so check the edge buildEdges makes.
    const belt = buildEdges(layout.gears, layout.remoteLinks).find((e) => e.kind === "belt")!;
    expect(belt).toBeDefined();
    expect(new Set([belt.a, belt.b])).toEqual(new Set([head.id, tail.id]));
    expect(belt.ratio).toBeCloseTo(1, 12);
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createConveyorPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("runs both pulleys at exactly the same speed and direction, as a real belt forces", () => {
    let layout = createConveyorPreset();
    for (let i = 0; i < 400; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const head = layout.gears.find((g) => g.id === HEAD_ID)!;
      const tail = layout.gears.find((g) => g.id === TAIL_ID)!;
      // Same sign AND magnitude -- a belt that ran its ends at different rim speeds would
      // have to stretch.
      expect(tail.angularVelocity).toBeCloseTo(head.angularVelocity, 12);
      expect(Math.abs(head.angularVelocity)).toBe(MOTOR_SPEED);
      expect(head.broken).toBe(false);
      expect(tail.broken).toBe(false);
    }
  });

  it("derives the stroke so the LAST parcel stops exactly at the slab edge, never past it", () => {
    // The old body of this test opened with `expect(CARRY_STROKE * HEAD_R).toBeCloseTo(
    // CARRY_TRAVEL)`. CARRY_STROKE is DEFINED as CARRY_TRAVEL / HEAD_R, so HEAD_R cancels and
    // the assertion holds for every stroke and every radius -- exactly the way the 1/2 cancelled
    // in the old J = m*r^2/2 ratio test. Setting CARRY_TRAVEL to 5 left it passing.
    //
    // What the stroke is actually FOR is the thing now measured: the trailing parcel is the one
    // nearest the tail, so it is the one that would be tipped off the end first, and the stroke
    // is derived from ITS start position for that reason. Run the belt to the end of its stroke
    // and the trailing parcel must come to rest exactly on RUN_MIN_Z -- the slab edge -- having
    // never gone beyond it.
    let layout = createConveyorPreset();
    const head = () => layout.gears.find((g) => g.id === HEAD_ID)!;
    const trailingZ = () => parcelStartZ(PARCEL_COUNT - 1) - head().rotation * HEAD_R;

    let lowest = trailingZ();
    for (let i = 0; i < 60 * 20; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears };
      lowest = Math.min(lowest, trailingZ());
    }

    // It reaches the edge -- and overshoots it by exactly one tick's worth of belt, because
    // `reverseAt` is a discrete check that flips the drive on the step AFTER the bound is
    // crossed. At this belt speed that is 0.067 units, well under a millimetre at this scale
    // (one world unit is one centimetre). Asserting an exact landing would be asserting a
    // continuous reverser the simulation does not have; asserting a loose bound would let a
    // genuinely wrong stroke through. So: within one tick, and no further.
    const perTick = Math.abs(head().angularVelocity) * HEAD_R * (1 / 60);
    expect(perTick).toBeGreaterThan(0);
    expect(lowest).toBeLessThanOrEqual(RUN_MIN_Z); // it really does reach the edge
    expect(lowest).toBeGreaterThan(RUN_MIN_Z - perTick * 1.001); // and stops within a frame of it
    // The reverser is what stops it there, so the stroke and the reversal must agree.
    expect(layout.gears[0].reverseAt).toEqual([0, CARRY_STROKE]);
  });

  // NOTE: this checks the SHARED belt travel only -- that it runs out, comes back, and never
  // escapes [0, CARRY_TRAVEL]. Whether each individual crate stays on the slab is a separate
  // question about where the crates START, pinned in the createConveyorProps suite below.
  it("runs the belt travel out and back, never past its bounds", () => {
    let layout = createConveyorPreset();
    const carryAt = (rot: number) => Math.min(Math.max(rot * HEAD_R, 0), CARRY_TRAVEL);
    let min = Infinity;
    let max = -Infinity;
    let sawForward = false;
    let sawBack = false;
    let previous = 0;

    for (let i = 0; i < 7200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const carry = carryAt(layout.gears.find((g) => g.id === HEAD_ID)!.rotation);
      if (carry > previous) sawForward = true;
      if (carry < previous) sawBack = true;
      previous = carry;
      min = Math.min(min, carry);
      max = Math.max(max, carry);
    }

    expect(sawForward).toBe(true);
    expect(sawBack).toBe(true);
    expect(max).toBeGreaterThan(CARRY_TRAVEL - 0.2);
    expect(max).toBeLessThanOrEqual(CARRY_TRAVEL + 0.01);
    expect(min).toBeGreaterThanOrEqual(-0.01);
    expect(min).toBeLessThan(0.2);
  });
});

describe("createConveyorProps", () => {
  it("rides every parcel on the head pulley's belt travel, bounded to the run", () => {
    const parcels = createConveyorProps().filter((p) => p.windWith);
    expect(parcels.length).toBe(PARCEL_COUNT);
    for (const p of parcels) {
      expect(p.windWith!.gear).toBe(HEAD_ID);
      expect(p.windWith!.radius).toBe(HEAD_R);
      expect(p.windWith!.direction).toEqual([0, 0, -1]); // head toward tail
      expect(p.windWith!.travel).toEqual([0, CARRY_TRAVEL]);
    }
  });

  it("keeps EVERY parcel fully on the belt slab across the whole stroke", () => {
    // The bug this pins: all parcels share one stroke, but they start at different points, so
    // a stroke sized for the LEADING crate carries the trailing ones clean off the tail end
    // and leaves them hanging in mid-air. Checked against the real prop data (position, size
    // and windWith), not against the constants alone, and at BOTH ends of the travel.
    const parcels = createConveyorProps().filter((p) => p.windWith);
    expect(parcels.length).toBe(PARCEL_COUNT);
    for (const p of parcels) {
      const halfLength = (p as { size: [number, number, number] }).size[2] / 2;
      const [lo, hi] = p.windWith!.travel;
      const dirZ = p.windWith!.direction[2];
      for (const lift of [lo, hi]) {
        const centreZ = p.position[2] + dirZ * lift;
        expect(centreZ - halfLength).toBeGreaterThanOrEqual(TAIL_Z);
        expect(centreZ + halfLength).toBeLessThanOrEqual(HEAD_Z);
      }
    }
  });

  it("uses the whole belt: the trailing crate reaches the tail end at full stroke", () => {
    // The other half of the previous test -- without this, shrinking the stroke to zero would
    // also "keep every parcel on the slab".
    const trailing = parcelStartZ(PARCEL_COUNT - 1) - CARRY_TRAVEL;
    expect(trailing - PARCEL_LENGTH / 2).toBeCloseTo(TAIL_Z, 12);
  });

  it("spreads the parcels along the run instead of stacking them at one spot", () => {
    const zs = new Set<number>();
    for (let i = 0; i < PARCEL_COUNT; i++) zs.add(Number(parcelStartZ(i).toFixed(6)));
    expect(zs.size).toBe(PARCEL_COUNT);
  });

  it("puts bars on BOTH pulleys so their rotation is visible", () => {
    const props = createConveyorProps();
    // A bare pulley disc is rotationally symmetric -- without these it would look motionless.
    expect(props.filter((p) => p.attachTo === HEAD_ID).length).toBeGreaterThanOrEqual(4);
    expect(props.filter((p) => p.attachTo === TAIL_ID).length).toBeGreaterThanOrEqual(4);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createConveyorPreset().gears.map((g) => g.id));
    for (const p of createConveyorProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the belt, steelwork and crates their real finishes", () => {
    const used = new Set(createConveyorProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["fabric", "metal", "wood"]) expect(used.has(kind as never)).toBe(true);
  });
});
