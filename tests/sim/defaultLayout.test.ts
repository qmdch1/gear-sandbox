import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "../../src/sim/defaultLayout";
import { buildEdges, classify } from "../../src/sim/graph";
import { tick } from "../../src/sim/simulation";

describe("createDefaultLayout", () => {
  it("places every gear so it meshes/couples cleanly -- no unconnected, unpowered, or overlapping gears", () => {
    const layout = createDefaultLayout();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("includes at least one of each showcased mechanism (bevel turn, worm reduction, differential, planetary, rack)", () => {
    const layout = createDefaultLayout();
    const types = new Set(layout.gears.map((g) => g.type));
    expect(types.has("crank")).toBe(true);
    expect(types.has("bevel")).toBe(true);
    expect(types.has("worm")).toBe(true);
    expect(types.has("differential")).toBe(true);
    expect(types.has("planetary")).toBe(true);
    expect(types.has("load")).toBe(true);
    expect(types.has("rack")).toBe(true);
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
});
