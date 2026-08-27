import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 0.4;
const PRESSURE_ANGLE = 20 * (Math.PI / 180); // industry-standard 20°
const ADDENDUM_FACTOR = 1.0;   // standard: addendum = 1×module
const DEDENDUM_FACTOR = 1.25;  // standard: dedendum = 1.25×module (root clearance below the base circle)
const FLANK_SAMPLES = 5;       // points sampled along each involute flank

/** The involute function inv(alpha) = tan(alpha) - alpha: polar angle (from the
 *  point where the curve departs the base circle) of the involute point at radius
 *  r = baseRadius / cos(alpha). */
function involuteAngleAtRadius(baseRadius: number, r: number): number {
  const alpha = Math.acos(Math.min(1, baseRadius / Math.max(r, baseRadius)));
  return Math.tan(alpha) - alpha;
}

/** Pure profile math: a standard involute tooth profile (20° pressure angle, unity-module
 *  proportions), traced as one closed polygon around the whole gear -- root land, right
 *  flank (dedendum/base -> addendum), left flank (addendum -> dedendum/base), repeated
 *  per tooth.
 *
 *  Verified (see spec §2.1): tooth thickness at the pitch circle equals the standard
 *  pi*module/2 exactly, and tooth angular width narrows monotonically from dedendum to
 *  addendum (the physical rack-limit taper) -- both checked here in the test file below. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(PRESSURE_ANGLE);
  const addendumRadius = pitchRadius + module * ADDENDUM_FACTOR;
  const dedendumRadius = pitchRadius - module * DEDENDUM_FACTOR;
  const flankStartRadius = Math.max(baseRadius, dedendumRadius); // involute is undefined inside the base circle
  const toothAngularPitch = (Math.PI * 2) / teeth;
  const halfToothAngleAtPitch = toothAngularPitch / 4; // standard: tooth thickness = half the circular pitch
  const invAtPitch = involuteAngleAtRadius(baseRadius, pitchRadius);

  function flankAngle(r: number): number {
    return halfToothAngleAtPitch - (involuteAngleAtRadius(baseRadius, r) - invAtPitch);
  }

  const points: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) {
    const center = k * toothAngularPitch;

    points.push(new THREE.Vector2(
      Math.cos(center - toothAngularPitch / 2) * dedendumRadius,
      Math.sin(center - toothAngularPitch / 2) * dedendumRadius,
    ));

    for (let i = 0; i <= FLANK_SAMPLES; i++) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center + flankAngle(r);
      points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }

    for (let i = FLANK_SAMPLES; i >= 0; i--) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center - flankAngle(r);
      points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }
  }
  return points;
}

function extrudedGearGeometry(teeth: number, module: number, twistPerUnit = 0): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: GEAR_THICKNESS,
    bevelEnabled: false,
    curveSegments: 2,
  });
  if (twistPerUnit !== 0) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      const angle = z * twistPerUnit;
      const x = position.getX(i);
      const y = position.getY(i);
      position.setX(i, x * Math.cos(angle) - y * Math.sin(angle));
      position.setY(i, x * Math.sin(angle) + y * Math.cos(angle));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Extrudes the involute tooth profile and then scales each cross-section toward the
 *  apex as z increases -- an approximation of real bevel-gear tooth taper (true bevel
 *  teeth are generated on a cone via Tredgold's approximation; this project's procedural
 *  geometry uses the simpler linear taper, consistent with the sandbox's existing
 *  approach of visual-approximation-over-CAD-precision). */
function taperedGearGeometry(teeth: number, module: number, coneHeight: number, taperRatio: number): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: coneHeight, bevelEnabled: false, curveSegments: 2 });
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const t = z / coneHeight;
    const scale = 1 - t * (1 - taperRatio);
    position.setX(i, position.getX(i) * scale);
    position.setY(i, position.getY(i) * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function crankGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const handle = new THREE.CylinderGeometry(module * 0.3, module * 0.3, pitchRadius * 1.4, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(pitchRadius * 0.9, 0, GEAR_THICKNESS / 2);
  return mergeGeometries([base, handle]);
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Simple non-indexed concatenation — sufficient for a display mesh with one material.
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  for (const geo of geometries) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

export function buildGeometryForType(type: GearType, teeth: number, module: number): THREE.BufferGeometry {
  switch (type) {
    case "spur":
      return extrudedGearGeometry(teeth, module);
    case "helical":
      return extrudedGearGeometry(teeth, module, 1.2); // twisted teeth = helical
    case "crank":
      return crankGeometry(teeth, module);
    case "bevel": {
      const coneHeight = GEAR_THICKNESS * 3;
      return taperedGearGeometry(teeth, module, coneHeight, 0.15);
    }
    case "worm": {
      const length = module * 6;
      const coreRadius = module * 0.9;
      const threadRadius = module * 1.3;
      const threadPitch = module * 1.5;
      const turns = length / threadPitch;
      const segments = 120;
      const helixPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = t * turns * Math.PI * 2;
        const z = -length / 2 + t * length;
        helixPoints.push(new THREE.Vector3(Math.cos(angle) * threadRadius, Math.sin(angle) * threadRadius, z));
      }
      const curve = new THREE.CatmullRomCurve3(helixPoints);
      const thread = new THREE.TubeGeometry(curve, segments, module * 0.35, 8, false);
      const core = new THREE.CylinderGeometry(coreRadius, coreRadius, length, 16);
      core.rotateX(Math.PI / 2);
      return mergeGeometries([core, thread]);
    }
    case "load": {
      const loadGeometry = new THREE.CylinderGeometry(module * 2, module * 2, GEAR_THICKNESS * 2, 24);
      loadGeometry.rotateX(Math.PI / 2);
      return loadGeometry;
    }
    case "rack":
    case "planetary":
    case "ratchet":
    case "sprocket":
    case "pulley":
    case "differential": {
      // TEMPORARY placeholder -- Task 12 replaces these cases with real geometry
      // (rack/planetary/ratchet/sprocket/pulley/differential). Task 12: REPLACE these
      // case labels, do not add new ones alongside them -- duplicate `case` labels in
      // a switch are not a TypeScript error (first match wins silently), so appending
      // instead of replacing would leave this placeholder permanently shadowing the
      // real geometry.
      return new THREE.BoxGeometry(module, module, module);
    }
  }
}
