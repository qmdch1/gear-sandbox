import { describe, it, expect } from "vitest";
import {
  createWellPumpPreset,
  createWellPumpProps,
  HANDLE_ID,
  DRUM_ID,
  HANDLE_SPEED,
  ROPE_RADIUS,
  BUCKET_TRAVEL,
  STROKE,
} from "../../../src/sim/presets/wellpump";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { Prop } from "../../../src/render/props";

type CylinderProp = Extract<Prop, { kind: "cylinder" }>;
type RingProp = Extract<Prop, { kind: "ring" }>;

const liftAt = (drumRotation: number) =>
  Math.min(Math.max(drumRotation * ROPE_RADIUS, 0), BUCKET_TRAVEL);

describe("createWellPumpPreset", () => {
  it("builds a handle and the windlass drum keyed onto the same axle", () => {
    const layout = createWellPumpPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([HANDLE_ID, DRUM_ID]);
    expect(layout.remoteLinks).toEqual([]);

    const [handle, drum] = layout.gears;
    expect(handle.type).toBe("crank");
    expect(drum.type).toBe("pulley");
    // Coincident: same position AND axis, which is how a windlass barrel sits on its handle.
    expect(drum.position).toEqual(handle.position);
    expect(drum.axis).toEqual(handle.axis);
    expect(handle.axis).toEqual([1, 0, 0]); // upright handle you stand beside and crank
  });

  it("forms a real 1:1 coincident coupling via the real evaluatePair -- no ratio claimed", () => {
    const [handle, drum] = createWellPumpPreset().gears;
    const edge = evaluatePair(handle, drum);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createWellPumpPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("derives the stroke so the bucket sweeps exactly its full travel", () => {
    expect(createWellPumpPreset().gears[0].reverseAt).toEqual([0, STROKE]);
  });

  it("raises AND lowers the bucket over exactly [0, BUCKET_TRAVEL], forever", () => {
    let layout = createWellPumpPreset();
    let min = Infinity;
    let max = -Infinity;
    let sawUp = false;
    let sawDown = false;
    let previous = 0;

    // 120 simulated seconds -- many full draw-and-lower cycles. Unbounded, the drum would just
    // keep winding and the bucket would climb out through the roof.
    for (let i = 0; i < 7200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const drum = layout.gears.find((g) => g.id === DRUM_ID)!;
      const lift = liftAt(drum.rotation);
      if (lift > previous) sawUp = true;
      if (lift < previous) sawDown = true;
      previous = lift;
      min = Math.min(min, lift);
      max = Math.max(max, lift);
    }

    expect(sawUp).toBe(true);
    expect(sawDown).toBe(true);
    expect(max).toBeGreaterThan(BUCKET_TRAVEL - 0.2);
    expect(max).toBeLessThanOrEqual(BUCKET_TRAVEL + 0.01);
    expect(min).toBeGreaterThanOrEqual(-0.01);
    expect(min).toBeLessThan(0.2);

    // The handle never stops or changes speed -- it only ever changes direction.
    const handle = layout.gears.find((g) => g.id === HANDLE_ID)!;
    expect(Math.abs(handle.angularVelocity)).toBe(HANDLE_SPEED);
  });

  it("turns the drum at exactly the handle's speed -- a coupling never changes it", () => {
    let layout = createWellPumpPreset();
    // Four full strokes, so the run crosses several reversals. The previous version of this
    // test stopped at 300 ticks -- the first reversal lands at tick 606 -- so it asserted the
    // easy half of the claim and never saw the interesting tick.
    const ticksPerStroke = Math.ceil((STROKE / HANDLE_SPEED) * 60);
    let previousHandleVelocity = createWellPumpPreset().gears[0].angularVelocity;
    let reversalsSeen = 0;

    for (let i = 0; i < ticksPerStroke * 4; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const handle = layout.gears.find((g) => g.id === HANDLE_ID)!;
      const drum = layout.gears.find((g) => g.id === DRUM_ID)!;
      expect(drum.broken).toBe(false);
      // The claim that actually matters for a barrel keyed onto its handle: the two shafts
      // stand at exactly the same angle, forever, reversals included. Both integrate the same
      // propagated velocity each tick, so this is bit-for-bit equality, not an approximation.
      expect(drum.rotation).toBe(handle.rotation);
      expect(Math.abs(drum.angularVelocity)).toBe(HANDLE_SPEED);

      // Their STORED velocities agree too, except on the single tick a reversal lands on: the
      // crank flips its own commanded velocity at the end of that tick (simulation.ts's
      // `reverseAt` block) while the drum still carries the velocity it was actually driven
      // at, and the drum picks up the new sign on the very next tick. That one-tick lag is the
      // engine's, not this preset's, and it never reaches `rotation` -- hence the strict
      // equality above and this exemption here.
      const reversedThisTick = handle.angularVelocity !== previousHandleVelocity;
      if (reversedThisTick) reversalsSeen++;
      else expect(drum.angularVelocity).toBe(handle.angularVelocity);
      previousHandleVelocity = handle.angularVelocity;
    }

    expect(reversalsSeen).toBeGreaterThanOrEqual(3); // the run really did cross reversals
  });
});

describe("createWellPumpProps", () => {
  it("hoists the bucket and its hoop on the drum's rope, bounded by the windlass", () => {
    const hoisted = createWellPumpProps().filter((p) => p.windWith);
    expect(hoisted.length).toBe(2); // the bucket and its iron hoop travel together
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(DRUM_ID);
      expect(p.windWith!.radius).toBe(ROPE_RADIUS);
      expect(p.windWith!.direction).toEqual([0, 1, 0]);
      expect(p.windWith!.travel).toEqual([0, BUCKET_TRAVEL]);
    }
  });

  it("stops the raised bucket clear of the windlass barrel instead of inside it", () => {
    const props = createWellPumpProps();
    const cylinders = props.filter((p): p is CylinderProp => p.kind === "cylinder");
    // The barrel is the cylinder whose radius IS the rope radius; it lies along X (rotated a
    // quarter turn about Z), so its radial extent is what it occupies in Y.
    const barrel = cylinders.find((p) => p.radius === ROPE_RADIUS);
    expect(barrel).toBeDefined();
    const barrelUnderside = barrel!.position[1] - barrel!.radius;

    // The bucket's rim, carried BUCKET_TRAVEL up the rope, must finish below that underside --
    // otherwise the bucket ends every draw buried inside the barrel it hangs from.
    const bucket = cylinders.find((p) => p.windWith);
    expect(bucket).toBeDefined();
    expect(bucket!.position[1] + bucket!.height / 2 + BUCKET_TRAVEL).toBeLessThan(barrelUnderside);

    // ...and so must the iron hoop riding with it (a flat ring, so `tube` is its Y half-extent).
    const hoop = props.filter((p): p is RingProp => p.kind === "ring").find((p) => p.windWith);
    expect(hoop).toBeDefined();
    expect(hoop!.position[1] + hoop!.tube + BUCKET_TRAVEL).toBeLessThan(barrelUnderside);
  });

  it("puts spokes across the barrel so the drum's own rotation is visible", () => {
    // A bare barrel is rotationally symmetric: without these it would look motionless no
    // matter how fast it turned.
    const spokes = createWellPumpProps().filter((p) => p.attachTo === DRUM_ID);
    expect(spokes.length).toBeGreaterThanOrEqual(4);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createWellPumpPreset().gears.map((g) => g.id));
    for (const p of createWellPumpProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the masonry, timber and ironwork their real finishes", () => {
    const used = new Set(createWellPumpProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["stone", "wood", "metal", "rust"]) expect(used.has(kind as never)).toBe(true);
  });
});
