// tests/render/gearGeometry.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { computeSpurProfilePoints, buildGeometryForType } from "../../src/render/gearGeometry";

describe("computeSpurProfilePoints", () => {
  it("produces the same fixed point count per tooth (2 root points + 2 mirrored 5-point involute flanks)", () => {
    const points = computeSpurProfilePoints(20, 1);
    expect(points.length).toBe(20 * 12); // 2 + 2*(FLANK_SEGMENTS+1) = 2 + 2*5 = 12
  });

  it("keeps every point within the standard addendum/dedendum radius band (module 1, 20 teeth -> pitch 10)", () => {
    const points = computeSpurProfilePoints(20, 1);
    const dedendumRadius = 10 - 1 * 1.25; // pitchRadius - module*1.25
    const addendumRadius = 10 + 1; // pitchRadius + module
    for (const p of points) {
      expect(p.length()).toBeGreaterThanOrEqual(dedendumRadius - 1e-6);
      expect(p.length()).toBeLessThanOrEqual(addendumRadius + 1e-6);
    }
  });

  it("makes each tooth wider at the root than at the tip -- the real involute-gear silhouette", () => {
    // Points per tooth: [0]=left root, [1..5]=left flank (base->tip), [6..10]=right
    // flank (tip->base), [11]=right root. So the root span is between points 0 and 11,
    // the tip span is between the flanks' middle (points 5 and 6).
    const pointsPerTooth = 12;
    const points = computeSpurProfilePoints(20, 1);
    const [rootLeft, , , , , tipLeft, tipRight, , , , , rootRight] = points.slice(0, pointsPerTooth);
    const angleBetween = (a: THREE.Vector2, b: THREE.Vector2) => Math.abs(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
    expect(angleBetween(rootLeft, rootRight)).toBeGreaterThan(angleBetween(tipLeft, tipRight));
  });
});

describe("buildGeometryForType", () => {
  it("builds a non-empty geometry for every gear type", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load", "gauge", "fan", "battery", "outlet"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });
});
