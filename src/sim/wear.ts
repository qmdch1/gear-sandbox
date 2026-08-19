import type { GearInstance } from "./types";
import { GEAR_DEFS } from "./gearDefs";

export interface WearInput {
  gear: GearInstance;
  angularVelocity: number;
  hasDownstreamLoad: boolean;
  dt: number;
  timeScale: number;
}

export interface WearOutput {
  durabilityCurrent: number;
  broken: boolean;
}

const MIN_SPIN_TO_WEAR = 0.01; // rad/s below which a gear counts as "not spinning"

export function applyWear(input: WearInput): WearOutput {
  const { gear, angularVelocity, hasDownstreamLoad, dt, timeScale } = input;
  if (gear.broken) return { durabilityCurrent: gear.durabilityCurrent, broken: true };

  const isSpinning = Math.abs(angularVelocity) > MIN_SPIN_TO_WEAR;
  if (!isSpinning) return { durabilityCurrent: gear.durabilityCurrent, broken: false };

  const def = GEAR_DEFS[gear.type];
  const loadMultiplier = hasDownstreamLoad ? def.loadWearMultiplier : 1;
  const wear = def.baseWearPerSecond * loadMultiplier * timeScale * dt;
  const next = Math.max(0, gear.durabilityCurrent - wear);
  return { durabilityCurrent: next, broken: next <= 0 };
}
