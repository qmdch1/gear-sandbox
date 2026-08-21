// tests/render/gearGeometry.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { computeSpurProfilePoints, buildGeometryForType, beltTangentGeometry } from "../../src/render/gearGeometry";

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
    const types = ["spur", "helical", "crank", "bevel", "worm", "load", "gauge", "fan", "wheel", "shaft", "beam", "belt"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it("gives a bevel gear tooth studs that protrude past its smooth cone radius", () => {
    // Regression: bevel used to be a perfectly smooth ConeGeometry with `teeth` misused
    // as its radial segment count -- no actual teeth cut in at all.
    const module = 1;
    const teeth = 20;
    const pitchRadius = (module * teeth) / 2;
    const smoothConeRadius = pitchRadius + module * 1.25; // ADDENDUM_FACTOR, mirrored here
    const geometry = buildGeometryForType("bevel", teeth, module);
    const position = geometry.attributes.position;
    let maxRadialExtent = 0;
    for (let i = 0; i < position.count; i++) {
      // Post rotateX(PI/2), the cone's original radial (XZ) plane becomes XY.
      const radial = Math.hypot(position.getX(i), position.getY(i));
      maxRadialExtent = Math.max(maxRadialExtent, radial);
    }
    expect(maxRadialExtent).toBeGreaterThan(smoothConeRadius + 1e-6);
  });

  it("gives a worm gear a helical thread ridge that protrudes past its plain cylinder radius", () => {
    // Regression: worm used to be a perfectly smooth CylinderGeometry -- no visible
    // thread groove at all.
    const module = 1;
    const rootRadius = module * 0.85; // mirrors wormGeometry's rootRadius
    const geometry = buildGeometryForType("worm", 1, module);
    const position = geometry.attributes.position;
    let maxRadialExtent = 0;
    for (let i = 0; i < position.count; i++) {
      // Post rotateX(PI/2), the cylinder's original radial (XZ) plane becomes XY.
      const radial = Math.hypot(position.getX(i), position.getY(i));
      maxRadialExtent = Math.max(maxRadialExtent, radial);
    }
    expect(maxRadialExtent).toBeGreaterThan(rootRadius + 1e-6);
  });

  it("gives the wheel a dark rubber-tire tint distinct from its metal hub/spokes/rim", () => {
    // Regression: mergeGeometries used to have no per-part color at all -- every
    // sub-part rendered in the same single material tint.
    const geometry = buildGeometryForType("wheel", 0, 1);
    const color = geometry.attributes.color;
    expect(color).toBeDefined();
    let hasWhite = false;
    let hasDark = false;
    for (let i = 0; i < color.count; i++) {
      const r = color.getX(i);
      if (r > 0.9) hasWhite = true; // hub/spokes/rim: default (no-op) tint
      if (r < 0.2) hasDark = true; // the tire: explicit dark rubber tint
    }
    expect(hasWhite).toBe(true);
    expect(hasDark).toBe(true);
  });

  it("builds the shaft as a unit-length rod (gearMesh.ts stretches it via scale.z)", () => {
    const module = 1;
    const geometry = buildGeometryForType("shaft", 0, module);
    const position = geometry.attributes.position;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxRadial = 0;
    for (let i = 0; i < position.count; i++) {
      minZ = Math.min(minZ, position.getZ(i));
      maxZ = Math.max(maxZ, position.getZ(i));
      maxRadial = Math.max(maxRadial, Math.hypot(position.getX(i), position.getY(i)));
    }
    expect(maxZ - minZ).toBeCloseTo(1, 5); // unit length, spanning -0.5..0.5
    expect(maxRadial).toBeCloseTo(module * 0.4, 5);
  });

  it("builds the beam as a unit-length square bar (not a round rod like shaft)", () => {
    const module = 1;
    const geometry = buildGeometryForType("beam", 0, module);
    const position = geometry.attributes.position;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < position.count; i++) {
      minZ = Math.min(minZ, position.getZ(i));
      maxZ = Math.max(maxZ, position.getZ(i));
      maxX = Math.max(maxX, Math.abs(position.getX(i)));
      maxY = Math.max(maxY, Math.abs(position.getY(i)));
    }
    expect(maxZ - minZ).toBeCloseTo(1, 5); // unit length along Z, same stretch-via-scale.z convention as shaft
    // A square cross-section (BoxGeometry), unlike shaft's round cylinder -- the
    // corner is at (side/2, side/2), so its radial extent exceeds a round rod's
    // constant radius, making it visually distinguishable.
    expect(maxX).toBeCloseTo(module * 0.35, 5); // side = module*0.7, half-width = 0.35
    expect(maxY).toBeCloseTo(module * 0.35, 5);
  });

  it("builds the belt as a unit-length flat, wide strap (distinct from beam's square bar)", () => {
    const module = 1;
    const geometry = buildGeometryForType("belt", 0, module);
    const position = geometry.attributes.position;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < position.count; i++) {
      minZ = Math.min(minZ, position.getZ(i));
      maxZ = Math.max(maxZ, position.getZ(i));
      maxX = Math.max(maxX, Math.abs(position.getX(i)));
      maxY = Math.max(maxY, Math.abs(position.getY(i)));
    }
    expect(maxZ - minZ).toBeCloseTo(1, 5); // unit length along Z, same stretch-via-scale.z convention
    expect(maxX).toBeCloseTo(module * 0.5, 5);   // width = module*1.0, half = 0.5
    expect(maxY).toBeCloseTo(module * 0.075, 5); // thickness = module*0.15, half = 0.075
    // Wide and thin -- a strap, not a square bar (beam) or round rod (shaft).
    expect(maxX).toBeGreaterThan(maxY * 3);
  });
});

