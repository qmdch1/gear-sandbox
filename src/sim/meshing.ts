import type { GearInstance, MeshEdge } from "./types";
import { POWER_SOURCE_TYPES } from "./gearDefs";

const MESH_TOLERANCE = 0.05;          // 5% tolerance on center-distance match
const PARALLEL_DOT_THRESHOLD = 0.98;  // |axis dot| above this => parallel axes
const PERP_DOT_THRESHOLD = 0.1;       // |axis dot| below this => perpendicular axes
const COUPLING_DISTANCE_TOLERANCE = 0.05;

// Parallel-shaft gears only mesh within their OWN helix-angle family, not across it --
// exactly like real gears: a plain (0°-helix) spur gear cannot properly mesh with an
// angled-tooth helical gear even on parallel shafts (their tooth lines don't line up
// across the face width), only with another 0°-helix gear. "crank" is mechanically a
// plain spur gear (no twist in its geometry) that also happens to auto-spin, so it
// belongs in the spur bucket, not a separate one.
const SPUR_FAMILY = new Set<GearInstance["type"]>(["spur", "crank"]);
const HELICAL_FAMILY = new Set<GearInstance["type"]>(["helical"]);

function sameParallelFamily(a: GearInstance["type"], b: GearInstance["type"]): boolean {
  return (SPUR_FAMILY.has(a) && SPUR_FAMILY.has(b)) || (HELICAL_FAMILY.has(a) && HELICAL_FAMILY.has(b));
}

// Same real-gear reasoning as `sameParallelFamily`, applied to the perpendicular
// case: a bevel gear's teeth are cut straight (0° helix, like a plain spur gear),
// so it can properly mesh with another straight-cut gear (another bevel, or a
// plain spur/crank) at a right angle -- but not with a helical (angled-tooth) gear,
// whose tooth lines wouldn't line up across the face width there either.
function bevelMeshCompatible(a: GearInstance["type"], b: GearInstance["type"]): boolean {
  if (a !== "bevel" && b !== "bevel") return false;
  const other = a === "bevel" ? b : a;
  return other === "bevel" || SPUR_FAMILY.has(other);
}

// Accessories that never mesh via teeth — they only ever attach by sitting coincident
// on another gear's shaft, exactly like the original "load" flywheel (an RPM gauge, a
// fan, or a wheel is functionally the same attach rule, just a different
// indicator/output device).
const COUPLING_ONLY_TYPES = new Set<GearInstance["type"]>(["load", "gauge", "fan", "wheel"]);

