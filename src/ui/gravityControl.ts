import { GRAVITY_PRESETS, type GravityPreset } from "../sim/units";

/** Labels for the gravity picker. Korean, with the real figure alongside, because the number is
 *  the interesting part: seeing 1.62 next to 9.81 explains the long floaty drop far better than
 *  the word "달" on its own does. */
const LABELS: Record<GravityPreset, string> = {
  earth: "지구 (9.81 m/s²)",
  moon: "달 (1.62 m/s²)",
  mars: "화성 (3.72 m/s²)",
  jupiter: "목성 (24.79 m/s²)",
  zero: "무중력 (0 m/s²)",
};

/** Picks the downward acceleration the whole yard runs under.
 *
 *  Not a display option: the value goes into `tick`, where it sets how fast a dropped part falls
 *  and how hard a vehicle's rolling resistance holds it back (resistance is a fraction of
 *  WEIGHT, so the same car really does run faster on the Moon). */
export class GravityControl {
  readonly select: HTMLSelectElement;

  constructor(container: HTMLElement, onChange: (gravity: number) => void, initial: GravityPreset = "earth") {
    this.select = document.createElement("select");
    this.select.id = "gravity-select";
    for (const key of Object.keys(GRAVITY_PRESETS) as GravityPreset[]) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = LABELS[key];
      this.select.appendChild(option);
    }
    this.select.value = initial;
    this.select.addEventListener("change", () => {
      onChange(GRAVITY_PRESETS[this.select.value as GravityPreset]);
    });
    container.appendChild(this.select);
  }
}
