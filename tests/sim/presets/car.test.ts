import { describe, it, expect } from "vitest";
import { createCarPreset, createCarProps } from "../../../src/sim/presets/car";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

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
    expect(engine.angularVelocity).toBe(-1.0);

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

  it("keeps all four wheels locked to the SAME speed as each other (half the engine speed via the r4->r8 driveshaft step-down), sampled across hundreds of ticks", () => {
    let layout = createCarPreset();
    const engineSpeed = layout.gears[0].angularVelocity; // -1.0, the commanded crank input
    const expectedWheelSpeed = engineSpeed * (4 / 8); // driveshaft r4 -> wheel r8 belt ratio = 0.5

    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const engine = layout.gears.find((g) => g.id === "자동차_엔진")!;
      const wheels = WHEEL_IDS.map((id) => layout.gears.find((g) => g.id === id)!);

      // The crank's own commanded speed never changes tick to tick.
      expect(engine.angularVelocity).toBe(engineSpeed);

      // Every wheel runs at the same half-engine speed, same sign, at EVERY sampled tick --
      // belt/coupling edges use sign +1 in propagateRotation (never the -1 an ordinary tooth
      // mesh gets), so there's no reversal, and all four are locked to each other.
      for (const wheel of wheels) {
        expect(wheel.angularVelocity).toBeCloseTo(expectedWheelSpeed, 9);
        expect(wheel.angularVelocity).toBeCloseTo(wheels[0].angularVelocity, 9); // all four equal
        expect(Math.sign(wheel.angularVelocity)).toBe(Math.sign(engineSpeed));
      }

      expect(engine.broken).toBe(false);
      for (const wheel of wheels) expect(wheel.broken).toBe(false);
    }

    // After many ticks, everything has actually turned (not stalled at rotation 0).
    for (const gear of layout.gears) {
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });
});
