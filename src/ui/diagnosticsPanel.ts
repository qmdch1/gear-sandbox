import type { SimDiagnostics } from "../sim/types";

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

  render(diagnostics: SimDiagnostics): void {
    const items: Array<{ label: string; id: string }> = [
      ...diagnostics.unconnectedIds.map((id) => ({ label: `미연결: ${id}`, id })),
      ...diagnostics.noPowerIds.map((id) => ({ label: `동력 없음: ${id}`, id })),
      ...diagnostics.overlapPairs.map(([a, b]) => ({ label: `겹침: ${a} / ${b}`, id: a })),
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
