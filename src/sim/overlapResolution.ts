import type { GearInstance, GearType } from "./types";
import { isOverlapping, overlapRadius } from "./meshing";
import { createGear } from "./gearFactory";

/** How far beyond the bare pitch-radius-sum a nudge lands the new gear's center from the gear it's
 *  clearing -- comfortably past `isOverlapping`'s own boundary (which sits at 95% of that sum, see
 *  MESH_TOLERANCE in meshing.ts) regardless of how that tolerance is tuned later, plus headroom for
 *  floating-point rounding, so the nudge never lands back inside the overlap it was meant to escape. */
const NUDGE_CLEARANCE_FACTOR = 1.02;

/** Bounds the nudge-and-recheck loop below. A real layout clearing in a handful of iterations is the
 *  overwhelmingly common case; this just guarantees termination against a pathologically crowded one. */
const MAX_NUDGE_ITERATIONS = 20;

/** The existing gear (if any) that a candidate placement geometrically overlaps, nearest one first.
 *  Reuses `isOverlapping` as-is, so a legitimate coincident coupling -- e.g. a `load` placed exactly
 *  on the crank/gear it's meant to shaft-couple to -- is correctly never reported here: `isOverlapping`
 *  already treats any pair `evaluatePair` recognizes as a valid mesh/coupling as NOT an overlap. */
export function findOverlappingGear(candidate: GearInstance, gears: GearInstance[]): GearInstance | null {
  let nearest: GearInstance | null = null;
  let nearestDistance = Infinity;
  for (const gear of gears) {
    if (!isOverlapping(candidate, gear)) continue;
    const dx = candidate.position[0] - gear.position[0];
    const dz = candidate.position[2] - gear.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = gear;
    }
  }
  return nearest;
}

/** Shared nudge-and-recheck loop behind both `resolveOverlapFreePosition` (a not-yet-created gear,
 *  built fresh from its `type` on each attempt) and `resolveOverlapFreePositionForGear` (an already-
 *  existing gear being repositioned, whose actual teeth/module/axis -- not just its `type` -- may
 *  differ from a freshly-`createGear`'d default and so must be preserved across nudge attempts).
 *  `buildCandidate` is the only thing that differs between those two cases; everything else --
 *  the nudge direction, clearance distance, re-check-against-the-full-list, and iteration bound --
 *  is identical. See `resolveOverlapFreePosition`'s doc comment for the full behavioral rationale. */
function resolveOverlapFreePositionWith(
  buildCandidate: (position: [number, number, number]) => GearInstance,
  position: [number, number, number],
  gears: GearInstance[],
): [number, number, number] {
  let current = position;
  for (let i = 0; i < MAX_NUDGE_ITERATIONS; i++) {
    const candidate = buildCandidate(current);
    const blocker = findOverlappingGear(candidate, gears);
    if (!blocker) return current;

    const dx = current[0] - blocker.position[0];
    const dz = current[2] - blocker.position[2];
    const len = Math.hypot(dx, dz);
    // Deterministic fallback direction for the (rare) case where the candidate's ground-plane
    // point coincides exactly with the blocker's -- e.g. two gears clicked at the same spot but
    // sitting at different heights -- so there's no "away from it" direction to normalize.
    const [ux, uz] = len < 1e-6 ? [1, 0] : [dx / len, dz / len];

    const clearDistance = (overlapRadius(candidate) + overlapRadius(blocker)) * NUDGE_CLEARANCE_FACTOR;
    current = [blocker.position[0] + ux * clearDistance, current[1], blocker.position[2] + uz * clearDistance];
  }
  return current;
}

/** If placing `type` at `position` would land directly on/inside an existing gear, nudges the
 *  position outward -- along the ground-plane (X/Z) vector from that gear's center to the candidate
 *  -- just far enough to clear it, then rechecks against the FULL gear list again (not just the gear
 *  just avoided), since clearing one overlap can land squarely inside a third gear. Deterministic:
 *  no randomness anywhere, so the same layout always resolves the same way. Bails out to the
 *  last-attempted position after `MAX_NUDGE_ITERATIONS` rather than looping forever on a
 *  pathologically crowded layout (whatever overlap remains is still caught by the existing
 *  `overlapPairs` diagnostic). A position with no overlap to begin with -- including every
 *  legitimate coincident placement, see `findOverlappingGear` -- returns unchanged on the first
 *  check, so this is a no-op for the normal case. */
export function resolveOverlapFreePosition(
  type: GearType,
  position: [number, number, number],
  gears: GearInstance[],
): [number, number, number] {
  return resolveOverlapFreePositionWith((p) => createGear(type, p), position, gears);
}

/** Same nudge-and-recheck behavior as `resolveOverlapFreePosition`, but for repositioning an
 *  ALREADY-EXISTING gear (e.g. one being dragged) rather than placing a brand-new one. The
 *  candidate at each attempt is built by carrying `gear`'s own teeth/module/axis/id forward at the
 *  new position -- NOT by reconstructing a type-default gear via `createGear` -- since an existing
 *  gear's actual shape can differ from its type's default (e.g. a custom teeth count from a loaded
 *  layout), and using the wrong shape would compute the wrong pitch radius and clearance distance.
 *  Carrying the real `id` forward also means `gears` may safely include `gear` itself unfiltered --
 *  `findOverlappingGear`/`isOverlapping` would otherwise report a moving gear as overlapping its own
 *  last-known position -- but callers should still exclude it (see `findNearestCompatiblePartner`'s
 *  identical id-exclusion pattern) since one candidate at the same position as `gear` is a coincident
 *  no-op distance-0 case this function does not special-case. */
export function resolveOverlapFreePositionForGear(
  gear: GearInstance,
  position: [number, number, number],
  gears: GearInstance[],
): [number, number, number] {
  return resolveOverlapFreePositionWith((p) => ({ ...gear, position: p }), position, gears);
}
