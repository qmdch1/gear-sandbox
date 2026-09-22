// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor() {
      this.domElement = document.createElement("canvas");
    }
    setSize() {}
    render() {}
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

import * as THREE from "three";
import { SceneSync } from "../../src/render/sceneSync";
import { createScene } from "../../src/render/scene";
import type { GearInstance, Vehicle } from "../../src/sim/types";
import type { Prop } from "../../src/render/props";

/** THE GAP THIS FILE FILLS.
 *
 *  `setProps` is how every moving prop in the repo is registered, and it was called by NO test.
 *  `spinAttachedPose` and `crankSliderPose` have suites of their own, so the FORMULAS were
 *  covered -- but nothing ran the five passes in `sync()` that feed them, so none of the wiring,
 *  the ordering, or the composition rules were checked.
 *
 *  Measured before writing this: commenting out all five `this.update*Props(...)` calls in
 *  `sync()` left 185 tests passing across tests/render and the preset suites. Every prop in
 *  every machine would have been nailed in place -- windmill sails frozen, the castle gate
 *  stuck, the crane hook hanging at its rest height, every piston still, a car's shell parked
 *  on the start line while its gears drove away -- and nothing anywhere could say so.
 *
 *  The preset suites look like they cover this, but they re-implement the arithmetic by hand:
 *  tests/sim/presets/wellpump.test.ts says "What `sceneSync.updateWindingProps` does:
 *  clamp(rotation * radius, lo, hi)" and then does exactly that itself. Both sides of the
 *  assertion come from the same place, so the real code never runs. These tests drive it. */

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g",
    type: "spur",
    position: [0, 0, 0],
    axis: [0, 1, 0],
    teeth: 20,
    module: 1,
    durabilityMax: 100,
    durabilityCurrent: 100,
    broken: false,
    rotation: 0,
    angularVelocity: 0,
    ...overrides,
  };
}

const NO_PROBLEMS = { unconnectedIds: [], noPowerIds: [], overlapPairs: [] };

/** A SceneSync on a real scene, plus access to the meshes `setProps` added to it. */
function harness() {
  const { scene } = createScene(document.createElement("canvas"));
  const sync = new SceneSync({ scene } as never);
  const before = scene.children.length;
  return {
    sync,
    propMeshes: () => scene.children.slice(before) as THREE.Mesh[],
  };
}

const box = (over: Partial<Extract<Prop, { kind: "box" }>>): Prop =>
  ({ kind: "box", position: [0, 0, 0], size: [1, 1, 1], color: 0x888888, ...over }) as Prop;

describe("attachTo -- a prop turns with its gear", () => {
  it("sweeps an off-axis prop around the gear's centre as the gear rotates", () => {
    const h = harness();
    // Gear spinning about +Y at the origin; prop sitting 10 out along +X.
    h.sync.setProps([box({ position: [10, 0, 0], attachTo: "hub" })]);
    const mesh = h.propMeshes()[0];

    h.sync.sync([makeGear({ id: "hub", rotation: 0 })], [], NO_PROBLEMS);
    expect(mesh.position.x).toBeCloseTo(10, 9);
    expect(mesh.position.z).toBeCloseTo(0, 9);

    // A quarter turn carries it off the +X axis, still at radius 10.
    h.sync.sync([makeGear({ id: "hub", rotation: Math.PI / 2 })], [], NO_PROBLEMS);
    expect(Math.hypot(mesh.position.x, mesh.position.z)).toBeCloseTo(10, 9);
    expect(Math.abs(mesh.position.x)).toBeLessThan(1e-6);
    expect(Math.abs(mesh.position.z)).toBeCloseTo(10, 9);

    // Half a turn puts it opposite where it started.
    h.sync.sync([makeGear({ id: "hub", rotation: Math.PI })], [], NO_PROBLEMS);
    expect(mesh.position.x).toBeCloseTo(-10, 9);
  });

  it("re-poses from the REST pose each frame rather than accumulating", () => {
    // Spinning from wherever the mesh already sits would make the prop run away.
    const h = harness();
    h.sync.setProps([box({ position: [10, 0, 0], attachTo: "hub" })]);
    const mesh = h.propMeshes()[0];
    for (let i = 0; i < 5; i++) {
      h.sync.sync([makeGear({ id: "hub", rotation: Math.PI })], [], NO_PROBLEMS);
    }
    expect(mesh.position.x).toBeCloseTo(-10, 9);
  });

  it("leaves a prop alone when the gear it names is gone", () => {
    const h = harness();
    h.sync.setProps([box({ position: [10, 0, 0], attachTo: "missing" })]);
    const mesh = h.propMeshes()[0];
    h.sync.sync([makeGear({ id: "hub", rotation: 1 })], [], NO_PROBLEMS);
    expect(mesh.position.toArray()).toEqual([10, 0, 0]);
  });
});

