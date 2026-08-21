// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaletteUI } from "../../src/ui/paletteUI";

const STORAGE_KEY = "gear-sandbox:palette-open-categories";

describe("PaletteUI", () => {
  beforeEach(() => localStorage.clear());

  it("starts with every category's item list OPEN by default (no saved state yet)", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const grids = container.querySelectorAll<HTMLElement>(".palette-items");
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) expect(grid.hidden).toBe(false);
  });

  it("toggles a category's items independently, without touching any other category", () => {
    // Several categories can be closed/opened independently of each other,
    // unlike an accordion that only ever allows one section open at a time.
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const categoryButtons = container.querySelectorAll<HTMLButtonElement>(".palette-category");
    const grids = container.querySelectorAll<HTMLElement>(".palette-items");

    categoryButtons[0].click(); // closes the first (was open by default)
    expect(grids[0].hidden).toBe(true);
    expect(grids[1].hidden).toBe(false); // untouched, still open
  });

  it("re-opens a category's items when its button is clicked again", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const categoryButton = container.querySelector<HTMLButtonElement>(".palette-category")!;
    const grid = container.querySelector<HTMLElement>(".palette-items")!;

    categoryButton.click();
    expect(grid.hidden).toBe(true);
    categoryButton.click();
    expect(grid.hidden).toBe(false);
  });

  it("calls onPick with the specific gear type when a part button inside a category is clicked", () => {
    const container = document.createElement("div");
    const onPick = vi.fn();
    new PaletteUI(container, onPick);
    const wormButton = container.querySelector<HTMLButtonElement>('[data-gear-type="worm"]')!;
    wormButton.click();
    expect(onPick).toHaveBeenCalledWith("worm");
  });

  it("remembers a closed category across a fresh PaletteUI instance (e.g. a page reload)", () => {
    const first = document.createElement("div");
    new PaletteUI(first, () => {});
    const firstButtons = first.querySelectorAll<HTMLButtonElement>(".palette-category");
    firstButtons[0].click(); // close the first category
    firstButtons[1].click(); // close the second too

    // A brand-new instance (standing in for a fresh page load) should restore
    // exactly that saved layout, not reset to the all-open default.
    const second = document.createElement("div");
    new PaletteUI(second, () => {});
    const secondGrids = second.querySelectorAll<HTMLElement>(".palette-items");
    expect(secondGrids[0].hidden).toBe(true);
    expect(secondGrids[1].hidden).toBe(true);
    expect(secondGrids[2].hidden).toBe(false); // never touched -- stayed open
  });

  it("falls back to all-open when localStorage holds corrupted or unusable data", () => {
    localStorage.setItem(STORAGE_KEY, "not valid json{{{");
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const grids = container.querySelectorAll<HTMLElement>(".palette-items");
    for (const grid of grids) expect(grid.hidden).toBe(false);
  });
});
