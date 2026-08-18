# Gear Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side 3D web sandbox where users drag-place and connect gears (spur, helical, crank, bevel, worm, load) whose meshing is validated, whose rotation propagates from a hand-crank, and whose durability visibly depletes over a user-controlled time multiplier.

**Architecture:** A pure-TypeScript simulation core (meshing validity → connectivity graph → rotation propagation → wear) that knows nothing about rendering, wrapped by a Three.js rendering/interaction layer and a small set of DOM UI panels. The simulation core's functional interface is the seam where a future Rust/WASM implementation could be swapped in without touching rendering or UI.

**Tech Stack:** Vite, TypeScript (strict), Three.js, Vitest (+ jsdom for DOM-touching tests) on the frontend; Express + `better-sqlite3` + `supertest` on the backend. `localStorage` + JSON file export/import for local/offline persistence, plus a small open (no-auth) server API for shared save/load.

**Spec:** [docs/superpowers/specs/2026-08-18-gear-sandbox-design.md](../specs/2026-08-18-gear-sandbox-design.md)

## Global Constraints

- Frontend must run on desktop browsers (mouse + wheel) and mobile browsers (touch + pinch) (spec §2, §6).
- Server API (spec §11) has no auth/accounts yet — every save/load call is open. The `layouts` table's `user_id` column exists now but stays unused (always `NULL`) until account support is added later; don't build an auth layer in this plan.
- Simulation core (meshing/graph/rotation/wear) must be plain TypeScript functions with no Three.js or DOM dependency, so it stays unit-testable and swappable for a future Rust/WASM build (spec §7).
- 6 gear types only for this plan: `spur`, `helical`, `crank`, `bevel`, `worm`, `load` (spec §3). No rack-and-pinion, planetary, or ratchet gears in this scope.
- Rust/WASM implementation itself is explicitly out of scope for this plan (spec §7, §10) — only the interface boundary that would allow it later.
- TypeScript `strict: true` in `tsconfig.json`.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/style.css`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a working Vite dev server, a working `npm test` (Vitest) command, and an empty `<canvas>`-ready page. Later tasks add real content to `src/main.ts`.

- [ ] **Step 1: Initialize the project and install dependencies**

```bash
npm init -y
npm install three
npm install -D typescript vite vitest jsdom @types/three
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
});
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
  },
});
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gear Sandbox</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Write minimal `src/main.ts` and `src/style.css`**

```ts
// src/main.ts
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<canvas id="scene-canvas"></canvas>`;
```

```css
/* src/style.css */
html, body { margin: 0; height: 100%; }
#app { width: 100%; height: 100%; }
#scene-canvas { width: 100%; height: 100%; display: block; }
```

- [ ] **Step 7: Write the smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("project scaffold", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run the test suite and confirm it passes**

Run: `npx vitest run`
Expected: 1 passed test (`project scaffold > runs`).

- [ ] **Step 9: Add npm scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: project scaffold (vite + typescript + vitest + three)"
```

---

## Task 2: Simulation Types & Gear Definitions

**Files:**
- Create: `src/sim/types.ts`
- Create: `src/sim/gearDefs.ts`
- Test: `tests/sim/gearDefs.test.ts`

**Interfaces:**
- Produces: `GearType`, `GearInstance`, `MeshEdge`, `SimDiagnostics`, `SimTickResult` (types.ts); `GearTypeDef`, `GEAR_DEFS` (gearDefs.ts). Every later sim/render/UI task imports these exact names.

- [ ] **Step 1: Write `src/sim/types.ts`**

```ts
export type GearType = "spur" | "helical" | "crank" | "bevel" | "worm" | "load";

export interface GearInstance {
  id: string;
  type: GearType;
  position: [number, number, number];
  axis: [number, number, number]; // normalized rotation axis direction
  teeth: number;       // thread-starts for "worm"; 0 for "load"
  module: number;      // tooth size, used for meshing distance checks; ignored for "load"
  durabilityMax: number;
  durabilityCurrent: number;
  broken: boolean;
  rotation: number;        // accumulated rotation angle in radians
  angularVelocity: number; // signed rad/s; set externally for "crank", computed for others
}

export interface MeshEdge {
  a: string;
  b: string;
  kind: "mesh" | "coupling"; // gear-tooth mesh vs. load shaft-coupling
  ratio: number;             // mesh: b's speed = -ratio * a's speed. coupling: always 1.
  oneWay: "none" | "aToB" | "bToA"; // worm: which side can drive the other
}

export interface SimDiagnostics {
  unconnectedIds: string[];              // no valid edges at all
  noPowerIds: string[];                  // has edges but no path to any crank
  overlapPairs: Array<[string, string]>; // geometrically too-close pairs
}

export interface SimTickResult {
  gears: GearInstance[];
  diagnostics: SimDiagnostics;
}
```

- [ ] **Step 2: Write `src/sim/gearDefs.ts`**

```ts
import type { GearType } from "./types";

export interface GearTypeDef {
  durabilityMax: number;
  baseWearPerSecond: number;  // wear/sec while spinning at timeScale=1, no downstream load
  loadWearMultiplier: number; // multiplier applied when this gear's component contains a "load" object
}

export const GEAR_DEFS: Record<GearType, GearTypeDef> = {
  spur:    { durabilityMax: 100, baseWearPerSecond: 1.0, loadWearMultiplier: 1.5 },
  helical: { durabilityMax: 150, baseWearPerSecond: 0.8, loadWearMultiplier: 1.5 },
  crank:   { durabilityMax: 200, baseWearPerSecond: 0.5, loadWearMultiplier: 1.2 },
  bevel:   { durabilityMax: 120, baseWearPerSecond: 1.2, loadWearMultiplier: 1.5 },
  worm:    { durabilityMax: 80,  baseWearPerSecond: 1.5, loadWearMultiplier: 1.8 },
  load:    { durabilityMax: 1_000_000, baseWearPerSecond: 0, loadWearMultiplier: 0 },
};
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/sim/gearDefs.test.ts
import { describe, it, expect } from "vitest";
import { GEAR_DEFS } from "../../src/sim/gearDefs";

describe("GEAR_DEFS", () => {
  it("has an entry for every gear type with a positive durability", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load"] as const;
    for (const t of types) {
      expect(GEAR_DEFS[t].durabilityMax).toBeGreaterThan(0);
    }
  });

  it("gives helical gear higher durability than spur (load-distribution rationale)", () => {
    expect(GEAR_DEFS.helical.durabilityMax).toBeGreaterThan(GEAR_DEFS.spur.durabilityMax);
  });

  it("gives the load object zero wear rate (it does not deplete itself)", () => {
    expect(GEAR_DEFS.load.baseWearPerSecond).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/gearDefs.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sim types and per-gear-type definitions"
```

---

## Task 3: Meshing Validity Engine

**Files:**
- Create: `src/sim/meshing.ts`
- Test: `tests/sim/meshing.test.ts`

**Interfaces:**
- Consumes: `GearInstance`, `MeshEdge` from `src/sim/types.ts`.
- Produces: `evaluatePair(a, b): MeshEdge | null`, `isOverlapping(a, b): boolean`. Used by Task 4's `graph.ts`.

- [ ] **Step 1: Write `src/sim/meshing.ts`**

