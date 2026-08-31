// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { PaletteUI } from "../../src/ui/paletteUI";
import { GEAR_LABELS } from "../../src/ui/gearLabels";
import type { GearType } from "../../src/sim/types";

describe("PaletteUI", () => {
  it("creates one button per gear type in GEAR_LABELS, appended to the given container", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(Object.keys(GEAR_LABELS).length);
    expect(document.body.querySelectorAll("button").length).toBe(0);
  });

  it("labels each button with its type's Korean text", () => {
    const container = document.createElement("div");
    new PaletteUI(container, () => {});
    const spurButton = container.querySelector('button[data-gear-type="spur"]');
    const wormButton = container.querySelector('button[data-gear-type="worm"]');
    expect(spurButton?.textContent).toBe("평기어");
    expect(wormButton?.textContent).toBe("웜 기어");
  });

  it("invokes onPick with the clicked button's exact gear type", () => {
    const container = document.createElement("div");
    const onPick = vi.fn();
    new PaletteUI(container, onPick);

    (container.querySelector('button[data-gear-type="rack"]') as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith("rack" satisfies GearType);
    expect(onPick).toHaveBeenCalledTimes(1);

    onPick.mockClear();
    (container.querySelector('button[data-gear-type="differential"]') as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith("differential" satisfies GearType);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("setActive highlights the given type's button and reveals a placement hint", () => {
    const container = document.createElement("div");
    const palette = new PaletteUI(container, () => {});
    const rackButton = container.querySelector('button[data-gear-type="rack"]') as HTMLButtonElement;
    const spurButton = container.querySelector('button[data-gear-type="spur"]') as HTMLButtonElement;
    const hint = container.querySelector(".palette-hint") as HTMLElement;
    expect(hint.hidden).toBe(true);

    palette.setActive("rack" satisfies GearType);
    expect(rackButton.classList.contains("active")).toBe(true);
    expect(rackButton.getAttribute("aria-pressed")).toBe("true");
    expect(spurButton.classList.contains("active")).toBe(false);
    expect(spurButton.getAttribute("aria-pressed")).toBe("false");
    expect(hint.hidden).toBe(false);
  });

  it("setActive(null) clears any highlighted button and hides the hint", () => {
    const container = document.createElement("div");
    const palette = new PaletteUI(container, () => {});
    const rackButton = container.querySelector('button[data-gear-type="rack"]') as HTMLButtonElement;
    const hint = container.querySelector(".palette-hint") as HTMLElement;

    palette.setActive("rack" satisfies GearType);
    palette.setActive(null);
    expect(rackButton.classList.contains("active")).toBe(false);
    expect(rackButton.getAttribute("aria-pressed")).toBe("false");
    expect(hint.hidden).toBe(true);
  });
});
