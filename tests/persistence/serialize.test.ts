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

  it("rejects a gear array containing an element missing required fields", () => {
    const payload = JSON.stringify({
      version: 1,
      gears: [{ id: "a", type: "spur" }], // missing position/axis/teeth/etc.
    });
    expect(() => deserializeGears(payload)).toThrow("Invalid gear-sandbox save file");
  });

  it("rejects a gear with an unknown type", () => {
    const gears: GearInstance[] = [{
      id: "a", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
      teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
      broken: false, rotation: 0, angularVelocity: 0,
    }];
    const payload = serializeGears(gears).replace('"spur"', '"not-a-real-type"');
    expect(() => deserializeGears(payload)).toThrow("Invalid gear-sandbox save file");
  });

  it("rejects a gear whose axis is not a 3-tuple of finite numbers", () => {
    const payload = JSON.stringify({
      version: 1,
      gears: [{
        id: "a", type: "spur", position: [0, 0, 0], axis: [0, 1, "not-a-number"],
        teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
        broken: false, rotation: 0, angularVelocity: 0,
      }],
    });
    expect(() => deserializeGears(payload)).toThrow("Invalid gear-sandbox save file");
  });
});
