import { describe, it, expect } from "vitest";
import { serializeLayout, deserializeLayout } from "../../src/persistence/serialize";
import type { GearInstance, LayoutState } from "../../src/sim/types";

describe("serialize/deserialize round-trip", () => {
  it("recovers an identical layout (gears + remoteLinks) after a round trip", () => {
    const layout: LayoutState = {
      gears: [{
        id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
        broken: false, rotation: 0.4, angularVelocity: -2,
      }],
      remoteLinks: [{ a: "a", b: "b", kind: "chain" }],
    };
    const restored = deserializeLayout(serializeLayout(layout));
    expect(restored).toEqual(layout);
  });

  it("defaults remoteLinks to [] for a v1 save file that predates the field", () => {
    const v1Payload = JSON.stringify({
      version: 1,
      gears: [{
        id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
        broken: false, rotation: 0, angularVelocity: 1,
      }],
    });
    const restored = deserializeLayout(v1Payload);
    expect(restored.remoteLinks).toEqual([]);
    expect(restored.gears).toHaveLength(1);
  });

  it("rejects a malformed save file", () => {
    expect(() => deserializeLayout("{}")).toThrow();
  });

  it("rejects a save file whose remoteLinks entries are malformed", () => {
    const bad = JSON.stringify({ version: 2, gears: [], remoteLinks: [{ a: "x" }] });
    expect(() => deserializeLayout(bad)).toThrow();
  });
});
