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
  PENDULUM_PIVOT,
  SUBDIAL_Y,
  TOWER_MODULE,
  DIAL_Y,
  DIAL_R,
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

describe("createClockTowerPreset -- invariants the doc comment claims", () => {
  it("keeps every meshing wheel on ONE module, so the teeth are the same SIZE and could really engage", () => {
    // `evaluatePair` never checks module -- it only asks whether the centres sit
    // pitchRadius(a) + pitchRadius(b) apart. So a preset that mixes modules across a mesh gets a
    // perfectly happy sim edge and a rendered pair whose teeth are visibly different sizes and
    // could not engage on any real shaft. The doc comment claims this file avoids that; this is
    // the assertion that makes the claim true rather than aspirational.
    const layout = createClockTowerPreset();
    const byId = new Map(layout.gears.map((g) => [g.id, g]));
    const meshes = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "mesh");
    expect(meshes.length).toBeGreaterThan(0);
    for (const e of meshes) {
      expect(byId.get(e.a)!.module, `${e.a} <-> ${e.b}`).toBe(TOWER_MODULE);
      expect(byId.get(e.b)!.module, `${e.a} <-> ${e.b}`).toBe(TOWER_MODULE);
    }
  });

  it("pins each hand's dial to the centre of the wheel that actually drives it", () => {
    // THE BUG THIS GUARDS: `attachTo` sweeps a prop about ITS GEAR'S centre
    // (spinAttachedPose: pos = (base - centre) rotated + centre). An hour hand drawn on the main
    // dial at y = 62 but attached to a wheel at y = 10 does not turn on the dial at all -- it
    // swings a 52-unit circle centred 52 units below it, straight out of the tower. A hand only
    // reads correctly when its dial's centre and its gear's centre coincide.
    const layout = createClockTowerPreset();
    const props = createClockTowerProps();
    const centreOf = (id: string) => layout.gears.find((g) => g.id === id)!.position;

    // The minute hand belongs on the main dial; the hour hand on the sub-dial.
    expect(centreOf(MINUTE_ID)[1]).toBeCloseTo(DIAL_Y, 9);
    expect(centreOf(HOUR_ID)[1]).toBeCloseTo(SUBDIAL_Y, 9);

    // And nothing attached to either wheel is drawn far from that wheel's centre. This is the
    // shape the bug took: the offending hand sat 52 units from its gear, so it swept a 52-unit
    // circle instead of turning on a dial. Everything legitimately attached here -- hands, and
    // the spokes across each wheel -- lives within the dial it is drawn on, so a generous
    // dial-radius ceiling catches the real failure without flagging the spokes.
    for (const id of [MINUTE_ID, HOUR_ID]) {
      const centre = centreOf(id);
      const attached = props.filter((p) => p.attachTo === id);
      expect(attached.length, id).toBeGreaterThan(0);
      for (const a of attached) {
        const offset = Math.hypot(a.position[0] - centre[0], a.position[1] - centre[1]);
        expect(offset, `${id} attached prop offset`).toBeLessThanOrEqual(DIAL_R);
      }
    }
  });

  it("keeps the pendulum cluster clear of every going-train wheel -- overlap floor AND mesh window", () => {
    // The pendulum is a separate cluster and must stay that way. Two dangers, not one: sitting
    // inside another gear's overlap radius (a diagnostics failure), and -- more subtly -- landing
    // in the MESH window, where `evaluatePair` would happily wire it into the going train and
    // change what the clock does.
    const layout = createClockTowerPreset();
    const train = layout.gears.filter((g) => ![PENDULUM_ID, BOB_ID].includes(g.id));
    const pendulum = layout.gears.filter((g) => [PENDULUM_ID, BOB_ID].includes(g.id));

    for (const p of pendulum) {
      expect(p.position[2]).toBe(PENDULUM_PIVOT[2]); // out in front of the wall
      for (const t of train) {
        expect(t.position[2]).toBe(0); // the train is all at z = 0
        const d = Math.hypot(
          p.position[0] - t.position[0],
          p.position[1] - t.position[1],
          p.position[2] - t.position[2],
        );
        // No accidental mesh: evaluatePair only engages near the summed pitch radii, and the
        // z-offset alone puts every pair far outside that window.
        expect(evaluatePair(p, t), `${p.id} <-> ${t.id}`).toBeNull();
        // No overlap either: comfortably past 0.95 * (rA + rB), whose largest case here is the
        // hour wheel.
        expect(d, `${p.id} <-> ${t.id}`).toBeGreaterThan((HOUR_R + 1) * 0.95);
      }
    }
  });
});
