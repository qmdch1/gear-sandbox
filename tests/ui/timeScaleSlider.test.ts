// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { TimeScaleSlider } from "../../src/ui/timeScaleSlider";

describe("TimeScaleSlider", () => {
  it("reports the slider's numeric value on input", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const slider = new TimeScaleSlider(container, onChange, 1);
    slider.input.value = "5.5";
    slider.input.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith(5.5);
  });

  it("stays within the 0.1x-10x range declared in the spec", () => {
    const slider = new TimeScaleSlider(document.createElement("div"), () => {});
    expect(slider.input.min).toBe("0.1");
    expect(slider.input.max).toBe("10");
  });
});
