import type { GearInstance, MeshEdge } from "./types";
import { POWER_SOURCE_TYPES } from "./gearDefs";

// Real, visible "did the power actually arrive, and how fast" output devices --
// deliberately excludes "load" (a burden marker, not something a user is trying
// to compare the speed of) and "bearing"/"track"/"belt"/"shaft" (drivetrain
// plumbing, not a terminal). Extending this list only ever needs to happen here.
const OUTPUT_TYPES = new Set<GearInstance["type"]>(["wheel", "fan", "rotor", "gauge"]);

export interface PowerPathEntry {
  sourceId: string;
  sourceType: GearInstance["type"];
  sourceAngularVelocity: number;
  outputId: string;
  outputType: GearInstance["type"];
  outputAngularVelocity: number;
  /** |output speed| / |source speed| -- this sandbox doesn't model torque or
   *  energy loss (friction, drag), so this net gear-ratio IS the only honest
   *  "efficiency" metric it can report: a build whose wheels/rotor end up at a
   *  higher ratio for the same crank speed is "geared for speed," a lower
   *  ratio is "geared for torque" (the usual real-world trade-off) -- letting
   *  two different assemblies be compared side by side. `null` when the
   *  source itself isn't spinning (nothing meaningful to divide by). */
  ratio: number | null;
}

function buildAdjacency(gears: GearInstance[], edges: MeshEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    adjacency.get(e.a)?.push(e.b);
    adjacency.get(e.b)?.push(e.a);
  }
  return adjacency;
}

/** For every power source (crank) in the assembly, lists every real output
 *  part (wheel/fan/rotor/gauge -- see OUTPUT_TYPES) reachable from it at all
 *  (via ANY edge, same reachability notion as graph.ts's classify -- an
 *  output only structurally, not rotationally, connected still shows up here,
 *  just with an honest near-zero ratio, since it reads its speed straight off
 *  the gear's own `angularVelocity`, already computed by propagateRotation).
 *  Two independent builds (e.g. two different toy cars) in the same scene
 *  each get their own entries, since each has its own crank -- letting the
 *  UI show them side by side for a direct efficiency comparison. */
export function computePowerPaths(gears: GearInstance[], edges: MeshEdge[]): PowerPathEntry[] {
  const adjacency = buildAdjacency(gears, edges);
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const entries: PowerPathEntry[] = [];

  for (const source of gears.filter((g) => POWER_SOURCE_TYPES.has(g.type))) {
    const visited = new Set<string>([source.id]);
    const queue = [source.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of visited) {
      if (id === source.id) continue;
      const gear = byId.get(id)!;
      if (!OUTPUT_TYPES.has(gear.type)) continue;
      const ratio = source.angularVelocity !== 0 ? Math.abs(gear.angularVelocity / source.angularVelocity) : null;
      entries.push({
        sourceId: source.id,
        sourceType: source.type,
        sourceAngularVelocity: source.angularVelocity,
        outputId: gear.id,
        outputType: gear.type,
        outputAngularVelocity: gear.angularVelocity,
        ratio,
      });
    }
  }
  return entries;
}
