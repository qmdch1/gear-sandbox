import type { GearInstance, MeshEdge } from "./types";

const MESH_TOLERANCE = 0.05;          // 5% tolerance on center-distance match
const PARALLEL_DOT_THRESHOLD = 0.98;  // |axis dot| above this => parallel axes
const PERP_DOT_THRESHOLD = 0.1;       // |axis dot| below this => perpendicular axes
const COUPLING_DISTANCE_TOLERANCE = 0.05;

const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank"]);

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
  if (a.type === "load" || b.type === "load") {
    if (a.type === "load" && b.type === "load") return null; // two load objects never couple
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
  if (a.type === "load" || b.type === "load") {
    if (a.type === "load" && b.type === "load") return null;
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

/** True when two gears geometrically overlap (closer than a valid mesh distance allows,
 *  and NOT already a legitimate connection -- a load or worm coupling is intentionally
 *  coincident with its host gear, so a valid `evaluatePair` result is never an overlap). */
export function isOverlapping(a: GearInstance, b: GearInstance): boolean {
  if (evaluatePair(a, b)) return false;
  const centerDistance = dist(a.position, b.position);
  const expected = pitchRadius(a) + pitchRadius(b);
  return centerDistance < expected * (1 - MESH_TOLERANCE);
}
