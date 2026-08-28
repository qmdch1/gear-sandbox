import type { GearType } from "../sim/types";
import { GEAR_LABELS } from "./gearLabels";

const PLACEMENT_HINT_TEXT = "배치할 위치를 클릭하세요 (뷰포트 클릭 = 배치, Esc = 취소)";

export class PaletteUI {
  private buttons = new Map<GearType, HTMLButtonElement>();
  private hint: HTMLDivElement;

  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    this.hint = document.createElement("div");
    this.hint.className = "palette-hint";
    this.hint.textContent = PLACEMENT_HINT_TEXT;
    this.hint.hidden = true;
    container.appendChild(this.hint);

    for (const type of Object.keys(GEAR_LABELS) as GearType[]) {
      const button = document.createElement("button");
      button.textContent = GEAR_LABELS[type];
      button.dataset.gearType = type;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
      this.buttons.set(type, button);
    }
  }

  /** Reflects placement mode in the palette: highlights the armed type's button and shows/hides a
   *  short hint telling the user to click the viewport (or Esc to cancel). Pass null to clear both. */
  setActive(type: GearType | null): void {
    for (const [t, button] of this.buttons) {
      const isActive = t === type;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    this.hint.hidden = type === null;
  }
}