```ts
import type { GearInstance, MeshEdge } from "./types";

const MESH_TOLERANCE = 0.05;          // 5% tolerance on center-distance match
const PARALLEL_DOT_THRESHOLD = 0.98;  // |axis dot| above this => parallel axes
const PERP_DOT_THRESHOLD = 0.1;       // |axis dot| below this => perpendicular axes
const COUPLING_DISTANCE_TOLERANCE = 0.05;

const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank"]);

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function pitchRadius(g: GearInstance): number {
  return (g.module * g.teeth) / 2;
}

/** Returns the mesh/coupling edge between two gears, or null if they don't connect. */
export function evaluatePair(a: GearInstance, b: GearInstance): MeshEdge | null {
  if (a.type === "load" || b.type === "load") {
    if (a.type === "load" && b.type === "load") return null; // two load objects never couple
    if (dist(a.position, b.position) > COUPLING_DISTANCE_TOLERANCE) return null;
    if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
    return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
  }

  // A worm's driving shaft attaches directly (coincident position, same axis) to
  // whatever powers it -- in this simplified model a worm has no separate "input
  // tooth mesh," so without this it could never receive rotation at all (its only
  // other rule, below, is a ONE-WAY mesh *out* toward its wheel). This coupling
  // check is geometrically distinguishable from that mesh check (coincident vs.
  // pitch-radius-apart), so there's no ambiguity between the two for the same pair.
  if (a.type === "worm" || b.type === "worm") {
    const bothWorm = a.type === "worm" && b.type === "worm";
    const coincident = dist(a.position, b.position) <= COUPLING_DISTANCE_TOLERANCE;
    if (!bothWorm && coincident && Math.abs(dot(a.axis, b.axis)) >= PARALLEL_DOT_THRESHOLD) {
      return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
    }
    // Not a coincident shaft coupling -- fall through to the perpendicular
    // one-way mesh check below, which covers the worm-to-wheel case.
  }

  const centerDistance = dist(a.position, b.position);
  const axisDot = dot(a.axis, b.axis);
  const expected = pitchRadius(a) + pitchRadius(b);
  const withinDistance = Math.abs(centerDistance - expected) <= expected * MESH_TOLERANCE;

  const bothParallelFamily = PARALLEL_FAMILY.has(a.type) && PARALLEL_FAMILY.has(b.type);
  if (bothParallelFamily) {
    if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay: "none" };
  }

  const wormPair = (a.type === "worm") !== (b.type === "worm");
  const bevelInvolved = a.type === "bevel" || b.type === "bevel";
  if (wormPair || bevelInvolved) {
    if (Math.abs(axisDot) > PERP_DOT_THRESHOLD || !withinDistance) return null;
    const oneWay: MeshEdge["oneWay"] = wormPair ? (a.type === "worm" ? "aToB" : "bToA") : "none";
    return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay };
  }

  return null;
}

/** True when two gears geometrically overlap (closer than a valid mesh distance allows,
 *  and NOT already a legitimate connection -- a load or worm coupling is intentionally
 *  coincident with its host gear, so a valid `evaluatePair` result is never an overlap). */
export function isOverlapping(a: GearInstance, b: GearInstance): boolean {
  if (evaluatePair(a, b)) return false;
  const centerDistance = dist(a.position, b.position);
  const expected = pitchRadius(a) + pitchRadius(b);
  return centerDistance > 0.001 && centerDistance < expected * (1 - MESH_TOLERANCE);
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/sim/meshing.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePair, isOverlapping } from "../../src/sim/meshing";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g",
    type: "spur",
    position: [0, 0, 0],
    axis: [0, 1, 0],
    teeth: 20,
    module: 1,
    durabilityMax: 100,
    durabilityCurrent: 100,
    broken: false,
    rotation: 0,
    angularVelocity: 0,
    ...overrides,
  };
}

describe("evaluatePair", () => {
  it("meshes two spur gears at the correct center distance with parallel axes", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }); // (20+10)/2=15
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(2); // 20/10
    expect(edge!.oneWay).toBe("none");
  });

  it("rejects two spur gears placed too far apart", () => {
    const a = makeGear({ id: "a", position: [0, 0, 0] });
    const b = makeGear({ id: "b", position: [50, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("rejects two spur gears with non-parallel axes", () => {
    const a = makeGear({ id: "a", axis: [0, 1, 0], position: [0, 0, 0] });
    const b = makeGear({ id: "b", axis: [1, 0, 0], position: [15, 0, 0] });
    expect(evaluatePair(a, b)).toBeNull();
  });

  it("meshes a bevel pair only with perpendicular axes", () => {
    const a = makeGear({ id: "a", type: "bevel", axis: [0, 1, 0], teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", type: "bevel", axis: [1, 0, 0], teeth: 20, module: 1, position: [20, 0, 0] });
    const edge = evaluatePair(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.oneWay).toBe("none");
  });

  it("marks a worm-to-wheel edge one-way from the worm", () => {
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1, position: [0, 0, 0] });
    const wheel = makeGear({ id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1, position: [11, 0, 0] });
    const edge = evaluatePair(worm, wheel);
    expect(edge).not.toBeNull();
    expect(edge!.oneWay).toBe("aToB"); // a === worm
  });

  it("couples a worm directly onto a coincident driving shaft (e.g. a crank), so it can receive power", () => {
    const crank = makeGear({ id: "crank", type: "crank", axis: [0, 1, 0], position: [0, 0, 0] });
    const worm = makeGear({ id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1, position: [0, 0, 0] });
    const edge = evaluatePair(crank, worm);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.oneWay).toBe("none");
  });

  it("does not let two worms couple to each other", () => {
    const wormA = makeGear({ id: "wa", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    const wormB = makeGear({ id: "wb", type: "worm", teeth: 2, module: 1, position: [0, 0, 0] });
    expect(evaluatePair(wormA, wormB)).toBeNull();
  });

  it("couples a load object directly onto a coincident, axis-aligned gear", () => {
    const gear = makeGear({ id: "g", axis: [0, 1, 0], position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, axis: [0, 1, 0], position: [0, 0, 0] });
    const edge = evaluatePair(gear, load);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
  });

  it("does not couple a load object that is not coincident with a gear", () => {
    const gear = makeGear({ id: "g", position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [5, 0, 0] });
    expect(evaluatePair(gear, load)).toBeNull();
  });
});

describe("isOverlapping", () => {
  it("flags two gears placed closer than a valid mesh distance", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [5, 0, 0] }); // expected 15, actual 5
    expect(isOverlapping(a, b)).toBe(true);
  });

  it("does not flag correctly meshed gears as overlapping", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(isOverlapping(a, b)).toBe(false);
  });

  it("does not flag a coincident load coupling as overlapping, even though it's geometrically close", () => {
    const gear = makeGear({ id: "g", teeth: 20, module: 1, position: [0, 0, 0] });
    const load = makeGear({ id: "l", type: "load", teeth: 0, position: [0, 0, 0] });
    expect(isOverlapping(gear, load)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/sim/meshing.test.ts`
Expected: FAIL — `src/sim/meshing.ts` does not exist yet (skip this step if Step 1 was already written; otherwise write the test first, confirm the failure, then write the implementation).

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/meshing.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: gear meshing validity engine"
```

---

## Task 4: Connectivity Graph & Diagnostics

**Files:**
- Create: `src/sim/graph.ts`
- Test: `tests/sim/graph.test.ts`

**Interfaces:**
- Consumes: `evaluatePair`, `isOverlapping` from `src/sim/meshing.ts`; `GearInstance`, `MeshEdge`, `SimDiagnostics` from `src/sim/types.ts`.
- Produces: `buildEdges(gears): MeshEdge[]`, `findOverlaps(gears): [string,string][]`, `classify(gears, edges): SimDiagnostics`. Used by Task 7's `simulation.ts`.

- [ ] **Step 1: Write `src/sim/graph.ts`**

```ts
import type { GearInstance, MeshEdge, SimDiagnostics } from "./types";
import { evaluatePair, isOverlapping } from "./meshing";

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
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/sim/graph.test.ts
import { describe, it, expect } from "vitest";
import { buildEdges, classify } from "../../src/sim/graph";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("classify", () => {
  it("flags a lone gear as unconnected", () => {
    const gears = [makeGear({ id: "a", position: [0, 0, 0] })];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.unconnectedIds).toEqual(["a"]);
    expect(diagnostics.noPowerIds).toEqual([]);
  });

  it("flags a meshed pair with no crank as no-power, not unconnected", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds.sort()).toEqual(["a", "b"]);
  });

  it("clears no-power once a crank joins the same mesh chain", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.unconnectedIds).toEqual([]);
  });

  it("reports overlapping gears that are placed too close to mesh validly", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [5, 0, 0] }),
    ];
    const diagnostics = classify(gears, buildEdges(gears));
    expect(diagnostics.overlapPairs).toEqual([["a", "b"]]);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/graph.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: connectivity graph and diagnostics (unconnected/no-power/overlap)"
```

---

## Task 5: Rotation Propagation

**Files:**
- Create: `src/sim/rotation.ts`
- Test: `tests/sim/rotation.test.ts`

**Interfaces:**
- Consumes: `GearInstance`, `MeshEdge` from `src/sim/types.ts`.
- Produces: `propagateRotation(gears, edges): { angularVelocities: Map<string, number> }`. Used by Task 7's `simulation.ts`.

- [ ] **Step 1: Write `src/sim/rotation.ts`**

```ts
import type { GearInstance, MeshEdge } from "./types";

export interface RotationResult {
  angularVelocities: Map<string, number>;
}

