import { describe, it, expect } from "vitest";
import { findNearestCompatiblePartner, findSnapTarget } from "../../src/interaction/dragControls";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("findNearestCompatiblePartner", () => {
  it("picks the gear that would form a valid mesh, ignoring one that would not", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const validPartner = makeGear({ id: "valid", teeth: 20, module: 1, position: [0, 0, 0] }); // dist 15 = 10+20 /2... see below
    const farPartner = makeGear({ id: "far", teeth: 20, module: 1, position: [500, 0, 0] });
    const partner = findNearestCompatiblePartner(dragged, [validPartner, farPartner]);
    expect(partner?.id).toBe("valid");
  });

  it("returns null when nothing nearby would form a valid mesh", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [15, 0, 0] });
    const incompatible = makeGear({ id: "incompatible", teeth: 20, module: 1, position: [900, 0, 0] });
    expect(findNearestCompatiblePartner(dragged, [incompatible])).toBeNull();
  });
});

describe("findSnapTarget", () => {
  it("snaps a dragged gear onto the valid meshing ring around a nearby compatible partner", () => {
    // dragged (teeth 10) + partner (teeth 20), module 1 -> ideal distance 15.
    // Drop point is 12 units out (within the 6-unit slack), straight along +X.
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [12, 0, 0] });
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, position: [0, 0, 0] });
    const snap = findSnapTarget(dragged, [12, 0, 0], [dragged, partner]);
    expect(snap?.partnerId).toBe("partner");
    expect(snap?.position[0]).toBeCloseTo(15);
    expect(snap?.position[2]).toBeCloseTo(0);
  });

  it("does not snap when the drop point is far outside the slack tolerance", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [0, 0, 0] });
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, position: [0, 0, 0] });
    // ideal distance is 15; dropping at 60 units out is way outside the 6-unit slack.
    expect(findSnapTarget(dragged, [60, 0, 0], [dragged, partner])).toBeNull();
  });

  it("snaps a load object directly onto a coincident gear's shaft, ignoring drop distance direction", () => {
    const dragged = makeGear({ id: "load", type: "load", teeth: 0, position: [3, 0, 0] });
    const partner = makeGear({ id: "host", teeth: 20, module: 1, position: [0, 0, 0] });
    const snap = findSnapTarget(dragged, [3, 0, 0], [dragged, partner]);
    expect(snap?.partnerId).toBe("host");
    expect(snap?.position).toEqual([0, 0, 0]);
  });

  it("ignores a gear that could never connect regardless of distance (mismatched axis)", () => {
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, axis: [0, 1, 0], position: [12, 0, 0] });
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, axis: [1, 0, 0], position: [0, 0, 0] });
    expect(findSnapTarget(dragged, [12, 0, 0], [dragged, partner])).toBeNull();
  });
});
