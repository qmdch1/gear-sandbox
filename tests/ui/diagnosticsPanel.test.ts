// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DiagnosticsPanel } from "../../src/ui/diagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("lists unconnected parts separately from real problems -- not counted as problems", () => {
    // Regression: "미연결" (unconnected) used to be lumped into "문제 있는 기어"
    // (problem gears), but a freshly-placed, not-yet-hooked-up part isn't
    // actually wrong -- only noPower/overlap are genuine problems.
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["a"], noPowerIds: ["b", "c"], overlapPairs: [] });
    expect(container.textContent).toContain("연결 안 된 부품: 1개");
    expect(container.textContent).toContain("문제 있는 기어: 2개");
    expect(container.querySelectorAll("li").length).toBe(3);
  });

  it("renders no problem section at all when there are no problems, only unconnected parts", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["a"], noPowerIds: [], overlapPairs: [] });
    expect(container.textContent).not.toContain("문제 있는 기어");
  });

  it("shows an all-clear message when there's nothing unconnected and nothing wrong", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: [], noPowerIds: [], overlapPairs: [] });
    expect(container.textContent).toContain("문제 없음");
  });

  it("shows a gear's readable label instead of its raw id, when one is provided", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render(
      { unconnectedIds: ["raw-id-a"], noPowerIds: [], overlapPairs: [] },
      new Map([["raw-id-a", "평기어 1"]]),
    );
    expect(container.textContent).toContain("평기어 1");
    expect(container.textContent).not.toContain("raw-id-a");
  });

  it("falls back to the raw id when no label is provided for it", () => {
    const container = document.createElement("div");
    const panel = new DiagnosticsPanel(container, () => {});
    panel.render({ unconnectedIds: ["raw-id-a"], noPowerIds: [], overlapPairs: [] });
    expect(container.textContent).toContain("raw-id-a");
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
