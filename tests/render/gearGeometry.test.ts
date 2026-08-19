// tests/render/gearGeometry.test.ts
import { describe, it, expect } from "vitest";
import { computeSpurProfilePoints, buildGeometryForType } from "../../src/render/gearGeometry";

describe("computeSpurProfilePoints", () => {
  it("produces 4 points per tooth", () => {
    const points = computeSpurProfilePoints(20, 1);
    expect(points.length).toBe(80);
  });

  it("alternates between an outer and an inner radius", () => {
    const points = computeSpurProfilePoints(10, 1);
    const radii = new Set(points.map((p) => Math.round(p.length() * 1000)));
    expect(radii.size).toBe(2);
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
});