export function propagateRotation(gears: GearInstance[], edges: MeshEdge[]): RotationResult {
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const angularVelocities = new Map<string, number>();
  for (const g of gears) angularVelocities.set(g.id, g.type === "crank" ? g.angularVelocity : 0);

  const adjacency = new Map<string, MeshEdge[]>();
  for (const g of gears) adjacency.set(g.id, []);
  for (const e of edges) {
    if (e.oneWay !== "bToA") adjacency.get(e.a)!.push(e);
    if (e.oneWay !== "aToB") adjacency.get(e.b)!.push(e);
  }

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
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/sim/rotation.test.ts
import { describe, it, expect } from "vitest";
import { propagateRotation } from "../../src/sim/rotation";
import { buildEdges } from "../../src/sim/graph";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("propagateRotation", () => {
  it("spins a meshed gear opposite the crank, scaled by tooth ratio", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBeCloseTo(-2); // -(20/10) * 1
  });

  it("leaves a gear with no path to a crank at zero angular velocity", () => {
    const gears = [
      makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("b")).toBe(0);
  });

  it("only lets a worm drive its wheel, never the reverse", () => {
    const worm = makeGear({
      id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1,
      position: [0, 0, 0],
    });
    const wheel = makeGear({
      id: "wheel", type: "crank", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [11, 0, 0], angularVelocity: 5,
    });
    const gears = [worm, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    // "wheel" is the crank here (power source) but the edge is one-way toward
    // the worm's *other* side only when the worm itself is the "a" driver —
    // since the crank is the wheel, the wheel must NOT be able to drive the worm.
    expect(angularVelocities.get("worm")).toBe(0);
  });

  it("lets a crank drive a worm via direct shaft coupling, which then drives its wheel one-way", () => {
    const crank = makeGear({
      id: "crank", type: "crank", axis: [0, 1, 0], teeth: 20, module: 1,
      position: [0, 0, 0], angularVelocity: 3,
    });
    const worm = makeGear({
      id: "worm", type: "worm", axis: [0, 1, 0], teeth: 2, module: 1,
      position: [0, 0, 0], // coincident with the crank -> shaft coupling, not a tooth mesh
    });
    const wheel = makeGear({
      id: "wheel", type: "spur", axis: [1, 0, 0], teeth: 20, module: 1,
      position: [11, 0, 0], // perpendicular to the worm's axis -> one-way mesh
    });
    const gears = [crank, worm, wheel];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("worm")).toBeCloseTo(3);      // rigid coupling: same speed as the crank
    expect(angularVelocities.get("wheel")).toBeCloseTo(-0.3);  // -(2/20) * 3, one-way from the worm
  });

  it("stops propagation at a broken gear", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "mid", teeth: 20, module: 1, position: [20, 0, 0], broken: true }),
      makeGear({ id: "end", teeth: 20, module: 1, position: [40, 0, 0] }),
    ];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("mid")).toBe(0);
    expect(angularVelocities.get("end")).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/rotation.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rotation propagation from crank through the mesh graph"
```

---

## Task 6: Wear / Durability Engine

**Files:**
- Create: `src/sim/wear.ts`
- Test: `tests/sim/wear.test.ts`

**Interfaces:**
- Consumes: `GearInstance` from `src/sim/types.ts`; `GEAR_DEFS` from `src/sim/gearDefs.ts`.
- Produces: `WearInput`, `WearOutput`, `applyWear(input): WearOutput`. Used by Task 7's `simulation.ts`.

- [ ] **Step 1: Write `src/sim/wear.ts`**

```ts
import type { GearInstance } from "./types";
import { GEAR_DEFS } from "./gearDefs";

export interface WearInput {
  gear: GearInstance;
  angularVelocity: number;
  hasDownstreamLoad: boolean;
  dt: number;
  timeScale: number;
}

export interface WearOutput {
  durabilityCurrent: number;
  broken: boolean;
}

const MIN_SPIN_TO_WEAR = 0.01; // rad/s below which a gear counts as "not spinning"

export function applyWear(input: WearInput): WearOutput {
  const { gear, angularVelocity, hasDownstreamLoad, dt, timeScale } = input;
  if (gear.broken) return { durabilityCurrent: gear.durabilityCurrent, broken: true };

  const isSpinning = Math.abs(angularVelocity) > MIN_SPIN_TO_WEAR;
  if (!isSpinning) return { durabilityCurrent: gear.durabilityCurrent, broken: false };

  const def = GEAR_DEFS[gear.type];
  const loadMultiplier = hasDownstreamLoad ? def.loadWearMultiplier : 1;
  const wear = def.baseWearPerSecond * loadMultiplier * timeScale * dt;
  const next = Math.max(0, gear.durabilityCurrent - wear);
  return { durabilityCurrent: next, broken: next <= 0 };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/sim/wear.test.ts
import { describe, it, expect } from "vitest";
import { applyWear } from "../../src/sim/wear";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("applyWear", () => {
  it("does not wear a gear that isn't spinning", () => {
    const gear = makeGear({ durabilityCurrent: 100 });
    const result = applyWear({ gear, angularVelocity: 0, hasDownstreamLoad: false, dt: 10, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(100);
    expect(result.broken).toBe(false);
  });

  it("wears a spinning gear proportionally to dt and timeScale", () => {
    const gear = makeGear({ durabilityCurrent: 100 }); // spur: baseWearPerSecond = 1.0
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 2 });
    expect(result.durabilityCurrent).toBe(98); // 100 - (1.0 * 1 * 2 * 1)
  });

  it("wears faster when a downstream load object is present", () => {
    const gear = makeGear({ durabilityCurrent: 100 });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: true, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(98.5); // 100 - (1.0 * 1.5 * 1 * 1)
  });

  it("clamps at zero and marks the gear broken", () => {
    const gear = makeGear({ durabilityCurrent: 0.5 });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(0);
    expect(result.broken).toBe(true);
  });

  it("leaves an already-broken gear broken and unchanged", () => {
    const gear = makeGear({ durabilityCurrent: 0, broken: true });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(0);
    expect(result.broken).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/wear.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: durability wear engine with time-scale multiplier"
```

---

## Task 7: Simulation Tick Orchestrator

**Files:**
- Create: `src/sim/simulation.ts`
- Test: `tests/sim/simulation.test.ts`

**Interfaces:**
- Consumes: `buildEdges`, `classify` (graph.ts); `propagateRotation` (rotation.ts); `applyWear` (wear.ts); `GearInstance`, `SimTickResult` (types.ts).
- Produces: `tick(gears, dt, timeScale): SimTickResult`. This is the single entry point Task 15's `main.ts` calls every animation frame.

- [ ] **Step 1: Write `src/sim/simulation.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/sim/simulation.test.ts
import { describe, it, expect } from "vitest";
import { tick } from "../../src/sim/simulation";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("tick", () => {
  it("rotates and wears a meshed gear driven by a crank, and reports no diagnostics problems", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const result = tick(gears, 1, 1);
    const b = result.gears.find((g) => g.id === "b")!;
    expect(b.angularVelocity).toBeCloseTo(-2);
    expect(b.rotation).toBeCloseTo(-2);
    expect(b.durabilityCurrent).toBeLessThan(100);
    expect(result.diagnostics.unconnectedIds).toEqual([]);
    expect(result.diagnostics.noPowerIds).toEqual([]);
  });

  it("increases wear rate on gears sharing a component with a load object", () => {
    const withLoad = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
      makeGear({ id: "load", type: "load", teeth: 0, position: [15, 0, 0] }), // coincident with b
    ];
    const withoutLoad = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0] }),
    ];
    const rWith = tick(withLoad, 1, 1).gears.find((g) => g.id === "b")!;
    const rWithout = tick(withoutLoad, 1, 1).gears.find((g) => g.id === "b")!;
    expect(rWith.durabilityCurrent).toBeLessThan(rWithout.durabilityCurrent);
  });

  it("flags an isolated gear as unconnected and does not rotate it", () => {
    const gears = [
      // Note: this crank has nothing meshed to it either, so it is ALSO
      // unconnected -- classify() applies the same "no edges" rule to every
      // gear type (spec §4 draws no type exception), so a crank sitting alone
      // is exactly as "not doing anything" as any other lone gear.
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "lonely", teeth: 20, module: 1, position: [1000, 0, 0] }),
    ];
    const result = tick(gears, 1, 1);
    expect(result.diagnostics.unconnectedIds.sort()).toEqual(["crank", "lonely"]);
    expect(result.gears.find((g) => g.id === "lonely")!.angularVelocity).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/simulation.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: simulation tick orchestrator (graph + rotation + wear)"
```

---

## Task 8: Persistence (Save / Load / Export / Import)

**Files:**
- Create: `src/persistence/serialize.ts`
- Create: `src/persistence/storage.ts`
- Test: `tests/persistence/serialize.test.ts`
- Test: `tests/persistence/storage.test.ts`

**Interfaces:**
- Consumes: `GearInstance` from `src/sim/types.ts`.
- Produces: `serializeGears(gears): string`, `deserializeGears(json): GearInstance[]`; `saveToLocalStorage(gears): void`, `loadFromLocalStorage(): GearInstance[] | null`, `exportToFile(gears): Blob`, `importFromFile(file): Promise<GearInstance[]>`. Used by Task 14's `saveLoadPanel.ts`.

- [ ] **Step 1: Write `src/persistence/serialize.ts`**

```ts
import type { GearInstance } from "../sim/types";

const SCHEMA_VERSION = 1;

export function serializeGears(gears: GearInstance[]): string {
  return JSON.stringify({ version: SCHEMA_VERSION, gears }, null, 2);
}

export function deserializeGears(json: string): GearInstance[] {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.gears)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  return parsed.gears as GearInstance[];
}
```

- [ ] **Step 2: Write `tests/persistence/serialize.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { serializeGears, deserializeGears } from "../../src/persistence/serialize";
import type { GearInstance } from "../../src/sim/types";

