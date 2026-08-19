import { describe, it, expect } from "vitest";
import { findNearestCompatiblePartner } from "../../src/interaction/dragControls";
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