// A helical gear only meshes (via teeth) with another helical gear -- a plain (0°-
// helix) power source like a crank can't properly mesh into it either, same as any
// other spur-family gear. But that would leave a helical gear with no way to ever
// receive power at all, since nothing else *starts* spinning. Real machines solve
// this the same way this sim's worm already does: the power source's shaft couples
// DIRECTLY onto the helical gear's own shaft (coincident position, same axis) --
// a rigid coupling, not a tooth mesh, so the tooth-angle mismatch never applies.
function helicalPowerCoupling(a: GearInstance["type"], b: GearInstance["type"]): boolean {
  return (a === "helical" && POWER_SOURCE_TYPES.has(b)) || (b === "helical" && POWER_SOURCE_TYPES.has(a));
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function pitchRadius(g: GearInstance): number {
  return (g.module * g.teeth) / 2;
}

/** Returns the mesh/coupling edge between two gears, or null if they don't connect. */
export function evaluatePair(a: GearInstance, b: GearInstance): MeshEdge | null {
  if (COUPLING_ONLY_TYPES.has(a.type) || COUPLING_ONLY_TYPES.has(b.type)) {
    if (COUPLING_ONLY_TYPES.has(a.type) && COUPLING_ONLY_TYPES.has(b.type)) return null; // two accessories never couple to each other
    if (dist(a.position, b.position) > COUPLING_DISTANCE_TOLERANCE) return null;
    if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
    return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
  }

  // A worm's driving shaft attaches directly (coincident position, same axis) to
  // whatever powers it -- in this simplified model a worm has no separate "input
  // tooth mesh," so without this it could never receive rotation at all (its only
  // other rule, below, is a ONE-WAY mesh *out* toward its wheel). This coupling
  // check is geometrically distinguishable from that mesh check (coincident vs.
  // pitch-radius-apart), so there's no ambiguity between the two for the same pair.
  if (a.type === "worm" || b.type === "worm") {
    const bothWorm = a.type === "worm" && b.type === "worm";
    const coincident = dist(a.position, b.position) <= COUPLING_DISTANCE_TOLERANCE;
    if (!bothWorm && coincident && Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD) {
      return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
    }
    // Not a coincident shaft coupling -- fall through to the perpendicular
    // one-way mesh check below, which covers the worm-to-wheel case.
  }

  // A power source (crank) coupling directly onto a helical gear's own shaft --
  // see `helicalPowerCoupling` above for why this exists (otherwise a helical gear
  // could never receive power at all, since it only meshes with other helical gears
  // and there's no helical-toothed power source).
  if (helicalPowerCoupling(a.type, b.type)) {
    const coincident = dist(a.position, b.position) <= COUPLING_DISTANCE_TOLERANCE;
    if (coincident && Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD) {
      return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
    }
    // Not coincident -- fall through; a helical gear can still mesh via teeth with
    // another helical gear below (sameParallelFamily), just not this power source.
  }

  const centerDistance = dist(a.position, b.position);
  const axisDot = dot(a.axis, b.axis);
  const expected = pitchRadius(a) + pitchRadius(b);
  const withinDistance = Math.abs(centerDistance - expected) <= expected * MESH_TOLERANCE;

  const bothParallelFamily = sameParallelFamily(a.type, b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay: "none" };
  }

  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = bevelMeshCompatible(a.type, b.type);
  if (wormPair || bevelInvolved) {
    if (Math.abs(axisDot) > PERP_DOT_THRESHOLD || !withinDistance) return null;
    const oneWay: MeshEdge["oneWay"] = wormPair ? (a.type === "worm" ? "aToB" : "bToA") : "none";
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay };
  }

  return null;
}

/** For drag-to-snap placement: the center distance two gears WOULD need to be at to
 *  validly connect, based on type/axis compatibility alone — ignoring their current
 *  distance. Returns `null` if the pair could never connect regardless of distance
 *  (incompatible types or misaligned axes), and `0` for a coincident shaft coupling
 *  (load-on-shaft or worm-on-shaft). Deliberately mirrors `evaluatePair`'s type/axis
 *  rules as a separate function rather than refactoring `evaluatePair` to share it —
 *  `evaluatePair` is exhaustively tested already, and this keeps that logic unrisked. */
export function idealConnectionDistance(a: GearInstance, b: GearInstance): number | null {
  if (COUPLING_ONLY_TYPES.has(a.type) || COUPLING_ONLY_TYPES.has(b.type)) {
    if (COUPLING_ONLY_TYPES.has(a.type) && COUPLING_ONLY_TYPES.has(b.type)) return null;
    if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
    return 0;
  }

  if (a.type === "worm" || b.type === "worm") {
    const bothWorm = a.type === "worm" && b.type === "worm";
    if (!bothWorm && Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD) {
      return 0; // coincident shaft coupling
    }
    // Not eligible for shaft coupling -- fall through to the mesh check below,
    // which covers the worm-to-wheel case.
  }

  if (helicalPowerCoupling(a.type, b.type) && Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD) {
    return 0; // coincident shaft coupling -- see evaluatePair's matching check
  }

  const axisDot = dot(a.axis, b.axis);
  const bothParallelFamily = sameParallelFamily(a.type, b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD) return null;
    return pitchRadius(a) + pitchRadius(b);
  }

  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = bevelMeshCompatible(a.type, b.type);
  if (wormPair || bevelInvolved) {
    if (Math.abs(axisDot) > PERP_DOT_THRESHOLD) return null;
    return pitchRadius(a) + pitchRadius(b);
  }

  return null;
}

const TWO_PI = Math.PI * 2;
const PROFILE_TYPES = new Set<GearInstance["type"]>(["spur", "helical", "crank"]);

