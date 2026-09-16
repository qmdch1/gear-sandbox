import type { GearInstance, LayoutState, SimTickResult, Vehicle } from "./types";
import { buildEdges, classify } from "./graph";
import { propagateRotation } from "./rotation";
import { applyWear } from "./wear";
import { computeMeshPhaseOffset } from "./meshing";
import { stepMotors } from "./dynamics";

function componentHasLoad(gears: GearInstance[], edges: { a: string; b: string }[]): Map<string, boolean> {
  const adjacency = new Map<string, string[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const result = new Map<string, boolean>();
  const visited = new Set<string>();
  for (const g of gears) {
    if (visited.has(g.id)) continue;
    const component: string[] = [];
    const queue = [g.id];
    visited.add(g.id);
    let hasLoad = false;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      if (byId.get(cur)!.type === "load") hasLoad = true;
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of component) result.set(id, hasLoad);
  }
  return result;
}

/** Per-tick options. `wear` exists because durability is a teaching/gameplay mechanic, not a
 *  property of the mechanism itself: `wear.ts` only ever subtracts, and a gear worn to zero is
 *  `broken`, which `rotation.ts` treats as a dead end that stops relaying drive downstream. Left
 *  on, any layout eventually grinds itself to a halt -- measured on the bundled showroom, the
 *  first gear fails at ~67s and 27 of 72 are broken by 150s. The app therefore runs with wear
 *  OFF so the machines simply keep running; the default here stays `true` so the mechanic (and
 *  every test that exercises it) is unchanged for callers that want it. */
export interface TickOptions {
  wear?: boolean;
  /** Downward acceleration, m/s^2; defaults to Earth's. Reaches the gear train through the
   *  rolling resistance of any vehicle, which is a fraction of that vehicle's WEIGHT -- so the
   *  same car really does coast further on the Moon. */
  gravity?: number;
}

