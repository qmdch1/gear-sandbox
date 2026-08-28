import type { GearInstance } from "../sim/types";
import { GEAR_LABELS, GEAR_NOTES } from "./gearLabels";

export class DurabilityPanel {
  constructor(private container: HTMLElement) {}

  show(gear: GearInstance): void {
    const pct = Math.round((gear.durabilityCurrent / gear.durabilityMax) * 100);
    this.container.textContent = "";

    const strong = document.createElement("strong");
    strong.textContent = GEAR_LABELS[gear.type];
    this.container.appendChild(strong);

    const detail = ` — ${gear.durabilityCurrent.toFixed(1)} / ${gear.durabilityMax} (${pct}%)` +
      (gear.broken ? " — 파손됨" : "");
    this.container.appendChild(document.createTextNode(detail));

    const note = GEAR_NOTES[gear.type];
    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "gear-note";
      noteEl.textContent = note;
      this.container.appendChild(noteEl);
    }

    this.container.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
  }
}
