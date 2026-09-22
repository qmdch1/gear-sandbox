import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildLinkRibbon, CHAIN_MAX_LINKS } from "../../src/render/chainGeometry";
import { GROUND_SIZE } from "../../src/render/scene";

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
    // NOT `xs.filter(x => x >= 0 && x < slotWidth)` and then "the span is under slotWidth":
    // that filter bounds the span by construction, so the assertion held however wide the
    // plates were -- and got SAFER as they grew, because a fatter link spills further out of
    // the window and leaves less of itself inside it. Measure the plate instead.
    const nearXs = xs.filter((x) => x < slotWidth * 1.5);
    const plateSpan = Math.max(...nearXs) - Math.min(...nearXs);
    expect(plateSpan).toBeGreaterThan(0);
    expect(plateSpan).toBeLessThan(slotWidth); // the link doesn't fill its whole slot
    expect(plateSpan).toBeGreaterThan(slotWidth * 0.3); // ...but it is a link, not a speck
  });

  it("scales the chain's link count with the span between the endpoints", () => {
    const shortChain = buildLinkRibbon([0, 0, 0], [3, 0, 0], 0.2, "chain");
    const longChain = buildLinkRibbon([0, 0, 0], [30, 0, 0], 0.2, "chain");
    expect(longChain.attributes.position.count).toBeGreaterThan(shortChain.attributes.position.count);
  });

  // Investigated real-world bound: scene.ts's groundPlane is GROUND_SIZE a side, centred on
  // the origin, and click-to-place (placementControls.ts) commits gears at a raycast hit
  // against that exact mesh, so a hit can never fall outside it. `controls.maxDistance` only
  // bounds the camera's distance from its OrbitControls *target* -- nothing here clamps the
  // target itself, so panning lets a user move it anywhere and zoom back in to place a gear at
  // any point on the plane, corners included. The worst case reachable through the UI is
  // therefore two sprockets at opposite corners: the plane's diagonal.
  //
  // Taken FROM GROUND_SIZE rather than written out, because it was written out and went stale:
  // this said "500x500 ... maxDistance = 300 ... 707.11" against a plane that is 800 a side
  // with maxDistance 1500, so the real worst case is 1131.37. The conclusion survived -- the
  // cap engages either way, harder now -- but only by luck.
  const GROUND_PLANE_DIAGONAL = Math.SQRT2 * GROUND_SIZE;
  // sceneSync.ts hardcodes chain ribbons to width = 0.15 (`link.kind === "chain" ? 0.15 : 0.25`).
  const CHAIN_WIDTH = 0.15;
  const singlePlateVertexCount = new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed().attributes.position.count; // 36

  it("caps vertex count at the real worst-case reachable distance (the ground-plane diagonal) instead of scaling unbounded", () => {
    // Without a cap, CHAIN_LINK_PITCH_FACTOR=3 and this width would give
    // round(1131.37 / 0.45) = 2514 links -- 2514 * 36 = 90,504 vertices for one ribbon.
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

  it("runs a belt's U along its length and V around its girth", () => {
    // `sceneSync` scrolls a belt's rib texture to make it read as driven rather than painted
    // between two pulleys, and which UV axis does that depends entirely on this layout. It was
    // getting it wrong -- `repeat.set(1, BELT_RIB_REPEAT)` and `offset.y` put 24 rib repeats
    // around a girth drawn with six radial segments and exactly ONE along the whole run, and
    // scrolled the pattern sideways across the direction of travel. Nothing could catch it
    // there: under jsdom `getProceduralTexture` returns null, so the block that sets the map
    // never executes in the suite. It is catchable HERE, because it rests on this fact.
    const geometry = buildLinkRibbon([0, 0, 0], [100, 0, 0], 0.25, "belt", 0);
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    expect(uv).toBeDefined();

    // Every vertex at the near end shares u = 0; every vertex at the far end shares u = 1.
    // So u is the along-the-belt axis, and BELT_RIB_REPEAT belongs on repeat.x / offset.x.
    const near: number[] = [];
    const far: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) < 0.5) near.push(uv.getX(i));
      if (pos.getX(i) > 99.5) far.push(uv.getX(i));
    }
    expect(near.length).toBeGreaterThan(2);
    expect(far.length).toBeGreaterThan(2);
    for (const u of near) expect(u).toBeCloseTo(0, 9);
    for (const u of far) expect(u).toBeCloseTo(1, 9);

    // ...and v varies around a single ring, which is the girth.
    const ringVs = new Set<number>();
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) < 0.5) ringVs.add(+uv.getY(i).toFixed(6));
    expect(ringVs.size).toBeGreaterThan(2);
  });
});

describe("chain travel and plate twist", () => {
  // `chainTravel.test.ts` exercises the pure `chainLinkPositions`, and every call in this file
  // passed three or four arguments -- so `travel`, the fifth, never had a value and the wiring
  // between the two was untested. The whole feature could be deleted from `buildLinkRibbon`
  // with the suite green.
  const A: [number, number, number] = [0, 0, 0];
  const B: [number, number, number] = [20, 0, 0];

  const xsOf = (g: THREE.BufferGeometry) => {
    const pos = g.attributes.position;
    const out: number[] = [];
    for (let i = 0; i < pos.count; i++) out.push(pos.getX(i));
    return out.sort((a, b) => a - b);
  };

  it("moves the links along the run as travel advances", () => {
    const still = buildLinkRibbon(A, B, 0.2, "chain", 0);
    const moved = buildLinkRibbon(A, B, 0.2, "chain", 0.4);

    expect(moved.attributes.position.count).toBe(still.attributes.position.count);
    const a = xsOf(still);
    const b = xsOf(moved);
    const biggestShift = Math.max(...a.map((x, i) => Math.abs(x - b[i])));
    expect(biggestShift).toBeGreaterThan(0.05);
  });

  it("wraps rather than running off the end, so the chain stays between its sprockets", () => {
    for (const travel of [0, 0.3, 0.7, 1.3, -0.6]) {
      const xs = xsOf(buildLinkRibbon(A, B, 0.2, "chain", travel));
      expect(Math.min(...xs)).toBeGreaterThan(-1);
      expect(Math.max(...xs)).toBeLessThan(21);
    }
  });

  it("alternates each plate's twist, so the chain reads as links rather than a ladder", () => {
    // The twist swaps a plate's Y and Z extents and leaves its X extent along the run alone.
    // Every other assertion in this file reads `position.count` or X values, so none of them
    // could see it: deleting the twist changes nothing they measure.
    const g = buildLinkRibbon(A, B, 0.4, "chain", 0);
    const pos = g.attributes.position;

    const plates = new Map<number, { y: number[]; z: number[] }>();
    for (let i = 0; i < pos.count; i++) {
      const key = Math.round(pos.getX(i) * 2) / 2;
      const slot = plates.get(key) ?? { y: [], z: [] };
      slot.y.push(pos.getY(i));
      slot.z.push(pos.getZ(i));
      plates.set(key, slot);
    }
    const shapes = [...plates.values()]
      .filter((p) => p.y.length > 8)
      .map((p) => Math.max(...p.y) - Math.min(...p.y) > Math.max(...p.z) - Math.min(...p.z));
    expect(shapes.length).toBeGreaterThan(3);
    expect(new Set(shapes).size).toBe(2); // both orientations present
  });
});
