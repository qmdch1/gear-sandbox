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
const COUPLING_ONLY_TYPES = new Set<GearInstance["type"]>(["load", "gauge", "fan", "wheel", "bearing", "rotor"]);

// Rod types that lock together whatever their endpoints happen to touch, and
// never carry rotation at all (see rotation.ts, which skips "structural"
// edges entirely) -- a real chassis is built from beams AND springs joined at
// shared nodes (a spring is just a flexible strut in this simplified model,
// not an actively-damped one), not just one continuous rigid rod.
const STRUCTURAL_ROD_TYPES = new Set<GearInstance["type"]>(["beam", "spring"]);

// Belt/chain (endless loop, needs teeth on both hosts, ratio = pitch-radius
// ratio) and track (tank tread, mechanically identical to a belt/chain loop --
// same same-direction radius-ratio coupling, just draped over sprockets
// instead of pulleys/gears) share every meshing rule below, differing only in
// their rendering (see gearGeometry.ts).
const BELT_LIKE_TYPES = new Set<GearInstance["type"]>(["belt", "track"]);

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

/** All the points a gear could join another part at -- one for most types, two
 *  (`position` and `position2`) for a rod (shaft/beam). Used by `beamJoinsAt` to
 *  check every endpoint-pair for coincidence, since unlike a shaft (which only
 *  ever couples an END onto a host gear's single shaft point), a beam can join
 *  ANY of its endpoints to ANY of another beam's endpoints. */
function endpointsOf(g: GearInstance): Array<[number, number, number]> {
  return g.position2 ? [g.position, g.position2] : [g.position];
}

/** A "beam"/"spring" is a purely structural rod -- unlike "shaft," it carries no
 *  rotation at all (see rotation.ts, which skips "structural" edges entirely), so
 *  there's no axis-alignment requirement to check: it's just a rigid strut that
 *  locks together whatever its endpoints happen to touch, exactly like bolting
 *  two real beams together at a shared joint. This also means these rods CAN
 *  chain end-to-end (and to each other) to build up a frame (unlike
 *  shaft-to-shaft, which stays disallowed above) -- a real chassis is built from
 *  many beams (and springs, in a suspension) joined at shared nodes, not just
 *  one continuous rigid rod. */
function beamJoinsAt(a: GearInstance, b: GearInstance): boolean {
  if (!STRUCTURAL_ROD_TYPES.has(a.type) && !STRUCTURAL_ROD_TYPES.has(b.type)) return false;
  for (const pa of endpointsOf(a)) {
    for (const pb of endpointsOf(b)) {
      if (dist(pa, pb) <= COUPLING_DISTANCE_TOLERANCE) return true;
    }
  }
  return false;
}

/** A "joint" (universal joint) bridges two endpoints by bare coincidence, same as
 *  `beamJoinsAt` -- but UNLIKE a beam/spring, it's a "coupling" edge, not
 *  "structural": it DOES carry rotation (1:1, same direction) between whatever
 *  it touches (see rotation.ts, which propagates "coupling" edges). This is
 *  exactly what a real universal joint is for: transmitting rotation between two
 *  shafts whose axes don't line up -- which is why this check, like beam's, has
 *  no axis-alignment requirement at all (that's the entire point of the part),
 *  unlike `shaftCouplingEnd`'s strict parallel-axis requirement. */
function jointJoinsAt(a: GearInstance, b: GearInstance): boolean {
  if (a.type !== "joint" && b.type !== "joint") return false;
  for (const pa of endpointsOf(a)) {
    for (const pb of endpointsOf(b)) {
      if (dist(pa, pb) <= COUPLING_DISTANCE_TOLERANCE) return true;
    }
  }
  return false;
}

/** A "shaft" is a rigid rod with TWO ends (`position` and `position2`), each
 *  independently able to couple onto a different host gear's own shaft -- unlike
 *  every other coupling-only type, which has just one point. Returns its
 *  normalized end-to-end direction, or `null` if it has no valid (nonzero-length)
 *  second end yet. */
function shaftDirection(shaft: GearInstance): [number, number, number] | null {
  if (!shaft.position2) return null;
  const d: [number, number, number] = [
    shaft.position2[0] - shaft.position[0],
    shaft.position2[1] - shaft.position[1],
    shaft.position2[2] - shaft.position[2],
  ];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return null;
  return [d[0] / len, d[1] / len, d[2] / len];
}

