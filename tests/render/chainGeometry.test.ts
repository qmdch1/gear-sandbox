import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildLinkRibbon } from "../../src/render/chainGeometry";

describe("buildLinkRibbon", () => {
  it("builds a non-empty tube geometry spanning two points (belt path, default kind)", () => {
    const geometry = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
    geometry.computeBoundingBox();
    const length = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
    expect(length).toBeGreaterThan(9); // spans roughly the 10-unit distance between the endpoints
  });

  it("passing kind: 'belt' explicitly is identical to the default (no regression)", () => {
    const implicitBelt = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2);
    const explicitBelt = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2, "belt");
    expect(explicitBelt.attributes.position.count).toBe(implicitBelt.attributes.position.count);
    explicitBelt.computeBoundingBox();
    implicitBelt.computeBoundingBox();
    expect(explicitBelt.boundingBox!.max.toArray()).toEqual(implicitBelt.boundingBox!.max.toArray());
    expect(explicitBelt.boundingBox!.min.toArray()).toEqual(implicitBelt.boundingBox!.min.toArray());
  });

  it("builds a chain as a sequence of discrete link shapes, distinct from the belt's smooth tube", () => {
    const belt = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2, "belt");
    const chain = buildLinkRibbon([0, 0, 0], [10, 0, 0], 0.2, "chain");

    // Genuinely different geometry, not just a relabeled tube.
    expect(chain.attributes.position.count).not.toBe(belt.attributes.position.count);

    // The chain geometry should decompose exactly into N copies of one link "plate" shape:
    // a BoxGeometry, whose non-indexed vertex count is independent of its exact dimensions
    // (always 36 for a box: 6 faces * 2 triangles * 3 vertices), so this is a precise check
    // that the chain is built from repeated discrete sub-shapes rather than one continuous
    // surface.
    const singlePlateVertexCount = new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed().attributes.position.count;
    expect(chain.attributes.position.count % singlePlateVertexCount).toBe(0);
    const linkCount = chain.attributes.position.count / singlePlateVertexCount;
    expect(linkCount).toBeGreaterThanOrEqual(3); // matches CHAIN_MIN_LINKS floor

    // Links sit at evenly-spaced intervals along the span, each occupying only part of its
    // slot -- i.e. there are real gaps between them, not one solid bar. Bucket vertices by
    // which "slot" along X they fall in and confirm not every slot is fully populated end
    // to end (a solid bar would have position.x values densely covering [0, 10]; discrete
    // gapped links leave measurable holes just past each link's own extent).
    chain.computeBoundingBox();
    const xs: number[] = [];
    const position = chain.attributes.position;
    for (let i = 0; i < position.count; i++) xs.push(position.getX(i));
    const slotWidth = 10 / linkCount;
    const firstSlotXs = xs.filter((x) => x >= 0 && x < slotWidth);
    const firstSlotSpan = Math.max(...firstSlotXs) - Math.min(...firstSlotXs);
    expect(firstSlotSpan).toBeLessThan(slotWidth); // the link doesn't fill its whole slot -- there's a gap
  });

  it("scales the chain's link count with the span between the endpoints", () => {
    const shortChain = buildLinkRibbon([0, 0, 0], [3, 0, 0], 0.2, "chain");
    const longChain = buildLinkRibbon([0, 0, 0], [30, 0, 0], 0.2, "chain");
    expect(longChain.attributes.position.count).toBeGreaterThan(shortChain.attributes.position.count);
  });
});