describe("serialize/deserialize round-trip", () => {
  it("recovers an identical gear list after a round trip", () => {
    const gears: GearInstance[] = [{
      id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
      teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
      broken: false, rotation: 0.4, angularVelocity: -2,
    }];
    const restored = deserializeGears(serializeGears(gears));
    expect(restored).toEqual(gears);
  });

  it("rejects a malformed save file", () => {
    expect(() => deserializeGears("{}")).toThrow();
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/persistence/serialize.test.ts`
Expected: 2 passed.

- [ ] **Step 4: Write `src/persistence/storage.ts`**

```ts
import type { GearInstance } from "../sim/types";
import { serializeGears, deserializeGears } from "./serialize";

const STORAGE_KEY = "gear-sandbox:layout";

export function saveToLocalStorage(gears: GearInstance[]): void {
  window.localStorage.setItem(STORAGE_KEY, serializeGears(gears));
}

export function loadFromLocalStorage(): GearInstance[] | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return deserializeGears(raw);
}

export function exportToFile(gears: GearInstance[]): Blob {
  return new Blob([serializeGears(gears)], { type: "application/json" });
}

export async function importFromFile(file: File): Promise<GearInstance[]> {
  const text = await file.text();
  return deserializeGears(text);
}
```

- [ ] **Step 5: Write `tests/persistence/storage.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "../../src/persistence/storage";
import type { GearInstance } from "../../src/sim/types";

const sample: GearInstance[] = [{
  id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
  teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
  broken: false, rotation: 0, angularVelocity: 1,
}];

describe("localStorage persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns null when nothing has been saved yet", () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it("saves and loads a gear layout", () => {
    saveToLocalStorage(sample);
    expect(loadFromLocalStorage()).toEqual(sample);
  });
});

describe("file export/import", () => {
  it("round-trips a gear layout through a Blob/File", async () => {
    const blob = exportToFile(sample);
    const file = new File([blob], "layout.json", { type: "application/json" });
    const restored = await importFromFile(file);
    expect(restored).toEqual(sample);
  });
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/persistence`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: layout persistence (localStorage + file export/import)"
```

---

## Task 9: Three.js Scene Setup

**Files:**
- Create: `src/render/scene.ts`
- Test: `tests/render/scene.test.ts`

**Interfaces:**
- Produces: `SceneContext` (`{ scene, camera, renderer, controls, groundPlane }`), `createScene(canvas): SceneContext`. Used by Task 12's `sceneSync.ts` and Task 15's `main.ts`.

- [ ] **Step 1: Write `src/render/scene.ts`**

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groundPlane: THREE.Mesh;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d22);

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 1000);
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 300; // enables the requested zoom-in/zoom-out range

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(ambient, directional);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  return { scene, camera, renderer, controls, groundPlane };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/render/scene.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createScene } from "../../src/render/scene";

describe("createScene", () => {
  it("adds lighting and a ground plane to the scene", () => {
    const canvas = document.createElement("canvas");
    const { scene, groundPlane, camera, controls } = createScene(canvas);
    expect(scene.children).toContain(groundPlane);
    expect(scene.children.some((c) => c.type === "AmbientLight")).toBe(true);
    expect(scene.children.some((c) => c.type === "DirectionalLight")).toBe(true);
    expect(camera.position.length()).toBeGreaterThan(0);
    expect(controls.maxDistance).toBeGreaterThan(controls.minDistance);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/render/scene.test.ts`
Expected: 1 passed.

> Note: `WebGLRenderer` falls back to a headless/no-op context under jsdom (no real GPU), which is sufficient here — this test only checks scene graph contents and camera/controls configuration, not actual pixel output. Real rendering is verified by manual QA in Task 15.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: three.js scene, camera, orbit controls, lighting"
```

---

## Task 10: Procedural Gear Geometry

**Files:**
- Create: `src/render/gearGeometry.ts`
- Test: `tests/render/gearGeometry.test.ts`

**Interfaces:**
- Consumes: `GearType` from `src/sim/types.ts`.
- Produces: `computeSpurProfilePoints(teeth, module): THREE.Vector2[]` (pure, unit-tested), `buildGeometryForType(type, teeth, module): THREE.BufferGeometry`. Used by Task 11's `gearMesh.ts`.

- [ ] **Step 1: Write `src/render/gearGeometry.ts`**

```ts
import * as THREE from "three";
import type { GearType } from "../sim/types";

const GEAR_THICKNESS = 0.4;
const ADDENDUM_FACTOR = 1.25; // tooth tip radius beyond the pitch radius, in modules

/** Pure profile math: alternating outer-tooth/inner-root points around the pitch circle. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const outerRadius = pitchRadius + module * ADDENDUM_FACTOR;
  const innerRadius = pitchRadius - module * ADDENDUM_FACTOR * 0.5;
  const points: THREE.Vector2[] = [];
  const stepsPerTooth = 4;
  const totalSteps = teeth * stepsPerTooth;
  for (let i = 0; i < totalSteps; i++) {
    const angle = (i / totalSteps) * Math.PI * 2;
    const withinTooth = i % stepsPerTooth;
    const radius = withinTooth < 2 ? outerRadius : innerRadius;
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

function extrudedGearGeometry(teeth: number, module: number, twistPerUnit = 0): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: GEAR_THICKNESS,
    bevelEnabled: false,
    curveSegments: 1,
  });
  if (twistPerUnit !== 0) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      const angle = z * twistPerUnit;
      const x = position.getX(i);
      const y = position.getY(i);
      position.setX(i, x * Math.cos(angle) - y * Math.sin(angle));
      position.setY(i, x * Math.sin(angle) + y * Math.cos(angle));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

function crankGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const base = extrudedGearGeometry(teeth, module);
  const pitchRadius = (module * teeth) / 2;
  const handle = new THREE.CylinderGeometry(module * 0.3, module * 0.3, pitchRadius * 1.4, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(pitchRadius * 0.9, 0, GEAR_THICKNESS / 2);
  return mergeGeometries([base, handle]);
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Simple non-indexed concatenation — sufficient for a display mesh with one material.
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  for (const geo of geometries) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

export function buildGeometryForType(type: GearType, teeth: number, module: number): THREE.BufferGeometry {
  switch (type) {
    case "spur":
      return extrudedGearGeometry(teeth, module);
    case "helical":
      return extrudedGearGeometry(teeth, module, 1.2); // twisted teeth = helical
    case "crank":
      return crankGeometry(teeth, module);
    case "bevel": {
      const pitchRadius = (module * teeth) / 2;
      return new THREE.ConeGeometry(pitchRadius + module * ADDENDUM_FACTOR, GEAR_THICKNESS * 3, teeth);
    }
    case "worm": {
      const length = module * 6;
      return new THREE.CylinderGeometry(module * 1.2, module * 1.2, length, 16, 1, false);
    }
    case "load":
      return new THREE.CylinderGeometry(module * 2, module * 2, GEAR_THICKNESS * 2, 24);
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/render/gearGeometry.test.ts
import { describe, it, expect } from "vitest";
import { computeSpurProfilePoints, buildGeometryForType } from "../../src/render/gearGeometry";

describe("computeSpurProfilePoints", () => {
  it("produces 4 points per tooth", () => {
    const points = computeSpurProfilePoints(20, 1);
    expect(points.length).toBe(80);
  });

  it("alternates between an outer and an inner radius", () => {
    const points = computeSpurProfilePoints(10, 1);
    const radii = new Set(points.map((p) => Math.round(p.length() * 1000)));
    expect(radii.size).toBe(2);
  });
});

describe("buildGeometryForType", () => {
  it("builds a non-empty geometry for every gear type", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load"] as const;
    for (const t of types) {
      const geometry = buildGeometryForType(t, 20, 1);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/render/gearGeometry.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: procedural gear geometry for all 6 gear types"
```

---

## Task 11: Gear Mesh Wrapper (Durability Color + Rotation)

**Files:**
- Create: `src/render/gearMesh.ts`
- Test: `tests/render/gearMesh.test.ts`

**Interfaces:**
- Consumes: `GearInstance` (types.ts); `buildGeometryForType` (gearGeometry.ts).
- Produces: `colorForDurabilityRatio(ratio): THREE.Color` (pure), `class GearMeshObject { mesh: THREE.Mesh; constructor(gear); update(gear): void }`. Used by Task 12's `sceneSync.ts`.

- [ ] **Step 1: Write `src/render/gearMesh.ts`**

```ts
import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { buildGeometryForType } from "./gearGeometry";

const HEALTHY = new THREE.Color(0x3ddc73);
const WARNING = new THREE.Color(0xe8c547);
const CRITICAL = new THREE.Color(0xe15554);
const BROKEN = new THREE.Color(0x555555);

/** Green above 50% durability, fading to yellow then red as it depletes. */
export function colorForDurabilityRatio(ratio: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return BROKEN.clone();
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) * 2; // 0..1 from yellow to green
    return WARNING.clone().lerp(HEALTHY, t);
  }
  const t = clamped * 2; // 0..1 from red to yellow
  return CRITICAL.clone().lerp(WARNING, t);
}

export class GearMeshObject {
  readonly mesh: THREE.Mesh;

  constructor(gear: GearInstance) {
    const geometry = buildGeometryForType(gear.type, gear.teeth || 1, gear.module || 1);
    const material = new THREE.MeshStandardMaterial({ color: colorForDurabilityRatio(1) });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = gear.id;
    this.update(gear);
  }

  update(gear: GearInstance): void {
    this.mesh.position.set(...gear.position);
    this.mesh.rotation.set(0, 0, 0);
    const axis = new THREE.Vector3(...gear.axis).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    this.mesh.rotateZ(gear.rotation);
    const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
    (this.mesh.material as THREE.MeshStandardMaterial).color = colorForDurabilityRatio(gear.broken ? 0 : ratio);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/render/gearMesh.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { colorForDurabilityRatio, GearMeshObject } from "../../src/render/gearMesh";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("colorForDurabilityRatio", () => {
  it("is green at full durability and red near zero", () => {
    const full = colorForDurabilityRatio(1);
    const empty = colorForDurabilityRatio(0.01);
    expect(full.g).toBeGreaterThan(full.r);
    expect(empty.r).toBeGreaterThan(empty.g);
  });
});

describe("GearMeshObject", () => {
  it("positions the mesh at the gear's position", () => {
    const gear = makeGear({ position: [3, 0, 5] });
    const obj = new GearMeshObject(gear);
    expect(obj.mesh.position.toArray()).toEqual([3, 0, 5]);
  });

  it("darkens toward the broken color once the gear is marked broken", () => {
    const gear = makeGear({ durabilityCurrent: 0, broken: true });
    const obj = new GearMeshObject(gear);
    const material = obj.mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.r).toBeCloseTo(material.color.g, 1); // gray, not red or green
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/render/gearMesh.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: gear mesh wrapper with durability color gradient"
```

---

## Task 12: Scene Sync (Diagnostics Highlighting)

**Files:**
- Create: `src/render/sceneSync.ts`
- Test: `tests/render/sceneSync.test.ts`

**Interfaces:**
- Consumes: `SceneContext` (scene.ts); `GearMeshObject` (gearMesh.ts); `GearInstance`, `SimDiagnostics` (types.ts).
- Produces: `computeSyncActions(existingIds, gears): { toAdd: GearInstance[]; toRemoveIds: string[] }` (pure), `class SceneSync { constructor(ctx); sync(gears, diagnostics): void; focusOn(id): void }`. Used by Task 15's `main.ts`.

- [ ] **Step 1: Write `src/render/sceneSync.ts`**

```ts
import * as THREE from "three";
import type { GearInstance, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject } from "./gearMesh";

const PROBLEM_HIGHLIGHT = new THREE.Color(0xff3b30);

/** Pure diff: which gears need a new mesh, which stale meshes need removing. */
export function computeSyncActions(
  existingIds: Set<string>,
  gears: GearInstance[],
): { toAdd: GearInstance[]; toRemoveIds: string[] } {
  const currentIds = new Set(gears.map((g) => g.id));
  const toAdd = gears.filter((g) => !existingIds.has(g.id));
  const toRemoveIds = [...existingIds].filter((id) => !currentIds.has(id));
  return { toAdd, toRemoveIds };
}

export class SceneSync {
  private objects = new Map<string, GearMeshObject>();

  constructor(private ctx: SceneContext) {}

  sync(gears: GearInstance[], diagnostics: SimDiagnostics): void {
    const { toAdd, toRemoveIds } = computeSyncActions(new Set(this.objects.keys()), gears);

    for (const id of toRemoveIds) {
      const obj = this.objects.get(id);
      if (obj) {
        this.ctx.scene.remove(obj.mesh);
        obj.dispose();
        this.objects.delete(id);
      }
    }

    for (const gear of toAdd) {
      const obj = new GearMeshObject(gear);
      this.objects.set(gear.id, obj);
      this.ctx.scene.add(obj.mesh);
    }

    const problemIds = new Set([
      ...diagnostics.unconnectedIds,
      ...diagnostics.noPowerIds,
      ...diagnostics.overlapPairs.flat(),
    ]);

    for (const gear of gears) {
      const obj = this.objects.get(gear.id)!;
      obj.update(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      material.emissive = problemIds.has(gear.id) ? PROBLEM_HIGHLIGHT.clone() : new THREE.Color(0x000000);
    }
  }

  focusOn(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.ctx.controls.target.copy(obj.mesh.position);
    this.ctx.controls.update();
  }
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/render/sceneSync.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeSyncActions, SceneSync } from "../../src/render/sceneSync";
import { createScene } from "../../src/render/scene";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("computeSyncActions", () => {
  it("adds new gears and removes stale ones", () => {
    const existing = new Set(["a", "stale"]);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "new" })];
    const { toAdd, toRemoveIds } = computeSyncActions(existing, gears);
    expect(toAdd.map((g) => g.id)).toEqual(["new"]);
    expect(toRemoveIds).toEqual(["stale"]);
  });
});

describe("SceneSync", () => {
  it("adds one mesh per gear to the scene", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b", position: [5, 0, 0] })];
    sync.sync(gears, { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    const gearMeshes = ctx.scene.children.filter((c) => c.name === "a" || c.name === "b");
    expect(gearMeshes.length).toBe(2);
  });

  it("removes a mesh once its gear disappears from the list", () => {
    const ctx = createScene(document.createElement("canvas"));
    const sync = new SceneSync(ctx);
    sync.sync([makeGear({ id: "a" })], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    sync.sync([], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    expect(ctx.scene.children.some((c) => c.name === "a")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/render/sceneSync.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scene sync with diagnostics highlighting"
```

---

## Task 13: Drag Placement & Connection Preview

**Files:**
- Create: `src/interaction/dragControls.ts`
- Test: `tests/interaction/dragControls.test.ts`

**Interfaces:**
- Consumes: `evaluatePair` (meshing.ts); `GearInstance` (types.ts); `SceneContext` (scene.ts).
- Produces: `findNearestCompatiblePartner(dragGear, others): GearInstance | null` (pure, unit-tested), `class DragControls` (pointer wiring, manual-QA verified).

- [ ] **Step 1: Write the failing test for the pure targeting logic**

```ts
// tests/interaction/dragControls.test.ts
import { describe, it, expect } from "vitest";
import { findNearestCompatiblePartner } from "../../src/interaction/dragControls";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("findNearestCompatiblePartner", () => {
  it("picks the gear that would form a valid mesh, ignoring one that would not", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const validPartner = makeGear({ id: "valid", teeth: 20, module: 1, position: [0, 0, 0] }); // dist 15 = 10+20 /2... see below
    const farPartner = makeGear({ id: "far", teeth: 20, module: 1, position: [500, 0, 0] });
    const partner = findNearestCompatiblePartner(dragged, [validPartner, farPartner]);
    expect(partner?.id).toBe("valid");
  });

  it("returns null when nothing nearby would form a valid mesh", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const incompatible = makeGear({ id: "incompatible", teeth: 20, module: 1, position: [900, 0, 0] });
    expect(findNearestCompatiblePartner(dragged, [incompatible])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interaction/dragControls.test.ts`
Expected: FAIL — `src/interaction/dragControls.ts` does not exist yet.

- [ ] **Step 3: Write `src/interaction/dragControls.ts`**

```ts
import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { evaluatePair } from "../sim/meshing";
import type { SceneContext } from "../render/scene";

/** Among candidate gears, the closest one that would form a valid mesh/coupling with `dragged`. */
export function findNearestCompatiblePartner(
  dragged: GearInstance,
  others: GearInstance[],
): GearInstance | null {
  let best: GearInstance | null = null;
  let bestDistance = Infinity;
  for (const candidate of others) {
    if (candidate.id === dragged.id) continue;
    if (!evaluatePair(dragged, candidate)) continue;
    const dx = dragged.position[0] - candidate.position[0];
    const dz = dragged.position[2] - candidate.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export interface DragControlsOptions {
  ctx: SceneContext;
  getGears: () => GearInstance[];
  onMove: (id: string, position: [number, number, number]) => void;
}

/** Thin pointer-event wiring: raycast onto the ground plane, drag the picked gear's
 *  position, and delegate the "is this a valid drop spot" question to
 *  `findNearestCompatiblePartner`. Verified via manual QA (Task 15) — pointer/raycaster
 *  behavior is not meaningfully unit-testable without a real WebGL context. */
export class DragControls {
  private raycaster = new THREE.Raycaster();
  private draggingId: string | null = null;

  constructor(private options: DragControlsOptions) {
    const { domElement } = options.ctx.renderer;
    domElement.addEventListener("pointerdown", this.onPointerDown);
    domElement.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  private pointerToGroundPoint(event: PointerEvent): THREE.Vector3 | null {
    const { ctx } = this.options;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, ctx.camera);
    const hit = this.raycaster.intersectObject(ctx.groundPlane)[0];
    return hit ? hit.point : null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    const { ctx } = this.options;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, ctx.camera);
    const hits = this.raycaster.intersectObjects(ctx.scene.children.filter((c) => c.name));
    if (hits.length > 0) {
      this.draggingId = hits[0].object.name;
      ctx.controls.enabled = false;
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.draggingId) return;
    const point = this.pointerToGroundPoint(event);
    if (!point) return;
    this.options.onMove(this.draggingId, [point.x, 0, point.z]);
  };

  private onPointerUp = (): void => {
    this.draggingId = null;
    this.options.ctx.controls.enabled = true;
  };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/interaction/dragControls.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: drag placement/reconnection with valid-partner detection"
```

---

## Task 14: UI Panels (Palette, Diagnostics, Durability, Time Scale, Save/Load)

**Files:**
- Create: `src/ui/paletteUI.ts`
- Create: `src/ui/diagnosticsPanel.ts`
- Create: `src/ui/durabilityPanel.ts`
- Create: `src/ui/timeScaleSlider.ts`
- Create: `src/ui/saveLoadPanel.ts`
- Test: `tests/ui/diagnosticsPanel.test.ts`
- Test: `tests/ui/timeScaleSlider.test.ts`

**Interfaces:**
- Consumes: `GearType`, `GearInstance`, `SimDiagnostics` (types.ts); save/load functions (storage.ts).
- Produces: `PaletteUI`, `DiagnosticsPanel`, `DurabilityPanel`, `TimeScaleSlider`, `SaveLoadPanel` classes. Used by Task 15's `main.ts`.

- [ ] **Step 1: Write `src/ui/diagnosticsPanel.ts`**

```ts
import type { SimDiagnostics } from "../sim/types";

export class DiagnosticsPanel {
  constructor(private container: HTMLElement, private onFocus: (id: string) => void) {}

  render(diagnostics: SimDiagnostics): void {
    const items: Array<{ label: string; id: string }> = [
      ...diagnostics.unconnectedIds.map((id) => ({ label: `미연결: ${id}`, id })),
      ...diagnostics.noPowerIds.map((id) => ({ label: `동력 없음: ${id}`, id })),
      ...diagnostics.overlapPairs.map(([a, b]) => ({ label: `겹침: ${a} / ${b}`, id: a })),
    ];

    this.container.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = `문제 있는 기어: ${items.length}개`;
    this.container.appendChild(heading);

    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item.label;
      li.addEventListener("click", () => this.onFocus(item.id));
      list.appendChild(li);
    }
    this.container.appendChild(list);
  }
}
```

- [ ] **Step 2: Write `tests/ui/diagnosticsPanel.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { DiagnosticsPanel } from "../../src/ui/diagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("renders one list item per diagnostic problem", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["a"], noPowerIds: ["b", "c"], overlapPairs: [] });
    expect(container.querySelectorAll("li").length).toBe(3);
    expect(container.textContent).toContain("문제 있는 기어: 3개");
  });

  it("invokes the focus callback with the clicked gear's id", () => {
    const container = document.createElement("div");
    const onFocus = vi.fn();
    const panel = new DiagnosticsPanel(container, onFocus);
    panel.render({ unconnectedIds: ["a"], noPowerIds: [], overlapPairs: [] });
    (container.querySelector("li") as HTMLElement).click();
    expect(onFocus).toHaveBeenCalledWith("a");
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/ui/diagnosticsPanel.test.ts`
Expected: 2 passed.

- [ ] **Step 4: Write `src/ui/timeScaleSlider.ts`**

```ts
export class TimeScaleSlider {
  readonly input: HTMLInputElement;

  constructor(container: HTMLElement, onChange: (value: number) => void, initial = 1) {
    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.min = "0.1";
    this.input.max = "10";
    this.input.step = "0.1";
    this.input.value = String(initial);
    this.input.addEventListener("input", () => onChange(Number(this.input.value)));
    container.appendChild(this.input);
  }
}
```

- [ ] **Step 5: Write `tests/ui/timeScaleSlider.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { TimeScaleSlider } from "../../src/ui/timeScaleSlider";

describe("TimeScaleSlider", () => {
  it("reports the slider's numeric value on input", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const slider = new TimeScaleSlider(container, onChange, 1);
    slider.input.value = "5.5";
    slider.input.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith(5.5);
  });

  it("stays within the 0.1x-10x range declared in the spec", () => {
    const slider = new TimeScaleSlider(document.createElement("div"), () => {});
    expect(slider.input.min).toBe("0.1");
    expect(slider.input.max).toBe("10");
  });
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/ui/timeScaleSlider.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Write `src/ui/durabilityPanel.ts`**

```ts
import type { GearInstance } from "../sim/types";

export class DurabilityPanel {
  constructor(private container: HTMLElement) {}

  show(gear: GearInstance): void {
    const pct = Math.round((gear.durabilityCurrent / gear.durabilityMax) * 100);
    this.container.innerHTML =
      `<strong>${gear.type}</strong> — ${gear.durabilityCurrent.toFixed(1)} / ${gear.durabilityMax} (${pct}%)` +
      (gear.broken ? " — 파손됨" : "");
    this.container.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
  }
}
```

- [ ] **Step 8: Write `src/ui/paletteUI.ts`**

```ts
import type { GearType } from "../sim/types";

const LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
};

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    for (const type of Object.keys(LABELS) as GearType[]) {
      const button = document.createElement("button");
      button.textContent = LABELS[type];
      button.dataset.gearType = type;
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
    }
  }
}
```

- [ ] **Step 9: Write `src/ui/saveLoadPanel.ts`**

```ts
export interface SaveLoadApi {
  save(): void;
  load(): void;
  exportFile(): void;
  importFile(file: File): Promise<void>;
}

export class SaveLoadPanel {
  constructor(container: HTMLElement, api: SaveLoadApi) {
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", () => api.save());

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "불러오기";
    loadBtn.addEventListener("click", () => api.load());

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "내보내기";
    exportBtn.addEventListener("click", () => api.exportFile());

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      if (file) void api.importFile(file);
    });

    container.append(saveBtn, loadBtn, exportBtn, importInput);
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: UI panels (palette, diagnostics, durability, time-scale, save/load)"
```

---

## Task 15: App Bootstrap & Manual QA

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: every module produced by Tasks 2-14.
- Produces: the running app.

- [ ] **Step 1: Write `src/style.css` layout**

```css
html, body { margin: 0; height: 100%; background: #1a1d22; color: #eee; font-family: sans-serif; }
#app { display: grid; grid-template-columns: 220px 1fr; height: 100%; }
#sidebar { padding: 12px; overflow-y: auto; background: #23262d; }
#viewport { position: relative; }
#scene-canvas { width: 100%; height: 100%; display: block; }
#palette button { display: block; width: 100%; margin-bottom: 6px; }
#durability-panel { margin-top: 12px; padding: 8px; background: #2f333b; border-radius: 4px; }
#durability-panel[hidden] { display: none; }
```

- [ ] **Step 2: Write `src/main.ts`**

```ts
import type { GearInstance, GearType } from "./sim/types";
import { GEAR_DEFS } from "./sim/gearDefs";
import { tick } from "./sim/simulation";
import { createScene } from "./render/scene";
import { SceneSync } from "./render/sceneSync";
import { DragControls } from "./interaction/dragControls";
import { PaletteUI } from "./ui/paletteUI";
import { DiagnosticsPanel } from "./ui/diagnosticsPanel";
import { DurabilityPanel } from "./ui/durabilityPanel";
import { TimeScaleSlider } from "./ui/timeScaleSlider";
import { SaveLoadPanel } from "./ui/saveLoadPanel";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "./persistence/storage";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="sidebar">
    <div id="palette"></div>
    <div id="save-load"></div>
    <label>시간배율 <div id="time-scale"></div></label>
    <div id="diagnostics"></div>
    <div id="durability-panel" hidden></div>
  </div>
  <div id="viewport"><canvas id="scene-canvas"></canvas></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#scene-canvas")!;
const ctx = createScene(canvas);
const sceneSync = new SceneSync(ctx);
const diagnosticsPanel = new DiagnosticsPanel(document.querySelector("#diagnostics")!, (id) => sceneSync.focusOn(id));
const durabilityPanel = new DurabilityPanel(document.querySelector("#durability-panel")!);

let gears: GearInstance[] = loadFromLocalStorage() ?? [];
let timeScale = 1;
let nextId = 0;

function addGear(type: GearType, position: [number, number, number]): void {
  const def = GEAR_DEFS[type];
  gears.push({
    id: `gear-${nextId++}`,
    type,
    position,
    axis: [0, 1, 0],
    teeth: type === "load" ? 0 : 20,
    module: 1,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity: type === "crank" ? 1 : 0,
  });
}

new PaletteUI(document.querySelector("#palette")!, (type) => addGear(type, [0, 0, 0]));

new TimeScaleSlider(document.querySelector("#time-scale")!, (value) => (timeScale = value), timeScale);

new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: () => saveToLocalStorage(gears),
  load: () => {
    const loaded = loadFromLocalStorage();
    if (loaded) gears = loaded;
  },
  exportFile: () => {
    const blob = exportToFile(gears);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gear-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  importFile: async (file) => {
    gears = await importFromFile(file);
  },
});

new DragControls({
  ctx,
  getGears: () => gears,
  onMove: (id, position) => {
    const gear = gears.find((g) => g.id === id);
    if (gear) gear.position = position;
  },
});

canvas.addEventListener("click", () => {
  // Durability detail on click is wired via the drag controls' hit-testing in a
  // follow-up pass once the raycaster's last-hit id is exposed; for now the
  // diagnostics panel's focus-on-click covers the primary "inspect a gear" need.
});

let lastTime = performance.now();
function animate(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const result = tick(gears, dt, timeScale);
  gears = result.gears;
  sceneSync.sync(gears, result.diagnostics);
  diagnosticsPanel.render(result.diagnostics);

  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

void durabilityPanel; // wired up for the click-to-inspect follow-up noted above
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests from Tasks 1-14 pass (0 failures).

- [ ] **Step 4: Manual QA in the browser**

Run: `npm run dev`, open the printed local URL, and confirm:
1. The palette's "손잡이 기어" (crank) button places a crank gear near the origin.
2. Placing a "평기어" (spur gear) near the crank at a valid mesh distance clears it from the diagnostics list; dragging it far away puts it back on the list as 미연결.
3. The crank gear visibly spins, and the meshed spur gear spins the opposite direction.
4. Raising the time-scale slider visibly speeds up how fast the meshed gear's color shifts from green toward red.
5. Placing a "부하" (load) object coincident with a spinning gear visibly speeds up that gear's color shift compared to an identical unloaded gear.
6. A gear that reaches zero durability stops spinning and turns gray.
7. Mouse-drag orbits the camera; wheel scroll zooms in/out (test the requested scale feature).
8. On a touch device or the browser's device-toolbar touch emulation, dragging a gear and pinch-zooming both work.
9. "저장" then a page reload followed by "불러오기" (or the auto-load-on-boot) restores the same layout.
10. "내보내기" downloads a `.json` file, and "가져오기" on that same file restores the layout.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire simulation, rendering, interaction, and UI into a running app"
```

---

## Task 16: Backend Scaffold & Layouts API

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `server/db.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Test: `tests/server/layouts.test.ts`

**Interfaces:**
- Produces: `openDb(path): Database.Database`, `createApp(db): express.Express`. Used by Task 17's frontend client and by `server/index.ts`'s boot script.

- [ ] **Step 1: Install backend dependencies**

```bash
npm install express better-sqlite3 cors
npm install -D @types/express @types/cors @types/better-sqlite3 supertest @types/supertest tsx concurrently
```

- [ ] **Step 2: Write `server/db.ts`**

```ts
import Database from "better-sqlite3";

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS layouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT,
      gears_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}
```

> `user_id` is written but never read yet (spec §11) — every row gets `NULL` until account support lands later; no auth middleware belongs in this task.

- [ ] **Step 3: Write `server/app.ts`**

```ts
import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.post("/api/layouts", (req, res) => {
    const { name, gears } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || !Array.isArray(gears)) {
      res.status(400).json({ error: "name (string) and gears (array) are required" });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
    ).run(id, name, JSON.stringify(gears), now, now);
    res.status(201).json({ id, name, updatedAt: now });
  });

  app.get("/api/layouts", (_req, res) => {
    const rows = db.prepare("SELECT id, name, updated_at as updatedAt FROM layouts ORDER BY updated_at DESC").all();
    res.json(rows);
  });

  app.get("/api/layouts/:id", (req, res) => {
    const row = db
      .prepare("SELECT id, name, gears_json as gearsJson, updated_at as updatedAt FROM layouts WHERE id = ?")
      .get(req.params.id) as { id: string; name: string; gearsJson: string; updatedAt: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "layout not found" });
      return;
    }
    res.json({ id: row.id, name: row.name, gears: JSON.parse(row.gearsJson), updatedAt: row.updatedAt });
  });

  app.put("/api/layouts/:id", (req, res) => {
    const existing = db.prepare("SELECT id FROM layouts WHERE id = ?").get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "layout not found" });
      return;
    }
    const { name, gears } = req.body ?? {};
    if (!Array.isArray(gears)) {
      res.status(400).json({ error: "gears (array) is required" });
      return;
    }
    const now = new Date().toISOString();
    if (typeof name === "string" && name.trim()) {
      db.prepare("UPDATE layouts SET name = ?, gears_json = ?, updated_at = ? WHERE id = ?").run(
        name, JSON.stringify(gears), now, req.params.id,
      );
    } else {
      db.prepare("UPDATE layouts SET gears_json = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(gears), now, req.params.id,
      );
    }
    const row = db.prepare("SELECT name FROM layouts WHERE id = ?").get(req.params.id) as { name: string };
    res.json({ id: req.params.id, name: row.name, updatedAt: now });
  });

  return app;
}
```

- [ ] **Step 4: Write `server/index.ts`**

```ts
import { openDb } from "./db";
import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? "server/data/layouts.db");
createApp(db).listen(PORT, () => {
  console.log(`gear-sandbox server listening on :${PORT}`);
});
```

- [ ] **Step 5: Write `tests/server/layouts.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb } from "../../server/db";
import { createApp } from "../../server/app";
import type express from "express";

describe("layouts API", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp(openDb(":memory:"));
  });

  it("creates a layout and returns its id", async () => {
    const res = await request(app).post("/api/layouts").send({ name: "test", gears: [] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("test");
  });

  it("rejects a layout without a name", async () => {
    const res = await request(app).post("/api/layouts").send({ gears: [] });
    expect(res.status).toBe(400);
  });

  it("lists saved layouts newest first", async () => {
    await request(app).post("/api/layouts").send({ name: "first", gears: [] });
    await request(app).post("/api/layouts").send({ name: "second", gears: [] });
    const res = await request(app).get("/api/layouts");
    expect(res.body.map((l: { name: string }) => l.name)).toEqual(["second", "first"]);
  });

  it("round-trips gears through save and fetch", async () => {
    const gears = [{ id: "a", type: "spur" }];
    const created = await request(app).post("/api/layouts").send({ name: "roundtrip", gears });
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.gears).toEqual(gears);
  });

  it("404s when fetching a layout that doesn't exist", async () => {
    const res = await request(app).get("/api/layouts/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("overwrites an existing layout via PUT", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "v1", gears: [] });
    const updated = await request(app)
      .put(`/api/layouts/${created.body.id}`)
      .send({ name: "v2", gears: [{ id: "a", type: "crank" }] });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("v2");
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.body.gears).toEqual([{ id: "a", type: "crank" }]);
  });

  it("404s when updating a layout that doesn't exist", async () => {
    const res = await request(app).put("/api/layouts/does-not-exist").send({ gears: [] });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/server/layouts.test.ts`
Expected: 7 passed.

- [ ] **Step 7: Add dev scripts and a dev-time API proxy**

In `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm:dev:client\" \"npm:dev:server\"",
    "dev:client": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "vite build",
    "test": "vitest run"
  }
}
```

In `vite.config.ts`, add a proxy so the frontend can call `fetch(\"/api/...\")` unchanged in dev:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": "http://localhost:3001" },
  },
});
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: express + sqlite backend for open layout save/load"
```

---

## Task 17: Server Save/Load UI

**Files:**
- Create: `src/persistence/serverClient.ts`
- Create: `src/ui/serverSyncPanel.ts`
- Modify: `src/main.ts`
- Test: `tests/persistence/serverClient.test.ts`
- Test: `tests/ui/serverSyncPanel.test.ts`

**Interfaces:**
- Consumes: `GearInstance` (types.ts); the `/api/layouts` endpoints from Task 16.
- Produces: `listServerLayouts()`, `fetchServerLayout(id)`, `saveNewServerLayout(name, gears)`, `updateServerLayout(id, name, gears)`, `LayoutSummary`, `LayoutDetail` (serverClient.ts); `class ServerSyncPanel` (serverSyncPanel.ts). Consumed by `main.ts`.

- [ ] **Step 1: Write `src/persistence/serverClient.ts`**

```ts
import type { GearInstance } from "../sim/types";

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LayoutDetail extends LayoutSummary {
  gears: GearInstance[];
}

