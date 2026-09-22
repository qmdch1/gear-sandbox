// tests/render/gearGeometry.test.ts
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { computeSpurProfilePoints, buildGeometryForType, helicalTwistPerUnit } from "../../src/render/gearGeometry";

/** 2x the signed area of triangle (a, b, c), collapsed to a sign: +1 left turn,
 *  -1 right turn, 0 collinear. Coordinates here are order-10 magnitudes and the
 *  polygon's shortest edge is ~0.1 long, so 1e-9 is comfortably below any real
 *  turn and comfortably above float64 round-off. */
function orientation(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross > 1e-9) return 1;
  if (cross < -1e-9) return -1;
  return 0;
}

/** Whether `q` -- already known to be collinear with segment p->r -- lies within
 *  that segment's bounding box (and therefore on the segment itself). */
function withinBox(p: THREE.Vector2, q: THREE.Vector2, r: THREE.Vector2): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

/** Textbook (CLRS 33.1) 2D segment-intersection predicate: a proper crossing when
 *  each segment straddles the other's supporting line, plus the four collinear
 *  touch/overlap cases. */
function segmentsIntersect(p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2, p4: THREE.Vector2): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  const straddlesA = (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0);
  const straddlesB = (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0);
  if (straddlesA && straddlesB) return true;
  if (d1 === 0 && withinBox(p3, p1, p4)) return true;
  if (d2 === 0 && withinBox(p3, p2, p4)) return true;
  if (d3 === 0 && withinBox(p1, p3, p2)) return true;
  if (d4 === 0 && withinBox(p1, p4, p2)) return true;
  return false;
}

/** Shoelace signed area of the closed polygon. Positive = counter-clockwise. A
 *  self-intersecting (bow-tie) polygon cancels its own lobes and collapses well
 *  below the true enclosed area. */
function signedArea(points: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** Every pair of non-adjacent edges of the closed polygon that cross. */
function selfIntersections(points: THREE.Vector2[]): Array<[number, number]> {
  const n = points.length;
  const hits: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // last edge is adjacent to the first
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        hits.push([i, j]);
      }
    }
  }
  return hits;
}

