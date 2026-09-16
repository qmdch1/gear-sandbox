import { describe, it, expect } from "vitest";
import {
  createGearboxPreset,
  createGearboxProps,
  INPUT_CRANK_ID,
  SPLINE1_ID,
  SPLINE2_ID,
  SPLINE3_ID,
  DRIVE1_ID,
  DRIVEN1_ID,
  DRIVE2_ID,
  DRIVEN2_ID,
  DRIVE3_ID,
  DRIVEN3_ID,
  FLANGE_ID,
  LEVER_ID,
  RAIL_ID,
  DRIVE_IDS,
  DRIVEN_IDS,
  SPLINE_IDS,
  GEARBOX_MODULE,
  STAGE_TEETH_SUM,
  CENTER_DISTANCE,
  STAGE1_DRIVE_TEETH,
  STAGE1_DRIVEN_TEETH,
  STAGE2_DRIVE_TEETH,
  STAGE2_DRIVEN_TEETH,
  STAGE3_DRIVE_TEETH,
  STAGE3_DRIVEN_TEETH,
  DRIVE1_R,
  DRIVEN1_R,
  DRIVE2_R,
  DRIVEN2_R,
  DRIVE3_R,
  DRIVEN3_R,
  DRIVEN1_TIP_R,
  DRIVE3_TIP_R,
  DRIVE1_ROOT_R,
  DRIVEN2_ROOT_R,
  STAGE1_RATIO,
  STAGE2_RATIO,
  STAGE3_RATIO,
  INPUT_SPEED,
  SHAFT_AXIS,
  INPUT_Y,
  LAY_Y,
  STAGE1_X,
  STAGE2_X,
  STAGE3_X,
  STAGE_X,
  COLLAR_TEETH,
  COLLAR_MODULE,
  COLLAR_R,
  COLLAR_OUTER_R,
  INPUT_CRANK_X,
  SHIFT_MODULE,
  LEVER_TEETH,
  LEVER_R,
  RAIL_TEETH,
  RAIL_X,
  RAIL_Y,
  RAIL_Z,
  LEVER_X,
  LEVER_Y,
  SHIFT_SWING,
  LEVER_SPEED,
  SHIFT_TRAVEL,
  FORK_X,
  FORK_MIN_X,
  FORK_MAX_X,
  RAIL_BAR_START,
  RAIL_BAR_END,
  FLANGE_HUB_R,
  FLANGE_X,
  CASE_X_MIN,
  CASE_X_MAX,
  CASE_Z_HALF,
  SUMP_TOP_Y,
  CASE_TOP_Y,
  webAngle,
  dogToothAngle,
} from "../../../src/sim/presets/gearbox";
import { evaluatePair, pitchRadius, MESH_TOLERANCE } from "../../../src/sim/meshing";
import { computeSpurProfilePoints } from "../../../src/render/gearGeometry";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { GearInstance, LayoutState } from "../../../src/sim/types";

const byId = (layout: LayoutState, id: string): GearInstance =>
  layout.gears.find((g) => g.id === id)!;

const dist = (a: GearInstance, b: GearInstance): number =>
  Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );

const STAGES = [
  { drive: DRIVE1_ID, driven: DRIVEN1_ID, ratio: STAGE1_RATIO, x: STAGE1_X },
  { drive: DRIVE2_ID, driven: DRIVEN2_ID, ratio: STAGE2_RATIO, x: STAGE2_X },
  { drive: DRIVE3_ID, driven: DRIVEN3_ID, ratio: STAGE3_RATIO, x: STAGE3_X },
] as const;

