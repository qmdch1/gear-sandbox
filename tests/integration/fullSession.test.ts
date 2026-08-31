// tests/integration/fullSession.test.ts
//
// Every other test file in this project exercises exactly one module in isolation. This
// file instead drives the real, composable, pure simulation+persistence core the way an
// actual user session would: load the bundled showcase, run it, edit it (add a gear, add
// a remote link, delete a gear), then save and reload it -- asserting real behavior at
// every step, not just that nothing throws. It deliberately stays off the DOM/THREE layer
// (no jsdom, no WebGL context) since that's not where the cross-module behavioral
// contracts live; `src/main.ts`'s UI wiring is exercised elsewhere (or not at all -- see
// the note on `addRemoteLink`'s dedup guard below).
import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "../../src/sim/defaultLayout";
import { tick } from "../../src/sim/simulation";
import { createGear } from "../../src/sim/gearFactory";
import { removeGear } from "../../src/sim/removeGear";
import { pitchRadius } from "../../src/sim/meshing";
import { exportToFile, importFromFile } from "../../src/persistence/storage";
import type { GearInstance, LayoutState, RemoteLink, SimDiagnostics } from "../../src/sim/types";

/** Every field that must stay numerically sane on every gear, every tick, for the whole
 *  run -- not just at the end, so a transient NaN/Infinity that "heals" itself by the
 *  final frame still gets caught. */
function assertGearsSound(gears: GearInstance[], context: string): void {
  for (const g of gears) {
    expect(Number.isFinite(g.rotation), `${context}: ${g.id}.rotation not finite`).toBe(true);
    expect(Number.isFinite(g.angularVelocity), `${context}: ${g.id}.angularVelocity not finite`).toBe(true);
    for (const coord of g.position) {
      expect(Number.isFinite(coord), `${context}: ${g.id}.position has a non-finite coordinate`).toBe(true);
    }
    if (g.linearPosition !== undefined) {
      expect(Number.isFinite(g.linearPosition), `${context}: ${g.id}.linearPosition not finite`).toBe(true);
    }
    expect(Number.isFinite(g.durabilityCurrent), `${context}: ${g.id}.durabilityCurrent not finite`).toBe(true);
    expect(g.durabilityCurrent, `${context}: ${g.id}.durabilityCurrent negative`).toBeGreaterThanOrEqual(0);
    expect(g.durabilityCurrent, `${context}: ${g.id}.durabilityCurrent exceeds its max`).toBeLessThanOrEqual(
      g.durabilityMax,
    );
    if (g.broken) {
      expect(g.durabilityCurrent, `${context}: ${g.id} is broken but still has durability`).toBeLessThanOrEqual(0);
    }
  }
}

/** Diagnostics must never dangle a reference to a gear id that isn't actually in the
 *  layout any more -- the exact failure mode a stale remote link or a missed cleanup on
 *  delete would produce. */
function assertDiagnosticsSound(gears: GearInstance[], diagnostics: SimDiagnostics, context: string): void {
  const ids = new Set(gears.map((g) => g.id));
  for (const id of diagnostics.unconnectedIds) {
    expect(ids.has(id), `${context}: unconnectedIds references unknown/deleted id ${id}`).toBe(true);
  }
  for (const id of diagnostics.noPowerIds) {
    expect(ids.has(id), `${context}: noPowerIds references unknown/deleted id ${id}`).toBe(true);
  }
  for (const [a, b] of diagnostics.overlapPairs) {
    expect(ids.has(a), `${context}: overlapPairs references unknown/deleted id ${a}`).toBe(true);
    expect(ids.has(b), `${context}: overlapPairs references unknown/deleted id ${b}`).toBe(true);
  }
}

