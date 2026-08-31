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

  it("defaults onPickChange to a safe no-op when omitted", () => {
    const onLink = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink);
    button.click(); // activate
    expect(() => {
      link.handleSelect("a");
      link.handleSelect("b");
      button.click(); // toggle off
    }).not.toThrow();
  });

  it("fires onPickChange with the gear id when the first gear is picked", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("a");
    expect(onPickChange).toHaveBeenCalledWith("a");
    expect(onPickChange).toHaveBeenCalledTimes(1);
  });

  it("fires onPickChange(null) alongside onLink when the second gear completes the link", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("a");
    onPickChange.mockClear();
    link.handleSelect("b");
    expect(onLink).toHaveBeenCalledWith("a", "b");
    expect(onPickChange).toHaveBeenCalledWith(null);
    expect(onPickChange).toHaveBeenCalledTimes(1);
  });

  it("fires onPickChange(null) when a same-gear click cancels the pending pick (no link)", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("a");
    onPickChange.mockClear();
    link.handleSelect("a");
    expect(onLink).not.toHaveBeenCalled();
    expect(onPickChange).toHaveBeenCalledWith(null);
  });

  it("does not fire onPickChange for a wrong-type click (never picked in the first place)", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const types: Record<string, GearType> = { a: "sprocket", b: "spur" };
    const link = new LinkModeUI(button, "sprocket", (id) => types[id], onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("b");
    expect(onPickChange).not.toHaveBeenCalled();
  });

  it("fires onPickChange(null) when the mode is toggled off while a pick is pending", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("a");
    onPickChange.mockClear();
    button.click(); // toggle off, abandoning the pending pick
    expect(onPickChange).toHaveBeenCalledWith(null);
    expect(onPickChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPickChange when toggled (on or off) with no pending pick", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate, no pick yet
    expect(onPickChange).not.toHaveBeenCalled();
    button.click(); // deactivate, still no pick
    expect(onPickChange).not.toHaveBeenCalled();
  });

  it("starts a fresh pick cycle for the next pair after completing a link", () => {
    const onLink = vi.fn();
    const onPickChange = vi.fn();
    const button = document.createElement("button");
    const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
    button.click(); // activate
    link.handleSelect("a");
    link.handleSelect("b"); // completes a-b, clears pick
    onPickChange.mockClear();
    link.handleSelect("c");
    expect(onPickChange).toHaveBeenCalledWith("c");
  });

  describe("reset", () => {
    it("cancels a pending pick and fires onPickChange(null)", () => {
      const onLink = vi.fn();
      const onPickChange = vi.fn();
      const button = document.createElement("button");
      const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
      button.click(); // activate
      link.handleSelect("a");
      onPickChange.mockClear();

      link.reset();

      expect(onPickChange).toHaveBeenCalledWith(null);
      expect(onPickChange).toHaveBeenCalledTimes(1);
      expect(onLink).not.toHaveBeenCalled();
    });

    it("is a safe no-op when nothing is pending (no spurious callback fire)", () => {
      const onLink = vi.fn();
      const onPickChange = vi.fn();
      const button = document.createElement("button");
      const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
      button.click(); // activate, no pick yet

      expect(() => link.reset()).not.toThrow();
      expect(onPickChange).not.toHaveBeenCalled();

      // Also a no-op while inactive.
      button.click(); // deactivate
      expect(() => link.reset()).not.toThrow();
      expect(onPickChange).not.toHaveBeenCalled();
    });

    it("does not toggle the mode's active state -- only clears the pending pick", () => {
      const onLink = vi.fn();
      const onPickChange = vi.fn();
      const button = document.createElement("button");
      const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
      button.click(); // activate
      link.handleSelect("a");

      link.reset();

      // Still armed: aria-pressed reflects `active`, untouched by reset().
      expect(button.getAttribute("aria-pressed")).toBe("true");
      // And the mode still consumes selects as an active link gesture, starting a fresh pick.
      onPickChange.mockClear();
      expect(link.handleSelect("c")).toBe(true);
      expect(onPickChange).toHaveBeenCalledWith("c");
    });

    it("lets a fresh pick complete a link normally after reset() cancels the stale one", () => {
      const onLink = vi.fn();
      const onPickChange = vi.fn();
      const button = document.createElement("button");
      const link = new LinkModeUI(button, "sprocket", () => "sprocket", onLink, onPickChange);
      button.click(); // activate
      link.handleSelect("a"); // pending pick on a stale gear id
      link.reset(); // e.g. the layout was swapped out from under this pick

      link.handleSelect("c");
      link.handleSelect("d");

      expect(onLink).toHaveBeenCalledWith("c", "d");
      expect(onLink).not.toHaveBeenCalledWith("a", expect.anything());
    });
  });
});
