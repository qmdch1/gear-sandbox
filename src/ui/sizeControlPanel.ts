import type { GearInstance } from "../sim/types";
import { PART_INFO } from "./partInfo";

// `module` is the one parameter every part's geometry scales uniformly by --
// every function in gearGeometry.ts sizes hubs/rims/blades/teeth/etc. off of it
// directly (a wheel's rim radius is `module * 3.2`, a spur gear's pitch radius
// is `module * teeth / 2`, and so on) -- so "resize this part" means "change
// its module," for a gear and a non-toothed accessory (wheel/load/gauge/fan)
// alike.
export const MODULE_MIN = 0.3;
export const MODULE_MAX = 3;
const MODULE_STEP = 0.05;

/** A slider bound to the currently-selected part's `module` -- shows nothing
 *  when no part is selected. Changing a gear's own size like this doesn't
 *  retroactively resize whatever it was already meshed with (mismatched
 *  module gears don't mesh, exactly like real gears with different tooth
 *  pitches can't), so growing/shrinking a connected part can legitimately
 *  break its existing connections -- same "if it doesn't work in real life,
 *  it shouldn't work in the sim" principle as everywhere else here. */
export class SizeControlPanel {
  private empty: HTMLElement;
  private label: HTMLElement;
  private slider: HTMLInputElement;
  private currentType: GearInstance["type"] | null = null;

  constructor(container: HTMLElement, private onChange: (module: number) => void) {
    container.classList.add("size-control");

    this.empty = document.createElement("p");
    this.empty.className = "size-control-empty";
    this.empty.textContent = "부품을 클릭해서 고르면 크기를 조절할 수 있습니다.";

    this.label = document.createElement("div");
    this.label.className = "size-control-label";

    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = String(MODULE_MIN);
    this.slider.max = String(MODULE_MAX);
    this.slider.step = String(MODULE_STEP);
    this.slider.addEventListener("input", () => {
      const module = Number(this.slider.value);
      this.onChange(module);
      this.updateLabel(module);
    });

    container.append(this.empty, this.label, this.slider);
    this.showEmpty();
  }

  private updateLabel(module: number): void {
    const name = this.currentType ? PART_INFO[this.currentType].label : "";
    this.label.textContent = `${name} 크기: ${module.toFixed(2)}배`;
  }

  private showEmpty(): void {
    this.empty.hidden = false;
    this.label.hidden = true;
    this.slider.hidden = true;
  }

  private showSlider(): void {
    this.empty.hidden = true;
    this.label.hidden = false;
    this.slider.hidden = false;
  }

  /** Reflects whichever part is currently selected (or none) -- call every
   *  frame, same as DiagnosticsPanel.render(), so the slider both appears/
   *  disappears with selection and stays in sync with the part's live module
   *  (e.g. right after a fresh drag onto the slider itself). */
  render(gear: GearInstance | null): void {
    if (!gear) {
      this.currentType = null;
      this.showEmpty();
      return;
    }
    this.currentType = gear.type;
    this.showSlider();
    this.slider.value = String(gear.module);
    this.updateLabel(gear.module);
  }
}
