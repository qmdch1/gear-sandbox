// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping, idealConnectionDistance, meshPhaseAlignment } from "../../src/sim/meshing";
import type { GearInstance } from "../../src/sim/types";

/** Independent reimplementation of the tooth phase check, used only to verify
 *  `meshPhaseAlignment`'s output actually produces centered alignment -- not a
 *  copy of the source function. */
function toothPhase(teeth: number, rotation: number, worldAngle: number): number {
  const localAngle = -worldAngle - rotation;
  const pitch = (Math.PI * 2) / teeth;
  return (((localAngle % pitch) + pitch) % pitch) / pitch;
}

/** Same idea as `toothPhase`, but for a bevel gear's own Y-Z rotation plane, where
 *  the world-angle relation is `worldAngleYZ = phi + rotation - PI` (see meshing.ts's
 *  bevel derivation) instead of the +Y-axis profile types' `-(local + rotation)`. */
function bevelToothPhase(teeth: number, rotation: number, worldAngleYZ: number): number {
  const phi = worldAngleYZ - rotation + Math.PI;
  const pitch = (Math.PI * 2) / teeth;
  return (((phi % pitch) + pitch) % pitch) / pitch;
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

  it("does not mesh a spur gear with a helical gear, even at the right distance and parallel axes", () => {
    // Real gears: a 0°-helix spur gear can't properly mesh with an angled-tooth
    // helical gear even on parallel shafts -- only with another 0°-helix gear.
    const spur = makeGear({ id: "spur", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(spur, helical)).toBeNull();
  });

  it("meshes two helical gears with each other, same as two spur gears", () => {
    const a = makeGear({ id: "a", type: "helical", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "helical", teeth: 10, module: 1, position: [15, 0, 0] });
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("meshes a spur gear with a crank -- both mechanically plain (0°-helix) gears", () => {
    const spur = makeGear({ id: "spur", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });
    const crank = makeGear({ id: "crank", type: "crank", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(spur, crank)).not.toBeNull();
  });

  it("does not mesh a helical gear with a crank (plain 0°-helix vs. angled-tooth)", () => {
    const helical = makeGear({ id: "helical", type: "helical", teeth: 20, module: 1, position: [0, 0, 0] });
    const crank = makeGear({ id: "crank", type: "crank", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(helical, crank)).toBeNull();
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

  it("meshes a bevel gear with a plain spur/crank gear on a perpendicular axis", () => {
    const bevel = makeGear({ id: "bevel", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const spur = makeGear({ id: "spur", type: "spur", axis: [0, 1, 0], teeth: 20, module: 1, position: [20, 0, 0] });
    expect(evaluatePair(bevel, spur)).not.toBeNull();
  });

  it("does not mesh a bevel gear with a helical gear (straight vs. angled teeth)", () => {
    const bevel = makeGear({ id: "bevel", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", axis: [0, 1, 0], teeth: 20, module: 1, position: [20, 0, 0] });
    expect(evaluatePair(bevel, helical)).toBeNull();
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

  it("couples a worm onto a coincident crank even at their DEFAULT (mismatched) axes", () => {
    // Regression: a worm defaults to the +X axis and a crank defaults to +Y --
    // requiring the powering gear's axis to match the worm's own (as this used to)
    // meant a worm could never actually be powered through the normal "just drop a
    // crank on it" flow, since nothing in the UI can reorient either one's axis.
    const crank = makeGear({ id: "crank", type: "crank", axis: [0, 1, 0], position: [0, 0, 0] });
    const worm = makeGear({ id: "worm", type: "worm", axis: [1, 0, 0], teeth: 1, module: 1, position: [0, 0, 0] });
    const edge = evaluatePair(crank, worm);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("does not let two worms couple to each other", () => {
    const wormA = makeGear({ id: "wa", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    const wormB = makeGear({ id: "wb", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    expect(evaluatePair(wormA, wormB)).toBeNull();
  });

  it("couples a shaft's near end to a coincident, axis-aligned host", () => {
    const shaft = makeGear({ id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const host = makeGear({ id: "host", axis: [1, 0, 0], position: [0, 0, 0] }); // rod runs along +X, host's axis is +X too
    const edge = evaluatePair(shaft, host);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("couples a shaft's FAR end to a different coincident, axis-aligned host", () => {
    const shaft = makeGear({ id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const host = makeGear({ id: "host", axis: [1, 0, 0], position: [20, 0, 0] });
    const edge = evaluatePair(shaft, host);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
  });

  it("does not couple a shaft to a host whose axis isn't parallel to the rod's own direction", () => {
    // A straight rigid rod can't stand in for a coupling to a shaft pointing a
    // different way -- same reasoning a real motor-shaft coupling has to line up.
    const shaft = makeGear({ id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const host = makeGear({ id: "host", axis: [0, 1, 0], position: [0, 0, 0] }); // rod along +X, host axis +Y
    expect(evaluatePair(shaft, host)).toBeNull();
  });

  it("does not let two shafts couple to each other", () => {
    const shaftA = makeGear({ id: "sa", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const shaftB = makeGear({ id: "sb", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    expect(evaluatePair(shaftA, shaftB)).toBeNull();
  });

  it("couples a crank directly onto a coincident helical gear's shaft, so it can receive power", () => {
    // A helical gear only meshes with another helical gear (its teeth are angled,
    // a plain crank's aren't) -- without this coupling it could never spin at all,
    // since nothing else ever starts spinning on its own.
    const crank = makeGear({ id: "crank", type: "crank", axis: [0, 1, 0], position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const edge = evaluatePair(crank, helical);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.oneWay).toBe("none");
  });

  it("does not couple a crank to a helical gear that isn't coincident with it (that's still a plain tooth-mesh distance, which doesn't work)", () => {
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(crank, helical)).toBeNull();
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

  it("couples a wheel the same way a load object does", () => {
    const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
    const wheel = makeGear({ id: "w", type: "wheel", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
    const edge = evaluatePair(gear, wheel);
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

  it("returns 0 (coincident) for a crank-onto-helical shaft coupling", () => {
    const crank = makeGear({ id: "crank", type: "crank", position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", teeth: 20, module: 1, position: [999, 0, 0] });
    expect(idealConnectionDistance(crank, helical)).toBe(0);
  });

  it("returns 0 (coincident) for a shaft/host pair with the rod parallel to the host's axis", () => {
    const shaft = makeGear({ id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const host = makeGear({ id: "host", axis: [1, 0, 0], position: [999, 0, 0] }); // distance shouldn't matter
    expect(idealConnectionDistance(shaft, host)).toBe(0);
  });

  it("returns null for a shaft/host pair whose axis isn't parallel to the rod", () => {
    const shaft = makeGear({ id: "shaft", type: "shaft", teeth: 0, position: [0, 0, 0], position2: [20, 0, 0] });
    const host = makeGear({ id: "host", axis: [0, 1, 0], position: [999, 0, 0] });
    expect(idealConnectionDistance(shaft, host)).toBeNull();
  });

  it("returns null for a spur/helical pair -- they never mesh regardless of distance", () => {
    const spur = makeGear({ id: "spur", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", teeth: 10, module: 1, position: [999, 0, 0] });
    expect(idealConnectionDistance(spur, helical)).toBeNull();
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

  it("returns null for a bevel/helical pair regardless of distance -- straight vs. angled teeth", () => {
    const bevel = makeGear({ id: "bevel", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const helical = makeGear({ id: "helical", type: "helical", axis: [0, 1, 0], teeth: 20, module: 1, position: [999, 0, 0] });
    expect(idealConnectionDistance(bevel, helical)).toBeNull();
  });
});

describe("meshPhaseAlignment", () => {
  it("corrects the angle so the dragged gear's tooth-center lands exactly on the partner's gap-center", () => {
    // Regression: offsetting purely from whatever phase the partner's raw contact
    // angle happened to land on ("anti-phase") avoids a material clash, but can still
    // mesh off-center within the gap -- this asserts the actual centers line up.
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.37 });
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [0, 0, 0] });
    const rawWorldAngleTowardPartner = 1.0; // an arbitrary raw drag angle, not aligned to any detent

    const alignment = meshPhaseAlignment(dragged, rawWorldAngleTowardPartner, partner);
    expect(alignment).not.toBeNull();

    const partnerPhaseAtContact = toothPhase(partner.teeth, partner.rotation, alignment!.worldAngleTowardPartner + Math.PI);
    const draggedPhaseAtContact = toothPhase(dragged.teeth, alignment!.rotation, alignment!.worldAngleTowardPartner);

    expect(partnerPhaseAtContact).toBeCloseTo(0.5, 5); // gap-center
    expect(draggedPhaseAtContact).toBeCloseTo(0, 5); // tooth-center
  });

  it("snaps to the nearest valid detent to the raw angle, not an arbitrary one further around the gear", () => {
    const partner = makeGear({ id: "partner", teeth: 4, module: 1, position: [0, 0, 0], rotation: 0 }); // pitch = 90°
    const dragged = makeGear({ id: "dragged", teeth: 4, module: 1, position: [0, 0, 0] });
    const rawWorldAngleTowardPartner = 0.1; // close to 0

    const alignment = meshPhaseAlignment(dragged, rawWorldAngleTowardPartner, partner);
    expect(alignment).not.toBeNull();
    const pitch = (Math.PI * 2) / partner.teeth;
    const angleDiff = Math.abs(alignment!.worldAngleTowardPartner - rawWorldAngleTowardPartner);
    expect(angleDiff).toBeLessThanOrEqual(pitch / 2 + 1e-9);
  });

  it("returns null for a pair that includes a type with no tooth profile (e.g. load)", () => {
    const gear = makeGear({ id: "g", position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [0, 0, 0] });
    expect(meshPhaseAlignment(gear, 0, load)).toBeNull();
  });

  it("returns null when either gear isn't on the world +Y axis (e.g. a bevel pair)", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, position: [20, 0, 0] });
    expect(meshPhaseAlignment(a, 0, b)).toBeNull();
  });

  it("aligns a dragged bevel gear's tooth-center to face a stationary spur partner (same height)", () => {
    const partner = makeGear({ id: "partner", type: "spur", teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.37 });
    const dragged = makeGear({ id: "dragged", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0] });

    const alignment = meshPhaseAlignment(dragged, 1.0, partner);
    expect(alignment).not.toBeNull();

    const partnerPhaseAtContact = toothPhase(partner.teeth, partner.rotation, alignment!.worldAngleTowardPartner + Math.PI);
    expect(partnerPhaseAtContact).toBeCloseTo(0.5, 5); // gap-center, same rule as a same-axis pair

    const contactAngleYZ = Math.atan2(Math.sin(alignment!.worldAngleTowardPartner), 0);
    const draggedPhaseAtContact = bevelToothPhase(dragged.teeth, alignment!.rotation, contactAngleYZ);
    expect(draggedPhaseAtContact).toBeCloseTo(0, 5); // tooth-center facing the partner
  });

  it("sets a dragged spur gear's tooth-center to face a stationary bevel partner (same height)", () => {
    const partner = makeGear({ id: "partner", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.9 });
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });

    const alignment = meshPhaseAlignment(dragged, 1.2, partner);
    expect(alignment).not.toBeNull();
    // The bevel partner's rotation is fixed and (per the same-height derivation) its
    // contact angle doesn't depend on the exact raw angle, only which side -- so there's
    // no detent to round the placement angle to; only dragged's own rotation is set.
    expect(alignment!.worldAngleTowardPartner).toBeCloseTo(1.2, 10);
    expect(alignment!.rotation).toBeCloseTo(-1.2, 10);
  });

  it("returns null for a bevel/profile-type pair at different heights (not solved for yet)", () => {
    const partner = makeGear({ id: "partner", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });
    const dragged = makeGear({ id: "dragged", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 5, 0] });
    expect(meshPhaseAlignment(dragged, 1.0, partner)).toBeNull();
  });

  it("returns null for a bevel/helical pair -- they don't mesh at all, so there's no phase to align", () => {
    const partner = makeGear({ id: "partner", type: "helical", teeth: 20, module: 1, position: [0, 0, 0] });
    const dragged = makeGear({ id: "dragged", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    expect(meshPhaseAlignment(dragged, 1.0, partner)).toBeNull();
  });

  it("centers a stationary wheel's gap on a dragged worm, leaving the worm's own rotation untouched", () => {
    // A worm's thread is one continuous helix, not discrete teeth -- unlike bevel,
    // there's no rotational phase of the worm's OWN that could clash, so only the
    // wheel side needs centering.
    const partner = makeGear({ id: "partner", type: "spur", teeth: 20, module: 1, position: [0, 0, 0], rotation: 0.6 });
    const dragged = makeGear({ id: "dragged", type: "worm", axis: [1, 0, 0], teeth: 1, module: 1, position: [0, 0, 0], rotation: 1.9 });

    const alignment = meshPhaseAlignment(dragged, 1.0, partner);
    expect(alignment).not.toBeNull();
    expect(alignment!.rotation).toBe(dragged.rotation); // untouched

    const partnerPhaseAtContact = toothPhase(partner.teeth, partner.rotation, alignment!.worldAngleTowardPartner + Math.PI);
    expect(partnerPhaseAtContact).toBeCloseTo(0.5, 5); // gap-center
  });

  it("sets a dragged spur gear's tooth-center to face a stationary worm partner", () => {
    const partner = makeGear({ id: "partner", type: "worm", axis: [1, 0, 0], teeth: 1, module: 1, position: [0, 0, 0], rotation: 0.4 });
    const dragged = makeGear({ id: "dragged", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });

    const alignment = meshPhaseAlignment(dragged, 1.3, partner);
    expect(alignment).not.toBeNull();
    expect(alignment!.worldAngleTowardPartner).toBeCloseTo(1.3, 10); // no detent to round to against the worm's continuous thread
    expect(alignment!.rotation).toBeCloseTo(-1.3, 10);
  });

  it("returns null for a worm/profile-type pair at different heights (not solved for yet)", () => {
    const partner = makeGear({ id: "partner", type: "spur", teeth: 20, module: 1, position: [0, 0, 0] });
    const dragged = makeGear({ id: "dragged", type: "worm", axis: [1, 0, 0], teeth: 1, module: 1, position: [0, 5, 0] });
    expect(meshPhaseAlignment(dragged, 1.0, partner)).toBeNull();
  });
});
