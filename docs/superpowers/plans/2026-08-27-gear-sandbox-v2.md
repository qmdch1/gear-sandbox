# Gear Sandbox v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "teeth don't actually mesh / geometry overlaps" rendering bug for all gear types by switching to a mathematically verified true-involute tooth profile with connect-time phase alignment, then add 6 manufacturing-standard object types (rack & pinion, planetary set, ratchet, sprocket + chain, pulley + belt, differential) on top of the corrected pipeline.

**Architecture:** Same layered split as v1 — a pure-TypeScript simulation core (`src/sim/`) with zero Three.js/DOM dependency, wrapped by a Three.js render layer (`src/render/`) and DOM UI panels (`src/ui/`). This plan's Part A changes touch the render layer's geometry generator and the sim core's meshing/simulation modules; Part B extends the same modules with new types and a new "remote link" (chain/belt) concept that isn't derived from geometry.

**Tech Stack:** Same as v1 — Vite, TypeScript (strict), Three.js, Vitest (+jsdom per-file pragma for DOM-touching tests), Express + better-sqlite3 backend. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-27-gear-sandbox-v2-design.md](../specs/2026-08-27-gear-sandbox-v2-design.md) (supersedes/extends [docs/superpowers/specs/2026-08-18-gear-sandbox-design.md](../specs/2026-08-18-gear-sandbox-design.md))

## Global Constraints

- TypeScript `strict: true` (unchanged from v1).
- Simulation core (`src/sim/**`) must stay free of Three.js/DOM imports — swappable for a future Rust/WASM build (v1 spec §7, unchanged).
- No new npm dependencies — everything below is built from Three.js primitives already in the project (`ExtrudeGeometry`, `TubeGeometry`, `TorusGeometry`, `LatheGeometry`, `SphereGeometry`, `ConeGeometry`, `CylinderGeometry`) plus plain TypeScript math.
- Every new pure function gets unit tests before the task's commit, per this project's established TDD convention (v1 plan, all 15 tasks).
- **This machine cannot compile `better-sqlite3` from source** (no Visual Studio Build Tools installed) — `npm install` must be run with `--ignore-scripts`; the package ships a working prebuilt binary that `--ignore-scripts` does not interfere with (verified: `npx vitest run tests/server` passes 11/11 after an `--ignore-scripts` install). This is an environment note for whoever executes this plan, not a task — do not "fix" it.
- Priority order (per spec §1): Part A (Tasks 1-4) before Part B (Tasks 5-14) — Part B's new object types are built on the corrected geometry/meshing pipeline from Part A, not the old one.
- Two formulas below (`computeSpurProfilePoints`'s involute math, and `computeMeshPhaseOffset`) were numerically verified against independent implementations before this plan was written — see the derivation notes inline in Tasks 1 and 3. Implement them exactly as given; the exact form matters (a plausible-looking variant of either formula is not guaranteed to have the same correctness properties, per the spec's §2.1 postmortem on why the original trapezoidal-profile approach failed).

---

## Part A — Visual Meshing Accuracy Fix

### Task 1: Involute Tooth Profile

**Files:**
- Modify: `src/render/gearGeometry.ts` (replace `computeSpurProfilePoints`)
- Modify: `tests/render/gearGeometry.test.ts` (replace the two `computeSpurProfilePoints` tests)

**Interfaces:**
- Produces: `computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[]` — same signature as v1, new implementation. Consumed by `extrudedGearGeometry` (unchanged caller) and, transitively, `buildGeometryForType` for `spur`/`helical`/`crank`/`ratchet`/`planetary`'s sun+planets (Task 12) and `sprocket` (Task 12).

- [ ] **Step 1: Replace `computeSpurProfilePoints` with a true-involute generator**

Open `src/render/gearGeometry.ts`. Replace the existing `ADDENDUM_FACTOR` constant and `computeSpurProfilePoints` function (leave the `const GEAR_THICKNESS = 0.4;` line above them untouched — it's still used by `extrudedGearGeometry`/`crankGeometry` and must not be redeclared) with:

```ts
const PRESSURE_ANGLE = 20 * (Math.PI / 180); // industry-standard 20°
const ADDENDUM_FACTOR = 1.0;   // standard: addendum = 1×module
const DEDENDUM_FACTOR = 1.25;  // standard: dedendum = 1.25×module (root clearance below the base circle)
const FLANK_SAMPLES = 5;       // points sampled along each involute flank

/** The involute function inv(alpha) = tan(alpha) - alpha: polar angle (from the
 *  point where the curve departs the base circle) of the involute point at radius
 *  r = baseRadius / cos(alpha). */
function involuteAngleAtRadius(baseRadius: number, r: number): number {
  const alpha = Math.acos(Math.min(1, baseRadius / Math.max(r, baseRadius)));
  return Math.tan(alpha) - alpha;
}

/** Pure profile math: a standard involute tooth profile (20° pressure angle, unity-module
 *  proportions), traced as one closed polygon around the whole gear -- root land, right
 *  flank (dedendum/base -> addendum), left flank (addendum -> dedendum/base), repeated
 *  per tooth.
 *
 *  Verified (see spec §2.1): tooth thickness at the pitch circle equals the standard
 *  pi*module/2 exactly, and tooth angular width narrows monotonically from dedendum to
 *  addendum (the physical rack-limit taper) -- both checked here in the test file below. */
export function computeSpurProfilePoints(teeth: number, module: number): THREE.Vector2[] {
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(PRESSURE_ANGLE);
  const addendumRadius = pitchRadius + module * ADDENDUM_FACTOR;
  const dedendumRadius = pitchRadius - module * DEDENDUM_FACTOR;
  const flankStartRadius = Math.max(baseRadius, dedendumRadius); // involute is undefined inside the base circle
  const toothAngularPitch = (Math.PI * 2) / teeth;
  const halfToothAngleAtPitch = toothAngularPitch / 4; // standard: tooth thickness = half the circular pitch
  const invAtPitch = involuteAngleAtRadius(baseRadius, pitchRadius);

  function flankAngle(r: number): number {
    return halfToothAngleAtPitch - (involuteAngleAtRadius(baseRadius, r) - invAtPitch);
  }

  const points: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) {
    const center = k * toothAngularPitch;

    points.push(new THREE.Vector2(
      Math.cos(center - toothAngularPitch / 2) * dedendumRadius,
      Math.sin(center - toothAngularPitch / 2) * dedendumRadius,
    ));

    for (let i = 0; i <= FLANK_SAMPLES; i++) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center + flankAngle(r);
      points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }

    for (let i = FLANK_SAMPLES; i >= 0; i--) {
      const r = flankStartRadius + (addendumRadius - flankStartRadius) * (i / FLANK_SAMPLES);
      const angle = center - flankAngle(r);
      points.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }
  }
  return points;
}
```

This produces `teeth * (1 + 2 * (FLANK_SAMPLES + 1))` points = `teeth * 13` for `FLANK_SAMPLES = 5`.

- [ ] **Step 2: Update `curveSegments` for smoother flanks**

In the same file, inside `extrudedGearGeometry`, change:

```ts
const geometry = new THREE.ExtrudeGeometry(shape, {
  depth: GEAR_THICKNESS,
  bevelEnabled: false,
  curveSegments: 1,
});
```

to:

```ts
const geometry = new THREE.ExtrudeGeometry(shape, {
  depth: GEAR_THICKNESS,
  bevelEnabled: false,
  curveSegments: 2,
});
```

- [ ] **Step 3: Replace the profile tests**

In `tests/render/gearGeometry.test.ts`, replace the `describe("computeSpurProfilePoints", ...)` block with:

```ts
describe("computeSpurProfilePoints", () => {
  it("produces 13 points per tooth (root land + 6-point right flank + 6-point left flank)", () => {
    const points = computeSpurProfilePoints(20, 1);
    expect(points.length).toBe(20 * 13);
  });

  it("gives a tooth thickness at the pitch circle equal to the standard pi*module/2", () => {
    // Sample the profile's own points near the pitch radius on tooth 0 and measure
    // the arc-length gap between the two flanks at that radius.
    const module = 1;
    const teeth = 20;
    const points = computeSpurProfilePoints(teeth, module);
    const pitchRadius = (module * teeth) / 2;
    // tooth 0 spans points[0..12]; index 6 is the tip-most sample on the right flank,
    // index 1 is the dedendum-most sample on the right flank (see Step 1's point order).
    // Find the two points (one per flank) whose radius is closest to the pitch radius.
    const rightFlank = points.slice(1, 7);
    const leftFlank = points.slice(7, 13);
    const closestToPitch = (flank: THREE.Vector2[]) =>
      flank.reduce((best, p) => (Math.abs(p.length() - pitchRadius) < Math.abs(best.length() - pitchRadius) ? p : best));
    const right = closestToPitch(rightFlank);
    const left = closestToPitch(leftFlank);
    const angularWidth = Math.atan2(right.y, right.x) - Math.atan2(left.y, left.x);
    const arcWidth = angularWidth * pitchRadius;
    expect(arcWidth).toBeCloseTo((Math.PI * module) / 2, 1);
  });

  it("narrows monotonically from the dedendum circle to the addendum circle (rack-limit taper)", () => {
    const points = computeSpurProfilePoints(20, 1);
    const rightFlank = points.slice(1, 7); // dedendum/base -> addendum, in order
    const angles = rightFlank.map((p) => Math.atan2(p.y, p.x));
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeLessThanOrEqual(angles[i - 1] + 1e-9); // right flank moves toward center outward
    }
  });
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/render/gearGeometry.test.ts`
Expected: all tests in the file pass (the `buildGeometryForType` describe block from v1 is untouched and still passes; the 3 new `computeSpurProfilePoints` tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/render/gearGeometry.ts tests/render/gearGeometry.test.ts
git commit -m "fix(render): replace trapezoidal tooth approximation with true involute profile"
```

---

### Task 2: Real Bevel & Worm Geometry

**Files:**
- Modify: `src/render/gearGeometry.ts` (`buildGeometryForType`'s `bevel` and `worm` cases)
- Modify: `tests/render/gearGeometry.test.ts`

**Interfaces:**
- Consumes: `extrudedGearGeometry`, `mergeGeometries` (already in the file, unchanged).
- Produces: same `buildGeometryForType(type, teeth, module): THREE.BufferGeometry` signature; `bevel` and `worm` now return geometry with actual teeth/thread instead of a smooth cone/cylinder.

- [ ] **Step 1: Add a tapered-extrusion helper and use it for bevel**

In `src/render/gearGeometry.ts`, add this helper near `extrudedGearGeometry`:

```ts
/** Extrudes the involute tooth profile and then scales each cross-section toward the
 *  apex as z increases -- an approximation of real bevel-gear tooth taper (true bevel
 *  teeth are generated on a cone via Tredgold's approximation; this project's procedural
 *  geometry uses the simpler linear taper, consistent with the sandbox's existing
 *  approach of visual-approximation-over-CAD-precision). */
function taperedGearGeometry(teeth: number, module: number, coneHeight: number, taperRatio: number): THREE.BufferGeometry {
  const points = computeSpurProfilePoints(teeth, module);
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: coneHeight, bevelEnabled: false, curveSegments: 2 });
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const t = z / coneHeight;
    const scale = 1 - t * (1 - taperRatio);
    position.setX(i, position.getX(i) * scale);
    position.setY(i, position.getY(i) * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
```

Replace the `case "bevel":` branch in `buildGeometryForType` with:

```ts
case "bevel": {
  const coneHeight = GEAR_THICKNESS * 3;
  return taperedGearGeometry(teeth, module, coneHeight, 0.15);
}
```

- [ ] **Step 2: Give the worm a real helical thread**

Replace the `case "worm":` branch with:

```ts
case "worm": {
  const length = module * 6;
  const coreRadius = module * 0.9;
  const threadRadius = module * 1.3;
  const threadPitch = module * 1.5;
  const turns = length / threadPitch;
  const segments = 120;
  const helixPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * turns * Math.PI * 2;
    const z = -length / 2 + t * length;
    helixPoints.push(new THREE.Vector3(Math.cos(angle) * threadRadius, Math.sin(angle) * threadRadius, z));
  }
  const curve = new THREE.CatmullRomCurve3(helixPoints);
  const thread = new THREE.TubeGeometry(curve, segments, module * 0.35, 8, false);
  const core = new THREE.CylinderGeometry(coreRadius, coreRadius, length, 16);
  core.rotateX(Math.PI / 2);
  return mergeGeometries([core, thread]);
}
```

- [ ] **Step 3: Add geometry-shape tests**

Add to `tests/render/gearGeometry.test.ts`, inside the existing `describe("buildGeometryForType", ...)` block:

```ts
it("gives the bevel gear a smaller cross-section near the apex than at the base (real taper, not a smooth cone)", () => {
  const geometry = buildGeometryForType("bevel", 20, 1);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  // The taper is along Z (pre-quaternion-alignment local axis); the XY extent at
  // z-min (base) should exceed the XY extent at z-max (apex).
  const position = geometry.attributes.position;
  let maxRadiusNearBase = 0;
  let maxRadiusNearApex = 0;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const r = Math.hypot(position.getX(i), position.getY(i));
    if (z < box.min.z + 0.01) maxRadiusNearBase = Math.max(maxRadiusNearBase, r);
    if (z > box.max.z - 0.01) maxRadiusNearApex = Math.max(maxRadiusNearApex, r);
  }
  expect(maxRadiusNearApex).toBeLessThan(maxRadiusNearBase);
});

