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
  PENDULUM_CRANK_R,
  PENDULUM_ROD_L,
} from "../../../src/sim/presets/clocktower";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

const byId = (gears: ReturnType<typeof createClockTowerPreset>["gears"], id: string) =>
  gears.find((g) => g.id === id)!;

describe("createClockTowerPreset", () => {
  it("builds a four-wheel going train, all on one axis behind the dial", () => {
    const layout = createClockTowerPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([DRIVE_ID, MINUTE_ID, IDLER_ID, HOUR_ID]);
    expect(layout.remoteLinks).toEqual([]);
    for (const g of layout.gears) {
      expect(g.axis).toEqual([0, 0, 1]); // dial-facing wheels
      expect(g.position[0]).toBe(0);
      expect(g.position[2]).toBe(0);
    }
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(1);
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

  it("swings the pendulum on a closable crank-slider linkage", () => {
    const linked = createClockTowerProps().filter((p) => p.linkTo);
    expect(linked.length).toBe(2); // the rod and the bob
    const roles = new Set(linked.map((p) => p.linkTo!.role));
    expect(roles.has("rod")).toBe(true);
    expect(roles.has("slider")).toBe(true);

    const gearIds = new Set(createClockTowerPreset().gears.map((g) => g.id));
    for (const p of linked) {
      expect(gearIds.has(p.linkTo!.gear)).toBe(true);
      // A rod shorter than the crank throw could never close the linkage: the solver would
      // clamp its discriminant and the pendulum would collapse instead of swinging.
      expect(p.linkTo!.rodLength).toBeGreaterThan(p.linkTo!.crankRadius);
    }
    expect(PENDULUM_ROD_L).toBeGreaterThan(PENDULUM_CRANK_R);
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
