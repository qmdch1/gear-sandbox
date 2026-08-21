import type { GearInstance } from "./types";
import { buildEdges } from "./graph";
import { idealConnectionDistance } from "./meshing";

/** Resizing one gear (the size slider in main.ts) changes its `module` -- but
 *  two gears can only actually mesh via teeth if they share the SAME module
 *  (real gears with mismatched tooth pitch simply can't interlock, same "if
 *  it doesn't work in real life, it shouldn't work in the sim" principle as
 *  everywhere else here). Left alone, resizing just one gear in an existing
 *  mesh chain would silently break every mesh it was part of. Instead, this
 *  propagates the SAME new module out through every gear connected via an
 *  actual tooth mesh ("mesh"-kind edges only -- a coincident coupling, like a
 *  load/gauge/fan/wheel riding on a shaft, or a structural beam joint, never
 *  needs matching module, since there's no interlocking teeth involved there
 *  at all), and repositions each affected gear to the new correct meshing
 *  distance from whichever neighbor it was reached through, preserving the
 *  angle between them so the overall layout keeps its shape, just rescaled.
 *
 *  Does NOT re-run tooth-phase alignment (meshPhaseAlignment) -- the teeth
 *  end up at the right DISTANCE, meshing correctly, but not necessarily
 *  perfectly centered tooth-to-gap right after a resize; left as a follow-up
 *  refinement rather than blocking this on it. Repositions each gear relative
 *  to whichever meshed neighbor reaches it FIRST in the breadth-first walk
 *  out from the resized gear -- for the common case (a simple chain or tree
 *  of meshing gears) every pairwise distance ends up correct, but a genuine
 *  CYCLE in the mesh graph (e.g. three idler gears all meshing in a ring) is
 *  an over-constrained layout problem a single BFS pass can't fully solve;
 *  accepted as a rare-case simplification rather than building a real
 *  constraint solver for it. Mutates `gears` in place, matching this
 *  codebase's existing mutation style (main.ts's onMove, etc.). */
export function resizeConnectedMeshGroup(anchorId: string, newModule: number, gears: GearInstance[]): void {
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const anchor = byId.get(anchorId);
  if (!anchor) return;

  // Build the mesh graph from the CURRENT (pre-resize) state first -- who's
  // actually meshed with whom depends on center distance vs. pitch radius,
  // so mutating the anchor's module before this would make evaluatePair
  // decide it no longer meshes with anything at its old distance, losing
  // the very connectivity this function needs to propagate through.
  const edges = buildEdges(gears);
  const meshAdjacency = new Map<string, typeof edges>();
  for (const g of gears) meshAdjacency.set(g.id, []);
  for (const edge of edges) {
    if (edge.kind !== "mesh") continue;
    meshAdjacency.get(edge.a)!.push(edge);
    meshAdjacency.get(edge.b)!.push(edge);
  }

  anchor.module = newModule;

  const visited = new Set([anchorId]);
  const queue = [anchorId];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    const cur = byId.get(curId)!;
    for (const edge of meshAdjacency.get(curId) ?? []) {
      const otherId = edge.a === curId ? edge.b : edge.a;
      if (visited.has(otherId)) continue;
      visited.add(otherId);
      const other = byId.get(otherId)!;

      // Keep the current angle from `cur` to `other` (in the ground-plane XZ
      // projection) -- only the DISTANCE needs to change to match the new
      // module, not the direction, so the train's overall shape stays intact.
      const dx = other.position[0] - cur.position[0];
      const dz = other.position[2] - cur.position[2];
      const angle = Math.atan2(dz, dx);

      other.module = newModule;
      const idealDistance = idealConnectionDistance(cur, other);
      if (idealDistance !== null) {
        other.position = [
          cur.position[0] + idealDistance * Math.cos(angle),
          other.position[1],
          cur.position[2] + idealDistance * Math.sin(angle),
        ];
      }

      queue.push(otherId);
    }
  }
}
