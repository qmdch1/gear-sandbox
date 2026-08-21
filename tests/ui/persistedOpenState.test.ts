// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadOpenState, saveOpenState } from "../../src/ui/persistedOpenState";

const KEY = "test:open-state";

describe("persistedOpenState", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing has been saved yet", () => {
    expect(loadOpenState(KEY)).toBeNull();
  });

  it("round-trips exactly what was saved", () => {
    saveOpenState(KEY, { a: true, b: false });
    expect(loadOpenState(KEY)).toEqual({ a: true, b: false });
  });

  it("returns null for corrupted (non-JSON) stored data instead of throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadOpenState(KEY)).toBeNull();
  });

  it("returns null when the stored value isn't an object (e.g. a bare number)", () => {
    localStorage.setItem(KEY, "42");
    expect(loadOpenState(KEY)).toBeNull();
  });

  it("does not throw when localStorage itself throws (e.g. disabled storage)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(loadOpenState(KEY)).toBeNull();
    spy.mockRestore();
  });

  it("does not throw when saving fails (e.g. quota exceeded)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => saveOpenState(KEY, { a: true })).not.toThrow();
    spy.mockRestore();
  });
});
