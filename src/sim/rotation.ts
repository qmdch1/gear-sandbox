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
        const sign = edge.kind === "coupling" ? 1 : -1;
        const ratio = isForward ? edge.ratio : 1 / edge.ratio;
        angularVelocities.set(otherId, curSpeed * sign * ratio);
        visited.add(otherId);
        queue.push(otherId);
      }
    }
  }

  return { angularVelocities };
}
