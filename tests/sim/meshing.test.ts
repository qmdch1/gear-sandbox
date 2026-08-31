// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping, computeMeshPhaseOffset, findMeshPartner, pitchRadius } from "../../src/sim/meshing";
import { buildEdges } from "../../src/sim/graph";
import { propagateRotation } from "../../src/sim/rotation";
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
});
