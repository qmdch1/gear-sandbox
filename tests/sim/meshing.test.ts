// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping, idealConnectionDistance, meshPhaseRotation } from "../../src/sim/meshing";
import type { GearInstance } from "../../src/sim/types";

/** Independent reimplementation of the tooth phase check, used only to verify
 *  `meshPhaseRotation`'s output actually produces anti-phase alignment -- not a
 *  copy of the source function. */
function toothPhase(teeth: number, rotation: number, worldAngle: number): number {
  const localAngle = -worldAngle - rotation;
  const pitch = (Math.PI * 2) / teeth;
  return (((localAngle % pitch) + pitch) % pitch) / pitch;
}

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

describe("evaluatePair", () => {
  it("meshes two spur gears at the correct center distance with parallel axes", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }); // (20+10)/2=15
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(2); // 20/10
    expect(edge!.oneWay).toBe("none");
  });

  it("rejects two spur gears placed too far apart", () => {
    const a = makeGear({ id: "a", position: [0, 0, 0] });
    const b = makeGear({ id: "b", position: [50, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("rejects two spur gears with non-parallel axes", () => {
    const a = makeGear({ id: "a", axis: [0, 1, 0], position: [0, 0, 0] });
    const b = makeGear({ id: "b", axis: [1, 0, 0], position: [15, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("meshes a bevel pair only with perpendicular axes", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [20, 0, 0] });
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.oneWay).toBe("none");
  });

  it("marks a worm-to-wheel edge one-way from the worm", () => {
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1, position: [0, 0, 0] });
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1, position: [11, 0, 0] });
    const edge = evaluatePair(worm, wheel);
    expect(edge).not.toBeNull();
    expect(edge!.oneWay).toBe("aToB"); // a === worm
  });

  it("couples a worm directly onto a coincident driving shaft (e.g. a crank), so it can receive power", () => {
    const crank = makeGear({ id: "crank", type: "crank", axis: [0, 1, 0], position: [0, 0, 0] });
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1, position: [0, 0, 0] });
    const edge = evaluatePair(crank, worm);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.oneWay).toBe("none");
  });

  it("does not let two worms couple to each other", () => {
    const wormA = makeGear({ id: "wa", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    const wormB = makeGear({ id: "wb", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    expect(evaluatePair(wormA, wormB)).toBeNull();
  });

  it("couples a load object directly onto a coincident, axis-aligned gear", () => {
    const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
    const edge = evaluatePair(gear, load);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
  });

  it("does not couple a load object that is not coincident with a gear", () => {
    const gear = makeGear({ id: "g", position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [5, 0, 0] });
    expect(evaluatePair(gear, load)).toBeNull();
  });

  it("couples a gauge (RPM indicator) the same way a load object does", () => {
    const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
    const gauge = makeGear({ id: "gg", type: "gauge", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
    const edge = evaluatePair(gear, gauge);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("couples a fan the same way a load object does", () => {
    const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
    const fan = makeGear({ id: "f", type: "fan", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
    const edge = evaluatePair(gear, fan);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("does not couple two accessory objects (gauge, fan, load) to each other", () => {
    const gauge = makeGear({ id: "gg", type: "gauge", teeth: 0, position: [0, 0, 0] });
    const fan = makeGear({ id: "f", type: "fan", teeth: 0, position: [0, 0, 0] });
    expect(evaluatePair(gauge, fan)).toBeNull();
  });
});

describe("isOverlapping", () => {
  it("flags two gears placed closer than a valid mesh distance", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [5, 0, 0] }); // expected 15, actual 5
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("does not flag correctly meshed gears as overlapping", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(isOverlapping(a, b)).toBe(false);
  });

  it("does not flag a coincident load coupling as overlapping, even though it's geometrically close", () => {
    const gear = makeGear({ id: "g", teeth: 20, module: 1, position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [0, 0, 0] });
    expect(isOverlapping(gear, load)).toBe(false);
  });

  it("flags two distinct, coincident (both at the origin) spur gears as overlapping", () => {
    // Regression: the old `centerDistance > 0.001` floor made two gears placed at
    // the exact same spot (e.g. double-clicking the palette) fail to register as
    // overlapping, even though they geometrically fully overlap.
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 20, module: 1, position: [0, 0, 0] });
    expect(isOverlapping(a, b)).toBe(true);
  });
});

describe("idealConnectionDistance", () => {
  it("returns the pitch-radius sum for a parallel-family pair, regardless of current distance", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [999, 0, 0] }); // nowhere near ideal
    expect(idealConnectionDistance(a, b)).toBeCloseTo(15); // (20+10)/2
  });

  it("returns 0 (coincident) for a load coupling", () => {
    const gear = makeGear({ id: "g", position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [999, 0, 0] });
    expect(idealConnectionDistance(gear, load)).toBe(0);
  });

  it("returns null for axes that could never align (e.g. two parallel-family gears at right angles)", () => {
    const a = makeGear({ id: "a", axis: [0, 1, 0], position: [0, 0, 0] });
    const b = makeGear({ id: "b", axis: [1, 0, 0], position: [999, 0, 0] });
    expect(idealConnectionDistance(a, b)).toBeNull();
  });

  it("returns the pitch-radius sum for a bevel pair on perpendicular axes", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [999, 0, 0] });
    expect(idealConnectionDistance(a, b)).toBeCloseTo(20); // (20+20)/2
  });
});

describe("meshPhaseRotation", () => {
  it("produces a rotation that puts the dragged gear exactly anti-phase with the partner at the contact point", () => {
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.37 });
    const draggedPosition: [number, number, number] = [15, 0, 0]; // teeth 10 + teeth 20, module 1 -> ideal 15
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: draggedPosition });

    const rotation = meshPhaseRotation(dragged, draggedPosition, partner);
    expect(rotation).not.toBeNull();

    const worldAngleTowardPartner = Math.atan2(0 - 0, 0 - 15); // atan2(dz, dx) from dragged to partner
    const partnerPhaseAtContact = toothPhase(partner.teeth, partner.rotation, worldAngleTowardPartner + Math.PI);
    const draggedPhaseAtContact = toothPhase(dragged.teeth, rotation!, worldAngleTowardPartner);

    const rawDelta = draggedPhaseAtContact - partnerPhaseAtContact;
    const phaseDelta = ((rawDelta % 1) + 1) % 1; // wrap into [0, 1)
    expect(phaseDelta).toBeCloseTo(0.5, 5);
  });

  it("returns null for a pair that includes a type with no tooth profile (e.g. load)", () => {
    const gear = makeGear({ id: "g", position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [0, 0, 0] });
    expect(meshPhaseRotation(gear, [0, 0, 0], load)).toBeNull();
  });

  it("returns null when either gear isn't on the world +Y axis (e.g. a bevel pair)", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, position: [20, 0, 0] });
    expect(meshPhaseRotation(a, [0, 0, 0], b)).toBeNull();
  });
});
