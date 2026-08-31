import { describe, it, expect } from "vitest";
import { wouldDuplicateLink } from "../../src/sim/remoteLinks";
import type { RemoteLink } from "../../src/sim/types";

describe("wouldDuplicateLink", () => {
  it("returns false against an empty existing array", () => {
    expect(wouldDuplicateLink({ a: "x", b: "y", kind: "chain" }, [])).toBe(false);
  });

  it("returns true for an exact duplicate (same a/b order, same kind)", () => {
    const existing: RemoteLink[] = [{ a: "x", b: "y", kind: "chain" }];
    expect(wouldDuplicateLink({ a: "x", b: "y", kind: "chain" }, existing)).toBe(true);
  });

  it("returns true for the same pair reversed (b/a order), same kind", () => {
    const existing: RemoteLink[] = [{ a: "x", b: "y", kind: "chain" }];
    expect(wouldDuplicateLink({ a: "y", b: "x", kind: "chain" }, existing)).toBe(true);
  });

  it("returns false for the same pair (either order) but a different kind", () => {
    const existing: RemoteLink[] = [{ a: "x", b: "y", kind: "chain" }];
    expect(wouldDuplicateLink({ a: "x", b: "y", kind: "belt" }, existing)).toBe(false);
    expect(wouldDuplicateLink({ a: "y", b: "x", kind: "belt" }, existing)).toBe(false);
  });

  it("returns false for a genuinely different pair", () => {
    const existing: RemoteLink[] = [{ a: "x", b: "y", kind: "chain" }];
    expect(wouldDuplicateLink({ a: "x", b: "z", kind: "chain" }, existing)).toBe(false);
  });

  it("checks against every existing link, not just the first", () => {
    const existing: RemoteLink[] = [
      { a: "p", b: "q", kind: "belt" },
      { a: "x", b: "y", kind: "chain" },
    ];
    expect(wouldDuplicateLink({ a: "y", b: "x", kind: "chain" }, existing)).toBe(true);
  });
});
