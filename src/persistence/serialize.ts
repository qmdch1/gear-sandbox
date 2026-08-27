import type { GearInstance, GearType, LayoutState, RemoteLink } from "../sim/types";

const SCHEMA_VERSION = 2;

const GEAR_TYPES = new Set<GearType>([
  "spur", "helical", "crank", "bevel", "worm", "load",
  "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isValidGear(value: unknown): value is GearInstance {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    g.id.length > 0 &&
    typeof g.type === "string" &&
    GEAR_TYPES.has(g.type as GearType) &&
    isVec3(g.position) &&
    isVec3(g.axis) &&
    isFiniteNumber(g.teeth) &&
    isFiniteNumber(g.module) &&
    isFiniteNumber(g.durabilityMax) &&
    isFiniteNumber(g.durabilityCurrent) &&
    typeof g.broken === "boolean" &&
    isFiniteNumber(g.rotation) &&
    isFiniteNumber(g.angularVelocity) &&
    (g.linearPosition === undefined || isFiniteNumber(g.linearPosition))
  );
}

function isValidRemoteLink(value: unknown): value is RemoteLink {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  return typeof l.a === "string" && typeof l.b === "string" && (l.kind === "chain" || l.kind === "belt");
}

export function serializeLayout(layout: LayoutState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, gears: layout.gears, remoteLinks: layout.remoteLinks }, null, 2);
}

export function deserializeLayout(json: string): LayoutState {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.gears)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  if (!parsed.gears.every(isValidGear)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  // v1 saves have no `remoteLinks` field at all -- default to empty rather than reject them.
  const remoteLinks = parsed.remoteLinks === undefined ? [] : parsed.remoteLinks;
  if (!Array.isArray(remoteLinks) || !remoteLinks.every(isValidRemoteLink)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  return { gears: parsed.gears as GearInstance[], remoteLinks: remoteLinks as RemoteLink[] };
}
