export class TimeScaleSlider {
  readonly input: HTMLInputElement;

  constructor(container: HTMLElement, onChange: (value: number) => void, initial = 1) {
    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.min = "0.1";
    this.input.max = "10";
    this.input.step = "0.1";
    this.input.value = String(initial);
    this.input.addEventListener("input", () => onChange(Number(this.input.value)));
    container.appendChild(this.input);
  }
}
