import { describe, it, expect } from "vitest";
import {
  createClockTowerPreset,
  createClockTowerProps,
  DRIVE_ID,
  MINUTE_ID,
  IDLER_ID,
  HOUR_ID,
  DRIVE_R,
  MINUTE_R,
  IDLER_R,
  HOUR_R,
  DRIVE_MESH_DISTANCE,
  MINUTE_IDLER_DISTANCE,
  IDLER_HOUR_DISTANCE,
  MINUTE_TO_HOUR,
  DRIVE_SPEED,
  PENDULUM_ID,
  BOB_ID,
  PENDULUM_SWING,
  PENDULUM_SPEED,
  PENDULUM_LENGTH,
} from "../../../src/sim/presets/clocktower";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

const byId = (gears: ReturnType<typeof createClockTowerPreset>["gears"], id: string) =>
  gears.find((g) => g.id === id)!;

describe("createClockTowerPreset", () => {
  it("builds a four-wheel going train, all on one axis behind the dial", () => {
    const layout = createClockTowerPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([DRIVE_ID, MINUTE_ID, IDLER_ID, HOUR_ID, PENDULUM_ID, BOB_ID]);
    expect(layout.remoteLinks).toEqual([]);
    for (const g of layout.gears) expect(g.axis).toEqual([0, 0, 1]); // dial-facing wheels
    // The going train stacks on one vertical line; the pendulum pivot sits out in front of it.
    for (const id of [DRIVE_ID, MINUTE_ID, IDLER_ID, HOUR_ID]) {
      expect(byId(layout.gears, id).position[0]).toBe(0);
      expect(byId(layout.gears, id).position[2]).toBe(0);
    }
    // Two cranks: the going train's drive wheel, and the pendulum's own rocking pivot.
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(2);
  });

  it("stacks all three meshes at exactly their summed pitch radii", () => {
    const g = createClockTowerPreset().gears;
    expect(DRIVE_R + MINUTE_R).toBe(DRIVE_MESH_DISTANCE);
    expect(MINUTE_R + IDLER_R).toBe(MINUTE_IDLER_DISTANCE);
    expect(IDLER_R + HOUR_R).toBe(IDLER_HOUR_DISTANCE);

    const gap = (a: string, b: string) => Math.abs(byId(g, a).position[1] - byId(g, b).position[1]);
    expect(gap(DRIVE_ID, MINUTE_ID)).toBeCloseTo(DRIVE_MESH_DISTANCE, 10);
    expect(gap(MINUTE_ID, IDLER_ID)).toBeCloseTo(MINUTE_IDLER_DISTANCE, 10);
    expect(gap(IDLER_ID, HOUR_ID)).toBeCloseTo(IDLER_HOUR_DISTANCE, 10);
  });

  it("forms all three tooth meshes via the real evaluatePair", () => {
    const g = createClockTowerPreset().gears;
    for (const [a, b] of [
      [DRIVE_ID, MINUTE_ID],
      [MINUTE_ID, IDLER_ID],
      [IDLER_ID, HOUR_ID],
    ] as const) {
      const edge = evaluatePair(byId(g, a), byId(g, b));
      expect(edge, `${a} <-> ${b}`).not.toBeNull();
      expect(edge!.kind).toBe("mesh");
    }
    // Non-neighbours must NOT engage.
    expect(evaluatePair(byId(g, DRIVE_ID), byId(g, HOUR_ID))).toBeNull();
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createClockTowerPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("couples the bob to the pivot so the pendulum is part of the graph, not a lone crank", () => {
    const layout = createClockTowerPreset();
    const pivot = byId(layout.gears, PENDULUM_ID);
    const bob = byId(layout.gears, BOB_ID);
    expect(bob.type).toBe("load");
    expect(bob.position).toEqual(pivot.position);
    expect(bob.axis).toEqual(pivot.axis);
    const edge = evaluatePair(pivot, bob);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("turns the hour wheel at exactly 1/4 the minute wheel, in the SAME direction", () => {
    let layout = createClockTowerPreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      const minute = byId(layout.gears, MINUTE_ID);
      const hour = byId(layout.gears, HOUR_ID);
      expect(byId(layout.gears, DRIVE_ID).angularVelocity).toBe(DRIVE_SPEED);
      expect(hour.angularVelocity).toBeCloseTo(MINUTE_TO_HOUR * minute.angularVelocity, 12);
      // The idler's second reversal is the whole point: without it the hands would sweep
      // opposite ways -- right ratio, visibly wrong clock.
      expect(Math.sign(hour.angularVelocity)).toBe(Math.sign(minute.angularVelocity));
      expect(minute.broken).toBe(false);
    }
    // Both hands' wheels really turned.
    for (const id of [MINUTE_ID, HOUR_ID]) {
      expect(Math.abs(byId(layout.gears, id).rotation)).toBeGreaterThan(0);
    }
  });
});

describe("createClockTowerProps", () => {
  it("hangs the two hands on DIFFERENT wheels, so they sweep at genuinely different rates", () => {
    const props = createClockTowerProps();
    const minuteHand = props.filter((p) => p.attachTo === MINUTE_ID);
    const hourHand = props.filter((p) => p.attachTo === HOUR_ID);
    expect(minuteHand.length).toBeGreaterThan(0);
    expect(hourHand.length).toBeGreaterThan(0);
    // Faking both hands onto one gear would make them move together -- the exact bug this
    // preset exists to avoid.
    expect(new Set(props.filter((p) => p.attachTo).map((p) => p.attachTo)).size).toBeGreaterThanOrEqual(2);
  });

  it("swings the pendulum about its own pivot, rather than sliding it sideways", () => {
    const props = createClockTowerProps();
    const pendulum = props.filter((p) => p.attachTo === PENDULUM_ID);
    expect(pendulum.length).toBe(2); // the rod and the bob

    // A crank-slider (linkTo) was the wrong tool here: it produces straight-line motion, so the
    // pendulum slid sideways instead of swinging. Nothing in this preset should use it.
    expect(props.filter((p) => p.linkTo)).toHaveLength(0);

    // Both members hang BELOW the pivot, which is what makes them swing about it.
    const pivot = createClockTowerPreset().gears.find((g) => g.id === PENDULUM_ID)!;
    for (const p of pendulum) expect(p.position[1]).toBeLessThan(pivot.position[1]);
  });

  it("rocks the pivot back and forth over its swing bound instead of turning through", () => {
    let layout = createClockTowerPreset();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 3600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const rot = byId(layout.gears, PENDULUM_ID).rotation;
      min = Math.min(min, rot);
      max = Math.max(max, rot);
    }
    // It really oscillates -- and never runs away past its swing, which is exactly what would
    // happen to a pendulum modelled as an ordinary continuously-turning crank.
    expect(max).toBeGreaterThan(PENDULUM_SWING - 0.05);
    expect(max).toBeLessThan(PENDULUM_SWING + 0.05);
    expect(min).toBeLessThan(-PENDULUM_SWING + 0.05);
    expect(min).toBeGreaterThan(-PENDULUM_SWING - 0.05);
    expect(Math.abs(byId(layout.gears, PENDULUM_ID).angularVelocity)).toBe(PENDULUM_SPEED);
    expect(PENDULUM_LENGTH).toBeGreaterThan(0);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createClockTowerPreset().gears.map((g) => g.id));
    for (const p of createClockTowerProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the masonry, roof tiles and brass movement their real finishes", () => {
    const used = new Set(createClockTowerProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["brick", "stone", "tile", "metal"]) expect(used.has(kind as never)).toBe(true);
  });
});
