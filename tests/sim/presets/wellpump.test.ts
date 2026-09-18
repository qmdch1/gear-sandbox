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
    // test stopped at 300 ticks -- the first reversal lands at tick 549, measured -- so it
    // asserted the easy half of the claim and never saw the interesting tick. (606 is what this
    // comment used to say; the engine never produces it. STROKE / HANDLE_SPEED * 60 = 548.5,
    // and `simulation.ts` flips at the end of the first tick past the bound, so 549.)
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

    // The bucket's rim, carried up the rope, must finish below that underside -- otherwise the
    // bucket ends every draw buried inside the barrel it hangs from.
    //
    // Measured by RUNNING the machine, not by adding BUCKET_TRAVEL to the rest height. That
    // second form is what this test used to do, and substituting BUCKET_TRAVEL's definition
    // collapses it: BUCKET_REST_Y + BUCKET_H/2 + (DRUM_Y - ROPE_RADIUS - (BUCKET_REST_Y +
    // BUCKET_H/2) - BARREL_CLEARANCE) < DRUM_Y - ROPE_RADIUS is literally BARREL_CLEARANCE > 0,
    // i.e. 1 > 0. No edit to DRUM_Y, ROPE_RADIUS, BUCKET_REST_Y or BUCKET_H could fail it, and
    // the hoop line below cancelled the same way -- which made the preset's own claim that
    // deriving the travel "makes the clash impossible to reintroduce ... and the test pins it"
    // untrue on the second half.
    const bucket = cylinders.find((p) => p.windWith);
    expect(bucket).toBeDefined();

    let layout = createWellPumpPreset();
    let highestLift = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const drum = layout.gears.find((g) => g.id === DRUM_ID)!;
      // What `sceneSync.updateWindingProps` does: clamp(rotation * radius, lo, hi).
      const lo = bucket!.windWith!.travel[0];
      const hi = bucket!.windWith!.travel[1];
      highestLift = Math.max(highestLift, Math.min(Math.max(drum.rotation * bucket!.windWith!.radius, lo), hi));
    }
    expect(highestLift).toBeGreaterThan(0); // it really does rise

    const rimAtTop = bucket!.position[1] + bucket!.height / 2 + highestLift;
    expect(rimAtTop).toBeLessThan(barrelUnderside);

    // ...and so must the iron hoop riding with it (a flat ring, so `tube` is its Y half-extent).
    const hoop = props.filter((p): p is RingProp => p.kind === "ring").find((p) => p.windWith);
    expect(hoop).toBeDefined();
    expect(hoop!.position[1] + hoop!.tube + highestLift).toBeLessThan(barrelUnderside);
  });

  it("carries the windlass on posts under its ends, over an open well mouth", () => {
    // Two separate defects lived here, neither visible to the simulation (the handle and drum
    // are a coincident crank/pulley pair, and props are outside the physics entirely):
    //   - the posts stood at z = +/-WELL_R while the barrel lies along X, so the nearest post
    //     face was 4.0 units of clear air from the barrel and its real ends had nothing under
    //     them. Deleting both posts left all eleven tests here passing.
    //   - the apron was a SOLID cylinder of radius WELL_R + 1.5 spanning y 0..2, paving over
    //     the shaft the bucket hangs down: the bucket's top 0.70 was inside the stone and the
    //     iron hoop lay wholly buried in it.
    const props = createWellPumpProps();
    const barrel = props.find(
      (p): p is Extract<typeof p, { kind: "cylinder" }> => p.kind === "cylinder" && p.radius === ROPE_RADIUS,
    )!;
    const posts = props.filter(
      (p): p is Extract<typeof p, { kind: "box" }> => p.kind === "box" && p.size[1] > 20,
    );
    expect(posts).toHaveLength(2);

    // The barrel lies along X (rotated a quarter turn about Z), so its ends are at +/-height/2
    // in X -- and that is where a post has to be.
    const halfLength = barrel.height / 2;
    for (const post of posts) {
      expect(Math.abs(Math.abs(post.position[0]) - halfLength)).toBeLessThan(1);
      expect(Math.abs(post.position[2])).toBeLessThan(1); // on the barrel's own line, not beside it
    }

    // Nothing solid paves the well mouth: every static part at the bucket's own radius must
    // leave the shaft open.
    const bucket = props.find((p) => p.windWith && p.kind === "cylinder") as Extract<
      (typeof props)[number],
      { kind: "cylinder" }
    >;
    const paving = props.filter(
      (p) => p.kind === "cylinder" && !p.windWith && p.radius > bucket.radius && Math.abs(p.position[1]) < 5,
    );
    expect(paving).toHaveLength(0);
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
