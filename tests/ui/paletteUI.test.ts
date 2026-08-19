// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { PaletteUI } from "../../src/ui/paletteUI";

describe("PaletteUI", () => {
  it("starts with every category's item list collapsed", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const grids = container.querySelectorAll<HTMLElement>(".palette-items");
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) expect(grid.hidden).toBe(true);
  });

  it("expands only the clicked category's items, collapsing any other open one", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const categoryButtons = container.querySelectorAll<HTMLButtonElement>(".palette-category");
    const grids = container.querySelectorAll<HTMLElement>(".palette-items");

    categoryButtons[0].click();
    expect(grids[0].hidden).toBe(false);
    expect(grids[1].hidden).toBe(true);

    categoryButtons[1].click();
    expect(grids[0].hidden).toBe(true);
    expect(grids[1].hidden).toBe(false);
  });

  it("re-collapses a category's items when its button is clicked again", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const categoryButton = container.querySelector<HTMLButtonElement>(".palette-category")!;
    const grid = container.querySelector<HTMLElement>(".palette-items")!;

    categoryButton.click();
    expect(grid.hidden).toBe(false);
    categoryButton.click();
    expect(grid.hidden).toBe(true);
  });

  it("calls onPick with the specific gear type when a part button inside a category is clicked", () => {
    const container = document.createElement("div");
    const onPick = vi.fn();
    new PaletteUI(container, onPick);
    container.querySelector<HTMLButtonElement>(".palette-category")!.click(); // open the first category
    const wormButton = container.querySelector<HTMLButtonElement>('[data-gear-type="worm"]')!;
    wormButton.click();
    expect(onPick).toHaveBeenCalledWith("worm");
  });
});
