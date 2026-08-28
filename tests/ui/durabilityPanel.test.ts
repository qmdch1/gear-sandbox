// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { DurabilityPanel } from "../../src/ui/durabilityPanel";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("DurabilityPanel", () => {
  it("shows the gear's Korean type label, not the raw internal type string", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({ type: "spur" }));
    expect(container.textContent).toContain("평기어");
    expect(container.textContent).not.toContain("spur");
  });

  it("appends an explanatory note for a differential, absent for a plain spur gear", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);

    panel.show(makeGear({ type: "differential" }));
    expect(container.querySelector(".gear-note")).not.toBeNull();

    panel.show(makeGear({ type: "spur" }));
    expect(container.querySelector(".gear-note")).toBeNull();
  });

  it("still reports durability and broken status alongside the label", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({ type: "worm", durabilityCurrent: 40, durabilityMax: 80, broken: true }));
    expect(container.textContent).toContain("웜 기어");
    expect(container.textContent).toContain("40.0 / 80");
    expect(container.textContent).toContain("파손됨");
  });
});
