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
  parcelStartZ,
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

  it("derives the stroke so parcels ride exactly the full run", () => {
    expect(CARRY_STROKE * HEAD_R).toBeCloseTo(CARRY_TRAVEL, 12);
    expect(createConveyorPreset().gears[0].reverseAt).toEqual([0, CARRY_STROKE]);
  });

  it("carries parcels the full length and back, never off the end of the belt", () => {
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