describe("computeSpurProfilePoints", () => {
  it("produces 13 points per tooth (root land + 6-point left flank + 6-point right flank)", () => {
    const points = computeSpurProfilePoints(20, 1);
    expect(points.length).toBe(20 * 13);
  });

  it("gives a tooth thickness at the pitch circle equal to the standard pi*module/2", () => {
    // Sample the profile's own points near the pitch radius on tooth 0 and measure
    // the arc-length gap between the two flanks at that radius.
    const module = 1;
    const teeth = 20;
    const points = computeSpurProfilePoints(teeth, module);
    const pitchRadius = (module * teeth) / 2;
    // tooth 0 spans points[0..12]: index 0 is the root point on the LEFT of the tooth
    // centre, 1..6 walk the LEFT flank base->tip, 7..12 walk the RIGHT flank tip->base.
    // Find the two points (one per flank) whose radius is closest to the pitch radius.
    const leftFlank = points.slice(1, 7);
    const rightFlank = points.slice(7, 13);
    const closestToPitch = (flank: THREE.Vector2[]) =>
      flank.reduce((best, p) => (Math.abs(p.length() - pitchRadius) < Math.abs(best.length() - pitchRadius) ? p : best));
    const right = closestToPitch(rightFlank);
    const left = closestToPitch(leftFlank);
    const angularWidth = Math.atan2(right.y, right.x) - Math.atan2(left.y, left.x);
    const arcWidth = angularWidth * pitchRadius;
    expect(arcWidth).toBeCloseTo((Math.PI * module) / 2, 1);
  });

  it("narrows monotonically from the dedendum circle to the addendum circle (rack-limit taper)", () => {
    const points = computeSpurProfilePoints(20, 1);
    const leftFlank = points.slice(1, 7); // dedendum/base -> addendum, in order
    const angles = leftFlank.map((p) => Math.atan2(p.y, p.x));
    for (let i = 1; i < angles.length; i++) {
      // the left flank sits at negative angles and climbs toward the tooth centre (0)
      // as the radius grows -- i.e. the tooth gets angularly thinner further out.
      expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1] - 1e-9);
    }

    // ...and it really NARROWS. `>= previous` alone is satisfied by a constant angle, so the
    // check above passes for a tooth whose flanks are straight radial lines -- which is
    // precisely the thing an involute is not, and the whole property this test is named for.
    // Measure the taper instead of merely forbidding it from going the wrong way.
    const total = angles[angles.length - 1] - angles[0];
    expect(total).toBeGreaterThan(1e-3);

    // The narrowing is a real fraction of the tooth, not a rounding artefact: the angular
    // half-width at the tip is meaningfully smaller than at the root.
    const radii = leftFlank.map((p) => p.length());
    expect(radii[radii.length - 1]).toBeGreaterThan(radii[0]); // we did walk outward
    expect(Math.abs(angles[angles.length - 1])).toBeLessThan(Math.abs(angles[0]) * 0.95);
  });

  it("traces one simple (non-self-intersecting) closed polygon around the whole gear", () => {
    // Regression for the bow-tie bug: the per-tooth root point sits on the LEFT of the
    // tooth centre, so the flank drawn immediately after it must also be the LEFT flank.
    // Emitting the RIGHT flank first makes the boundary jump across the tooth and cross
    // itself once per tooth -- invisible to the three coordinate-only tests above, but
    // fatal to triangulation. Check the closed polygon's global structure instead.
    const points = computeSpurProfilePoints(20, 1);
    expect(selfIntersections(points)).toEqual([]);
  });

  it("encloses a plausible gear area (a bow-tie polygon's shoelace area collapses)", () => {
    const teeth = 20;
    const module = 1;
    const points = computeSpurProfilePoints(teeth, module);
    const pitchRadius = (module * teeth) / 2;
    const dedendumRadius = pitchRadius - module * 1.25; // DEDENDUM_FACTOR
    const area = signedArea(points);
    // Counter-clockwise winding, and at least the solid disc below the tooth roots.
    expect(area).toBeGreaterThan(Math.PI * dedendumRadius * dedendumRadius);
    // Sanity ceiling: never more than the addendum-circle disc.
    const addendumRadius = pitchRadius + module * 1.0; // ADDENDUM_FACTOR
    expect(area).toBeLessThan(Math.PI * addendumRadius * addendumRadius);
  });

  // The four checks above (point count, pitch-circle tooth thickness, monotonic taper,
  // simple polygon, plausible area) were only ever exercised at teeth=20/module=1 -- the
  // one size the original self-intersection (bow-tie) bug fix happened to test. Since the
  // flank math (involuteAngleAtRadius, flankAngle) depends on teeth count (toothAngularPitch
  // = 2*PI/teeth) in ways that don't simplify away, a fix verified at one tooth count doesn't
  // guarantee
  // correctness at very few teeth (where the tooth is angularly wide and the dedendum circle
  // sits closest to the base circle) or very many (where the tooth is angularly thin).
  //
  // MODULE, by contrast, does simplify away exactly: addendumRadius / pitchRadius = 1 + 2/teeth
  // and dedendumRadius / pitchRadius = 1 - 2.5/teeth, both functions of the tooth count alone,
  // so the profile's shape relative to its pitch circle -- and therefore every flank angle -- is
  // independent of it. Sweeping module buys nothing the tooth-count sweep does not already give;
  // it is kept below only because it costs nothing and documents the invariance -- covering the sandbox's realistic range here (spec'd range: 6-8 teeth on the
  // low end, 60+ on the high end) as a regression guard. Confirmed by direct computation
  // (see investigation) that no self-intersection or degenerate/negative area actually
  // occurs anywhere in this range -- this is a coverage gap being closed, not a bug fix.
  describe("across the sandbox's realistic teeth/module range", () => {
    const teethCounts = [6, 7, 8, 20, 60, 80, 100];
    const modules = [0.5, 1, 2, 5];

    it.each(teethCounts.flatMap((teeth) => modules.map((module) => [teeth, module] as const)))(
      "traces a simple, positively-wound, plausibly-sized polygon at teeth=%i module=%i",
      (teeth, module) => {
        const points = computeSpurProfilePoints(teeth, module);
        expect(points.length).toBe(teeth * 13);
        expect(selfIntersections(points)).toEqual([]);

        const pitchRadius = (module * teeth) / 2;
        const dedendumRadius = pitchRadius - module * 1.25;
        const addendumRadius = pitchRadius + module * 1.0;
        const area = signedArea(points);
        expect(area).toBeGreaterThan(Math.PI * Math.max(dedendumRadius, 0) * Math.max(dedendumRadius, 0));
        expect(area).toBeLessThan(Math.PI * addendumRadius * addendumRadius);
      },
    );
  });
});

