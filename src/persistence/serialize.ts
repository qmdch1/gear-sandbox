import type { GearInstance, GearType, LayoutState, RemoteLink, Vehicle } from "../sim/types";
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
    (g.linearPosition === undefined || isFiniteNumber(g.linearPosition)) &&
    // A motor's two numbers go straight into a division and an integration, so a non-finite one
    // does not fail loudly -- it turns the shaft's speed into NaN, and the NaN then propagates
    // through every ratio to every gear in the component. A layout that arrives with a bad motor
    // must be rejected here, where the error can still name the file, rather than becoming a
    // scene where nothing moves and nothing says why.
    isValidMotor(g.motor) &&
    (g.ridesOn === undefined || (typeof g.ridesOn === "string" && g.ridesOn.length > 0))
  );
}

function isValidMotor(value: unknown): boolean {
  if (value === undefined) return true; // a crank without one is an ideal velocity source
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return isFiniteNumber(m.freeSpeed) && isFiniteNumber(m.stallTorque);
}

/** A `Vehicle` is simulation state, not decoration: it carries the mass the engine has to
 *  accelerate and the distance already travelled. Dropping it on save was not a cosmetic loss --
 *  a reloaded car kept its engine and its wheels and simply stopped being able to go anywhere,
 *  with no error and nothing in the scene to suggest what had gone missing. */
function isValidVehicle(value: unknown): value is Vehicle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.wheel === "string" &&
    v.wheel.length > 0 &&
    isFiniteNumber(v.radius) &&
    isFiniteNumber(v.mass) &&
    isVec3(v.direction) &&
    isFiniteNumber(v.distance) &&
    (v.rollingResistance === undefined || isFiniteNumber(v.rollingResistance)) &&
    (v.limit === undefined ||
      (Array.isArray(v.limit) && v.limit.length === 2 && v.limit.every(isFiniteNumber)))
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
  return JSON.stringify(
    {
      version: SCHEMA_VERSION,
      gears: layout.gears,
      remoteLinks: layout.remoteLinks,
      // Omitted entirely when there are none, so a save of an ordinary bolted-down machine is
      // byte-identical to what it was before vehicles existed.
      ...(layout.vehicles?.length ? { vehicles: layout.vehicles } : {}),
    },
    null,
    2,
  );
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
  // Saves written before vehicles existed have no `vehicles` field at all -- default to none
  // rather than reject them, exactly as `remoteLinks` does for v1 saves.
  const vehicles = candidate.vehicles === undefined ? [] : candidate.vehicles;
  if (!Array.isArray(vehicles) || !vehicles.every(isValidVehicle)) {
    throw new Error("레이아웃 파일이 올바르지 않습니다: vehicles 형식이 잘못되었습니다.");
  }
  // A vehicle whose wheel is not in the layout would silently never move (its wheel speed reads
  // as 0) -- worse than an error, because the machine looks complete. Reject it here.
  const ids = new Set((gears as GearInstance[]).map((g) => g.id));
  for (const v of vehicles as Vehicle[]) {
    if (!ids.has(v.wheel)) {
      throw new Error(`레이아웃 파일이 올바르지 않습니다: 차량 "${v.id}"의 바퀴 "${v.wheel}"가 없습니다.`);
    }
  }
  // `vehicles` is omitted from the result when there are none, mirroring `serializeLayout`
  // omitting the field. That keeps the round trip an exact identity in BOTH directions: a
  // layout of an ordinary bolted-down machine comes back as the object it went in as, rather
  // than growing an empty array that every existing caller and test would then have to know
  // about. An explicit empty array on the way in normalises to absent, which is the same thing.
  const layout: LayoutState = {
    gears: gears as GearInstance[],
    remoteLinks: dedupeRemoteLinks(remoteLinks as RemoteLink[]),
  };
  if ((vehicles as Vehicle[]).length > 0) layout.vehicles = vehicles as Vehicle[];
  return layout;
}

export function deserializeLayout(json: string): LayoutState {
  return validateLayout(JSON.parse(json));
}