describe("slideWith -- a prop rides a rack's linear travel", () => {
  it("moves along the rack's own axis by its linearPosition", () => {
    const h = harness();
    h.sync.setProps([box({ position: [0, 5, 0], slideWith: "rack" })]);
    const mesh = h.propMeshes()[0];
    const rack = (linearPosition: number) =>
      makeGear({ id: "rack", type: "rack", axis: [0, 1, 0], linearPosition });

    h.sync.sync([rack(0)], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(5, 9);
    h.sync.sync([rack(12)], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(17, 9); // rest + travel, along +Y
    h.sync.sync([rack(0)], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(5, 9); // and back down, not accumulated
  });
});

describe("windWith -- a prop hangs on a rope spooling onto a drum", () => {
  const rope = {
    gear: "drum",
    radius: 4,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, 20] as [number, number],
  };

  it("lifts by rotation x radius, along the direction given", () => {
    const h = harness();
    h.sync.setProps([box({ position: [0, 0, 0], windWith: rope })]);
    const mesh = h.propMeshes()[0];
    h.sync.sync([makeGear({ id: "drum", rotation: 2 })], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(8, 9); // 2 rad x radius 4
    expect(mesh.position.x).toBeCloseTo(0, 9);
  });

  it("clamps at both ends of its travel, so the hook stops at the headblock", () => {
    const h = harness();
    h.sync.setProps([box({ position: [0, 0, 0], windWith: rope })]);
    const mesh = h.propMeshes()[0];
    h.sync.sync([makeGear({ id: "drum", rotation: 100 })], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(20, 9); // not 400
    h.sync.sync([makeGear({ id: "drum", rotation: -100 })], [], NO_PROBLEMS);
    expect(mesh.position.y).toBeCloseTo(0, 9); // not -400
  });

  it("ADDS the lift to an attached prop's spun pose instead of replacing it", () => {
    // The documented tower-crane regression: a hook hangs from a trolley that orbits with the
    // jib AND rides the hoist rope. Rewriting from the rest position here would leave the jib
    // swinging round the mast while the hook stayed behind in mid-air.
    const h = harness();
    h.sync.setProps([box({ position: [10, 0, 0], attachTo: "slew", windWith: rope })]);
    const mesh = h.propMeshes()[0];

    h.sync.sync(
      [makeGear({ id: "slew", rotation: Math.PI }), makeGear({ id: "drum", rotation: 2 })],
      [],
      NO_PROBLEMS,
    );
    expect(mesh.position.x).toBeCloseTo(-10, 9); // it swung with the jib...
    expect(mesh.position.y).toBeCloseTo(8, 9); // ...and rose on the rope
  });
});

describe("ridesOn -- a prop travels with its vehicle", () => {
  const vehicle = (distance: number): Vehicle => ({
    id: "car",
    wheel: "wheel",
    radius: 8,
    mass: 2,
    direction: [0, 0, 1],
    distance,
  });

  it("carries a body prop to where the vehicle has driven", () => {
    const h = harness();
    h.sync.setProps([box({ position: [0, 5, 0], ridesOn: "car" })]);
    const mesh = h.propMeshes()[0];
    h.sync.sync([makeGear({ id: "wheel" })], [], NO_PROBLEMS, [vehicle(30)]);
    expect(mesh.position.z).toBeCloseTo(30, 9);
    // Re-syncing at the same distance must not add it twice.
    h.sync.sync([makeGear({ id: "wheel" })], [], NO_PROBLEMS, [vehicle(30)]);
    expect(mesh.position.z).toBeCloseTo(30, 9);
  });

  it("runs LAST, so a wheel's spokes both spin and travel", () => {
    // A road wheel's spokes turn about their hub AND go down the road. The travel has to be
    // added to the spun pose, not instead of it -- which is why this pass runs after the others.
    const h = harness();
    h.sync.setProps([box({ position: [8, 0, 0], attachTo: "wheel", ridesOn: "car" })]);
    const mesh = h.propMeshes()[0];
    h.sync.sync(
      [makeGear({ id: "wheel", axis: [1, 0, 0], rotation: Math.PI })],
      [],
      NO_PROBLEMS,
      [vehicle(30)],
    );
    expect(mesh.position.x).toBeCloseTo(8, 9); // spinning about +X leaves x alone...
    expect(mesh.position.z).toBeCloseTo(30, 9); // ...and the travel landed on top
  });
});

describe("linkTo -- a crank-slider linkage swings on its crank", () => {
  const link = {
    gear: "crank",
    crankRadius: 5,
    rodLength: 12,
    slideAxis: [0, 0, 1] as [number, number, number],
  };

  it("puts the pin on the crank throw, the slider on its axis, and the rod between them", () => {
    const h = harness();
    h.sync.setProps([
      box({ position: [0, 0, 0], linkTo: { ...link, role: "pin" } }),
      box({ position: [0, 0, 0], linkTo: { ...link, role: "slider" } }),
      box({ position: [0, 0, 0], linkTo: { ...link, role: "rod" } }),
    ]);
    const [pin, slider, rod] = h.propMeshes();

    // Crank about +X at the origin, a quarter turn in.
    const crank = (rotation: number) =>
      makeGear({ id: "crank", axis: [1, 0, 0], position: [0, 0, 0], rotation });
    h.sync.sync([crank(Math.PI / 2)], [], NO_PROBLEMS);

    // The pin rides the throw: exactly crankRadius from the crank's centre.
    expect(Math.hypot(pin.position.y, pin.position.z)).toBeCloseTo(link.crankRadius, 9);
    // The rod really spans pin to slider, so its centre is their midpoint.
    expect(rod.position.y).toBeCloseTo((pin.position.y + slider.position.y) / 2, 9);
    expect(rod.position.z).toBeCloseTo((pin.position.z + slider.position.z) / 2, 9);
    // ...and it is rodLength long, pin to slider.
    expect(pin.position.distanceTo(slider.position)).toBeCloseTo(link.rodLength, 9);
  });

  it("reciprocates the slider over exactly twice the crank radius, and only along its axis", () => {
    // The textbook crank-slider result: travel between dead centres is (L + r) - (L - r) = 2r,
    // independent of rod length. Measured from the real pass, swept through a whole revolution.
    const h = harness();
    h.sync.setProps([box({ position: [0, 0, 0], linkTo: { ...link, role: "slider" } })]);
    const slider = h.propMeshes()[0];

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 360; i++) {
      h.sync.sync(
        [makeGear({ id: "crank", axis: [1, 0, 0], rotation: (i / 360) * Math.PI * 2 })],
        [],
        NO_PROBLEMS,
      );
      lo = Math.min(lo, slider.position.z);
      hi = Math.max(hi, slider.position.z);
      expect(Math.abs(slider.position.x)).toBeLessThan(1e-9); // never leaves its slide axis
      expect(Math.abs(slider.position.y)).toBeLessThan(1e-9);
    }
    expect(hi - lo).toBeCloseTo(2 * link.crankRadius, 6);
    expect(hi).toBeCloseTo(link.rodLength + link.crankRadius, 6);
    expect(lo).toBeCloseTo(link.rodLength - link.crankRadius, 6);
  });
});

describe("setProps", () => {
  it("forgets the previous registration, so a reload does not move two sets of props", () => {
    const h = harness();
    h.sync.setProps([box({ position: [10, 0, 0], attachTo: "hub" })]);
    h.sync.setProps([box({ position: [4, 0, 0], attachTo: "hub" })]);
    expect(h.propMeshes()).toHaveLength(1);
    h.sync.sync([makeGear({ id: "hub", rotation: Math.PI })], [], NO_PROBLEMS);
    expect(h.propMeshes()[0].position.x).toBeCloseTo(-4, 9);
  });
});
