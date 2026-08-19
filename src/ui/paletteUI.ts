import type { GearType } from "../sim/types";
import { PART_INFO } from "./partInfo";

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    container.classList.add("palette-grid");
    for (const type of Object.keys(PART_INFO) as GearType[]) {
      const info = PART_INFO[type];
      const button = document.createElement("button");
      button.className = "palette-item";
      button.title = info.description; // quick hover reminder; the full picture is one click away
      button.dataset.gearType = type;
      button.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${info.icon}</svg>`;
      const label = document.createElement("span");
      label.textContent = info.label;
      button.appendChild(label);
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
    }
  }
}
