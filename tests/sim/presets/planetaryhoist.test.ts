import { describe, it, expect } from "vitest";
import * as P from "../../../src/sim/presets/planetaryhoist";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

const preset = () => P.createPlanetaryHoistPreset();
const gearById = (id: string) => preset().gears.find((g) => g.id === id)!;

describe("createPlanetaryHoistPreset", () => {
  it("builds the whole train with unique ids and exactly one crank", () => {
    const layout = preset();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(1);
    for (const id of [P.MOTOR_ID, P.HELICAL_ID, P.PLANETARY_ID, P.BULL_ID, P.DRUM_ID]) {
      expect(ids).toContain(id);
    }
  });

  it("keeps every meshing wheel on ONE module, so the teeth are the same SIZE", () => {
    // evaluatePair never checks module -- it only asks whether the centres sit
    // pitchRadius(a) + pitchRadius(b) apart. A mixed-module mesh therefore yields a perfectly
    // happy sim edge and a rendered pair whose teeth could not engage on any real shaft.
    const layout = preset();
    const byId = new Map(layout.gears.map((g) => [g.id, g]));
    const meshes = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "mesh");
    expect(meshes.length).toBeGreaterThan(3);
    for (const e of meshes) {
      expect(byId.get(e.a)!.module, `${e.a} <-> ${e.b}`).toBe(P.HOIST_MODULE);
      expect(byId.get(e.b)!.module, `${e.a} <-> ${e.b}`).toBe(P.HOIST_MODULE);
    }
  });

  it("sits every declared mesh at exactly the summed pitch radii", () => {
    const pairs: Array<[string, string, number]> = [
      [P.MOTOR_ID, P.HELICAL_ID, P.MOTOR_HELICAL_DISTANCE],
      [P.HELICAL_ID, P.PLANETARY_ID, P.HELICAL_PLANETARY_DISTANCE],
      [P.PLANETARY_ID, P.IDLER_ID, P.PLANETARY_IDLER_DISTANCE],
      [P.IDLER_ID, P.BULL_ID, P.IDLER_BULL_DISTANCE],
      [P.PLANETARY_ID, P.AUX_ID, P.PLANETARY_AUX_DISTANCE],
      [P.AUX_ID, P.GOVERNOR_ID, P.AUX_GOVERNOR_DISTANCE],
      [P.BULL_ID, P.RATCHET_ID, P.BULL_RATCHET_DISTANCE],
      [P.BULL_ID, P.COUNTER_ID, P.BULL_COUNTER_DISTANCE],
    ];
    for (const [a, b, expected] of pairs) {
      const ga = gearById(a);
      const gb = gearById(b);
      const d = Math.hypot(
        ga.position[0] - gb.position[0],
        ga.position[1] - gb.position[1],
        ga.position[2] - gb.position[2],
      );
      expect(d, `${a} <-> ${b}`).toBeCloseTo(expected, 9);
      const edge = evaluatePair(ga, gb);
      expect(edge, `${a} <-> ${b}`).not.toBeNull();
      expect(edge!.kind).toBe("mesh");
    }
  });

  it("keys the drum straight onto the bull wheel -- a coincident 1:1 coupling", () => {
    const bull = gearById(P.BULL_ID);
    const drum = gearById(P.DRUM_ID);
    expect(drum.position).toEqual(bull.position);
    const edge = evaluatePair(bull, drum);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
  });

  it("reports zero diagnostics problems across all twelve gears", () => {
    const layout = preset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("reduces motor to drum by exactly the product of its stages, across hundreds of ticks", () => {
    // The claim the doc makes, checked end to end rather than stage by stage on paper:
    // (12/24) * (24/72) * (72/16) * (16/96) = 0.125.
    expect(P.MOTOR_TO_DRUM).toBeCloseTo(
      P.MOTOR_TO_HELICAL * P.HELICAL_TO_PLANETARY * P.PLANETARY_TO_IDLER * P.IDLER_TO_BULL,
      12,
    );

    let layout = preset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const motor = layout.gears.find((g) => g.id === P.MOTOR_ID)!;
      const drum = layout.gears.find((g) => g.id === P.DRUM_ID)!;
      const bull = layout.gears.find((g) => g.id === P.BULL_ID)!;
      expect(Math.abs(motor.angularVelocity)).toBeCloseTo(P.MOTOR_SPEED, 12);
      expect(Math.abs(drum.angularVelocity)).toBeCloseTo(P.MOTOR_SPEED * P.MOTOR_TO_DRUM, 12);
      expect(drum.angularVelocity).toBe(bull.angularVelocity); // keyed to the same shaft
    }
  });

  it("raises AND lowers the hook over exactly [0, HOOK_TRAVEL], forever", () => {
    let layout = preset();
    const liftAt = (drumRotation: number) =>
      Math.min(Math.max(drumRotation * P.ROPE_RADIUS, 0), P.HOOK_TRAVEL);
    let min = Infinity;
    let max = -Infinity;
    let up = false;
    let down = false;
    let previous = 0;
    for (let i = 0; i < 60 * 200; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const lift = liftAt(Math.abs(layout.gears.find((g) => g.id === P.DRUM_ID)!.rotation));
      if (lift > previous) up = true;
      if (lift < previous) down = true;
      previous = lift;
      min = Math.min(min, lift);
      max = Math.max(max, lift);
    }
    expect(up).toBe(true);
    expect(down).toBe(true);
    expect(max).toBeGreaterThan(P.HOOK_TRAVEL - 0.5);
    expect(max).toBeLessThanOrEqual(P.HOOK_TRAVEL + 0.01);
    expect(min).toBeGreaterThanOrEqual(-0.01);
  });

  it("derives the motor's reversing stroke from the hook's travel rather than guessing it", () => {
    expect(P.LIFT_PER_MOTOR_RADIAN).toBeCloseTo(P.MOTOR_TO_DRUM * P.ROPE_RADIUS, 12);
    expect(P.MOTOR_REVERSE_AT[1] * P.LIFT_PER_MOTOR_RADIAN).toBeCloseTo(P.HOOK_TRAVEL, 9);
    expect(gearById(P.MOTOR_ID).reverseAt).toEqual(P.MOTOR_REVERSE_AT);
  });
});

