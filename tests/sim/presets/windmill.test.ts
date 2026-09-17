import { describe, it, expect } from "vitest";
import { createWindmillPreset, createWindmillProps } from "../../../src/sim/presets/windmill";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import { depthBelowGround } from "../../../src/sim/ground";

describe("createWindmillPreset", () => {
  it("meshes the sail hub and the vertical mill shaft as a right-angle bevel pair (perpendicular axes)", () => {
    const layout = createWindmillPreset();
    expect(layout.gears).toHaveLength(2);
    const hub = layout.gears.find((g) => g.id === "풍차_날개축")!;
    const shaft = layout.gears.find((g) => g.id === "풍차_수직축")!;
    // Perpendicular axes: hub about Z (sails face viewer), shaft about Y (vertical mill shaft).
    expect(hub.axis).toEqual([0, 0, 1]);
    expect(shaft.axis).toEqual([0, 1, 0]);
    // (No hand-rolled dot product here. This test used to compute one from `hub.axis` and
    // `shaft.axis` two lines after pinning both to literals, so it was forced to
    // 0*0 + 0*1 + 1*0 = 0 by arithmetic -- shape 3 in AGENTS.md, re-measuring the test's own
    // working. Proof it covered nothing: turning the shaft horizontal, axis [1,0,0], failed
    // only the literal on the line above; the dot stayed exactly 0 and every other assertion
    // here stayed green. `evaluatePair` below is the real perpendicularity check, since it
    // applies the mesh rule's own PERP_DOT_THRESHOLD.)
    const edge = evaluatePair(hub, shaft);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
  });

  it("reports zero diagnostics problems", () => {
    const layout = createWindmillPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("drives the vertical shaft from the wind-driven sail hub across many ticks (shaft actually turns)", () => {
    let layout = createWindmillPreset();
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    const shaft = layout.gears.find((g) => g.id === "풍차_수직축")!;
    expect(Math.abs(shaft.angularVelocity)).toBeGreaterThan(0);
    expect(Math.abs(shaft.rotation)).toBeGreaterThan(0);
  });

  it("hangs every sail on the hub gear, so the sails actually turn", () => {
    // Counting props and checking the kind set -- which is all this test used to do -- misses
    // the one thing that makes this a windmill rather than two gears beside a chimney: the
    // sails carry `attachTo: "풍차_날개축"`. Deleting that line from both sail props left all
    // four tests in this file green while the blades hung frozen in front of a spinning hub.
    const layout = createWindmillPreset();
    const gearIds = new Set(layout.gears.map((g) => g.id));
    const props = createWindmillProps();

    const sails = props.filter((p) => p.kind === "box");
    expect(sails.length).toBeGreaterThanOrEqual(8); // four blades: a spar and a canvas each
    for (const sail of sails) {
      expect(sail.attachTo).toBe("풍차_날개축");
      expect(gearIds.has(sail.attachTo!)).toBe(true); // and it names a gear that exists
    }

    // The body itself is static masonry, so nothing there should be riding a gear.
    const body = props.filter((p) => p.kind === "cylinder");
    expect(body).toHaveLength(2); // tower + cap
    for (const part of body) expect(part.attachTo).toBeUndefined();
  });

  it("stands the tower on the ground, under its cap, with the sails clear of the stone", () => {
    // Every figure here was wrong before, and two of them visibly so. `position` is a prop's
    // CENTRE: the tower was centred at 10 with height 32, i.e. y = -6..26, so six units of it
    // sat below the ground plane and its top pushed two units up inside a cap that starts at
    // 24. And the sails, at SAILS_Z + 1.5 = 5.5 with 0.6-deep spars, ran from z 5.2 to 5.8 --
    // inside a tower whose wall is at radius 7 -- while the constant's comment said they
    // cleared it.
    const props = createWindmillProps();
    const span = (p: { position: readonly number[]; height: number }) =>
      [p.position[1] - p.height / 2, p.position[1] + p.height / 2] as const;

    const [tower, cap] = props.filter((p) => p.kind === "cylinder") as Array<
      Extract<(typeof props)[number], { kind: "cylinder" }>
    >;
    expect(span(tower)[0]).toBe(0); // on the ground, not sunk into it
    expect(span(tower)[1]).toBe(span(cap)[0]); // and up to EXACTLY the cap's underside
    expect(span(cap)[1]).toBeGreaterThan(span(cap)[0]);

    // Nothing needs lifting, because it was authored sitting on the floor.
    expect(depthBelowGround(createWindmillPreset().gears, props)).toBe(0);

    // The sails stand clear of the masonry: the nearest face of any blade is outside the
    // tower's radius, with daylight to spare.
    const TOWER_R = tower.radius;
    const nearestFace = Math.min(
      ...props.filter((p) => p.kind === "box").map((p) => p.position[2] - p.size[2] / 2),
    );
    expect(nearestFace).toBeGreaterThan(TOWER_R);
  });
});
