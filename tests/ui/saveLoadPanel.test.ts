// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SaveLoadPanel } from "../../src/ui/saveLoadPanel";

describe("SaveLoadPanel", () => {
  it("renders exactly two buttons -- save and load, nothing else", () => {
    const container = document.createElement("div");
    new SaveLoadPanel(container, { save: () => {}, load: () => {} });
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe("저장");
    expect(buttons[1].textContent).toBe("불러오기");
  });

  it("calls save() when the save button is clicked", () => {
    const save = vi.fn();
    const container = document.createElement("div");
    new SaveLoadPanel(container, { save, load: () => {} });
    container.querySelectorAll("button")[0].click();
    expect(save).toHaveBeenCalledOnce();
  });

  it("calls load() when the load button is clicked", () => {
    const load = vi.fn();
    const container = document.createElement("div");
    new SaveLoadPanel(container, { save: () => {}, load });
    container.querySelectorAll("button")[1].click();
    expect(load).toHaveBeenCalledOnce();
  });
});
