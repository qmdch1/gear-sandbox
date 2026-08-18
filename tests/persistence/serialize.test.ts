import { describe, it, expect } from "vitest";
import { serializeGears, deserializeGears } from "../../src/persistence/serialize";
import type { GearInstance } from "../../src/sim/types";

describe("serialize/deserialize round-trip", () => {
  it("recovers an identical gear list after a round trip", () => {
    const gears: GearInstance[] = [{
      id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
      teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
      broken: false, rotation: 0.4, angularVelocity: -2,
    }];
    const restored = deserializeGears(serializeGears(gears));
    expect(restored).toEqual(gears);
  });

  it("rejects a malformed save file", () => {
    expect(() => deserializeGears("{}")).toThrow();
  });
});
