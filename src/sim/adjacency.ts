import type { GearInstance, MeshEdge } from "./types";

/** Directed mesh adjacency: `adjacency.get(id)` holds every edge along which `id` can
 *  actually DRIVE its neighbor, respecting `oneWay` -- a bidirectional edge
 *  (`oneWay: "none"`) is added to both sides, but a one-way edge (worm/rack/ratchet)
 *  is added only to the side that can drive.
 *
 *  Shared by `propagateRotation` (rotation.ts), which walks it outward from each crank
 *  to compute real angular velocities, and `classify`'s `noPowerIds` diagnostic
 *  (graph.ts), which walks it outward from each crank to find which gears can actually
 *  receive power. Both need the exact same directed-reachability rule; splitting it into
 *  two copies is what let them drift apart before (classify's copy used to build a
 *  symmetric, direction-blind adjacency instead, so it could miss a gear that's only
 *  reachable through the blocked side of a one-way mesh -- see tests/sim/graph.test.ts's
 *  "flags a gear reachable from a crank only through the blocked side..." case). */
export function buildDirectedAdjacency(gears: GearInstance[], edges: MeshEdge[]): Map<string, MeshEdge[]> {
  const adjacency = new Map<string, MeshEdge[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    if (e.oneWay !== "bToA") adjacency.get(e.a)!.push(e);
    if (e.oneWay !== "aToB") adjacency.get(e.b)!.push(e);
  }
  return adjacency;
}
