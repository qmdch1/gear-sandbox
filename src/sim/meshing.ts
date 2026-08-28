import type { GearInstance, MeshEdge } from "./types";

const MESH_TOLERANCE = 0.05;          // 5% tolerance on center-distance match
const PARALLEL_DOT_THRESHOLD = 0.98;  // |axis dot| above this => parallel axes
const PERP_DOT_THRESHOLD = 0.1;       // |axis dot| below this => perpendicular axes
const COUPLING_DISTANCE_TOLERANCE = 0.05;

const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank", "planetary"]);

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Perpendicular distance from point `p` to the infinite line through `origin` in direction `dir` (unit vector). */
function distanceToLine(p: [number, number, number], origin: [number, number, number], dir: [number, number, number]): number {
  const rel: [number, number, number] = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const along = dot(rel, dir);
  const closest: [number, number, number] = [origin[0] + dir[0] * along, origin[1] + dir[1] * along, origin[2] + dir[2] * along];
  return dist(p, closest);
}

export function pitchRadius(g: GearInstance): number {
  return (g.module * g.teeth) / 2;
}

function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(a: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
}

const TWO_PI = Math.PI * 2;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Local XY-plane basis (u, v) for a gear's rotation frame, reproducing exactly what
 *  the render layer's `mesh.quaternion.setFromUnitVectors(Vector3(0,0,1), axis)` does
 *  (gearMesh.ts) -- the minimal rotation taking world Z to `axis`, applied to local X
 *  and Y -- computed here in plain vector math (Rodrigues' rotation formula) so the sim
 *  core stays free of a Three.js dependency while agreeing exactly with what gets
 *  rendered. Verified: max positional error 1e-15 against THREE.Quaternion across five
 *  axis directions x four rotations x four angles (see spec §2.2). */
function localBasis(axis: [number, number, number]): { u: [number, number, number]; v: [number, number, number] } {
  const [ax, ay, az] = axis;
  const rotAxis: [number, number, number] = [-ay, ax, 0]; // cross(Z, axis)
  const rotAxisLen = Math.hypot(...rotAxis);
  const angle = Math.acos(Math.max(-1, Math.min(1, az))); // dot(Z, axis) = az
  function rotate(vec: [number, number, number]): [number, number, number] {
    if (rotAxisLen < 1e-8) return az >= 0 ? vec : [vec[0], -vec[1], -vec[2]];
    const k: [number, number, number] = [rotAxis[0] / rotAxisLen, rotAxis[1] / rotAxisLen, rotAxis[2] / rotAxisLen];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const kDotV = dot(k, vec);
    const kCrossV: [number, number, number] = [
      k[1] * vec[2] - k[2] * vec[1],
      k[2] * vec[0] - k[0] * vec[2],
      k[0] * vec[1] - k[1] * vec[0],
    ];
    return [
      vec[0] * cosA + kCrossV[0] * sinA + k[0] * kDotV * (1 - cosA),
      vec[1] * cosA + kCrossV[1] * sinA + k[1] * kDotV * (1 - cosA),
      vec[2] * cosA + kCrossV[2] * sinA + k[2] * kDotV * (1 - cosA),
    ];
  }
  return { u: rotate([1, 0, 0]), v: rotate([0, 1, 0]) };
}

/** Angle (in a gear's unrotated local frame) of a world-space direction. */
function localAngleOf(dirWorld: [number, number, number], axis: [number, number, number]): number {
  const { u, v } = localBasis(axis);
  return Math.atan2(dot(dirWorld, v), dot(dirWorld, u));
}

/** The rotation (radians) to ADD to `b.rotation` so that `a`'s and `b`'s tooth patterns
 *  interleave at their contact point: whenever `a` presents a tooth centre on the centre
 *  line, `b` presents a gap centre there.
 *
 *  Write each gear's "contact phase" as the body-frame angle of the contact direction,
 *  measured in tooth-period units:
 *
 *      aPhase = frac((phiA - a.rotation) / periodA)
 *      bPhase = frac((phiB - b.rotation) / periodB)
 *
 *  Under the ratio `propagateRotation` enforces (wB = -(a.teeth / b.teeth) * wA) these
 *  drift in OPPOSITE directions at equal rate:
 *
 *      d(aPhase)/dt = -wA / periodA        d(bPhase)/dt = +wA / periodA
 *
 *  so `bPhase - aPhase` is NOT conserved -- it slews at 2*wA/periodA -- while
 *  `aPhase + bPhase` IS. Since `a` shows a tooth centre at the contact line exactly when
 *  aPhase = 0, the interleaving condition is the conserved combination
 *
 *      aPhase + bPhase = 0.5   (mod 1)
 *
 *  Pinning the non-conserved difference instead lets an aligned pair fall back out of
 *  phase as it turns (measured: up to 0.45 tooth-periods of interleave error within one
 *  revolution), and makes this function report a large non-zero offset for a pair that
 *  is already correctly meshed and spinning -- which would make it unsafe for `tick()`
 *  to re-derive per frame. With the conserved form an aligned, correctly co-rotating
 *  pair yields exactly 0, so `tick()` does recompute it every tick.
 *
 *  Not meaningful for "chain"/"belt" edges (no direct tooth contact) -- callers should
 *  only invoke this for `edge.kind === "mesh"`. */
export function computeMeshPhaseOffset(a: GearInstance, b: GearInstance, edge: MeshEdge): number {
  const dirAB = normalize(sub(b.position, a.position));
  const dirBA: [number, number, number] = [-dirAB[0], -dirAB[1], -dirAB[2]];
  const phiA = localAngleOf(dirAB, a.axis);
  const phiB = localAngleOf(dirBA, b.axis);
  const thetaA = phiA - a.rotation;
  const periodA = TWO_PI / a.teeth;
  const periodB = TWO_PI / b.teeth;
  const fracA = mod(thetaA, periodA) / periodA;
  const desiredFracB = mod(0.5 - fracA, 1);
  const desiredThetaB = desiredFracB * periodB;
  const bRotationNeeded = phiB - desiredThetaB;
  const rawOffset = bRotationNeeded - b.rotation;
  return mod(rawOffset + periodB / 2, periodB) - periodB / 2; // nearest representative, avoids a large jump
}

/** Returns the mesh/coupling edge between two gears, or null if they don't connect. */
export function evaluatePair(a: GearInstance, b: GearInstance): MeshEdge | null {
  // (1) Rack check first: a rack that happens to be coincident with a load/differential
  // must not be wrongly matched as a coincident coupling by step (2) below.
  const rackInvolved = a.type === "rack" || b.type === "rack";
  if (rackInvolved) {
    if (a.type === "rack" && b.type === "rack") return null; // two racks don't mesh with each other
    const [rack, pinion] = a.type === "rack" ? [a, b] : [b, a];
    if (pinion.type === "load" || pinion.type === "rack") return null; // only a toothed pinion can drive a rack
    const perpendicular = Math.abs(dot(rack.axis, pinion.axis)) < PERP_DOT_THRESHOLD;
    const linePitchDistance = Math.abs(distanceToLine(pinion.position, rack.position, rack.axis) - pitchRadius(pinion));
    if (!perpendicular || linePitchDistance > pitchRadius(pinion) * MESH_TOLERANCE) return null;
    const oneWay: MeshEdge["oneWay"] = rack === a ? "bToA" : "aToB"; // only the pinion drives the rack
    return { a: a.id, b: b.id, kind: "mesh", ratio: 1, oneWay };
  }

  // (2) Generalized load/differential coincident-coupling block: both resolve as 1:1
  // couplings when coincident (same position and axis).
  if (a.type === "load" || b.type === "load" || a.type === "differential" || b.type === "differential") {
    const bothNonMeshing = (a.type === "load" || a.type === "differential") && (b.type === "load" || b.type === "differential");
    if (bothNonMeshing) return null;
    if (Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD && dist(a.position, b.position) <= COUPLING_DISTANCE_TOLERANCE) {
      return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
    }
    // Loads can only couple, not mesh; if they're not coincident, they can't interact.
    const loadsInvolved = a.type === "load" || b.type === "load";
    if (loadsInvolved && dist(a.position, b.position) > COUPLING_DISTANCE_TOLERANCE) return null;
    // Differentials can mesh even if not coincident for coupling; fall through to mesh checks.
  }

  // (3) A worm's driving shaft attaches directly (coincident position, same axis) to
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

  // (4) Compute distance and axis metrics for all remaining parallel-family and
  // one-way checks below.
  const centerDistance = dist(a.position, b.position);
  const axisDot = dot(a.axis, b.axis);
  const expected = pitchRadius(a) + pitchRadius(b);
  const withinDistance = Math.abs(centerDistance - expected) <= expected * MESH_TOLERANCE;

  const bothParallelFamily = PARALLEL_FAMILY.has(a.type) && PARALLEL_FAMILY.has(b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay: "none" };
  }

  const ratchetInvolved = a.type === "ratchet" || b.type === "ratchet";
  if (ratchetInvolved && !bothParallelFamily) {
    const bothRatchet = a.type === "ratchet" && b.type === "ratchet";
    if (bothRatchet) return null; // two ratchets never usefully mesh with each other
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
    const oneWay: MeshEdge["oneWay"] = a.type === "ratchet" ? "bToA" : "aToB"; // the non-ratchet side can drive; the ratchet cannot back-drive it
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay };
  }

  // (5) Perpendicular-axis meshes: worm-to-wheel (one-way) and bevel/differential
  // (both directions).
  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = a.type === "bevel" || b.type === "bevel" || a.type === "differential" || b.type === "differential";
  if (wormPair || bevelInvolved) {
    if (Math.abs(axisDot) > PERP_DOT_THRESHOLD || !withinDistance) return null;
    const oneWay: MeshEdge["oneWay"] = wormPair ? (a.type === "worm" ? "aToB" : "bToA") : "none";
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay };
  }

  return null;
}

/** The first gear in `others` that forms a genuine tooth-mesh edge with `gear` (not a
 *  shaft coupling). Used by the render layer to find which gear a rack should visually
 *  face -- a rack has no rotation of its own to derive a facing direction from, so it
 *  needs to look up its actual meshing partner's position instead. */
export function findMeshPartner(gear: GearInstance, others: GearInstance[]): GearInstance | null {
  for (const other of others) {
    if (other.id === gear.id) continue;
    const edge = evaluatePair(gear, other);
    if (edge && edge.kind === "mesh") return other;
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
