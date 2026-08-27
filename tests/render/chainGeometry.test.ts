import { describe, it, expect } from "vitest";
import { buildLinkRibbon } from "../../src/render/chainGeometry";

describe("buildLinkRibbon", () => {
  it("builds a non-empty tube geometry spanning two points", () => {
    const geometry = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
    geometry.computeBoundingBox();
    const length = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
    expect(length).toBeGreaterThan(9); // spans roughly the 10-unit distance between the endpoints
  });
});
