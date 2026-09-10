import type { GearInstance } from "./types";

/** True when `gear` has taken any wear at all -- including being worn right through to broken.
 *  Used to decide whether a repair would actually change anything, so the UI can offer the
 *  action only where it means something. */
export function needsRepair(gear: GearInstance): boolean {
  return gear.broken || gear.durabilityCurrent < gear.durabilityMax;
}

/** Restores one gear to factory condition: full durability, not broken.
 *
 *  Pure -- returns a new object rather than mutating, matching how `tick()` produces gears, so
 *  a caller can swap the result into its array without worrying about shared references.
 *
 *  WHY THIS EXISTS. `wear.ts` only ever subtracts: a spinning gear loses `baseWearPerSecond`
 *  every second (x `loadWearMultiplier` when it drives a load), and at zero it sets
 *  `broken: true`, which `rotation.ts` then treats as a dead end that absorbs drive instead of
 *  relaying it. Nothing in the codebase ever added durability back, so wear was strictly
 *  one-way: any layout left running eventually destroyed itself, permanently, and the only way
 *  back was to reload the layout and lose whatever you had built. Measured on the bundled
 *  showroom: the first gear fails at about 67 seconds -- a bevel driving a load, so
 *  120 / (1.2 * 1.5) -- and by 150 seconds 27 of its 72 gears are broken and 32 have stopped
 *  turning.
 *
 *  Repair is the missing half of that mechanic, not a defeat of it -- wear still teaches which
 *  gears run hot (a `spur` at 1.0/s wears twice as fast as a `helical` at 0.8 with the same
 *  load, and anything driving a `load` wears half again faster), and repair is what lets you
 *  act on having learned it. */
export function repairGear(gear: GearInstance): GearInstance {
  if (!needsRepair(gear)) return gear;
  return { ...gear, durabilityCurrent: gear.durabilityMax, broken: false };
}

/** Restores every gear in a layout. Returns a new array; gears that were already at full
 *  durability are passed through by reference, so a no-op repair allocates nothing new. */
export function repairAll(gears: GearInstance[]): GearInstance[] {
  return gears.map(repairGear);
}

/** How many of `gears` a repair would actually change -- what the UI reports after the fact
 *  ("N개 수리됨"), so the count comes from the same predicate the repair itself uses rather
 *  than being recounted slightly differently at the call site. */
export function countNeedingRepair(gears: GearInstance[]): number {
  return gears.reduce((n, g) => n + (needsRepair(g) ? 1 : 0), 0);
}
