import type { GearInstance, GearType } from "./types";
import { GEAR_DEFS, POWER_SOURCE_TYPES } from "./gearDefs";

/** Bevel/worm gears mesh with a partner only on a *perpendicular* axis (see meshing.ts),
 *  so they need a different default axis than the rest of the parallel-shaft family. */
export const PERPENDICULAR_AXIS_TYPES = new Set<GearType>(["bevel", "worm"]);

export function defaultAxisForType(type: GearType): [number, number, number] {
  return PERPENDICULAR_AXIS_TYPES.has(type) ? [1, 0, 0] : [0, 1, 0];
}

/** Flips ANY gear's axis between the two cardinal directions that actually mean
 *  anything in this sim (world +X and +Y). Originally only did this for bevel/worm
 *  (the only types whose meshing rules cared which world axis they were on), but
 *  every parallel-family gear's own mesh check only cares that two gears are
 *  parallel to EACH OTHER, never to a specific world axis -- so toggling any of
 *  them is safe, it just means `meshPhaseAlignment`'s tooth-centering only fully
 *  applies once both sides happen to share the +Y axis again (same as any of the
 *  other cases where that refinement doesn't apply -- still meshes, just not
 *  perfectly centered). A no-op for "shaft"/"beam", whose `axis` field isn't used
 *  for anything (their orientation comes from position/position2 instead). */
export function toggledAxis(axis: [number, number, number]): [number, number, number] {
  const isX = Math.abs(axis[0]) > 0.5;
  return isX ? [0, 1, 0] : [1, 0, 0];
}

export function defaultTeethForType(type: GearType): number {
  if (type === "load" || type === "gauge" || type === "fan" || type === "wheel" || type === "shaft" || type === "beam") return 0; // couple/join, don't mesh
  if (type === "worm") return 1; // single-start: the standard, simplest worm -- one full
  // crank turn advances the wheel by exactly one tooth, the clearest reduction ratio to teach
  return 20; // standard, safely above the ~17-tooth undercut threshold for 20° pressure-angle gears
}

// A rod's two ends spawn this far apart along +X by default -- close enough that
// dragging either end toward a real target isn't a huge trek, far enough to visibly
// read as "a rod connecting two things" rather than a stub.
const DEFAULT_ROD_LENGTH = 12;
const ROD_TYPES = new Set<GearType>(["shaft", "beam"]);

/** Builds a brand-new gear instance with a globally unique id (crypto.randomUUID --
 *  no counter to track or reseed across load/import events). */
export function createGear(type: GearType, position: [number, number, number]): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id: crypto.randomUUID(),
    type,
    position,
    position2: ROD_TYPES.has(type) ? [position[0] + DEFAULT_ROD_LENGTH, position[1], position[2]] : undefined,
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
