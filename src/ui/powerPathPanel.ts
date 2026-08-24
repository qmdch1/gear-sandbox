import type { PowerPathEntry } from "../sim/powerPaths";

/** Numeric supplement to the diagnostics list: for every power source (crank)
 *  and every real output part it reaches (wheel/fan/rotor/gauge), shows the
 *  net speed ratio between them -- see powerPaths.ts's doc comment for why
 *  that ratio is this sandbox's own honest stand-in for "efficiency" (it
 *  doesn't model torque/friction loss, only the gear ratio actually applied).
 *  Grouped by power source so two independent builds in the same scene (e.g.
 *  two different toy cars) list separately, side by side, for a direct
 *  "which one's geared faster" comparison. */
export class PowerPathPanel {
  constructor(private container: HTMLElement, onFocus: (id: string) => void) {
    // Same event-delegation pattern as DiagnosticsPanel -- a per-item listener
    // would get torn down by render()'s innerHTML rebuild mid-gesture.
    this.container.addEventListener("click", (event) => {
      const li = (event.target as HTMLElement).closest("li");
      const gearId = li?.dataset.gearId;
      if (gearId) onFocus(gearId);
    });
  }

  render(entries: PowerPathEntry[], labels: Map<string, string> = new Map()): void {
    const nameOf = (id: string): string => labels.get(id) ?? id;
    this.container.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "diag-ok";
      empty.textContent = "동력원에 연결된 출력 부품(바퀴·팬·로터·게이지)이 없습니다.";
      this.container.appendChild(empty);
      return;
    }

    const bySource = new Map<string, PowerPathEntry[]>();
    for (const entry of entries) {
      const list = bySource.get(entry.sourceId) ?? [];
      list.push(entry);
      bySource.set(entry.sourceId, list);
    }

    for (const [sourceId, sourceEntries] of bySource) {
      const heading = document.createElement("strong");
      heading.textContent = nameOf(sourceId);
      this.container.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "power-path-list";
      for (const entry of sourceEntries) {
        const li = document.createElement("li");
        const ratioText = entry.ratio === null ? "정지" : `x${entry.ratio.toFixed(2)}`;
        const speedText = Math.abs(entry.outputAngularVelocity).toFixed(2);
        li.textContent = `${nameOf(entry.outputId)}: 배율 ${ratioText} (속도 ${speedText})`;
        li.dataset.gearId = entry.outputId;
        list.appendChild(li);
      }
      this.container.appendChild(list);
    }
  }
}
