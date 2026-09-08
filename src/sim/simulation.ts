import type { GearInstance, LayoutState, SimTickResult } from "./types";
import { buildEdges, classify } from "./graph";
import { propagateRotation } from "./rotation";
import { applyWear } from "./wear";
import { computeMeshPhaseOffset } from "./meshing";

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

export function tick(layout: LayoutState, dt: number, timeScale: number): SimTickResult {
  const { gears, remoteLinks } = layout;
  const edges = buildEdges(gears, remoteLinks);
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
    const { durabilityCurrent, broken } = applyWear({
      gear: g,
      angularVelocity,
      hasDownstreamLoad: loadPresence.get(g.id) ?? false,
      dt,
      timeScale,
    });
    const phaseAdjustment = phaseAdjustments.get(g.id) ?? 0;
    const rotation = broken ? g.rotation : g.rotation + phaseAdjustment + angularVelocity * dt;
    // A rack accumulates linear travel, clamped into its `travelLimit` if it has one -- so a
    // gate/lift that is cranked indefinitely parks at its physical stop rather than sailing
    // out of the scene. Racks with no limit keep their original unbounded behaviour.
    let linearPosition = g.linearPosition;
    if (g.type === "rack") {
      linearPosition = (g.linearPosition ?? 0) + (linearVelocities.get(g.id) ?? 0) * dt;
      if (g.travelLimit) {
        const [lo, hi] = g.travelLimit;
        linearPosition = Math.min(Math.max(linearPosition, lo), hi);
      }
    }
    return { ...g, durabilityCurrent, broken, rotation, angularVelocity, linearPosition };
  });

  return { gears: updatedGears, diagnostics };
}
