import type { GearType } from "../sim/types";

const LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
};

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    for (const type of Object.keys(LABELS) as GearType[]) {
      const button = document.createElement("button");
      button.textContent = LABELS[type];
      button.dataset.gearType = type;
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
    }
  }
}
