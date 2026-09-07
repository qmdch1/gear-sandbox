import { describe, it, expect } from "vitest";
import { createWindmillPreset, createWindmillProps } from "../../../src/sim/presets/windmill";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createWindmillPreset", () => {
  it("meshes the sail hub and the vertical mill shaft as a right-angle bevel pair (perpendicular axes)", () => {
    const layout = createWindmillPreset();
    expect(layout.gears).toHaveLength(2);
    const hub = layout.gears.find((g) => g.id === "풍차_날개축")!;
    const shaft = layout.gears.find((g) => g.id === "풍차_수직축")!;
    // Perpendicular axes: hub about Z (sails face viewer), shaft about Y (vertical mill shaft).
    expect(hub.axis).toEqual([0, 0, 1]);
    expect(shaft.axis).toEqual([0, 1, 0]);
    const dot = hub.axis[0] * shaft.axis[0] + hub.axis[1] * shaft.axis[1] + hub.axis[2] * shaft.axis[2];
    expect(dot).toBe(0);

    const edge = evaluatePair(hub, shaft);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("reports zero diagnostics problems", () => {
    const layout = createWindmillPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("drives the vertical shaft from the wind-driven sail hub across many ticks (shaft actually turns)", () => {
    let layout = createWindmillPreset();
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    const shaft = layout.gears.find((g) => g.id === "풍차_수직축")!;
    expect(Math.abs(shaft.angularVelocity)).toBeGreaterThan(0);
    expect(Math.abs(shaft.rotation)).toBeGreaterThan(0);
  });

  it("supplies a decorative body (tower, cap, sails)", () => {
    const props = createWindmillProps();
    expect(props.length).toBeGreaterThan(2);
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds.has("cylinder")).toBe(true); // tower + cap
    expect(kinds.has("box")).toBe(true); // sails
  });
});
