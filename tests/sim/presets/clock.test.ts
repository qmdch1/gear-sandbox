import { describe, it, expect } from "vitest";
import { createClockPreset, createClockProps } from "../../../src/sim/presets/clock";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createClockProps", () => {
  it("supplies a clock hand (and hub) attached to the hour wheel, so a moving hand sweeps the dial", () => {
    const props = createClockProps();
    const handParts = props.filter((p) => p.attachTo === "시계_시침휠");
    // The hand, its counterweight tail, and the centre hub cap all spin with the hour wheel.
    expect(handParts.length).toBeGreaterThanOrEqual(2);
    // The dial (bezel + tick marks) stays static (not attached).
    expect(props.some((p) => p.attachTo === undefined)).toBe(true);
  });
});

describe("createClockPreset", () => {
  it("builds a valid LayoutState: three gears, unique ids, no remote links", () => {
    const layout = createClockPreset();
    expect(layout.gears).toHaveLength(3);
    expect(layout.remoteLinks).toEqual([]);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["시계_분침구동", "시계_아이들러", "시계_시침휠"]);
  });

  it("places the minute drive, idler, and hour wheel at their exact designed pitch radii and positions", () => {
    const layout = createClockPreset();
    const [minute, idler, hour] = layout.gears;
    expect(minute.type).toBe("crank");
    expect(minute.teeth).toBe(10);
    expect(minute.module).toBe(1);
    expect(minute.position).toEqual([0, 0, 0]);
    expect(minute.angularVelocity).toBe(-0.6);

    expect(idler.type).toBe("spur");
    expect(idler.teeth).toBe(12);
    expect(idler.module).toBe(1);
    expect(idler.position).toEqual([11, 0, 0]);

    expect(hour.type).toBe("spur");
    expect(hour.teeth).toBe(120);
    expect(hour.module).toBe(0.2);
    expect(hour.position).toEqual([29, 0, 0]);
    expect((hour.module * hour.teeth) / 2).toBe(12); // pitchRadius = 12
  });

  it("forms real mesh edges (crank<->idler, idler<->hour) via the real evaluatePair", () => {
    const layout = createClockPreset();
    const [minute, idler, hour] = layout.gears;

    const minuteIdler = evaluatePair(minute, idler);
    expect(minuteIdler).not.toBeNull();
    expect(minuteIdler!.kind).toBe("mesh");

    const idlerHour = evaluatePair(idler, hour);
    expect(idlerHour).not.toBeNull();
    expect(idlerHour!.kind).toBe("mesh");

    // The minute drive and hour wheel are far apart and must NOT directly mesh --
    // the whole point of the idler is to sit in between.
    expect(evaluatePair(minute, hour)).toBeNull();
  });

  it("reports zero diagnostics problems -- a simple, fully powered, fully connected 3-gear line", () => {
    const layout = createClockPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("keeps the hour wheel spinning at exactly 1/12 the minute drive's speed, in the SAME direction, sampled across hundreds of ticks", () => {
    let layout = createClockPreset();
    const minuteSpeed = layout.gears[0].angularVelocity; // -0.6, the commanded crank input

    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const minute = layout.gears.find((g) => g.id === "시계_분침구동")!;
      const idler = layout.gears.find((g) => g.id === "시계_아이들러")!;
      const hour = layout.gears.find((g) => g.id === "시계_시침휠")!;

      // The crank's own commanded speed never changes tick to tick.
      expect(minute.angularVelocity).toBe(minuteSpeed);

      // Exact 12:1 ratio, to floating-point precision, at EVERY sampled tick.
      expect(Math.abs(hour.angularVelocity)).toBeCloseTo(Math.abs(minute.angularVelocity) / 12, 12);

      // Same sign as the minute crank -- the whole reason the idler exists (a plain
      // two-gear mesh would reverse it; two reversals cancel back to the original sign).
      expect(Math.sign(hour.angularVelocity)).toBe(Math.sign(minute.angularVelocity));

      // The idler itself must be reversed relative to the minute drive (first reversal) --
      // confirms the "double reversal" story really is two reversals, not zero.
      expect(Math.sign(idler.angularVelocity)).toBe(-Math.sign(minute.angularVelocity));

      expect(minute.broken).toBe(false);
      expect(idler.broken).toBe(false);
      expect(hour.broken).toBe(false);
    }

    // After many ticks, everything has actually turned (not stalled at rotation 0).
    for (const gear of layout.gears) {
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });
});
