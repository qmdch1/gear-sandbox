import type { GearType } from "../sim/types";

const LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
  rack: "랙",
  planetary: "유성기어 세트",
  ratchet: "래칫 기어",
  sprocket: "스프로킷(체인용)",
  pulley: "풀리(벨트용)",
  differential: "차동장치",
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
