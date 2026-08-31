import { describe, it, expect } from "vitest";
import {
  findOverlappingGear,
  resolveOverlapFreePosition,
  resolveOverlapFreePositionForGear,
} from "../../src/sim/overlapResolution";
import { createGear } from "../../src/sim/gearFactory";
import { isOverlapping } from "../../src/sim/meshing";
import type { GearInstance } from "../../src/sim/types";

/** A fixed-id existing gear, matching the real `GearInstance` shape (same conventions as
 *  `defaultLayout.ts`'s `seedGear` and the placement/drag test files). */
function seedGear(
  id: string,
  type: GearInstance["type"],
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
): GearInstance {
  return {
    id,
    type,
    position,
    axis,
    teeth,
    module: 1,
    durabilityMax: 100,
    durabilityCurrent: 100,
    broken: false,
    rotation: 0,
    angularVelocity: 0,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

describe("findOverlappingGear", () => {
  it("returns the nearest gear a candidate genuinely overlaps", () => {
    const candidate = createGear("spur", [0, 0, 0]);
    const near = seedGear("near", "spur", [5, 0, 0], [0, 1, 0], 20);
    const far = seedGear("far", "spur", [3, 0, 0], [0, 1, 0], 20);
    // Both `near` and `far` geometrically overlap a spur at the origin; `far` is
    // actually closer despite the name, to verify "nearest" really means nearest.
    expect(findOverlappingGear(candidate, [near, far])).toBe(far);
  });

  it("returns null when the candidate does not overlap anything", () => {
    const candidate = createGear("spur", [0, 0, 0]);
    const distant = seedGear("distant", "spur", [500, 0, 0], [0, 1, 0], 20);
    expect(findOverlappingGear(candidate, [distant])).toBeNull();
  });

  it("does not report a legitimate coincident coupling as an overlap", () => {
    const load = createGear("load", [5, 0, 7]);
    const crank = seedGear("crank", "crank", [5, 0, 7], [0, 1, 0], 20);
    expect(findOverlappingGear(load, [crank])).toBeNull();
  });
});

describe("resolveOverlapFreePosition", () => {
  it("returns the position unchanged when nothing overlaps", () => {
    const gears = [seedGear("far", "spur", [500, 0, 0], [0, 1, 0], 20)];
    const position: [number, number, number] = [0, 0, 0];
    expect(resolveOverlapFreePosition("spur", position, gears)).toBe(position);
  });

  it("nudges clear of a gear the candidate would otherwise land on top of", () => {
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePosition("spur", [5, 0, 7], [blocker]);
    expect(resolved).not.toEqual([5, 0, 7]);
    expect(isOverlapping(createGear("spur", resolved), blocker)).toBe(false);
  });
});

describe("resolveOverlapFreePositionForGear", () => {
  it("returns the position unchanged when nothing overlaps", () => {
    const dragged = seedGear("dragged", "spur", [0, 0, 0], [0, 1, 0], 20);
    const others = [seedGear("far", "spur", [500, 0, 0], [0, 1, 0], 20)];
    const position: [number, number, number] = [1, 0, 1];
    expect(resolveOverlapFreePositionForGear(dragged, position, others)).toBe(position);
  });

  it("nudges an existing gear clear of another gear it would otherwise land on top of", () => {
    const dragged = seedGear("dragged", "spur", [-50, 0, -50], [0, 1, 0], 20);
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePositionForGear(dragged, [5, 0, 7], [blocker]);
    expect(resolved).not.toEqual([5, 0, 7]);
    const finalGear: GearInstance = { ...dragged, position: resolved };
    expect(isOverlapping(finalGear, blocker)).toBe(false);
  });

  it("does not nudge a legitimate coincident placement (e.g. a load dragged onto its crank)", () => {
    const dragged = seedGear("dragged-load", "load", [-50, 0, -50], [0, 1, 0], 0);
    const crank = seedGear("crank", "crank", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePositionForGear(dragged, [5, 0, 7], [crank]);
    expect(resolved).toEqual([5, 0, 7]);
  });

  it("preserves the dragged gear's own teeth/module/axis when computing clearance, not the type's default shape", () => {
    // A large custom teeth count (well beyond `defaultTeethForType("spur")` = 20) gives this
    // gear a much bigger pitch radius than a freshly-`createGear`'d spur would have. If the
    // resolver mistakenly rebuilt a type-default candidate instead of preserving `dragged`'s
    // actual shape, the computed clearance would be far too small and the nudge would still
    // land inside the blocker's true (large) radius.
    const dragged = seedGear("big-dragged", "spur", [-50, 0, -50], [0, 1, 0], 200);
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePositionForGear(dragged, [5, 0, 7], [blocker]);
    const finalGear: GearInstance = { ...dragged, position: resolved };
    expect(isOverlapping(finalGear, blocker)).toBe(false);
  });

  it("actually clears a zero-teeth load nudged near a blocker (regression: nudge distance must use the same footprint isOverlapping checks)", () => {
    // A "load" has teeth: 0, so its `pitchRadius` is 0 -- but `isOverlapping` never uses raw
    // `pitchRadius` for its own boundary check; it uses `overlapRadius`, which substitutes
    // `module * 2` for a zero-teeth gear's real (rendered) footprint. If the nudge distance were
    // computed from `pitchRadius` instead, it would converge on a distance smaller than what
    // `isOverlapping` actually requires, so `findOverlappingGear` would keep reporting the same
    // blocker forever and the resolved position would still fail the real overlap check.
    //
    // Placed 1 unit off from the blocker's center (not exactly coincident) so this is a genuine
    // geometric overlap, not the legitimate "load coupled onto its host gear" coincident case
    // that `evaluatePair`/`isOverlapping` deliberately treat as non-overlapping (see
    // `findOverlappingGear`'s "does not report a legitimate coincident coupling" test above).
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePosition("load", [5, 0, 8], [blocker]);
    const finalLoad: GearInstance = { ...createGear("load", resolved), position: resolved };
    expect(isOverlapping(finalLoad, blocker)).toBe(false);
  });

  it("nudges a zero-teeth existing (dragged) load gear clear of a blocker as well", () => {
    const dragged = seedGear("dragged-load", "load", [-50, 0, -50], [0, 1, 0], 0);
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePositionForGear(dragged, [5, 0, 8], [blocker]);
    const finalGear: GearInstance = { ...dragged, position: resolved };
    expect(isOverlapping(finalGear, blocker)).toBe(false);
  });

  it("leaves normal (non-zero-teeth) gear nudging completely unchanged -- overlapRadius equals pitchRadius whenever teeth > 0", () => {
    // For any gear with teeth > 0, `overlapRadius(g) === pitchRadius(g)` by definition, so
    // switching the clearance formula to `overlapRadius` must land on exactly the same distance
    // as the old `pitchRadius`-based formula did for an ordinary spur-vs-spur nudge.
    const blocker = seedGear("blocker", "spur", [5, 0, 7], [0, 1, 0], 20);
    const resolved = resolveOverlapFreePosition("spur", [5, 0, 7], [blocker]);
    const NUDGE_CLEARANCE_FACTOR = 1.02;
    const candidatePitchRadius = 10; // module 1 * teeth 20 / 2 (defaultTeethForType("spur") = 20)
    const blockerPitchRadius = 10;
    const expectedDistance = (candidatePitchRadius + blockerPitchRadius) * NUDGE_CLEARANCE_FACTOR;
    const dx = resolved[0] - blocker.position[0];
    const dz = resolved[2] - blocker.position[2];
    expect(Math.hypot(dx, dz)).toBeCloseTo(expectedDistance, 9);
  });
});
