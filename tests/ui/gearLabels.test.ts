import { describe, it, expect } from "vitest";
import { GEAR_LABELS, GEAR_NOTES } from "../../src/ui/gearLabels";
import type { GearType } from "../../src/sim/types";

const ALL_TYPES: GearType[] = [
  "spur", "helical", "crank", "bevel", "worm", "load",
  "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
];

describe("GEAR_LABELS", () => {
  it("has a non-empty Korean label for every gear type", () => {
    for (const type of ALL_TYPES) {
      expect(typeof GEAR_LABELS[type]).toBe("string");
      expect(GEAR_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe("GEAR_NOTES", () => {
  it("explains the differential's locked-output simplification", () => {
    expect(GEAR_NOTES.differential).toBeDefined();
    expect(GEAR_NOTES.differential!.length).toBeGreaterThan(0);
  });

  it("has no note for a type with no known simplification to explain, like a plain spur gear", () => {
    expect(GEAR_NOTES.spur).toBeUndefined();
  });
});
