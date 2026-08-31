import type { GearInstance, GearType } from "./types";
import { GEAR_DEFS } from "./gearDefs";

/** These types mesh with a partner only on a *perpendicular* axis (see meshing.ts), so
 *  they need a different default axis than the rest of the parallel-shaft family.
 *  "rack" belongs here too: its meshing rule requires the rack's travel axis to be
 *  perpendicular to the pinion's rotation axis, so a rack defaulting to [0, 1, 0] -- the
 *  same default a freshly placed spur/helical pinion gets -- could never mesh with
 *  anything placed from the palette. `DurabilityPanel` does now offer an X/Y/Z axis
 *  editor, so this default is no longer the only way to fix a bad pairing -- but it's
 *  still worth getting right: it's what makes a freshly placed rack mesh out of the box,
 *  without requiring the user to already know an axis editor exists and go find it.
 *
 *  "differential" is deliberately NOT in this set even though it also meshes on a
 *  perpendicular axis (against its bevel input -- see meshing.ts's `bevelInvolved`
 *  branch): a differential's *own* axis is the one its two output shafts couple to, and
 *  those output shafts are ordinary parallel-family gears that default to [0, 1, 0]
 *  (see `defaultLayout.ts`'s "seed-differential", which hand-picks [0, 1, 0] for exactly
 *  this reason). So [0, 1, 0] is the correct default for a differential; the bevel input
 *  is the one that needs to sit on the perpendicular [1, 0, 0] axis instead. */
export const PERPENDICULAR_AXIS_TYPES = new Set<GearType>(["bevel", "worm", "rack"]);

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
