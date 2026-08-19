import type { SimDiagnostics } from "../sim/types";

export class DiagnosticsPanel {
  constructor(private container: HTMLElement, private onFocus: (id: string) => void) {}

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
      li.addEventListener("click", () => this.onFocus(item.id));
      list.appendChild(li);
    }
    this.container.appendChild(list);
  }
}
