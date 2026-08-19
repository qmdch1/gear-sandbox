import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 0.4;
const ADDENDUM_FACTOR = 1.25; // tooth tip radius beyond the pitch radius, in modules

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

function extrudedGearGeometry(teeth: number, module: number, twistPerUnit = 0): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: GEAR_THICKNESS,
    bevelEnabled: false,
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
      const pitchRadius = (module * teeth) / 2;
      return new THREE.ConeGeometry(pitchRadius + module * ADDENDUM_FACTOR, GEAR_THICKNESS * 3, teeth);
    }
    case "worm": {
      const length = module * 6;
      return new THREE.CylinderGeometry(module * 1.2, module * 1.2, length, 16, 1, false);
    }
    case "load":
      return new THREE.CylinderGeometry(module * 2, module * 2, GEAR_THICKNESS * 2, 24);
  }
}
