import type { GearInstance, MeshEdge, SimDiagnostics } from "./types";
import { evaluatePair, isOverlapping } from "./meshing";

/** Order-independent identity for an edge -- used to diff "which edges are new this
 *  tick" without caring which gear ended up as `.a` vs `.b`. */
export function edgeKey(edge: MeshEdge): string {
  return [edge.a, edge.b].sort().join(":");
}

export function buildEdges(gears: GearInstance[]): MeshEdge[] {
  const edges: MeshEdge[] = [];
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const edge = evaluatePair(gears[i], gears[j]);
      if (edge) edges.push(edge);
    }
  }
  return edges;
}

export function findOverlaps(gears: GearInstance[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      if (isOverlapping(gears[i], gears[j])) pairs.push([gears[i].id, gears[j].id]);
    }
  }
  return pairs;
}

export function classify(gears: GearInstance[], edges: MeshEdge[]): SimDiagnostics {
  const neighborCount = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const g of gears) {
    neighborCount.set(g.id, 0);
    adjacency.set(g.id, []);
  }
  for (const e of edges) {
    neighborCount.set(e.a, (neighborCount.get(e.a) ?? 0) + 1);
    neighborCount.set(e.b, (neighborCount.get(e.b) ?? 0) + 1);
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }

  const unconnectedIds = gears.filter((g) => (neighborCount.get(g.id) ?? 0) === 0).map((g) => g.id);

  const poweredIds = new Set<string>();
  for (const crank of gears.filter((g) => g.type === "crank")) {
    if (poweredIds.has(crank.id)) continue;
    const queue = [crank.id];
    poweredIds.add(crank.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!poweredIds.has(next)) {
          poweredIds.add(next);
          queue.push(next);
        }
      }
    }
  }

  const noPowerIds = gears
    .filter((g) => (neighborCount.get(g.id) ?? 0) > 0 && !poweredIds.has(g.id))
    .map((g) => g.id);

  return { unconnectedIds, noPowerIds, overlapPairs: findOverlaps(gears) };
}
