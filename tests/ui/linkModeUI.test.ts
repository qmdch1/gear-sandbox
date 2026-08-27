// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { LinkModeUI } from "../../src/ui/linkModeUI";
import type { GearType } from "../../src/sim/types";

describe("LinkModeUI", () => {
  it("does nothing while inactive", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    expect(link.handleSelect("a")).toBe(false);
    expect(onLink).not.toHaveBeenCalled();
  });

  it("ignores a gear of the wrong type even while active", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const types: Record<string, GearType> = { a: "sprocket", b: "spur" };
    const link = new LinkModeUI(button, "sprocket", (id) => types[id], onLink);
    button.click(); // activate
    expect(link.handleSelect("b")).toBe(false);
    expect(onLink).not.toHaveBeenCalled();
  });

  it("links two matching-type gears on the second click, then resets for the next pair", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    button.click(); // activate
    expect(link.handleSelect("a")).toBe(true);
    expect(onLink).not.toHaveBeenCalled();
    expect(link.handleSelect("b")).toBe(true);
    expect(onLink).toHaveBeenCalledWith("a", "b");

    onLink.mockClear();
    expect(link.handleSelect("c")).toBe(true); // starts a fresh pair
    expect(link.handleSelect("d")).toBe(true);
    expect(onLink).toHaveBeenCalledWith("c", "d");
  });

  it("does not link a gear to itself on a repeated click", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    button.click();
    link.handleSelect("a");
    link.handleSelect("a");
    expect(onLink).not.toHaveBeenCalled();
  });
});
