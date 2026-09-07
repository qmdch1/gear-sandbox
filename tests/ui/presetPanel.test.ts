// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { PresetPanel } from "../../src/ui/presetPanel";
import type { LayoutState } from "../../src/sim/types";
import type { PresetEntry } from "../../src/sim/presets";

function fakeLayout(marker: string): LayoutState {
  return { gears: [{ id: marker } as unknown as LayoutState["gears"][number]], remoteLinks: [] };
}

function makePresets(): PresetEntry[] {
  return [
    { id: "a", label: "프리셋 A", build: vi.fn(() => fakeLayout("a-layout")) },
    { id: "b", label: "프리셋 B", build: vi.fn(() => fakeLayout("b-layout")) },
  ];
}

describe("PresetPanel", () => {
  it("renders exactly one button per catalog entry, using each entry's label", () => {
    const container = document.createElement("div");
    new PresetPanel(container, vi.fn(), makePresets());

    const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["프리셋 A", "프리셋 B"]);
  });

  it("clicking a preset's button calls its own build() and fires onSelect with the resulting layout", () => {
    const container = document.createElement("div");
    const presets = makePresets();
    const onSelect = vi.fn();
    new PresetPanel(container, onSelect, presets);

    const [btnA, btnB] = Array.from(container.querySelectorAll("button"));
    (btnA as HTMLElement).click();

    expect(presets[0].build).toHaveBeenCalledTimes(1);
    expect(presets[1].build).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
    // onSelect receives (layout, props); these fake presets have no buildProps, so props is [].
    expect(onSelect).toHaveBeenCalledWith(fakeLayout("a-layout"), []);

    (btnB as HTMLElement).click();
    expect(presets[1].build).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(fakeLayout("b-layout"), []);
  });

  it("uses the real PRESETS catalog by default when no explicit list is passed", () => {
    const container = document.createElement("div");
    new PresetPanel(container, vi.fn());
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.some((b) => b.textContent?.includes("시계"))).toBe(true);
  });
});
