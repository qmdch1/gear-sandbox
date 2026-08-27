import type { GearInstance, GearType } from "./types";
import { GEAR_DEFS } from "./gearDefs";

/** Bevel/worm gears mesh with a partner only on a *perpendicular* axis (see meshing.ts),
 *  so they need a different default axis than the rest of the parallel-shaft family. */
export const PERPENDICULAR_AXIS_TYPES = new Set<GearType>(["bevel", "worm", "differential"]);

export function defaultAxisForType(type: GearType): [number, number, number] {
  return PERPENDICULAR_AXIS_TYPES.has(type) ? [1, 0, 0] : [0, 1, 0];
}

export function defaultTeethForType(type: GearType): number {
  if (type === "load") return 0;
  if (type === "worm") return 2;
  if (type === "rack") return 8; // visible tooth count along the default-length bar
  return 20;
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
    angularVelocity: type === "crank" ? 1 : 0,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}
