import { describe, it, expect } from "vitest";
import {
  createTowerCranePreset,
  createTowerCraneProps,
  SLEW_MOTOR_ID,
  SLEW_RING_ID,
  HOIST_MOTOR_ID,
  HOIST_DRUM_ID,
  SLEW_MOTOR_R,
  SLEW_RING_R,
  SLEW_MESH_DISTANCE,
  SLEW_REDUCTION,
  SLEW_MOTOR_SPEED,
  HOIST_MOTOR_SPEED,
  ROPE_RADIUS,
  HOOK_TRAVEL,
  HOIST_STROKE,
} from "../../../src/sim/presets/towercrane";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createTowerCranePreset", () => {
  it("builds two independently powered clusters: slewing and hoisting", () => {
    const layout = createTowerCranePreset();
    expect(layout.gears.map((g) => g.id)).toEqual([SLEW_RING_ID, SLEW_MOTOR_ID, HOIST_MOTOR_ID, HOIST_DRUM_ID]);
    expect(layout.remoteLinks).toEqual([]);
    // A real crane slews and hoists on separate motors -- you can swing the jib while the
    // hook hangs still. Two cranks is the honest model of that, not an accident.
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(2);
    const [ring] = layout.gears;
    expect(ring.axis).toEqual([0, 1, 0]); // a crane slews in plan, about world Y
  });

  it("places the slew motor at exactly the summed pitch radii, clear of the overlap floor", () => {
    const layout = createTowerCranePreset();
    const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
    const motor = layout.gears.find((g) => g.id === SLEW_MOTOR_ID)!;
    expect(SLEW_RING_R + SLEW_MOTOR_R).toBe(SLEW_MESH_DISTANCE);
    const d = Math.hypot(
      motor.position[0] - ring.position[0],
      motor.position[1] - ring.position[1],
      motor.position[2] - ring.position[2],
    );
    expect(d).toBeCloseTo(SLEW_MESH_DISTANCE, 10);
    expect(d).toBeGreaterThan((SLEW_RING_R + SLEW_MOTOR_R) * 0.95); // 22.8
  });

  it("forms a real slew mesh and a real hoist coupling via the real evaluatePair", () => {
    const layout = createTowerCranePreset();
    const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
    const slewMotor = layout.gears.find((g) => g.id === SLEW_MOTOR_ID)!;
    const hoistMotor = layout.gears.find((g) => g.id === HOIST_MOTOR_ID)!;
    const drum = layout.gears.find((g) => g.id === HOIST_DRUM_ID)!;

    const mesh = evaluatePair(slewMotor, ring);
    expect(mesh).not.toBeNull();
    expect(mesh!.kind).toBe("mesh");
    expect(mesh!.ratio).toBeCloseTo(SLEW_REDUCTION, 12); // 8 / 40

    const coupling = evaluatePair(hoistMotor, drum);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);

    // The two clusters must NOT accidentally engage each other.
    expect(evaluatePair(ring, drum)).toBeNull();
  });

  it("reports zero diagnostics problems -- both clusters powered, nothing overlapping", () => {
    const layout = createTowerCranePreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]); // each cluster reaches a crank of its own
    expect(d.overlapPairs).toEqual([]);
  });

  it("slews the jib at exactly 1/8 the motor speed, reversed, while the hoist runs on its own", () => {
    let layout = createTowerCranePreset();
    for (let i = 0; i < 400; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
      const drum = layout.gears.find((g) => g.id === HOIST_DRUM_ID)!;
      const hoistMotor = layout.gears.find((g) => g.id === HOIST_MOTOR_ID)!;
      expect(ring.angularVelocity).toBeCloseTo(-SLEW_REDUCTION * SLEW_MOTOR_SPEED, 12); // -0.16
      // The hoist drum follows its OWN motor, not the slew ring.
      expect(drum.angularVelocity).toBe(hoistMotor.angularVelocity);
      expect(Math.abs(drum.angularVelocity)).toBe(HOIST_MOTOR_SPEED);
      expect(ring.broken).toBe(false);
    }
    expect(Math.abs(layout.gears.find((g) => g.id === SLEW_RING_ID)!.rotation)).toBeGreaterThan(0);
  });

  it("derives the hoist stroke so the hook sweeps exactly its full travel", () => {
    expect(HOIST_STROKE * ROPE_RADIUS).toBeCloseTo(HOOK_TRAVEL, 12);
    const hoistMotor = createTowerCranePreset().gears.find((g) => g.id === HOIST_MOTOR_ID)!;
    expect(hoistMotor.reverseAt).toEqual([0, HOIST_STROKE]);
  });

  it("raises AND lowers the hook over exactly [0, HOOK_TRAVEL], forever", () => {
    let layout = createTowerCranePreset();
    const liftAt = (rot: number) => Math.min(Math.max(rot * ROPE_RADIUS, 0), HOOK_TRAVEL);
    let min = Infinity;
    let max = -Infinity;
    let up = false;
    let down = false;
    let previous = 0;

    for (let i = 0; i < 7200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const lift = liftAt(layout.gears.find((g) => g.id === HOIST_DRUM_ID)!.rotation);
      if (lift > previous) up = true;
      if (lift < previous) down = true;
      previous = lift;
      min = Math.min(min, lift);
      max = Math.max(max, lift);
    }

    expect(up).toBe(true);
    expect(down).toBe(true);
    expect(max).toBeGreaterThan(HOOK_TRAVEL - 0.2);
    expect(max).toBeLessThanOrEqual(HOOK_TRAVEL + 0.01);
    expect(min).toBeGreaterThanOrEqual(-0.01);
    expect(min).toBeLessThan(0.2);
  });
});

describe("createTowerCraneProps", () => {
  it("swings the WHOLE upper works with the slew ring, not just part of it", () => {
    const slewing = createTowerCraneProps().filter((p) => p.attachTo === SLEW_RING_ID);
    // Jib, counter-jib, counterweight, cab, A-frame, two tie bars, trolley and the rope.
    expect(slewing.length).toBeGreaterThanOrEqual(9);
    // The mast and base must NOT swing -- they are the fixed part of a tower crane.
    const fixed = createTowerCraneProps().filter((p) => !p.attachTo && !p.windWith);
    expect(fixed.length).toBeGreaterThanOrEqual(5);
  });

  it("hoists the hook and its crate on the drum's rope, bounded by the jib", () => {
    const hoisted = createTowerCraneProps().filter((p) => p.windWith);
    expect(hoisted.length).toBe(2);
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(HOIST_DRUM_ID);
      expect(p.windWith!.radius).toBe(ROPE_RADIUS);
      expect(p.windWith!.travel).toEqual([0, HOOK_TRAVEL]);
    }
  });

  it("puts bars on the hoist drum so its rotation is visible", () => {
    expect(createTowerCraneProps().filter((p) => p.attachTo === HOIST_DRUM_ID).length).toBeGreaterThanOrEqual(4);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createTowerCranePreset().gears.map((g) => g.id));
    for (const p of createTowerCraneProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the steelwork, concrete and timber their real finishes", () => {
    const used = new Set(createTowerCraneProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["metal", "stone", "wood"]) expect(used.has(kind as never)).toBe(true);
  });
});
