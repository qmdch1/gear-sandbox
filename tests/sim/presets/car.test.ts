import { describe, it, expect } from "vitest";
import { createCarPreset } from "../../../src/sim/presets/car";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createCarPreset", () => {
  it("builds a valid LayoutState: 5 gears (1 engine + 4 wheels), unique ids, 3 spanning-tree belt links", () => {
    const layout = createCarPreset();
    expect(layout.gears).toHaveLength(5);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "자동차_엔진",
      "자동차_좌앞바퀴",
      "자동차_우앞바퀴",
      "자동차_좌뒷바퀴",
      "자동차_우뒷바퀴",
    ]);

    expect(layout.remoteLinks).toHaveLength(3);
    expect(layout.remoteLinks).toEqual([
      { a: "자동차_좌앞바퀴", b: "자동차_우앞바퀴", kind: "belt" },
      { a: "자동차_좌앞바퀴", b: "자동차_좌뒷바퀴", kind: "belt" },
      { a: "자동차_좌뒷바퀴", b: "자동차_우뒷바퀴", kind: "belt" },
    ]);
  });

  it("places the engine and all four wheels at their exact designed positions/teeth/module", () => {
    const layout = createCarPreset();
    const [engine, fl, fr, rl, rr] = layout.gears;

    expect(engine.type).toBe("crank");
    expect(engine.teeth).toBe(16);
    expect(engine.module).toBe(1);
    expect(engine.axis).toEqual([0, 1, 0]);
    expect(engine.position).toEqual([0, 0, 0]);
    expect(engine.angularVelocity).toBe(-1.0);

    for (const wheel of [fl, fr, rl, rr]) {
      expect(wheel.type).toBe("pulley");
      expect(wheel.teeth).toBe(16);
      expect(wheel.module).toBe(1);
      expect(wheel.axis).toEqual([0, 1, 0]);
      expect((wheel.module * wheel.teeth) / 2).toBe(8); // pitchRadius = 8, identical for all 4
    }

    expect(fl.position).toEqual([0, 0, 0]); // coincident with the engine, by design
    expect(fr.position).toEqual([20, 0, 0]);
    expect(rl.position).toEqual([0, 0, -20]);
    expect(rr.position).toEqual([20, 0, -20]);
  });

  it("forms a real coincident coupling edge between the engine and the front-left wheel via the real evaluatePair", () => {
    const layout = createCarPreset();
    const [engine, fl] = layout.gears;

    const edge = evaluatePair(engine, fl);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("coupling");
    expect(edge!.ratio).toBe(1);

    // And that coincident pair is NOT flagged as an overlap -- isOverlapping returns
    // false whenever evaluatePair already finds a valid edge, which this coincident
    // coupling is (same accepted pattern as defaultLayout.ts's own differential-outputs
    // precedent).
    expect(isOverlapping(engine, fl)).toBe(false);

    // The other three wheels are far enough apart (20+ units, well beyond the 8+8=16
    // combined pitch/overlap radius with tolerance) that none of them mesh directly or
    // overlap with the engine or each other -- they only connect via the belt RemoteLinks.
    const [, , fr, rl, rr] = layout.gears;
    for (const other of [fr, rl, rr]) {
      expect(evaluatePair(engine, other)).toBeNull();
      expect(isOverlapping(engine, other)).toBe(false);
    }
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, no overlaps", () => {
    const layout = createCarPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("keeps all four wheels spinning at EXACTLY the engine's angular velocity -- same magnitude AND sign -- sampled across hundreds of ticks", () => {
    let layout = createCarPreset();
    const engineSpeed = layout.gears[0].angularVelocity; // -1.0, the commanded crank input

    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const engine = layout.gears.find((g) => g.id === "자동차_엔진")!;
      const fl = layout.gears.find((g) => g.id === "자동차_좌앞바퀴")!;
      const fr = layout.gears.find((g) => g.id === "자동차_우앞바퀴")!;
      const rl = layout.gears.find((g) => g.id === "자동차_좌뒷바퀴")!;
      const rr = layout.gears.find((g) => g.id === "자동차_우뒷바퀴")!;

      // The crank's own commanded speed never changes tick to tick.
      expect(engine.angularVelocity).toBe(engineSpeed);

      // Exact 1:1 ratio AND exact sign match for every wheel, at EVERY sampled tick --
      // belt/coupling edges use sign +1 in propagateRotation, never the -1 an ordinary
      // tooth mesh gets, so there's no reversal anywhere in this chain.
      for (const wheel of [fl, fr, rl, rr]) {
        expect(wheel.angularVelocity).toBe(engineSpeed);
        expect(Math.sign(wheel.angularVelocity)).toBe(Math.sign(engineSpeed));
      }

      expect(engine.broken).toBe(false);
      for (const wheel of [fl, fr, rl, rr]) expect(wheel.broken).toBe(false);
    }

    // After many ticks, everything has actually turned (not stalled at rotation 0).
    for (const gear of layout.gears) {
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });
});