describe("createPlanetaryHoistProps", () => {
  it("points every moving prop at a gear that actually exists", () => {
    const ids = new Set(preset().gears.map((g) => g.id));
    for (const p of P.createPlanetaryHoistProps()) {
      for (const t of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (t) expect(ids.has(t), String(t)).toBe(true);
      }
    }
  });

  it("puts asymmetric parts on the rotating bodies, so the reduction is actually visible", () => {
    // A bare drum, ring and bull wheel are all rotationally symmetric: spun about their own
    // axes they show nothing at all. The carrier arms, rope ribs and bolts are the motion.
    const props = P.createPlanetaryHoistProps();
    const spinning = props.filter((p) => p.attachTo);
    expect(spinning.length).toBeGreaterThan(10);
    expect(new Set(spinning.map((p) => p.attachTo)).size).toBeGreaterThanOrEqual(3);
  });

  it("hoists the hook and its crate on the drum's rope, bounded to the travel", () => {
    const hoisted = P.createPlanetaryHoistProps().filter((p) => p.windWith);
    expect(hoisted.length).toBeGreaterThanOrEqual(2);
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(P.DRUM_ID);
      expect(p.windWith!.travel[1] - p.windWith!.travel[0]).toBeCloseTo(P.HOOK_TRAVEL, 9);
    }
  });

  it("gives the steelwork, masonry and timber their real finishes", () => {
    const used = new Set(P.createPlanetaryHoistProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["metal", "stone", "wood"]) expect(used.has(kind as never)).toBe(true);
  });
});
