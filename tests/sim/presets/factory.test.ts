import { describe, it, expect } from "vitest";
import {
  createFactoryPreset,
  createFactoryProps,
  SHAFT_Y,
  STATION_Y,
  ENGINE_X,
  ENGINE_Y,
  STATION_X,
  PISTON_CRANK_RADIUS,
  PISTON_ROD_LENGTH,
} from "../../../src/sim/presets/factory";
import { evaluatePair, isOverlapping, pitchRadius } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { GearInstance, LayoutState } from "../../../src/sim/types";

const ID = {
  crank: "공장_증기기관_크랭크",
  enginePulley: "공장_기관풀리",
  shaftA: "공장_라인축_A",
  shaftB: "공장_라인축_B",
  shaftC: "공장_라인축_C",
  s1Pulley: "공장_1작업_풀리",
  s1Drive: "공장_1작업_구동기어",
  s1Wheel: "공장_1작업_숫돌기어",
  s2Pulley: "공장_2작업_풀리",
  s2Sprocket: "공장_2작업_스프로킷",
  s2Feed: "공장_2작업_이송스프로킷",
  s3Pulley: "공장_3작업_풀리",
  s3Drive: "공장_3작업_구동기어",
  s3Spindle: "공장_3작업_주축기어",
} as const;

const ORDERED_IDS = [
  ID.crank, ID.enginePulley,
  ID.shaftA, ID.shaftB, ID.shaftC,
  ID.s1Pulley, ID.s1Drive, ID.s1Wheel,
  ID.s2Pulley, ID.s2Sprocket, ID.s2Feed,
  ID.s3Pulley, ID.s3Drive, ID.s3Spindle,
];

/** Every member's steady-state angular velocity in rad/s, derived in factory.ts's header and
 *  verified below against the real `tick()`. All of these are exactly representable as
 *  doubles, which is why they can be asserted with `toBe` rather than a tolerance. */
const EXPECTED_SPEED: Record<string, number> = {
  [ID.crank]: 1.0,
  [ID.enginePulley]: 1.0,
  [ID.shaftA]: 2.0,
  [ID.shaftB]: 2.0,
  [ID.shaftC]: 2.0,
  [ID.s1Pulley]: 3.0,
  [ID.s1Drive]: 3.0,
  [ID.s1Wheel]: -6.0,
  [ID.s2Pulley]: 1.5,
  [ID.s2Sprocket]: 1.5,
  [ID.s2Feed]: 0.75,
  [ID.s3Pulley]: 3.0,
  [ID.s3Drive]: 3.0,
  [ID.s3Spindle]: -1.5,
};

function get(layout: LayoutState, id: string): GearInstance {
  const gear = layout.gears.find((g) => g.id === id);
  if (!gear) throw new Error(`no such gear: ${id}`);
  return gear;
}

function distance(a: GearInstance, b: GearInstance): number {
  return Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
}