describe("createGearboxPreset", () => {
  it("builds the input shaft, the layshaft, the flange and the selector", () => {
    const layout = createGearboxPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([
      INPUT_CRANK_ID,
      SPLINE1_ID,
      DRIVE1_ID,
      DRIVEN1_ID,
      SPLINE2_ID,
      DRIVE2_ID,
      DRIVEN2_ID,
      SPLINE3_ID,
      DRIVE3_ID,
      DRIVEN3_ID,
      FLANGE_ID,
      LEVER_ID,
      RAIL_ID,
    ]);
    // Every id is prefixed with the machine's name, so they stay globally unique.
    for (const g of layout.gears) expect(g.id.startsWith("변속기_")).toBe(true);

    // Both shafts run along world X, so the stages stand side by side across the case.
    for (const id of [...DRIVE_IDS, ...DRIVEN_IDS, ...SPLINE_IDS, INPUT_CRANK_ID, RAIL_ID]) {
      expect(byId(layout, id).axis).toEqual(SHAFT_AXIS);
    }
    // ...and the selector pinion turns about Z, perpendicular to the rail it drives.
    expect(byId(layout, LEVER_ID).axis).toEqual([0, 0, 1]);

    // Input shaft up top, layshaft one centre distance below it.
    for (const id of [...DRIVE_IDS, ...SPLINE_IDS, INPUT_CRANK_ID]) {
      expect(byId(layout, id).position[1]).toBe(INPUT_Y);
    }
    for (const id of DRIVEN_IDS) expect(byId(layout, id).position[1]).toBe(LAY_Y);
    expect(INPUT_Y - LAY_Y).toBe(CENTER_DISTANCE);
  });

  it("gives every stage the same tooth-count sum, which is what puts them on ONE centre distance", () => {
    // centreDistance = module * (N_drive + N_driven) / 2, so a fixed sum is a fixed gap.
    expect(STAGE1_DRIVE_TEETH + STAGE1_DRIVEN_TEETH).toBe(STAGE_TEETH_SUM);
    expect(STAGE2_DRIVE_TEETH + STAGE2_DRIVEN_TEETH).toBe(STAGE_TEETH_SUM);
    expect(STAGE3_DRIVE_TEETH + STAGE3_DRIVEN_TEETH).toBe(STAGE_TEETH_SUM);
    expect((GEARBOX_MODULE * STAGE_TEETH_SUM) / 2).toBe(CENTER_DISTANCE);

    // The summed pitch radii therefore land on the same number for all three pairs.
    expect(DRIVE1_R + DRIVEN1_R).toBe(CENTER_DISTANCE);
    expect(DRIVE2_R + DRIVEN2_R).toBe(CENTER_DISTANCE);
    expect(DRIVE3_R + DRIVEN3_R).toBe(CENTER_DISTANCE);
  });

  it("places all three meshes at exactly their summed pitch radii", () => {
    const layout = createGearboxPreset();
    for (const stage of STAGES) {
      const drive = byId(layout, stage.drive);
      const driven = byId(layout, stage.driven);
      const expected = pitchRadius(drive) + pitchRadius(driven);
      expect(expected).toBe(CENTER_DISTANCE);
      expect(dist(drive, driven)).toBeCloseTo(CENTER_DISTANCE, 12);
      // ...and the two are in the same plane across the shafts, so their rims really touch.
      expect(drive.position[0]).toBe(stage.x);
      expect(driven.position[0]).toBe(stage.x);
      expect(drive.position[2]).toBe(0);
      expect(driven.position[2]).toBe(0);
    }
  });

  it("forms exactly three stage meshes, each at its own ratio, via the real evaluatePair", () => {
    const layout = createGearboxPreset();
    const ratios: number[] = [];
    for (const stage of STAGES) {
      const edge = evaluatePair(byId(layout, stage.drive), byId(layout, stage.driven));
      expect(edge).not.toBeNull();
      expect(edge!.kind).toBe("mesh");
      expect(edge!.oneWay).toBe("none");
      expect(edge!.ratio).toBeCloseTo(stage.ratio, 12);
      ratios.push(edge!.ratio);
    }
    // 12/36, 16/32, 30/18 -- three genuinely different ratios, not one repeated three times.
    expect(ratios[0]).toBeCloseTo(1 / 3, 12);
    expect(ratios[1]).toBeCloseTo(1 / 2, 12);
    expect(ratios[2]).toBeCloseTo(5 / 3, 12);
    expect(new Set(ratios.map((r) => r.toFixed(9))).size).toBe(3);
  });

  it("keeps ONE module per mesh -- every mesh edge buildEdges finds joins equal tooth sizes", () => {
    // `evaluatePair` never checks module, so a mixed-module mesh gives a happy sim edge and a
    // rendered pair whose teeth could not possibly engage. Check every mesh the real edge
    // builder produces, not just the ones this preset means to make.
    const layout = createGearboxPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const meshEdges = edges.filter((e) => e.kind === "mesh");
    expect(meshEdges.length).toBe(4); // three stages + the rack/pinion of the selector
    for (const e of meshEdges) {
      expect(byId(layout, e.a).module).toBe(byId(layout, e.b).module);
    }
    // Both mesh families in this preset happen to run on 0.5.
    expect(SHIFT_MODULE).toBe(GEARBOX_MODULE);
  });

  it("couples each drive gear to a splined collar and the flange to the 2단 wheel", () => {
    const layout = createGearboxPreset();
    for (let i = 0; i < 3; i++) {
      const collar = byId(layout, SPLINE_IDS[i]);
      const drive = byId(layout, DRIVE_IDS[i]);
      expect(collar.position).toEqual(drive.position); // coincident: same centre, same axis
      expect(collar.axis).toEqual(drive.axis);
      const edge = evaluatePair(collar, drive);
      expect(edge).not.toBeNull();
      expect(edge!.kind).toBe("coupling");
      expect(edge!.ratio).toBe(1);
    }
    const flange = byId(layout, FLANGE_ID);
    const driven2 = byId(layout, DRIVEN2_ID);
    expect(flange.position).toEqual(driven2.position);
    const flangeEdge = evaluatePair(driven2, flange);
    expect(flangeEdge!.kind).toBe("coupling");
    expect(flangeEdge!.ratio).toBe(1);
  });

  it("ties the input shaft together with chain links that are exactly 1:1", () => {
    const layout = createGearboxPreset();
    expect(layout.remoteLinks.map((l) => [l.a, l.b, l.kind])).toEqual([
      [INPUT_CRANK_ID, SPLINE1_ID, "chain"],
      [SPLINE1_ID, SPLINE2_ID, "chain"],
      [SPLINE2_ID, SPLINE3_ID, "chain"],
    ]);
    // A chain edge's ratio is a.teeth / b.teeth, so it is 1 only when the tooth counts match.
    // The modules must match too or the "chain" would be spanning two different pitches.
    for (const id of [INPUT_CRANK_ID, ...SPLINE_IDS]) {
      expect(byId(layout, id).teeth).toBe(COLLAR_TEETH);
      expect(byId(layout, id).module).toBe(COLLAR_MODULE);
    }
    const chainEdges = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "chain");
    expect(chainEdges.length).toBe(3);
    for (const e of chainEdges) expect(e.ratio).toBe(1);
  });

  it("meshes the shift rail against the lever pinion at exactly the pinion's pitch radius", () => {
    const layout = createGearboxPreset();
    const lever = byId(layout, LEVER_ID);
    const rail = byId(layout, RAIL_ID);
    // evaluatePair's rack rule measures the pinion's distance to the rack's infinite line.
    const perpendicular = Math.hypot(lever.position[1] - RAIL_Y, lever.position[2] - RAIL_Z);
    expect(perpendicular).toBeCloseTo(LEVER_R, 12);
    expect(pitchRadius(lever)).toBe(LEVER_R);
    expect(LEVER_Y).toBe(RAIL_Y + LEVER_R);

    const edge = evaluatePair(lever, rail);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    // Only the pinion may drive the rack, never the other way round.
    expect(edge!.oneWay).toBe("aToB");
  });

  it("produces exactly the eleven edges the machine is made of, and nothing spurious", () => {
    const layout = createGearboxPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    expect(edges.length).toBe(11);
    const kinds = edges.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(kinds).toEqual({ mesh: 4, coupling: 4, chain: 3 });
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createGearboxPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("turns all three drive gears as ONE shaft and each layshaft wheel at its own ratio", () => {
    let layout = createGearboxPreset();
    let sawPositiveRail = false;
    let sawNegativeRail = false;

    for (let i = 0; i < 900; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      // The input stub and all three collars and drive gears: one rigid shaft, one speed.
      for (const id of [INPUT_CRANK_ID, ...SPLINE_IDS, ...DRIVE_IDS]) {
        expect(byId(layout, id).angularVelocity).toBeCloseTo(INPUT_SPEED, 12);
      }

      // Each layshaft wheel: driven backwards at its own tooth-count ratio.
      const driven1 = byId(layout, DRIVEN1_ID).angularVelocity;
      const driven2 = byId(layout, DRIVEN2_ID).angularVelocity;
      const driven3 = byId(layout, DRIVEN3_ID).angularVelocity;
      expect(driven1).toBeCloseTo(-STAGE1_RATIO * INPUT_SPEED, 12); // -0.4
      expect(driven2).toBeCloseTo(-STAGE2_RATIO * INPUT_SPEED, 12); // -0.6
      expect(driven3).toBeCloseTo(-STAGE3_RATIO * INPUT_SPEED, 12); // -2.0
      // Three separately verified, genuinely different speeds, running at once.
      expect(new Set([driven1, driven2, driven3].map((w) => w.toFixed(9))).size).toBe(3);
      // 3단 is a step-up: the layshaft wheel outruns the input shaft it is driven by.
      expect(Math.abs(driven3)).toBeGreaterThan(INPUT_SPEED);
      // 1단 and 2단 are reductions: slower out than in.
      expect(Math.abs(driven1)).toBeLessThan(INPUT_SPEED);
      expect(Math.abs(driven2)).toBeLessThan(INPUT_SPEED);

      // The output flange is keyed to the 2단 wheel, so it runs at that wheel's speed exactly.
      expect(byId(layout, FLANGE_ID).angularVelocity).toBeCloseTo(driven2, 12);

      // The rail never leaves its stops, and it does go both ways.
      const railPos = byId(layout, RAIL_ID).linearPosition!;
      expect(railPos).toBeGreaterThanOrEqual(-SHIFT_TRAVEL);
      expect(railPos).toBeLessThanOrEqual(SHIFT_TRAVEL);
      if (railPos > 0.5) sawPositiveRail = true;
      if (railPos < -0.5) sawNegativeRail = true;

      for (const g of layout.gears) expect(g.broken).toBe(false);
    }

    // Everything that should turn, turned.
    for (const id of [INPUT_CRANK_ID, ...SPLINE_IDS, ...DRIVE_IDS, ...DRIVEN_IDS, FLANGE_ID, LEVER_ID]) {
      expect(Math.abs(byId(layout, id).rotation)).toBeGreaterThan(0);
    }
    // ...and the fork really shuttled, rather than parking against one stop.
    expect(sawPositiveRail).toBe(true);
    expect(sawNegativeRail).toBe(true);
  });

  it("bounds the selector by BOTH the lever's reverseAt and the rail's travelLimit, in agreement", () => {
    const layout = createGearboxPreset();
    expect(byId(layout, LEVER_ID).reverseAt).toEqual([-SHIFT_SWING, SHIFT_SWING]);
    expect(byId(layout, RAIL_ID).travelLimit).toEqual([-SHIFT_TRAVEL, SHIFT_TRAVEL]);
    // rotation.ts drives a rack at crankSpeed * pitchRadius(pinion), so the stroke IS
    // LEVER_R per radian of lever -- which is why the two bounds agree exactly.
    expect(SHIFT_TRAVEL).toBe(LEVER_R * SHIFT_SWING);
    expect(byId(layout, LEVER_ID).angularVelocity).toBe(LEVER_SPEED);
  });

  it("reaches both stops of the fork stroke, to the exact travel limit", () => {
    let layout = createGearboxPreset();
    let minPos = 0;
    let maxPos = 0;
    for (let i = 0; i < 1200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const p = byId(layout, RAIL_ID).linearPosition!;
      minPos = Math.min(minPos, p);
      maxPos = Math.max(maxPos, p);
    }
    expect(maxPos).toBeCloseTo(SHIFT_TRAVEL, 9);
    expect(minPos).toBeCloseTo(-SHIFT_TRAVEL, 9);
  });
});

describe("createGearboxProps", () => {
  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createGearboxPreset().gears.map((g) => g.id));
    for (const p of createGearboxProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("webs and marks all six shaft gears, so six discs visibly turn at four speeds", () => {
    // A bare disc spun about its own axis shows nothing at all -- the webs and the timing
    // mark are the only reason any of these wheels reads as turning.
    const props = createGearboxProps();
    for (const id of [...DRIVE_IDS, ...DRIVEN_IDS]) {
      const attached = props.filter((p) => p.attachTo === id);
      expect(attached.length).toBeGreaterThanOrEqual(4); // 3 webs + 1 timing mark
    }
  });

  it("spaces the webs around each gear instead of stacking them in one spoke", () => {
    const angles = new Set<number>();
    for (let i = 0; i < 3; i++) angles.add(Number(webAngle(i).toFixed(6)));
    expect(angles.size).toBe(3);
    const dogAngles = new Set<number>();
    for (let i = 0; i < 4; i++) dogAngles.add(Number(dogToothAngle(i).toFixed(6)));
    expect(dogAngles.size).toBe(4);
  });

  it("turns the two dog collars with their OWN free wheels, at the two stage speeds", () => {
    const props = createGearboxProps();
    // Four dog teeth per collar, each attached to the wheel it belongs to.
    const onDriven1 = props.filter((p) => p.attachTo === DRIVEN1_ID && p.kind === "box");
    const onDriven2 = props.filter((p) => p.attachTo === DRIVEN2_ID && p.kind === "box");
    expect(onDriven1.length).toBeGreaterThanOrEqual(8); // 3 webs + 1 mark + 4 dog teeth
    expect(onDriven2.length).toBeGreaterThanOrEqual(8);
  });

  it("slides the whole fork assembly with the rail, and nothing else", () => {
    const sliding = createGearboxProps().filter((p) => p.slideWith);
    expect(sliding.length).toBeGreaterThanOrEqual(5); // saddle, arm, slipper ring, two pads
    for (const p of sliding) expect(p.slideWith).toBe(RAIL_ID);
  });

  it("swings the hand lever and turns both flanges", () => {
    const props = createGearboxProps();
    expect(props.filter((p) => p.attachTo === LEVER_ID).length).toBeGreaterThanOrEqual(2);
    // The flanges are discs on their own axis -- symmetric, and dead on their own. The bolt
    // lugs and the driver key are what make them read as turning.
    expect(props.filter((p) => p.attachTo === FLANGE_ID).length).toBeGreaterThanOrEqual(5);
    expect(props.filter((p) => p.attachTo === INPUT_CRANK_ID).length).toBeGreaterThanOrEqual(5);
  });

  it("gives the case, the bench and the machined parts their real finishes", () => {
    const used = new Set(createGearboxProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["rust", "metal", "wood", "stone", "brick", "fabric", "tile"]) {
      expect(used.has(kind as never)).toBe(true);
    }
    // Nothing is left as a bare untextured slab.
    const untextured = createGearboxProps().filter((p) => !p.texture);
    expect(untextured.length).toBe(0);
  });
});

/** Nothing in the simulation stops a gear from being drawn through the case it lives in, nor a
 *  collar from bursting out of the hub it is supposed to hide inside, nor the fork from sliding
 *  straight through a gear disc. This suite pins the clearances that keep the box a box --
 *  every one measured against a TIP or ROOT radius (a tooth reaches one module past the pitch
 *  circle and is cut 1.25 modules below it), never against a bare pitch radius. */
describe("gearbox clearances", () => {
  it("measures rims at the tooth tip and hubs at the root, not at the pitch circle", () => {
    // These four assertions used to read `expect(DRIVEN1_TIP_R).toBe(DRIVEN1_R +
    // GEARBOX_MODULE)` and so on -- the DEFINITIONS in gearbox.ts, restated. Nothing about the
    // gears this box is actually drawn with could have made them fail, while every clearance
    // test below leans on these constants being the real reach of a real tooth.
    //
    // So check them against the geometry the renderer builds. `computeSpurProfilePoints` is
    // what `gearGeometry.ts` extrudes, so the furthest and nearest points of that profile ARE
    // the tip and root the clearances have to respect. If the addendum or dedendum factors in
    // gearGeometry.ts ever move, these constants become wrong and this fails -- which is the
    // whole reason the suite quotes tip and root rather than pitch radii.
    const reach = (teeth: number, module: number) => {
      const pts = computeSpurProfilePoints(teeth, module);
      const radii = pts.map((v) => Math.hypot(v.x, v.y));
      return { tip: Math.max(...radii), root: Math.min(...radii) };
    };
    expect(reach(STAGE1_DRIVEN_TEETH, GEARBOX_MODULE).tip).toBeCloseTo(DRIVEN1_TIP_R, 9);
    expect(reach(STAGE3_DRIVE_TEETH, GEARBOX_MODULE).tip).toBeCloseTo(DRIVE3_TIP_R, 9);
    expect(reach(STAGE1_DRIVE_TEETH, GEARBOX_MODULE).root).toBeCloseTo(DRIVE1_ROOT_R, 9);
    expect(reach(STAGE2_DRIVEN_TEETH, GEARBOX_MODULE).root).toBeCloseTo(DRIVEN2_ROOT_R, 9);

    // And the figures themselves, so a reader can check the arithmetic at a glance.
    expect(DRIVEN1_TIP_R).toBe(9.5);
    expect(DRIVE3_TIP_R).toBe(8);
    expect(DRIVE1_ROOT_R).toBe(2.375);
    expect(DRIVEN2_ROOT_R).toBe(7.375);
  });

  it("keeps the biggest wheel out of the oil and the tallest gear under the top cover", () => {
    expect(LAY_Y - DRIVEN1_TIP_R).toBeGreaterThan(SUMP_TOP_Y); // 4.5 > 2.5
    expect(INPUT_Y + DRIVE3_TIP_R).toBeLessThan(CASE_TOP_Y); // 34 < 37
    // The wheels are discs across the case, so their tip circles have to fit its depth too.
    expect(DRIVEN1_TIP_R).toBeLessThan(CASE_Z_HALF); // 9.5 < 12
  });

  it("keeps every shaft body between the two end walls", () => {
    expect(INPUT_CRANK_X).toBeGreaterThan(CASE_X_MIN);
    expect(STAGE3_X).toBeLessThan(CASE_X_MAX);
    for (const x of STAGE_X) {
      expect(x).toBeGreaterThan(CASE_X_MIN);
      expect(x).toBeLessThan(CASE_X_MAX);
    }
    // ...and the output flange is drawn OUTSIDE the output wall, on the shaft's stub.
    expect(FLANGE_X).toBeGreaterThan(CASE_X_MAX);
  });

  it("buries each splined collar inside its drive gear's root circle", () => {
    // gearGeometry.ts sprocketGeometry: hub = pitchRadius * 0.85, teeth stand module * 0.9
    // proud of it. That whole reach has to vanish inside the SMALLEST drive gear.
    expect(COLLAR_OUTER_R).toBeCloseTo(COLLAR_R * 0.85 + COLLAR_MODULE * 0.9, 12);
    expect(COLLAR_OUTER_R).toBeLessThan(DRIVE1_ROOT_R); // 1.236 < 2.375
  });

  it("buries the output flange's hub inside the 2단 wheel it is keyed to", () => {
    // gearGeometry.ts draws a "load" as a module * 2 radius cylinder.
    expect(FLANGE_HUB_R).toBeLessThan(DRIVEN2_ROOT_R); // 3 < 7.375
  });

  it("slides the fork in the clear bay between stage 1 and stage 2, never through a gear", () => {
    expect(FORK_MIN_X).toBe(FORK_X - SHIFT_TRAVEL); // 8
    expect(FORK_MAX_X).toBe(FORK_X + SHIFT_TRAVEL); // 16
    // gearGeometry.ts extrudes a gear GEAR_THICKNESS = 0.4 along its axis, so a stage's discs
    // occupy x = stageX .. stageX + 0.4. The fork clears both neighbours.
    expect(FORK_MIN_X).toBeGreaterThan(STAGE1_X + 0.4);
    expect(FORK_MAX_X).toBeLessThan(STAGE2_X);
  });

  it("keeps the pinion on the rail, and the rail inside the case, at both ends of the stroke", () => {
    // rackGeometry builds the bar from -pitch/2 forward along the axis.
    expect(RAIL_BAR_END - RAIL_BAR_START).toBeCloseTo(RAIL_TEETH * Math.PI * SHIFT_MODULE, 9);
    expect(RAIL_BAR_START + SHIFT_TRAVEL).toBeLessThan(LEVER_X);
    expect(RAIL_BAR_END - SHIFT_TRAVEL).toBeGreaterThan(LEVER_X);
    expect(RAIL_BAR_START - SHIFT_TRAVEL).toBeGreaterThan(CASE_X_MIN);
    expect(RAIL_BAR_END + SHIFT_TRAVEL).toBeLessThan(CASE_X_MAX);
  });

  it("stands the selector housing far enough out to clear the biggest wheel", () => {
    const layout = createGearboxPreset();
    const rail = byId(layout, RAIL_ID);
    const driven1 = byId(layout, DRIVEN1_ID);
    // isOverlapping compares centre distance against the summed pitch radii (a rack's own
    // "footprint" radius is its pitch radius), less the 5% tolerance.
    const floor = (pitchRadius(rail) + pitchRadius(driven1)) * (1 - MESH_TOLERANCE);
    expect(dist(rail, driven1)).toBeGreaterThan(floor); // 17.09 > 14.725
    expect(RAIL_X).toBeLessThan(STAGE1_X);
    expect(RAIL_Z).toBeGreaterThan(DRIVEN1_TIP_R);
  });

  it("keeps every same-shaft neighbour out of the phantom-mesh window", () => {
    // Two parallel-axis gears that happen to sit at rA + rB (+/-5%) form a mesh whether or not
    // anyone meant them to -- which on one shaft would be a pair of gears "meshing" edge to
    // edge along the same centreline. Check every same-shaft spur pair, not just the ones the
    // stage layout was derived from.
    const layout = createGearboxPreset();
    const shafts = [DRIVE_IDS, DRIVEN_IDS];
    let checked = 0;
    for (const shaft of shafts) {
      for (let i = 0; i < shaft.length; i++) {
        for (let j = i + 1; j < shaft.length; j++) {
          const a = byId(layout, shaft[i]);
          const b = byId(layout, shaft[j]);
          const summed = pitchRadius(a) + pitchRadius(b);
          const gap = dist(a, b);
          expect(Math.abs(gap - summed)).toBeGreaterThan(summed * MESH_TOLERANCE);
          expect(gap).toBeGreaterThan(summed * (1 - MESH_TOLERANCE));
          expect(evaluatePair(a, b)).toBeNull();
          checked++;
        }
      }
    }
    expect(checked).toBe(6); // 3 pairs per shaft, two shafts
  });

  it("keeps the lever pinion clear of the tooth it is nearest to", () => {
    const layout = createGearboxPreset();
    const lever = byId(layout, LEVER_ID);
    for (const id of [...DRIVE_IDS, ...DRIVEN_IDS]) {
      const wheel = byId(layout, id);
      const floor = (pitchRadius(lever) + pitchRadius(wheel)) * (1 - MESH_TOLERANCE);
      expect(dist(lever, wheel)).toBeGreaterThan(floor);
      // ...and its axis is perpendicular to theirs, so it can never mesh one of them.
      expect(evaluatePair(lever, wheel)).toBeNull();
    }
  });
});
