import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 0.4;
const ADDENDUM_FACTOR = 1.25; // bevel/worm tip radius beyond the pitch radius, in modules (unrelated to the involute profile below)
const BEVEL_OPTIONS = { bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };

const PRESSURE_ANGLE = (20 * Math.PI) / 180; // standard 20° pressure angle
const DEDENDUM_FACTOR = 1.25; // root depth below the pitch circle, in modules (standard)
const FLANK_SEGMENTS = 4; // involute-curve samples per tooth flank

/** A point on the involute of a circle of `baseRadius`, at roll parameter `t` (t=0 is
 *  where the involute meets the base circle). This is the actual curve every real
 *  gear tooth's flank is cut to -- not an approximation of it. */
function involutePoint(baseRadius: number, t: number): THREE.Vector2 {
  return new THREE.Vector2(
    baseRadius * (Math.cos(t) + t * Math.sin(t)),
    baseRadius * (Math.sin(t) - t * Math.cos(t)),
  );
}

/** The roll parameter `t` at which the involute of `baseRadius` reaches `radius`
 *  (radius = baseRadius * sqrt(1 + t^2), inverted). */
function involuteParamAtRadius(baseRadius: number, radius: number): number {
  const ratio = radius / baseRadius;
  return Math.sqrt(Math.max(0, ratio * ratio - 1));
}

/** A real involute tooth profile -- the exact mathematical curve every manufactured
 *  gear tooth flank uses (standard 20° pressure angle, 1-module addendum, 1.25-module
 *  dedendum) -- rather than the flat-sided block shape this used to generate. Each
 *  tooth is a root point, an involute flank curving out to the addendum (teeth are
 *  wider at the root and narrow toward the tip, the recognizable real-gear silhouette),
 *  a short tip, the mirrored flank back down, and a root point on the other side. The
 *  short straight step from the root circle up to the base circle (where the involute
 *  begins) approximates the fillet real gears cut there -- a standard simplification
 *  that doesn't change the tooth's overall silhouette. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(PRESSURE_ANGLE);
  const addendumRadius = pitchRadius + module;
  const dedendumRadius = pitchRadius - module * DEDENDUM_FACTOR;

  const anglePerTooth = (Math.PI * 2) / teeth;
  const halfToothAngle = anglePerTooth / 4; // quarter of the full tooth-pitch angle

  // Rotates the raw involute (whose t=0 point naturally sits at polar angle 0) so its
  // pitch-radius crossing lands exactly half a tooth-width from the tooth's centerline.
  const tPitch = involuteParamAtRadius(baseRadius, pitchRadius);
  const pitchPoint = involutePoint(baseRadius, tPitch);
  const pitchAngle = Math.atan2(pitchPoint.y, pitchPoint.x);
  const rotationOffset = -halfToothAngle - pitchAngle;
  const tEnd = involuteParamAtRadius(baseRadius, addendumRadius);

  const points: THREE.Vector2[] = [];
  for (let tooth = 0; tooth < teeth; tooth++) {
    const center = tooth * anglePerTooth;
    const leftBaseAngle = rotationOffset + center; // angle of the involute's t=0 (base circle) point

    points.push(new THREE.Vector2(Math.cos(leftBaseAngle) * dedendumRadius, Math.sin(leftBaseAngle) * dedendumRadius));

    for (let i = 0; i <= FLANK_SEGMENTS; i++) {
      const t = (tEnd * i) / FLANK_SEGMENTS;
      const raw = involutePoint(baseRadius, t);
      const angle = Math.atan2(raw.y, raw.x) + rotationOffset + center;
      points.push(new THREE.Vector2(Math.cos(angle) * raw.length(), Math.sin(angle) * raw.length()));
    }

    for (let i = FLANK_SEGMENTS; i >= 0; i--) {
      const t = (tEnd * i) / FLANK_SEGMENTS;
      const raw = involutePoint(baseRadius, t);
      const angle = -(Math.atan2(raw.y, raw.x) + rotationOffset) + center; // mirror of the left flank about `center`
      points.push(new THREE.Vector2(Math.cos(angle) * raw.length(), Math.sin(angle) * raw.length()));
    }

    const rightBaseAngle = center - rotationOffset; // mirror of leftBaseAngle about `center`
    points.push(new THREE.Vector2(Math.cos(rightBaseAngle) * dedendumRadius, Math.sin(rightBaseAngle) * dedendumRadius));
  }
  return points;
}

function circlePoints(radius: number, segments = 32): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

/** A circular hole path for `Shape.holes` — used to give gears and the flywheel an
 *  actual center bore instead of a solid disc. */
function boreHole(radius: number): THREE.Path {
  return new THREE.Path().setFromPoints(circlePoints(radius));
}

function extrudedGearGeometry(teeth: number, module: number, twistPerUnit = 0): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const pitchRadius = (module * teeth) / 2;
  shape.holes.push(boreHole(Math.max(pitchRadius * 0.3, module * 0.6)));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    ...BEVEL_OPTIONS,
    depth: GEAR_THICKNESS,
    curveSegments: 1,
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

function crankGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const handle = new THREE.CylinderGeometry(module * 0.3, module * 0.3, pitchRadius * 1.4, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(pitchRadius * 0.9, 0, GEAR_THICKNESS / 2);
  return mergeGeometries([base, handle]);
}

/** A power source shaped like a battery: the base gear (identical mesh rules to a
 *  crank) plus a squat cylinder with a small "+" terminal bump — a different picture
 *  of "where the energy comes from" for teaching, mechanically the same part. */
function batteryGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const body = new THREE.CylinderGeometry(module * 0.55, module * 0.55, module * 1.2, 16);
  body.rotateX(Math.PI / 2);
  body.translate(pitchRadius * 0.75, 0, GEAR_THICKNESS / 2 + module * 0.6);
  const terminal = new THREE.CylinderGeometry(module * 0.2, module * 0.2, module * 0.3, 12);
  terminal.rotateX(Math.PI / 2);
  terminal.translate(pitchRadius * 0.75, 0, GEAR_THICKNESS / 2 + module * 1.35);
  return mergeGeometries([base, body, terminal]);
}

/** A power source shaped like a wall outlet: the base gear plus a flat plate with two
 *  raised prong slots — another "where the energy comes from" picture for the same
 *  crank-equivalent part. */
function outletGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const plate = new THREE.BoxGeometry(module * 1.4, module * 1.8, module * 0.3);
  plate.translate(pitchRadius * 0.75, 0, GEAR_THICKNESS / 2 + module * 0.15);
  const slotA = new THREE.BoxGeometry(module * 0.15, module * 0.5, module * 0.15);
  slotA.translate(pitchRadius * 0.75 - module * 0.3, module * 0.35, GEAR_THICKNESS / 2 + module * 0.3);
  const slotB = new THREE.BoxGeometry(module * 0.15, module * 0.5, module * 0.15);
  slotB.translate(pitchRadius * 0.75 + module * 0.3, module * 0.35, GEAR_THICKNESS / 2 + module * 0.3);
  return mergeGeometries([base, plate, slotA, slotB]);
}

/** A flat, circular Shape extruded along Z, centered on its own thickness — the shared
 *  builder behind the flywheel and gauge dial (both are "solid disc with a hole,"
 *  differing only in radii and what else gets merged onto them). `ExtrudeGeometry`
 *  already extrudes along +Z from a shape defined in the XY plane, which is exactly
 *  the thickness axis `gearMesh.ts` expects (no `rotateX` needed here, unlike the
 *  Y-aligned primitives like `CylinderGeometry`/`ConeGeometry` below). */
function discWithHole(outerRadius: number, innerRadius: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(circlePoints(outerRadius));
  shape.holes.push(boreHole(innerRadius));
  const geometry = new THREE.ExtrudeGeometry(shape, { ...BEVEL_OPTIONS, depth: thickness, curveSegments: 24 });
  geometry.translate(0, 0, -thickness / 2); // center on its local origin, like the other gear geometries
  return geometry;
}

/** A flywheel: a ring (annulus) rather than a solid disc, so it visibly has a hole. */
function loadGeometry(module: number): THREE.BufferGeometry {
  return discWithHole(module * 2, module * 0.7, GEAR_THICKNESS * 2);
}

/** An RPM dial: a disc face + a needle merged on top, both rigid so the needle visibly
 *  sweeps around as the coupled shaft spins — an at-a-glance "how fast is this turning"
 *  readout for a teaching sandbox, without needing a numeric HUD overlay. */
function gaugeGeometry(module: number): THREE.BufferGeometry {
  const dialRadius = module * 2;
  const dial = discWithHole(dialRadius, module * 0.3, GEAR_THICKNESS);
  const needle = new THREE.BoxGeometry(dialRadius * 1.7, module * 0.15, GEAR_THICKNESS * 1.5);
  needle.translate(dialRadius * 0.35, 0, 0);
  return mergeGeometries([dial, needle]);
}

/** A small hub with a few blade paddles, radiating outward — a fan/propeller, giving
 *  rotation a second, very legible "output device" beyond the flywheel's plain color
 *  change (kids can watch it visibly spin like a real fan). */
function fanGeometry(module: number): THREE.BufferGeometry {
  const hubRadius = module * 0.6;
  const hub = discWithHole(hubRadius, hubRadius * 0.3, GEAR_THICKNESS);
  const bladeCount = 4;
  const bladeLength = module * 2.2;
  const parts = [hub];
  for (let i = 0; i < bladeCount; i++) {
    const blade = new THREE.BoxGeometry(bladeLength, module * 0.7, GEAR_THICKNESS * 0.6);
    blade.translate(bladeLength / 2 + hubRadius * 0.7, 0, 0);
    blade.rotateZ((i / bladeCount) * Math.PI * 2);
    parts.push(blade);
  }
  return mergeGeometries(parts);
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Simple non-indexed concatenation — sufficient for a display mesh with one material.
  // Carries `uv` along with position/normal so a texture map doesn't silently vanish
  // on merged geometries (the crank's handle).
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const geo of geometries) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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
      const pitchRadius = (module * teeth) / 2;
      const bevelGeometry = new THREE.ConeGeometry(pitchRadius + module * ADDENDUM_FACTOR, GEAR_THICKNESS * 3, teeth);
      bevelGeometry.rotateX(Math.PI / 2);
      return bevelGeometry;
    }
    case "worm": {
      const length = module * 6;
      const wormGeometry = new THREE.CylinderGeometry(module * 1.2, module * 1.2, length, 16, 1, false);
      wormGeometry.rotateX(Math.PI / 2);
      return wormGeometry;
    }
    case "load":
      return loadGeometry(module);
    case "gauge":
      return gaugeGeometry(module);
    case "fan":
      return fanGeometry(module);
    case "battery":
      return batteryGeometry(teeth, module);
    case "outlet":
      return outletGeometry(teeth, module);
  }
}