describe("createFactoryPreset", () => {
  it("builds 14 gears with unique 공장_-prefixed ids and 7 remote links", () => {
    const layout = createFactoryPreset();
    expect(layout.gears).toHaveLength(14);
    const ids = layout.gears.map((g) => g.id);
    expect(ids).toEqual(ORDERED_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("공장_")).toBe(true);

    expect(layout.remoteLinks).toEqual([
      { a: ID.enginePulley, b: ID.shaftA, kind: "belt" },
      { a: ID.shaftA, b: ID.shaftB, kind: "belt" },
      { a: ID.shaftB, b: ID.shaftC, kind: "belt" },
      { a: ID.shaftA, b: ID.s1Pulley, kind: "belt" },
      { a: ID.shaftB, b: ID.s2Pulley, kind: "belt" },
      { a: ID.shaftC, b: ID.s3Pulley, kind: "belt" },
      { a: ID.s2Sprocket, b: ID.s2Feed, kind: "chain" },
    ]);
  });

  it("places every gear at its exact designed type/position/axis/teeth/module", () => {
    const layout = createFactoryPreset();
    const table: Array<[string, GearInstance["type"], [number, number, number], [number, number, number], number, number]> = [
      [ID.crank,        "crank",    [ENGINE_X, ENGINE_Y, 0],      [0, 0, 1], 28, 1],
      [ID.enginePulley, "pulley",   [ENGINE_X, ENGINE_Y, 0],      [0, 0, 1], 24, 1],
      [ID.shaftA,       "pulley",   [STATION_X[0], SHAFT_Y, 0],   [1, 0, 0], 12, 1],
      [ID.shaftB,       "pulley",   [STATION_X[1], SHAFT_Y, 0],   [1, 0, 0], 12, 1],
      [ID.shaftC,       "pulley",   [STATION_X[2], SHAFT_Y, 0],   [1, 0, 0], 12, 1],
      [ID.s1Pulley,     "pulley",   [STATION_X[0], STATION_Y, 0], [1, 0, 0], 8, 1],
      [ID.s1Drive,      "spur",     [STATION_X[0], STATION_Y, 0], [1, 0, 0], 16, 1],
      [ID.s1Wheel,      "spur",     [STATION_X[0], STATION_Y, 12], [1, 0, 0], 8, 1],
      [ID.s2Pulley,     "pulley",   [STATION_X[1], STATION_Y, 0], [1, 0, 0], 16, 1],
      [ID.s2Sprocket,   "sprocket", [STATION_X[1], STATION_Y, 0], [1, 0, 0], 12, 0.6],
      [ID.s2Feed,       "sprocket", [STATION_X[1], STATION_Y, -18], [1, 0, 0], 24, 0.6],
      [ID.s3Pulley,     "pulley",   [STATION_X[2], STATION_Y, 0], [1, 0, 0], 8, 1],
      [ID.s3Drive,      "spur",     [STATION_X[2], STATION_Y, 0], [1, 0, 0], 12, 1],
      [ID.s3Spindle,    "spur",     [STATION_X[2], STATION_Y, -18], [1, 0, 0], 24, 1],
    ];
    expect(table).toHaveLength(layout.gears.length);
    for (const [id, type, position, axis, teeth, module] of table) {
      const gear = get(layout, id);
      expect(gear.type).toBe(type);
      expect(gear.position).toEqual(position);
      expect(gear.axis).toEqual(axis);
      expect(gear.teeth).toBe(teeth);
      expect(gear.module).toBe(module);
      expect(gear.broken).toBe(false);
      expect(gear.rotation).toBe(0);
    }

    // Exactly one power source, commanded at 1.0 rad/s -- the whole "one engine drives
    // everything" premise depends on there being no second crank hiding anywhere.
    const cranks = layout.gears.filter((g) => g.type === "crank");
    expect(cranks.map((g) => g.id)).toEqual([ID.crank]);
    expect(cranks[0].angularVelocity).toBe(1.0);
    // No reciprocating crank and no travel-limited rack: nothing in this layout has bounded
    // travel (the piston is a prop-level crank-slider, bounded by its own geometry).
    expect(cranks[0].reverseAt).toBeUndefined();
    expect(layout.gears.some((g) => g.type === "rack")).toBe(false);
  });

  it("derives every pitch radius and centre distance arithmetically", () => {
    const layout = createFactoryPreset();
    // pitchRadius = module * teeth / 2, straight from meshing.ts.
    expect(pitchRadius(get(layout, ID.crank))).toBe(14);
    expect(pitchRadius(get(layout, ID.enginePulley))).toBe(12);
    for (const id of [ID.shaftA, ID.shaftB, ID.shaftC]) expect(pitchRadius(get(layout, id))).toBe(6);
    expect(pitchRadius(get(layout, ID.s1Pulley))).toBe(4);
    expect(pitchRadius(get(layout, ID.s1Drive))).toBe(8);
    expect(pitchRadius(get(layout, ID.s1Wheel))).toBe(4);
    expect(pitchRadius(get(layout, ID.s2Pulley))).toBe(8);
    expect(pitchRadius(get(layout, ID.s2Sprocket))).toBeCloseTo(3.6, 10);
    expect(pitchRadius(get(layout, ID.s2Feed))).toBeCloseTo(7.2, 10);
    expect(pitchRadius(get(layout, ID.s3Pulley))).toBe(4);
    expect(pitchRadius(get(layout, ID.s3Drive))).toBe(6);
    expect(pitchRadius(get(layout, ID.s3Spindle))).toBe(12);

    // Tooth meshes sit at EXACTLY the sum of the two pitch radii.
    expect(distance(get(layout, ID.s1Drive), get(layout, ID.s1Wheel))).toBe(8 + 4);
    expect(distance(get(layout, ID.s3Drive), get(layout, ID.s3Spindle))).toBe(6 + 12);
    // Shaft-coupled pairs are exactly coincident.
    expect(distance(get(layout, ID.crank), get(layout, ID.enginePulley))).toBe(0);
    expect(distance(get(layout, ID.s1Pulley), get(layout, ID.s1Drive))).toBe(0);
    expect(distance(get(layout, ID.s2Pulley), get(layout, ID.s2Sprocket))).toBe(0);
    expect(distance(get(layout, ID.s3Pulley), get(layout, ID.s3Drive))).toBe(0);
    // The three line-shaft pulleys are evenly spaced 24 apart on one line at SHAFT_Y.
    expect(distance(get(layout, ID.shaftA), get(layout, ID.shaftB))).toBe(24);
    expect(distance(get(layout, ID.shaftB), get(layout, ID.shaftC))).toBe(24);
    // Each drop belt hangs the shaft exactly 16 above its station spindle.
    expect(SHAFT_Y - STATION_Y).toBe(16);
  });

  it("forms real coincident couplings for all four shaft-mounted wheels, via the real evaluatePair", () => {
    const layout = createFactoryPreset();
    const couplings: Array<[string, string]> = [
      [ID.crank, ID.enginePulley],
      [ID.s1Pulley, ID.s1Drive],
      [ID.s2Pulley, ID.s2Sprocket],
      [ID.s3Pulley, ID.s3Drive],
    ];
    for (const [aId, bId] of couplings) {
      const edge = evaluatePair(get(layout, aId), get(layout, bId));
      expect(edge).not.toBeNull();
      expect(edge!.kind).toBe("coupling");
      expect(edge!.ratio).toBe(1);
      expect(edge!.oneWay).toBe("none");
      // A deliberately coincident coupling is never an overlap.
      expect(isOverlapping(get(layout, aId), get(layout, bId))).toBe(false);
    }
  });

  it("forms real tooth meshes at both stations, with the exact tooth ratios claimed", () => {
    const layout = createFactoryPreset();

    const grinder = evaluatePair(get(layout, ID.s1Drive), get(layout, ID.s1Wheel));
    expect(grinder).not.toBeNull();
    expect(grinder!.kind).toBe("mesh");
    expect(grinder!.ratio).toBe(16 / 8); // 2
    expect(grinder!.oneWay).toBe("none");

    const lathe = evaluatePair(get(layout, ID.s3Drive), get(layout, ID.s3Spindle));
    expect(lathe).not.toBeNull();
    expect(lathe!.kind).toBe("mesh");
    expect(lathe!.ratio).toBe(12 / 24); // 0.5
    expect(lathe!.oneWay).toBe("none");
  });

  it("only meshes at the true pitch distance -- displacing a driven gear breaks the mesh", () => {
    // Proves the placements above are real geometry, not decoration: `evaluatePair` accepts
    // a 5% window around pitchRadius(a)+pitchRadius(b) = 18, so 18 -> 21 must fall out of it.
    const layout = createFactoryPreset();
    const drive = get(layout, ID.s3Drive);
    const spindle = get(layout, ID.s3Spindle);
    const moved: GearInstance = { ...spindle, position: [spindle.position[0], spindle.position[1], -21] };
    expect(evaluatePair(drive, moved)).toBeNull();
    // ...and so must rotating it off the shared axis, even at the right distance.
    const tilted: GearInstance = { ...spindle, axis: [0, 1, 0] };
    expect(evaluatePair(drive, tilted)).toBeNull();
  });

  it("creates no accidental edges between things that must stay independent", () => {
    const layout = createFactoryPreset();
    // The three line-shaft pulleys are 24 apart: a `pulley` is COINCIDENT_ONLY, so it forms
    // NO direct edge at a distance. Their 1:1 relation comes purely from the belt links.
    expect(evaluatePair(get(layout, ID.shaftA), get(layout, ID.shaftB))).toBeNull();
    expect(evaluatePair(get(layout, ID.shaftB), get(layout, ID.shaftC))).toBeNull();
    expect(evaluatePair(get(layout, ID.shaftA), get(layout, ID.shaftC))).toBeNull();
    // A shaft pulley and the station pulley 16 below it: again belt-only.
    expect(evaluatePair(get(layout, ID.shaftA), get(layout, ID.s1Pulley))).toBeNull();
    expect(evaluatePair(get(layout, ID.shaftB), get(layout, ID.s2Pulley))).toBeNull();
    expect(evaluatePair(get(layout, ID.shaftC), get(layout, ID.s3Pulley))).toBeNull();
    // The engine crank turns about +Z while every station gear turns about +X; both are in
    // evaluatePair's parallel family, so it is the perpendicular axes that rule a mesh out.
    expect(evaluatePair(get(layout, ID.crank), get(layout, ID.s1Drive))).toBeNull();
    expect(evaluatePair(get(layout, ID.crank), get(layout, ID.s3Spindle))).toBeNull();
    // The two chain sprockets are 18 apart: no direct edge, the chain link carries them.
    expect(evaluatePair(get(layout, ID.s2Sprocket), get(layout, ID.s2Feed))).toBeNull();
    // Neighbouring stations never reach each other.
    expect(evaluatePair(get(layout, ID.s1Drive), get(layout, ID.s3Drive))).toBeNull();
    expect(evaluatePair(get(layout, ID.s1Wheel), get(layout, ID.s3Spindle))).toBeNull();
  });

  it("builds exactly the intended edge set, with the belt/chain ratios computed by graph.ts", () => {
    const layout = createFactoryPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);

    const byKind = (kind: string) => edges.filter((e) => e.kind === kind);
    expect(byKind("coupling")).toHaveLength(4);
    expect(byKind("mesh")).toHaveLength(2);
    expect(byKind("belt")).toHaveLength(6);
    expect(byKind("chain")).toHaveLength(1);
    expect(edges).toHaveLength(13);

    const ratioOf = (a: string, b: string) => {
      const edge = edges.find((e) => e.a === a && e.b === b);
      if (!edge) throw new Error(`no edge ${a} -> ${b}`);
      return edge.ratio;
    };
    // A belt's ratio is pitchRadius(a)/pitchRadius(b) (NOT teeth) -- graph.ts, buildEdges.
    expect(ratioOf(ID.enginePulley, ID.shaftA)).toBe(12 / 6); // 2
    expect(ratioOf(ID.shaftA, ID.shaftB)).toBe(1); // the shaft behaves as one rigid bar
    expect(ratioOf(ID.shaftB, ID.shaftC)).toBe(1);
    expect(ratioOf(ID.shaftA, ID.s1Pulley)).toBe(6 / 4); // 1.5
    expect(ratioOf(ID.shaftB, ID.s2Pulley)).toBe(6 / 8); // 0.75
    expect(ratioOf(ID.shaftC, ID.s3Pulley)).toBe(6 / 4); // 1.5
    // A chain's ratio IS teeth-based.
    expect(ratioOf(ID.s2Sprocket, ID.s2Feed)).toBe(12 / 24); // 0.5
  });

  it("reports zero diagnostics problems -- everything connected, everything powered, nothing overlapping", () => {
    const layout = createFactoryPreset();
    const diagnostics = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("traces all 14 gears back to the single engine crank -- removing it leaves nothing powered", () => {
    const layout = createFactoryPreset();
    // Swap the crank for an ordinary pulley (same position/axis/size): with no crank left,
    // classify's directed reachability walk from any crank finds nothing, so EVERY gear that
    // still has an edge must be reported as unpowered. That is only true if all of them were
    // drawing their power from that one crank in the first place.
    const crankless = layout.gears.map((g) => (g.id === ID.crank ? { ...g, type: "pulley" as const } : g));
    const diagnostics = classify(crankless, buildEdges(crankless, layout.remoteLinks));
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(new Set(diagnostics.noPowerIds)).toEqual(new Set(ORDERED_IDS));
  });

  it("drives every member at its exact designed speed for 600 ticks of the real simulation", () => {
    let layout = createFactoryPreset();

    // Settle the tooth-lattice phase first. `tick(.., 0, ..)` applies each mesh's one-time
    // phase offset without advancing time (the same seam tests/sim/simulation.test.ts uses);
    // once settled the offset is exactly 0 on every later tick, so what follows measures pure
    // speed x time. Without this the meshed gears carry an extra one-off offset (here PI/8 on
    // the station wheels) that has nothing to do with their speed.
    layout = { gears: tick(layout, 0, 1).gears, remoteLinks: layout.remoteLinks };
    const start: Record<string, number> = {};
    for (const gear of layout.gears) start[gear.id] = gear.rotation;

    for (let i = 0; i < 600; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
      for (const gear of layout.gears) {
        expect(gear.angularVelocity).toBe(EXPECTED_SPEED[gear.id]);
        expect(gear.broken).toBe(false);
      }
    }

    // 600 ticks at 1/60 s == 10 simulated seconds, so every gear advanced speed x 10 from
    // where the settled phase left it.
    for (const gear of layout.gears) {
      expect(gear.rotation - start[gear.id]).toBeCloseTo(EXPECTED_SPEED[gear.id] * 10, 6);
      expect(Math.abs(gear.rotation)).toBeGreaterThan(0);
    }
  });

  it("holds the whole line shaft to one speed and one direction, exactly as a rigid shaft would", () => {
    let layout = createFactoryPreset();
    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
      const a = get(layout, ID.shaftA);
      const b = get(layout, ID.shaftB);
      const c = get(layout, ID.shaftC);
      expect(b.angularVelocity).toBe(a.angularVelocity);
      expect(c.angularVelocity).toBe(a.angularVelocity);
      expect(b.rotation).toBe(a.rotation);
      expect(c.rotation).toBe(a.rotation);
      // ...and it runs at exactly twice the engine, the 12 -> 6 belt step-up.
      expect(a.angularVelocity).toBe(get(layout, ID.crank).angularVelocity * 2);
    }
  });

  it("hands the three stations three DIFFERENT speeds from that one shaft -- the interlocking claim", () => {
    let layout = createFactoryPreset();
    for (let i = 0; i < 300; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
    }
    const shaft = get(layout, ID.shaftA).angularVelocity; // 2.0
    const grinder = get(layout, ID.s1Wheel).angularVelocity;
    const conveyor = get(layout, ID.s2Feed).angularVelocity;
    const spindle = get(layout, ID.s3Spindle).angularVelocity;

    // Grinder: belt step-up 1.5 then a 2:1 tooth mesh, which also reverses it.
    expect(grinder).toBe(shaft * 1.5 * -2); // -6
    // Conveyor: belt step-down 0.75 then a 2:1 chain step-down; a chain never reverses.
    expect(conveyor).toBe(shaft * 0.75 * 0.5); // 0.75
    // Lathe spindle: belt step-up 1.5 then a 2:1 tooth reduction, reversed.
    expect(spindle).toBe(shaft * 1.5 * -0.5); // -1.5

    // All three genuinely differ from each other and from the shaft.
    const speeds = [shaft, grinder, conveyor, spindle];
    expect(new Set(speeds).size).toBe(speeds.length);
    // The fastest driven member runs 8x the slowest, off one crank.
    expect(Math.abs(grinder) / Math.abs(conveyor)).toBe(8);
    // The two tooth-driven members run BACKWARDS relative to the shaft; the chain-driven one
    // does not (mesh edges flip the sign, belt/chain/coupling edges never do).
    expect(Math.sign(grinder)).toBe(-Math.sign(shaft));
    expect(Math.sign(spindle)).toBe(-Math.sign(shaft));
    expect(Math.sign(conveyor)).toBe(Math.sign(shaft));
  });
});

