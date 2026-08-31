import type { GearInstance, MeshEdge, RemoteLink, SimDiagnostics } from "./types";
import { evaluatePair, isOverlapping, pitchRadius } from "./meshing";
import { buildDirectedAdjacency } from "./adjacency";

export function buildEdges(gears: GearInstance[], remoteLinks: RemoteLink[] = []): MeshEdge[] {
  const edges: MeshEdge[] = [];
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const edge = evaluatePair(gears[i], gears[j]);
      if (edge) edges.push(edge);
    }
  }
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  for (const link of remoteLinks) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue; // a linked gear was deleted -- drop the stale link rather than crash
    const ratio = link.kind === "chain" ? a.teeth / b.teeth : pitchRadius(a) / pitchRadius(b);
    edges.push({ a: a.id, b: b.id, kind: link.kind, ratio, oneWay: "none" });
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
  // Raw physical connectivity -- how many edges touch each gear, regardless of
  // direction. Deliberately direction-independent: a gear with SOME edge (even the
  // blocked side of a one-way mesh) has a real physical connection, so it's never
  // "unconnected," only possibly "no-power."
  const neighborCount = new Map<string, number>();
  for (const g of gears) neighborCount.set(g.id, 0);
  for (const e of edges) {
    neighborCount.set(e.a, (neighborCount.get(e.a) ?? 0) + 1);
    neighborCount.set(e.b, (neighborCount.get(e.b) ?? 0) + 1);
  }

  const unconnectedIds = gears.filter((g) => (neighborCount.get(g.id) ?? 0) === 0).map((g) => g.id);

  // Power reachability, by contrast, IS a directed question: can a gear actually
  // receive power from some crank via a path power can flow along? Walk the same
  // directed adjacency `propagateRotation` itself drives real angular velocities
  // through, so this diagnostic can never drift from what actually spins.
  const directedAdjacency = buildDirectedAdjacency(gears, edges);
  const poweredIds = new Set<string>();
  for (const crank of gears.filter((g) => g.type === "crank")) {
    if (poweredIds.has(crank.id)) continue;
    const queue = [crank.id];
    poweredIds.add(crank.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of directedAdjacency.get(cur) ?? []) {
        const next = edge.a === cur ? edge.b : edge.a;
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
