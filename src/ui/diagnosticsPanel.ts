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

  /** `labels`, when given, swaps a gear's raw (unreadable) id for a numbered,
   *  human-readable name (see gearLabels.ts) wherever one is shown -- falls
   *  back to the bare id if a gear's label is missing for some reason. */
  render(diagnostics: SimDiagnostics, labels: Map<string, string> = new Map()): void {
    const nameOf = (id: string): string => labels.get(id) ?? id;
    this.container.innerHTML = "";

    // "미연결" just means "hasn't been hooked up to anything yet" -- completely
    // normal for a part you only just placed, not something wrong with it, so
    // it's listed separately from real problems below, in a neutral style
    // rather than the same alarming red.
    if (diagnostics.unconnectedIds.length > 0) {
      const heading = document.createElement("strong");
      heading.textContent = `연결 안 된 부품: ${diagnostics.unconnectedIds.length}개`;
      this.container.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "diag-info";
      for (const id of diagnostics.unconnectedIds) {
        const li = document.createElement("li");
        li.textContent = nameOf(id);
        li.dataset.gearId = id;
        list.appendChild(li);
      }
      this.container.appendChild(list);
    }

    // Genuine problems: connected but no path back to a power source, or two
    // parts geometrically overlapping -- these actually need the user's
    // attention, unlike a merely-unconnected part sitting on its own.
    const problems: Array<{ label: string; id: string }> = [
      ...diagnostics.noPowerIds.map((id) => ({ label: `동력 없음: ${nameOf(id)}`, id })),
      ...diagnostics.overlapPairs.map(([a, b]) => ({ label: `겹침: ${nameOf(a)} / ${nameOf(b)}`, id: a })),
    ];
    if (problems.length > 0) {
      const heading = document.createElement("strong");
      heading.textContent = `문제 있는 기어: ${problems.length}개`;
      this.container.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "diag-problem";
      for (const item of problems) {
        const li = document.createElement("li");
        li.textContent = item.label;
        li.dataset.gearId = item.id;
        list.appendChild(li);
      }
      this.container.appendChild(list);
    }

    if (diagnostics.unconnectedIds.length === 0 && problems.length === 0) {
      const ok = document.createElement("p");
      ok.className = "diag-ok";
      ok.textContent = "문제 없음";
      this.container.appendChild(ok);
    }
  }
}