function isWorldYAxis(g: GearInstance): boolean {
  return Math.abs(g.axis[1]) > 0.98 && Math.abs(g.axis[0]) < 0.2 && Math.abs(g.axis[2]) < 0.2;
}

function isWorldXAxis(g: GearInstance): boolean {
  return Math.abs(g.axis[0]) > 0.98 && Math.abs(g.axis[1]) < 0.2 && Math.abs(g.axis[2]) < 0.2;
}

// A bevel gear's tooth studs (gearGeometry.ts's `bevelGeometry`) sit at the same
// "tooth i's center is at angle i*pitch" convention as the involute profile types --
// only the axis differs (world +X, not +Y), so a bevel pair needs its own (much
// simpler) version of the phase math below rather than reusing PROFILE_TYPES'.
const HEIGHT_MATCH_TOLERANCE = 0.05;

function isBevelOnWorldXAxis(g: GearInstance): boolean {
  return g.type === "bevel" && isWorldXAxis(g);
}

export interface PhaseAlignment {
  /** Corrected angle (dragged -> partner, atan2(dz,dx) convention) that centers the
   *  mesh exactly on the partner's nearest tooth-pitch "detent," instead of whatever
   *  raw angle the drag happened to land on. */
  worldAngleTowardPartner: number;
  /** The rotation dragged should be set to, given it ends up at that corrected angle. */
  rotation: number;
}

/** For a phase-alignable pair (both spur/helical/crank -- the only types with an
 *  actual tooth profile to align, and only on the default world +Y axis both are
 *  placed on; bevel/worm/load/gauge/fan render as smooth cones/cylinders/rings with
 *  no teeth to clash), computes BOTH the angular correction and the dragged gear's
 *  resulting rotation so the mesh centers exactly tooth-middle-in-gap-middle, not
 *  just "doesn't clash." Hand-positioning a gear at the right center distance already
 *  needs `findSnapTarget`'s help; getting the rotational phase centered by hand on
 *  top of that is impractical. Returns `null` when phase-alignment doesn't apply, per
 *  the type/axis rule above.
 *
 *  Phase convention: `computeSpurProfilePoints` (gearGeometry.ts) places each tooth's
 *  own center at local angle `tooth * pitch` -- i.e. tooth index 0's center sits at
 *  local angle 0 -- with the gap between two teeth centered exactly half a pitch away
 *  from either tooth-center, at local angle 0.5*pitch. So a gear's own tooth-center
 *  target is local-angle-phase 0, and the gap-center a partner must show at the
 *  contact point is phase 0.5. (Given `gearMesh.ts`'s `quaternion.setFromUnitVectors`
 *  + `rotateZ(gear.rotation)` composition, a point at local angle L ends up at world
 *  angle `-(L + gear.rotation)` for a gear on the default +Y axis -- hence the minus
 *  signs throughout this derivation.) */
