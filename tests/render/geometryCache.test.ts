// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { cachedGeometryFor, clearGeometryCacheForTests } from "../../src/render/geometryCache";

describe("cachedGeometryFor", () => {
  beforeEach(() => clearGeometryCacheForTests());

  it("returns the exact same geometry instance for repeated calls with the same type/teeth/module", () => {
    // The whole point of the cache -- two gears placed with identical
    // type/teeth/module should share one BufferGeometry, not each rebuild an
    // identical copy from scratch.
    const a = cachedGeometryFor("spur", 20, 1);
    const b = cachedGeometryFor("spur", 20, 1);
    expect(a).toBe(b);
  });

  it("returns a different geometry instance for a different teeth count", () => {
    const a = cachedGeometryFor("spur", 20, 1);
    const b = cachedGeometryFor("spur", 10, 1);
    expect(a).not.toBe(b);
  });

  it("returns a different geometry instance for a different module", () => {
    const a = cachedGeometryFor("spur", 20, 1);
    const b = cachedGeometryFor("spur", 20, 2);
    expect(a).not.toBe(b);
  });

  it("returns a different geometry instance for a different type", () => {
    const a = cachedGeometryFor("spur", 20, 1);
    const b = cachedGeometryFor("helical", 20, 1);
    expect(a).not.toBe(b);
  });
});
