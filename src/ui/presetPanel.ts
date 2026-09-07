import type { LayoutState } from "../sim/types";
import type { Prop } from "../render/props";
import { PRESETS, type PresetEntry } from "../sim/presets";

/** Renders one button per `PRESETS` catalog entry (see `sim/presets/index.ts`) and, on
 *  click, builds that preset's `LayoutState` plus its decorative props (a car chassis, a
 *  clock bezel, ...) and hands both to `onSelect`. A preset with no `buildProps` yields an
 *  empty prop list, so `onSelect` always receives a defined array. Mirrors `SaveLoadPanel`'s
 *  constructor shape (container + plain callback, no public methods beyond construction) --
 *  the panel holds no mutable state of its own, since building a preset is a pure call. */
export class PresetPanel {
  constructor(
    container: HTMLElement,
    onSelect: (layout: LayoutState, props: Prop[]) => void,
    presets: PresetEntry[] = PRESETS,
  ) {
    for (const preset of presets) {
      const btn = document.createElement("button");
      btn.textContent = preset.label;
      btn.addEventListener("click", () => onSelect(preset.build(), preset.buildProps?.() ?? []));
      container.appendChild(btn);
    }
  }
}