describe("buildGeometryForType", () => {
  it("builds a non-empty geometry for every gear type", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it("gives a crank a distinct handle silhouette from a plain spur gear of the same teeth/module -- more geometry than the flat disc, and a visible axial protrusion, across a range of sizes", () => {
    // A crank ("손잡이 기어" = "handle gear") is supposed to read as a power source with
    // a graspable handle, not just a spur gear with a different label. `crankGeometry`
    // merges the ordinary flat spur body (thickness GEAR_THICKNESS = 0.4, see
    // gearGeometry.ts) with a handle cylinder offset from center and extending along the
    // gear's own axis well past that thickness. Verify both signals -- vertex count and
    // axial (Z) bounding-box extent -- hold across small, default, and large teeth/module
    // combinations, not just the one demo size.
    const GEAR_THICKNESS = 0.4;
    for (const [teeth, module] of [
      [6, 1],
      [20, 1],
      [8, 2],
      [60, 0.5],
    ] as const) {
      const crank = buildGeometryForType("crank", teeth, module);
      const spur = buildGeometryForType("spur", teeth, module);
      crank.computeBoundingBox();
      const crankZExtent = crank.boundingBox!.max.z - crank.boundingBox!.min.z;

      // The handle adds real geometry, not just a paint/material difference.
      expect(crank.attributes.position.count).toBeGreaterThan(spur.attributes.position.count);
      // The handle sticks out along the rotation axis well past the flat gear disc's own
      // thickness -- a plain spur gear's Z-extent is exactly GEAR_THICKNESS.
      expect(crankZExtent).toBeGreaterThan(GEAR_THICKNESS * 5);
    }
  });

  it("gives the bevel gear a smaller cross-section near the apex than at the base (real taper, not a smooth cone)", () => {
    const geometry = buildGeometryForType("bevel", 20, 1);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // The taper is along Z (pre-quaternion-alignment local axis); the XY extent at
    // z-min (base) should exceed the XY extent at z-max (apex).
    const position = geometry.attributes.position;
    let maxRadiusNearBase = 0;
    let maxRadiusNearApex = 0;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      const r = Math.hypot(position.getX(i), position.getY(i));
      if (z < box.min.z + 0.01) maxRadiusNearBase = Math.max(maxRadiusNearBase, r);
      if (z > box.max.z - 0.01) maxRadiusNearApex = Math.max(maxRadiusNearApex, r);
    }
    expect(maxRadiusNearApex).toBeLessThan(maxRadiusNearBase);
  });

  it("scales the bevel gear's cone height proportionally with pitch radius (module*teeth), not a fixed constant", () => {
    // Real bevel-gear cone proportions are tied to pitch radius: a bevel gear with
    // double the pitch radius should get a proportionally taller cone, not the same
    // fixed axial height regardless of size (which would look wrong -- a giant bevel
    // gear rendered as a nearly-flat disc, or a tiny one rendered as a disproportionately
    // tall spike). teeth=10 and teeth=30 at module=1 give pitch radii 5 and 15 -- an
    // exact 3x ratio -- so the cone's Z-extent (axial height) should also come out ~3x.
    const small = buildGeometryForType("bevel", 10, 1); // pitchRadius = 5
    const large = buildGeometryForType("bevel", 30, 1); // pitchRadius = 15
    small.computeBoundingBox();
    large.computeBoundingBox();
    const smallHeight = small.boundingBox!.max.z - small.boundingBox!.min.z;
    const largeHeight = large.boundingBox!.max.z - large.boundingBox!.min.z;
    expect(largeHeight / smallHeight).toBeCloseTo(3, 1);
  });

  it("keeps the bevel showcase gear's cone height unchanged at the default layout's actual size (teeth=16, module=1)", () => {
    // Regression guard: the showcase's "seed-bevel" gear (defaultLayout.ts) is
    // teeth=16, module=1 -> pitchRadius=8. The old fixed constant was
    // GEAR_THICKNESS(0.4)*3 = 1.2; the new pitchRadius-proportional formula must
    // reproduce that exact value here so the showcase's visual size doesn't shift.
    const geometry = buildGeometryForType("bevel", 16, 1);
    geometry.computeBoundingBox();
    const height = geometry.boundingBox!.max.z - geometry.boundingBox!.min.z;
    expect(height).toBeCloseTo(1.2, 5);
  });

  it("gives the worm a thread that stands off from a central core (not a smooth cylinder)", () => {
    const geometry = buildGeometryForType("worm", 2, 1);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const maxRadius = Math.max(
      Math.hypot(box.max.x, 0), Math.hypot(box.max.y, 0),
    );
    expect(maxRadius).toBeGreaterThan(1 * 0.9); // exceeds the plain core radius
  });

  it("makes the worm's visual thread denser (more windings) as `teeth` (thread-starts) increases, matching the same number evaluatePair uses for the drive ratio", () => {
    // Before this change, `turns` was a hardcoded constant (module*6 / module*1.5 = 4)
    // completely independent of `teeth` -- a worm with 1 thread-start and one with 4 looked
    // pixel-identical even though evaluatePair() gives them very different wheel ratios
    // (worm.teeth/wheel.teeth). More tubular segments at a fixed radial segment count means
    // more windings were sampled, so vertex count is a reliable, cheap proxy for "how many
    // times the thread wraps around" without depending on TubeGeometry's internals.
    const oneStart = buildGeometryForType("worm", 1, 1);
    const fourStart = buildGeometryForType("worm", 4, 1);
    expect(fourStart.attributes.position.count).toBeGreaterThan(oneStart.attributes.position.count);
  });

  it("still builds a valid worm geometry at teeth=1 (the single-thread-start case, where the new teeth-scaled pitch collapses back to the old constant one)", () => {
    // At teeth=1: threadPitch = (module*1.5)/1 = module*1.5 and turns = length/threadPitch = 4,
    // segments = max(120, round(30*4)) = 120 -- the exact constants the old, non-teeth-aware
    // code always used. This just guards that the teeth=1 path still produces a sane,
    // non-degenerate geometry after the change.
    const geometry = buildGeometryForType("worm", 1, 1);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const maxRadius = Math.max(Math.hypot(box.max.x, 0), Math.hypot(box.max.y, 0));
    expect(maxRadius).toBeGreaterThan(1 * 0.9);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("builds a non-empty geometry for every v2 gear type too", () => {
    const types = ["rack", "planetary", "ratchet", "sprocket", "pulley", "differential"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it("gives the rack a length that grows with its tooth count", () => {
    const short = buildGeometryForType("rack", 4, 1);
    const long = buildGeometryForType("rack", 12, 1);
    short.computeBoundingBox();
    long.computeBoundingBox();
    const shortLength = short.boundingBox!.max.z - short.boundingBox!.min.z;
    const longLength = long.boundingBox!.max.z - long.boundingBox!.min.z;
    expect(longLength).toBeGreaterThan(shortLength);
  });

  it("runs the rack's length along local Z -- the same axis GearMeshObject slides it along", () => {
    // GearMeshObject.update() aligns local Z to gear.axis (quaternion from (0,0,1)) and
    // then translates a rack along that axis by linearPosition. The raw extrusion lays
    // the bar out along local X instead, which makes the rack slide dead perpendicular
    // to its own body (axis . lengthDirection === 0). Its longest dimension must be Z.
    for (const teeth of [4, 8, 12]) {
      const geometry = buildGeometryForType("rack", teeth, 1);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const sizeX = box.max.x - box.min.x;
      const sizeY = box.max.y - box.min.y;
      const sizeZ = box.max.z - box.min.z;
      expect(sizeZ).toBeGreaterThan(sizeX);
      expect(sizeZ).toBeGreaterThan(sizeY);

      // A bounding box is sign-blind: it has the same extents whichever way round the bar was
      // laid, so the three assertions above pass for a rack extruded backwards along -Z as
      // readily as forwards. Pin the DIRECTION too.
      //
      // `rackGeometry` lays tooth k at z = k * pitch and each tooth spans +/- pitch/2, so the
      // bar runs from -pitch/2 to (teeth - 1) * pitch + pitch/2 -- overwhelmingly into +Z, with
      // the gear's own position sitting at its first tooth rather than at its middle. Reversing
      // the extrusion mirrors those two numbers and fails here, while leaving every extent
      // above unchanged.
      const pitch = Math.PI * 1; // module 1
      expect(box.min.z).toBeCloseTo(-pitch / 2, 5);
      expect(box.max.z).toBeCloseTo((teeth - 1) * pitch + pitch / 2, 5);
    }
  });

  it("gives a ratchet a pawl arm that reaches further out than a plain spur gear's addendum circle", () => {
    const spur = buildGeometryForType("spur", 20, 1);
    const ratchet = buildGeometryForType("ratchet", 20, 1);
    spur.computeBoundingSphere();
    ratchet.computeBoundingSphere();
    expect(ratchet.boundingSphere!.radius).toBeGreaterThan(spur.boundingSphere!.radius);
  });

  /** Max distance from the gear's own rotation axis (world Z through the origin) of any
   *  vertex in the geometry, measured in the XY plane -- i.e. how far the widest point
   *  of the shape actually sits from where the gear spins, regardless of geometry's
   *  bounding-sphere center (which can sit off-axis for an asymmetric shape like the
   *  ratchet's pawl, unlike a plain spur gear). */
  function maxRadialReach(geo: THREE.BufferGeometry): number {
    const pos = geo.attributes.position;
    let maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      if (r > maxR) maxR = r;
    }
    return maxR;
  }

  // `pawl.translate(0, addendumRadius + pawlLength / 2, 0)` happens BEFORE
  // `pawl.rotateZ(...)`, and rotation about the gear's own Z axis (the origin, same
  // axis the render layer spins the whole mesh about) only changes each vertex's
  // DIRECTION from that axis, never its distance from it -- so the pawl's minimum
  // reach is fixed the moment it's translated, independent of the later rotation. This
  // invariant (the pawl always clears the addendum circle) holds at every size both
  // before and after the pawlLength scaling fix below -- what changed is that the
  // clearance margin now scales with pitch radius (addendumRadius * 0.3), not a fixed
  // module-only absolute (the old module * 1.8), so bigger gears keep a proportionally
  // visible pawl instead of one that shrinks toward the rim as teeth grows. See the
  // "scales the ratchet pawl length proportionally..." test below for that proportion.
  it.each([
    [6, 1],
    [40, 1],
    [20, 2],
    [6, 2],
    [40, 2],
  ])("keeps the ratchet pawl's endpoint past the addendum circle at teeth=%i, module=%i", (teeth, module) => {
    const spur = buildGeometryForType("spur", teeth, module);
    const ratchet = buildGeometryForType("ratchet", teeth, module);
    const spurTipRadius = maxRadialReach(spur); // the addendum (tooth-tip) circle radius
    const ratchetReach = maxRadialReach(ratchet);
    const addendumRadius = (module * teeth) / 2 + module * 1.0; // ADDENDUM_FACTOR = 1.0 (module*1x), documented in gearGeometry.ts
    expect(spurTipRadius).toBeCloseTo(addendumRadius, 3); // sanity: a plain spur's own tip really sits at the addendum circle (loose tolerance: the involute flank is sampled, not exact, so the tip vertex lands within ~2e-6 of the ideal addendum radius)
    expect(ratchetReach).toBeGreaterThan(addendumRadius); // the pawl clears it at every size tested, not just teeth=20/module=1
    expect(ratchetReach).toBeGreaterThan(spurTipRadius);
  });

  /** Recovers ratchetGeometry's internal `pawlLength` from the built mesh, inverting the
   *  exact vertex-distance relationship documented above: the farthest vertex from the
   *  gear's own axis is the pawl box's outer corner, sitting (before the later rotateZ,
   *  which preserves distance-from-origin) at local y = addendumRadius + pawlLength,
   *  x = +/-(pawlWidth/2) = +/-(module*0.175). So
   *  reach = sqrt((addendumRadius + pawlLength)^2 + (module*0.175)^2), solved here for
   *  pawlLength. Cross-checked against the hand-computed reach values in the test above
   *  (e.g. teeth=6/module=1: addendumRadius=4 -> derived pawlLength should read back as
   *  whatever ratchetGeometry actually used, not assumed). */
  function derivePawlLength(teeth: number, module: number): number {
    const addendumRadius = (module * teeth) / 2 + module * 1.0;
    const ratchet = buildGeometryForType("ratchet", teeth, module);
    const reach = maxRadialReach(ratchet);
    const halfWidth = module * 0.175;
    return Math.sqrt(reach * reach - halfWidth * halfWidth) - addendumRadius;
  }

  it("scales the ratchet pawl length proportionally with the addendum radius (30% of it), not a fixed module-only constant", () => {
    // Real proportion, not eyeballed: solving pawlLength = addendumRadius * k for the
    // showcase's own size (teeth=10, module=1 -> addendumRadius=6, old pawlLength=1.8)
    // gives k = 1.8/6 = 0.3 exactly. That ratio should hold at any teeth/module
    // combination, unlike the old `module * 1.8`, which held it only at module=1.8's own
    // fixed absolute regardless of addendum radius.
    for (const [teeth, module] of [
      [10, 1],  // addendumRadius=6  -> pawlLength should be 1.8 (the showcase's own size)
      [20, 1],  // addendumRadius=11 -> pawlLength should be 3.3
      [60, 2],  // addendumRadius=62 -> pawlLength should be 18.6
      [100, 3], // addendumRadius=153 -> pawlLength should be 45.9
    ] as const) {
      const addendumRadius = (module * teeth) / 2 + module * 1.0;
      const pawlLength = derivePawlLength(teeth, module);
      expect(pawlLength / addendumRadius).toBeCloseTo(0.3, 5);
    }
  });

  it("gives a bigger ratchet (more teeth, same module) a proportionally BIGGER absolute pawl length, not the same fixed one", () => {
    // teeth=10 and teeth=30 at module=1 give addendum radii 6 and 16 -- exactly the
    // same 8:3 ratio the pawl length should now track (the old module-only constant
    // would have given both an identical 1.8).
    const smallPawlLength = derivePawlLength(10, 1);
    const largePawlLength = derivePawlLength(30, 1);
    expect(largePawlLength).toBeGreaterThan(smallPawlLength);
    expect(largePawlLength / smallPawlLength).toBeCloseTo(16 / 6, 4);
  });

  it("keeps the showcase ratchet's exact pawl length unchanged at its actual size (teeth=10, module=1 -- defaultLayout.ts's seed-ratchet)", () => {
    // Regression guard: the showcase's "seed-ratchet" gear (defaultLayout.ts) is
    // teeth=10, module=1 -> addendumRadius=6. The old fixed constant was module*1.8=1.8;
    // the new addendumRadius-proportional formula (addendumRadius * 0.3) must reproduce
    // that exact value here (6 * 0.3 = 1.8) so the showcase's visual size is unchanged.
    const pawlLength = derivePawlLength(10, 1);
    expect(pawlLength).toBeCloseTo(1.8, 5);
  });

  it("gives a sprocket a visibly different vertex count than a plain spur gear (square teeth, not full involute flanks)", () => {
    const spur = buildGeometryForType("spur", 20, 1);
    const sprocket = buildGeometryForType("sprocket", 20, 1);
    expect(sprocket.attributes.position.count).not.toBe(spur.attributes.position.count);
  });

  it("gives a sprocket one tooth spike per requested tooth count -- more teeth means more merged geometry", () => {
    const fewTeeth = buildGeometryForType("sprocket", 8, 1);
    const manyTeeth = buildGeometryForType("sprocket", 24, 1);
    expect(manyTeeth.attributes.position.count).toBeGreaterThan(fewTeeth.attributes.position.count);
  });

  it("gives the differential more geometry than a plain spur gear of the same size, not less (regression: the old sphere+smooth-cone shape had FEWER vertices than a plain spur gear -- 1176 vs. 3108 at teeth=20/module=1 -- reading as a blobbier, less detailed shape than an ordinary gear)", () => {
    for (const teeth of [12, 20, 30]) {
      const spur = buildGeometryForType("spur", teeth, 1);
      const differential = buildGeometryForType("differential", teeth, 1);
      expect(differential.attributes.position.count).toBeGreaterThan(spur.attributes.position.count);
    }
  });

  it("gives the differential a housing that extends well past its own ring gear along the axis -- a bulging carrier, not a flat disk", () => {
    const differential = buildGeometryForType("differential", 20, 1);
    differential.computeBoundingBox();
    const box = differential.boundingBox!;
    const axialExtent = box.max.z - box.min.z;
    const GEAR_THICKNESS = 0.4; // a plain (non-housed) gear's z-extent is just this
    expect(axialExtent).toBeGreaterThan(GEAR_THICKNESS * 5);
  });

  it("gives the differential a wider radial reach than a plain spur gear's addendum circle (the housing bulges out sideways too)", () => {
    const spur = buildGeometryForType("spur", 20, 1);
    const differential = buildGeometryForType("differential", 20, 1);
    spur.computeBoundingSphere();
    differential.computeBoundingSphere();
    expect(differential.boundingSphere!.radius).toBeGreaterThan(spur.boundingSphere!.radius);
  });

  it("builds a valid, non-empty, finite helical geometry across a wide range of teeth counts (few, default, many)", () => {
    for (const teeth of [8, 20, 50]) {
      const geometry = buildGeometryForType("helical", teeth, 1);
      const position = geometry.attributes.position;
      expect(position.count).toBeGreaterThan(0);
      for (let i = 0; i < position.count; i++) {
        expect(Number.isFinite(position.getX(i))).toBe(true);
        expect(Number.isFinite(position.getY(i))).toBe(true);
        expect(Number.isFinite(position.getZ(i))).toBe(true);
      }
    }
  });
});

describe("helicalTwistPerUnit (visual twist scaling)", () => {
  const GEAR_THICKNESS = 0.4; // matches the private constant in gearGeometry.ts

  it("keeps a constant real-world helix angle (~25 deg) regardless of teeth count, instead of a fixed radians-per-depth rate that grows steeper on bigger gears", () => {
    // tan(helixAngle) = pitchRadius * twistPerUnit (see helicalTwistPerUnit's own doc
    // comment): the tangential displacement a point at the pitch radius accumulates over
    // the full GEAR_THICKNESS depth, divided by that same depth.
    for (const teeth of [8, 16, 20, 50]) {
      const module = 1;
      const pitchRadius = (module * teeth) / 2;
      const twistPerUnit = helicalTwistPerUnit(teeth, module);
      const impliedHelixAngleDeg = Math.atan(pitchRadius * twistPerUnit) * (180 / Math.PI);
      expect(impliedHelixAngleDeg).toBeCloseTo(25, 0);
    }
  });

  it("gives a bigger gear (more teeth, same module) a proportionally SMALLER twist rate, not the same one -- the whole point of scaling with pitch radius", () => {
    const small = helicalTwistPerUnit(8, 1);   // pitchRadius = 4
    const large = helicalTwistPerUnit(50, 1);  // pitchRadius = 25
    expect(large).toBeLessThan(small);
    expect(small / large).toBeCloseTo(25 / 4, 1); // inversely proportional to pitch radius
  });

  it("keeps the total twist well under one tooth-pitch at every teeth count this sandbox realistically uses (6 to 60) -- a sane, non-transverse-looking helix", () => {
    for (const teeth of [6, 8, 16, 20, 30, 50, 60]) {
      const toothAngularPitch = (2 * Math.PI) / teeth;
      const totalTwist = helicalTwistPerUnit(teeth, 1) * GEAR_THICKNESS;
      expect(totalTwist).toBeLessThan(toothAngularPitch * 0.5); // less than half a tooth's own angular width
    }
  });

  it("documents the OLD fixed twistPerUnit=1.2 as the actual defect it was: at the showcase's own helical gear (teeth=16, module=1) it already twisted MORE than a full tooth-pitch, and got worse (not better) as teeth grew", () => {
    const OLD_FIXED_TWIST_PER_UNIT = 1.2;
    const oldTotalTwist = OLD_FIXED_TWIST_PER_UNIT * GEAR_THICKNESS; // 0.48 rad, constant regardless of size -- the bug
    const pitchesOfTwist = (teeth: number) => oldTotalTwist / ((2 * Math.PI) / teeth);

    // teeth=8: under one tooth-pitch (looks plausible-ish)...
    expect(pitchesOfTwist(8)).toBeCloseTo(0.61, 2);
    // ...but teeth=16 -- the showcase's actual "seed-helical" gear (defaultLayout.ts) --
    // already exceeds a full tooth-pitch: a tooth traced from front face to back face
    // would visually land in/past where its NEIGHBOR started, not a subtle helical lean.
    expect(pitchesOfTwist(16)).toBeGreaterThan(1);
    expect(pitchesOfTwist(16)).toBeCloseTo(1.22, 2);
    // ...and it only gets worse (more twisted, not less) as teeth/pitch-radius grows,
    // the opposite of a size-independent visual property.
    expect(pitchesOfTwist(20)).toBeCloseTo(1.53, 2);
    expect(pitchesOfTwist(50)).toBeCloseTo(3.82, 2);
    expect(pitchesOfTwist(50)).toBeGreaterThan(pitchesOfTwist(20));
    expect(pitchesOfTwist(20)).toBeGreaterThan(pitchesOfTwist(8));

    // The NEW formula fixes exactly this: its twist-in-tooth-pitches is essentially flat
    // across the same range (mirroring a real helix angle's size-independence).
    const newPitchesOfTwist = (teeth: number) => (helicalTwistPerUnit(teeth, 1) * GEAR_THICKNESS) / ((2 * Math.PI) / teeth);
    const newValues = [8, 16, 20, 50].map(newPitchesOfTwist);
    for (const v of newValues) {
      expect(v).toBeCloseTo(newValues[0], 3);
    }
  });
});

describe("every gear type carries UVs, because every gear is textured", () => {
  it("gives all twelve types a uv attribute", () => {
    // `gearMesh.ts` sets `material.map`, `roughnessMap` and `bumpMap` on EVERY gear, at
    // repeat.set(3, 3). All three sample `uv`, and a material with a map but no uv attribute
    // reads the texture at one point -- so the finish collapses to a flat colour.
    //
    // Six of the twelve types are built by merging primitives together, and `mergeGeometries`
    // copied position and normal only. The primitives it merges (cylinders, boxes, lathes) all
    // carry uv; it was dropped in the concatenation. So crank, worm, planetary, ratchet,
    // sprocket and differential rendered without grain, per-pixel roughness or bump while the
    // other six kept all three, and nothing could say so.
    const types = [
      "spur", "helical", "crank", "bevel", "worm", "load",
      "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
    ] as const;
    for (const type of types) {
      const geometry = buildGeometryForType(type, 16, 1);
      const uv = geometry.attributes.uv;
      expect(uv, `${type} has no uv attribute`).toBeDefined();
      expect(uv.count).toBe(geometry.attributes.position.count);

      // ...and the coordinates are real, not a block of zeroes standing in for them.
      let nonZero = 0;
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) !== 0 || uv.getY(i) !== 0) nonZero++;
      }
      expect(nonZero / uv.count, `${type} has an all-zero uv map`).toBeGreaterThan(0.5);
    }
  });
});
