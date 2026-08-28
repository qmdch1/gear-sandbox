import type { GearType } from "../sim/types";
import { GEAR_LABELS } from "./gearLabels";

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    for (const type of Object.keys(GEAR_LABELS) as GearType[]) {
      const button = document.createElement("button");
      button.textContent = GEAR_LABELS[type];
      button.dataset.gearType = type;
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
    }
  }
}
