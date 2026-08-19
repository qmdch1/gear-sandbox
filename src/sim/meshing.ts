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

function fraction01(value: number): number {
  return ((value % 1) + 1) % 1;
}

/** For a world +Y-axis gear with an actual tooth profile (spur/helical/crank -- bevel/
 *  worm/load render as smooth cones/cylinders with no teeth to visually clash), the
 *  fraction (0..1) of one tooth-pitch that `worldAngle` (direction from the gear's own
 *  center, in the XZ ground plane) currently falls at: [0, 0.5) is tooth material,
 *  [0.5, 1) is the gap between teeth. Mirrors the exact quaternion `gearMesh.ts` uses
 *  to place a mesh (`setFromUnitVectors((0,0,1), axis)` then `rotateZ(gear.rotation)`),
 *  worked out algebraically for the world +Y axis case rather than replicated with an
 *  actual quaternion type here, to keep this module's zero-Three.js dependency. */
function toothPhaseAtWorldAngle(gear: GearInstance, worldAngle: number): number {
  const localAngle = -worldAngle - gear.rotation;
  const pitch = TWO_PI / gear.teeth;
  return fraction01(localAngle / pitch);
}

/** The `rotation` the dragged gear should be set to so its tooth interlocks into
 *  `partner`'s gap at the point of contact, instead of the two tooth profiles visually
 *  clashing — hand-positioning a gear at the right center distance already needs
 *  `findSnapTarget`'s help; getting the rotational *phase* right by hand on top of that
 *  is impractical. Returns `null` when phase-alignment doesn't apply: only spur/helical/
 *  crank actually render a tooth profile to align, and only for the default world +Y
 *  axis both of them are placed on (bevel/worm's perpendicular-axis meshes have no teeth
 *  in their geometry to clash in the first place, so there's nothing to correct there). */
export function meshPhaseRotation(
  dragged: GearInstance,
  draggedPosition: [number, number, number],
  partner: GearInstance,
): number | null {
  if (!PROFILE_TYPES.has(dragged.type) || !PROFILE_TYPES.has(partner.type)) return null;
  if (!isWorldYAxis(dragged) || !isWorldYAxis(partner)) return null;

  const dx = partner.position[0] - draggedPosition[0];
  const dz = partner.position[2] - draggedPosition[2];
  const worldAngleTowardPartner = Math.atan2(dz, dx);
  const partnerWorldAngle = worldAngleTowardPartner + Math.PI; // contact, from the partner's side
  const partnerPhase = toothPhaseAtWorldAngle(partner, partnerWorldAngle);

  // Target: dragged sits exactly anti-phase (its own phase offset by 0.5 from whatever
  // the partner currently shows) at the contact point. A 0.5 phase offset is exactly
  // half of one tooth-pitch (one tooth-width OR one gap-width, given the 50% duty
  // cycle) -- and since pitchRadius*(2π/teeth) = module*π regardless of teeth count,
  // both gears' tooth/gap arc widths are identical in real terms, so this offset is
  // the correct target (matching real gears' rolling-contact geometry) no matter how
  // many teeth either one has.
  const targetDraggedPhase = fraction01(partnerPhase + 0.5);
  const draggedPitch = TWO_PI / dragged.teeth;
  // Solve toothPhaseAtWorldAngle(dragged, worldAngleTowardPartner) === targetDraggedPhase
  // for dragged.rotation: any coterminal solution renders identically via rotateZ.
  return -worldAngleTowardPartner - targetDraggedPhase * draggedPitch;
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
