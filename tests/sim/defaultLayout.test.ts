import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "../../src/sim/defaultLayout";
import { buildEdges, classify } from "../../src/sim/graph";
import { tick } from "../../src/sim/simulation";
import type { GearType } from "../../src/sim/types";

describe("createDefaultLayout", () => {
  it("places every gear so it meshes/couples cleanly -- no unconnected or unpowered gears, and only the one expected overlap", () => {
    const layout = createDefaultLayout();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    // The differential's two output shafts are both coincidentally coupled to the same
    // hub (that's what makes them "locked" together -- see spec §3.6), which puts them
    // within each other's overlap-distance too: `isOverlapping` has no way to know two
    // gears are each legitimately coupled to a shared third gear rather than to each
    // other. This is the one inherent, understood exception -- not a placement mistake.
    expect(diagnostics.overlapPairs).toEqual([["seed-diff-output-a", "seed-diff-output-b"]]);
  });

  it("includes at least one of every object type this sandbox supports", () => {
    const layout = createDefaultLayout();
    const types = new Set(layout.gears.map((g) => g.type));
    const allTypes: GearType[] = [
      "spur", "helical", "crank", "bevel", "worm", "load",
      "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
    ];
    for (const type of allTypes) {
      expect(types.has(type)).toBe(true);
    }
  });

  it("includes both a chain link and a belt link", () => {
    const layout = createDefaultLayout();
    expect(layout.remoteLinks.some((l) => l.kind === "chain")).toBe(true);
    expect(layout.remoteLinks.some((l) => l.kind === "belt")).toBe(true);
  });

  it("has all gear ids unique", () => {
    const layout = createDefaultLayout();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps running cleanly for many ticks -- every crank-driven gear ends up rotating, nothing breaks immediately", () => {
    let layout = createDefaultLayout();
    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
    }
    const nonCrankPowered = layout.gears.filter((g) => g.type !== "crank" && g.type !== "load" && g.type !== "rack");
    for (const gear of nonCrankPowered) {
      expect(gear.broken).toBe(false);
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
    const rack = layout.gears.find((g) => g.type === "rack")!;
    expect(rack.broken).toBe(false);
    expect(Math.abs(rack.linearPosition ?? 0)).toBeGreaterThan(0); // reports progress via linearPosition, not rotation
  });

  it("demonstrates the differential's locked-output behaviour with two output shafts spinning at the same speed", () => {
    let layout = createDefaultLayout();
    for (let i = 0; i < 60; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
    }
    const outputA = layout.gears.find((g) => g.id === "seed-diff-output-a")!;
    const outputB = layout.gears.find((g) => g.id === "seed-diff-output-b")!;
    expect(outputA.angularVelocity).not.toBe(0);
    expect(outputB.angularVelocity).toBeCloseTo(outputA.angularVelocity);
  });
});