describe("createFactoryProps", () => {
  const layout = createFactoryPreset();
  const gearIds = new Set(layout.gears.map((g) => g.id));

  it("names only real gear ids in every attachTo / linkTo (and uses no rack/rope mechanics)", () => {
    const props = createFactoryProps();
    expect(props.length).toBeGreaterThan(60);
    for (const prop of props) {
      if (prop.attachTo) expect(gearIds.has(prop.attachTo)).toBe(true);
      if (prop.linkTo) expect(gearIds.has(prop.linkTo.gear)).toBe(true);
      // This machine has no rack and no winch drum, so nothing should claim either.
      expect(prop.slideWith).toBeUndefined();
      expect(prop.windWith).toBeUndefined();
    }
  });

  it("gives every prop a real material texture", () => {
    for (const prop of createFactoryProps()) {
      expect(prop.texture).toBeDefined();
      expect(["wood", "stone", "brick", "metal", "fabric", "tile", "rust"]).toContain(prop.texture);
      expect(prop.metalness).toBeGreaterThanOrEqual(0);
      expect(prop.roughness).toBeGreaterThan(0);
    }
    // The building really is timber + masonry + metalwork, not one material everywhere.
    const kinds = new Set(createFactoryProps().map((p) => p.texture));
    for (const required of ["wood", "brick", "stone", "metal", "rust", "fabric"]) {
      expect(kinds.has(required as never)).toBe(true);
    }
  });

  it("attaches moving parts to every rotating member the eye needs to see turn", () => {
    const props = createFactoryProps();
    const attachedTo = (id: string) => props.filter((p) => p.attachTo === id);
    // The line shaft's bar plus keyed collars on all three shaft pulleys.
    expect(attachedTo("공장_라인축_B").length).toBeGreaterThanOrEqual(2);
    expect(attachedTo("공장_라인축_A").length).toBeGreaterThanOrEqual(4);
    expect(attachedTo("공장_라인축_C").length).toBeGreaterThanOrEqual(4);
    // Each station: the belt pulley, and the machine the belt actually drives.
    for (const id of [ID.s1Pulley, ID.s2Pulley, ID.s3Pulley]) {
      expect(attachedTo(id).length).toBeGreaterThanOrEqual(4);
    }
    for (const id of [ID.s1Wheel, ID.s2Feed, ID.s3Spindle]) {
      expect(attachedTo(id).length).toBeGreaterThanOrEqual(4);
    }
    // The flywheel: a rim alone reads as static, so it also carries spokes.
    expect(attachedTo(ID.crank).length).toBeGreaterThanOrEqual(6);
    // Every attachTo names a gear that really exists in the layout -- a prop pinned to a
    // typo'd id would silently never move. Asserted as a property rather than a hardcoded
    // count, so adding another visibly-turning member does not fail this test spuriously.
    const gearIds = new Set(createFactoryPreset().gears.map((g) => g.id));
    const targets = new Set(props.filter((p) => p.attachTo).map((p) => p.attachTo!));
    for (const t of targets) expect(gearIds.has(t)).toBe(true);
    expect(targets.size).toBeGreaterThanOrEqual(8);
  });

  it("builds the engine's piston as a closeable crank-slider on the engine crank", () => {
    const props = createFactoryProps();
    const linked = props.filter((p) => p.linkTo);
    expect(linked).toHaveLength(3);

    const roles = linked.map((p) => p.linkTo!.role).sort();
    expect(roles).toEqual(["pin", "rod", "slider"]);

    const crank = get(layout, ID.crank);
    for (const prop of linked) {
      const link = prop.linkTo!;
      expect(link.gear).toBe(ID.crank);
      expect(link.crankRadius).toBe(PISTON_CRANK_RADIUS);
      expect(link.rodLength).toBe(PISTON_ROD_LENGTH);
      // The linkage can only close when the rod is longer than the crank throw.
      expect(link.rodLength).toBeGreaterThan(link.crankRadius);
      // The slide axis must not be parallel to the crank's own rotation axis.
      const dot =
        link.slideAxis[0] * crank.axis[0] +
        link.slideAxis[1] * crank.axis[1] +
        link.slideAxis[2] * crank.axis[2];
      expect(Math.abs(dot)).toBeLessThan(1e-9);
      // The crank pin must ride inside the flywheel it is bolted to.
      expect(link.crankRadius).toBeLessThan(pitchRadius(crank));
    }

    // sceneSync re-poses the rod by mapping its local +Y onto the pin->slider run, so the
    // rod prop must be authored exactly rodLength long along Y.
    const rod = linked.find((p) => p.linkTo!.role === "rod")!;
    expect(rod.kind).toBe("box");
    if (rod.kind === "box") expect(rod.size[1]).toBe(PISTON_ROD_LENGTH);
  });

  it("keeps the shop's structure -- trusses, hangers, benches, walls -- around the mechanism", () => {
    const props = createFactoryProps();
    // Roof trusses and the shaft hangers hanging off them, above the shaft.
    const overhead = props.filter((p) => !p.attachTo && !p.linkTo && p.position[1] > SHAFT_Y);
    expect(overhead.length).toBeGreaterThanOrEqual(15);
    // Masonry: floor, rear wall, two end walls, engine bed.
    const masonry = props.filter((p) => p.texture === "brick" || p.texture === "stone");
    expect(masonry.length).toBeGreaterThanOrEqual(6);
    // Timber: trusses, ridge purlin, benches and the conveyor deck.
    expect(props.filter((p) => p.texture === "wood").length).toBeGreaterThanOrEqual(15);
    // Nothing sinks below the floor slab.
    for (const prop of props) expect(prop.position[1]).toBeGreaterThan(-2);
  });
});
