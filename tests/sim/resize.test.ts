import { describe, it, expect } from "vitest";
import { resizeConnectedMeshGroup } from "../../src/sim/resize";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("resizeConnectedMeshGroup", () => {
  it("sets the resized gear's own module directly", () => {
    const a = makeGear({ id: "a", module: 1 });
    resizeConnectedMeshGroup("a", 2, [a]);
    expect(a.module).toBe(2);
  });

  it("propagates the new module to a directly tooth-meshed partner", () => {
    // teeth 20/20, module 1 -> ideal distance 20.
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 20, module: 1, position: [20, 0, 0] });
    resizeConnectedMeshGroup("a", 2, [a, b]);
    expect(b.module).toBe(2);
  });

  it("repositions the meshed partner to the new correct center distance", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 20, module: 1, position: [20, 0, 0] }); // ideal dist 20 at module 1
    resizeConnectedMeshGroup("a", 2, [a, b]); // ideal dist becomes 40 at module 2
    const distance = Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]);
    expect(distance).toBeCloseTo(40);
  });

  it("preserves the ANGLE from the anchor to its partner, only changing the distance", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    // Placed at a non-axis-aligned angle on purpose, still at the ideal distance (20).
    const angle = Math.PI / 3;
    const b = makeGear({
      id: "b", teeth: 20, module: 1,
      position: [20 * Math.cos(angle), 0, 20 * Math.sin(angle)],
    });
    resizeConnectedMeshGroup("a", 2, [a, b]);
    const newAngle = Math.atan2(b.position[2] - a.position[2], b.position[0] - a.position[0]);
    expect(newAngle).toBeCloseTo(angle, 5);
  });

  it("propagates transitively through a whole chain of meshed gears, not just the direct neighbor", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const b = makeGear({ id: "b", teeth: 20, module: 1, position: [20, 0, 0] });
    const c = makeGear({ id: "c", teeth: 20, module: 1, position: [40, 0, 0] }); // meshed with b, dist 20
    resizeConnectedMeshGroup("a", 2, [a, b, c]);
    expect(b.module).toBe(2);
    expect(c.module).toBe(2);
    const distBC = Math.hypot(c.position[0] - b.position[0], c.position[2] - b.position[2]);
    expect(distBC).toBeCloseTo(40);
  });

  it("does NOT resize or move a part only coincident-coupled to the resized gear (e.g. a load)", () => {
    // A load rides on a gear's shaft (coincident coupling, not a tooth mesh) --
    // it has no teeth to mismatch, so it should be left alone entirely.
    const gear = makeGear({ id: "gear", teeth: 20, module: 1, position: [0, 0, 0] });
    const load = makeGear({ id: "load", type: "load", teeth: 0, module: 1, position: [0, 0, 0] });
    resizeConnectedMeshGroup("gear", 3, [gear, load]);
    expect(load.module).toBe(1); // untouched
    expect(load.position).toEqual([0, 0, 0]); // untouched
  });

  it("does not resize a gear that isn't actually connected at all", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 0, 0] });
    const farAway = makeGear({ id: "far", teeth: 20, module: 1, position: [900, 0, 0] });
    resizeConnectedMeshGroup("a", 2, [a, farAway]);
    expect(farAway.module).toBe(1);
  });

  it("does nothing when the anchor id doesn't match any gear", () => {
    const a = makeGear({ id: "a", module: 1 });
    expect(() => resizeConnectedMeshGroup("missing", 2, [a])).not.toThrow();
    expect(a.module).toBe(1);
  });

  it("preserves the height (Y) of a repositioned partner", () => {
    const a = makeGear({ id: "a", teeth: 20, module: 1, position: [0, 5, 0] });
    const b = makeGear({ id: "b", teeth: 20, module: 1, position: [20, 5, 0] });
    resizeConnectedMeshGroup("a", 2, [a, b]);
    expect(b.position[1]).toBe(5);
  });
});