export function tick(
  layout: LayoutState,
  dt: number,
  timeScale: number,
  options: TickOptions = {},
): SimTickResult {
  const { remoteLinks } = layout;
  const vehicles = layout.vehicles ?? [];
  // `timeScale` is the "시간배율" slider: it multiplies how much SIMULATED time a frame is worth.
  // Every integration below therefore advances by `step`, not by the wall-clock `dt` -- gear
  // rotation, a rack's travel, a vehicle's distance and the motors' own spin-up alike. Until
  // this existed the slider only reached `applyWear` (which scales internally, and so keeps
  // taking `dt` and `timeScale` separately), which meant that with wear off -- how the app
  // runs -- dragging it did nothing whatsoever.
  const step = dt * timeScale;
  const edges = buildEdges(layout.gears, remoteLinks);

  // DYNAMICS FIRST, then kinematics. A motorised crank's speed is not an input at all: it is the
  // result of the torque balance across everything it drives (`dynamics.ts`), so it has to be
  // solved before the ratios can carry it outward. A crank with no `motor` is untouched here and
  // stays the ideal velocity source it has always been.
  const motorSpeeds = stepMotors(layout.gears, edges, vehicles, step, { gravity: options.gravity });
  const gears = motorSpeeds.size === 0
    ? layout.gears
    : layout.gears.map((g) =>
        motorSpeeds.has(g.id) ? { ...g, angularVelocity: motorSpeeds.get(g.id)! } : g,
      );
  const byId = new Map(gears.map((g) => [g.id, g] as const));

  const diagnostics = classify(gears, edges);
  const { angularVelocities, linearVelocities } = propagateRotation(gears, edges);
  const loadPresence = componentHasLoad(gears, edges);

  // Re-derive the tooth phase for every mesh edge on EVERY tick, not just the tick an
  // edge first appears. `computeMeshPhaseOffset` returns exactly 0 for a pair that is
  // already aligned and turning at the ratio `propagateRotation` enforces, so this is
  // free in steady state. What it buys: dragging an already-meshed gear changes the
  // contact geometry every frame without changing the edge set, so the old "new edges
  // only" gate could never correct it; and when several edges appear on the same tick
  // (loading a layout) each was computed against the others' pre-adjustment rotations,
  // freezing a residual misalignment down the chain. Both now self-correct.
  //
  // That "free in steady state" guarantee only holds on an edge whose two ends actually
  // ARE conjugate -- the offset formula treats `a`'s rotation as the reference and solves
  // for `b`'s, so it is a no-op only while `b` turns at exactly the rate `a` implies.
  // Across an edge where that does not hold (a rack, whose angularVelocity is always 0
  // because it travels linearly instead; a broken gear, which absorbs rotation rather
  // than relaying it; the blocked side of a one-way worm or ratchet edge) recomputing it
  // every tick does not settle -- it re-snaps `b` onto a fixed tooth lattice every tick
  // and `b` visibly freezes. Since `buildEdges` assigns `a`/`b` purely by array index --
  // i.e. by the order the user happened to add the gears -- that made the freeze a coin
  // flip on layouts as ordinary as rack + pinion. So gate the offset on the pair really
  // being conjugate.
  const phaseAdjustments = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== "mesh") continue;
    const a = byId.get(edge.a)!;
    const b = byId.get(edge.b)!;
    // A rack has no meaningful rotational phase to align, and a broken gear's rotation is
    // frozen by design (see the `broken ? g.rotation : ...` branch below). These checks are
    // NOT redundant with the velocity check below: a rack or a broken gear sitting at rest
    // next to an also-stationary partner satisfies `wB + ratio*wA == 0` trivially (0 == 0),
    // so the velocity check alone would still re-align them. Skipping by type/broken status
    // first is what keeps an at-rest rack (whose phase is meaningless) or an already-settled
    // broken pair from being nudged for no reason.
    if (a.type === "rack" || b.type === "rack") continue;
    if (a.broken || b.broken) continue;
    // `propagateRotation` drives a "mesh" edge with sign = -1 and ratio = edge.ratio in
    // the a->b direction (1 / edge.ratio in the b->a direction, which rearranges to the
    // same thing), i.e. it enforces wB = -edge.ratio * wA. Only apply the offset while
    // that relation actually holds. A pair at rest satisfies it trivially, which is what
    // lets an unpowered or freshly-placed pair still settle onto its tooth lattice.
    const wA = angularVelocities.get(a.id) ?? 0;
    const wB = angularVelocities.get(b.id) ?? 0;
    const tolerance = 1e-6 * Math.max(1, Math.abs(wA), Math.abs(wB));
    if (Math.abs(wB + edge.ratio * wA) > tolerance) continue;
    phaseAdjustments.set(b.id, computeMeshPhaseOffset(a, b, edge));
  }

  const updatedGears = gears.map((g) => {
    const angularVelocity = angularVelocities.get(g.id) ?? 0;
    const { durabilityCurrent, broken } =
      options.wear === false
        ? { durabilityCurrent: g.durabilityCurrent, broken: g.broken }
        : applyWear({
            gear: g,
            angularVelocity,
            hasDownstreamLoad: loadPresence.get(g.id) ?? false,
            dt,
            timeScale,
          });
    const phaseAdjustment = phaseAdjustments.get(g.id) ?? 0;
    const rotation = broken ? g.rotation : g.rotation + phaseAdjustment + angularVelocity * step;
    // A rack accumulates linear travel, clamped into its `travelLimit` if it has one -- so a
    // gate/lift that is cranked indefinitely parks at its physical stop rather than sailing
    // out of the scene. Racks with no limit keep their original unbounded behaviour.
    let linearPosition = g.linearPosition;
    if (g.type === "rack") {
      linearPosition = (g.linearPosition ?? 0) + (linearVelocities.get(g.id) ?? 0) * step;
      if (g.travelLimit) {
        const [lo, hi] = g.travelLimit;
        linearPosition = Math.min(Math.max(linearPosition, lo), hi);
      }
    }
    // A reciprocating crank (see `reverseAt`) flips its own commanded speed once it has
    // swept out to a bound, which reverses everything it drives on the next tick. The
    // rotation itself is deliberately NOT snapped back to the bound: letting it overshoot by
    // the same sub-tick amount at each end keeps `rotation` and a driven rack's separately
    // integrated `linearPosition` in lockstep, instead of drifting apart by whatever the
    // snap discarded.
    let commandedVelocity = angularVelocity;
    let motor = g.motor;
    if (g.type === "crank" && g.reverseAt && !broken) {
      const [lo, hi] = g.reverseAt;
      if (motor) {
        // A MOTORISED crank reverses the way a real machine on a limit switch does: the switch
        // throws the motor into reverse and the motor then has to fight the train's momentum to
        // a stop before it can pull the other way. So the sign that flips is the motor's own
        // free speed -- its commanded direction -- never the shaft's present speed, which would
        // teleport a spinning mass straight through zero and hand back its kinetic energy for
        // free. The overshoot while it brakes is real, and is why a vehicle's `limit` is set
        // wider than the stroke that commands it.
        if ((rotation >= hi && motor.freeSpeed > 0) || (rotation <= lo && motor.freeSpeed < 0)) {
          motor = { ...motor, freeSpeed: -motor.freeSpeed };
        }
      } else if ((rotation >= hi && commandedVelocity > 0) || (rotation <= lo && commandedVelocity < 0)) {
        commandedVelocity = -commandedVelocity;
      }
    }
    return { ...g, durabilityCurrent, broken, rotation, angularVelocity: commandedVelocity, linearPosition, motor };
  });

  // A driven wheel carries its vehicle by the no-slip relation v = w * r -- the same
  // angle-times-radius that drives a rack from its pinion or a hook from its winding drum. The
  // wheel's speed is the one the kinematics just produced, so the vehicle can never travel at a
  // speed its own wheels are not turning at.
  const updatedVehicles: Vehicle[] | undefined = layout.vehicles?.map((v) => {
    // A BROKEN wheel does not turn, so it carries nothing: `updatedGears` freezes a broken
    // gear's `rotation`, and a vehicle that kept travelling on the speed that gear was last
    // commanded at would break the no-slip relation the travel is supposed to BE -- the car
    // would slide along on a wheel that had visibly stopped. The check is needed because a
    // broken CRANK keeps its stored `angularVelocity` in the map (`propagateRotation` seeds
    // every crank from its own field and only then excludes broken ones from driving), which
    // is exactly the case a motorised road wheel like the locomotive's main driver is in.
    const wheel = byId.get(v.wheel);
    const wheelSpeed = wheel && !wheel.broken ? angularVelocities.get(v.wheel) ?? 0 : 0;
    let distance = v.distance + wheelSpeed * v.radius * step;
    if (v.limit) {
      const [lo, hi] = v.limit;
      distance = Math.min(Math.max(distance, lo), hi);
    }
    return { ...v, distance };
  });

  return { gears: updatedGears, diagnostics, vehicles: updatedVehicles };
}
