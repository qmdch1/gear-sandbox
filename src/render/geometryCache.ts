import * as THREE from "three";
import type { GearType } from "../sim/types";
import { buildGeometryForType } from "./gearGeometry";

/** `buildGeometryForType` is a pure function of exactly (type, teeth, module) --
 *  nothing about a specific gear instance (position, rotation, durability, ...)
 *  ever affects the shape it produces. So every gear that shares the same
 *  (type, teeth, module) triple (the common case: most placed gears use the
 *  factory defaults) can safely share ONE BufferGeometry instance instead of
 *  each rebuilding an identical copy from scratch -- this was previously
 *  rebuilt per-gear even for two spur gears with identical teeth/module.
 *  Materials are NOT cached here (only geometry) -- each gear's current
 *  durability color is a live, per-instance material property, so sharing
 *  materials across gears would make one gear's wear color bleed into every
 *  other gear using the same cached material. */
const cache = new Map<string, THREE.BufferGeometry>();

export function cachedGeometryFor(type: GearType, teeth: number, module: number): THREE.BufferGeometry {
  const key = `${type}:${teeth}:${module}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const geometry = buildGeometryForType(type, teeth, module);
  cache.set(key, geometry);
  return geometry;
}

/** Test-only escape hatch: clears the module-level cache so tests can assert on
 *  cache hits/misses without leaking state between them. */
export function clearGeometryCacheForTests(): void {
  cache.clear();
}
