import { describe, it, expect } from "vitest";
import {
  createLocomotivePreset,
  createLocomotiveProps,
  TRACK_X,
  DRIVER_TEETH,
  WHEEL_Y,
  DRIVER_Z,
  PINION_TEETH,
  PINION_MESH_DISTANCE,
  CRANK_PIN_R,
  MAIN_ROD_L,
  CYLINDER_Z,
  CYLINDER_LEN,
  PISTON_MIN_Z,
  PISTON_MAX_Z,
  PISTON_STROKE,
  DRIVE_SPEED,
  DRIVE_RANGE,
  TRACK_LIMIT,
  RAIL_ROLLING_RESISTANCE,
  DRIVER_R,
  PINION_RATIO,
  QUARTER,
} from "../../../src/sim/presets/locomotive";
import * as THREE from "three";
import { crankSliderPose } from "../../../src/render/sceneSync";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { LayoutState } from "../../../src/sim/types";

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
    let layout: LayoutState = createLocomotivePreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };

      // Coupling rods make every driving wheel turn as one -- same speed, same sign -- at every
      // instant, including while the engine is still working up to speed.
      const main = layout.gears.find((x) => x.id === LEFT[0])!;
      for (const id of [...LEFT, ...RIGHT]) {
        const g = layout.gears.find((x) => x.id === id)!;
        expect(g.angularVelocity).toBeCloseTo(main.angularVelocity, 12);
        expect(g.broken).toBe(false);
      }
      const pinion = layout.gears.find((g) => g.id === PINION)!;
      expect(pinion.angularVelocity).toBeCloseTo(-PINION_RATIO * main.angularVelocity, 12);
    }
    for (const id of [...LEFT, ...RIGHT, PINION]) {
      expect(Math.abs(layout.gears.find((g) => g.id === id)!.rotation)).toBeGreaterThan(0);
    }
    // Five seconds in -- before the reverser throws it, which happens at about 6.7 s -- the
    // drive is up near its free speed but held below it by the train it is pulling. A machine
    // running at exactly its rated speed would not be pulling anything.
    let pulling: LayoutState = createLocomotivePreset();
    for (let i = 0; i < 300; i++) {
      const r = tick(pulling, 1 / 60, 1, { wear: false });
      pulling = { ...pulling, gears: r.gears, vehicles: r.vehicles };
    }
    const drive = pulling.gears[0].angularVelocity;
    expect(drive).toBeGreaterThan(DRIVE_SPEED * 0.7);
    expect(drive).toBeLessThan(DRIVE_SPEED);
  });

  it("runs down the line, chimney first, and the reverser brings it back", () => {
    let layout: LayoutState = createLocomotivePreset();
    // The cylinders sit ahead of the wheelbase at +Z, so +Z is the front; `rollingDirection`
    // derives that from the wheel axis rather than it being written down by hand.
    expect(layout.vehicles![0].direction).toEqual([0, 0, 1]);

    let furthest = 0;
    let reversed = false;
    for (let i = 0; i < 60 * 90; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
      const d = layout.vehicles![0].distance;
      furthest = Math.max(furthest, d);
      if (d < furthest - 1) reversed = true;
      expect(Math.abs(d)).toBeLessThanOrEqual(TRACK_LIMIT + 1e-9);
    }
    expect(furthest).toBeGreaterThan(DRIVE_RANGE * 0.9);
    expect(reversed).toBe(true);
    // Travel is the drivers' own rolling, not an animation running alongside them.
    const wheel = layout.gears.find((g) => g.id === LEFT[0])!;
    expect(layout.vehicles![0].distance).toBeCloseTo(wheel.rotation * DRIVER_R, 6);
  });

  it("runs faster on rail than the same engine would on tyres", () => {
    // Rolling resistance is about 0.002 for steel on steel against 0.015 for a tyre on tarmac,
    // and that single number is why railways move heavy things cheaply. Compared on the SAME
    // locomotive with only the resistance changed -- comparing it against the car instead would
    // be comparing two different motors, where the fraction of free speed each one holds says
    // more about its torque curve than about what it is rolling on.
    const settle = (rollingResistance: number) => {
      const fresh = createLocomotivePreset();
      // Let it run flat out rather than shuttling, so this is a steady state and not whatever
      // moment of braking the reverser happened to catch.
      let layout: LayoutState = {
        ...fresh,
        gears: fresh.gears.map((g) => ({ ...g, reverseAt: undefined })),
        vehicles: fresh.vehicles!.map((v) => ({ ...v, limit: undefined, rollingResistance })),
      };
      for (let i = 0; i < 60 * 20; i++) {
        const r = tick(layout, 1 / 60, 1, { wear: false });
        layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
      }
      return Math.abs(layout.gears[0].angularVelocity);
    };
    expect(settle(RAIL_ROLLING_RESISTANCE)).toBeGreaterThan(settle(0.015));
    // And on rail it keeps most of what the motor can give.
    expect(settle(RAIL_ROLLING_RESISTANCE)).toBeGreaterThan(DRIVE_SPEED * 0.7);
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

  it("keeps the piston rod inside its bore through a whole revolution", () => {
    // This test used to assert PISTON_MAX_Z === MAIN_ROD_L + CRANK_PIN_R, PISTON_MIN_Z ===
    // MAIN_ROD_L - CRANK_PIN_R and PISTON_STROKE === 2 * CRANK_PIN_R -- all three of which are
    // the DEFINITIONS in locomotive.ts, restated. (L+r)-(L-r) = 2r is true of every L and every
    // r, so no edit to the rod, the pin, the cylinder or `crankSliderPose` could ever fail it,
    // while its comment claimed it guarded the bore.
    //
    // The bore claim is worth making, so make it properly: sweep the crank through a full
    // revolution using the SAME solver the renderer drives the linkage with, and require the
    // piston rod -- an 8-unit stub centred on the slider point -- to stay inside the cylinder
    // at every angle.
    const ROD_STUB = 8;
    const boreMin = CYLINDER_Z - CYLINDER_LEN / 2; // 13
    const boreMax = CYLINDER_Z + CYLINDER_LEN / 2; // 31
    const out = {
      pin: new THREE.Vector3(),
      slider: new THREE.Vector3(),
      rodMid: new THREE.Vector3(),
      rodQuat: new THREE.Quaternion(),
    };
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < 720; i++) {
      crankSliderPose(
        new THREE.Vector3(0, WHEEL_Y, 0),
        new THREE.Vector3(1, 0, 0),
        (i / 720) * Math.PI * 2,
        CRANK_PIN_R,
        MAIN_ROD_L,
        new THREE.Vector3(0, 0, 1),
        out,
      );
      lowest = Math.min(lowest, out.slider.z - ROD_STUB / 2);
      highest = Math.max(highest, out.slider.z + ROD_STUB / 2);
    }
    expect(lowest).toBeGreaterThanOrEqual(boreMin - 1e-9);
    expect(highest).toBeLessThanOrEqual(boreMax + 1e-9);
    // It fills the bore rather than rattling around in a third of it -- which is what makes
    // the fit a real constraint and not a coincidence of a generous cylinder.
    expect(lowest).toBeCloseTo(boreMin, 9);
    expect(highest).toBeCloseTo(boreMax, 9);

    // And the stroke really is 2r, measured from the solver rather than restated from its
    // own definition.
    expect(highest - lowest - ROD_STUB).toBeCloseTo(2 * CRANK_PIN_R, 9);
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
