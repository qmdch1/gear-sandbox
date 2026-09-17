import { describe, it, expect } from "vitest";
import { createClockPreset, createClockProps, HOUR_R } from "../../../src/sim/presets/clock";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createClockProps", () => {
  it("supplies a clock hand (and hub) attached to the hour wheel, so a moving hand sweeps the dial", () => {
    // Counting attached props and asking for "at least 2" -- which is all this used to do --
    // leaves every individual attachment free to break, because THREE props carry it. Measured:
    // deleting the long pointer's `attachTo` passed; re-pointing it at the idler (whose centre
    // is 66 units away, so the hand would orbit right off the dial at twelve times the speed)
    // passed; and attaching all twelve tick marks to the hour wheel, so the dial turns with the
    // hand and the clock can never show a different time, passed too.
    const layout = createClockPreset();
    const gearIds = new Set(layout.gears.map((g) => g.id));
    const props = createClockProps();
    const attached = props.filter((p) => p.attachTo);

    // Everything that moves hangs off the hour wheel, and that gear exists.
    for (const p of attached) {
      expect(p.attachTo).toBe("시계_시침휠");
      expect(gearIds.has(p.attachTo!)).toBe(true);
    }

    // The POINTER specifically -- the longest attached box, and the only part of this clock
    // anyone reads -- is one of them. Identified by length rather than by index so reordering
    // the props cannot quietly retarget the check.
    const boxes = attached.filter((p) => p.kind === "box") as Array<
      Extract<(typeof props)[number], { kind: "box" }>
    >;
    expect(boxes.length).toBeGreaterThanOrEqual(2); // pointer + counterweight tail
    const pointer = boxes.reduce((a, b) => (a.size[0] >= b.size[0] ? a : b));
    expect(pointer.attachTo).toBe("시계_시침휠");
    expect(pointer.size[0]).toBeGreaterThan(HOUR_R); // it really does reach out over the dial

    // And the DIAL stays still. Not "some prop is unattached" -- every tick mark and the bezel
    // must be static, or the face turns with the hand and the clock reads the same forever.
    const staticParts = props.filter((p) => !p.attachTo);
    expect(staticParts.length).toBeGreaterThanOrEqual(12); // twelve hour marks, at least
    expect(staticParts.length).toBeGreaterThan(attached.length);
  });

  it("stops the hand at the hour marks instead of driving it into the bezel", () => {
    // The bezel is a TORUS, so "inside the bezel" is not a comparison against its radius: the
    // brass occupies everything within `tube` of the centreline circle. The hand used to be
    // HOUR_R + 1.5*S long, which put its tip 0.74 units inside that material at the hand's
    // lowest edge -- while the constant's comment said it reached "just inside the bezel".
    // Same class as the windmill sails drawn inside the tower.
    const props = createClockProps();
    const ring = props.find((p) => p.kind === "ring") as Extract<
      (typeof props)[number],
      { kind: "ring" }
    >;
    const boxes = props.filter((p) => p.attachTo && p.kind === "box") as Array<
      Extract<(typeof props)[number], { kind: "box" }>
    >;
    const pointer = boxes.reduce((a, b) => (a.size[0] >= b.size[0] ? a : b));

    // Radius of the tip, measured from the dial's own centre rather than from the world origin.
    const tipR = pointer.position[0] + pointer.size[0] / 2 - ring.position[0];
    const lo = pointer.position[1] - pointer.size[1] / 2;
    const hi = pointer.position[1] + pointer.size[1] / 2;

    // Distance from the tip to the torus centreline, at whichever edge of the hand comes
    // closest to it. Outside the tube means clear brass.
    const gap = Math.min(
      ...[lo, hi].map((y) => Math.hypot(tipR - ring.radius, y - ring.position[1])),
    );
    expect(gap).toBeGreaterThan(ring.tube);

    // ...and it still reaches out far enough to point at something.
    expect(tipR).toBeGreaterThan(HOUR_R);
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
    expect(hour.module).toBe(1);
    expect(hour.position).toEqual([77, 0, 0]);
    expect((hour.module * hour.teeth) / 2).toBe(60); // pitchRadius = 60
  });

  it("cuts every wheel at ONE module, so the teeth are the same SIZE and could really engage", () => {
    // This preset used to mesh a module-1 idler against a module-0.2 hour wheel. The radii summed
    // to the centre distance so evaluatePair returned a perfectly happy edge -- but module IS
    // tooth size, so the pair was drawn with teeth five times different and could not engage on
    // any real shaft. evaluatePair never compares module, so nothing but this assertion catches it.
    const layout = createClockPreset();
    const byId = new Map(layout.gears.map((g) => [g.id, g]));
    const meshes = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "mesh");
    expect(meshes.length).toBe(2);
    for (const e of meshes) {
      expect(byId.get(e.a)!.module, `${e.a} <-> ${e.b}`).toBe(1);
      expect(byId.get(e.b)!.module, `${e.a} <-> ${e.b}`).toBe(1);
    }
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
