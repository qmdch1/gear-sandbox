import type { GearType } from "./types";

export interface GearTypeDef {
  durabilityMax: number;
  baseWearPerSecond: number;  // wear/sec while spinning at timeScale=1, no downstream load
  loadWearMultiplier: number; // multiplier applied when this gear's component contains a "load" object
}

export const GEAR_DEFS: Record<GearType, GearTypeDef> = {
  spur:    { durabilityMax: 100, baseWearPerSecond: 1.0, loadWearMultiplier: 1.5 },
  helical: { durabilityMax: 150, baseWearPerSecond: 0.8, loadWearMultiplier: 1.5 },
  crank:   { durabilityMax: 200, baseWearPerSecond: 0.5, loadWearMultiplier: 1.2 },
  bevel:   { durabilityMax: 120, baseWearPerSecond: 1.2, loadWearMultiplier: 1.5 },
  worm:    { durabilityMax: 80,  baseWearPerSecond: 1.5, loadWearMultiplier: 1.8 },
  load:    { durabilityMax: 1_000_000, baseWearPerSecond: 0, loadWearMultiplier: 0 },
  // Indicator/output accessories, not drivetrain parts -- like `load`, they couple onto
  // a gear's shaft rather than mesh via teeth, and don't wear themselves.
  gauge:   { durabilityMax: 1_000_000, baseWearPerSecond: 0, loadWearMultiplier: 0 },
  fan:     { durabilityMax: 1_000_000, baseWearPerSecond: 0, loadWearMultiplier: 0 },
  // Alternate power sources -- mechanically identical to "crank" (mesh like a spur gear,
  // auto-spin the moment they're placed), just a different real-world picture of "where
  // the energy comes from" for teaching purposes.
  battery: { durabilityMax: 200, baseWearPerSecond: 0.5, loadWearMultiplier: 1.2 },
  outlet:  { durabilityMax: 200, baseWearPerSecond: 0.5, loadWearMultiplier: 1.2 },
};

/** Gears that drive the rest of the train the moment they're placed (their
 *  `angularVelocity` is preset, not computed by `propagateRotation`) -- "crank" plus its
 *  battery/outlet reskins, all three otherwise identical parallel-family gears. */
export const POWER_SOURCE_TYPES = new Set<GearType>(["crank", "battery", "outlet"]);
