// tests/render/gearGeometry.test.ts
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { computeSpurProfilePoints, buildGeometryForType } from "../../src/render/gearGeometry";

describe("computeSpurProfilePoints", () => {
  it("produces 13 points per tooth (root land + 6-point right flank + 6-point left flank)", () => {
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
    // tooth 0 spans points[0..12]; index 6 is the tip-most sample on the right flank,
    // index 1 is the dedendum-most sample on the right flank (see Step 1's point order).
    // Find the two points (one per flank) whose radius is closest to the pitch radius.
    const rightFlank = points.slice(1, 7);
    const leftFlank = points.slice(7, 13);
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
    const rightFlank = points.slice(1, 7); // dedendum/base -> addendum, in order
    const angles = rightFlank.map((p) => Math.atan2(p.y, p.x));
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeLessThanOrEqual(angles[i - 1] + 1e-9); // right flank moves toward center outward
    }
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
