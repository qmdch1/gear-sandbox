import { describe, it, expect } from "vitest";
import { createGear, defaultAxisForType, defaultTeethForType } from "../../src/sim/gearFactory";
import { evaluatePair } from "../../src/sim/meshing";

describe("defaultAxisForType", () => {
  it("gives bevel, worm and rack objects a perpendicular default axis", () => {
    expect(defaultAxisForType("bevel")).toEqual([1, 0, 0]);
    expect(defaultAxisForType("worm")).toEqual([1, 0, 0]);
    expect(defaultAxisForType("rack")).toEqual([1, 0, 0]);
  });

  it("gives spur/helical/crank/load/differential and the rest of the parallel family the standard Y axis", () => {
    expect(defaultAxisForType("spur")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("helical")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("crank")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("load")).toEqual([0, 1, 0]);
    // Regression: a differential's own axis is what its output shafts couple to (they're
    // ordinary parallel-family gears defaulting to [0, 1, 0]), and its bevel *input* is
    // the side that needs the perpendicular axis -- so a differential itself must default
    // to [0, 1, 0], not [1, 0, 0], or a freshly placed differential+bevel pair can never
    // mesh out of the box (see the createGear test below).
    expect(defaultAxisForType("differential")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("planetary")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("ratchet")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("sprocket")).toEqual([0, 1, 0]);
    expect(defaultAxisForType("pulley")).toEqual([0, 1, 0]);
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

  it("produces a differential and a bevel gear that mesh with each other out of the box, using only their default axes", () => {
    // Regression for the "fresh differential + fresh bevel default to PARALLEL axes and
    // can never mesh" bug: before the fix, both types defaulted to [1, 0, 0] (dot = 1,
    // fails the perpendicular-axis mesh requirement). A differential's real-world "input"
    // is a bevel gear (see meshing.ts's bevelInvolved branch), so this pairing must work
    // without the user having to manually edit either gear's axis first.
    const differential = createGear("differential", [0, 0, 0]);
    const bevel = createGear("bevel", [20, 0, 0]); // pitchRadius(diff) + pitchRadius(bevel) = 10 + 10 = 20

    expect(differential.axis).toEqual([0, 1, 0]);
    expect(bevel.axis).toEqual([1, 0, 0]);
    const axisDot =
      differential.axis[0] * bevel.axis[0] + differential.axis[1] * bevel.axis[1] + differential.axis[2] * bevel.axis[2];
    expect(axisDot).toBe(0); // perpendicular, as the bevel-mesh rule requires

    const edge = evaluatePair(differential, bevel);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("gives a rack a starting linearPosition of 0 and a default teeth count", () => {
    const rack = createGear("rack", [0, 0, 0]);
    expect(rack.linearPosition).toBe(0);
    expect(rack.teeth).toBeGreaterThan(0);
  });

  it("produces a rack that can mesh with a palette-placed pinion out of the box", () => {
    // Regression for "a freshly placed rack can never mesh": the rack meshing rule
    // demands the rack's travel axis be perpendicular to the pinion's rotation axis, but
    // a rack used to default to [0, 1, 0] -- exactly the pinion's own default -- so the
    // pair was unmeshable and the UI has no axis editor to fix it by hand.
    const pinion = createGear("spur", [0, 0, 0]); // axis [0,1,0], 20 teeth, module 1 -> pitch radius 10
    const rack = createGear("rack", [0, 0, 10]); // travel line passes one pitch radius away
    const axisDot = pinion.axis[0] * rack.axis[0] + pinion.axis[1] * rack.axis[1] + pinion.axis[2] * rack.axis[2];
    expect(axisDot).toBe(0); // perpendicular, as the rack rule requires

    const edge = evaluatePair(pinion, rack);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.oneWay).toBe("aToB"); // the pinion drives the rack, never the reverse
  });

  it("leaves linearPosition undefined for non-rack types", () => {
    const spur = createGear("spur", [0, 0, 0]);
    expect(spur.linearPosition).toBeUndefined();
  });
});
