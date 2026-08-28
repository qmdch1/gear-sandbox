import type { GearInstance } from "../sim/types";
import { GEAR_LABELS, GEAR_NOTES } from "./gearLabels";

type Axis = [number, number, number];

const AXIS_OPTIONS: Array<{ label: string; axis: Axis }> = [
  { label: "X축", axis: [1, 0, 0] },
  { label: "Y축", axis: [0, 1, 0] },
  { label: "Z축", axis: [0, 0, 1] },
];

function sameAxis(a: Axis, b: Axis): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export class DurabilityPanel {
  private currentGearId: string | null = null;

  constructor(
    private container: HTMLElement,
    private onAxisChange: (gearId: string, axis: Axis) => void = () => {},
  ) {}

  show(gear: GearInstance): void {
    this.currentGearId = gear.id;
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

    const axisRow = document.createElement("div");
    axisRow.className = "axis-buttons";
    for (const { label, axis } of AXIS_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = "axis-btn";
      const isActive = sameAxis(gear.axis, axis);
      btn.setAttribute("aria-pressed", String(isActive));
      if (isActive) btn.classList.add("active");
      btn.addEventListener("click", () => {
        if (this.currentGearId) this.onAxisChange(this.currentGearId, axis);
      });
      axisRow.appendChild(btn);
    }
    this.container.appendChild(axisRow);

    this.container.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
  }
}
