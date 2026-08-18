import type { GearInstance } from "../sim/types";

const SCHEMA_VERSION = 1;

export function serializeGears(gears: GearInstance[]): string {
  return JSON.stringify({ version: SCHEMA_VERSION, gears }, null, 2);
}

export function deserializeGears(json: string): GearInstance[] {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.gears)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  return parsed.gears as GearInstance[];
}
