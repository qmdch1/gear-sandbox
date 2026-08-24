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
 *  for anything (their orientation comes from position/position2 instead).
 *  +Y is this sim's "lying flat" orientation (the gear's own face -- its
 *  rotation plane -- ends up horizontal, like a coin on a table); +X is
 *  "standing upright." Kept as its own simple X<->Y flip (the V key's
 *  established behavior) -- see `turnedAxis` below for the OTHER, unrelated
 *  toggle (turning a part sideways while it stays standing). */
export function toggledAxis(axis: [number, number, number]): [number, number, number] {
  const isX = Math.abs(axis[0]) > 0.5;
  return isX ? [0, 1, 0] : [1, 0, 0];
}

/** Toggles a STANDING part (see `toggledAxis` above) between facing the
 *  sim's two horizontal directions, +X and +Z -- e.g. turning a car's wheel
 *  to spin around the car's own width axis instead of its length axis,
 *  without it ever passing through +Y along the way. +Y (this sim's "lying
 *  flat" orientation) is deliberately never a stop on this toggle: an
 *  earlier version cycled through all of X/Y/Z in one shared sequence, which
 *  meant turning a part sideways sometimes made it visibly flop flat first
 *  ("눕는" -- lying down) before reaching the other standing direction, the
 *  exact opposite of what "turn it sideways" was supposed to mean, since
 *  lying-flat vs. standing is already `toggledAxis`'s (the V key's) own job.
 *  Whichever of +X/+Z the axis is currently closer to flips to the other;
 *  anything else (including the default +Y) falls through to +Z, this
 *  toggle's original motivating case. A pure 2-state flip, so ArrowLeft and
 *  ArrowRight trigger it the same way -- with only two reachable states,
 *  there's no separate "forward" vs "backward" to distinguish. */
export function turnedAxis(axis: [number, number, number]): [number, number, number] {
  const closerToZ = Math.abs(axis[2]) > Math.abs(axis[0]);
  return closerToZ ? [1, 0, 0] : [0, 0, 1];
}

const ZERO_TEETH_TYPES = new Set<GearType>([
  "load", "gauge", "fan", "wheel", "shaft", "beam", "belt", "joint", "bearing", "spring", "rotor", "track",
]);

export function defaultTeethForType(type: GearType): number {
  if (ZERO_TEETH_TYPES.has(type)) return 0; // couple/join, don't mesh
  if (type === "worm") return 1; // single-start: the standard, simplest worm -- one full
  // crank turn advances the wheel by exactly one tooth, the clearest reduction ratio to teach
  return 20; // standard, safely above the ~17-tooth undercut threshold for 20° pressure-angle gears
}

// A rod's two ends spawn this far apart along +X by default -- close enough that
// dragging either end toward a real target isn't a huge trek, far enough to visibly
// read as "a rod connecting two things" rather than a stub.
const DEFAULT_ROD_LENGTH = 12;
const ROD_TYPES = new Set<GearType>(["shaft", "beam", "belt", "joint", "spring", "track"]);

// Every geometry function scales uniformly off `module` -- this is just the
// starting size for a freshly-placed part (still freely adjustable afterward
// via the size slider, see resize.ts), picked smaller than the old fixed 1 so
// a default gear train reads as more true-to-scale next to the starter kit's
// other parts.
const DEFAULT_MODULE = 0.5;

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
    module: DEFAULT_MODULE,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity: POWER_SOURCE_TYPES.has(type) ? 1 : 0,
  };
}