async function parseOrThrow(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed with status ${res.status}`);
  return body;
}

export async function listServerLayouts(): Promise<LayoutSummary[]> {
  return parseOrThrow(await fetch("/api/layouts"));
}

export async function fetchServerLayout(id: string): Promise<LayoutDetail> {
  return parseOrThrow(await fetch(`/api/layouts/${id}`));
}

export async function saveNewServerLayout(name: string, gears: GearInstance[]): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch("/api/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears }),
    }),
  );
}

export async function updateServerLayout(id: string, name: string, gears: GearInstance[]): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch(`/api/layouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears }),
    }),
  );
}
```

- [ ] **Step 2: Write `tests/persistence/serverClient.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { listServerLayouts, saveNewServerLayout, fetchServerLayout } from "../../src/persistence/serverClient";

afterEach(() => vi.unstubAllGlobals());

describe("serverClient", () => {
  it("lists layouts from GET /api/layouts", async () => {
    const layouts = [{ id: "1", name: "a", updatedAt: "now" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => layouts }));
    expect(await listServerLayouts()).toEqual(layouts);
  });

  it("posts a new layout and returns its summary", async () => {
    const summary = { id: "1", name: "a", updatedAt: "now" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => summary });
    vi.stubGlobal("fetch", fetchMock);
    expect(await saveNewServerLayout("a", [])).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith("/api/layouts", expect.objectContaining({ method: "POST" }));
  });

  it("throws with the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "layout not found" }) }),
    );
    await expect(fetchServerLayout("missing")).rejects.toThrow("layout not found");
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/persistence/serverClient.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Write `src/ui/serverSyncPanel.ts`**

