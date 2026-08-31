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
  rack:       { durabilityMax: 100, baseWearPerSecond: 0.8, loadWearMultiplier: 1.5 },
  planetary:  { durabilityMax: 250, baseWearPerSecond: 0.6, loadWearMultiplier: 1.4 },
  ratchet:    { durabilityMax: 90,  baseWearPerSecond: 1.3, loadWearMultiplier: 1.6 },
  sprocket:   { durabilityMax: 110, baseWearPerSecond: 0.9, loadWearMultiplier: 1.4 },
  pulley:     { durabilityMax: 130, baseWearPerSecond: 0.5, loadWearMultiplier: 1.3 },
  differential: { durabilityMax: 180, baseWearPerSecond: 0.7, loadWearMultiplier: 1.5 },
};
