// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DiagnosticsPanel } from "../../src/ui/diagnosticsPanel";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("DiagnosticsPanel", () => {
  it("renders one list item per diagnostic problem", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" }), makeGear({ id: "c" })];
    panel.render({ unconnectedIds: ["a"], noPowerIds: ["b", "c"], overlapPairs: [] }, gears);
    expect(container.querySelectorAll("li").length).toBe(3);
    expect(container.textContent).toContain("문제 있는 기어: 3개");
  });

  it("invokes the focus callback with the clicked gear's id", () => {
    const container = document.createElement("div");
    const onFocus = vi.fn();
    const panel = new DiagnosticsPanel(container, onFocus);
    const gears = [makeGear({ id: "a" })];
    panel.render({ unconnectedIds: ["a"], noPowerIds: [], overlapPairs: [] }, gears);
    (container.querySelector("li") as HTMLElement).click();
    expect(onFocus).toHaveBeenCalledWith("a");
  });

  it("shows a gear's friendly type name and a short id suffix, not the raw crypto.randomUUID id", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    const gears = [makeGear({ id: "3f9a2c11-aaaa-bbbb-cccc-dddddddddddd", type: "worm" })];
    panel.render({ unconnectedIds: ["3f9a2c11-aaaa-bbbb-cccc-dddddddddddd"], noPowerIds: [], overlapPairs: [] }, gears);
    expect(container.textContent).toContain("웜 기어");
    expect(container.textContent).toContain("#dddd");
    expect(container.textContent).not.toContain("3f9a2c11-aaaa-bbbb-cccc-dddddddddddd");
  });

  it("falls back to a placeholder label if the diagnostic references a gear that's no longer in the list", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["gone"], noPowerIds: [], overlapPairs: [] }, []);
    expect(container.textContent).toContain("알 수 없는 기어");
  });
});
