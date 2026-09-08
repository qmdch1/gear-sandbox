import { describe, it, expect } from "vitest";
import {
  createCarouselPreset,
  createCarouselProps,
  MOTOR_ID,
  RING_ID,
  MOTOR_TEETH,
  RING_TEETH,
  MOTOR_R,
  RING_R,
  MESH_DISTANCE,
  REDUCTION,
  MOTOR_SPEED,
  HORSE_COUNT,
  horseAngle,
} from "../../../src/sim/presets/carousel";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createCarouselPreset", () => {
  it("builds the ring gear and the motor that drives it, both turning flat about Y", () => {
    const layout = createCarouselPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([RING_ID, MOTOR_ID]);
    expect(layout.remoteLinks).toEqual([]);

    const [ring, motor] = layout.gears;
    expect(ring.type).toBe("spur");
    expect(ring.teeth).toBe(RING_TEETH);
    expect(motor.type).toBe("crank");
    expect(motor.teeth).toBe(MOTOR_TEETH);
    expect(motor.angularVelocity).toBe(MOTOR_SPEED);
    // Flat discs: a carousel deck spins like a turntable, unlike this project's upright wheels.
    expect(ring.axis).toEqual([0, 1, 0]);
    expect(motor.axis).toEqual([0, 1, 0]);
  });

  it("places the motor at exactly the summed pitch radii, clear of the overlap floor", () => {
    const [ring, motor] = createCarouselPreset().gears;
    expect(RING_R + MOTOR_R).toBe(MESH_DISTANCE);
    const d = Math.hypot(
      motor.position[0] - ring.position[0],
      motor.position[1] - ring.position[1],
      motor.position[2] - ring.position[2],
    );
    expect(d).toBeCloseTo(MESH_DISTANCE, 10);
    // classify() trips below 95% of the summed radii; 35 must sit above 33.25.
    expect(d).toBeGreaterThan((RING_R + MOTOR_R) * 0.95);
  });

  it("forms a real tooth mesh via the real evaluatePair, at the designed reduction", () => {
    const [ring, motor] = createCarouselPreset().gears;
    const edge = evaluatePair(motor, ring);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(REDUCTION, 12); // 10 / 60
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createCarouselPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("turns the ride at exactly one sixth of the motor, reversed, across hundreds of ticks", () => {
    let layout = createCarouselPreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const motor = layout.gears.find((g) => g.id === MOTOR_ID)!;
      const ring = layout.gears.find((g) => g.id === RING_ID)!;
      expect(motor.angularVelocity).toBe(MOTOR_SPEED);
      expect(ring.angularVelocity).toBeCloseTo(-REDUCTION * MOTOR_SPEED, 12); // -0.2
      expect(Math.abs(ring.angularVelocity) * 6).toBeCloseTo(Math.abs(motor.angularVelocity), 12);
      expect(ring.broken).toBe(false);
    }
    expect(Math.abs(layout.gears.find((g) => g.id === RING_ID)!.rotation)).toBeGreaterThan(0);
  });
});

describe("createCarouselProps", () => {
  it("hangs every horse, pole and scallop on the ring gear, so the ride visibly turns", () => {
    const props = createCarouselProps();
    const turning = props.filter((p) => p.attachTo === RING_ID);
    // Deck + canopy + (pole, horse, scallop) x HORSE_COUNT.
    expect(turning.length).toBe(2 + HORSE_COUNT * 3);
    // The deck and canopy alone are rotationally symmetric and would show nothing; the
    // asymmetric riders are what make the motion readable.
    expect(turning.filter((p) => p.kind === "box").length).toBeGreaterThanOrEqual(HORSE_COUNT * 2);
  });

  it("spaces the horses evenly around the ride rather than piling them at one angle", () => {
    const angles = new Set<number>();
    for (let i = 0; i < HORSE_COUNT; i++) angles.add(Number(horseAngle(i).toFixed(6)));
    expect(angles.size).toBe(HORSE_COUNT);
    expect(horseAngle(0)).toBe(0);
    expect(horseAngle(HORSE_COUNT)).toBeCloseTo(Math.PI * 2, 12);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createCarouselPreset().gears.map((g) => g.id));
    for (const p of createCarouselProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the timber, canvas, brass and stonework their real finishes", () => {
    const used = new Set(createCarouselProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["wood", "fabric", "metal", "stone"]) expect(used.has(kind as never)).toBe(true);
  });
});
