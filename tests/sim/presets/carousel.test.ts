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
  horseFacing,
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

  it("turns every rider tangentially, nose-first round the ride, never splayed outward", () => {
    // A prop's long side is its local +X, and a Three Y-rotation by `t` sends local +X to
    // the world direction (cos t, 0, -sin t). Compare that against the ride's radial and
    // tangential directions at the same angle; a horse must lie along the tangent.
    for (let i = 0; i < HORSE_COUNT; i++) {
      const a = horseAngle(i);
      const t = horseFacing(i);
      const longAxis: [number, number] = [Math.cos(t), -Math.sin(t)]; // (x, z)
      const radial: [number, number] = [Math.cos(a), Math.sin(a)];
      const tangent: [number, number] = [-Math.sin(a), Math.cos(a)];
      expect(longAxis[0] * radial[0] + longAxis[1] * radial[1]).toBeCloseTo(0, 12);
      // +1, not -1: the ring runs at -0.2 rad/s about +Y, which carries a rider toward
      // INCREASING ride angle, so the tangent above is the direction of travel.
      expect(longAxis[0] * tangent[0] + longAxis[1] * tangent[1]).toBeCloseTo(1, 12);
    }
  });

  it("gives the horses and scallops that same tangential facing, one per ride angle", () => {
    const boxes = createCarouselProps().filter((p) => p.kind === "box" && p.attachTo === RING_ID);
    expect(boxes.length).toBe(HORSE_COUNT * 2); // a horse and a scallop at each angle
    const expected = new Set<string>();
    for (let i = 0; i < HORSE_COUNT; i++) expected.add(horseFacing(i).toFixed(9));
    const actual = new Set(boxes.map((p) => (p.rotation?.[1] ?? 0).toFixed(9)));
    expect(actual).toEqual(expected);
    // Nothing is tilted out of the horizontal plane.
    for (const p of boxes) {
      expect(p.rotation?.[0] ?? 0).toBe(0);
      expect(p.rotation?.[2] ?? 0).toBe(0);
    }
  });

  it("hangs the scallops on the canopy rim instead of floating them outside the roof", () => {
    const props = createCarouselProps();
    const canopy = props.find((p) => p.kind === "cone")!;
    if (canopy.kind !== "cone") throw new Error("canopy is not a cone");
    // ConeGeometry puts the base circle half a height below the prop's position.
    const rimY = canopy.position[1] - canopy.height / 2;
    const scallops = props.filter(
      (p) => p.kind === "box" && p.attachTo === RING_ID && p.color === canopy.color,
    );
    expect(scallops.length).toBe(HORSE_COUNT);
    for (const s of scallops) {
      if (s.kind !== "box") throw new Error("scallop is not a box");
      const r = Math.hypot(s.position[0], s.position[2]);
      expect(r).toBeCloseTo(canopy.radius, 12); // on the rim, not out past it
      expect(s.position[1] + s.size[1] / 2).toBeCloseTo(rimY, 12); // top edge flush with the rim
      expect(s.position[1]).toBeLessThan(rimY); // hanging BELOW it, as a valance does
    }
  });

  it("stands the motor on something instead of floating it off the edge of the ground pad", () => {
    const [, motor] = createCarouselPreset().gears;
    const padRadius = RING_R + 2;
    expect(Math.hypot(motor.position[0], motor.position[2])).toBeGreaterThan(padRadius);
    const support = createCarouselProps().find(
      (p) =>
        p.kind === "cylinder" &&
        !p.attachTo &&
        Math.hypot(p.position[0] - motor.position[0], p.position[2] - motor.position[2]) < 1e-9,
    );
    expect(support).toBeDefined();
    if (!support || support.kind !== "cylinder") throw new Error("no motor support");
    // Reaches from the ground up to the motor's own height.
    expect(support.position[1] - support.height / 2).toBeCloseTo(0, 12);
    expect(support.position[1] + support.height / 2).toBeCloseTo(motor.position[1], 12);
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