export function meshPhaseAlignment(
  dragged: GearInstance,
  rawWorldAngleTowardPartner: number,
  partner: GearInstance,
): PhaseAlignment | null {
  if (PROFILE_TYPES.has(dragged.type) && PROFILE_TYPES.has(partner.type) && isWorldYAxis(dragged) && isWorldYAxis(partner)) {
    // Snap the angle (as seen from the partner) to the nearest one where the partner
    // shows an exact gap-center (phase 0.5) at the contact point. Valid solutions
    // repeat every `partnerPitch`, so solving for the nearest one is a "round to the
    // nearest grid line" over that fixed step -- picking a random point in the gap (a
    // valid, non-clashing but off-center mesh) is exactly the bug this fixes.
    const partnerPitch = TWO_PI / partner.teeth;
    const continuousN = (-Math.PI - partner.rotation - rawWorldAngleTowardPartner) / partnerPitch - 0.5;
    const n = Math.round(continuousN);
    const worldAngleTowardPartner = -Math.PI - partner.rotation - (0.5 + n) * partnerPitch;

    // With the partner locked to phase 0.5 (gap-center) at this angle by construction,
    // dragged's own tooth-center (phase 0) should face back toward the partner --
    // giving a properly centered mesh rather than just an arbitrary non-clashing one.
    const rotation = -worldAngleTowardPartner;
    return { worldAngleTowardPartner, rotation };
  }

  // A bevel gear meshes on a perpendicular (world +X) axis against a plain
  // (0°-helix) partner on the usual +Y axis -- spur or crank, not helical (see
  // `bevelMeshCompatible` above; same "straight teeth don't line up against
  // angled ones" reasoning as the parallel-axis case). Both gears sitting at the
  // same height (the only
  // case handled here -- see HEIGHT_MATCH_TOLERANCE) makes the geometry degenerate
  // in a useful way: the contact direction, seen in the bevel's OWN rotation plane
  // (world Y-Z, perpendicular to its +X axis), only ever works out to exactly +/-90°
  // (whichever side of the bevel the partner sits on) -- never anything in between.
  // Derivation: gearMesh.ts's quaternion+rotateZ composition puts a bevel tooth at
  // index i (local angle phi = i*pitch, same "tooth center at phi=0" convention as
  // the involute profile types) at world angle `phi + gear.rotation - PI` in that Y-Z
  // plane (verified numerically against the actual transform, mirroring the +Y-axis
  // derivation above but for this different axis).
  const draggedIsBevel = isBevelOnWorldXAxis(dragged);
  const partnerIsBevel = isBevelOnWorldXAxis(partner);
  const sameHeight = Math.abs(dragged.position[1] - partner.position[1]) <= HEIGHT_MATCH_TOLERANCE;

  if (draggedIsBevel && SPUR_FAMILY.has(partner.type) && isWorldYAxis(partner) && sameHeight) {
    // Partner side: identical rounding to the parallel-pair case above (partner is
    // still a +Y-axis profile type with real involute teeth, so it still needs a
    // proper detent in its own rotation plane).
    const partnerPitch = TWO_PI / partner.teeth;
    const continuousN = (-Math.PI - partner.rotation - rawWorldAngleTowardPartner) / partnerPitch - 0.5;
    const n = Math.round(continuousN);
    const worldAngleTowardPartner = -Math.PI - partner.rotation - (0.5 + n) * partnerPitch;

    // Bevel (dragged) side: the contact direction from dragged to partner, projected
    // into dragged's own Y-Z rotation plane, has z ~ sin(worldAngleTowardPartner) and
    // y = 0 (same height) -- i.e. exactly the +/-90° described above. Point dragged's
    // own tooth-center (phi=0) at that angle.
    const contactAngleYZ = Math.atan2(Math.sin(worldAngleTowardPartner), 0);
    const rotation = contactAngleYZ + Math.PI;
    return { worldAngleTowardPartner, rotation };
  }

  if (partnerIsBevel && SPUR_FAMILY.has(dragged.type) && isWorldYAxis(dragged) && sameHeight) {
    // The bevel partner's rotation is already fixed, and (per the derivation above)
    // its own contact angle is insensitive to exactly which raw angle the drag landed
    // on -- only which side of it. There's no useful detent to round the placement
    // angle to here, so it's used as-is; only dragged's own tooth-center is aligned
    // to face the bevel, which is still a real improvement over leaving dragged's
    // rotation completely untouched (this pairing returned null entirely before).
    const worldAngleTowardPartner = rawWorldAngleTowardPartner;
    const rotation = -worldAngleTowardPartner;
    return { worldAngleTowardPartner, rotation };
  }

  return null;
}

/** True when two gears geometrically overlap (closer than a valid mesh distance allows,
 *  and NOT already a legitimate connection -- a coupling-only accessory (load/gauge/fan)
 *  or worm shaft coupling is intentionally coincident with its host gear, so a valid
 *  `evaluatePair` result is never an overlap). */
export function isOverlapping(a: GearInstance, b: GearInstance): boolean {
  if (evaluatePair(a, b)) return false;
  const centerDistance = dist(a.position, b.position);
  const expected = pitchRadius(a) + pitchRadius(b);
  return centerDistance < expected * (1 - MESH_TOLERANCE);
}
