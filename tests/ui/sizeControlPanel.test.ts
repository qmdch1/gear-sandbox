// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SizeControlPanel } from "../../src/ui/sizeControlPanel";
import { PART_INFO } from "../../src/ui/partInfo";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("SizeControlPanel", () => {
  it("shows the empty message and hides the slider when nothing is selected", () => {
    const container = document.createElement("div");
    const panel = new SizeControlPanel(container, () => {});
    panel.render(null);
    const empty = container.querySelector<HTMLElement>(".size-control-empty")!;
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(empty.hidden).toBe(false);
    expect(slider.hidden).toBe(true);
  });

  it("shows the slider (and hides the empty message) once a gear is selected", () => {
    const container = document.createElement("div");
    const panel = new SizeControlPanel(container, () => {});
    panel.render(makeGear({ module: 1.5 }));
    const empty = container.querySelector<HTMLElement>(".size-control-empty")!;
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(empty.hidden).toBe(true);
    expect(slider.hidden).toBe(false);
    expect(slider.value).toBe("1.5");
  });

  it("shows the selected gear's own type label alongside its current size", () => {
    const container = document.createElement("div");
    const panel = new SizeControlPanel(container, () => {});
    panel.render(makeGear({ type: "wheel", teeth: 0, module: 2 }));
    const label = container.querySelector<HTMLElement>(".size-control-label")!;
    expect(label.textContent).toContain(PART_INFO.wheel.label);
    expect(label.textContent).toContain("2.00");
  });

  it("calls onChange with the new module value when the slider is moved", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const panel = new SizeControlPanel(container, onChange);
    panel.render(makeGear({ module: 1 }));
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    slider.value = "2.25";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(2.25);
  });

  it("switches back to the empty state when selection is cleared", () => {
    const container = document.createElement("div");
    const panel = new SizeControlPanel(container, () => {});
    panel.render(makeGear({}));
    panel.render(null);
    const empty = container.querySelector<HTMLElement>(".size-control-empty")!;
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(empty.hidden).toBe(false);
    expect(slider.hidden).toBe(true);
  });
});
