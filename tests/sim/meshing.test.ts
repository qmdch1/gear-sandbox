// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping, computeMeshPhaseOffset } from "../../src/sim/meshing";
import type { GearInstance } from "../../src/sim/types";

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
});

describe("v2 object types", () => {
  it("meshes a planetary set with a spur gear using the same parallel-axis rule as spur-to-spur", () => {
    const planetary = makeGear({ id: "p", type: "planetary", teeth: 40, module: 1, position: [0, 0, 0] });
    const spur = makeGear({ id: "s", teeth: 10, module: 1, position: [25, 0, 0] }); // (40+10)/2=25
    const edge = evaluatePair(planetary, spur);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("lets a driving gear turn a ratchet but marks the edge one-way so the ratchet can't back-drive it", () => {
    const driver = makeGear({ id: "d", teeth: 20, module: 1, position: [0, 0, 0] });
    const ratchet = makeGear({ id: "r", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });
    const edge = evaluatePair(driver, ratchet)!;
    expect(edge.oneWay).toBe("aToB"); // a=driver, b=ratchet: only a->b allowed
  });

  it("does not mesh two ratchets with each other", () => {
    const r1 = makeGear({ id: "r1", type: "ratchet", teeth: 10, module: 1, position: [0, 0, 0] });
    const r2 = makeGear({ id: "r2", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(r1, r2)).toBeNull();
  });

  it("meshes a rack with a perpendicular-axis pinion at the correct line distance, one-way from the pinion", () => {
    const pinion = makeGear({ id: "pin", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    // pinion pitch radius = 10; rack's travel line runs along x=[1,0,0]... place the rack so
    // its axis (travel direction) is perpendicular to the pinion's rotation axis, offset by
    // the pinion's pitch radius along z.
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const edge = evaluatePair(pinion, rack)!;
    expect(edge).not.toBeNull();
    expect(edge.oneWay).toBe("aToB"); // a=pinion drives b=rack
  });

  it("does not mesh two racks with each other", () => {
    const r1 = makeGear({ id: "r1", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const r2 = makeGear({ id: "r2", type: "rack", teeth: 8, module: 1, position: [5, 0, 0], axis: [1, 0, 0] });
    expect(evaluatePair(r1, r2)).toBeNull();
  });

  it("meshes a differential's input like a bevel gear (perpendicular axis, pitch-radius-sum distance)", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const inputBevel = makeGear({ id: "in", type: "bevel", teeth: 15, module: 1, position: [22.5, 0, 0], axis: [1, 0, 0] });
    const edge = evaluatePair(diff, inputBevel);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("couples a differential's two output shafts as coincident 1:1 couplings, same as a load object", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const edge = evaluatePair(diff, outputA)!;
    expect(edge.kind).toBe("coupling");
    expect(edge.ratio).toBe(1);
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

function isTooth(theta: number, teeth: number): boolean {
  const period = (Math.PI * 2) / teeth;
  const m = ((theta % period) + period) % period;
  return m < period / 2;
}

describe("computeMeshPhaseOffset", () => {
  it("produces a complementary tooth/gap phase at the contact point for a parallel-axis pair", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.4 });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], axis: [0, 1, 0], rotation: -1.1 });
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    const bFixed = { ...b, rotation: b.rotation + offset };

    const dirAB: [number, number, number] = [1, 0, 0]; // b is at +x from a here
    const thetaA = Math.atan2(0, 1) - a.rotation; // direction toward b, in a's local frame, minus a's rotation
    const thetaB = Math.atan2(0, -1) - bFixed.rotation; // direction toward a, in b's local frame
    expect(isTooth(thetaA, a.teeth)).not.toBe(isTooth(thetaB, b.teeth));
  });

  it("produces a complementary phase for a perpendicular-axis (bevel-style) pair too", () => {
    const a = makeGear({ id: "a", type: "bevel", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.9 });
    const b = makeGear({ id: "b", type: "bevel", teeth: 20, module: 1, position: [20, 0, 0], axis: [1, 0, 0], rotation: -0.3 });
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    expect(Number.isFinite(offset)).toBe(true);
    expect(Math.abs(offset)).toBeLessThanOrEqual((Math.PI * 2) / b.teeth); // within one full tooth period (nearest representative)
  });

  it("returns a small (nearest-representative) offset, not an arbitrary multi-turn jump", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 100 }); // many turns already
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    expect(Math.abs(offset)).toBeLessThanOrEqual((Math.PI * 2) / b.teeth);
  });
});
