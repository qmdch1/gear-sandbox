import { describe, it, expect } from "vitest";
import { createCastlePreset, createCastleProps } from "../../../src/sim/presets/castle";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createCastlePreset", () => {
  it("builds a valid LayoutState: two gears, unique ids, no remote links", () => {
    const layout = createCastlePreset();
    expect(layout.gears).toHaveLength(2);
    expect(layout.remoteLinks).toEqual([]);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["성문_손잡이", "성문_도개교"]);
  });

  it("places the winch handle and gate at their exact designed pitch radii, positions, and (deliberately house-atypical) axes", () => {
    const layout = createCastlePreset();
    const [handle, gate] = layout.gears;

    expect(handle.type).toBe("crank");
    expect(handle.teeth).toBe(14);
    expect(handle.module).toBe(1);
    expect(handle.position).toEqual([0, 0, 0]);
    expect(handle.axis).toEqual([1, 0, 0]); // upright winch-wheel orientation, not the usual [0,1,0]
    expect(handle.angularVelocity).toBe(0.5);
    expect((handle.module * handle.teeth) / 2).toBe(7); // pitchRadius = 7

    expect(gate.type).toBe("rack");
    expect(gate.teeth).toBe(8);
    expect(gate.module).toBe(1);
    expect(gate.position).toEqual([7, 0, 0]); // exactly the handle's pitchRadius away on X
    expect(gate.axis).toEqual([0, 1, 0]); // vertical travel line, not the usual [0,0,1]
    expect(gate.linearPosition).toBe(0);
  });

  it("forms a real mesh edge via the real evaluatePair, perpendicular axes, exact line-pitch distance, crank driving the rack one-way", () => {
    const layout = createCastlePreset();
    const [handle, gate] = layout.gears;

    const edge = evaluatePair(handle, gate);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    // a=handle (crank), b=gate (rack); the rack branch's oneWay convention means "aToB"
    // here is exactly "the pinion (a) drives the rack (b)".
    expect(edge!.a).toBe(handle.id);
    expect(edge!.b).toBe(gate.id);
    expect(edge!.oneWay).toBe("aToB");

    // Same result regardless of argument order -- the pinion is always the sole driver.
    const swapped = evaluatePair(gate, handle);
    expect(swapped).not.toBeNull();
    expect(swapped!.a).toBe(gate.id);
    expect(swapped!.b).toBe(handle.id);
    expect(swapped!.oneWay).toBe("bToA"); // still "handle drives gate", just relabeled for the swapped a/b
  });

  it("reports zero diagnostics problems -- a simple, fully powered, fully connected 2-gear mesh", () => {
    const layout = createCastlePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("accumulates the gate's linearPosition monotonically at the exact rate handleAngularVelocity * pitchRadius(handle), sampled across hundreds of ticks", () => {
    let layout = createCastlePreset();
    const handleSpeed = layout.gears[0].angularVelocity; // 0.5, the commanded crank input
    const handlePitchRadius = 7;
    const expectedLinearSpeed = handleSpeed * handlePitchRadius; // 3.5 world units / second
    const dt = 1 / 60;

    let previousLinearPosition = 0;
    for (let i = 0; i < 300; i++) {
      const result = tick(layout, dt, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const handle = layout.gears.find((g) => g.id === "성문_손잡이")!;
      const gate = layout.gears.find((g) => g.id === "성문_도개교")!;

      // The crank's own commanded speed never changes tick to tick.
      expect(handle.angularVelocity).toBe(handleSpeed);

      // The gate's linearPosition advances by exactly the expected amount each tick.
      const expectedLinearPosition = expectedLinearSpeed * dt * (i + 1);
      expect(gate.linearPosition).toBeCloseTo(expectedLinearPosition, 10);

      // Monotonically increasing -- the gate is genuinely rising, never stuck or reversing.
      expect(gate.linearPosition!).toBeGreaterThan(previousLinearPosition);
      previousLinearPosition = gate.linearPosition!;

      expect(handle.broken).toBe(false);
      expect(gate.broken).toBe(false);
    }

    // After 300 ticks at dt=1/60 (5 real seconds), the gate has moved 3.5 * 5 = 17.5 units.
    const finalGate = layout.gears.find((g) => g.id === "성문_도개교")!;
    expect(finalGate.linearPosition).toBeCloseTo(17.5, 8);

    // The winch handle itself has genuinely turned (not stalled at rotation 0).
    const finalHandle = layout.gears.find((g) => g.id === "성문_손잡이")!;
    expect(Math.abs(finalHandle.rotation)).toBeGreaterThan(0);
  });

  it("supplies a portcullis gate panel that slides with the rack (slideWith), plus the stone gatehouse", () => {
    const props = createCastleProps();
    const gatePanels = props.filter((p) => p.slideWith === "성문_도개교");
    // The wooden panel + its iron cross-bands all follow the rack's vertical travel.
    expect(gatePanels.length).toBeGreaterThanOrEqual(2);
    expect(gatePanels.every((p) => p.kind === "box")).toBe(true);
    // And there's still a static stone frame (towers/lintel) that does NOT slide.
    expect(props.some((p) => p.slideWith === undefined)).toBe(true);
  });
});