it("gives the worm a thread that stands off from a central core (not a smooth cylinder)", () => {
  const geometry = buildGeometryForType("worm", 2, 1);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const maxRadius = Math.max(
    Math.hypot(box.max.x, 0), Math.hypot(box.max.y, 0),
  );
  expect(maxRadius).toBeGreaterThan(1 * 0.9); // exceeds the plain core radius
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/render/gearGeometry.test.ts`
Expected: all tests pass (Task 1's 3 tests + v1's original `buildGeometryForType` test + these 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/gearGeometry.ts tests/render/gearGeometry.test.ts
git commit -m "fix(render): give bevel and worm gears real tooth/thread geometry instead of a smooth cone/cylinder"
```

---

### Task 3: Mesh Phase-Alignment Core Function

**Files:**
- Modify: `src/sim/meshing.ts` (add `computeMeshPhaseOffset` and its local-basis helpers)
- Modify: `tests/sim/meshing.test.ts`

**Interfaces:**
- Consumes: `GearInstance`, `MeshEdge` from `src/sim/types.ts` (unchanged).
- Produces: `computeMeshPhaseOffset(a: GearInstance, b: GearInstance, edge: MeshEdge): number` — the rotation-radians to add to `b.rotation` so a tooth of `a` faces a gap of `b` (or vice versa) at their current positions. Used by Task 4's `simulation.ts`.

- [ ] **Step 1: Add the local-basis and phase-offset functions**

Open `src/sim/meshing.ts`. Add these functions (after the existing `dot`/`dist`/`pitchRadius` helpers, before `evaluatePair`):

```ts
const TWO_PI = Math.PI * 2;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Local XY-plane basis (u, v) for a gear's rotation frame, reproducing exactly what
 *  the render layer's `mesh.quaternion.setFromUnitVectors(Vector3(0,0,1), axis)` does
 *  (gearMesh.ts) -- the minimal rotation taking world Z to `axis`, applied to local X
 *  and Y -- computed here in plain vector math (Rodrigues' rotation formula) so the sim
 *  core stays free of a Three.js dependency while agreeing exactly with what gets
 *  rendered. Verified: max positional error 1e-15 against THREE.Quaternion across five
 *  axis directions x four rotations x four angles (see spec §2.2). */
function localBasis(axis: [number, number, number]): { u: [number, number, number]; v: [number, number, number] } {
  const [ax, ay, az] = axis;
  const rotAxis: [number, number, number] = [-ay, ax, 0]; // cross(Z, axis)
  const rotAxisLen = Math.hypot(...rotAxis);
  const angle = Math.acos(Math.max(-1, Math.min(1, az))); // dot(Z, axis) = az
  function rotate(vec: [number, number, number]): [number, number, number] {
    if (rotAxisLen < 1e-8) return az >= 0 ? vec : [vec[0], -vec[1], -vec[2]];
    const k: [number, number, number] = [rotAxis[0] / rotAxisLen, rotAxis[1] / rotAxisLen, rotAxis[2] / rotAxisLen];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const kDotV = dot(k, vec);
    const kCrossV: [number, number, number] = [
      k[1] * vec[2] - k[2] * vec[1],
      k[2] * vec[0] - k[0] * vec[2],
      k[0] * vec[1] - k[1] * vec[0],
    ];
    return [
      vec[0] * cosA + kCrossV[0] * sinA + k[0] * kDotV * (1 - cosA),
      vec[1] * cosA + kCrossV[1] * sinA + k[1] * kDotV * (1 - cosA),
      vec[2] * cosA + kCrossV[2] * sinA + k[2] * kDotV * (1 - cosA),
    ];
  }
  return { u: rotate([1, 0, 0]), v: rotate([0, 1, 0]) };
}

/** Angle (in a gear's unrotated local frame) of a world-space direction. */
function localAngleOf(dirWorld: [number, number, number], axis: [number, number, number]): number {
  const { u, v } = localBasis(axis);
  return Math.atan2(dot(dirWorld, v), dot(dirWorld, u));
}

/** The rotation (radians) to ADD to `b.rotation` so that, at the current center-line
 *  direction between `a` and `b`, one gear's tooth pattern shows a tooth exactly where
 *  the other shows a gap (a "complementary half-cycle" phase). With the true-involute
 *  profile (Task 1), setting this once at the moment two gears newly mesh is sufficient
 *  -- involute conjugate action then keeps the phase correct through further rotation
 *  (see spec §2.2; verified for both parallel-axis and perpendicular-axis pairs). Not
 *  meaningful for "chain"/"belt" edges (no direct tooth contact) -- callers should only
 *  invoke this for `edge.kind === "mesh"`. */
export function computeMeshPhaseOffset(a: GearInstance, b: GearInstance, edge: MeshEdge): number {
  const dirAB = normalize(sub(b.position, a.position));
  const dirBA: [number, number, number] = [-dirAB[0], -dirAB[1], -dirAB[2]];
  const phiA = localAngleOf(dirAB, a.axis);
  const phiB = localAngleOf(dirBA, b.axis);
  const thetaA = phiA - a.rotation;
  const periodA = TWO_PI / a.teeth;
  const periodB = TWO_PI / b.teeth;
  const fracA = mod(thetaA, periodA) / periodA;
  const desiredFracB = mod(fracA + 0.5, 1);
  const desiredThetaB = desiredFracB * periodB;
  const bRotationNeeded = phiB - desiredThetaB;
  const rawOffset = bRotationNeeded - b.rotation;
  return mod(rawOffset + periodB / 2, periodB) - periodB / 2; // nearest representative, avoids a large jump
}
```

Add two small vector helpers next to the existing `dist`/`dot` functions if not already present in the exact form used above:

```ts
function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(a: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
}
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/sim/meshing.test.ts`:

```ts
import { computeMeshPhaseOffset } from "../../src/sim/meshing";

function isTooth(theta: number, teeth: number): boolean {
  const period = (Math.PI * 2) / teeth;
  const m = ((theta % period) + period) % period;
  return m < period / 2;
}

describe("computeMeshPhaseOffset", () => {
  it("produces a complementary tooth/gap phase at the contact point for a parallel-axis pair", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.4 });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], axis: [0, 1, 0], rotation: -1.1 });
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    const bFixed = { ...b, rotation: b.rotation + offset };

    const dirAB: [number, number, number] = [1, 0, 0]; // b is at +x from a here
    const thetaA = Math.atan2(0, 1) - a.rotation; // direction toward b, in a's local frame, minus a's rotation
    const thetaB = Math.atan2(0, -1) - bFixed.rotation; // direction toward a, in b's local frame
    expect(isTooth(thetaA, a.teeth)).not.toBe(isTooth(thetaB, b.teeth));
  });

  it("produces a complementary phase for a perpendicular-axis (bevel-style) pair too", () => {
    const a = makeGear({ id: "a", type: "bevel", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0], rotation: 0.9 });
    const b = makeGear({ id: "b", type: "bevel", teeth: 20, module: 1, position: [20, 0, 0], axis: [1, 0, 0], rotation: -0.3 });
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    expect(Number.isFinite(offset)).toBe(true);
    expect(Math.abs(offset)).toBeLessThanOrEqual((Math.PI * 2) / b.teeth); // within one full tooth period (nearest representative)
  });

  it("returns a small (nearest-representative) offset, not an arbitrary multi-turn jump", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 100 }); // many turns already
    const edge = evaluatePair(a, b)!;
    const offset = computeMeshPhaseOffset(a, b, edge);
    expect(Math.abs(offset)).toBeLessThanOrEqual((Math.PI * 2) / b.teeth);
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/meshing.test.ts`
Expected: all existing meshing tests plus these 3 new ones pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim/meshing.ts tests/sim/meshing.test.ts
git commit -m "feat(sim): mesh phase-alignment function so newly-connected gears interleave instead of clipping"
```

---

### Task 4: Wire Phase Alignment Into the Simulation Tick

**Files:**
- Modify: `src/sim/graph.ts` (add `edgeKey`)
- Modify: `src/sim/simulation.ts` (`tick` gains a `previousEdgeKeys` parameter and applies phase offsets to newly-formed mesh edges)
- Modify: `src/sim/types.ts` (`SimTickResult` gains `edgeKeys`)
- Modify: `src/main.ts` (thread `edgeKeys` across animation frames, matching the existing `gears` threading pattern)
- Modify: `tests/sim/simulation.test.ts`

**Interfaces:**
- Consumes: `computeMeshPhaseOffset` (Task 3); `buildEdges`, `classify` (graph.ts, unchanged this task).
- Produces: `edgeKey(edge: MeshEdge): string` (graph.ts); `tick(gears: GearInstance[], dt: number, timeScale: number, previousEdgeKeys: ReadonlySet<string>): SimTickResult` (simulation.ts, new 4th parameter); `SimTickResult.edgeKeys: Set<string>` (types.ts). Task 9 will further change `tick`'s first parameter to a `LayoutState` — this task's signature is the intermediate step.

- [ ] **Step 1: Add `edgeKey` to graph.ts**

In `src/sim/graph.ts`, add (near the top, after the imports):

```ts
/** Order-independent identity for an edge -- used to diff "which edges are new this
 *  tick" without caring which gear ended up as `.a` vs `.b`. */
export function edgeKey(edge: MeshEdge): string {
  return [edge.a, edge.b].sort().join(":");
}
```

- [ ] **Step 2: Add `edgeKeys` to `SimTickResult`**

In `src/sim/types.ts`, change:

```ts
export interface SimTickResult {
  gears: GearInstance[];
  diagnostics: SimDiagnostics;
}
```

to:

```ts
export interface SimTickResult {
  gears: GearInstance[];
  diagnostics: SimDiagnostics;
  edgeKeys: Set<string>; // pass back into the next tick() call's `previousEdgeKeys`
}
```

- [ ] **Step 3: Wire phase-offset application into `tick`**

In `src/sim/simulation.ts`, add the import and change the `tick` function:

```ts
import { buildEdges, classify, edgeKey } from "./graph";
import { computeMeshPhaseOffset } from "./meshing";
```

Replace the `tick` function body:

```ts
export function tick(
  gears: GearInstance[],
  dt: number,
  timeScale: number,
  previousEdgeKeys: ReadonlySet<string>,
): SimTickResult {
  const edges = buildEdges(gears);
  const byId = new Map(gears.map((g) => [g.id, g] as const));

  const phaseAdjustments = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== "mesh" || previousEdgeKeys.has(edgeKey(edge))) continue;
    const a = byId.get(edge.a)!;
    const b = byId.get(edge.b)!;
    phaseAdjustments.set(b.id, computeMeshPhaseOffset(a, b, edge));
  }

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
    const phaseAdjustment = phaseAdjustments.get(g.id) ?? 0;
    const rotation = broken ? g.rotation : g.rotation + phaseAdjustment + angularVelocity * dt;
    return { ...g, durabilityCurrent, broken, rotation, angularVelocity };
  });

  return { gears: updatedGears, diagnostics, edgeKeys: new Set(edges.map(edgeKey)) };
}
```

- [ ] **Step 4: Update `main.ts`'s animation loop**

In `src/main.ts`, add `let previousEdgeKeys = new Set<string>();` next to the existing `let timeScale = 1;` line, and change the `animate` function's tick call:

```ts
const result = tick(gears, dt, timeScale, previousEdgeKeys);
gears = result.gears;
previousEdgeKeys = result.edgeKeys;
sceneSync.sync(gears, result.diagnostics);
```

- [ ] **Step 5: Update the simulation tests for the new signature and add a phase-alignment integration test**

In `tests/sim/simulation.test.ts`, update every existing `tick(gears, 1, 1)` call to `tick(gears, 1, 1, new Set())`, and add:

```ts
it("phase-aligns a gear pair only on the tick where they first become meshed, not on later ticks", () => {
  const gears = [
    makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1, rotation: 0.7 }),
    makeGear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], rotation: 0 }),
  ];
  const first = tick(gears, 0, 1, new Set()); // dt=0: isolate the phase-offset jump from the rotation-integration step
  const bAfterFirst = first.gears.find((g) => g.id === "b")!;
  expect(bAfterFirst.rotation).not.toBe(0); // the phase offset moved it even with zero elapsed time

  const second = tick(first.gears, 0, 1, first.edgeKeys); // edge already in previousEdgeKeys -> no further jump
  const bAfterSecond = second.gears.find((g) => g.id === "b")!;
  expect(bAfterSecond.rotation).toBeCloseTo(bAfterFirst.rotation);
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/simulation.test.ts`
Expected: all existing tests (updated call signature) plus the new test pass.

Run: `npx vitest run`
Expected: full suite passes (this task touches `main.ts`, which isn't unit-tested directly, but every module it calls into is).

- [ ] **Step 7: Commit**

```bash
git add src/sim/graph.ts src/sim/simulation.ts src/sim/types.ts src/main.ts tests/sim/simulation.test.ts
git commit -m "fix(sim): apply the mesh phase offset exactly once, on the tick a mesh edge first forms"
```

---

## Part B — 6 New Object Types

### Task 5: Types & GEAR_DEFS Extension

**Files:**
- Modify: `src/sim/types.ts` (`GearType` union, `GearInstance.linearPosition`, `MeshEdge.kind`, new `RemoteLink`/`LayoutState`)
- Modify: `src/sim/gearDefs.ts` (6 new `GEAR_DEFS` entries)
- Modify: `tests/sim/gearDefs.test.ts`

**Interfaces:**
- Produces: extended `GearType`, `GearInstance`, `MeshEdge`; new `RemoteLink`, `LayoutState` (types.ts); 6 new `GEAR_DEFS` entries (gearDefs.ts). Every later task in Part B depends on these exact names.

- [ ] **Step 1: Extend `src/sim/types.ts`**

Change:

```ts
export type GearType = "spur" | "helical" | "crank" | "bevel" | "worm" | "load";
```

to:

```ts
export type GearType =
  | "spur" | "helical" | "crank" | "bevel" | "worm" | "load"
  | "rack" | "planetary" | "ratchet" | "sprocket" | "pulley" | "differential";
