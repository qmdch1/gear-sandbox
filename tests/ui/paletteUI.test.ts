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
});
