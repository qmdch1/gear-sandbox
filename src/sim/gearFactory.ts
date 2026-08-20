import type { GearInstance, GearType } from "./types";
import { GEAR_DEFS, POWER_SOURCE_TYPES } from "./gearDefs";

/** Bevel/worm gears mesh with a partner only on a *perpendicular* axis (see meshing.ts),
 *  so they need a different default axis than the rest of the parallel-shaft family. */
export const PERPENDICULAR_AXIS_TYPES = new Set<GearType>(["bevel", "worm"]);

export function defaultAxisForType(type: GearType): [number, number, number] {
  return PERPENDICULAR_AXIS_TYPES.has(type) ? [1, 0, 0] : [0, 1, 0];
}

/** Flips a bevel/worm gear's axis between the two cardinal directions that
 *  actually mean anything in this sim (world +X and +Y) -- the only way to build
 *  a bevel-to-bevel pair (which needs one gear on each axis to be perpendicular at
 *  all -- see meshing.ts's bevel tests) or to stand a horizontal-by-default worm
 *  upright, since nothing else ever changes a gear's axis after creation. A no-op
 *  for every other type -- the rest of the parallel-shaft family is always +Y by
 *  design, and every meshing rule in meshing.ts assumes that. */
export function toggledAxis(type: GearType, axis: [number, number, number]): [number, number, number] {
  if (!PERPENDICULAR_AXIS_TYPES.has(type)) return axis;
  const isX = Math.abs(axis[0]) > 0.5;
  return isX ? [0, 1, 0] : [1, 0, 0];
}

export function defaultTeethForType(type: GearType): number {
  if (type === "load" || type === "gauge" || type === "fan" || type === "wheel") return 0; // couple, don't mesh
  if (type === "worm") return 1; // single-start: the standard, simplest worm -- one full
  // crank turn advances the wheel by exactly one tooth, the clearest reduction ratio to teach
  return 20; // standard, safely above the ~17-tooth undercut threshold for 20° pressure-angle gears
}

/** Builds a brand-new gear instance with a globally unique id (crypto.randomUUID --
 *  no counter to track or reseed across load/import events). */
export function createGear(type: GearType, position: [number, number, number]): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id: crypto.randomUUID(),
    type,
    position,
    axis: defaultAxisForType(type),
    teeth: defaultTeethForType(type),
    module: 1,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity: POWER_SOURCE_TYPES.has(type) ? 1 : 0,
  };
}
