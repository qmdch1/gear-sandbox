import { describe, it, expect } from "vitest";
import { GEAR_DEFS } from "../../src/sim/gearDefs";

describe("GEAR_DEFS", () => {
  it("has an entry for every gear type with a positive durability", () => {
    const types = [
      "spur", "helical", "crank", "bevel", "worm", "load",
      "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
    ] as const;
    for (const t of types) {
      expect(GEAR_DEFS[t].durabilityMax).toBeGreaterThan(0);
    }
  });

  it("gives helical gear higher durability than spur (load-distribution rationale)", () => {
    expect(GEAR_DEFS.helical.durabilityMax).toBeGreaterThan(GEAR_DEFS.spur.durabilityMax);
  });

  it("gives the load object zero wear rate (it does not deplete itself)", () => {
    expect(GEAR_DEFS.load.baseWearPerSecond).toBe(0);
  });

  it("gives planetary sets higher durability than a plain spur gear (more parts sharing the load)", () => {
    expect(GEAR_DEFS.planetary.durabilityMax).toBeGreaterThan(GEAR_DEFS.spur.durabilityMax);
  });
});
