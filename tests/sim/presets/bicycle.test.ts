import { describe, it, expect } from "vitest";
import { createBicyclePreset, createBicycleProps } from "../../../src/sim/presets/bicycle";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createBicyclePreset", () => {
  it("builds pedals+chainring (coincident), a rear cog+hub (coincident), and one drive chain", () => {
    const layout = createBicyclePreset();
    expect(layout.gears.map((g) => g.id)).toEqual([
      "자전거_페달",
      "자전거_체인링",
      "자전거_뒷스프로킷",
      "자전거_뒷바퀴허브",
    ]);
    expect(layout.remoteLinks).toEqual([
      { a: "자전거_체인링", b: "자전거_뒷스프로킷", kind: "chain" },
    ]);

    const pedal = layout.gears[0];
    const chainring = layout.gears[1];
    expect(pedal.type).toBe("crank");
    expect(chainring.type).toBe("sprocket");
    expect(chainring.position).toEqual(pedal.position); // coincident
  });

  it("forms coincident couplings (pedal<->chainring, rear cog<->hub) and no overlaps anywhere", () => {
    const layout = createBicyclePreset();
    const [pedal, chainring, rearCog, rearHub] = layout.gears;

    const pedalEdge = evaluatePair(pedal, chainring);
    expect(pedalEdge!.kind).toBe("coupling");
    const rearEdge = evaluatePair(rearCog, rearHub);
    expect(rearEdge!.kind).toBe("coupling");

    // The chainring and the rear assembly are far apart -- no accidental mesh/overlap.
    expect(isOverlapping(chainring, rearCog)).toBe(false);
    expect(isOverlapping(chainring, rearHub)).toBe(false);
  });

  it("reports zero diagnostics problems", () => {
    const layout = createBicyclePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("gears the rear wheel UP to exactly 2x pedal speed via the 28:14 chain ratio, across many ticks", () => {
    let layout = createBicyclePreset();
    const pedalSpeed = layout.gears[0].angularVelocity; // 1.0
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const pedal = layout.gears.find((g) => g.id === "자전거_페달")!;
      const rearHub = layout.gears.find((g) => g.id === "자전거_뒷바퀴허브")!;
      expect(pedal.angularVelocity).toBe(pedalSpeed);
      // chain ratio = chainring.teeth / rearCog.teeth = 28/14 = 2 -> rear turns 2x pedal,
      // same direction (chain/coupling edges are sign +1).
      expect(rearHub.angularVelocity).toBeCloseTo(pedalSpeed * 2, 9);
      expect(Math.sign(rearHub.angularVelocity)).toBe(Math.sign(pedalSpeed));
    }
  });

  it("supplies a decorative body (two tires, frame tubes, seat, handlebars)", () => {
    const props = createBicycleProps();
    expect(props.length).toBeGreaterThan(6);
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds.has("ring")).toBe(true); // tires
    expect(kinds.has("box")).toBe(true); // frame/seat/bars
  });
});
