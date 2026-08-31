import { describe, it, expect } from "vitest";
import { createDirtyTracker } from "../../src/runtime/dirtyTracker";

describe("createDirtyTracker", () => {
  it("starts clean", () => {
    const tracker = createDirtyTracker();
    expect(tracker.isDirty()).toBe(false);
  });

  it("markDirty flips it to dirty", () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    expect(tracker.isDirty()).toBe(true);
  });

  it("markClean resets it back to clean", () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    tracker.markClean();
    expect(tracker.isDirty()).toBe(false);
  });

  it("multiple markDirty calls in a row are idempotent", () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    tracker.markDirty();
    tracker.markDirty();
    expect(tracker.isDirty()).toBe(true);
  });

  it("multiple markClean calls in a row are idempotent", () => {
    const tracker = createDirtyTracker();
    tracker.markClean();
    tracker.markClean();
    expect(tracker.isDirty()).toBe(false);
  });

  it("markClean while already clean (never dirtied) stays clean", () => {
    const tracker = createDirtyTracker();
    tracker.markClean();
    expect(tracker.isDirty()).toBe(false);
  });

  it("supports re-dirtying after a markClean, e.g. an edit after a save", () => {
    const tracker = createDirtyTracker();
    tracker.markDirty();
    tracker.markClean();
    tracker.markDirty();
    expect(tracker.isDirty()).toBe(true);
  });

  it("two independent trackers do not share state", () => {
    const a = createDirtyTracker();
    const b = createDirtyTracker();
    a.markDirty();
    expect(a.isDirty()).toBe(true);
    expect(b.isDirty()).toBe(false);
  });
});