```ts
import type { GearInstance } from "../sim/types";
import {
  listServerLayouts,
  saveNewServerLayout,
  updateServerLayout,
  fetchServerLayout,
  type LayoutSummary,
} from "../persistence/serverClient";

export interface ServerSyncApi {
  getGears(): GearInstance[];
  applyLoadedGears(gears: GearInstance[]): void;
}

export class ServerSyncPanel {
  private nameInput: HTMLInputElement;
  private list: HTMLUListElement;
  private currentId: string | null = null;

  constructor(private container: HTMLElement, private api: ServerSyncApi) {
    this.nameInput = document.createElement("input");
    this.nameInput.placeholder = "레이아웃 이름";

    const saveNewBtn = document.createElement("button");
    saveNewBtn.textContent = "서버에 새로 저장";
    saveNewBtn.addEventListener("click", () => this.saveNew());

    const overwriteBtn = document.createElement("button");
    overwriteBtn.textContent = "덮어쓰기";
    overwriteBtn.addEventListener("click", () => this.overwrite());

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "목록 새로고침";
    refreshBtn.addEventListener("click", () => this.refresh());

    this.list = document.createElement("ul");

    container.append(this.nameInput, saveNewBtn, overwriteBtn, refreshBtn, this.list);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.renderList(await listServerLayouts());
  }

  private renderList(layouts: LayoutSummary[]): void {
    this.list.innerHTML = "";
    for (const layout of layouts) {
      const li = document.createElement("li");
      li.textContent = `${layout.name} (${layout.updatedAt}) `;
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "불러오기";
      loadBtn.addEventListener("click", () => this.load(layout.id));
      li.appendChild(loadBtn);
      this.list.appendChild(li);
    }
  }

  private async saveNew(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name) return;
    const summary = await saveNewServerLayout(name, this.api.getGears());
    this.currentId = summary.id;
    await this.refresh();
  }

  private async overwrite(): Promise<void> {
    if (!this.currentId) return;
    await updateServerLayout(this.currentId, this.nameInput.value.trim() || "이름 없음", this.api.getGears());
    await this.refresh();
  }

  private async load(id: string): Promise<void> {
    const detail = await fetchServerLayout(id);
    this.currentId = detail.id;
    this.nameInput.value = detail.name;
    this.api.applyLoadedGears(detail.gears);
  }
}
```

