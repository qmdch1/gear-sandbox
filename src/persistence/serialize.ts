import type { GearInstance, GearType, LayoutState, RemoteLink } from "../sim/types";
import { wouldDuplicateLink } from "../sim/remoteLinks";

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

/** Drops duplicate links -- the same unordered pair and kind, in either `a`/`b` order --
 *  keeping the first occurrence. `main.ts`'s live "connect mode" UI already guards
 *  against creating a duplicate, but a save file can still arrive with one (hand-edited,
 *  or written by some future/other tool), and a duplicate isn't just inert: `sceneSync`
 *  would build and dispose the same ribbon mesh twice per frame for no reason. */
function dedupeRemoteLinks(links: RemoteLink[]): RemoteLink[] {
  const result: RemoteLink[] = [];
  for (const link of links) {
    if (wouldDuplicateLink(link, result)) continue;
    result.push(link);
  }
  return result;
}

export function serializeLayout(layout: LayoutState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, gears: layout.gears, remoteLinks: layout.remoteLinks }, null, 2);
}

/** Validates and normalizes an already-parsed candidate layout (untrusted `unknown` shape --
 *  parsed JSON, a server response body, anything). Checks `gears` is an array of valid
 *  `GearInstance`s, defaults a missing `remoteLinks` to `[]` (v1-save compatibility), validates
 *  `remoteLinks` is an array of valid `RemoteLink`s, and dedupes them. Throws the same
 *  "Invalid gear-sandbox save file" error on any shape failure. This is the shared validation
 *  gate every load path (local storage, file import, server fetch) must pass through before its
 *  result is trusted as live layout state. */
export function validateLayout(parsed: unknown): LayoutState {
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as Record<string, unknown>).gears)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  const candidate = parsed as Record<string, unknown>;
  const gears = candidate.gears as unknown[];
  if (!gears.every(isValidGear)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  // v1 saves have no `remoteLinks` field at all -- default to empty rather than reject them.
  const remoteLinks = candidate.remoteLinks === undefined ? [] : candidate.remoteLinks;
  if (!Array.isArray(remoteLinks) || !remoteLinks.every(isValidRemoteLink)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  return { gears: gears as GearInstance[], remoteLinks: dedupeRemoteLinks(remoteLinks as RemoteLink[]) };
}

export function deserializeLayout(json: string): LayoutState {
  return validateLayout(JSON.parse(json));
}
