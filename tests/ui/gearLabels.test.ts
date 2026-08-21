import { describe, it, expect } from "vitest";
import { computeGearLabels } from "../../src/ui/gearLabels";
import { PART_INFO } from "../../src/ui/partInfo";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("computeGearLabels", () => {
  it("numbers gears of the same type by order of appearance, starting at 1", () => {
    const gears = [
      makeGear({ id: "a", type: "spur" }),
      makeGear({ id: "b", type: "spur" }),
      makeGear({ id: "c", type: "spur" }),
    ];
    const labels = computeGearLabels(gears);
    expect(labels.get("a")).toBe(`${PART_INFO.spur.label} 1`);
    expect(labels.get("b")).toBe(`${PART_INFO.spur.label} 2`);
    expect(labels.get("c")).toBe(`${PART_INFO.spur.label} 3`);
  });

  it("numbers each type independently, not sharing a single counter across types", () => {
    const gears = [
      makeGear({ id: "a", type: "spur" }),
      makeGear({ id: "b", type: "crank" }),
      makeGear({ id: "c", type: "spur" }),
    ];
    const labels = computeGearLabels(gears);
    expect(labels.get("a")).toBe(`${PART_INFO.spur.label} 1`);
    expect(labels.get("b")).toBe(`${PART_INFO.crank.label} 1`); // power source gets numbered too
    expect(labels.get("c")).toBe(`${PART_INFO.spur.label} 2`);
  });

  it("produces one label per gear id, covering every gear in the list", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b", type: "wheel", teeth: 0 })];
    const labels = computeGearLabels(gears);
    expect(labels.size).toBe(2);
  });
});
