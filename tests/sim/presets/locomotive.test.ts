import { describe, it, expect } from "vitest";
import {
  createLocomotivePreset,
  createLocomotiveProps,
  TRACK_X,
  DRIVER_TEETH,
  DRIVER_R,
  WHEEL_Y,
  DRIVER_Z,
  PINION_TEETH,
  PINION_MESH_DISTANCE,
  CRANK_PIN_R,
  MAIN_ROD_L,
  PISTON_MIN_Z,
  PISTON_MAX_Z,
  PISTON_STROKE,
  DRIVE_SPEED,
  PINION_RATIO,
  QUARTER,
} from "../../../src/sim/presets/locomotive";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

const LEFT = ["증기기관차_좌동륜1", "증기기관차_좌동륜2", "증기기관차_좌동륜3"];
const RIGHT = ["증기기관차_우동륜1", "증기기관차_우동륜2", "증기기관차_우동륜3"];
const PINION = "증기기관차_발전기피니언";

describe("createLocomotivePreset", () => {
  it("builds six coupled driving wheels plus the generator pinion, with unique ids", () => {
    const layout = createLocomotivePreset();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...LEFT, ...RIGHT, PINION]) expect(ids).toContain(id);

    // Exactly one crank: the whole engine is driven from a single input.
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(1);
    for (const g of layout.gears) {
      if (g.id === PINION) expect(g.teeth).toBe(PINION_TEETH);
      else expect(g.teeth).toBe(DRIVER_TEETH);
    }
  });

  it("stands every driving wheel one radius up, on its own axle, rolling about world X", () => {
    const layout = createLocomotivePreset();
    for (const id of [...LEFT, ...RIGHT]) {
      const g = layout.gears.find((x) => x.id === id)!;
      expect(g.axis).toEqual([1, 0, 0]); // upright wheel that rolls, not a flat turntable
      expect(g.position[1]).toBe(WHEEL_Y); // WHEEL_Y == DRIVER_R, so the tread sits on the rail
      expect(g.position[1]).toBe(DRIVER_R);
    }
    // Left rail at x = 0, right rail one track width across; wheels paired down the frame.
    for (let i = 0; i < 3; i++) {
      const l = layout.gears.find((g) => g.id === LEFT[i])!;
      const r = layout.gears.find((g) => g.id === RIGHT[i])!;
      expect(l.position[0]).toBe(0);
      expect(r.position[0]).toBe(TRACK_X);
      expect(l.position[2]).toBe(DRIVER_Z[i]);
      expect(r.position[2]).toBe(DRIVER_Z[i]);
    }
  });

  it("quarters the right wheel line exactly 90 degrees ahead of the left, as a real engine is", () => {
    // Quartering is what stops a real locomotive dead-centring on both sides at once, so it
    // can always start. Here it is the layout's one non-default initial condition.
    const layout = createLocomotivePreset();
    for (let i = 0; i < 3; i++) {
      const l = layout.gears.find((g) => g.id === LEFT[i])!;
      const r = layout.gears.find((g) => g.id === RIGHT[i])!;
      expect(r.rotation - l.rotation).toBeCloseTo(QUARTER, 12);
    }
    expect(QUARTER).toBeCloseTo(Math.PI / 2, 12);
  });

  it("meshes the generator pinion for real at the exact pitch distance via the real evaluatePair", () => {
    const layout = createLocomotivePreset();
    const driver = layout.gears.find((g) => g.id === LEFT[0])!;
    const pinion = layout.gears.find((g) => g.id === PINION)!;

    const dy = pinion.position[1] - driver.position[1];
    const dz = pinion.position[2] - driver.position[2];
    expect(Math.hypot(dy, dz)).toBeCloseTo(PINION_MESH_DISTANCE, 10);

    const edge = evaluatePair(driver, pinion);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(PINION_RATIO, 10); // 20 / 5 = 4
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, nothing overlapping", () => {
    const layout = createLocomotivePreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("holds all six drivers to one speed and one direction, and steps the pinion up 4x reversed", () => {
    let layout = createLocomotivePreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      // Coupling rods make every driving wheel turn as one -- same speed, same sign.
      for (const id of [...LEFT, ...RIGHT]) {
        const g = layout.gears.find((x) => x.id === id)!;
        expect(g.angularVelocity).toBeCloseTo(DRIVE_SPEED, 12);
        expect(g.broken).toBe(false);
      }
      const pinion = layout.gears.find((g) => g.id === PINION)!;
      expect(pinion.angularVelocity).toBeCloseTo(-PINION_RATIO * DRIVE_SPEED, 12); // -3.2
    }
    for (const id of [...LEFT, ...RIGHT, PINION]) {
      expect(Math.abs(layout.gears.find((g) => g.id === id)!.rotation)).toBeGreaterThan(0);
    }
  });

  it("keeps the wheels quartered for the whole run, not just at rest", () => {
    let layout = createLocomotivePreset();
    for (let i = 0; i < 300; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    for (let i = 0; i < 3; i++) {
      const l = layout.gears.find((g) => g.id === LEFT[i])!;
      const r = layout.gears.find((g) => g.id === RIGHT[i])!;
      expect(r.rotation - l.rotation).toBeCloseTo(QUARTER, 9);
    }
  });
});

describe("createLocomotiveProps", () => {
  it("drives pistons and main rods off the wheels as a real crank-slider linkage", () => {
    const props = createLocomotiveProps();
    const linked = props.filter((p) => p.linkTo);
    expect(linked.length).toBeGreaterThan(0);

    const gearIds = new Set(createLocomotivePreset().gears.map((g) => g.id));
    for (const p of linked) {
      const l = p.linkTo!;
      expect(gearIds.has(l.gear)).toBe(true);
      // A rod shorter than the crank throw could never close the linkage -- the solver would
      // clamp its discriminant and the rod would collapse instead of swinging.
      expect(l.rodLength).toBeGreaterThan(l.crankRadius);
      expect(["rod", "slider", "pin"]).toContain(l.role);
    }
    // Both a rod and a slider (piston) are present -- a rod with nothing to push is not a
    // crank-slider.
    const roles = new Set(linked.map((p) => p.linkTo!.role));
    expect(roles.has("rod")).toBe(true);
    expect(roles.has("slider")).toBe(true);
  });

  it("derives the piston stroke as exactly twice the crank pin radius", () => {
    // Textbook crank-slider: the slider's travel between dead centres is (L + r) - (L - r),
    // i.e. 2r, independent of rod length. These constants position the cylinder, so if they
    // ever drift apart the piston would run outside its bore.
    expect(PISTON_MAX_Z).toBeCloseTo(MAIN_ROD_L + CRANK_PIN_R, 12);
    expect(PISTON_MIN_Z).toBeCloseTo(MAIN_ROD_L - CRANK_PIN_R, 12);
    expect(PISTON_STROKE).toBeCloseTo(2 * CRANK_PIN_R, 12);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createLocomotivePreset().gears.map((g) => g.id));
    for (const p of createLocomotiveProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the boiler ironwork, the cab timber and the rusted gear their real finishes", () => {
    const used = new Set(createLocomotiveProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["metal", "wood", "rust"]) expect(used.has(kind as never)).toBe(true);
  });
});
