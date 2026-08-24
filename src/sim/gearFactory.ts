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
 *  Deliberately kept as its OWN simple X<->Y flip (the V key's existing,
 *  established behavior) rather than folded into `rotatedAxis`'s 3-way cycle
 *  below -- the two are complementary, not a replacement of one by the
 *  other: V stays a quick "flat vs. upright" flip, the arrow-key cycle
 *  reaches Z too, for the less common case that actually needs it. */
export function toggledAxis(axis: [number, number, number]): [number, number, number] {
  const isX = Math.abs(axis[0]) > 0.5;
  return isX ? [0, 1, 0] : [1, 0, 0];
}

// The three world directions this sim's meshing/rendering logic actually
// treats as meaningful -- every check in meshing.ts compares axes via dot
// product, which is agnostic to which of these three a gear is actually on,
// so cycling through all three (not just X/Y) is safe for every type.
const AXIS_CYCLE: Array<[number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Steps `axis` forward (`step = 1`, "우회전") or backward (`step = -1`,
 *  "좌회전") through the X -> Y -> Z cycle, one 90° turn per call -- lets any
 *  part reach the Z axis too, not just the X/Y pair the older `toggledAxis`
 *  alone ever reached (needed, for example, to build a car whose wheels spin
 *  around the car's own width axis rather than always X or Y). Finds
 *  whichever of the three cycle entries `axis` is closest to (by largest
 *  absolute component) rather than requiring an exact match, so it's robust
 *  to a hand-authored or slightly-off axis value, not just ones this same
 *  function already produced. A no-op in effect for "shaft"/"beam"/"belt",
 *  same as `toggledAxis` -- their `axis` field isn't used for anything. */
export function rotatedAxis(axis: [number, number, number], step: 1 | -1): [number, number, number] {
  let currentIndex = 0;
  let largestAbs = -Infinity;
  for (let i = 0; i < 3; i++) {
    const value = Math.abs(axis[i]);
    if (value > largestAbs) {
      largestAbs = value;
      currentIndex = i;
    }
  }
  const nextIndex = (currentIndex + step + AXIS_CYCLE.length) % AXIS_CYCLE.length;
  return AXIS_CYCLE[nextIndex];
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
