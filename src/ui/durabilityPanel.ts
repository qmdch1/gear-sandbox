import type { GearInstance } from "../sim/types";
import { GEAR_LABELS, GEAR_NOTES } from "./gearLabels";
import { needsRepair } from "../sim/repair";

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
    private onDelete: (gearId: string) => void = () => {},
    private onRepair: (gearId: string) => void = () => {},
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

    // Repair. `wear.ts` only ever subtracts durability, and a gear that reaches zero is
    // `broken` -- which `rotation.ts` treats as a dead end that stops relaying drive. Without
    // this button the panel could tell you a gear was worn or dead but offered nothing to do
    // about it, and the only way back was reloading the layout. Disabled at full durability so
    // it reads as "nothing to fix here" rather than doing nothing silently.
    const repairBtn = document.createElement("button");
    repairBtn.type = "button";
    repairBtn.textContent = "수리";
    repairBtn.className = "repair-btn";
    repairBtn.disabled = !needsRepair(gear);
    repairBtn.title = repairBtn.disabled
      ? "이 기어는 손상되지 않았습니다."
      : "이 기어의 내구도를 처음 상태로 되돌립니다.";
    repairBtn.addEventListener("click", () => {
      if (this.currentGearId) this.onRepair(this.currentGearId);
    });
    this.container.appendChild(repairBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "삭제";
    deleteBtn.className = "delete-btn";
    deleteBtn.addEventListener("click", () => {
      if (this.currentGearId) this.onDelete(this.currentGearId);
    });
    this.container.appendChild(deleteBtn);

    // Surfaces the Delete/Backspace keyboard shortcut (wired up in main.ts) right where it's
    // actually useful -- this panel is only ever visible while a gear is selected, which is
    // exactly the one moment the shortcut does anything. Matches PaletteUI's own .palette-hint
    // convention of showing a shortcut hint only while it's actionable, rather than cluttering
    // the sidebar with an always-visible line that's irrelevant most of the time.
    const shortcutHint = document.createElement("p");
    shortcutHint.className = "shortcut-hint";
    shortcutHint.textContent = "Delete 또는 Backspace 키를 눌러도 이 기어를 삭제할 수 있습니다.";
    this.container.appendChild(shortcutHint);

    this.container.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
  }
}
