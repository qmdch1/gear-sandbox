// tests/sim/wear.test.ts
import { describe, it, expect } from "vitest";
import { applyWear } from "../../src/sim/wear";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("applyWear", () => {
  it("does not wear a gear that isn't spinning", () => {
    const gear = makeGear({ durabilityCurrent: 100 });
    const result = applyWear({ gear, angularVelocity: 0, hasDownstreamLoad: false, dt: 10, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(100);
    expect(result.broken).toBe(false);
  });

  it("wears a spinning gear proportionally to dt and timeScale", () => {
    const gear = makeGear({ durabilityCurrent: 100 }); // spur: baseWearPerSecond = 1.0
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 2 });
    expect(result.durabilityCurrent).toBe(98); // 100 - (1.0 * 1 * 2 * 1)
  });

  it("wears faster when a downstream load object is present", () => {
    const gear = makeGear({ durabilityCurrent: 100 });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: true, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(98.5); // 100 - (1.0 * 1.5 * 1 * 1)
  });

  it("clamps at zero and marks the gear broken", () => {
    const gear = makeGear({ durabilityCurrent: 0.5 });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(0);
    expect(result.broken).toBe(true);
  });

  it("leaves an already-broken gear broken and unchanged", () => {
    const gear = makeGear({ durabilityCurrent: 0, broken: true });
    const result = applyWear({ gear, angularVelocity: 2, hasDownstreamLoad: false, dt: 1, timeScale: 1 });
    expect(result.durabilityCurrent).toBe(0);
    expect(result.broken).toBe(true);
  });
});