describe("beltTangentGeometry", () => {
  it("offsets both strands by exactly the shared radius when both pulleys are equal-sized", () => {
    // Equal radii is the degenerate case of the external-tangent derivation
    // where the two strands run perfectly parallel to the center line, offset
    // by exactly +/-r -- exactly how a real bike chain looks between two
    // same-size sprockets. p1/p2 both lie on the world X axis, so the offset
    // (perpendicular to X and to world +Y) lands on world +/-Z, letting this
    // be checked precisely via the geometry's own bounding box.
    const module = 1;
    const r = 5;
    const p1 = new THREE.Vector3(0, 0, 0);
    const p2 = new THREE.Vector3(20, 0, 0);
    const geometry = beltTangentGeometry(module, p1, p2, r, r);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(0, 4);
    expect(box.max.x).toBeCloseTo(20, 4);
    expect(box.min.z).toBeCloseTo(-(r + module * 0.5), 4);
    expect(box.max.z).toBeCloseTo(r + module * 0.5, 4);
    expect(box.min.y).toBeCloseTo(-module * 0.075, 4);
    expect(box.max.y).toBeCloseTo(module * 0.075, 4);
  });

  it("tapers the strand spread toward the smaller pulley when the radii differ", () => {
    // Real external tangent lines converge toward the smaller circle, unlike
    // this belt's own pre-tangent single-strap fallback (a fixed-width strip
    // through both centers regardless of pulley size). Verified here by
    // checking that vertices near the LARGE pulley end are spread wider
    // (in Z, the offset direction for an X-aligned pair) than vertices near
    // the SMALL pulley end.
    const module = 1;
    const p1 = new THREE.Vector3(0, 0, 0);
    const p2 = new THREE.Vector3(24, 0, 0);
    const geometry = beltTangentGeometry(module, p1, p2, 10, 2); // big at p1, small at p2
    const position = geometry.attributes.position;
    let nearP1MinZ = Infinity, nearP1MaxZ = -Infinity;
    let nearP2MinZ = Infinity, nearP2MaxZ = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (x < 6) { // close to p1 (the big pulley)
        nearP1MinZ = Math.min(nearP1MinZ, z);
        nearP1MaxZ = Math.max(nearP1MaxZ, z);
      } else if (x > 18) { // close to p2 (the small pulley)
        nearP2MinZ = Math.min(nearP2MinZ, z);
        nearP2MaxZ = Math.max(nearP2MaxZ, z);
      }
    }
    const spreadNearBigPulley = nearP1MaxZ - nearP1MinZ;
    const spreadNearSmallPulley = nearP2MaxZ - nearP2MinZ;
    expect(spreadNearBigPulley).toBeGreaterThan(spreadNearSmallPulley);
  });

  it("does not throw or produce NaN vertices when the two pulleys are (nearly) coincident", () => {
    const geometry = beltTangentGeometry(1, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1e-8, 0, 0), 5, 3);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
  });
});
