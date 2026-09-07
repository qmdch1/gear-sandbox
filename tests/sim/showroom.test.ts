import { describe, it, expect } from "vitest";
import { createShowroomLayout, createShowroomProps } from "../../src/sim/showroom";
import { buildEdges, classify } from "../../src/sim/graph";
import { tick } from "../../src/sim/simulation";

describe("createShowroomLayout", () => {
  it("combines the four finished-object presets (car, airplane, windmill, bicycle) with unique ids", () => {
    const layout = createShowroomLayout();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // no id collisions across presets

    // Every machine is present (spot-check one gear id from each preset).
    for (const id of ["자동차_엔진", "비행기_엔진", "풍차_날개축", "자전거_페달"]) {
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
    for (const id of ["자동차_좌앞바퀴", "비행기_프로펠러", "풍차_수직축", "자전거_뒷바퀴허브"]) {
      const g = layout.gears.find((x) => x.id === id)!;
      expect(Math.abs(g.rotation)).toBeGreaterThan(0);
    }
  });

  it("supplies combined decorative props for all four machines", () => {
    const props = createShowroomProps();
    // Each preset contributes several props; the combined set should be sizeable.
    expect(props.length).toBeGreaterThan(15);
  });
});
