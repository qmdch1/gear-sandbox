import { describe, it, expect } from "vitest";
import { serializeLayout, deserializeLayout, validateLayout } from "../../src/persistence/serialize";
import type { GearInstance, LayoutState } from "../../src/sim/types";

/** A fully-populated, valid gear -- the baseline the rejection tests below mutate. */
function validGear(): GearInstance {
  return {
    id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
    broken: false, rotation: 0.4, angularVelocity: -2,
  };
}

describe("serialize/deserialize round-trip", () => {
  it("recovers an identical layout (gears + remoteLinks) after a round trip", () => {
    const layout: LayoutState = {
      gears: [{
        id: "a", type: "spur", position: [1, 2, 3], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 87.5,
        broken: false, rotation: 0.4, angularVelocity: -2,
      }],
      remoteLinks: [{ a: "a", b: "b", kind: "chain" }],
    };
    const restored = deserializeLayout(serializeLayout(layout));
    expect(restored).toEqual(layout);
  });

  it("defaults remoteLinks to [] for a v1 save file that predates the field", () => {
    const v1Payload = JSON.stringify({
      version: 1,
      gears: [{
        id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
        teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
        broken: false, rotation: 0, angularVelocity: 1,
      }],
    });
    const restored = deserializeLayout(v1Payload);
    expect(restored.remoteLinks).toEqual([]);
    expect(restored.gears).toHaveLength(1);
  });

  it("rejects a malformed save file", () => {
    expect(() => deserializeLayout("{}")).toThrow();
  });

  it("rejects a save file whose remoteLinks entries are malformed", () => {
    const bad = JSON.stringify({ version: 2, gears: [], remoteLinks: [{ a: "x" }] });
    expect(() => deserializeLayout(bad)).toThrow();
  });

  it("drops duplicate remoteLinks -- same unordered pair and kind, in either a/b order", () => {
    const payload = JSON.stringify({
      version: 2,
      gears: [],
      remoteLinks: [
        { a: "x", b: "y", kind: "chain" },
        { a: "y", b: "x", kind: "chain" }, // same pair, reversed order
        { a: "x", b: "y", kind: "chain" }, // exact duplicate
        { a: "x", b: "y", kind: "belt" }, // same pair, different kind -- kept
      ],
    });
    const restored = deserializeLayout(payload);
    expect(restored.remoteLinks).toEqual([
      { a: "x", b: "y", kind: "chain" },
      { a: "x", b: "y", kind: "belt" },
    ]);
  });

  it("rejects a gear array containing an element with a missing required field", () => {
    // The bad element is second, so this also pins that validation covers every element
    // rather than only the first.
    const incomplete: Partial<GearInstance> = { ...validGear() };
    delete incomplete.angularVelocity;
    const bad = JSON.stringify({ version: 2, gears: [validGear(), incomplete], remoteLinks: [] });
    expect(() => deserializeLayout(bad)).toThrow();
  });

  it("rejects a gear whose type is not a known gear type", () => {
    const bad = JSON.stringify({
      version: 2,
      gears: [{ ...validGear(), type: "sprocketeer" }],
      remoteLinks: [],
    });
    expect(() => deserializeLayout(bad)).toThrow();
  });

  it("rejects a gear whose axis is not a 3-tuple of finite numbers", () => {
    const badAxes: unknown[] = [
      [0, 1],                        // too short
      [0, 1, 0, 0],                  // too long
      [0, "up", 0],                     // not all numbers
      [0, Number.NaN, 0],               // JSON renders NaN as null -- still not a number
      [0, Number.POSITIVE_INFINITY, 0], // JSON renders Infinity as null -- likewise
      "y",                              // not an array at all
      null,
    ];
    for (const axis of badAxes) {
      const bad = JSON.stringify({ version: 2, gears: [{ ...validGear(), axis }], remoteLinks: [] });
      expect(() => deserializeLayout(bad), `axis ${JSON.stringify(axis)} should be rejected`).toThrow();
    }
  });
});

describe("validateLayout", () => {
  it("passes a valid already-parsed layout through unchanged in shape", () => {
    const layout: LayoutState = {
      gears: [validGear()],
      remoteLinks: [{ a: "a", b: "b", kind: "chain" }],
    };
    expect(validateLayout(layout)).toEqual(layout);
  });

  it("throws on an invalid gear", () => {
    expect(() => validateLayout({ gears: [{ ...validGear(), type: "sprocketeer" }], remoteLinks: [] })).toThrow(
      "Invalid gear-sandbox save file",
    );
  });

  it("throws on an invalid remoteLink", () => {
    expect(() => validateLayout({ gears: [], remoteLinks: [{ a: "x" }] })).toThrow("Invalid gear-sandbox save file");
  });

  it("dedupes duplicate remote links", () => {
    const restored = validateLayout({
      gears: [],
      remoteLinks: [
        { a: "x", b: "y", kind: "chain" },
        { a: "y", b: "x", kind: "chain" }, // same pair, reversed order
      ],
    });
    expect(restored.remoteLinks).toEqual([{ a: "x", b: "y", kind: "chain" }]);
  });

  it("defaults a missing remoteLinks field to []", () => {
    const restored = validateLayout({ gears: [validGear()] });
    expect(restored.remoteLinks).toEqual([]);
  });

  it("rejects a non-object and an object with a missing/non-array gears field", () => {
    expect(() => validateLayout(null)).toThrow("Invalid gear-sandbox save file");
    expect(() => validateLayout("not an object")).toThrow("Invalid gear-sandbox save file");
    expect(() => validateLayout({})).toThrow("Invalid gear-sandbox save file");
  });
});
