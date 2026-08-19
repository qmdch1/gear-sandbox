/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { DiagnosticsPanel } from "../../src/ui/diagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("renders one list item per diagnostic problem", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["a"], noPowerIds: ["b", "c"], overlapPairs: [] });
    expect(container.querySelectorAll("li").length).toBe(3);
    expect(container.textContent).toContain("문제 있는 기어: 3개");
  });

  it("invokes the focus callback with the clicked gear's id", () => {
    const container = document.createElement("div");
    const onFocus = vi.fn();
    const panel = new DiagnosticsPanel(container, onFocus);
    panel.render({ unconnectedIds: ["a"], noPowerIds: [], overlapPairs: [] });
    (container.querySelector("li") as HTMLElement).click();
    expect(onFocus).toHaveBeenCalledWith("a");
  });
});