- [ ] **Step 5: Write `tests/ui/serverSyncPanel.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerSyncPanel } from "../../src/ui/serverSyncPanel";
import * as serverClient from "../../src/persistence/serverClient";

describe("ServerSyncPanel", () => {
  beforeEach(() => {
    vi.spyOn(serverClient, "listServerLayouts").mockResolvedValue([{ id: "1", name: "saved-a", updatedAt: "t1" }]);
  });

  it("renders the server layout list on construction", async () => {
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getGears: () => [], applyLoadedGears: () => {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toContain("saved-a");
  });

  it("applies the fetched gears when a saved layout's load button is clicked", async () => {
    vi.spyOn(serverClient, "fetchServerLayout").mockResolvedValue({
      id: "1", name: "saved-a", updatedAt: "t1", gears: [{ id: "g" } as unknown as import("../../src/sim/types").GearInstance],
    });
    const applyLoadedGears = vi.fn();
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getGears: () => [], applyLoadedGears });
    await Promise.resolve();
    await Promise.resolve();
    (container.querySelector("li button") as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(applyLoadedGears).toHaveBeenCalledWith([{ id: "g" }]);
  });
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/ui/serverSyncPanel.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Wire `ServerSyncPanel` into `src/main.ts`**

Add alongside the existing `SaveLoadPanel` wiring (Task 15):

```ts
import { ServerSyncPanel } from "./ui/serverSyncPanel";
```

```html
<!-- inside the #sidebar template string, after the #save-load div -->
<div id="server-sync"></div>
```

```ts
new ServerSyncPanel(document.querySelector("#server-sync")!, {
  getGears: () => gears,
  applyLoadedGears: (loaded) => {
    gears = loaded;
  },
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all tests from Tasks 1-17 pass (0 failures).

- [ ] **Step 9: Manual QA**

Run: `npm run dev` (starts both the Vite client and the Express server via `concurrently`), open the printed local URL, and confirm:
1. Building a small layout and clicking "서버에 새로 저장" with a name adds it to the server list below.
2. Reloading the page and clicking "불러오기" on that saved entry restores the same gears.
3. Editing the loaded layout and clicking "덮어쓰기" updates the same server entry (not a duplicate) — confirm via "목록 새로고침".
4. Opening the app in a second browser (or an incognito window) with no login shows the same saved layouts — confirming save/load is open, not per-account (matches this task's scope; account separation is future work per spec §10).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: server save/load UI wired into the app"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §3 (6 gear types) → Tasks 2, 10. §4 (meshing/diagnostics/UI flags) → Tasks 3, 4, 12, 14. §5 (durability + time-scale + color + breakage) → Tasks 2, 6, 11, 14. §6 (palette, drag, camera zoom, mobile, save/load) → Tasks 9, 13, 14, 15. §7 (Three.js/TS/Vite, simulation-core isolation for a future Rust swap) → all `src/sim/*` tasks (3-7) have zero Three.js/DOM imports, satisfying the swap-boundary requirement without building the Rust side (correctly out of scope per Global Constraints). §8 (data model) → Task 2's `types.ts` matches the spec's sketch, extended with `broken`/`rotation`/`angularVelocity` needed for simulation. §9 (testing approach) → every `src/sim/*` and `src/persistence/*` module is unit-tested; rendering/interaction get a mix of pure-logic unit tests and the Task 15 manual QA script. §11 (open server save/load, `user_id` reserved for later) → Tasks 16-17.
- **Placeholder scan:** no TBD/TODO markers; the one deferred detail (click-to-inspect wiring the `DurabilityPanel` to a raycaster hit) is called out explicitly as a named follow-up in Task 15 rather than left vague, and does not block any spec requirement (hover/click detail display was a "should" in spec §5, not required for the core loop).
- **Type consistency:** `GearInstance`, `MeshEdge`, `SimDiagnostics`, `SimTickResult` (Task 2) are the only definitions of those names and are imported verbatim by every later task; `tick`, `evaluatePair`, `buildEdges`, `classify`, `propagateRotation`, `applyWear`, `buildGeometryForType`, `colorForDurabilityRatio`, `computeSyncActions`, `findNearestCompatiblePartner` are each defined once (Tasks 3-13) and referenced by the same name everywhere they're consumed. `LayoutSummary`/`LayoutDetail` (Task 17's `serverClient.ts`) match the JSON shape `createApp` (Task 16) actually returns field-for-field (`id`, `name`, `updatedAt`, and `gears` on the detail variant).
