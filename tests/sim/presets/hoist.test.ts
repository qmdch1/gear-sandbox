import { describe, it, expect } from "vitest";
import { createHoistPreset } from "../../../src/sim/presets/hoist";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createHoistPreset", () => {
  it("builds a valid LayoutState: 3 gears (1 crank + 2 pulleys), unique ids, 1 belt link", () => {
    const layout = createHoistPreset();
    expect(layout.gears).toHaveLength(3);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["기중기_손잡이", "기중기_소형풀리", "기중기_대형풀리"]);

    expect(layout.remoteLinks).toHaveLength(1);
    expect(layout.remoteLinks).toEqual([
      { a: "기중기_소형풀리", b: "기중기_대형풀리", kind: "belt" },
    ]);
  });

  it("places the crank and both pulleys at their exact designed positions/teeth/module", () => {
    const layout = createHoistPreset();
    const [crank, small, large] = layout.gears;

    expect(crank.type).toBe("crank");
    expect(crank.teeth).toBe(16);
    expect(crank.module).toBe(1);
    expect(crank.axis).toEqual([0, 1, 0]);
    expect(crank.position).toEqual([0, 0, 0]);
    expect(crank.angularVelocity).toBe(1.0);

    expect(small.type).toBe("pulley");
    expect(small.teeth).toBe(8);
    expect(small.module).toBe(1);
    expect(small.axis).toEqual([0, 1, 0]);
    expect(small.position).toEqual([0, 0, 0]); // coincident with the crank, by design
    expect((small.module * small.teeth) / 2).toBe(4); // pitchRadius = 4

    expect(large.type).toBe("pulley");
    expect(large.teeth).toBe(32);
    expect(large.module).toBe(1);
    expect(large.axis).toEqual([0, 1, 0]);
    expect(large.position).toEqual([30, 0, 0]);
    expect((large.module * large.teeth) / 2).toBe(16); // pitchRadius = 16
  });

  it("forms a real coincident coupling edge between the crank and the small pulley via the real evaluatePair", () => {
    const layout = createHoistPreset();
    const [crank, small, large] = layout.gears;

    const edge = evaluatePair(crank, small);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);

    // The coincident pair is NOT flagged as an overlap -- isOverlapping returns
    // false whenever evaluatePair already finds a valid edge, which this coincident
    // coupling is (same accepted pattern car.test.ts verifies for its own
    // engine/front-left-wheel pair).
    expect(isOverlapping(crank, small)).toBe(false);

    // The large pulley sits 30 units away from the crank -- well beyond any direct
    // mesh/coupling distance -- so it only connects via the belt RemoteLink, not a
    // direct evaluatePair edge with the crank.
    expect(evaluatePair(crank, large)).toBeNull();
    expect(isOverlapping(crank, large)).toBe(false);
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, no overlaps", () => {
    const layout = createHoistPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("turns the large drum pulley at EXACTLY 1/4 the crank's angular velocity -- same sign, NOT the same speed -- sampled across hundreds of ticks", () => {
    let layout = createHoistPreset();
    const crankSpeed = layout.gears[0].angularVelocity; // 1.0, the commanded crank input

    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const crank = layout.gears.find((g) => g.id === "기중기_손잡이")!;
      const small = layout.gears.find((g) => g.id === "기중기_소형풀리")!;
      const large = layout.gears.find((g) => g.id === "기중기_대형풀리")!;

      // The crank's own commanded speed never changes tick to tick.
      expect(crank.angularVelocity).toBe(crankSpeed);

      // The small pulley is coincident-coupled 1:1 with the crank.
      expect(small.angularVelocity).toBe(crankSpeed);

      // The large drum pulley turns at EXACTLY 0.25x the crank's speed -- a REAL
      // mechanical-advantage speed reduction, the opposite claim from car.ts's "all
      // four wheels equal speed" synchronization demo. Same sign too: belt/coupling
      // edges use sign +1 in propagateRotation, never the -1 an ordinary tooth mesh
      // gets, so there's no reversal anywhere in this chain.
      expect(large.angularVelocity).toBe(crankSpeed * 0.25);
      expect(large.angularVelocity).not.toBe(crankSpeed);
      expect(Math.sign(large.angularVelocity)).toBe(Math.sign(crankSpeed));

      expect(crank.broken).toBe(false);
      expect(small.broken).toBe(false);
      expect(large.broken).toBe(false);
    }

    // After many ticks, everything has actually turned (not stalled at rotation 0).
    for (const gear of layout.gears) {
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });
});