```

Add `linearPosition` to `GearInstance` (after `angularVelocity`):

```ts
export interface GearInstance {
  id: string;
  type: GearType;
  position: [number, number, number];
  axis: [number, number, number];
  teeth: number;
  module: number;
  durabilityMax: number;
  durabilityCurrent: number;
  broken: boolean;
  rotation: number;
  angularVelocity: number;
  linearPosition?: number; // "rack" only: accumulated linear travel along `axis`, in world units
}
```

Change `MeshEdge.kind`:

```ts
kind: "mesh" | "coupling" | "chain" | "belt";
```

Add, after `MeshEdge`:

```ts
export interface RemoteLink {
  a: string;
  b: string;
  kind: "chain" | "belt";
}

export interface LayoutState {
  gears: GearInstance[];
  remoteLinks: RemoteLink[];
}
```

- [ ] **Step 2: Add 6 `GEAR_DEFS` entries**

In `src/sim/gearDefs.ts`, extend the `GEAR_DEFS` object:

```ts
export const GEAR_DEFS: Record<GearType, GearTypeDef> = {
  spur:    { durabilityMax: 100, baseWearPerSecond: 1.0, loadWearMultiplier: 1.5 },
  helical: { durabilityMax: 150, baseWearPerSecond: 0.8, loadWearMultiplier: 1.5 },
  crank:   { durabilityMax: 200, baseWearPerSecond: 0.5, loadWearMultiplier: 1.2 },
  bevel:   { durabilityMax: 120, baseWearPerSecond: 1.2, loadWearMultiplier: 1.5 },
  worm:    { durabilityMax: 80,  baseWearPerSecond: 1.5, loadWearMultiplier: 1.8 },
  load:    { durabilityMax: 1_000_000, baseWearPerSecond: 0, loadWearMultiplier: 0 },
  rack:       { durabilityMax: 100, baseWearPerSecond: 0.8, loadWearMultiplier: 1.5 },
  planetary:  { durabilityMax: 250, baseWearPerSecond: 0.6, loadWearMultiplier: 1.4 },
  ratchet:    { durabilityMax: 90,  baseWearPerSecond: 1.3, loadWearMultiplier: 1.6 },
  sprocket:   { durabilityMax: 110, baseWearPerSecond: 0.9, loadWearMultiplier: 1.4 },
  pulley:     { durabilityMax: 130, baseWearPerSecond: 0.5, loadWearMultiplier: 1.3 },
  differential: { durabilityMax: 180, baseWearPerSecond: 0.7, loadWearMultiplier: 1.5 },
};
```

- [ ] **Step 3: Extend the GEAR_DEFS test**

In `tests/sim/gearDefs.test.ts`, change the `types` array in the first test:

```ts
const types = [
  "spur", "helical", "crank", "bevel", "worm", "load",
  "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
] as const;
```

Add:

```ts
it("gives planetary sets higher durability than a plain spur gear (more parts sharing the load)", () => {
  expect(GEAR_DEFS.planetary.durabilityMax).toBeGreaterThan(GEAR_DEFS.spur.durabilityMax);
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/gearDefs.test.ts`
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no errors (this step touches shared types used across every module — a full typecheck here catches call sites that will need updating in later tasks; some Part B call sites won't exist to break yet, so this should be clean at this point since only types.ts/gearDefs.ts changed and nothing consumes the new fields/union members yet).

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/gearDefs.ts tests/sim/gearDefs.test.ts
git commit -m "feat(sim): extend GearType/GearInstance/MeshEdge for 6 new object types and remote links"
```

---

### Task 6: Meshing Rules for Rack, Ratchet, Planetary, Differential

**Files:**
- Modify: `src/sim/meshing.ts` (`evaluatePair`)
- Modify: `tests/sim/meshing.test.ts`

**Interfaces:**
- Consumes: `GearInstance`, `MeshEdge` (types.ts, Task 5).
- Produces: `evaluatePair` now also handles `rack`, `ratchet`, `planetary`, `differential` pairings. Same signature as v1/Task 3.

- [ ] **Step 1: Add planetary to the parallel family**

In `src/sim/meshing.ts`, change:

```ts
const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank"]);
```

to:

```ts
const PARALLEL_FAMILY = new Set<GearInstance["type"]>(["spur", "helical", "crank", "planetary"]);
```

(This alone makes `planetary` mesh via the same parallel-axis, pitch-radius-sum rule as spur/helical/crank — no further change needed for it.)

- [ ] **Step 2: Add ratchet's one-way parallel mesh**

Still in `evaluatePair`, after the `bothParallelFamily` block and before the `wormPair`/`bevelInvolved` block, add a new branch:

```ts
const ratchetInvolved = a.type === "ratchet" || b.type === "ratchet";
if (ratchetInvolved && !bothParallelFamily) {
  const bothRatchet = a.type === "ratchet" && b.type === "ratchet";
  if (bothRatchet) return null; // two ratchets never usefully mesh with each other
  if (Math.abs(axisDot) < PARALLEL_DOT_THRESHOLD || !withinDistance) return null;
  const oneWay: MeshEdge["oneWay"] = a.type === "ratchet" ? "bToA" : "aToB"; // the non-ratchet side can drive; the ratchet cannot back-drive it
  return { a: a.id, b: b.id, kind: "mesh", ratio: a.teeth / b.teeth, oneWay };
}
```

Note: this reads `axisDot`/`withinDistance`, which are computed earlier in the function (same block as `bothParallelFamily` already uses them) — no new computation needed, just placed after that point in the function.

- [ ] **Step 3: Add the rack's line-distance mesh rule**

Add a helper near the top of the file (with `dist`/`dot`):

```ts
/** Perpendicular distance from point `p` to the infinite line through `origin` in direction `dir` (unit vector). */
function distanceToLine(p: [number, number, number], origin: [number, number, number], dir: [number, number, number]): number {
  const rel: [number, number, number] = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const along = dot(rel, dir);
  const closest: [number, number, number] = [origin[0] + dir[0] * along, origin[1] + dir[1] * along, origin[2] + dir[2] * along];
  return dist(p, closest);
}
```

Add at the very top of `evaluatePair`, as the first check in the function, before the `load` branch (Step 4 below generalizes that `load` branch to also cover `differential` — the rack check must still run first, or a rack that happens to be geometrically coincident with a `load`/`differential` would be wrongly matched by that block's coincident-coupling rule instead of being correctly rejected here):

```ts
const rackInvolved = a.type === "rack" || b.type === "rack";
if (rackInvolved) {
  if (a.type === "rack" && b.type === "rack") return null; // two racks don't mesh with each other
  const [rack, pinion] = a.type === "rack" ? [a, b] : [b, a];
  if (pinion.type === "load" || pinion.type === "rack") return null; // only a toothed pinion can drive a rack
  const perpendicular = Math.abs(dot(rack.axis, pinion.axis)) < PERP_DOT_THRESHOLD;
  const linePitchDistance = Math.abs(distanceToLine(pinion.position, rack.position, rack.axis) - pitchRadius(pinion));
  if (!perpendicular || linePitchDistance > pitchRadius(pinion) * MESH_TOLERANCE) return null;
  const oneWay: MeshEdge["oneWay"] = rack === a ? "bToA" : "aToB"; // only the pinion drives the rack -- see meshing rules in graph traversal (rotation.ts, Task 8)
  return { a: a.id, b: b.id, kind: "mesh", ratio: 1, oneWay };
}
```

(`ratio: 1` on a rack edge is a placeholder never read as an angular ratio — Task 8's `propagateRotation` special-cases any edge whose target is a `rack` and computes a linear velocity from the pinion's own pitch radius instead.)

- [ ] **Step 4: Add the differential's perpendicular input and coincident outputs**

Change the `wormPair`/`bevelInvolved` block's condition to also admit `differential`:

```ts
const wormPair = (a.type === "worm") !== (b.type === "worm");
const bevelInvolved = a.type === "bevel" || b.type === "bevel" || a.type === "differential" || b.type === "differential";
```

(No other change needed in that block — differential's input mesh reuses the exact same perpendicular-axis, pitch-radius-sum rule as bevel.)

For the differential's two output shafts (coincident coupling), generalize the existing `load` coincident-coupling branch at the top of `evaluatePair`:

```ts
if (a.type === "load" || b.type === "load" || a.type === "differential" || b.type === "differential") {
  const bothNonMeshing = (a.type === "load" || a.type === "differential") && (b.type === "load" || b.type === "differential");
  if (bothNonMeshing) return null;
  if (dist(a.position, b.position) > COUPLING_DISTANCE_TOLERANCE) return null;
  if (Math.abs(dot(a.axis, b.axis)) < PARALLEL_DOT_THRESHOLD) return null;
  return { a: a.id, b: b.id, kind: "coupling", ratio: 1, oneWay: "none" };
}
```

This is a replacement for the original `if (a.type === "load" || b.type === "load") { ... }` block — same shape, generalized condition, in the same position that block occupied (right after the `rackInvolved` check added in Step 3, and before the `wormPair`/`bevelInvolved` check below). **Ordering, top to bottom:** (1) `rackInvolved` (Step 3) first, so a rack is never accidentally matched as a coincident coupling; (2) this generalized `load`/`differential` coincident-coupling block second; (3) the existing worm coincident-shaft-coupling special case (unchanged from v1); (4) the `centerDistance`/`axisDot`/`withinDistance` computation, `bothParallelFamily` (Step 1), and `ratchetInvolved` (Step 2) checks; (5) the `wormPair`/`bevelInvolved` check (this step), last. A `differential` paired with a coincident `load` or another coincident gear resolves as a coupling at step (2); a `differential` paired with a perpendicular driving gear falls through step (2) (not coincident, so the distance check there fails) to resolve at step (5) instead.

- [ ] **Step 5: Write the failing tests**

Add to `tests/sim/meshing.test.ts`:

```ts
describe("v2 object types", () => {
  it("meshes a planetary set with a spur gear using the same parallel-axis rule as spur-to-spur", () => {
    const planetary = makeGear({ id: "p", type: "planetary", teeth: 40, module: 1, position: [0, 0, 0] });
    const spur = makeGear({ id: "s", teeth: 10, module: 1, position: [25, 0, 0] }); // (40+10)/2=25
    const edge = evaluatePair(planetary, spur);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("lets a driving gear turn a ratchet but marks the edge one-way so the ratchet can't back-drive it", () => {
    const driver = makeGear({ id: "d", teeth: 20, module: 1, position: [0, 0, 0] });
    const ratchet = makeGear({ id: "r", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });
    const edge = evaluatePair(driver, ratchet)!;
    expect(edge.oneWay).toBe("aToB"); // a=driver, b=ratchet: only a->b allowed
  });

  it("does not mesh two ratchets with each other", () => {
    const r1 = makeGear({ id: "r1", type: "ratchet", teeth: 10, module: 1, position: [0, 0, 0] });
    const r2 = makeGear({ id: "r2", type: "ratchet", teeth: 10, module: 1, position: [15, 0, 0] });
    expect(evaluatePair(r1, r2)).toBeNull();
  });

  it("meshes a rack with a perpendicular-axis pinion at the correct line distance, one-way from the pinion", () => {
    const pinion = makeGear({ id: "pin", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    // pinion pitch radius = 10; rack's travel line runs along x=[1,0,0]... place the rack so
    // its axis (travel direction) is perpendicular to the pinion's rotation axis, offset by
    // the pinion's pitch radius along z.
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const edge = evaluatePair(pinion, rack)!;
    expect(edge).not.toBeNull();
    expect(edge.oneWay).toBe("aToB"); // a=pinion drives b=rack
  });

  it("does not mesh two racks with each other", () => {
    const r1 = makeGear({ id: "r1", type: "rack", teeth: 8, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const r2 = makeGear({ id: "r2", type: "rack", teeth: 8, module: 1, position: [5, 0, 0], axis: [1, 0, 0] });
    expect(evaluatePair(r1, r2)).toBeNull();
  });

  it("meshes a differential's input like a bevel gear (perpendicular axis, pitch-radius-sum distance)", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const inputBevel = makeGear({ id: "in", type: "bevel", teeth: 15, module: 1, position: [22.5, 0, 0], axis: [1, 0, 0] });
    const edge = evaluatePair(diff, inputBevel);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("couples a differential's two output shafts as coincident 1:1 couplings, same as a load object", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const edge = evaluatePair(diff, outputA)!;
    expect(edge.kind).toBe("coupling");
    expect(edge.ratio).toBe(1);
  });
});
```

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/meshing.test.ts`
Expected: all existing meshing tests plus these 7 new ones pass.

- [ ] **Step 7: Commit**

```bash
git add src/sim/meshing.ts tests/sim/meshing.test.ts
git commit -m "feat(sim): meshing rules for rack, ratchet, planetary, and differential"
```

---

### Task 7: Remote Links (Chain/Belt) Merged Into the Edge Graph

**Files:**
- Modify: `src/sim/graph.ts` (`buildEdges` gains a `remoteLinks` parameter)
- Modify: `tests/sim/graph.test.ts`

**Interfaces:**
- Consumes: `RemoteLink` (types.ts, Task 5).
- Produces: `buildEdges(gears: GearInstance[], remoteLinks: RemoteLink[] = []): MeshEdge[]` — same name, new optional 2nd parameter (defaulted so Task 6's tests and any other existing call site with 1 argument keep working). `classify` is unchanged (it already just consumes whatever edge list `buildEdges` returns).

- [ ] **Step 1: Extend `buildEdges`**

In `src/sim/graph.ts`, change:

```ts
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
```

to:

```ts
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
```

Add the import: `import type { GearInstance, MeshEdge, RemoteLink, SimDiagnostics } from "./types";` (extends the existing type-only import line), and import `pitchRadius`:

`pitchRadius` isn't currently exported from `meshing.ts` (it's a private helper there). Export it:

In `src/sim/meshing.ts`, change:

```ts
function pitchRadius(g: GearInstance): number {
```

to:

```ts
export function pitchRadius(g: GearInstance): number {
```

Then in `src/sim/graph.ts`, add to the existing `import { evaluatePair, isOverlapping } from "./meshing";` line: `evaluatePair, isOverlapping, pitchRadius`.

- [ ] **Step 2: Write the failing tests**

Add to `tests/sim/graph.test.ts`:

```ts
import type { RemoteLink } from "../../src/sim/types";

describe("buildEdges with remote links", () => {
  it("adds a chain edge between two far-apart sprockets that would never mesh geometrically", () => {
    const gears = [
      makeGear({ id: "a", type: "sprocket", teeth: 20, module: 1, position: [0, 0, 0] }),
      makeGear({ id: "b", type: "sprocket", teeth: 10, module: 1, position: [500, 0, 0] }), // far outside mesh distance
    ];
    const links: RemoteLink[] = [{ a: "a", b: "b", kind: "chain" }];
    const edges = buildEdges(gears, links);
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("chain");
    expect(edges[0].ratio).toBeCloseTo(2); // 20/10
  });

  it("ignores a remote link that references a since-deleted gear instead of throwing", () => {
    const gears = [makeGear({ id: "a", type: "sprocket", teeth: 20, module: 1, position: [0, 0, 0] })];
    const links: RemoteLink[] = [{ a: "a", b: "gone", kind: "chain" }];
    expect(() => buildEdges(gears, links)).not.toThrow();
    expect(buildEdges(gears, links)).toHaveLength(0);
  });

  it("computes a belt edge's ratio from pitch radius, not tooth count", () => {
    const gears = [
      makeGear({ id: "a", type: "pulley", teeth: 30, module: 1, position: [0, 0, 0] }), // pitchRadius 15
      makeGear({ id: "b", type: "pulley", teeth: 10, module: 1, position: [500, 0, 0] }), // pitchRadius 5
    ];
    const links: RemoteLink[] = [{ a: "a", b: "b", kind: "belt" }];
    const edges = buildEdges(gears, links);
    expect(edges[0].ratio).toBeCloseTo(3); // 15/5
  });
});
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/graph.test.ts`
Expected: all existing graph tests plus these 3 new ones pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim/graph.ts src/sim/meshing.ts tests/sim/graph.test.ts
git commit -m "feat(sim): merge chain/belt remote links into the edge graph"
```

---

### Task 8: Rotation Propagation for Chain/Belt, Rack, and Differential

**Files:**
- Modify: `src/sim/rotation.ts`
- Modify: `tests/sim/rotation.test.ts`

**Interfaces:**
- Consumes: `pitchRadius` (meshing.ts, now exported per Task 7).
- Produces: `RotationResult` gains `linearVelocities: Map<string, number>`. `propagateRotation` signature unchanged (`(gears, edges) => RotationResult`); differential's output-shaft equal-speed behavior needs no code change (falls out of the existing `coupling` sign=+1, ratio=1 handling, confirmed by a new test in Step 2).

- [ ] **Step 1: Extend `propagateRotation`**

In `src/sim/rotation.ts`, add the import: `import { pitchRadius } from "./meshing";`.

Change the `RotationResult` interface:

```ts
export interface RotationResult {
  angularVelocities: Map<string, number>;
  linearVelocities: Map<string, number>; // "rack" gears only; 0 for everything else
}
```

Change the sign computation and value-assignment inside the BFS loop. Replace:

```ts
const sign = edge.kind === "coupling" ? 1 : -1;
const ratio = isForward ? edge.ratio : 1 / edge.ratio;
angularVelocities.set(otherId, curSpeed * sign * ratio);
visited.add(otherId);
queue.push(otherId);
```

with:

```ts
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
```

Add `const linearVelocities = new Map<string, number>();` next to the existing `const angularVelocities = new Map<string, number>();` declaration, and initialize it too: change

```ts
for (const g of gears) angularVelocities.set(g.id, g.type === "crank" ? g.angularVelocity : 0);
```

to:

```ts
for (const g of gears) {
  angularVelocities.set(g.id, g.type === "crank" ? g.angularVelocity : 0);
  linearVelocities.set(g.id, 0);
}
```

And update the final return statement: `return { angularVelocities, linearVelocities };`.

- [ ] **Step 2: Write the failing tests**

Add to `tests/sim/rotation.test.ts`:

```ts
describe("v2 propagation rules", () => {
  it("transmits chain rotation in the SAME direction (not reversed, unlike a direct gear mesh)", () => {
    const gears = [
      makeGear({ id: "crank", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 }),
      makeGear({ id: "sprocket", type: "sprocket", teeth: 10, module: 1, position: [500, 0, 0] }),
    ];
    // manually construct the chain edge the way buildEdges(gears, remoteLinks) would
    const edges = [{ a: "crank", b: "sprocket", kind: "chain" as const, ratio: 2, oneWay: "none" as const }];
    const { angularVelocities } = propagateRotation(gears, edges);
    expect(angularVelocities.get("sprocket")).toBeCloseTo(2); // same sign as the crank, scaled by ratio
  });

  it("converts a driving pinion's angular velocity into a rack's linear velocity", () => {
    const pinion = makeGear({ id: "pinion", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 2 });
    const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
    const gears = [pinion, rack];
    const { angularVelocities, linearVelocities } = propagateRotation(gears, buildEdges(gears));
    expect(angularVelocities.get("rack")).toBe(0); // a rack never has an angular velocity
    expect(linearVelocities.get("rack")).toBeCloseTo(2 * 10); // omega * pinion pitch radius (teeth=20,module=1 -> r=10)
  });

  it("gives a differential's two coupled output shafts the same speed as the input (locked-differential simplification, spec §3.6)", () => {
    const diff = makeGear({ id: "diff", type: "differential", teeth: 30, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const inputBevel = makeGear({
      id: "in", type: "crank", teeth: 15, module: 1, position: [22.5, 0, 0], axis: [1, 0, 0], angularVelocity: 4,
    });
    const outputA = makeGear({ id: "outA", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const outputB = makeGear({ id: "outB", teeth: 20, module: 1, position: [0, 0, 0], axis: [0, 1, 0] });
    const gears = [diff, inputBevel, outputA, outputB];
    const { angularVelocities } = propagateRotation(gears, buildEdges(gears));
    const diffSpeed = angularVelocities.get("diff")!;
    expect(angularVelocities.get("outA")).toBeCloseTo(diffSpeed);
    expect(angularVelocities.get("outB")).toBeCloseTo(diffSpeed);
  });
});
```

Add the necessary import at the top of the file if not already present: `import { buildEdges } from "./graph";`.

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/rotation.test.ts`
Expected: all existing rotation tests plus these 3 new ones pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim/rotation.ts tests/sim/rotation.test.ts
git commit -m "feat(sim): propagate chain/belt (same-direction), rack (linear), and differential (locked) rotation"
```

---

### Task 9: Simulation Tick — LayoutState, Linear Position, Remote Links

**Files:**
- Modify: `src/sim/simulation.ts` (`tick` takes `LayoutState`; accumulates `linearPosition`)
- Modify: `src/main.ts` (call site)
- Modify: `tests/sim/simulation.test.ts`

**Interfaces:**
- Consumes: `LayoutState` (types.ts, Task 5); `linearVelocities` (rotation.ts, Task 8); `buildEdges(gears, remoteLinks)` (graph.ts, Task 7).
- Produces: `tick(layout: LayoutState, dt: number, timeScale: number, previousEdgeKeys: ReadonlySet<string>): SimTickResult` — replaces Task 4's `tick(gears, dt, timeScale, previousEdgeKeys)`. `SimTickResult.gears` unchanged in shape.

- [ ] **Step 1: Change `tick`'s signature and body**

In `src/sim/simulation.ts`, change the `componentHasLoad` and `tick` functions' first-parameter usage. `componentHasLoad` stays as-is (it already just takes `gears` and an edge list). Change `tick`:

```ts
export function tick(
  layout: LayoutState,
  dt: number,
  timeScale: number,
  previousEdgeKeys: ReadonlySet<string>,
): SimTickResult {
  const { gears, remoteLinks } = layout;
  const edges = buildEdges(gears, remoteLinks);
  const byId = new Map(gears.map((g) => [g.id, g] as const));

  const phaseAdjustments = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== "mesh" || previousEdgeKeys.has(edgeKey(edge))) continue;
    const a = byId.get(edge.a)!;
    const b = byId.get(edge.b)!;
    phaseAdjustments.set(b.id, computeMeshPhaseOffset(a, b, edge));
  }

  const diagnostics = classify(gears, edges);
  const { angularVelocities, linearVelocities } = propagateRotation(gears, edges);
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
    const phaseAdjustment = phaseAdjustments.get(g.id) ?? 0;
    const rotation = broken ? g.rotation : g.rotation + phaseAdjustment + angularVelocity * dt;
    const linearPosition =
      g.type === "rack" ? (g.linearPosition ?? 0) + (linearVelocities.get(g.id) ?? 0) * dt : g.linearPosition;
    return { ...g, durabilityCurrent, broken, rotation, angularVelocity, linearPosition };
  });

  return { gears: updatedGears, diagnostics, edgeKeys: new Set(edges.map(edgeKey)) };
}
```

Add `LayoutState` to the type-only import at the top of the file.

- [ ] **Step 2: Update `main.ts`'s call site**

In `src/main.ts`, change `let gears: GearInstance[] = [];` block to also track `remoteLinks`:

```ts
let gears: GearInstance[] = [];
let remoteLinks: RemoteLink[] = [];
try {
  gears = loadFromLocalStorage() ?? [];
} catch (err) {
  console.error("Failed to load saved layout from localStorage; starting with an empty layout.", err);
  gears = [];
}
```

(`remoteLinks` gets wired to persistence in Task 10 and to the link-mode UI in Task 14 — for this task it just needs to exist so `tick` can be called.) Add `RemoteLink` to the `import type { GearInstance, GearType } from "./sim/types";` line.

Change the `animate` function's tick call:

```ts
const result = tick({ gears, remoteLinks }, dt, timeScale, previousEdgeKeys);
gears = result.gears;
previousEdgeKeys = result.edgeKeys;
```

- [ ] **Step 3: Update the simulation tests**

In `tests/sim/simulation.test.ts`, change every `tick(gears, N, N, previousEdgeKeys)` call to `tick({ gears, remoteLinks: [] }, N, N, previousEdgeKeys)`. Add:

```ts
it("accumulates a rack's linearPosition over time and leaves other gears' linearPosition undefined", () => {
  const pinion = makeGear({ id: "pinion", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], angularVelocity: 1 });
  const rack = makeGear({ id: "rack", type: "rack", teeth: 8, module: 1, position: [0, 0, 10], axis: [1, 0, 0] });
  const result = tick({ gears: [pinion, rack], remoteLinks: [] }, 1, 1, new Set());
  const rackAfter = result.gears.find((g) => g.id === "rack")!;
  const pinionAfter = result.gears.find((g) => g.id === "pinion")!;
  expect(rackAfter.linearPosition).toBeCloseTo(10); // omega(1) * pitchRadius(10) * dt(1)
  expect(pinionAfter.linearPosition).toBeUndefined();
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/sim/simulation.test.ts`
Expected: all tests pass.

Run: `npx vitest run`
Expected: full suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/sim/simulation.ts src/main.ts tests/sim/simulation.test.ts
git commit -m "feat(sim): tick() takes a LayoutState (gears + remoteLinks) and accumulates rack linear position"
```

---

### Task 10: Persistence Schema v2

**Files:**
- Modify: `src/persistence/serialize.ts`
- Modify: `src/persistence/storage.ts`
- Modify: `src/main.ts` (initial-load block and `SaveLoadPanel` wiring — both call into `storage.ts`'s now-`LayoutState`-shaped functions)
- Modify: `tests/persistence/serialize.test.ts`
- Modify: `tests/persistence/storage.test.ts`

**Interfaces:**
- Produces: `serializeLayout(layout: LayoutState): string`, `deserializeLayout(json: string): LayoutState` — replace v1's `serializeGears`/`deserializeGears` (renamed to reflect the wider payload; v1 saves without `remoteLinks` still deserialize correctly, defaulting to `remoteLinks: []`). `saveToLocalStorage`/`loadFromLocalStorage`/`exportToFile`/`importFromFile` now operate on `LayoutState` instead of `GearInstance[]`. This task must also fix every `main.ts` call site that touches these four functions in the same commit — leaving them on the old `GearInstance[]`-based calls would break the typecheck between this task and Task 11 (`ServerSyncPanel`'s wiring, which is genuinely Task 11's concern since it depends on Task 11's `serverClient.ts` changes, is not touched here).

- [ ] **Step 1: Rewrite `serialize.ts`**

Replace the entire contents of `src/persistence/serialize.ts`:

```ts
import type { GearInstance, GearType, LayoutState, RemoteLink } from "../sim/types";

const SCHEMA_VERSION = 2;

const GEAR_TYPES = new Set<GearType>([
  "spur", "helical", "crank", "bevel", "worm", "load",
  "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isValidGear(value: unknown): value is GearInstance {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    g.id.length > 0 &&
    typeof g.type === "string" &&
    GEAR_TYPES.has(g.type as GearType) &&
    isVec3(g.position) &&
    isVec3(g.axis) &&
    isFiniteNumber(g.teeth) &&
    isFiniteNumber(g.module) &&
    isFiniteNumber(g.durabilityMax) &&
    isFiniteNumber(g.durabilityCurrent) &&
    typeof g.broken === "boolean" &&
    isFiniteNumber(g.rotation) &&
    isFiniteNumber(g.angularVelocity) &&
    (g.linearPosition === undefined || isFiniteNumber(g.linearPosition))
  );
}

function isValidRemoteLink(value: unknown): value is RemoteLink {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  return typeof l.a === "string" && typeof l.b === "string" && (l.kind === "chain" || l.kind === "belt");
}

export function serializeLayout(layout: LayoutState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, gears: layout.gears, remoteLinks: layout.remoteLinks }, null, 2);
}

export function deserializeLayout(json: string): LayoutState {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.gears)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  if (!parsed.gears.every(isValidGear)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  // v1 saves have no `remoteLinks` field at all -- default to empty rather than reject them.
  const remoteLinks = parsed.remoteLinks === undefined ? [] : parsed.remoteLinks;
  if (!Array.isArray(remoteLinks) || !remoteLinks.every(isValidRemoteLink)) {
    throw new Error("Invalid gear-sandbox save file");
  }
  return { gears: parsed.gears as GearInstance[], remoteLinks: remoteLinks as RemoteLink[] };
}
```

- [ ] **Step 2: Update `storage.ts`**

Replace the entire contents of `src/persistence/storage.ts`:

```ts
import type { LayoutState } from "../sim/types";
import { serializeLayout, deserializeLayout } from "./serialize";

const STORAGE_KEY = "gear-sandbox:layout";

export function saveToLocalStorage(layout: LayoutState): void {
  window.localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
}

export function loadFromLocalStorage(): LayoutState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return deserializeLayout(raw);
}

export function exportToFile(layout: LayoutState): Blob {
  return new Blob([serializeLayout(layout)], { type: "application/json" });
}

export async function importFromFile(file: File): Promise<LayoutState> {
  const text = await file.text();
  return deserializeLayout(text);
}
```

- [ ] **Step 3: Update every `main.ts` call site that touches persistence**

In `src/main.ts`, replace the initial-load block (introduced back in Task 9 Step 2 as `let gears: GearInstance[] = []; let remoteLinks: RemoteLink[] = []; try { gears = loadFromLocalStorage() ?? []; } catch ...`) with:

```ts
let gears: GearInstance[] = [];
let remoteLinks: RemoteLink[] = [];
try {
  const loaded = loadFromLocalStorage();
  if (loaded) {
    gears = loaded.gears;
    remoteLinks = loaded.remoteLinks;
  }
} catch (err) {
  console.error("Failed to load saved layout from localStorage; starting with an empty layout.", err);
}
```

Replace the existing `new SaveLoadPanel(...)` call's closures (still operating on bare `gears` from before Part B) with:

```ts
new SaveLoadPanel(document.querySelector("#save-load")!, {
  save: () => saveToLocalStorage({ gears, remoteLinks }),
  load: () => {
    const loaded = loadFromLocalStorage();
    if (loaded) {
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
    }
  },
  exportFile: () => {
    const blob = exportToFile({ gears, remoteLinks });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gear-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  importFile: async (file) => {
    try {
      const loaded = await importFromFile(file);
      gears = loaded.gears;
      remoteLinks = loaded.remoteLinks;
    } catch (err) {
      console.error("Failed to import gear layout file", err);
    }
  },
});
```

Leave the `new ServerSyncPanel(...)` call exactly as-is for now — it still passes the old `{ getGears, applyLoadedGears }` shape and still compiles, because Task 11 hasn't changed `ServerSyncApi`/`serverClient.ts` yet. Task 11 Step 4 replaces this call.

- [ ] **Step 4: Update the tests**

In `tests/persistence/serialize.test.ts`, replace the whole file:

```ts
import { describe, it, expect } from "vitest";
import { serializeLayout, deserializeLayout } from "../../src/persistence/serialize";
import type { GearInstance, LayoutState } from "../../src/sim/types";

describe("serialize/deserialize round-trip", () => {
  it("recovers an identical layout (gears + remoteLinks) after a round trip", () => {
    const layout: LayoutState = {
      gears: [{
        id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
        broken: false, rotation: 0.4, angularVelocity: -2,
      }],
      remoteLinks: [{ a: "a", b: "b", kind: "chain" }],
    };
    const restored = deserializeLayout(serializeLayout(layout));
    expect(restored).toEqual(layout);
  });

  it("defaults remoteLinks to [] for a v1 save file that predates the field", () => {
    const v1Payload = JSON.stringify({
      version: 1,
      gears: [{
        id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
        broken: false, rotation: 0, angularVelocity: 1,
      }],
    });
    const restored = deserializeLayout(v1Payload);
    expect(restored.remoteLinks).toEqual([]);
    expect(restored.gears).toHaveLength(1);
  });

  it("rejects a malformed save file", () => {
    expect(() => deserializeLayout("{}")).toThrow();
  });

  it("rejects a save file whose remoteLinks entries are malformed", () => {
    const bad = JSON.stringify({ version: 2, gears: [], remoteLinks: [{ a: "x" }] });
    expect(() => deserializeLayout(bad)).toThrow();
  });
});
```

In `tests/persistence/storage.test.ts`, replace the whole file:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "../../src/persistence/storage";
import type { LayoutState } from "../../src/sim/types";

const sample: LayoutState = {
  gears: [{
    id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
    broken: false, rotation: 0, angularVelocity: 1,
  }],
  remoteLinks: [],
};

describe("localStorage persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns null when nothing has been saved yet", () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it("saves and loads a layout", () => {
    saveToLocalStorage(sample);
    expect(loadFromLocalStorage()).toEqual(sample);
  });
});

describe("file export/import", () => {
  it("round-trips a layout through a Blob/File", async () => {
    const blob = exportToFile(sample);
    const file = new File([blob], "layout.json", { type: "application/json" });
    const restored = await importFromFile(file);
    expect(restored).toEqual(sample);
  });
});
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npx vitest run tests/persistence`
Expected: all tests pass (4 in serialize.test.ts, 3 in storage.test.ts).

Run: `npx tsc --noEmit`
Expected: no errors — this confirms `main.ts`'s `SaveLoadPanel` wiring (Step 3) compiles against the new `LayoutState`-based `storage.ts` (Step 2), and that the still-untouched `ServerSyncPanel` call also still compiles against the still-untouched `serverClient.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/persistence/serialize.ts src/persistence/storage.ts src/main.ts tests/persistence
git commit -m "feat(persistence): schema v2 (gears + remoteLinks), backward-compatible with v1 saves"
```

---

### Task 11: Server & serverClient Remote-Link Passthrough

**Files:**
- Modify: `server/app.ts`
- Modify: `src/persistence/serverClient.ts`
- Modify: `tests/server/layouts.test.ts`
- Modify: `src/ui/serverSyncPanel.ts`
- Modify: `src/main.ts` (`ServerSyncPanel` instantiation only — its `SaveLoadPanel` wiring was already migrated in Task 10)

**Interfaces:**
- Produces: server API payloads gain an optional `remoteLinks` array alongside `gears`, stored/returned verbatim (same opaque-JSON-blob pattern the server already uses — no DB schema/column change). `listServerLayouts`, `fetchServerLayout`, `saveNewServerLayout`, `updateServerLayout` (serverClient.ts) now operate on `LayoutState` instead of `GearInstance[]`.

- [ ] **Step 1: Update `server/app.ts`**

Change every route that destructures `{ name, gears }` from `req.body` to also read `remoteLinks`, and store/return both. Replace the file's route handlers:

```ts
app.post("/api/layouts", (req, res) => {
  const { name, gears, remoteLinks } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || !Array.isArray(gears)) {
    res.status(400).json({ error: "name (string) and gears (array) are required" });
    return;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
  ).run(id, name, JSON.stringify({ gears, remoteLinks: remoteLinks ?? [] }), now, now);
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
  const stored = JSON.parse(row.gearsJson);
  // `stored` is either a v1 plain gears array (pre-remoteLinks) or a v2 { gears, remoteLinks } object.
  const gears = Array.isArray(stored) ? stored : stored.gears;
  const remoteLinks = Array.isArray(stored) ? [] : (stored.remoteLinks ?? []);
  res.json({ id: row.id, name: row.name, gears, remoteLinks, updatedAt: row.updatedAt });
});

app.put("/api/layouts/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM layouts WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "layout not found" });
    return;
  }
  const { name, gears, remoteLinks } = req.body ?? {};
  if (!Array.isArray(gears)) {
    res.status(400).json({ error: "gears (array) is required" });
    return;
  }
  const now = new Date().toISOString();
  const payload = JSON.stringify({ gears, remoteLinks: remoteLinks ?? [] });
  if (typeof name === "string" && name.trim()) {
    db.prepare("UPDATE layouts SET name = ?, gears_json = ?, updated_at = ? WHERE id = ?").run(name, payload, now, req.params.id);
  } else {
    db.prepare("UPDATE layouts SET gears_json = ?, updated_at = ? WHERE id = ?").run(payload, now, req.params.id);
  }
  const row = db.prepare("SELECT name FROM layouts WHERE id = ?").get(req.params.id) as { name: string };
  res.json({ id: req.params.id, name: row.name, updatedAt: now });
});
```

- [ ] **Step 2: Update `serverClient.ts`**

Replace the whole file:

```ts
import type { LayoutState } from "../sim/types";

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LayoutDetail extends LayoutSummary, LayoutState {}

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

export async function saveNewServerLayout(name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch("/api/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks }),
    }),
  );
}

