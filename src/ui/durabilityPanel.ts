import type { GearInstance } from "../sim/types";

export class DurabilityPanel {
  constructor(private container: HTMLElement) {}

  show(gear: GearInstance): void {
    const pct = Math.round((gear.durabilityCurrent / gear.durabilityMax) * 100);
    this.container.innerHTML =
      `<strong>${gear.type}</strong> — ${gear.durabilityCurrent.toFixed(1)} / ${gear.durabilityMax} (${pct}%)` +
      (gear.broken ? " — 파손됨" : "");
    this.container.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
  }
}
