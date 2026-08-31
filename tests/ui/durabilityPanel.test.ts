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

  it("renders three labeled axis buttons", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".axis-btn"));
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual(["X축", "Y축", "Z축"]);
  });

  it("invokes the axis-change callback with the gear's id and the clicked axis", () => {
    const container = document.createElement("div");
    const clicks: Array<{ id: string; axis: [number, number, number] }> = [];
    const panel = new DurabilityPanel(container, (id, axis) => clicks.push({ id, axis }));
    panel.show(makeGear({ id: "gear-7", axis: [0, 1, 0] }));

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".axis-btn"));
    buttons[0].click(); // X축

    expect(clicks).toEqual([{ id: "gear-7", axis: [1, 0, 0] }]);
  });

  it("visually marks the gear's current axis button as active, and no other", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({ axis: [0, 0, 1] }));

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".axis-btn"));
    const active = buttons.filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe("Z축");
    expect(active[0].getAttribute("aria-pressed")).toBe("true");

    const inactive = buttons.filter((b) => b !== active[0]);
    for (const btn of inactive) {
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("re-showing the gear after an axis change updates which button is active", () => {
    const container = document.createElement("div");
    let axis: [number, number, number] = [0, 1, 0];
    const panel = new DurabilityPanel(container, (_id, newAxis) => {
      axis = newAxis;
      panel.show(makeGear({ axis }));
    });
    panel.show(makeGear({ axis }));

    const zButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".axis-btn")).find(
      (b) => b.textContent === "Z축",
    )!;
    zButton.click();

    const activeAfter = container.querySelector(".axis-btn.active");
    expect(activeAfter?.textContent).toBe("Z축");
  });

  it("works with just a container argument, matching existing call sites", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".axis-btn"));
    expect(() => buttons[0].click()).not.toThrow();
  });

  it("renders a delete button labeled 삭제", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    const deleteBtn = container.querySelector<HTMLButtonElement>(".delete-btn");
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.textContent).toBe("삭제");
  });

  it("invokes the delete callback with the shown gear's exact id when clicked", () => {
    const container = document.createElement("div");
    const deleted: string[] = [];
    const panel = new DurabilityPanel(container, undefined, (id) => deleted.push(id));
    panel.show(makeGear({ id: "gear-42" }));

    container.querySelector<HTMLButtonElement>(".delete-btn")!.click();

    expect(deleted).toEqual(["gear-42"]);
  });

  it("clicking delete for one gear does not fire for a previously shown gear", () => {
    const container = document.createElement("div");
    const deleted: string[] = [];
    const panel = new DurabilityPanel(container, undefined, (id) => deleted.push(id));
    panel.show(makeGear({ id: "gear-1" }));
    panel.show(makeGear({ id: "gear-2" }));

    container.querySelector<HTMLButtonElement>(".delete-btn")!.click();

    expect(deleted).toEqual(["gear-2"]);
  });

  it("no delete callback provided = safe no-op, matching the onAxisChange default convention", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    const deleteBtn = container.querySelector<HTMLButtonElement>(".delete-btn")!;
    expect(() => deleteBtn.click()).not.toThrow();
  });

  it("shows a Delete/Backspace shortcut hint whenever a gear is shown, mentioning both key names", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    const hint = container.querySelector(".shortcut-hint");
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain("Delete");
    expect(hint?.textContent).toContain("Backspace");
  });

  it("hides the shortcut hint along with the rest of the panel once no gear is selected", () => {
    const container = document.createElement("div");
    const panel = new DurabilityPanel(container);
    panel.show(makeGear({}));
    expect(container.querySelector(".shortcut-hint")).not.toBeNull();
    panel.hide();
    expect(container.hidden).toBe(true);
  });
});
