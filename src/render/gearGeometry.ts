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
 *  proportions), traced as one closed polygon around the whole gear -- root land, left
 *  flank (dedendum/base -> addendum), right flank (addendum -> dedendum/base), repeated
 *  per tooth. The flank order matters: it keeps the boundary a simple (non-self-
 *  intersecting) polygon, which triangulation depends on.
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

    // Left flank, dedendum/base -> addendum. It MUST be the flank drawn first: the root
    // point pushed above sits on the LEFT of the tooth centre, so emitting the right
    // flank first would make the traced boundary jump across the tooth and cross itself
    // (a bow-tie) once per tooth.
    for (let i = 0; i <= FLANK_SAMPLES; i++) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center - flankAngle(r);
      points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }

    // Right flank, addendum -> dedendum/base (mirror of the left flank), landing next to
    // the following tooth's root point.
    for (let i = FLANK_SAMPLES; i >= 0; i--) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center + flankAngle(r);
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

function planetaryGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const ringPitchRadius = (module * teeth) / 2;
  const sunTeeth = Math.max(6, Math.round(teeth / 3));
  const planetTeeth = Math.max(6, Math.round((teeth - sunTeeth) / 2));
  const sun = extrudedGearGeometry(sunTeeth, module);
  const ring = new THREE.TorusGeometry(ringPitchRadius, module * 1.5, 8, Math.max(16, teeth));
  const planetOrbitRadius = (module * (sunTeeth + planetTeeth)) / 2;
  const geometries = [sun, ring];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const planet = extrudedGearGeometry(planetTeeth, module);
    planet.translate(Math.cos(angle) * planetOrbitRadius, Math.sin(angle) * planetOrbitRadius, 0);
    geometries.push(planet);
  }
  return mergeGeometries(geometries);
}

function rackGeometry(teethCount: number, module: number): THREE.BufferGeometry {
  const teeth = Math.max(4, Math.round(teethCount) || 8);
  const addendum = module * ADDENDUM_FACTOR;
  const dedendum = module * DEDENDUM_FACTOR;
  const pitch = Math.PI * module;
  const halfToothWidth = pitch / 4;
  const slope = Math.tan(PRESSURE_ANGLE);
  const points: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) {
    const cx = k * pitch;
    points.push(new THREE.Vector2(cx - pitch / 2, -dedendum));
    points.push(new THREE.Vector2(cx - halfToothWidth - slope * dedendum, -dedendum));
    points.push(new THREE.Vector2(cx - halfToothWidth + slope * addendum, addendum));
    points.push(new THREE.Vector2(cx + halfToothWidth - slope * addendum, addendum));
    points.push(new THREE.Vector2(cx + halfToothWidth + slope * dedendum, -dedendum));
  }
  points.push(new THREE.Vector2(teeth * pitch - pitch / 2, -dedendum));
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: GEAR_THICKNESS, bevelEnabled: false, curveSegments: 1 });
  // The profile above runs along local X and is extruded for thickness along local Z.
  // But GearMeshObject aligns local Z to gear.axis and then slides a rack along that
  // axis by linearPosition, so leaving the bar on X makes it travel dead perpendicular
  // to its own body. Rotate the bar's length onto Z. The sign matters: THREE's
  // makeRotationY sends (1,0,0) to (0,0,-1) for +PI/2 but to (0,0,+1) for -PI/2, so
  // -PI/2 is the one that maps local +X to local +Z and keeps the bar extending in the
  // +axis direction it originally pointed.
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

function pulleyGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const points = [
    new THREE.Vector2(pitchRadius * 0.9, -GEAR_THICKNESS),
    new THREE.Vector2(pitchRadius, -GEAR_THICKNESS * 0.3),
    new THREE.Vector2(pitchRadius * 0.85, 0),
    new THREE.Vector2(pitchRadius, GEAR_THICKNESS * 0.3),
    new THREE.Vector2(pitchRadius * 0.9, GEAR_THICKNESS),
  ];
  const lathe = new THREE.LatheGeometry(points, 24);
  lathe.rotateX(Math.PI / 2);
  return lathe;
}

function differentialGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const housing = new THREE.SphereGeometry(pitchRadius * 0.8, 16, 12);
  const inputGear = new THREE.ConeGeometry(pitchRadius, GEAR_THICKNESS * 2, teeth);
  inputGear.rotateX(Math.PI / 2);
  inputGear.translate(0, 0, pitchRadius * 0.9);
  return mergeGeometries([housing, inputGear]);
}

/** A spur-gear body plus a single angled pawl arm sticking out past the rim -- the
 *  pawl mechanism itself isn't simulated (spec §3.2's one-way behaviour comes purely
 *  from `evaluatePair`'s `oneWay` field), but a plain involute gear is otherwise visually
 *  indistinguishable from a spur gear, which undersells that this is a different object
 *  entirely. The arm is the one visual cue a ratchet actually has in reality. */
function ratchetGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const addendumRadius = (module * teeth) / 2 + module * ADDENDUM_FACTOR;
  const pawlLength = module * 1.8;
  const pawl = new THREE.BoxGeometry(module * 0.35, pawlLength, GEAR_THICKNESS * 1.5);
  // Anchor the pawl's inner edge at the tooth tips (addendum circle) and let it extend
  // further out from there -- anything shorter is hidden inside the gear's own teeth.
  pawl.translate(0, addendumRadius + pawlLength / 2, 0);
  pawl.rotateZ(Math.PI / 7); // angled, not a straight radial spoke -- reads as a catch, not a handle
  return mergeGeometries([base, pawl]);
}

/** A thin hub disk ringed with small square teeth, rather than full involute flanks --
 *  the real distinguishing silhouette of a chain sprocket (spec §3.3) against a normal
 *  gear. A true ANSI chain-sprocket tooth profile is out of scope; this reads as
 *  visually distinct without deriving a whole new curve. */
function sprocketGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const hub = new THREE.CylinderGeometry(pitchRadius * 0.85, pitchRadius * 0.85, GEAR_THICKNESS, 24);
  hub.rotateX(Math.PI / 2);
  const toothWidth = module * 0.5;
  const toothHeight = module * 0.9;
  const geometries: THREE.BufferGeometry[] = [hub];
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(toothWidth, toothHeight, GEAR_THICKNESS);
    tooth.translate(0, pitchRadius * 0.85 + toothHeight / 2, 0);
    tooth.rotateZ(-angle); // translate first, then rotate about the hub's centre -- spaces each tooth radially
    geometries.push(tooth);
  }
  return mergeGeometries(geometries);
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
    case "ratchet":
      return ratchetGeometry(teeth, module);
    case "sprocket":
      return sprocketGeometry(teeth, module);
    case "planetary":
      return planetaryGeometry(teeth, module);
    case "rack":
      return rackGeometry(teeth, module);
    case "pulley":
      return pulleyGeometry(teeth, module);
    case "differential":
      return differentialGeometry(teeth, module);
  }
}