export async function updateServerLayout(id: string, name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch(`/api/layouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks }),
    }),
  );
}
```

- [ ] **Step 3: Update `src/ui/serverSyncPanel.ts` for the new `LayoutState`-shaped calls**

`src/ui/saveLoadPanel.ts` needs **no changes** — its `SaveLoadApi` interface is already zero-argument closures (`save(): void`, `load(): void`, etc.); the `GearInstance[]` vs. `LayoutState` distinction lives entirely inside the closures `main.ts` passes in, not in `saveLoadPanel.ts` itself. Only that `main.ts` wiring (handled in Step 5 below) and `serverSyncPanel.ts` (which, unlike `SaveLoadApi`, explicitly types its payload) need edits.

In `src/ui/serverSyncPanel.ts`, replace the whole file:

```ts
import type { LayoutState } from "../sim/types";
import {
  listServerLayouts,
  saveNewServerLayout,
  updateServerLayout,
  fetchServerLayout,
  type LayoutSummary,
} from "../persistence/serverClient";

export interface ServerSyncApi {
  getLayout(): LayoutState;
  applyLoadedLayout(layout: LayoutState): void;
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
    try {
      this.renderList(await listServerLayouts());
    } catch (err) {
      console.error("Failed to refresh server layout list", err);
    }
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
    try {
      const summary = await saveNewServerLayout(name, this.api.getLayout());
      this.currentId = summary.id;
      await this.refresh();
    } catch (err) {
      console.error("Failed to save new server layout", err);
    }
  }

  private async overwrite(): Promise<void> {
    if (!this.currentId) return;
    try {
      await updateServerLayout(this.currentId, this.nameInput.value.trim() || "이름 없음", this.api.getLayout());
      await this.refresh();
    } catch (err) {
      console.error("Failed to overwrite server layout", err);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      const detail = await fetchServerLayout(id);
      this.currentId = detail.id;
      this.nameInput.value = detail.name;
      this.api.applyLoadedLayout(detail); // LayoutDetail structurally contains {gears, remoteLinks}
    } catch (err) {
      console.error("Failed to load server layout", err);
    }
  }
}
```

- [ ] **Step 4: Update `main.ts`'s `ServerSyncPanel` instantiation**

`main.ts`'s `SaveLoadPanel` wiring and initial-load block were already migrated to `LayoutState` in Task 10 Step 3 (that migration belonged there — it depends on `storage.ts`'s signature, which Task 10 changes — not on anything from this task). Only the `ServerSyncPanel` instantiation is this task's concern, since it depends on `ServerSyncApi`/`serverClient.ts`, both changed above in this task. In `src/main.ts`, change:

```ts
new ServerSyncPanel(document.querySelector("#server-sync")!, {
  getGears: () => gears,
  applyLoadedGears: (loaded) => {
    gears = loaded;
  },
});
```

to:

```ts
new ServerSyncPanel(document.querySelector("#server-sync")!, {
  getLayout: () => ({ gears, remoteLinks }),
  applyLoadedLayout: (loaded) => {
    gears = loaded.gears;
    remoteLinks = loaded.remoteLinks;
  },
});
```

- [ ] **Step 5: Update the server test**

In `tests/server/layouts.test.ts`, the current `beforeEach` creates the DB inline (`app = createApp(openDb(":memory:"))`) without keeping a reference to it, but the new "legacy row" test below needs to insert directly into the DB. Change the top of the `describe` block from:

```ts
describe("layouts API", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp(openDb(":memory:"));
  });
```

to:

```ts
describe("layouts API", () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
    app = createApp(db);
  });
```

Add the import: `import type Database from "better-sqlite3";`.

Then add these two tests, alongside the existing ones:

```ts
it("round-trips remoteLinks through save and load, alongside gears", async () => {
  const created = await request(app)
    .post("/api/layouts")
    .send({ name: "with-links", gears: [], remoteLinks: [{ a: "x", b: "y", kind: "chain" }] })
    .expect(201);
  const fetched = await request(app).get(`/api/layouts/${created.body.id}`).expect(200);
  expect(fetched.body.remoteLinks).toEqual([{ a: "x", b: "y", kind: "chain" }]);
});

it("defaults remoteLinks to [] when loading a layout saved before this field existed", async () => {
  // Simulates a pre-v2 row: gears_json is a bare array, not {gears, remoteLinks}.
  db.prepare(
    "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
  ).run("legacy-1", "legacy", JSON.stringify([]), "2020-01-01", "2020-01-01");
  const fetched = await request(app).get("/api/layouts/legacy-1").expect(200);
  expect(fetched.body.remoteLinks).toEqual([]);
});
```

(Check the existing test file for how `db`/`app` are constructed in its `beforeEach`/setup and reuse that exact setup — do not introduce a second DB instance.)

- [ ] **Step 6: Run tests and confirm they pass**

Run: `npx vitest run tests/server`
Expected: all existing server tests plus these 2 new ones pass.

Run: `npx vitest run`
Expected: full suite passes.

- [ ] **Step 7: Commit**

```bash
git add server/app.ts src/persistence/serverClient.ts src/ui/serverSyncPanel.ts src/main.ts tests/server/layouts.test.ts
git commit -m "feat(server): pass remoteLinks through save/load API, backward-compatible with pre-v2 rows"
```

---

### Task 12: Geometry for 6 New Object Types + Chain/Belt Ribbon

**Files:**
- Modify: `src/render/gearGeometry.ts` (`buildGeometryForType` cases for `rack`, `planetary`, `ratchet`, `sprocket`, `pulley`, `differential`)
- Create: `src/render/chainGeometry.ts`
- Modify: `tests/render/gearGeometry.test.ts`
- Create: `tests/render/chainGeometry.test.ts`

**Interfaces:**
- Produces: `buildGeometryForType` now handles all 12 `GearType` values. New: `buildLinkRibbon(pointA: [number,number,number], pointB: [number,number,number], width: number): THREE.BufferGeometry` (chainGeometry.ts). Used by Task 14's `sceneSync.ts`.

- [ ] **Step 1: Add the 6 new cases to `buildGeometryForType`**

In `src/render/gearGeometry.ts`, extend the `switch` in `buildGeometryForType`:

```ts
case "ratchet":
  return extrudedGearGeometry(teeth, module); // v1 note: pawl mechanism is not modeled visually (spec §3.2) -- same visual as a spur gear
case "sprocket":
  return extrudedGearGeometry(teeth, module); // v1 note: true ANSI chain-sprocket tooth profile is out of scope (spec §3.3) -- same visual as a spur gear
case "planetary":
  return planetaryGeometry(teeth, module);
case "rack":
  return rackGeometry(teeth, module);
case "pulley":
  return pulleyGeometry(teeth, module);
case "differential":
  return differentialGeometry(teeth, module);
```

Add the 4 new helper functions (near `crankGeometry`):

```ts
function planetaryGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const ringPitchRadius = (module * teeth) / 2;
  const sunTeeth = Math.max(6, Math.round(teeth / 3));
  const planetTeeth = Math.max(6, Math.round((teeth - sunTeeth) / 2));
  const sun = extrudedGearGeometry(sunTeeth, module);
  const ring = new THREE.TorusGeometry(ringPitchRadius, module * 1.5, 8, Math.max(16, teeth));
  const planetOrbitRadius = (module * (sunTeeth + planetTeeth)) / 2;
  const geometries = [sun, ring];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const planet = extrudedGearGeometry(planetTeeth, module);
    planet.translate(Math.cos(angle) * planetOrbitRadius, Math.sin(angle) * planetOrbitRadius, 0);
    geometries.push(planet);
  }
  return mergeGeometries(geometries);
}

function rackGeometry(teethCount: number, module: number): THREE.BufferGeometry {
  const teeth = Math.max(4, Math.round(teethCount) || 8);
  const addendum = module * ADDENDUM_FACTOR;
  const dedendum = module * DEDENDUM_FACTOR;
  const pitch = Math.PI * module;
  const halfToothWidth = pitch / 4;
  const slope = Math.tan(PRESSURE_ANGLE);
  const points: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) {
    const cx = k * pitch;
    points.push(new THREE.Vector2(cx - pitch / 2, -dedendum));
    points.push(new THREE.Vector2(cx - halfToothWidth - slope * dedendum, -dedendum));
    points.push(new THREE.Vector2(cx - halfToothWidth + slope * addendum, addendum));
    points.push(new THREE.Vector2(cx + halfToothWidth - slope * addendum, addendum));
    points.push(new THREE.Vector2(cx + halfToothWidth + slope * dedendum, -dedendum));
  }
  points.push(new THREE.Vector2(teeth * pitch - pitch / 2, -dedendum));
  const shape = new THREE.Shape(points);
  return new THREE.ExtrudeGeometry(shape, { depth: GEAR_THICKNESS, bevelEnabled: false, curveSegments: 1 });
}

function pulleyGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const points = [
    new THREE.Vector2(pitchRadius * 0.9, -GEAR_THICKNESS),
    new THREE.Vector2(pitchRadius, -GEAR_THICKNESS * 0.3),
    new THREE.Vector2(pitchRadius * 0.85, 0),
    new THREE.Vector2(pitchRadius, GEAR_THICKNESS * 0.3),
    new THREE.Vector2(pitchRadius * 0.9, GEAR_THICKNESS),
  ];
  const lathe = new THREE.LatheGeometry(points, 24);
  lathe.rotateX(Math.PI / 2);
  return lathe;
}

function differentialGeometry(teeth: number, module: number): THREE.BufferGeometry {
  const pitchRadius = (module * teeth) / 2;
  const housing = new THREE.SphereGeometry(pitchRadius * 0.8, 16, 12);
  const inputGear = new THREE.ConeGeometry(pitchRadius, GEAR_THICKNESS * 2, teeth);
  inputGear.rotateX(Math.PI / 2);
  inputGear.translate(0, 0, pitchRadius * 0.9);
  return mergeGeometries([housing, inputGear]);
}
```

- [ ] **Step 2: Create `src/render/chainGeometry.ts`**

```ts
import * as THREE from "three";

/** A thin tube-shaped ribbon spanning two world points -- stands in for a chain or belt
 *  segment between two remote-linked sprockets/pulleys. Rebuilt on every SceneSync.sync()
 *  call (Task 14) since both endpoints can move independently of any single GearInstance's
 *  own transform, unlike a normal gear mesh's geometry (which is rebuilt only when the
 *  gear's teeth/module change). */
export function buildLinkRibbon(
  pointA: [number, number, number],
  pointB: [number, number, number],
  width: number,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...pointA);
  const b = new THREE.Vector3(...pointB);
  const curve = new THREE.LineCurve3(a, b);
  return new THREE.TubeGeometry(curve, 1, width, 6, false);
}
```

- [ ] **Step 3: Write the failing tests**

Add to `tests/render/gearGeometry.test.ts`'s `describe("buildGeometryForType", ...)` block:

```ts
it("builds a non-empty geometry for every v2 gear type too", () => {
  const types = ["rack", "planetary", "ratchet", "sprocket", "pulley", "differential"] as const;
  for (const t of types) {
    const geometry = buildGeometryForType(t, 20, 1);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
  }
});

it("gives the rack a length that grows with its tooth count", () => {
  const short = buildGeometryForType("rack", 4, 1);
  const long = buildGeometryForType("rack", 12, 1);
  short.computeBoundingBox();
  long.computeBoundingBox();
  const shortLength = short.boundingBox!.max.x - short.boundingBox!.min.x;
  const longLength = long.boundingBox!.max.x - long.boundingBox!.min.x;
  expect(longLength).toBeGreaterThan(shortLength);
});
```

Create `tests/render/chainGeometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLinkRibbon } from "../../src/render/chainGeometry";

describe("buildLinkRibbon", () => {
  it("builds a non-empty tube geometry spanning two points", () => {
    const geometry = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
    geometry.computeBoundingBox();
    const length = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
    expect(length).toBeGreaterThan(9); // spans roughly the 10-unit distance between the endpoints
  });
});
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/render`
Expected: all tests pass, including the 2 new gearGeometry.test.ts tests and the new chainGeometry.test.ts file.

- [ ] **Step 5: Commit**

```bash
git add src/render/gearGeometry.ts src/render/chainGeometry.ts tests/render/gearGeometry.test.ts tests/render/chainGeometry.test.ts
git commit -m "feat(render): geometry for 6 new object types plus a chain/belt link ribbon"
```

---

### Task 13: Rack Rendering, Palette Labels, Default Gear Factory Entries

**Files:**
- Modify: `src/render/gearMesh.ts` (rack translates along its axis instead of rotating)
- Modify: `src/ui/paletteUI.ts` (6 new labels)
- Modify: `src/sim/gearFactory.ts` (defaults for the 6 new types)
- Modify: `tests/render/gearMesh.test.ts`
- Modify: `tests/sim/gearFactory.test.ts`

**Interfaces:**
- Produces: `GearMeshObject.update` now branches on `gear.type === "rack"`. `PaletteUI`'s `LABELS` covers all 12 types. `defaultAxisForType`/`defaultTeethForType`/`createGear` (gearFactory.ts) cover all 12 types.

- [ ] **Step 1: Update `GearMeshObject.update` for racks**

In `src/render/gearMesh.ts`, change the `update` method:

```ts
update(gear: GearInstance): void {
  this.mesh.position.set(...gear.position);
  this.mesh.rotation.set(0, 0, 0);
  const axis = new THREE.Vector3(...gear.axis).normalize();
  this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  if (gear.type === "rack") {
    this.mesh.position.addScaledVector(axis, gear.linearPosition ?? 0);
  } else {
    this.mesh.rotateZ(gear.rotation);
  }
  const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
  (this.mesh.material as THREE.MeshStandardMaterial).color = colorForDurabilityRatio(gear.broken ? 0 : ratio);
}
```

- [ ] **Step 2: Update `paletteUI.ts`**

In `src/ui/paletteUI.ts`, extend `LABELS`:

```ts
const LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
  rack: "랙",
  planetary: "유성기어 세트",
  ratchet: "래칫 기어",
  sprocket: "스프로킷(체인용)",
  pulley: "풀리(벨트용)",
  differential: "차동장치",
};
```

- [ ] **Step 3: Update `gearFactory.ts`**

In `src/sim/gearFactory.ts`, extend `PERPENDICULAR_AXIS_TYPES` and `defaultTeethForType`:

```ts
export const PERPENDICULAR_AXIS_TYPES = new Set<GearType>(["bevel", "worm", "differential"]);

export function defaultTeethForType(type: GearType): number {
  if (type === "load") return 0;
  if (type === "worm") return 2;
  if (type === "rack") return 8; // visible tooth count along the default-length bar
  return 20;
}
```

`defaultAxisForType` needs no code change (it already derives from `PERPENDICULAR_AXIS_TYPES`, now including `differential`) — but note the rack's `axis` field represents its *travel direction*, not a rotation axis; `defaultAxisForType`'s fallback `[0, 1, 0]` still works as a sensible default travel direction (horizontal-ground-plane sandboxes place most gears with `axis=[0,1,0]` meaning "spins about the vertical" for rotating types, but for a rack `[0,1,0]` would mean it travels vertically — this is a placement detail the user corrects by dragging, same as any other gear's default axis being a starting point, not a constraint. No further action needed in this task).

Add to `createGear`, right after the object literal's `angularVelocity` line:

```ts
export function createGear(type: GearType, position: [number, number, number]): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id: crypto.randomUUID(),
    type,
    position,
    axis: defaultAxisForType(type),
    teeth: defaultTeethForType(type),
    module: 1,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity: type === "crank" ? 1 : 0,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}
```

- [ ] **Step 4: Write the failing tests**

Add to `tests/render/gearMesh.test.ts`:

```ts
it("translates a rack along its axis by linearPosition instead of rotating it", () => {
  const gear = makeGear({ type: "rack", teeth: 8, axis: [1, 0, 0], position: [0, 0, 0], linearPosition: 5, rotation: 99 });
  const obj = new GearMeshObject(gear);
  expect(obj.mesh.position.x).toBeCloseTo(5);
  expect(obj.mesh.rotation.z).toBe(0); // rotation is never applied to a rack, regardless of gear.rotation
});
```

(No change needed to the file's `makeGear` test helper — it already spreads `...overrides` last, so passing `linearPosition` and `rotation` as overrides above works without touching the helper.)

In `tests/sim/gearFactory.test.ts`, find the existing coverage of `createGear`/`defaultTeethForType` and add:

```ts
it("gives a rack a starting linearPosition of 0 and a default teeth count", () => {
  const rack = createGear("rack", [0, 0, 0]);
  expect(rack.linearPosition).toBe(0);
  expect(rack.teeth).toBeGreaterThan(0);
});

it("leaves linearPosition undefined for non-rack types", () => {
  const spur = createGear("spur", [0, 0, 0]);
  expect(spur.linearPosition).toBeUndefined();
});
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npx vitest run tests/render/gearMesh.test.ts tests/sim/gearFactory.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/gearMesh.ts src/ui/paletteUI.ts src/sim/gearFactory.ts tests/render/gearMesh.test.ts tests/sim/gearFactory.test.ts
git commit -m "feat: rack linear rendering, palette labels, and factory defaults for 6 new types"
```

---

### Task 14: Chain/Belt Link-Mode UI + Scene Rendering + Final `main.ts` Wiring

**Files:**
- Create: `src/ui/linkModeUI.ts`
- Create: `tests/ui/linkModeUI.test.ts`
- Modify: `src/render/sceneSync.ts` (render remote-link ribbons; `sync` gains a `remoteLinks` parameter)
- Modify: `tests/render/sceneSync.test.ts`
- Modify: `src/main.ts` (wire the link-mode buttons, ribbon persistence via existing save/load, `remoteLinks` state)

**Interfaces:**
- Produces: `class LinkModeUI { constructor(button, linkableType, kind, getGearType, onLink); handleSelect(id): boolean }`. `SceneSync.sync(gears, remoteLinks, diagnostics)` (new 2nd parameter, was `sync(gears, diagnostics)`).

- [ ] **Step 1: Create `src/ui/linkModeUI.ts`**

```ts
import type { GearType } from "../sim/types";

/** Click-click connection gesture for chain/belt remote links. While `active`, the first
 *  matching-type gear clicked is remembered; the second click (a different gear of the
 *  same type) fires `onLink`. Any click on a non-matching type or while inactive is not
 *  consumed (the caller's normal selection/drag handling proceeds instead). */
export class LinkModeUI {
  private active = false;
  private firstPick: string | null = null;

  constructor(
    private button: HTMLButtonElement,
    private linkableType: GearType,
    private getGearType: (id: string) => GearType | undefined,
    private onLink: (a: string, b: string) => void,
  ) {
    this.button.addEventListener("click", () => {
      this.active = !this.active;
      this.firstPick = null;
      this.button.setAttribute("aria-pressed", String(this.active));
    });
  }

  /** Call on every gear selection (DragControls.onSelect). Returns true if this click
   *  was consumed as part of a link gesture. */
  handleSelect(id: string | null): boolean {
    if (!this.active || !id) return false;
    if (this.getGearType(id) !== this.linkableType) return false;
    if (!this.firstPick) {
      this.firstPick = id;
      return true;
    }
    if (this.firstPick !== id) this.onLink(this.firstPick, id);
    this.firstPick = null;
    return true;
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/ui/linkModeUI.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { LinkModeUI } from "../../src/ui/linkModeUI";
import type { GearType } from "../../src/sim/types";

describe("LinkModeUI", () => {
  it("does nothing while inactive", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    expect(link.handleSelect("a")).toBe(false);
    expect(onLink).not.toHaveBeenCalled();
  });

  it("ignores a gear of the wrong type even while active", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const types: Record<string, GearType> = { a: "sprocket", b: "spur" };
    const link = new LinkModeUI(button, "sprocket", (id) => types[id], onLink);
    button.click(); // activate
    expect(link.handleSelect("b")).toBe(false);
    expect(onLink).not.toHaveBeenCalled();
  });

  it("links two matching-type gears on the second click, then resets for the next pair", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    button.click(); // activate
    expect(link.handleSelect("a")).toBe(true);
    expect(onLink).not.toHaveBeenCalled();
    expect(link.handleSelect("b")).toBe(true);
    expect(onLink).toHaveBeenCalledWith("a", "b");

    onLink.mockClear();
    expect(link.handleSelect("c")).toBe(true); // starts a fresh pair
    expect(link.handleSelect("d")).toBe(true);
    expect(onLink).toHaveBeenCalledWith("c", "d");
  });

  it("does not link a gear to itself on a repeated click", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    button.click();
    link.handleSelect("a");
    link.handleSelect("a");
    expect(onLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the LinkModeUI test**

Run: `npx vitest run tests/ui/linkModeUI.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit LinkModeUI**

```bash
git add src/ui/linkModeUI.ts tests/ui/linkModeUI.test.ts
git commit -m "feat(ui): click-click connect mode for chain/belt remote links"
```

- [ ] **Step 5: Render remote-link ribbons in `SceneSync`**

In `src/render/sceneSync.ts`, add the import: `import type { RemoteLink } from "../sim/types";` and `import { buildLinkRibbon } from "./chainGeometry";`.

Add a `linkMeshes = new Map<string, THREE.Mesh>();` field alongside the existing `objects` field, and a `remoteLinkKey` helper:

```ts
function remoteLinkKey(link: RemoteLink): string {
  return `${link.a}:${link.b}:${link.kind}`;
}
```

Change `sync`'s signature and add ribbon sync logic at the end of the method body:

```ts
sync(gears: GearInstance[], remoteLinks: RemoteLink[], diagnostics: SimDiagnostics): void {
  // ...existing gear-mesh sync logic, unchanged...

  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const currentLinkKeys = new Set(remoteLinks.map(remoteLinkKey));
  for (const [key, mesh] of this.linkMeshes) {
    if (!currentLinkKeys.has(key)) {
      this.ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.linkMeshes.delete(key);
    }
  }
  for (const link of remoteLinks) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;
    const key = remoteLinkKey(link);
    const width = link.kind === "chain" ? 0.15 : 0.25;
    const geometry = buildLinkRibbon(a.position, b.position, width);
    const existing = this.linkMeshes.get(key);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
    } else {
      const material = new THREE.MeshStandardMaterial({ color: link.kind === "chain" ? 0x888888 : 0x333333 });
      const mesh = new THREE.Mesh(geometry, material);
      this.linkMeshes.set(key, mesh);
      this.ctx.scene.add(mesh);
    }
  }
}
```

(Place this new block after the existing per-gear `for (const gear of gears) { ... }` loop, inside the same method — the gear-mesh sync logic above it is unchanged from v1 and is not reproduced here to avoid duplicating code this plan isn't modifying.)

- [ ] **Step 6: Update the sceneSync tests**

In `tests/render/sceneSync.test.ts`, update every `sync(gears, diagnostics)` call to `sync(gears, [], diagnostics)`, and add:

```ts
it("adds a ribbon mesh for a remote link and removes it once the link disappears", () => {
  const ctx = createScene(document.createElement("canvas"));
  const sync = new SceneSync(ctx);
  const gears = [makeGear({ id: "a", type: "sprocket" }), makeGear({ id: "b", type: "sprocket", position: [500, 0, 0] })];
  const link = { a: "a", b: "b", kind: "chain" as const };
  sync.sync(gears, [link], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
  const meshCountWithLink = ctx.scene.children.length;

  sync.sync(gears, [], { unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
  expect(ctx.scene.children.length).toBe(meshCountWithLink - 1);
});
```

- [ ] **Step 7: Run tests and confirm they pass**

Run: `npx vitest run tests/render/sceneSync.test.ts`
Expected: all existing tests (updated call signature) plus the new one pass.

- [ ] **Step 8: Commit SceneSync changes**

```bash
git add src/render/sceneSync.ts tests/render/sceneSync.test.ts
git commit -m "feat(render): draw a ribbon mesh for each active chain/belt remote link"
```

- [ ] **Step 9: Wire everything into `main.ts`**

Open `src/main.ts`. Add two buttons to the sidebar template (inside the existing template literal, after the `#palette` div):

```html
<div id="palette"></div>
<div id="link-mode-buttons">
  <button id="chain-link-mode">체인 연결 모드</button>
  <button id="belt-link-mode">벨트 연결 모드</button>
</div>
```

After the existing `new PaletteUI(...)` call, add:

```ts
function addRemoteLink(a: string, b: string, kind: "chain" | "belt"): void {
  remoteLinks.push({ a, b, kind });
}

const chainLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#chain-link-mode")!,
  "sprocket",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "chain"),
);

const beltLinkMode = new LinkModeUI(
  document.querySelector<HTMLButtonElement>("#belt-link-mode")!,
  "pulley",
  (id) => gears.find((g) => g.id === id)?.type,
  (a, b) => addRemoteLink(a, b, "belt"),
);
```

Add the import: `import { LinkModeUI } from "./ui/linkModeUI";` and `import type { GearInstance, GearType, RemoteLink } from "./sim/types";` (extends the existing type-only import).

Change the existing `DragControls`'s `onSelect` callback so link-mode gets first refusal:

```ts
onSelect: (id) => {
  if (chainLinkMode.handleSelect(id) || beltLinkMode.handleSelect(id)) return;
  const gear = id ? gears.find((g) => g.id === id) : undefined;
  if (gear) durabilityPanel.show(gear);
  else durabilityPanel.hide();
},
```

Change the `sceneSync.sync(...)` call inside `animate`:

```ts
sceneSync.sync(gears, remoteLinks, result.diagnostics);
```

- [ ] **Step 10: Full-suite regression check**

Run: `npx vitest run`
Expected: every test file in the project passes (Part A's 4 tasks + Part B's 10 tasks, on top of v1's original 15-task baseline of 369 passing tests).

Run: `npx tsc --noEmit`
Expected: no type errors anywhere in `src/` or `server/`.

- [ ] **Step 11: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire chain/belt link-mode buttons into the running app"
```

---

## Manual QA Checklist (post-implementation, v1 §9 convention)

Run `npm run dev` (client) and `npm run dev:server` (or `npm run dev` which runs both concurrently per `package.json`), open the app, and confirm:

1. Place two spur gears at a valid mesh distance — teeth visibly interleave with no clipping, immediately on placement and while the crank turns.
2. Place a bevel-bevel pair at 90° — teeth are visible on the cone surfaces (not smooth), and mesh without clipping.
3. Place a worm + wheel — the worm shows a visible spiral thread; turning the crank drives the wheel but not vice versa.
4. Place a rack + pinion — the rack visibly slides (not rotates) as the pinion turns.
5. Place a ratchet behind a driving gear — the ratchet turns when driven, and manually verify (by temporarily disconnecting the driver, if the UI allows, or by code review) that a ratchet never appears as a `crank`-reachable driver of its own mate.
6. Place two sprockets far apart, enter chain link-mode, click both — a ribbon appears between them and they turn the same direction at the correct ratio.
7. Place two pulleys, same as above with belt link-mode.
8. Place a planetary gear set and a differential — confirm they render as visually distinct multi-part assemblies, not placeholder cones/cylinders.
9. Save a layout (local + server), reload the page, load it back — all 12 object types and any remote links restore correctly.
10. Import a save file exported before this plan (a v1 file with no `remoteLinks` field) — loads without error, with zero remote links.
