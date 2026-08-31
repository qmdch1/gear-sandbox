import type { LayoutState } from "../sim/types";
import { PRESETS, type PresetEntry } from "../sim/presets";

/** Renders one button per `PRESETS` catalog entry (see `sim/presets/index.ts`) and, on
 *  click, builds that preset's `LayoutState` and hands it to `onSelect`. Mirrors
 *  `SaveLoadPanel`'s constructor shape exactly (container + plain callback(s), no public
 *  methods beyond construction) -- the panel itself holds no mutable state of its own,
 *  since building a preset is a pure function call, unlike `ServerSyncPanel` which has to
 *  track an async-fetched list and a "currently loaded" id. */
export class PresetPanel {
  constructor(container: HTMLElement, onSelect: (layout: LayoutState) => void, presets: PresetEntry[] = PRESETS) {
    for (const preset of presets) {
      const btn = document.createElement("button");
      btn.textContent = preset.label;
      btn.addEventListener("click", () => onSelect(preset.build()));
      container.appendChild(btn);
    }
  }
}
