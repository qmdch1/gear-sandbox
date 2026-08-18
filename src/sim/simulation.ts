import type { GearInstance, SimTickResult } from "./types";
import { buildEdges, classify } from "./graph";
import { propagateRotation } from "./rotation";
import { applyWear } from "./wear";

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

export function tick(gears: GearInstance[], dt: number, timeScale: number): SimTickResult {
  const edges = buildEdges(gears);
  const diagnostics = classify(gears, edges);
  const { angularVelocities } = propagateRotation(gears, edges);
  const loadPresence = componentHasLoad(gears, edges);

  const updatedGears = gears.map((g) => {
    const angularVelocity = angularVelocities.get(g.id) ?? 0;
    const { durabilityCurrent, broken } = applyWear({
      gear: g,
      angularVelocity,
      hasDownstreamLoad: loadPresence.get(g.id) ?? false,
      dt,
      timeScale,
    });
    const rotation = broken ? g.rotation : g.rotation + angularVelocity * dt;
    return { ...g, durabilityCurrent, broken, rotation, angularVelocity };
  });

  return { gears: updatedGears, diagnostics };
}
