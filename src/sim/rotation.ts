import type { GearInstance, MeshEdge } from "./types";
import { POWER_SOURCE_TYPES } from "./gearDefs";

export interface RotationResult {
  angularVelocities: Map<string, number>;
}

export function propagateRotation(gears: GearInstance[], edges: MeshEdge[]): RotationResult {
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const angularVelocities = new Map<string, number>();
  for (const g of gears) angularVelocities.set(g.id, POWER_SOURCE_TYPES.has(g.type) ? g.angularVelocity : 0);

  const adjacency = new Map<string, MeshEdge[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    // A "structural" edge (beam-to-beam or beam-to-anything joint) is a rigid,
    // non-rotating connection -- it groups parts together for dragging
    // (graph.ts's connectedComponentIds, which sees ALL edges unfiltered), but
    // it must never carry rotation the way a real mesh/coupling does, so it's
    // excluded from this adjacency entirely.
    if (e.kind === "structural") continue;
    if (e.oneWay !== "bToA") adjacency.get(e.a)!.push(e);
    if (e.oneWay !== "aToB") adjacency.get(e.b)!.push(e);
  }

  const visited = new Set<string>();
  for (const crank of gears.filter((g) => POWER_SOURCE_TYPES.has(g.type) && !g.broken)) {
    if (visited.has(crank.id)) continue;
    visited.add(crank.id);
    const queue = [crank.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curSpeed = angularVelocities.get(cur)!;
      for (const edge of adjacency.get(cur) ?? []) {
        const isForward = edge.a === cur;
        const otherId = isForward ? edge.b : edge.a;
        if (visited.has(otherId)) continue;
        const other = byId.get(otherId)!;
        if (other.broken) continue; // broken gears absorb rotation, don't relay it
        // A tooth mesh between two PARALLEL-axis gears (evaluatePair's SPUR_FAMILY/
        // HELICAL_FAMILY case) has adjacent gears rotate in opposite senses about
        // that same shared axis -- the standard "external gears spin opposite ways"
        // fact, which the -1 below reproduces. A bevel gear only ever meshes on a
        // PERPENDICULAR axis (evaluatePair rejects a bevel pair whose axes aren't
        // near-perpendicular), where the two gears don't share a rotation plane at
        // all -- there's no "opposite direction about the same axis" relationship to
        // preserve, so flipping the sign there was an unexamined carry-over from the
        // parallel-axis case, not a derived fact. Keeping it same-sign instead.
        const a = byId.get(edge.a)!;
        const b = byId.get(edge.b)!;
        const isBevelMesh = edge.kind === "mesh" && (a.type === "bevel" || b.type === "bevel");
        const sign = edge.kind === "coupling" || isBevelMesh ? 1 : -1;
        const ratio = isForward ? edge.ratio : 1 / edge.ratio;
        angularVelocities.set(otherId, curSpeed * sign * ratio);
        visited.add(otherId);
        queue.push(otherId);
      }
    }
  }

  return { angularVelocities };
}
