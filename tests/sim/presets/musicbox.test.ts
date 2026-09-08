import { describe, it, expect } from "vitest";
import {
  createMusicBoxPreset,
  createMusicBoxProps,
  WINDER_ID,
  REDUCTION_ID,
  BARREL_ID,
  GOVERNOR_ID,
  WINDER_R,
  REDUCTION_R,
  GOVERNOR_R,
  WIND_MESH_DISTANCE,
  GOVERNOR_MESH_DISTANCE,
  BARREL_REDUCTION,
  GOVERNOR_STEP_UP,
  WINDER_SPEED,
  PIN_ROWS,
  pinRowAngle,
} from "../../../src/sim/presets/musicbox";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createMusicBoxPreset", () => {
  it("builds the key, the great wheel, the barrel keyed to it, and the governor", () => {
    const layout = createMusicBoxPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([REDUCTION_ID, WINDER_ID, BARREL_ID, GOVERNOR_ID]);
    expect(layout.remoteLinks).toEqual([]);

    const wheel = layout.gears.find((g) => g.id === REDUCTION_ID)!;
    const barrel = layout.gears.find((g) => g.id === BARREL_ID)!;
    // The barrel sits on the great wheel's own arbor: same position AND axis.
    expect(barrel.position).toEqual(wheel.position);
    expect(barrel.axis).toEqual(wheel.axis);
    // Everything runs about Z so the barrel lies across the case facing the comb.
    for (const g of layout.gears) expect(g.axis).toEqual([0, 0, 1]);
  });

  it("places both meshes at exactly their summed pitch radii", () => {
    const layout = createMusicBoxPreset();
    const wheel = layout.gears.find((g) => g.id === REDUCTION_ID)!;
    const key = layout.gears.find((g) => g.id === WINDER_ID)!;
    const gov = layout.gears.find((g) => g.id === GOVERNOR_ID)!;

    expect(WINDER_R + REDUCTION_R).toBe(WIND_MESH_DISTANCE);
    expect(REDUCTION_R + GOVERNOR_R).toBe(GOVERNOR_MESH_DISTANCE);

    const dist = (a: typeof wheel, b: typeof wheel) =>
      Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
    expect(dist(key, wheel)).toBeCloseTo(WIND_MESH_DISTANCE, 10);
    expect(dist(gov, wheel)).toBeCloseTo(GOVERNOR_MESH_DISTANCE, 10);
  });

  it("forms both tooth meshes and the barrel coupling via the real evaluatePair", () => {
    const layout = createMusicBoxPreset();
    const wheel = layout.gears.find((g) => g.id === REDUCTION_ID)!;
    const key = layout.gears.find((g) => g.id === WINDER_ID)!;
    const gov = layout.gears.find((g) => g.id === GOVERNOR_ID)!;
    const barrel = layout.gears.find((g) => g.id === BARREL_ID)!;

    const wind = evaluatePair(key, wheel);
    expect(wind).not.toBeNull();
    expect(wind!.kind).toBe("mesh");
    expect(wind!.ratio).toBeCloseTo(BARREL_REDUCTION, 12); // 8 / 48

    const govEdge = evaluatePair(wheel, gov);
    expect(govEdge).not.toBeNull();
    expect(govEdge!.kind).toBe("mesh");
    expect(govEdge!.ratio).toBeCloseTo(GOVERNOR_STEP_UP, 12); // 48 / 6

    const coupling = evaluatePair(wheel, barrel);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createMusicBoxPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("plays the barrel slowly and whirs the governor fast, across hundreds of ticks", () => {
    let layout = createMusicBoxPreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      const key = layout.gears.find((g) => g.id === WINDER_ID)!;
      const wheel = layout.gears.find((g) => g.id === REDUCTION_ID)!;
      const barrel = layout.gears.find((g) => g.id === BARREL_ID)!;
      const gov = layout.gears.find((g) => g.id === GOVERNOR_ID)!;

      expect(key.angularVelocity).toBe(WINDER_SPEED);
      // Key steps DOWN into the barrel: a briskly turned key, a slowly playing tune.
      expect(wheel.angularVelocity).toBeCloseTo(-BARREL_REDUCTION * WINDER_SPEED, 12); // -0.2
      expect(barrel.angularVelocity).toBe(wheel.angularVelocity); // keyed to the same arbor
      // Governor steps back UP off the same wheel, and reverses again.
      expect(gov.angularVelocity).toBeCloseTo(-GOVERNOR_STEP_UP * wheel.angularVelocity, 12); // +1.6
      expect(Math.abs(gov.angularVelocity)).toBeCloseTo(
        GOVERNOR_STEP_UP * Math.abs(barrel.angularVelocity),
        12,
      );
      expect(barrel.broken).toBe(false);
    }
    for (const id of [WINDER_ID, REDUCTION_ID, BARREL_ID, GOVERNOR_ID]) {
      expect(Math.abs(layout.gears.find((g) => g.id === id)!.rotation)).toBeGreaterThan(0);
    }
  });
});

describe("createMusicBoxProps", () => {
  it("stands a row of pins on the barrel, so its rotation is visible", () => {
    // The barrel is a plain cylinder: rotationally symmetric, and on its own it would look
    // motionless however fast it turned.
    const pins = createMusicBoxProps().filter((p) => p.attachTo === BARREL_ID);
    expect(pins.length).toBe(PIN_ROWS);
  });

  it("spaces the pin rows around the barrel rather than lining them up in one stripe", () => {
    const angles = new Set<number>();
    for (let i = 0; i < PIN_ROWS; i++) angles.add(Number(pinRowAngle(i).toFixed(6)));
    expect(angles.size).toBe(PIN_ROWS);
  });

  it("whirs the governor fan on the fast escape gear", () => {
    expect(createMusicBoxProps().filter((p) => p.attachTo === GOVERNOR_ID).length).toBeGreaterThanOrEqual(2);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createMusicBoxPreset().gears.map((g) => g.id));
    for (const p of createMusicBoxProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the case timber, the felt lining and the brass movement their real finishes", () => {
    const used = new Set(createMusicBoxProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["wood", "fabric", "metal"]) expect(used.has(kind as never)).toBe(true);
  });
});
