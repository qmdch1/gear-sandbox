import { describe, it, expect } from "vitest";
import * as D from "../../../src/sim/presets/differentialaxle";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import { depthBelowGround } from "../../../src/sim/ground";

const preset = () => D.createDifferentialAxlePreset();
const byId = (id: string) => preset().gears.find((g) => g.id === id)!;

describe("createDifferentialAxlePreset", () => {
  it("builds three gears: the pinion crank, the crown wheel, and the differential", () => {
    const layout = preset();
    expect(layout.gears.map((g) => g.id)).toEqual([D.PINION_ID, D.CROWN_ID, D.DIFF_ID]);
    expect(layout.remoteLinks).toEqual([]);
    expect(byId(D.PINION_ID).type).toBe("crank");
    expect(byId(D.CROWN_ID).type).toBe("bevel");
    expect(byId(D.DIFF_ID).type).toBe("differential");
  });

  it("crosses the drive at a genuine RIGHT ANGLE -- the one thing a parallel mesh cannot do", () => {
    const pinion = byId(D.PINION_ID);
    const crown = byId(D.CROWN_ID);
    const dot =
      pinion.axis[0] * crown.axis[0] + pinion.axis[1] * crown.axis[1] + pinion.axis[2] * crown.axis[2];
    expect(dot).toBe(0); // evaluatePair's bevel branch needs |dot| <= 0.1
    expect(pinion.axis).toEqual([0, 0, 1]); // along the car
    expect(crown.axis).toEqual([1, 0, 0]); // across it
  });

  it("places the pinion at exactly the summed pitch radii from the crown wheel", () => {
    const p = byId(D.PINION_ID);
    const c = byId(D.CROWN_ID);
    const d = Math.hypot(p.position[0] - c.position[0], p.position[1] - c.position[1], p.position[2] - c.position[2]);
    expect(d).toBeCloseTo(D.FINAL_DRIVE_DISTANCE, 9);
  });

  it("forms the right-angle mesh and the differential coupling via the real evaluatePair", () => {
    const pinion = byId(D.PINION_ID);
    const crown = byId(D.CROWN_ID);
    const diff = byId(D.DIFF_ID);

    const mesh = evaluatePair(pinion, crown);
    expect(mesh).not.toBeNull();
    expect(mesh!.kind).toBe("mesh");
    expect(mesh!.ratio).toBeCloseTo(D.FINAL_DRIVE_RATIO, 12); // 12/36

    // `differential` is COINCIDENT_ONLY, so sharing the crown's position and axis resolves it as
    // a 1:1 coupling -- how a real carrier is bolted to the crown wheel.
    expect(diff.position).toEqual(crown.position);
    expect(diff.axis).toEqual(crown.axis);
    const coupling = evaluatePair(crown, diff);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);
  });

  it("keeps every meshing wheel on ONE module", () => {
    // evaluatePair never compares module, so a mismatch would give a happy edge and teeth that
    // could not engage on any real shaft.
    const layout = preset();
    const map = new Map(layout.gears.map((g) => [g.id, g]));
    const meshes = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "mesh");
    expect(meshes.length).toBeGreaterThan(0);
    for (const e of meshes) {
      expect(map.get(e.a)!.module).toBe(D.AXLE_MODULE);
      expect(map.get(e.b)!.module).toBe(D.AXLE_MODULE);
    }
  });

  it("reports zero diagnostics problems", () => {
    const layout = preset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("does NOT add a load to the differential -- the pair would form no edge at all", () => {
    // evaluatePair returns null whenever BOTH sides are `load` or `differential`, so a load
    // bolted on to represent the road would sit there unconnected. Guarding the shape of the
    // layout keeps a well-meaning future edit from reintroducing it.
    expect(preset().gears.some((g) => g.type === "load")).toBe(false);
  });

  it("turns the axle at exactly 1/3 the propshaft, reversed, across hundreds of ticks", () => {
    let layout = preset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const pinion = layout.gears.find((g) => g.id === D.PINION_ID)!;
      const crown = layout.gears.find((g) => g.id === D.CROWN_ID)!;
      const diff = layout.gears.find((g) => g.id === D.DIFF_ID)!;
      expect(pinion.angularVelocity).toBe(D.PROPSHAFT_SPEED);
      expect(crown.angularVelocity).toBeCloseTo(-D.FINAL_DRIVE_RATIO * D.PROPSHAFT_SPEED, 12); // -1
      expect(diff.angularVelocity).toBe(crown.angularVelocity); // carrier turns with the crown
    }
    expect(Math.abs(layout.gears.find((g) => g.id === D.DIFF_ID)!.rotation)).toBeGreaterThan(0);
  });
});

describe("createDifferentialAxleProps", () => {
  it("stands the axle on the ground, clearing the TYRE's outer surface", () => {
    // A torus reaches radius + tube from its centre. Measuring to the centre line instead left
    // the tread 2.2 units into the road.
    expect(depthBelowGround(preset().gears, D.createDifferentialAxleProps())).toBeCloseTo(0, 6);
  });

  it("spokes both wheels off the differential, so the axle visibly turns", () => {
    // A bare tyre torus is rotationally symmetric about its own axis and shows no motion at all.
    const props = D.createDifferentialAxleProps();
    const spokes = props.filter((p) => p.attachTo === D.DIFF_ID);
    expect(spokes.length).toBeGreaterThanOrEqual(16); // both wheels
    // The crown wheel's own bolts turn with it too.
    expect(props.filter((p) => p.attachTo === D.CROWN_ID).length).toBeGreaterThanOrEqual(8);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const ids = new Set(preset().gears.map((g) => g.id));
    for (const p of D.createDifferentialAxleProps()) {
      for (const t of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (t) expect(ids.has(t), String(t)).toBe(true);
      }
    }
  });

  it("gives the casing and ironwork their real finishes", () => {
    const used = new Set(D.createDifferentialAxleProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["metal", "rust"]) expect(used.has(kind as never)).toBe(true);
  });
});
