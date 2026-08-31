// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping, computeMeshPhaseOffset, findMeshPartner, pitchRadius, MESH_TOLERANCE } from "../../src/sim/meshing";
import { buildEdges } from "../../src/sim/graph";
import { propagateRotation } from "../../src/sim/rotation";
import { tick } from "../../src/sim/simulation";
import type { GearInstance, LayoutState } from "../../src/sim/types";

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

  // Unlike bevel/rack, spur only ever had a "clearly within" test (distance=15, no
  // tolerance involved) and a "clearly too far" test (distance=50, nowhere near the
  // boundary) above -- neither exercises MESH_TOLERANCE itself. teeth=20/module=1 and
  // teeth=10/module=1 give expected = pitchRadius(a) + pitchRadius(b) = 10 + 5 = 15, so
  // the tolerance band (|centerDistance - expected| <= expected * 0.05, inclusive) is
  // exactly [14.25, 15.75] -- mirrored here in the same style as the bevel-focus track's
  // boundary tests above for consistency.
  it("meshes two spur gears at exactly the distance-tolerance boundary (15.75 = 15 + 15*0.05)", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15.75, 0, 0] });
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("rejects two spur gears just past the distance-tolerance boundary", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15.7501, 0, 0] });
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

  // meshing.ts hard-codes PERP_DOT_THRESHOLD = 0.1: the perpendicular-axis mesh check
  // (step 5) rejects a pair when |dot(a.axis, b.axis)| > PERP_DOT_THRESHOLD (equality
  // still passes, since the reject condition is a strict `>`). Rotating b's axis by an
  // angle `delta` away from perpendicular, within the plane spanned by a's and b's axes
  // -- a = [0,1,0], b = [cos(delta), sin(delta), 0] -- gives dot(a.axis, b.axis) =
  // sin(delta) EXACTLY (not just an approximation), so the boundary angle is precisely
  // delta_max = asin(0.1) = 0.10016742116155944 rad = 5.739170477266787 deg.
  it("meshes a bevel pair whose axes deviate from perpendicular by just inside the tolerance boundary", () => {
    const boundary = Math.asin(0.1);
    const delta = boundary - 1e-4; // ~5.7334 deg off perpendicular -- dot ~= 0.099900 < 0.1
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({
      id: "b", type: "bevel", teeth: 20, module: 1, position: [20, 0, 0],
      axis: [Math.cos(delta), Math.sin(delta), 0],
    });
    const axisDot = a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2];
    expect(Math.abs(axisDot)).toBeLessThan(0.1); // confirms we're really testing the "just inside" side
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("rejects a bevel pair whose axes deviate from perpendicular by just outside the tolerance boundary", () => {
    const boundary = Math.asin(0.1);
    const delta = boundary + 1e-4; // ~5.7449 deg off perpendicular -- dot ~= 0.100099 > 0.1
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({
      id: "b", type: "bevel", teeth: 20, module: 1, position: [20, 0, 0],
      axis: [Math.cos(delta), Math.sin(delta), 0],
    });
    const axisDot = a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2];
    expect(Math.abs(axisDot)).toBeGreaterThan(0.1); // confirms we're really testing the "just outside" side
    expect(evaluatePair(a, b)).toBeNull();
  });

  // meshing.ts's MESH_TOLERANCE = 0.05: the distance check passes when
  // |centerDistance - expected| <= expected * 0.05 (inclusive). For two 20-tooth,
  // module-1 bevel gears, expected = pitchRadius(a) + pitchRadius(b) = 10 + 10 = 20,
  // so the tolerance band is exactly [19, 21].
  it("meshes a bevel pair at exactly the distance-tolerance boundary (21 = 20 + 20*0.05)", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [21, 0, 0] });
    expect(evaluatePair(a, b)).not.toBeNull();
  });

  it("rejects a bevel pair just past the distance-tolerance boundary", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [21.0001, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("meshes a bevel pair consistently regardless of argument order (a,b vs b,a)", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 12, module: 1, position: [16, 0, 0] }); // (10+6)=16
    const ab = evaluatePair(a, b);
    const ba = evaluatePair(b, a);
    expect(ab).not.toBeNull();
    expect(ba).not.toBeNull();
    expect(ab!.kind).toBe(ba!.kind);
    expect(ab!.oneWay).toBe(ba!.oneWay);
    expect(ab!.oneWay).toBe("none");
    // ratio is directional (a.teeth / b.teeth by design -- same convention as every other
    // gear-type family in evaluatePair), so swapping the argument order must give the
    // reciprocal ratio, not an inconsistent/broken value.
    expect(ab!.ratio).toBeCloseTo(20 / 12);
    expect(ba!.ratio).toBeCloseTo(12 / 20);
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

describe("helical gear physics (identical to spur -- helix angle is purely visual)", () => {
  // This is a purely kinematic sandbox: it explicitly does not model torque/forces (see
  // GEAR_NOTES on differential/planetary). In real life a helical gear's twist changes
  // how forces are transmitted (axial thrust, true contact ratio), but the rotational
  // SPEED ratio between two meshing gears of the same normal module is teeth-count-based
  // regardless of helix angle -- so evaluatePair() putting "helical" in the exact same
  // PARALLEL_FAMILY set as "spur" (meshing.ts), with no helix-angle-aware branch anywhere
  // in the file, is the physically correct design, not an oversight. This test pins that
  // down with a concrete numeric example against a plain spur-to-spur baseline computed
  // from the exact same inputs, so a future change that starts treating helical
  // differently can't slip in silently.
  it("gives a helical-to-spur AND a helical-to-helical mesh the exact same ratio/distance/axis outcome as a plain spur-to-spur mesh at the same numbers", () => {
    const spurBaseline = evaluatePair(
      makeGear({ id: "s1", type: "spur", teeth: 24, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "s2", type: "spur", teeth: 12, module: 1, position: [18, 0, 0] }), // (24+12)/2 = 18
    )!;
    expect(spurBaseline.kind).toBe("mesh");
    expect(spurBaseline.ratio).toBeCloseTo(2); // 24/12
    expect(spurBaseline.oneWay).toBe("none");

    const helicalToSpur = evaluatePair(
      makeGear({ id: "h1", type: "helical", teeth: 24, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "s2", type: "spur", teeth: 12, module: 1, position: [18, 0, 0] }),
    );
    const helicalToHelical = evaluatePair(
      makeGear({ id: "h1", type: "helical", teeth: 24, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "h2", type: "helical", teeth: 12, module: 1, position: [18, 0, 0] }),
    );

    for (const edge of [helicalToSpur, helicalToHelical]) {
      expect(edge).not.toBeNull();
      expect(edge!.kind).toBe(spurBaseline.kind);
      expect(edge!.ratio).toBeCloseTo(spurBaseline.ratio);
      expect(edge!.oneWay).toBe(spurBaseline.oneWay);
    }
  });

  it("uses the identical pitchRadius formula (module*teeth/2) for a helical gear as every other parallel-family type", () => {
    expect(pitchRadius(makeGear({ type: "helical", teeth: 24, module: 1 }))).toBe(12);
  });

  it("rejects a helical pair placed too far apart, using the same distance tolerance as spur", () => {
    const a = makeGear({ id: "h1", type: "helical", teeth: 24, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "h2", type: "helical", teeth: 12, module: 1, position: [30, 0, 0] }); // expected 18, way off
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("rejects a helical pair with non-parallel axes, using the same axis check as spur", () => {
    const a = makeGear({ id: "h1", type: "helical", teeth: 24, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const b = makeGear({ id: "h2", type: "helical", teeth: 12, module: 1, position: [18, 0, 0], axis: [1, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("meshes a helical-to-helical pair consistently regardless of argument order (a,b vs b,a), same as spur/bevel", () => {
    const a = makeGear({ id: "a", type: "helical", teeth: 24, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "helical", teeth: 12, module: 1, position: [18, 0, 0] });
    const ab = evaluatePair(a, b);
    const ba = evaluatePair(b, a);
    expect(ab).not.toBeNull();
    expect(ba).not.toBeNull();
    expect(ab!.kind).toBe(ba!.kind);
    expect(ab!.oneWay).toBe(ba!.oneWay);
    expect(ab!.oneWay).toBe("none");
    expect(ab!.ratio).toBeCloseTo(24 / 12);
    expect(ba!.ratio).toBeCloseTo(12 / 24);
  });

  it("meshes a helical-to-spur pair consistently regardless of which side is `a`", () => {
    const helical = makeGear({ id: "h", type: "helical", teeth: 20, module: 1, position: [0, 0, 0] });
    const spur = makeGear({ id: "s", type: "spur", teeth: 10, module: 1, position: [15, 0, 0] });
    const hs = evaluatePair(helical, spur);
    const sh = evaluatePair(spur, helical);
    expect(hs).not.toBeNull();
    expect(sh).not.toBeNull();
    expect(hs!.oneWay).toBe("none");
    expect(sh!.oneWay).toBe("none");
    expect(hs!.ratio).toBeCloseTo(20 / 10);
    expect(sh!.ratio).toBeCloseTo(10 / 20);
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

  // Pins down the CURRENT physical treatment of "planetary" precisely, so a future change
  // to what "planetary" means physically can't slip in silently: `evaluatePair` puts
  // "planetary" in the same PARALLEL_FAMILY set as spur/helical/crank and applies the
  // exact same formula (`pitchRadius = module*teeth/2`, `ratio = a.teeth/b.teeth`,
  // `oneWay: "none"`) it would to a plain external spur gear -- it is NOT aware that
  // `planetaryGeometry` (gearGeometry.ts) internally splits `teeth` into separate sun/
  // planet tooth counts for the visual model; the raw `teeth` field is used as-is, as if
  // the whole assembly were a single spur gear with that tooth count.
  it("computes a planetary mesh's ratio straight from the assembly's raw `teeth` field -- exactly the plain-spur-gear formula, with no sun/planet/ring/carrier math involved", () => {
    const planetary = makeGear({ id: "p", type: "planetary", teeth: 60, module: 1, position: [0, 0, 0] });
    const spur = makeGear({ id: "s", teeth: 15, module: 1, position: [37.5, 0, 0] }); // (60+15)/2 = 37.5 -- same center-distance rule as spur-to-spur
    const edge = evaluatePair(planetary, spur);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(4); // 60/15 = 4, the plain a.teeth/b.teeth formula -- planetaryGeometry's internal sun/planet split (13/24 teeth for this same input) plays no part
    expect(edge!.oneWay).toBe("none"); // bidirectional like spur-to-spur, unlike a ratchet/worm edge
  });

  it("gives a planetary set the identical pitchRadius formula (module*teeth/2) as every other parallel-family type, not a reduced 'ring gear only' radius", () => {
    const planetary = makeGear({ id: "p", type: "planetary", teeth: 40, module: 2, position: [0, 0, 0] });
    expect(pitchRadius(planetary)).toBe(40); // module*teeth/2 = 2*40/2 = 40
  });

  it("lets a driving gear turn a ratchet but marks the edge one-way so the ratchet can't back-drive it", () => {
    const driver = makeGear({ id: "d", teeth: 20, module: 1, position: [0, 0, 0] });
    const ratchet = makeGear({ id: "r", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });
    const edge = evaluatePair(driver, ratchet)!;
    expect(edge.oneWay).toBe("aToB"); // a=driver, b=ratchet: only a->b allowed
  });

  // buildEdges (graph.ts) always calls evaluatePair(gears[i], gears[j]) for i<j, so
  // whichever gear the user happened to place first in the layout array ends up as `a` --
  // exactly the same concern the worm tests above pin down for "worm". `evaluatePair`'s
  // ratchet branch reads `a.type === "ratchet"` directly (not "whichever side is called
  // b"), so the one-way direction should already track the ratchet itself regardless of
  // argument position -- this test locks that in rather than assuming it.
  it("still marks the ratchet as the side that cannot back-drive when it is passed as `a` -- oneWay flips to bToA, not silently 'none' or reversed", () => {
    const ratchet = makeGear({ id: "r", type: "ratchet", teeth: 10, module: 1, position: [0, 0, 0] });
    const driver = makeGear({ id: "d", teeth: 20, module: 1, position: [15, 0, 0] });
    const edge = evaluatePair(ratchet, driver)!; // a=ratchet, b=driver (reversed vs. the earlier test)
    expect(edge.oneWay).toBe("bToA"); // b (the driver) is still the only side allowed to drive
  });

  it("keeps the ratchet one-way-locked to its driver's actual speed regardless of which argument order evaluatePair/buildEdges sees", () => {
    const driver = makeGear({ id: "driver", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 5 });
    const ratchet = makeGear({ id: "ratchet", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });

    for (const gears of [[driver, ratchet], [ratchet, driver]]) {
      const edges = buildEdges(gears);
      const { angularVelocities } = propagateRotation(gears, edges);
      expect(angularVelocities.get("driver")).toBe(5); // the driver is never back-driven either way
      expect(angularVelocities.get("ratchet")).toBeCloseTo(-10, 9); // -(20/10) * 5, same physical answer both times
    }
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

  it("keeps the pinion as the sole driver of the rack regardless of which argument position each is passed in", () => {
    // `buildEdges` calls evaluatePair(gears[i], gears[j]) with i<j, so which gear lands in
    // the `a` vs `b` slot depends purely on the order the user happened to place them --
    // the one-way assignment must track "pinion drives rack" through both call shapes,
    // never accidentally flip to "rack drives pinion" (physically meaningless -- a rack
    // has no independent rotation to drive anything with).
    const pinion = makeGear({ id: "pin", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });

    function drivingId(edge: NonNullable<ReturnType<typeof evaluatePair>>, a: GearInstance, b: GearInstance): string | null {
      if (edge.oneWay === "aToB") return a.id;
      if (edge.oneWay === "bToA") return b.id;
      return null;
    }

    const pinionFirst = evaluatePair(pinion, rack)!;
    expect(pinionFirst).not.toBeNull();
    expect(drivingId(pinionFirst, pinion, rack)).toBe(pinion.id);

    const rackFirst = evaluatePair(rack, pinion)!;
    expect(rackFirst).not.toBeNull();
    expect(rackFirst.a).toBe(rack.id);
    expect(rackFirst.b).toBe(pinion.id);
    expect(drivingId(rackFirst, rack, pinion)).toBe(pinion.id); // still the pinion, not the rack
  });

  it("meshes right at the line-distance tolerance boundary and rejects just past it", () => {
    const pitchR = 10; // teeth=20, module=1
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const atBoundary = makeGear({
      id: "pin", teeth: 20, module: 1, axis: [0, 1, 0],
      position: [0, 0, pitchR + pitchR * MESH_TOLERANCE], // diff == tolerance exactly -> should still mesh
    });
    const justPast = makeGear({
      id: "pin", teeth: 20, module: 1, axis: [0, 1, 0],
      position: [0, 0, pitchR + pitchR * MESH_TOLERANCE + 0.01], // just past -> should not mesh
    });
    expect(evaluatePair(rack, atBoundary)).not.toBeNull();
    expect(evaluatePair(rack, justPast)).toBeNull();
  });

  it("meshes a pinion the same way no matter where along the rack's infinite travel line it sits", () => {
    // A real rack-and-pinion can engage anywhere along the rack's length, not just at
    // whatever single point the rack object's own `position` happens to be stored at.
    // `distanceToLine` projects onto the infinite line (unbounded `along`), so this should
    // already hold -- this test proves it rather than assuming it.
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const perpendicularOffset = 10; // == pitchRadius of the teeth=20/module=1 pinion below
    for (const along of [0, 1, -1, 250, -1000, 1e6]) {
      const pinion = makeGear({ id: "pin", teeth: 20, module: 1, axis: [0, 1, 0], position: [along, 0, perpendicularOffset] });
      const edge = evaluatePair(rack, pinion);
      expect(edge, `expected a mesh at along=${along}`).not.toBeNull();
      expect(edge!.oneWay).toBe("bToA");
    }
  });

  it("couples a sprocket onto a coincident driving shaft, so it can receive power before a chain carries it further", () => {
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const sprocket = makeGear({ id: "s", type: "sprocket", teeth: 12, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const edge = evaluatePair(crank, sprocket)!;
    expect(edge.kind).toBe("coupling");
    expect(edge.ratio).toBe(1);
  });

  it("does not mesh a sprocket with a non-coincident gear at pitch-radius-sum distance -- only a coincident shaft or a chain link can power it", () => {
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] });
    const sprocket = makeGear({ id: "s", type: "sprocket", teeth: 10, module: 1, position: [15, 0, 0] }); // (20+10)/2=15, a valid gear-mesh distance
    expect(evaluatePair(crank, sprocket)).toBeNull();
  });

  it("couples a pulley onto a coincident driving shaft the same way a sprocket does", () => {
    const crank = makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const pulley = makeGear({ id: "p", type: "pulley", teeth: 12, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const edge = evaluatePair(crank, pulley)!;
    expect(edge.kind).toBe("coupling");
    expect(edge.ratio).toBe(1);
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

  it("does not special-case exactly two outputs -- a THIRD gear coincident with a differential also gets a coincident 1:1 coupling, since the rule is the general coincident-coupling block (step 2), not something that counts how many partners the differential already has", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputB = makeGear({ id: "outB", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputC = makeGear({ id: "outC", teeth: 12, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    for (const output of [outputA, outputB, outputC]) {
      const edge = evaluatePair(diff, output)!;
      expect(edge.kind).toBe("coupling");
      expect(edge.ratio).toBe(1);
    }
  });
});

describe("worm gear ratio and self-locking", () => {
  // A real worm gear's speed relationship: one full worm revolution advances the wheel
  // by exactly `threadStarts` teeth, so wheelSpeed = wormSpeed * (threadStarts / wheelTeeth).
  // `worm.teeth` IS the thread-start count (see sim/types.ts's comment on `teeth`), and
  // `MeshEdge.ratio` is documented (types.ts) as "b's speed = -ratio * a's speed" -- the
  // exact same "b's speed = -(a.teeth/b.teeth) * a's speed" convention used for every other
  // mesh kind in this file (see the very first spur test above: ratio = 20/10 = 2). Plugging
  // a worm into that same convention with a=worm, b=wheel gives
  // ratio = worm.teeth/wheel.teeth = threadStarts/wheelTeeth -- exactly the physically
  // correct value, not a bug: the "same formula as a plain spur pair" already IS the right
  // answer here, because `worm.teeth` was deliberately defined to mean thread-starts.
  //
  // Note this is the RECIPROCAL of the commonly quoted "reduction ratio" (wheelTeeth /
  // threadStarts, e.g. "40:1") -- that number describes input turns per output turn
  // (wormSpeed / wheelSpeed), not this codebase's `ratio` field, which is output/input
  // (wheelSpeed / wormSpeed, i.e. b/a). Using wheelTeeth/threadStarts for `edge.ratio` here
  // would invert the physics and make the wheel spin FASTER than the worm by that factor --
  // exactly backwards for what is supposed to be a large-reduction, self-locking drive.
  it("pins the exact worm-to-wheel ratio to threadStarts/wheelTeeth, not wheelTeeth/threadStarts", () => {
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 4, module: 1, position: [0, 0, 0] });
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 40, module: 1, position: [22, 0, 0] }); // (2+20)
    const edge = evaluatePair(worm, wheel)!;
    expect(edge.kind).toBe("mesh");
    expect(edge.ratio).toBeCloseTo(4 / 40); // 0.1 = threadStarts/wheelTeeth, per the doc convention
    expect(edge.ratio).not.toBeCloseTo(40 / 4); // NOT the textbook "reduction ratio" (10) -- would be inverted physics
  });

  it("keeps the same physical wheel speed regardless of which argument order evaluatePair sees", () => {
    // buildEdges (graph.ts) always calls evaluatePair(gears[i], gears[j]) for i<j, so
    // whichever gear the user happened to place first in the layout array ends up as `a`.
    // The one-way lock and the resulting wheel speed must not depend on that.
    const crank = makeGear({ id: "crank", type: "crank", axis: [0, 1, 0], position: [0, 0, 0], angularVelocity: 6 });
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 4, module: 1, position: [0, 0, 0] });
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 40, module: 1, position: [22, 0, 0] });

    const edgesA = buildEdges([crank, worm, wheel]); // worm placed before wheel -> a=worm in the mesh pair
    const edgesB = buildEdges([wheel, worm, crank]); // wheel placed before worm -> a=wheel in the mesh pair

    const resultA = propagateRotation([crank, worm, wheel], edgesA);
    const resultB = propagateRotation([wheel, worm, crank], edgesB);

    expect(resultA.angularVelocities.get("wheel")).toBeCloseTo(-0.6); // 6 * (4/40)
    expect(resultB.angularVelocities.get("wheel")).toBeCloseTo(-0.6);
    expect(resultA.angularVelocities.get("worm")).toBeCloseTo(6);
    expect(resultB.angularVelocities.get("worm")).toBeCloseTo(6);
  });

  it("still marks the worm as the sole driver when it is passed as `b` -- oneWay flips to bToA, not silently 'none' or reversed", () => {
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 40, module: 1, position: [22, 0, 0] });
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 4, module: 1, position: [0, 0, 0] });
    const edge = evaluatePair(wheel, worm)!; // a=wheel, b=worm (reversed vs. the earlier test)
    expect(edge.oneWay).toBe("bToA"); // b (the worm) is still the only side allowed to drive
    expect(edge.ratio).toBeCloseTo(40 / 4); // reciprocal of the a=worm case -- still self-consistent (b's speed = -ratio*a's speed)
  });

  it("self-locks: a wheel driven from an independent crank cannot back-drive its meshed worm, in either gear array order", () => {
    const driverCrank = makeGear({ id: "driverCrank", type: "crank", axis: [1, 0, 0], position: [52, 0, 0], teeth: 20, angularVelocity: 6 });
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 40, module: 1, position: [22, 0, 0] });
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 4, module: 1, position: [0, 0, 0] });
    // driverCrank meshes the wheel directly (ordinary parallel-axis spur mesh, (20+40)/2=30 apart)
    // and the wheel separately meshes the worm one-way. The worm has no other power source.

    for (const gears of [[driverCrank, wheel, worm], [worm, wheel, driverCrank]]) {
      const edges = buildEdges(gears);
      const { angularVelocities } = propagateRotation(gears, edges);
      expect(angularVelocities.get("wheel")).not.toBe(0); // the wheel IS turning
      expect(angularVelocities.get("worm")).toBe(0); // yet the worm stays put -- one-way lock holds
    }
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

  // Bug: `isOverlapping`'s "expected mesh distance" is `pitchRadius(a) + pitchRadius(b)`.
  // A "load" always has `teeth: 0` (sim/types.ts), so `pitchRadius(load) === 0` (module *
  // 0 * teeth / 2). Two loads never form a coupling edge with each other (evaluatePair's
  // `bothNonMeshing` rule), so a pair of loads sitting on top of each other falls through
  // to isOverlapping's plain distance check with `expected = 0 + 0 = 0`. Since
  // `centerDistance` can never be negative, `centerDistance < expected * (1 - MESH_TOLERANCE)`
  // (i.e. `centerDistance < 0`) is then unsatisfiable at ANY distance -- unlike the spur
  // case directly above, two coincident loads are silently never flagged as overlapping,
  // no matter how close (even stacked exactly on top of each other).
  it("flags two distinct, coincident loads as overlapping, not silently exempt via zero pitch radius", () => {
    const a = makeGear({ id: "a", type: "load", teeth: 0, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "load", teeth: 0, module: 1, position: [0, 0, 0] });
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("flags two loads placed a small but real distance apart as overlapping (not just the exact-coincident case)", () => {
    const a = makeGear({ id: "a", type: "load", teeth: 0, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "load", teeth: 0, module: 1, position: [0.5, 0, 0] });
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("does not flag two loads placed comfortably far apart as overlapping", () => {
    const a = makeGear({ id: "a", type: "load", teeth: 0, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "load", teeth: 0, module: 1, position: [10, 0, 0] });
    expect(isOverlapping(a, b)).toBe(false);
  });
});

/** Contact phase in tooth-period units: 0 = a tooth centre points at the contact line,
 *  0.5 = a gap centre does. */
function contactPhase(theta: number, teeth: number): number {
  const period = (Math.PI * 2) / teeth;
  return (((theta % period) + period) % period) / period;
}

// In the fixtures below `b` sits at +x from `a` and both turn about +y, which puts the
// a->b direction at local angle 0 in a's frame and the b->a direction at local angle PI
// in b's -- the same values localAngleOf() derives internally.
const PHI_A = 0;
const PHI_B = Math.PI;

describe("computeMeshPhaseOffset", () => {
  it("interleaves the pair: whenever a shows a tooth at the contact line, b shows a gap -- for every tooth, all the way round", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.4 });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], axis: [0, 1, 0], rotation: -1.1 });
    const edge = evaluatePair(a, b)!;
    const bAligned = { ...b, rotation: b.rotation + computeMeshPhaseOffset(a, b, edge) };

    const ratio = a.teeth / b.teeth;
    const periodA = (Math.PI * 2) / a.teeth;
    // Turning `a` forward by this much brings its next tooth centre onto the contact line.
    const toFirstToothCentre = (((PHI_A - a.rotation) % periodA) + periodA) % periodA;

    // Walk `a` tooth by tooth through two full revolutions, driving `b` at exactly the
    // ratio propagateRotation enforces, and check the interleaving holds every time --
    // not merely at the instant the offset was applied.
    for (let k = 0; k < a.teeth * 2; k++) {
      const deltaA = toFirstToothCentre + k * periodA;
      const aRotation = a.rotation + deltaA;
      const bRotation = bAligned.rotation - ratio * deltaA; // wB = -(aTeeth/bTeeth) * wA
      expect(contactPhase(PHI_A - aRotation, a.teeth)).toBeCloseTo(0, 9); // a: tooth centre
      expect(contactPhase(PHI_B - bRotation, b.teeth)).toBeCloseTo(0.5, 9); // b: gap centre
    }
  });

  /** Distance from `phase` to `target`, treating both as points on a circle of
   *  circumference 1 (i.e. the wraparound-safe version of `Math.abs(phase - target)`).
   *  `contactPhase` above returns a value in [0, 1) from a `% period` computation, so a
   *  true phase of (numerically) exactly 0 can just as easily land at ~0.999999999999997
   *  as at ~0.0000000000000003 depending on which side of the modulus boundary float
   *  rounding happens to fall -- a plain `toBeCloseTo(0, 9)` would spuriously fail on
   *  the former even though the physical deviation is ~1e-15, not ~1. */
  function circularDistance(phase: number, target: number): number {
    const raw = Math.abs(phase - target);
    return Math.min(raw, 1 - raw);
  }

  // The single existing interleave test above only ever used a 20:10 pair -- ratio 2,
  // sharing a factor of 10. Real gear trains are deliberately built with COPRIME tooth
  // counts (e.g. 7:13) specifically because it makes every tooth on one gear meet every
  // tooth on the other before the pattern repeats, spreading wear evenly -- a physically
  // different, and numerically different (see circularDistance's doc comment above),
  // regime than a low-common-factor pair where the same few tooth pairs repeatedly
  // re-contact. Confirm the interleaving invariant holds just as exactly across a spread
  // of coprime AND common-factor ratios, not just the one pair already covered.
  it.each([
    [7, 13],   // coprime
    [13, 7],   // coprime, reversed
    [11, 17],  // coprime
    [9, 4],    // coprime
    [6, 60],   // ratio 10, large common factor
    [30, 15],  // ratio 2, common factor 15
  ])("interleaves a %i:%i tooth pair for every tooth, all the way round", (teethA, teethB) => {
    const meshDistance = (teethA + teethB) / 2; // pitchRadius(a) + pitchRadius(b) at module=1
    const a = makeGear({ id: "a", teeth: teethA, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.4 });
    const b = makeGear({ id: "b", teeth: teethB, module: 1, position: [meshDistance, 0, 0], axis: [0, 1, 0], rotation: -1.1 });
    const edge = evaluatePair(a, b)!;
    expect(edge).not.toBeNull();
    const bAligned = { ...b, rotation: b.rotation + computeMeshPhaseOffset(a, b, edge) };

    const ratio = a.teeth / b.teeth;
    const periodA = (Math.PI * 2) / a.teeth;
    const toFirstToothCentre = (((PHI_A - a.rotation) % periodA) + periodA) % periodA;

    for (let k = 0; k < a.teeth * 2; k++) {
      const deltaA = toFirstToothCentre + k * periodA;
      const aRotation = a.rotation + deltaA;
      const bRotation = bAligned.rotation - ratio * deltaA;
      expect(circularDistance(contactPhase(PHI_A - aRotation, a.teeth), 0)).toBeLessThan(1e-9);
      expect(circularDistance(contactPhase(PHI_B - bRotation, b.teeth), 0.5)).toBeLessThan(1e-9);
    }
  });

  it("returns exactly zero for a pair already aligned and turning at the meshed ratio", () => {
    // This invariance is what lets tick() re-derive the offset every frame. If the offset
    // drifted as the pair span, re-applying it per tick would fight the rotation and
    // drive the gear backwards.
    const a0 = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.4 });
    const b0 = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], axis: [0, 1, 0], rotation: -1.1 });
    const edge = evaluatePair(a0, b0)!;

    let a = { ...a0 };
    let b = { ...b0, rotation: b0.rotation + computeMeshPhaseOffset(a0, b0, edge) };
    const omegaA = 1;
    const omegaB = -omegaA * (a0.teeth / b0.teeth);
    const dt = 1 / 60;
    for (let step = 0; step < 600; step++) {
      expect(Math.abs(computeMeshPhaseOffset(a, b, edge))).toBeLessThan(1e-9);
      a = { ...a, rotation: a.rotation + omegaA * dt };
      b = { ...b, rotation: b.rotation + omegaB * dt };
    }
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

describe("findMeshPartner", () => {
  it("finds the pinion a rack meshes with, ignoring unrelated gears", () => {
    const pinion = makeGear({ id: "pinion", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const unrelated = makeGear({ id: "unrelated", teeth: 20, module: 1, position: [500, 0, 0] });
    const partner = findMeshPartner(rack, [pinion, unrelated]);
    expect(partner?.id).toBe("pinion");
  });

  it("returns null when the gear has no valid mesh partner", () => {
    const lonely = makeGear({ id: "lonely", teeth: 20, module: 1, position: [0, 0, 0] });
    const farAway = makeGear({ id: "far", teeth: 20, module: 1, position: [500, 0, 0] });
    expect(findMeshPartner(lonely, [farAway])).toBeNull();
  });

  it("does not return the gear itself even if the caller includes it in the candidate list", () => {
    const gear = makeGear({ id: "self", teeth: 20, module: 1, position: [0, 0, 0] });
    expect(findMeshPartner(gear, [gear])).toBeNull();
  });

  it("KNOWN LIMITATION: when two pinions mesh the same rack at different points along it, only faces whichever comes first in the candidate array", () => {
    // Both pinions genuinely mesh the rack (a rack's line-distance check is independent of
    // where along its length the contact happens -- see the along-the-line test above), so
    // this is not a meshing bug. But `findMeshPartner` (used by the render layer to decide
    // which pinion the rack should visually face, since a rack has no rotation of its own to
    // derive a facing direction from) returns the FIRST match in whatever order the caller's
    // gear list happens to be in -- not necessarily the pinion actually driving the rack. Two
    // simultaneous pinions on one rack is a niche layout (this sandbox's default showcase
    // never creates one), and fixing it properly would mean threading "which mesh edge is
    // actually powered" from the physics layer into what is today a purely geometric lookup
    // -- out of scope for this focused pass. Documented here as a deliberate limitation, not
    // silently left to whichever behavior fell out of the array-order accident.
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const pinionNear = makeGear({ id: "pinionNear", teeth: 20, module: 1, axis: [0, 1, 0], position: [0, 0, 10] });
    const pinionFar = makeGear({ id: "pinionFar", teeth: 20, module: 1, axis: [0, 1, 0], position: [1000, 0, 10] });
    expect(evaluatePair(rack, pinionNear)).not.toBeNull();
    expect(evaluatePair(rack, pinionFar)).not.toBeNull();
    expect(findMeshPartner(rack, [pinionNear, pinionFar])?.id).toBe("pinionNear");
    expect(findMeshPartner(rack, [pinionFar, pinionNear])?.id).toBe("pinionFar");
  });
});

// Focused deep-dive on "load" (부하/플라이휠) -- a pure power SINK with `teeth: 0` always
// (sim/types.ts). It never drives anything; it only ever receives rotation via a
// coincident shaft-coupling. This suite is this type's own dedicated coverage, on top of
// (not replacing) the general-purpose load assertions already scattered through the
// `evaluatePair` and `isOverlapping` describe blocks above.
describe("load object (부하/플라이휠) focused coverage", () => {
  it("has a pitch radius of exactly 0, since it always has teeth: 0", () => {
    const load = makeGear({ id: "l", type: "load", teeth: 0, module: 3, position: [0, 0, 0] });
    expect(pitchRadius(load)).toBe(0);
  });

  it("still produces sane, non-degenerate overlap detection against a sized gear despite its own zero pitch radius", () => {
    // spur: teeth=20, module=1 -> pitchRadius=10. load's own footprint contributes on top
    // (see overlapRadius in meshing.ts), so this is NOT simply "spur's radius alone" --
    // but it must still scale sanely with distance, not read as always-true/always-false.
    const spur = makeGear({ id: "s", teeth: 20, module: 1, position: [0, 0, 0] });
    const closeLoad = makeGear({ id: "l1", type: "load", teeth: 0, module: 1, position: [5, 0, 0] });
    const farLoad = makeGear({ id: "l2", type: "load", teeth: 0, module: 1, position: [20, 0, 0] });
    expect(isOverlapping(spur, closeLoad)).toBe(true);
    expect(isOverlapping(spur, farLoad)).toBe(false);
  });

  describe("coincident-coupling exhaustiveness", () => {
    it("couples to a spur gear (already covered above; repeated here for this suite's completeness)", () => {
      const spur = makeGear({ id: "s", type: "spur", axis: [0, 1, 0], position: [0, 0, 0] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
      const edge = evaluatePair(spur, load)!;
      expect(edge.kind).toBe("coupling");
      expect(edge.ratio).toBe(1);
    });

    it("couples to a crank", () => {
      const crank = makeGear({ id: "c", type: "crank", teeth: 20, axis: [0, 1, 0], position: [0, 0, 0], angularVelocity: 4 });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
      const edge = evaluatePair(crank, load)!;
      expect(edge.kind).toBe("coupling");
      expect(edge.ratio).toBe(1);
    });

    it("couples to a helical gear", () => {
      const helical = makeGear({ id: "h", type: "helical", teeth: 16, axis: [1, 0, 0], position: [7, 2, -3] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [1, 0, 0], position: [7, 2, -3] });
      const edge = evaluatePair(helical, load)!;
      expect(edge.kind).toBe("coupling");
      expect(edge.ratio).toBe(1);
    });

    it("couples to a planetary gear", () => {
      const planetary = makeGear({ id: "p", type: "planetary", teeth: 40, axis: [0, 0, 1], position: [-4, 1, 0] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 0, 1], position: [-4, 1, 0] });
      const edge = evaluatePair(planetary, load)!;
      expect(edge.kind).toBe("coupling");
      expect(edge.ratio).toBe(1);
    });

    it("does not couple to an axis-aligned gear placed just past COUPLING_DISTANCE_TOLERANCE (0.05)", () => {
      const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0.06, 0, 0] }); // > 0.05
      expect(evaluatePair(gear, load)).toBeNull();
    });

    it("does couple to an axis-aligned gear placed just within COUPLING_DISTANCE_TOLERANCE (0.05)", () => {
      const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0.04, 0, 0] }); // < 0.05
      const edge = evaluatePair(gear, load)!;
      expect(edge.kind).toBe("coupling");
    });

    it("never couples to another load, even when perfectly coincident", () => {
      const loadA = makeGear({ id: "la", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
      const loadB = makeGear({ id: "lb", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
      expect(evaluatePair(loadA, loadB)).toBeNull();
    });

    it("never couples to a differential, even when perfectly coincident", () => {
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
      const differential = makeGear({ id: "d", type: "differential", teeth: 20, axis: [0, 1, 0], position: [0, 0, 0] });
      expect(evaluatePair(load, differential)).toBeNull();
    });

    it("does not fall back to any mesh path, even at a distance that happens to equal a normal mesh's expected pitch-distance", () => {
      // A load's own pitchRadius is 0, so "expected mesh distance" against a spur would be
      // just the spur's own pitchRadius (10 for teeth=20, module=1) if load ever reached
      // step (4)'s parallel-family mesh check. It must not: COINCIDENT_ONLY's `loadsInvolved`
      // branch rejects any non-coincident load unconditionally, before step (4) ever runs.
      const spur = makeGear({ id: "s", type: "spur", teeth: 20, module: 1, axis: [0, 1, 0], position: [0, 0, 0] });
      const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [10, 0, 0] }); // == spur's own pitchRadius
      expect(evaluatePair(spur, load)).toBeNull();
    });
  });

  describe("multi-branch: one crank simultaneously meshes a gear AND coincident-couples a load", () => {
    it("drives a meshed spur and a coincident-coupled load at once, both correctly, across multiple ticks", () => {
      const crank = makeGear({
        id: "crank", type: "crank", teeth: 20, module: 1, axis: [0, 1, 0], position: [0, 0, 0], angularVelocity: 6,
      });
      const spur = makeGear({
        id: "spur", type: "spur", teeth: 10, module: 1, axis: [0, 1, 0], position: [15, 0, 0], // (20+10)/2=15
      });
      const load = makeGear({
        id: "load", type: "load", teeth: 0, module: 1, axis: [0, 1, 0], position: [0, 0, 0], // coincident with crank
      });

      // Both branches active simultaneously from a single BFS root (the crank).
      const edges = buildEdges([crank, spur, load]);
      expect(edges).toHaveLength(2);
      expect(edges.some((e) => e.kind === "mesh")).toBe(true);
      expect(edges.some((e) => e.kind === "coupling")).toBe(true);

      const { angularVelocities } = propagateRotation([crank, spur, load], edges);
      expect(angularVelocities.get("crank")).toBe(6);
      expect(angularVelocities.get("spur")).toBeCloseTo(-12); // mesh: sign=-1, ratio=20/10=2 -> 6*-1*2
      expect(angularVelocities.get("load")).toBe(6); // coupling: sign=+1, ratio=1 -> tracks crank exactly

      // Drive several real ticks and confirm the load's angularVelocity keeps tracking the
      // crank exactly (not just on the first frame), and that its accumulated rotation
      // matches the crank's own -- a 1:1 coupling has no gear-ratio sign flip, unlike the
      // meshed spur branch running alongside it on the very same crank.
      let layout: LayoutState = { gears: [crank, spur, load], remoteLinks: [] };
      const dt = 0.1;
      for (let i = 1; i <= 5; i++) {
        const result = tick(layout, dt, 1);
        layout = { gears: result.gears, remoteLinks: [] };
        const gearById = new Map(result.gears.map((g) => [g.id, g] as const));
        const crankNow = gearById.get("crank")!;
        const spurNow = gearById.get("spur")!;
        const loadNow = gearById.get("load")!;

        expect(crankNow.angularVelocity).toBe(6);
        expect(spurNow.angularVelocity).toBeCloseTo(-12);
        expect(loadNow.angularVelocity).toBe(6); // still tracking the crank exactly, tick after tick

        expect(crankNow.rotation).toBeCloseTo(6 * dt * i);
        expect(loadNow.rotation).toBeCloseTo(crankNow.rotation); // 1:1 coupling: identical accumulated rotation
        expect(loadNow.rotation).not.toBeCloseTo(spurNow.rotation); // the meshed branch is NOT 1:1 -- confirms both branches are genuinely independent
      }
    });
  });
});
