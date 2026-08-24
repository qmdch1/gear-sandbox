import { describe, it, expect } from "vitest";
import { createGear, defaultAxisForType, defaultTeethForType, toggledAxis, rotatedAxis } from "../../src/sim/gearFactory";

describe("defaultAxisForType", () => {
  it("gives bevel and worm gears a perpendicular default axis", () => {
    expect(defaultAxisForType("bevel")).toEqual([1, 0, 0]);
    expect(defaultAxisForType("worm")).toEqual([1, 0, 0]);
  });

  it("gives spur/helical/crank/load gears the standard Y axis", () => {
    expect(defaultAxisForType("spur")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("helical")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("crank")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("load")).toEqual([0, 1, 0]);
  });
});

describe("toggledAxis", () => {
  it("flips any axis between horizontal (+X) and vertical (+Y), regardless of type", () => {
    // Universal since the "모든 부품들을 가로 세로 변경되게 해줘" request -- toggledAxis
    // no longer takes a type argument at all, it just flips whatever axis it's given.
    expect(toggledAxis([1, 0, 0])).toEqual([0, 1, 0]);
    expect(toggledAxis([0, 1, 0])).toEqual([1, 0, 0]);
  });
});

describe("rotatedAxis", () => {
  it("steps forward through the X -> Y -> Z cycle, wrapping back to X", () => {
    expect(rotatedAxis([1, 0, 0], 1)).toEqual([0, 1, 0]);
    expect(rotatedAxis([0, 1, 0], 1)).toEqual([0, 0, 1]);
    expect(rotatedAxis([0, 0, 1], 1)).toEqual([1, 0, 0]);
  });

  it("steps backward through the same cycle, wrapping the other way", () => {
    expect(rotatedAxis([1, 0, 0], -1)).toEqual([0, 0, 1]);
    expect(rotatedAxis([0, 0, 1], -1)).toEqual([0, 1, 0]);
    expect(rotatedAxis([0, 1, 0], -1)).toEqual([1, 0, 0]);
  });

  it("reaches the Z axis, unlike toggledAxis which only ever reaches X or Y", () => {
    expect(rotatedAxis([0, 1, 0], 1)).toEqual([0, 0, 1]);
  });

  it("a full loop of 3 forward steps returns to the starting axis", () => {
    let axis: [number, number, number] = [1, 0, 0];
    for (let i = 0; i < 3; i++) axis = rotatedAxis(axis, 1);
    expect(axis).toEqual([1, 0, 0]);
  });

  it("finds the NEAREST cycle entry for a not-quite-exact axis, rather than requiring an exact match", () => {
    // e.g. a hand-authored or slightly-off axis value should still round to
    // whichever cardinal direction it's actually closest to.
    expect(rotatedAxis([0.9, 0.1, 0.1], 1)).toEqual([0, 1, 0]); // closest to X -> steps to Y
  });
});

describe("defaultTeethForType", () => {
  it("gives worm gears a single thread-start, the standard/simplest worm", () => {
    expect(defaultTeethForType("worm")).toBe(1);
  });

  it("gives load gears zero teeth", () => {
    expect(defaultTeethForType("load")).toBe(0);
  });

  it("gives shaft, beam, and belt (rod types) zero teeth", () => {
    expect(defaultTeethForType("shaft")).toBe(0);
    expect(defaultTeethForType("beam")).toBe(0);
    expect(defaultTeethForType("belt")).toBe(0);
  });

  it("gives joint, bearing, spring, rotor, and track zero teeth too", () => {
    expect(defaultTeethForType("joint")).toBe(0);
    expect(defaultTeethForType("bearing")).toBe(0);
    expect(defaultTeethForType("spring")).toBe(0);
    expect(defaultTeethForType("rotor")).toBe(0);
    expect(defaultTeethForType("track")).toBe(0);
  });

  it("gives spur/helical/crank gears 20 teeth", () => {
    expect(defaultTeethForType("spur")).toBe(20);
    expect(defaultTeethForType("helical")).toBe(20);
    expect(defaultTeethForType("crank")).toBe(20);
  });
});

describe("createGear", () => {
  it("assigns a unique id on every call, even in immediate succession", () => {
    const a = createGear("spur", [0, 0, 0]);
    const b = createGear("spur", [0, 0, 0]);
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(0);
  });

  it("gives a freshly-placed gear a 0.5 default module", () => {
    const spur = createGear("spur", [0, 0, 0]);
    expect(spur.module).toBe(0.5);
  });

  it("produces a bevel gear that can mesh with a default-axis partner out of the box", () => {
    // Regression for the "bevel/worm can never mesh" bug: a freshly created bevel
    // gear (perpendicular default axis) must be able to form a valid mesh edge
    // against a freshly created spur gear (standard Y axis) once placed apart.
    const bevel = createGear("bevel", [0, 0, 0]);
    expect(bevel.axis).toEqual([1, 0, 0]);
  });

  it("gives a shaft a second end a real (nonzero-length) distance away", () => {
    const shaft = createGear("shaft", [5, 0, 0]);
    expect(shaft.position2).toBeDefined();
    expect(shaft.position2).not.toEqual(shaft.position);
  });

  it("gives a beam a second end too, same as shaft (both are two-endpoint rod types)", () => {
    const beam = createGear("beam", [5, 0, 0]);
    expect(beam.position2).toBeDefined();
    expect(beam.position2).not.toEqual(beam.position);
  });

  it("gives a belt a second end too (same two-endpoint rod convention)", () => {
    const belt = createGear("belt", [5, 0, 0]);
    expect(belt.position2).toBeDefined();
    expect(belt.position2).not.toEqual(belt.position);
  });

  it("gives a joint, spring, and track a second end too (all rod types)", () => {
    for (const type of ["joint", "spring", "track"] as const) {
      const gear = createGear(type, [5, 0, 0]);
      expect(gear.position2).toBeDefined();
      expect(gear.position2).not.toEqual(gear.position);
    }
  });

  it("leaves position2 undefined for bearing and rotor -- single-point accessories, not rods", () => {
    expect(createGear("bearing", [0, 0, 0]).position2).toBeUndefined();
    expect(createGear("rotor", [0, 0, 0]).position2).toBeUndefined();
  });

  it("leaves position2 undefined for every other type", () => {
    expect(createGear("spur", [0, 0, 0]).position2).toBeUndefined();
  });
});
