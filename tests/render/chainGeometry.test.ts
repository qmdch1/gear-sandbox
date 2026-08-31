import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildLinkRibbon, CHAIN_MAX_LINKS } from "../../src/render/chainGeometry";

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

  // Investigated real-world bound: scene.ts's groundPlane is a 500x500 PlaneGeometry
  // centered on the origin (x, z each in [-250, 250]), and click-to-place
  // (placementControls.ts) commits gears at a raycast hit against that exact mesh, so a
  // hit can never fall outside it. scene.ts's `controls.maxDistance = 300` only bounds
  // the camera's distance from its OrbitControls *target* -- nothing in this codebase
  // clamps `controls.target` itself, so panning (OrbitControls' default) lets a user
  // move that target anywhere and then zoom back in (down to `minDistance = 5`) to
  // precisely place a gear at any point on the plane, including its far corners. The
  // true worst case a user can create via the UI is therefore two sprockets sitting at
  // opposite corners of the ground plane: distance = sqrt(500^2 + 500^2) ~= 707.11.
  const GROUND_PLANE_DIAGONAL = Math.sqrt(500 ** 2 + 500 ** 2);
  // sceneSync.ts hardcodes chain ribbons to width = 0.15 (`link.kind === "chain" ? 0.15 : 0.25`).
  const CHAIN_WIDTH = 0.15;
  const singlePlateVertexCount = new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed().attributes.position.count; // 36

  it("caps vertex count at the real worst-case reachable distance (500x500 ground-plane diagonal) instead of scaling unbounded", () => {
    // Without a cap, CHAIN_LINK_PITCH_FACTOR=3 and this width would give
    // round(707.11 / 0.45) = 1571 links -- 1571 * 36 = 56,556 vertices for one ribbon.
    const uncappedNaiveLinkCount = Math.round(GROUND_PLANE_DIAGONAL / (CHAIN_WIDTH * 3));
    expect(uncappedNaiveLinkCount).toBeGreaterThan(CHAIN_MAX_LINKS); // confirms the cap actually engages for this real span

    const chain = buildLinkRibbon([0, 0, 0], [GROUND_PLANE_DIAGONAL, 0, 0], CHAIN_WIDTH, "chain");
    expect(chain.attributes.position.count % singlePlateVertexCount).toBe(0);
    const linkCount = chain.attributes.position.count / singlePlateVertexCount;

    expect(linkCount).toBe(CHAIN_MAX_LINKS); // capped, not the naive 1571
    expect(chain.attributes.position.count).toBe(CHAIN_MAX_LINKS * singlePlateVertexCount); // 9,000 vertices, not 56,556
  });

  it("stays at the same capped vertex count even far beyond anything reachable through the UI", () => {
    // Distance far beyond the 500x500 ground plane's own diagonal -- not reachable via
    // click-to-place today, but this proves the cap bounds vertex count unconditionally
    // rather than merely happening to cover today's ground-plane size.
    const chain = buildLinkRibbon([0, 0, 0], [100_000, 0, 0], CHAIN_WIDTH, "chain");
    const linkCount = chain.attributes.position.count / singlePlateVertexCount;
    expect(linkCount).toBe(CHAIN_MAX_LINKS);
  });

  it("degrades gracefully when capped -- links spread out further, they don't overlap or break", () => {
    const chain = buildLinkRibbon([0, 0, 0], [GROUND_PLANE_DIAGONAL, 0, 0], CHAIN_WIDTH, "chain");
    chain.computeBoundingBox();
    const xs: number[] = [];
    const position = chain.attributes.position;
    for (let i = 0; i < position.count; i++) xs.push(position.getX(i));

    // Same gap check as the uncapped case above: each link's own slot along the span
    // should still show a real gap to its neighbor, not a solid/overlapping bar, even
    // though the capped pitch is now much coarser than CHAIN_LINK_PITCH_FACTOR's
    // "desired" spacing.
    const slotWidth = GROUND_PLANE_DIAGONAL / CHAIN_MAX_LINKS;
    const firstSlotXs = xs.filter((x) => x >= 0 && x < slotWidth);
    const firstSlotSpan = Math.max(...firstSlotXs) - Math.min(...firstSlotXs);
    expect(firstSlotSpan).toBeLessThan(slotWidth);

    // The whole ribbon still spans (approximately) the full requested distance -- capping
    // the link count doesn't truncate or shrink the chain, it just spaces links out more.
    const length = chain.boundingBox!.max.x - chain.boundingBox!.min.x;
    expect(length).toBeGreaterThan(GROUND_PLANE_DIAGONAL * 0.95);
  });
});
