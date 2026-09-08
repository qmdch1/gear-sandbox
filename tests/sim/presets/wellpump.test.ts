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
    expect(STROKE * ROPE_RADIUS).toBeCloseTo(BUCKET_TRAVEL, 12);
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
    for (let i = 0; i < 300; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const handle = layout.gears.find((g) => g.id === HANDLE_ID)!;
      const drum = layout.gears.find((g) => g.id === DRUM_ID)!;
      expect(drum.angularVelocity).toBe(handle.angularVelocity);
      expect(drum.broken).toBe(false);
    }
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
