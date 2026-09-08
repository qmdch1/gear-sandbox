import { describe, it, expect } from "vitest";
import { createShowroomLayout, createShowroomProps } from "../../src/sim/showroom";
import { buildEdges, classify } from "../../src/sim/graph";
import { tick } from "../../src/sim/simulation";

describe("createShowroomLayout", () => {
  it("combines all nine finished machines with unique ids across every preset", () => {
    const layout = createShowroomLayout();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // no id collisions across presets

    // Every machine is present (spot-check one gear id from each preset).
    for (const id of [
      "자동차_엔진",
      "비행기_엔진",
      "풍차_날개축",
      "자전거_페달",
      "증기기관차_좌동륜1",
      "공장_증기기관_크랭크",
      "물레방아_수차",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("reports zero diagnostics problems -- no cross-preset gear overlaps, every machine fully powered", () => {
    const layout = createShowroomLayout();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("keeps every machine actually running after many ticks (each preset's own crank still drives its train)", () => {
    let layout = createShowroomLayout();
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    // A driven gear from each machine has actually turned.
    for (const id of [
      "자동차_좌앞바퀴",
      "비행기_프로펠러",
      "풍차_수직축",
      "자전거_뒷바퀴허브",
      "증기기관차_우동륜3",
      "공장_3작업_주축기어",
      "물레방아_맷돌",
    ]) {
      const g = layout.gears.find((x) => x.id === id)!;
      expect(Math.abs(g.rotation)).toBeGreaterThan(0);
    }
  });

  it("supplies combined decorative props for all four machines", () => {
    const props = createShowroomProps();
    // Each machine contributes its own body; nine of them make a substantial yard.
    expect(props.length).toBeGreaterThan(400);
  });
  it("keeps every machine's own body with it -- each preset's props land on its own offset", () => {
    // A props offset that did not match its layout's offset would leave a machine's body
    // standing in an empty patch of yard while its gears turned somewhere else entirely.
    const props = createShowroomProps();
    const gears = createShowroomLayout().gears;
    // The locomotive sits one grid cell left and one back: x -170, z -150.
    const loco = gears.filter((g) => g.id.startsWith("증기기관차_"));
    expect(loco.length).toBeGreaterThan(0);
    for (const g of loco) {
      expect(g.position[0]).toBeLessThan(-140);
      expect(g.position[2]).toBeLessThan(-100);
    }
    // Its body must be in that same cell, not back at the origin.
    const locoBody = props.filter((p) => p.attachTo?.startsWith("증기기관차_") || p.linkTo?.gear.startsWith("증기기관차_"));
    expect(locoBody.length).toBeGreaterThan(0);
    for (const p of locoBody) expect(p.position[0]).toBeLessThan(-100);
  });

  it("keeps every machine inside the 500x500 ground plane", () => {
    // Anything beyond +/-250 hangs off the edge of the world and floats over the void.
    for (const g of createShowroomLayout().gears) {
      expect(Math.abs(g.position[0])).toBeLessThan(250);
      expect(Math.abs(g.position[2])).toBeLessThan(250);
    }
    for (const p of createShowroomProps()) {
      expect(Math.abs(p.position[0])).toBeLessThan(250);
      expect(Math.abs(p.position[2])).toBeLessThan(250);
    }
  });
});
