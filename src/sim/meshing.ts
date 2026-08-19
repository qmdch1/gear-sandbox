import type { GearInstance, MeshEdge } from "./types";

const MESH_TOLERANCE = 0.05;          // 5% tolerance on center-distance match
const PARALLEL_DOT_THRESHOLD = 0.98;  // |axis dot| above this => parallel axes
const PERP_DOT_THRESHOLD = 0.1;       // |axis dot| below this => perpendicular axes
const COUPLING_DISTANCE_TOLERANCE = 0.05;

const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank", "battery", "outlet"]);
// Accessories that never mesh via teeth — they only ever attach by sitting coincident
// on another gear's shaft, exactly like the original "load" flywheel (an RPM gauge or a
// fan is functionally the same attach rule, just a different indicator/output device).
const COUPLING_ONLY_TYPES = new Set<GearInstance["type"]>(["load", "gauge", "fan"]);

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

  const centerDistance = dist(a.position, b.position);
  const axisDot = dot(a.axis, b.axis);
  const expected = pitchRadius(a) + pitchRadius(b);
  const withinDistance = Math.abs(centerDistance - expected) <= expected * MESH_TOLERANCE;

  const bothParallelFamily = PARALLEL_FAMILY.has(a.type) && PARALLEL_FAMILY.has(b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay: "none" };
  }

  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = a.type === "bevel" || b.type === "bevel";
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

  const axisDot = dot(a.axis, b.axis);
  const bothParallelFamily = PARALLEL_FAMILY.has(a.type) && PARALLEL_FAMILY.has(b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD) return null;
    return pitchRadius(a) + pitchRadius(b);
  }

  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = a.type === "bevel" || b.type === "bevel";
  if (wormPair || bevelInvolved) {
    if (Math.abs(axisDot) > PERP_DOT_THRESHOLD) return null;
    return pitchRadius(a) + pitchRadius(b);
  }

  return null;
}

const TWO_PI = Math.PI * 2;
const PROFILE_TYPES = new Set<GearInstance["type"]>(["spur", "helical", "crank", "battery", "outlet"]);

function isWorldYAxis(g: GearInstance): boolean {
  return Math.abs(g.axis[1]) > 0.98 && Math.abs(g.axis[0]) < 0.2 && Math.abs(g.axis[2]) < 0.2;
}

export interface PhaseAlignment {
  /** Corrected angle (dragged -> partner, atan2(dz,dx) convention) that centers the
   *  mesh exactly on the partner's nearest tooth-pitch "detent," instead of whatever
   *  raw angle the drag happened to land on. */
  worldAngleTowardPartner: number;
  /** The rotation dragged should be set to, given it ends up at that corrected angle. */
  rotation: number;
}

/** For a phase-alignable pair (both spur/helical/crank/battery/outlet -- the only
 *  types with an actual tooth profile to align, and only on the default world +Y axis
 *  both are placed on; bevel/worm/load/gauge/fan render as smooth cones/cylinders/rings
 *  with no teeth to clash), computes BOTH the angular correction and the dragged
 *  gear's resulting rotation so the mesh centers exactly tooth-middle-in-gap-middle,
 *  not just "doesn't clash." Hand-positioning a gear at the right center distance
 *  already needs `findSnapTarget`'s help; getting the rotational phase centered by
 *  hand on top of that is impractical. Returns `null` when phase-alignment doesn't
 *  apply, per the type/axis rule above. */
export function meshPhaseAlignment(
  dragged: GearInstance,
  rawWorldAngleTowardPartner: number,
  partner: GearInstance,
): PhaseAlignment | null {
  if (!PROFILE_TYPES.has(dragged.type) || !PROFILE_TYPES.has(partner.type)) return null;
  if (!isWorldYAxis(dragged) || !isWorldYAxis(partner)) return null;

  // Snap the angle (as seen from the partner) to the nearest one where the partner
  // shows an exact gap-center (phase 0.75) at the contact point. Valid solutions
  // repeat every `partnerPitch`, so solving for the nearest one is a "round to the
  // nearest grid line" over that fixed step -- picking a random point in the gap (a
  // valid, non-clashing but off-center mesh) is exactly the bug this fixes.
  const partnerPitch = TWO_PI / partner.teeth;
  const continuousN = (-Math.PI - partner.rotation - rawWorldAngleTowardPartner) / partnerPitch - 0.75;
  const n = Math.round(continuousN);
  const worldAngleTowardPartner = -Math.PI - partner.rotation - (0.75 + n) * partnerPitch;

  // With the partner locked to phase 0.75 (gap-center) at this angle by construction,
  // dragged's target phase (partnerPhase + 0.5, same anti-phase logic as before) is
  // exactly 0.25 -- its own tooth-center -- giving a properly centered mesh rather
  // than just an arbitrary non-clashing one.
  const draggedPitch = TWO_PI / dragged.teeth;
  const rotation = -worldAngleTowardPartner - 0.25 * draggedPitch;

  return { worldAngleTowardPartner, rotation };
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
