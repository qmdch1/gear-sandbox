import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 0.4;
const ADDENDUM_FACTOR = 1.25; // tooth tip radius beyond the pitch radius, in modules
const BEVEL_OPTIONS = { bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };

/** Pure profile math: alternating outer-tooth/inner-root points around the pitch circle. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const outerRadius = pitchRadius + module * ADDENDUM_FACTOR;
  const innerRadius = pitchRadius - module * ADDENDUM_FACTOR * 0.5;
  const points: THREE.Vector2[] = [];
  const stepsPerTooth = 4;
  const totalSteps = teeth * stepsPerTooth;
  for (let i = 0; i < totalSteps; i++) {
    const angle = (i / totalSteps) * Math.PI * 2;
    const withinTooth = i % stepsPerTooth;
    const radius = withinTooth < 2 ? outerRadius : innerRadius;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
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
  }
}
