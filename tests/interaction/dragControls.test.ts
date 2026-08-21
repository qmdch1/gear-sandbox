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
  it("snaps a dragged gear onto the valid meshing ring, angle-corrected to the nearest phase-centered detent", () => {
    // dragged (teeth 10) + partner (teeth 20), module 1 -> ideal distance 15.
    // Drop point is 12 units out (within the 6-unit slack), roughly along +X -- the
    // angle itself gets nudged to the nearest tooth-pitch detent (see
    // meshing.test.ts's meshPhaseAlignment tests for the centering guarantee itself),
    // so this only checks the distance stayed correct and the nudge was small.
    const dragged = makeGear({ id: "dragged", teeth: 10, module: 1, position: [12, 0, 0] });
    const partner = makeGear({ id: "partner", teeth: 20, module: 1, position: [0, 0, 0] });
    const snap = findSnapTarget(dragged, [12, 0, 0], [dragged, partner]);
    expect(snap?.partnerId).toBe("partner");
    expect(snap?.rotation).not.toBeUndefined();

    const distance = Math.hypot(snap!.position[0], snap!.position[2]);
    expect(distance).toBeCloseTo(15);

    const rawAngle = Math.atan2(0 - 0, 12 - 0); // raw drop point's angle from the partner
    const snappedAngle = Math.atan2(snap!.position[2], snap!.position[0]);
    const pitch = (Math.PI * 2) / partner.teeth;
    expect(Math.abs(snappedAngle - rawAngle)).toBeLessThanOrEqual(pitch / 2 + 1e-9);
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

  it("snaps a coincident-coupling drop anywhere on the host's own visible disc, not just within the fixed 6-unit slack", () => {
    // Regression for "helical has nothing to attach to": a coincident target
    // (e.g. a helical gear coupling onto a crank's shaft) is a single POINT to
    // hit -- unlike a meshing ring, which spans a whole circle, so the fixed
    // 6-unit slack alone made it much easier to miss than a normal gear mesh.
    // A host with teeth=20, module=1 has pitch radius 10 (bigger than the old
    // fixed slack) -- dropping 9 units out (well past the old slack, but still
    // on the host's own disc) should now snap.
    const dragged = makeGear({ id: "helical1", type: "helical", teeth: 20, module: 1, position: [9, 0, 0] });
    const host = makeGear({ id: "crank1", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] });
    const snap = findSnapTarget(dragged, [9, 0, 0], [dragged, host]);
    expect(snap?.partnerId).toBe("crank1");
    expect(snap?.position).toEqual([0, 0, 0]);
  });

  it("still does not snap a coincident-coupling drop well OUTSIDE the host's own visible disc", () => {
    const dragged = makeGear({ id: "helical1", type: "helical", teeth: 20, module: 1, position: [50, 0, 0] });
    const host = makeGear({ id: "crank1", type: "crank", teeth: 20, module: 1, position: [0, 0, 0] });
    expect(findSnapTarget(dragged, [50, 0, 0], [dragged, host])).toBeNull();
  });
});