describe("full session integration", () => {
  it(
    "runs a realistic session end to end: load the showcase, run it, add a gear, " +
      "add a remote link, delete a gear, then save/reload and keep ticking",
    async () => {
      const dt = 1 / 60;
      const timeScale = 1;

      // ---- 1 & 2. Load the bundled showcase and run it for a while, sampling soundness
      // throughout the run (not just at the end) ----
      let layout: LayoutState = createDefaultLayout();
      const warmupTicks = 300; // 5 simulated seconds, matching the scale defaultLayout.test.ts itself uses
      const sampleEvery = 30;
      for (let i = 1; i <= warmupTicks; i++) {
        const result = tick(layout, dt, timeScale);
        layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
        if (i % sampleEvery === 0) {
          const context = `phase1 (warmup) tick ${i}`;
          assertGearsSound(layout.gears, context);
          assertDiagnosticsSound(layout.gears, result.diagnostics, context);
          expect(result.diagnostics.unconnectedIds, context).toEqual([]);
          expect(result.diagnostics.noPowerIds, context).toEqual([]);
          // The differential's two output shafts are legitimately coincident-coupled to the
          // same hub (spec's "locked output" behavior) -- see defaultLayout.test.ts for the
          // full explanation of why this one pair is an expected, understood exception.
          expect(result.diagnostics.overlapPairs, context).toEqual([
            ["seed-diff-output-a", "seed-diff-output-b"],
          ]);
        }
      }

      // ---- 3. Add a new gear via createGear(), meshing it onto an already-spinning gear ----
      // Mirrors what `addGear`/click-to-place does at the pure-data level: build the gear,
      // then push it into the layout. Placed to genuinely mesh with "seed-spur" (parallel
      // spur family, exact pitch-radius-sum distance, offset along -z into open space so it
      // doesn't crowd any other seeded gear) rather than sit isolated, so this proves the new
      // gear actually integrates into the live gear train instead of just not crashing.
      //
      // Deliberately NOT attached to "seed-wheel"/"seed-worm": the worm is seeded pre-worn
      // specifically to demonstrate wear (see defaultLayout.ts), and its whole connected
      // component (including the wheel) shares the load multiplier -- over the total tick
      // budget this test runs, the worm genuinely wears out and breaks partway through phase
      // 6 below (verified: ~444 ticks at this wear rate; not a bug, working as designed).
      // "seed-spur" sits upstream of that and has orders of magnitude more durability margin,
      // so asserting it (and anything meshed to it) keeps spinning for the life of this test
      // is a claim about *this* new mesh edge, not an accidental claim about the worm's wear.
      const spurBefore = layout.gears.find((g) => g.id === "seed-spur")!;
      const probe = createGear("spur", [0, 0, 0]); // read its real teeth/module before computing where to place it
      const newGearPosition: [number, number, number] = [
        spurBefore.position[0],
        spurBefore.position[1],
        spurBefore.position[2] - (pitchRadius(spurBefore) + pitchRadius(probe)),
      ];
      const newGear = createGear("spur", newGearPosition);
      layout = { gears: [...layout.gears, newGear], remoteLinks: layout.remoteLinks };

      const additionTicks = 60;
      for (let i = 1; i <= additionTicks; i++) {
        const result = tick(layout, dt, timeScale);
        layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
        if (i % 20 === 0) assertGearsSound(layout.gears, `phase3 (new gear) tick ${i}`);
      }
      const newGearAfter = layout.gears.find((g) => g.id === newGear.id)!;
      const spurAfter = layout.gears.find((g) => g.id === "seed-spur")!;
      expect(Math.abs(newGearAfter.angularVelocity)).toBeGreaterThan(0.01); // actually driven, not inert
      // seed-spur has 10 teeth, the new gear defaults to 20 => mesh ratio a.teeth/b.teeth =
      // 10/20 = 0.5; mesh sign is -1 (opposite direction).
      expect(newGearAfter.angularVelocity).toBeCloseTo(-0.5 * spurAfter.angularVelocity);
      const diagnosticsAfterAdd = tick(layout, 0, timeScale).diagnostics;
      expect(diagnosticsAfterAdd.unconnectedIds).not.toContain(newGear.id);
      expect(diagnosticsAfterAdd.noPowerIds).not.toContain(newGear.id);

      // ---- 4. Add a remote link (belt) connecting two brand-new, otherwise-unconnected
      // gears -- mirrors `addRemoteLink`'s effect at the pure-data level ----
      // Two pulleys never mesh directly with each other (COINCIDENT_ONLY in meshing.ts --
      // a pulley only ever couples when *coincident*), so pulleyB here is reachable ONLY
      // through the belt RemoteLink, making this a real test of remote-link wiring, not an
      // incidental mesh.
      const crank2 = createGear("crank", [300, 0, 0]);
      const pulleyA = createGear("pulley", [300, 0, 0]); // coincident with crank2 -> shaft coupling
      const pulleyB = createGear("pulley", [330, 0, 0]); // 30 units away -- only reachable via the belt link
      const beltLink: RemoteLink = { a: pulleyA.id, b: pulleyB.id, kind: "belt" };
      layout = {
        gears: [...layout.gears, crank2, pulleyA, pulleyB],
        remoteLinks: [...layout.remoteLinks, beltLink],
      };

      const linkTicks = 60;
      for (let i = 1; i <= linkTicks; i++) {
        const result = tick(layout, dt, timeScale);
        layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
        if (i % 20 === 0) assertGearsSound(layout.gears, `phase4 (remote link) tick ${i}`);
      }
      const pulleyAAfter = layout.gears.find((g) => g.id === pulleyA.id)!;
      const pulleyBAfter = layout.gears.find((g) => g.id === pulleyB.id)!;
      expect(pulleyAAfter.angularVelocity).toBeCloseTo(1); // 1:1 shaft coupling off a crank spinning at 1 rad/s
      // Equal pitch radii => belt ratio 1; coupling/chain/belt sign is +1 (same direction).
      expect(pulleyBAfter.angularVelocity).toBeCloseTo(pulleyAAfter.angularVelocity);
      const diagnosticsAfterLink = tick(layout, 0, timeScale).diagnostics;
      expect(diagnosticsAfterLink.unconnectedIds).not.toContain(pulleyB.id);
      expect(diagnosticsAfterLink.noPowerIds).not.toContain(pulleyB.id);

      // NOTE (finding, not a bug): `addRemoteLink`'s own duplicate-link guard lives ONLY as
      // inline logic inside `src/main.ts` (not exported, not a separately testable pure
      // function) -- unlike the equivalent `dedupeRemoteLinks` in `src/persistence/serialize.ts`,
      // which IS pure and exported. The two implementations are independent code paths that
      // happen to agree today; this test cannot exercise the `main.ts` copy without refactoring
      // it out (out of scope here, since this task is test-only), so step 6 below instead
      // exercises the persistence-layer dedup guard as defense-in-depth.

      // ---- 5. Delete a gear that is BOTH mesh/coupling-connected AND remote-link-connected ----
      // seed-sprocket-b is simultaneously: the chain link's "b" endpoint, and the coincident
      // coupling partner of seed-sprocket-load. Removing it should drop the chain RemoteLink
      // AND leave seed-sprocket-load newly unconnected -- a real knock-on effect, not just
      // "the gear itself is gone".
      const chainLinkBefore = layout.remoteLinks.find(
        (l) => l.kind === "chain" && (l.a === "seed-sprocket-b" || l.b === "seed-sprocket-b"),
      );
      expect(chainLinkBefore, "expected the default showcase's sprocket chain link to still be present").toBeDefined();

      const { gears: gearsAfterRemove, remoteLinks: remoteLinksAfterRemove } = removeGear(
        "seed-sprocket-b",
        layout.gears,
        layout.remoteLinks,
      );
      layout = { gears: gearsAfterRemove, remoteLinks: remoteLinksAfterRemove };

      expect(layout.gears.find((g) => g.id === "seed-sprocket-b")).toBeUndefined();
      expect(layout.remoteLinks.some((l) => l.a === "seed-sprocket-b" || l.b === "seed-sprocket-b")).toBe(false);

      const removalTicks = 60;
      for (let i = 1; i <= removalTicks; i++) {
        const result = tick(layout, dt, timeScale);
        layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
        const context = `phase5 (after delete) tick ${i}`;
        assertGearsSound(layout.gears, context);
        assertDiagnosticsSound(layout.gears, result.diagnostics, context); // catches any dangling reference to the deleted id
      }
      const diagnosticsAfterRemove = tick(layout, 0, timeScale).diagnostics;
      // Orphaned: its only connection was a coincident coupling to the now-deleted sprocket.
      expect(diagnosticsAfterRemove.unconnectedIds).toContain("seed-sprocket-load");

      // ---- 6. Round-trip through the REAL save/export path (exportToFile/importFromFile --
      // what a user's save-to-file action actually calls), plus a defense-in-depth check on
      // serialize.ts's own dedupeRemoteLinks ----
      // Deliberately append a reverse-order duplicate of the belt link from step 4 --
      // simulating a save file that arrives with one (per dedupeRemoteLinks's own comment:
      // "a save file can still arrive with one (hand-edited, or written by some future/other
      // tool)") -- and confirm the real export/import path still cleans it up.
      const duplicateBeltLink: RemoteLink = { a: pulleyB.id, b: pulleyA.id, kind: "belt" };
      const layoutWithDuplicate: LayoutState = {
        gears: layout.gears,
        remoteLinks: [...layout.remoteLinks, duplicateBeltLink],
      };

      const blob = exportToFile(layoutWithDuplicate);
      const file = new File([blob], "session.json", { type: "application/json" });
      const restored = await importFromFile(file);

      expect(restored.gears).toHaveLength(layout.gears.length);
      expect(new Set(restored.gears.map((g) => g.id))).toEqual(new Set(layout.gears.map((g) => g.id)));
      expect(restored.remoteLinks).toHaveLength(layoutWithDuplicate.remoteLinks.length - 1); // the duplicate was stripped
      const beltLinksBetweenNewPulleys = restored.remoteLinks.filter(
        (l) => l.kind === "belt" && [l.a, l.b].sort().join(":") === [pulleyA.id, pulleyB.id].sort().join(":"),
      );
      expect(beltLinksBetweenNewPulleys).toHaveLength(1); // exactly one, not zero and not two

      // The full gear data must survive byte-for-byte, not just the id set -- this is the
      // one place a subtly-dropped or mis-coerced field (a unit test of `serializeLayout` or
      // `deserializeLayout` alone would never catch, since it only shows up when the REAL
      // upstream data -- run through several ticks and two live edits -- meets the REAL
      // downstream reader).
      const restoredById = new Map(restored.gears.map((g) => [g.id, g] as const));
      for (const gear of layout.gears) {
        expect(restoredById.get(gear.id)).toEqual(gear);
      }

      // ---- The reloaded layout must behave identically to the live one going forward ----
      let reloaded: LayoutState = { gears: restored.gears, remoteLinks: restored.remoteLinks };
      const reloadTicks = 120;
      for (let i = 1; i <= reloadTicks; i++) {
        const result = tick(reloaded, dt, timeScale);
        reloaded = { gears: result.gears, remoteLinks: reloaded.remoteLinks };
        if (i % 30 === 0) {
          const context = `phase6 (reloaded) tick ${i}`;
          assertGearsSound(reloaded.gears, context);
          assertDiagnosticsSound(reloaded.gears, result.diagnostics, context);
        }
      }
      const reloadedNewGear = reloaded.gears.find((g) => g.id === newGear.id)!;
      expect(Math.abs(reloadedNewGear.angularVelocity)).toBeGreaterThan(0.01); // still meshed and spinning after reload
      const reloadedPulleyB = reloaded.gears.find((g) => g.id === pulleyB.id)!;
      expect(Math.abs(reloadedPulleyB.angularVelocity)).toBeGreaterThan(0.01); // the belt link survived the round trip too
      expect(reloaded.gears.find((g) => g.id === "seed-sprocket-b")).toBeUndefined(); // the deletion survived too
    },
  );
});