/** Whether `shaft`'s two ends couple onto `host` (one end coincident with it,
 *  same reasoning as `evaluatePair`'s other coincident couplings), and if so,
 *  which end. A straight rigid rod can only really stand in for a real coupling
 *  if its own length runs along the same line as the host's rotation axis at
 *  that end (like a real motor-shaft coupling, just longer) -- so this also
 *  requires the shaft's overall direction to be parallel to the host's axis,
 *  not just "close enough in position." A host that's ALSO a shaft has no
 *  meaningful `axis` field of its own (see types.ts -- a rod's orientation
 *  comes from position/position2, not `axis`), so in that case the reference
 *  direction is the HOST's own end-to-end direction instead -- this is what
 *  lets two shaft segments couple end-to-end into a longer driveshaft (see
 *  the shaft-to-shaft branch in evaluatePair, below). Checks `shaft`'s end
 *  against EVERY point `host` has (both endpoints, when host is also a rod --
 *  not just `host.position`), since the touching point could just as easily
 *  be the host's SECOND endpoint (e.g. two shaft segments meeting exactly at
 *  the far end of the second one) as its first. */
function shaftCouplingEnd(shaft: GearInstance, host: GearInstance): "position" | "position2" | null {
  const direction = shaftDirection(shaft);
  const referenceAxis = host.type === "shaft" ? shaftDirection(host) : host.axis;
  if (!direction || !referenceAxis || Math.abs(dot(direction, referenceAxis)) < PARALLEL_DOT_THRESHOLD) return null;
  const hostPoints = host.position2 ? [host.position, host.position2] : [host.position];
  for (const hostPoint of hostPoints) {
    if (dist(shaft.position, hostPoint) <= COUPLING_DISTANCE_TOLERANCE) return "position";
    if (shaft.position2 && dist(shaft.position2, hostPoint) <= COUPLING_DISTANCE_TOLERANCE) return "position2";
  }
  return null;
}

/** Whether `belt`'s two ends couple onto `host` -- unlike `shaftCouplingEnd`, no
 *  axis-alignment check: a belt/chain doesn't rigidly extend ALONG a host's
 *  rotation axis the way a shaft coupling does, it just wraps around the
 *  host's own pulley/sprocket perpendicular to that axis, so its end simply
 *  needs to sit at the host's shaft position. (A real belt drive does need
 *  its two pulleys' axes parallel to EACH OTHER, but `evaluatePair` only ever
 *  sees one host at a time -- see the comment on the belt branch below for why
 *  that cross-check is left unenforced, same tradeoff as `beamJoinsAt`.) Also
 *  requires the host to actually have teeth (a nonzero pitch radius) -- a belt
 *  ratio is meaningless against a toothless accessory like load/gauge/fan/wheel
 *  or another rod (shaft/beam/belt all default to zero teeth). */
function beltCouplingEnd(belt: GearInstance, host: GearInstance): "position" | "position2" | null {
  if (host.teeth <= 0) return null;
  if (dist(belt.position, host.position) <= COUPLING_DISTANCE_TOLERANCE) return "position";
  if (belt.position2 && dist(belt.position2, host.position) <= COUPLING_DISTANCE_TOLERANCE) return "position2";
  return null;
}

/** For a "belt" gear, the pitch radius of whatever host currently occupies each
 *  end (`position` / `position2`), or undefined where that end isn't currently
 *  connected to anything. Purely a rendering aid (see gearMesh.ts's tangent-line
 *  belt geometry, wired in via simulation.ts's tick()) -- the actual power-
 *  transmission ratio is computed independently by `evaluatePair`, from the
 *  same underlying host radii, so this never affects the physics. */
export function beltHostRadii(belt: GearInstance, gears: GearInstance[]): { radius1?: number; radius2?: number } {
  let radius1: number | undefined;
  let radius2: number | undefined;
  for (const g of gears) {
    if (g.id === belt.id) continue;
    const end = beltCouplingEnd(belt, g);
    if (end === "position") radius1 = pitchRadius(g);
    else if (end === "position2") radius2 = pitchRadius(g);
  }
  return { radius1, radius2 };
}

