import type { GearInstance, SimDiagnostics } from "../sim/types";
import { GEAR_LABELS } from "./gearLabels";

/** A short, human-readable stand-in for a gear id in diagnostics text -- the id itself
 *  is `crypto.randomUUID()` for anything a user places via the palette (see
 *  gearFactory.createGear), so showing it raw ("미연결: 3f9a2c11-...") means nothing to
 *  a non-technical user. The gear's friendly type name plus the id's last 4 characters
 *  (enough to tell two problem gears of the same type apart; clicking still focuses the
 *  exact gear via its full id, unaffected) is the whole point. */
function describeGear(id: string, gears: GearInstance[]): string {
  const gear = gears.find((g) => g.id === id);
  const label = gear ? GEAR_LABELS[gear.type] : "알 수 없는 기어";
  return `${label} (#${id.slice(-4)})`;
}

export class DiagnosticsPanel {
  constructor(private container: HTMLElement, private onFocus: (id: string) => void) {
    // Event delegation: one listener on the container survives the innerHTML
    // rebuild that happens every animation frame in render(). A per-item
    // listener attached inside the render loop would be torn down mid-gesture
    // (mousedown -> rebuild -> mouseup), so no click would ever fire.
    this.container.addEventListener("click", (event) => {
      const li = (event.target as HTMLElement).closest("li");
      const gearId = li?.dataset.gearId;
      if (gearId) this.onFocus(gearId);
    });
  }

  render(diagnostics: SimDiagnostics, gears: GearInstance[]): void {
    const items: Array<{ label: string; id: string }> = [
      ...diagnostics.unconnectedIds.map((id) => ({ label: `미연결: ${describeGear(id, gears)}`, id })),
      ...diagnostics.noPowerIds.map((id) => ({ label: `동력 없음: ${describeGear(id, gears)}`, id })),
      ...diagnostics.overlapPairs.map(([a, b]) => ({
        label: `겹침: ${describeGear(a, gears)} / ${describeGear(b, gears)}`,
        id: a,
      })),
    ];

    this.container.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = `문제 있는 기어: ${items.length}개`;
    this.container.appendChild(heading);

    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item.label;
      li.dataset.gearId = item.id;
      list.appendChild(li);
    }
    this.container.appendChild(list);
  }
}
