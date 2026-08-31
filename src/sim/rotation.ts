import type { GearInstance, MeshEdge } from "./types";
import { pitchRadius } from "./meshing";

export interface RotationResult {
  angularVelocities: Map<string, number>;
  linearVelocities: Map<string, number>; // "rack" gears only; 0 for everything else
}

export function propagateRotation(gears: GearInstance[], edges: MeshEdge[]): RotationResult {
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const angularVelocities = new Map<string, number>();
  const linearVelocities = new Map<string, number>();
  for (const g of gears) {
    angularVelocities.set(g.id, g.type === "crank" ? g.angularVelocity : 0);
    linearVelocities.set(g.id, 0);
  }

  const adjacency = new Map<string, MeshEdge[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    if (e.oneWay !== "bToA") adjacency.get(e.a)!.push(e);
    if (e.oneWay !== "aToB") adjacency.get(e.b)!.push(e);
  }

  // Roots are picked purely by `type === "crank"` -- never by "already has a nonzero
  // angularVelocity" -- because a crank's speed is the one independent INPUT in this
  // model; every other gear's speed is an OUTPUT the BFS below derives. Walking the
  // `gears` filter in array order also fixes what happens if two cranks end up coupled
  // into the same connected component (a plausible user mistake, e.g. meshing two
  // cranks together): the first crank encountered here is still unvisited, so it always
  // wins the outer loop and BFS's across the whole component -- including any OTHER
  // crank(s) inside it, which get walked into as ordinary neighbors below and have their
  // own commanded angularVelocity silently overwritten (see the `angularVelocities.set`
  // inside the loop). By the time the outer loop reaches that second crank, it's already
  // `visited` and gets skipped, so it never gets its own BFS turn. Net effect: deterministic
  // (whichever crank sits earlier in `gears` wins as sole driver), not undefined or
  // random -- but silent, with no diagnostic raised anywhere for the discarded crank's
  // input. See tests/sim/rotation.test.ts's "two cranks coupled into one connected
  // component" suite for the confirmed behavior in both array orders.
  const visited = new Set<string>();
  for (const crank of gears.filter((g) => g.type === "crank" && !g.broken)) {
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
        const sign = edge.kind === "coupling" || edge.kind === "chain" || edge.kind === "belt" ? 1 : -1;
        const ratio = isForward ? edge.ratio : 1 / edge.ratio;
        if (other.type === "rack") {
          const driver = byId.get(cur)!;
          linearVelocities.set(otherId, curSpeed * pitchRadius(driver) * (isForward ? 1 : -1));
        } else {
          angularVelocities.set(otherId, curSpeed * sign * ratio);
        }
        visited.add(otherId);
        queue.push(otherId);
      }
    }
  }

  return { angularVelocities, linearVelocities };
}
