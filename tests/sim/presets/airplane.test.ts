import { describe, it, expect } from "vitest";
import { createAirplanePreset, createAirplaneProps } from "../../../src/sim/presets/airplane";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createAirplanePreset", () => {
  it("mounts an engine crank and a coincident propeller hub at the nose, both facing forward (+Z)", () => {
    const layout = createAirplanePreset();
    expect(layout.gears).toHaveLength(2);
    const engine = layout.gears.find((g) => g.id === "비행기_엔진")!;
    const prop = layout.gears.find((g) => g.id === "비행기_프로펠러")!;
    expect(engine.type).toBe("crank");
    expect(engine.axis).toEqual([0, 0, 1]);
    expect(prop.type).toBe("pulley");
    expect(prop.position).toEqual(engine.position); // coincident hub
    expect(prop.axis).toEqual([0, 0, 1]);
  });

  it("forms a 1:1 coincident coupling between engine and propeller (real evaluatePair), no overlap flagged", () => {
    const layout = createAirplanePreset();
    const [engine, prop] = layout.gears;
    const edge = evaluatePair(engine, prop);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);
    expect(isOverlapping(engine, prop)).toBe(false);
  });

  it("reports zero diagnostics problems", () => {
    const layout = createAirplanePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("spins the propeller at exactly the engine speed across many ticks", () => {
    let layout = createAirplanePreset();
    const engineSpeed = layout.gears[0].angularVelocity;
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const prop = layout.gears.find((g) => g.id === "비행기_프로펠러")!;
      expect(prop.angularVelocity).toBe(engineSpeed);
    }
    expect(Math.abs(layout.gears[1].rotation)).toBeGreaterThan(0);
  });

  it("supplies a decorative body (fuselage, wings, tail, propeller blades)", () => {
    const props = createAirplaneProps();
    expect(props.length).toBeGreaterThan(4);
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds.has("cylinder")).toBe(true); // fuselage
    expect(kinds.has("box")).toBe(true); // wings/tail/blades
  });
});