/** Returns the mesh/coupling edge between two gears, or null if they don't connect. */
export function evaluatePair(a: GearInstance, b: GearInstance): MeshEdge | null {
  // Checked before every other rule (including shaft) since a beam's join
  // condition is the simplest of all (bare coincidence, no axis check) and is
  // never in conflict with them -- a beam only ever matches this branch.
  if (beamJoinsAt(a, b)) {
    return { a: a.id, b: b.id, kind: "structural", ratio: 1, oneWay: "none" };
  }

  // A "joint" (universal joint): bare coincidence, like beam above, but a
  // rotation-CARRYING coupling instead of a non-rotating structural link --
  // see `jointJoinsAt`'s doc comment. Checked at the same early priority as
  // beam, before belt/shaft's stricter axis-aligned rules, so a joint always
  // wins on bare coincidence even when one side happens to be a shaft/belt.
  if (jointJoinsAt(a, b)) {
    return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
  }

  // A belt/chain (or tank track, mechanically identical -- see BELT_LIKE_TYPES):
  // same-direction power transmission (unlike a tooth mesh, which reverses
  // direction) between two pulleys/sprockets at a distance, scaled by their
  // relative pitch radii (unlike a shaft's rigid 1:1 coupling) -- exactly how a
  // real bicycle chain, belt drive, or tank tread behaves. Encoded as an
  // ordinary "coupling" edge (same-direction sign, see rotation.ts) whose ratio
  // is the HOST's own pitch radius: propagateRotation's existing generic
  // ratio/1-ratio reversal then correctly converts an angular velocity into a
  // "linear belt speed" units going one way, and back into the other pulley's
  // own angular velocity coming back out -- no core rotation.ts changes needed.
  if (BELT_LIKE_TYPES.has(a.type) || BELT_LIKE_TYPES.has(b.type)) {
    if (BELT_LIKE_TYPES.has(a.type) && BELT_LIKE_TYPES.has(b.type)) return null; // no belt/track-to-belt/track chaining -- a loop connects two sprockets, not another loop
    const belt = BELT_LIKE_TYPES.has(a.type) ? a : b;
    const host = BELT_LIKE_TYPES.has(a.type) ? b : a;
    if (!beltCouplingEnd(belt, host)) return null;
    // `ratio` is "b's speed = ratio * a's speed" (see rotation.ts) -- so which
    // way to multiply by the host's pitch radius depends on which of a/b IS the
    // host here, not just which one it is conceptually: going host->belt
    // multiplies (angularVelocity * radius = linear speed), going belt->host
    // divides (linear speed / radius = angularVelocity back out).
    const ratio = BELT_LIKE_TYPES.has(a.type) ? 1 / pitchRadius(host) : pitchRadius(host);
    return { a: a.id, b: b.id, kind: "coupling", ratio, oneWay: "none" };
  }

  if (a.type === "shaft" || b.type === "shaft") {
    // Shaft-to-shaft IS allowed (unlike belt-to-belt) -- two rigid rod
    // segments coupling end-to-end into a longer driveshaft is a completely
    // normal real-world mechanism (and mirrors how "beam" already allows
    // beam-to-beam chaining for the same reason). shaftCouplingEnd's own
    // axis check handles a shaft-typed host by comparing directions instead
    // of reading a meaningless `axis` field.
    const shaft = a.type === "shaft" ? a : b;
    const host = a.type === "shaft" ? b : a;
    if (!shaftCouplingEnd(shaft, host)) return null;
    return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
  }

  if (COUPLING_ONLY_TYPES.has(a.type) || COUPLING_ONLY_TYPES.has(b.type)) {
    if (COUPLING_ONLY_TYPES.has(a.type) && COUPLING_ONLY_TYPES.has(b.type)) return null; // two accessories never couple to each other
    if (dist(a.position, b.position) > COUPLING_DISTANCE_TOLERANCE) return null;
    if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
    return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
  }

  // A worm's driving shaft attaches directly (coincident position) to whatever
  // powers it -- in this simplified model a worm has no separate "input tooth
  // mesh," so without this it could never receive rotation at all (its only other
  // rule, below, is a ONE-WAY mesh *out* toward its wheel). Deliberately NOT
  // requiring the powering gear's axis to match the worm's own (a worm defaults to
  // the +X axis, every parallel-family power source defaults to +Y, and nothing in
  // the UI can reorient either one -- requiring axis alignment here made a worm
  // impossible to ever power at all). This coupling check is geometrically
  // distinguishable from the mesh check below anyway (coincident vs.
  // pitch-radius-apart), so dropping the axis requirement creates no ambiguity.
  if (a.type === "worm" || b.type === "worm") {
    const bothWorm = a.type === "worm" && b.type === "worm";
    const coincident = dist(a.position, b.position) <= COUPLING_DISTANCE_TOLERANCE;
    if (!bothWorm && coincident) {
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
  if (STRUCTURAL_ROD_TYPES.has(a.type) || STRUCTURAL_ROD_TYPES.has(b.type)) {
    return 0; // bare coincidence, no axis requirement -- see beamJoinsAt/evaluatePair
  }

  if (a.type === "joint" || b.type === "joint") {
    return 0; // bare coincidence, no axis requirement -- see jointJoinsAt/evaluatePair
  }

  if (BELT_LIKE_TYPES.has(a.type) || BELT_LIKE_TYPES.has(b.type)) {
    if (BELT_LIKE_TYPES.has(a.type) && BELT_LIKE_TYPES.has(b.type)) return null;
    const host = BELT_LIKE_TYPES.has(a.type) ? b : a;
    return host.teeth > 0 ? 0 : null; // bare coincidence -- see beltCouplingEnd/evaluatePair
  }

  if (a.type === "shaft" || b.type === "shaft") {
    // Shaft-to-shaft allowed -- see evaluatePair's matching branch for why.
    const shaft = a.type === "shaft" ? a : b;
    const host = a.type === "shaft" ? b : a;
    const direction = shaftDirection(shaft);
    const referenceAxis = host.type === "shaft" ? shaftDirection(host) : host.axis;
    if (!direction || !referenceAxis || Math.abs(dot(direction, referenceAxis)) < PARALLEL_DOT_THRESHOLD) return null;
    return 0; // coincident shaft-end coupling -- see evaluatePair's matching check
  }

  if (COUPLING_ONLY_TYPES.has(a.type) || COUPLING_ONLY_TYPES.has(b.type)) {
    if (COUPLING_ONLY_TYPES.has(a.type) && COUPLING_ONLY_TYPES.has(b.type)) return null;
    if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
    return 0;
  }

  if (a.type === "worm" || b.type === "worm") {
    const bothWorm = a.type === "worm" && b.type === "worm";
    if (!bothWorm) {
      return 0; // coincident shaft coupling -- see evaluatePair's matching check for why axis alignment isn't required here
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

function isWormOnWorldXAxis(g: GearInstance): boolean {
  return g.type === "worm" && isWorldXAxis(g);
}

/** Shared by every phase-alignable pairing below: the world angle (as seen from
 *  `partner`) nearest `rawWorldAngleTowardPartner` where `partner` shows an exact
 *  gap-center (phase 0.5) at the contact point, rounded to the nearest achievable
 *  detent (valid solutions repeat every tooth pitch). See the module doc comment
 *  below for the phase convention and derivation this implements. */
function roundedPartnerGapCenterAngle(partner: GearInstance, rawWorldAngleTowardPartner: number): number {
  const partnerPitch = TWO_PI / partner.teeth;
  const continuousN = (-Math.PI - partner.rotation - rawWorldAngleTowardPartner) / partnerPitch - 0.5;
  const n = Math.round(continuousN);
  return -Math.PI - partner.rotation - (0.5 + n) * partnerPitch;
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
    // Round to the nearest angle where the partner shows an exact gap-center at the
    // contact point -- picking a random point in the gap (a valid, non-clashing but
    // off-center mesh) is exactly the bug this fixes.
    const worldAngleTowardPartner = roundedPartnerGapCenterAngle(partner, rawWorldAngleTowardPartner);

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
    const worldAngleTowardPartner = roundedPartnerGapCenterAngle(partner, rawWorldAngleTowardPartner);

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

  // A worm meshes on a perpendicular (world +X) axis against its wheel, same as a
  // bevel does -- but a worm's thread is one continuous helix, not discrete teeth,
  // so there's no rotational phase of the worm's OWN that could ever clash; any
  // angle presents a valid engagement point. Only the wheel side (real involute
  // teeth) needs its usual gap-center detent.
  const draggedIsWorm = isWormOnWorldXAxis(dragged);
  const partnerIsWorm = isWormOnWorldXAxis(partner);

  if (draggedIsWorm && SPUR_FAMILY.has(partner.type) && isWorldYAxis(partner) && sameHeight) {
    const worldAngleTowardPartner = roundedPartnerGapCenterAngle(partner, rawWorldAngleTowardPartner);
    return { worldAngleTowardPartner, rotation: dragged.rotation }; // worm's own rotation is left untouched
  }

  if (partnerIsWorm && SPUR_FAMILY.has(dragged.type) && isWorldYAxis(dragged) && sameHeight) {
    // The worm partner has no discrete phase to round against either -- the raw
    // angle is fine; still center dragged's own tooth on it for consistency with
    // every other pairing.
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
