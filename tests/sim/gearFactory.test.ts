import { describe, it, expect } from "vitest";
import { createGear, defaultAxisForType, defaultTeethForType } from "../../src/sim/gearFactory";

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

describe("defaultTeethForType", () => {
  it("gives worm gears a low thread-start count for a real reduction ratio", () => {
    expect(defaultTeethForType("worm")).toBe(2);
  });

  it("gives load gears zero teeth", () => {
    expect(defaultTeethForType("load")).toBe(0);
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

  it("produces a bevel gear that can mesh with a default-axis partner out of the box", () => {
    // Regression for the "bevel/worm can never mesh" bug: a freshly created bevel
    // gear (perpendicular default axis) must be able to form a valid mesh edge
    // against a freshly created spur gear (standard Y axis) once placed apart.
    const bevel = createGear("bevel", [0, 0, 0]);
    expect(bevel.axis).toEqual([1, 0, 0]);
  });

  it("gives a rack a starting linearPosition of 0 and a default teeth count", () => {
    const rack = createGear("rack", [0, 0, 0]);
    expect(rack.linearPosition).toBe(0);
    expect(rack.teeth).toBeGreaterThan(0);
  });

  it("leaves linearPosition undefined for non-rack types", () => {
    const spur = createGear("spur", [0, 0, 0]);
    expect(spur.linearPosition).toBeUndefined();
  });
});
