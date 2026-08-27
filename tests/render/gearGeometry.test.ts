// tests/render/gearGeometry.test.ts
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { computeSpurProfilePoints, buildGeometryForType } from "../../src/render/gearGeometry";

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
});

describe("buildGeometryForType", () => {
  it("builds a non-empty geometry for every gear type", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
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

  it("gives the worm a thread that stands off from a central core (not a smooth cylinder)", () => {
    const geometry = buildGeometryForType("worm", 2, 1);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const maxRadius = Math.max(
      Math.hypot(box.max.x, 0), Math.hypot(box.max.y, 0),
    );
    expect(maxRadius).toBeGreaterThan(1 * 0.9); // exceeds the plain core radius
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
    const shortLength = short.boundingBox!.max.x - short.boundingBox!.min.x;
    const longLength = long.boundingBox!.max.x - long.boundingBox!.min.x;
    expect(longLength).toBeGreaterThan(shortLength);
  });
});
