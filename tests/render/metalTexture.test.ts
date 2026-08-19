// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createMetalTexture, TYPE_HEALTHY_COLORS } from "../../src/render/metalTexture";

describe("TYPE_HEALTHY_COLORS", () => {
  it("has a distinct tint for every gear type", () => {
    const types = ["spur", "helical", "crank", "bevel", "worm", "load"] as const;
    const hexes = types.map((t) => TYPE_HEALTHY_COLORS[t].getHexString());
    expect(new Set(hexes).size).toBe(types.length);
  });
});

describe("createMetalTexture", () => {
  it("returns null under jsdom (no real canvas backend) instead of throwing or warning", () => {
    // This project's tests run under jsdom, which has no real 2D canvas context --
    // createMetalTexture must degrade to null cleanly rather than crash.
    expect(createMetalTexture()).toBeNull();
  });
});
