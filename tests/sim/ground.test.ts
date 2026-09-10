import { describe, it, expect } from "vitest";
import { PRESETS } from "../../src/sim/presets";
import { createShowroomLayout, createShowroomProps } from "../../src/sim/showroom";
import { seatOnGround, depthBelowGround, propLowestY, gearLowestY } from "../../src/sim/ground";
import { buildEdges, classify } from "../../src/sim/graph";
import type { GearInstance } from "../../src/sim/types";
import type { Prop } from "../../src/render/props";

function gear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("gearLowestY", () => {
  it("hangs an UPRIGHT wheel a full radius below its centre", () => {
    // axis +X: the disc stands up and rolls, so its rim really does reach a radius down.
    expect(gearLowestY(gear({ axis: [1, 0, 0], teeth: 20, module: 1, position: [0, 10, 0] }))).toBeCloseTo(0, 6);
  });

  it("hangs a FLAT wheel barely below its centre", () => {
    // axis +Y: the disc lies like a turntable, so its radius goes sideways, not down. Treating
    // every gear as a sphere of its radius would report every clock and carousel as buried.
    const y = gearLowestY(gear({ axis: [0, 1, 0], teeth: 120, module: 1, position: [0, 0, 0] }));
    expect(y).toBeGreaterThan(-2); // just the body's own thickness
  });
});

describe("propLowestY", () => {
  it("accounts for rotation -- a torus laid flat does not hang by its radius", () => {
    const upright = propLowestY({ kind: "ring", position: [0, 0, 0], radius: 10, tube: 1, color: 0 });
    const flat = propLowestY({
      kind: "ring", position: [0, 0, 0], radius: 10, tube: 1, color: 0,
      rotation: [Math.PI / 2, 0, 0],
    });
    expect(upright).toBeCloseTo(-11, 6); // standing in its default XY plane
    expect(flat).toBeCloseTo(-1, 6); // laid into XZ: only the tube's thickness hangs below
  });

  it("measures a box from its centre by half its height", () => {
    expect(propLowestY({ kind: "box", position: [0, 6, 0], size: [4, 34, 4], color: 0 })).toBeCloseTo(-11, 6);
  });
});

describe("seatOnGround", () => {
  it("lifts a buried machine until nothing is underground, and no further", () => {
    const layout = { gears: [gear({ position: [0, 0, 0], axis: [1, 0, 0] })], remoteLinks: [] };
    const props: Prop[] = [{ kind: "box", position: [0, 6, 0], size: [4, 34, 4], color: 0 }];
    expect(depthBelowGround(layout.gears, props)).toBeCloseTo(11, 6);

    const seated = seatOnGround(layout, props);
    expect(depthBelowGround(seated.layout.gears, seated.props)).toBeCloseTo(0, 6);
    // Lifted by exactly the depth -- not centred, not scaled.
    expect(seated.props[0].position[1]).toBeCloseTo(17, 6);
  });

  it("is idempotent and leaves a machine already on the ground untouched", () => {
    const layout = { gears: [gear({ position: [0, 20, 0] })], remoteLinks: [] };
    const props: Prop[] = [{ kind: "box", position: [0, 5, 0], size: [2, 10, 2], color: 0 }];
    const once = seatOnGround(layout, props);
    expect(once.props).toBe(props); // untouched, returned by reference
    expect(seatOnGround(once.layout, once.props).props).toBe(once.props);
  });

  it("preserves every gear-to-gear distance, so meshing is unaffected", () => {
    // This is what makes a uniform lift safe: edges depend only on distances.
    const a = gear({ id: "a", type: "crank", teeth: 20, module: 1, position: [0, 0, 0], axis: [1, 0, 0] });
    const b = gear({ id: "b", teeth: 10, module: 1, position: [15, 0, 0], axis: [1, 0, 0] });
    const before = classify([a, b], buildEdges([a, b], []));
    const seated = seatOnGround({ gears: [a, b], remoteLinks: [] }, []);
    const after = classify(seated.layout.gears, buildEdges(seated.layout.gears, []));
    expect(after).toEqual(before);
  });
});

describe("every preset stands on the ground once seated", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s", (_id, preset) => {
    // The ground plane is opaque: anything below y = 0 silently disappears into it.
    const seated = seatOnGround(preset.build(), preset.buildProps ? preset.buildProps() : []);
    expect(depthBelowGround(seated.layout.gears, seated.props)).toBeCloseTo(0, 6);
  });
});

describe("the showroom yard stands on the ground", () => {
  it("puts no machine below the floor", () => {
    expect(depthBelowGround(createShowroomLayout().gears, createShowroomProps())).toBeCloseTo(0, 6);
  });

  it("still reports zero diagnostics problems after every machine is seated", () => {
    const layout = createShowroomLayout();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });
});
