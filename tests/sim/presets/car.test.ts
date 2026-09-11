import { describe, it, expect } from "vitest";
import { createCarPreset, createCarProps , ENGINE_FREE_SPEED, ENGINE_STALL_TORQUE, CAR_VEHICLE_ID, DRIVE_RANGE, TRAVEL_LIMIT } from "../../../src/sim/presets/car";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { LayoutState } from "../../../src/sim/types";

/** Runs the real simulation for `seconds` at 60 Hz and hands back the whole layout. */
function drive(seconds: number, options = {}): LayoutState {
  let layout: LayoutState = createCarPreset();
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const r = tick(layout, 1 / 60, 1, { wear: false, ...options });
    layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
  }
  return layout;
}

const WHEEL_IDS = ["자동차_좌앞바퀴", "자동차_우앞바퀴", "자동차_좌뒷바퀴", "자동차_우뒷바퀴"];

describe("createCarPreset", () => {
  it("builds a valid LayoutState: 6 gears (engine + driveshaft + 4 wheels), unique ids, 4 belt links", () => {
    const layout = createCarPreset();
    expect(layout.gears).toHaveLength(6);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "자동차_엔진",
      "자동차_구동축",
      "자동차_좌앞바퀴",
      "자동차_우앞바퀴",
      "자동차_좌뒷바퀴",
      "자동차_우뒷바퀴",
    ]);

    expect(layout.remoteLinks).toHaveLength(4);
    expect(layout.remoteLinks).toEqual([
      { a: "자동차_구동축", b: "자동차_좌앞바퀴", kind: "belt" },
      { a: "자동차_좌앞바퀴", b: "자동차_우앞바퀴", kind: "belt" },
      { a: "자동차_좌앞바퀴", b: "자동차_좌뒷바퀴", kind: "belt" },
      { a: "자동차_좌뒷바퀴", b: "자동차_우뒷바퀴", kind: "belt" },
    ]);
  });

  it("hides the engine crank at the car centre (coincident with the driveshaft) and stands all four wheels vertically at their corners", () => {
    const layout = createCarPreset();
    const engine = layout.gears.find((g) => g.id === "자동차_엔진")!;
    const driveshaft = layout.gears.find((g) => g.id === "자동차_구동축")!;

    // Engine sits at the car centre [10,8,-10], handle pointing UP (axis [0,1,0]) into the
    // body -- no longer coincident with a wheel, so the crank handle no longer pokes out.
    expect(engine.type).toBe("crank");
    expect(engine.axis).toEqual([0, 1, 0]);
    expect(engine.position).toEqual([10, 8, -10]);
    // At REST, and driven by a motor rather than a commanded speed: a motorised crank's speed
    // is an OUTPUT of the torque balance, so the car has to pull away under its own torque.
    expect(engine.angularVelocity).toBe(0);
    expect(engine.motor).toEqual({ freeSpeed: ENGINE_FREE_SPEED, stallTorque: ENGINE_STALL_TORQUE });

    // Driveshaft is coincident with the engine (same position AND axis) so their coupling
    // forms; it's small (r4) so the hidden centre hub stays clear of the wheels' overlap
    // radius -- its belt to the front-left wheel (r8) is then a 1/2 step-down.
    expect(driveshaft.type).toBe("pulley");
    expect(driveshaft.position).toEqual([10, 8, -10]);
    expect(driveshaft.axis).toEqual([0, 1, 0]);
    expect((driveshaft.module * driveshaft.teeth) / 2).toBe(4);

    const wheels = WHEEL_IDS.map((id) => layout.gears.find((g) => g.id === id)!);
    for (const wheel of wheels) {
      expect(wheel.type).toBe("pulley");
      expect(wheel.axis).toEqual([1, 0, 0]); // vertical, rolling about world X
      expect(wheel.position[1]).toBe(8); // raised so the wheel sits on the ground
      expect((wheel.module * wheel.teeth) / 2).toBe(8); // pitchRadius 8, identical for all 4
    }
  });

  it("supplies a decorative chassis body (createCarProps) -- axle rods, side rails, and a body shell", () => {
    const props = createCarProps();
    expect(props.length).toBeGreaterThan(0);
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds.has("cylinder")).toBe(true);
    expect(kinds.has("box")).toBe(true);
  });

  it("forms a real coincident coupling edge between the engine and the driveshaft via the real evaluatePair", () => {
    const layout = createCarPreset();
    const engine = layout.gears.find((g) => g.id === "자동차_엔진")!;
    const driveshaft = layout.gears.find((g) => g.id === "자동차_구동축")!;

    const edge = evaluatePair(engine, driveshaft);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
    // A coincident coupling is never flagged as an overlap.
    expect(isOverlapping(engine, driveshaft)).toBe(false);
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, no overlaps", () => {
    const layout = createCarPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("keeps all four wheels locked to the SAME speed as each other (half the engine speed via the r4->r8 driveshaft step-down) at every instant, even while the train is still accelerating", () => {
    let layout = createCarPreset();

    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { ...layout, gears: result.gears, vehicles: result.vehicles };

      const engine = layout.gears.find((g) => g.id === "자동차_엔진")!;
      const wheels = WHEEL_IDS.map((id) => layout.gears.find((g) => g.id === id)!);

      // The kinematic constraint is exact at EVERY instant, whatever the engine's own speed is
      // currently doing: a belt does not care that the train behind it is still speeding up.
      // Belt and coupling edges use sign +1 in propagateRotation (never the -1 a tooth mesh
      // gets), so there is no reversal and all four wheels stay locked to each other.
      for (const wheel of wheels) {
        expect(wheel.angularVelocity).toBeCloseTo(engine.angularVelocity * 0.5, 9);
        expect(wheel.angularVelocity).toBeCloseTo(wheels[0].angularVelocity, 9);
      }

      expect(engine.broken).toBe(false);
      for (const wheel of wheels) expect(wheel.broken).toBe(false);
    }

    // After many ticks, everything has actually turned (not stalled at rotation 0).
    for (const gear of layout.gears) {
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });

  it("actually DRIVES: the car travels exactly as far as its wheels have rolled", () => {
    // No-slip is the whole claim. A wheel of radius r turned through theta has rolled r*theta
    // along the ground, so the vehicle's travel is not an independent animation -- it is the
    // wheel's own rotation, and the two can never disagree.
    const layout = drive(1.5);
    const wheel = layout.gears.find((g) => g.id === "자동차_좌앞바퀴")!;
    const car = layout.vehicles![0];
    expect(car.distance).toBeCloseTo(wheel.rotation * 8, 6);
    expect(car.distance).toBeGreaterThan(5); // it has genuinely moved, not twitched
  });

  it("pulls away rather than starting at speed: it is still accelerating after a tenth of a second", () => {
    const early = drive(0.1).vehicles![0].distance;
    const later = drive(0.2).vehicles![0].distance;
    // Travel in the second tenth of a second exceeds travel in the first -- the signature of a
    // mass being accelerated, which a constant-speed animation could never produce.
    expect(later - early).toBeGreaterThan(early);
  });

  it("never moves a single gear: the mechanism keeps the geometry that makes it mesh", () => {
    // A driving car that displaced its own gears would drift out of mesh, and could collide
    // with a neighbouring machine's diagnostics. Travel belongs to the vehicle, not the parts.
    const fresh = createCarPreset();
    const driven = drive(3);
    expect(driven.vehicles![0].distance).not.toBe(0);
    for (let i = 0; i < fresh.gears.length; i++) {
      expect(driven.gears[i].position).toEqual(fresh.gears[i].position);
    }
  });

  it("drives out, brakes against its own momentum, and comes back -- staying inside its patch of ground", () => {
    let layout: LayoutState = createCarPreset();
    let furthest = 0;
    let nearest = 0;
    let reversed = false;
    for (let i = 0; i < 60 * 30; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
      const d = layout.vehicles![0].distance;
      furthest = Math.max(furthest, d);
      nearest = Math.min(nearest, d);
      if (d < furthest - 1) reversed = true;
      // The hard limit is never breached, whichever way it happens to be going.
      expect(Math.abs(d)).toBeLessThanOrEqual(TRAVEL_LIMIT + 1e-9);
    }
    expect(furthest).toBeGreaterThan(DRIVE_RANGE * 0.9); // it really did make the trip out
    expect(reversed).toBe(true); // and really did come back
    expect(nearest).toBeLessThan(0); // overshooting past the start while braking is real momentum
  });

  it("carries its body with it: every chassis prop rides the car", () => {
    const props = createCarProps();
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) expect(prop.ridesOn).toBe(CAR_VEHICLE_ID);
  });
});
