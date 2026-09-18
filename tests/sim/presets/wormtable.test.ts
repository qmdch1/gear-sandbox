import { describe, it, expect } from "vitest";
import {
  createWormTablePreset,
  createWormTableProps,
  MOTOR_ID,
  WORM_ID,
  WHEEL_ID,
  PLATTER_ID,
  TABLE_MODULE,
  MOTOR_MODULE,
  PLATTER_MODULE,
  WORM_STARTS,
  WHEEL_TEETH,
  MOTOR_TEETH,
  WORM_R,
  WHEEL_R,
  MOTOR_R,
  WORM_MESH_DISTANCE,
  WORM_RATIO,
  MOTOR_SPEED,
  TABLE_SPEED,
  TABLE_Y,
  WHEEL_POS,
  WORM_POS,
  MOTOR_WHEEL_GAP,
  PLATTER_R,
  HANDWHEEL_R,
  SLOT_COUNT,
  WHEEL_TIP_R,
  wormLineClearX,
  HANDWHEEL_X,
  MOTOR_CASE_R,
  MOTOR_CASE_X,
  BEARING_X,
} from "../../../src/sim/presets/wormtable";
import type { GearInstance, LayoutState } from "../../../src/sim/types";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { propagateRotation } from "../../../src/sim/rotation";
import { tick } from "../../../src/sim/simulation";

const byId = (gears: GearInstance[], id: string) => gears.find((g) => g.id === id)!;

const edgeBetween = (edges: ReturnType<typeof buildEdges>, x: string, y: string) =>
  edges.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));

/** Ticks a layout forward with wear OFF -- what `main.ts` itself does. Wear matters here: the
 *  platter is a `load`, and `simulation.ts` floods the load multiplier across the whole
 *  component, so the worm (80 durability, 1.5/s base, 1.8 load multiplier) wears through in
 *  ~29.6 s and stops relaying drive. That is a durability fact, verified on its own below; it
 *  would only obscure the kinematics being checked here. */
function run(layout: LayoutState, ticks: number, dt = 1 / 60): LayoutState {
  let current = layout;
  for (let i = 0; i < ticks; i++) {
    const r = tick(current, dt, 1, { wear: false });
    current = { gears: r.gears, remoteLinks: current.remoteLinks };
  }
  return current;
}

describe("createWormTablePreset", () => {
  it("builds the motor, worm, worm wheel and platter on their two perpendicular axes", () => {
    const layout = createWormTablePreset();
    expect(layout.gears.map((g) => g.id)).toEqual([MOTOR_ID, WORM_ID, WHEEL_ID, PLATTER_ID]);
    expect(layout.remoteLinks).toEqual([]);

    expect(byId(layout.gears, MOTOR_ID).type).toBe("crank");
    expect(byId(layout.gears, WORM_ID).type).toBe("worm");
    expect(byId(layout.gears, WHEEL_ID).type).toBe("helical");
    expect(byId(layout.gears, PLATTER_ID).type).toBe("load");

    // The right-angle drive: the shaft runs along X, the table turns about Y.
    expect(byId(layout.gears, MOTOR_ID).axis).toEqual([1, 0, 0]);
    expect(byId(layout.gears, WORM_ID).axis).toEqual([1, 0, 0]);
    expect(byId(layout.gears, WHEEL_ID).axis).toEqual([0, 1, 0]);
    expect(byId(layout.gears, PLATTER_ID).axis).toEqual([0, 1, 0]);

    // One crank only: two cranks in one connected component would leave the second one's
    // commanded speed silently discarded by `propagateRotation`.
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(1);
    expect(byId(layout.gears, MOTOR_ID).angularVelocity).toBe(MOTOR_SPEED);

    // Nothing in this machine has finite travel, so neither bounding field appears -- and neither
    // is a general-purpose bound: `reverseAt` is crank-only, `travelLimit` is rack-only.
    for (const g of layout.gears) {
      expect(g.reverseAt).toBeUndefined();
      expect(g.travelLimit).toBeUndefined();
    }
    expect(layout.gears.filter((g) => g.type === "rack")).toHaveLength(0);
  });

  it("places the worm exactly one summed pitch radius from the table's axis, along the common perpendicular", () => {
    const layout = createWormTablePreset();
    expect(WORM_R).toBe((TABLE_MODULE * WORM_STARTS) / 2); // 1
    expect(WHEEL_R).toBe((TABLE_MODULE * WHEEL_TEETH) / 2); // 20
    expect(MOTOR_R).toBe((MOTOR_MODULE * MOTOR_TEETH) / 2); // 1.5
    expect(WORM_MESH_DISTANCE).toBe(21);

    const wheel = byId(layout.gears, WHEEL_ID);
    const worm = byId(layout.gears, WORM_ID);
    expect(wheel.position).toEqual(WHEEL_POS);
    expect(worm.position).toEqual(WORM_POS);
    // Same height, offset purely along +Z -- the common perpendicular of an X axis and a Y axis,
    // and the only line along which a worm sits tangent to its wheel's rim.
    expect(worm.position[1]).toBe(wheel.position[1]);
    expect(worm.position[0]).toBe(wheel.position[0]);
    expect(worm.position[2] - wheel.position[2]).toBe(WORM_MESH_DISTANCE);
    const centreDistance = Math.hypot(
      worm.position[0] - wheel.position[0],
      worm.position[1] - wheel.position[1],
      worm.position[2] - wheel.position[2],
    );
    expect(centreDistance).toBeCloseTo(WORM_R + WHEEL_R, 12);

    // The motor and the platter are coincident with the shafts they drive / ride.
    expect(byId(layout.gears, MOTOR_ID).position).toEqual(WORM_POS);
    expect(byId(layout.gears, PLATTER_ID).position).toEqual(WHEEL_POS);
  });

  it("forms exactly one tooth mesh and two coincident couplings via the real evaluatePair", () => {
    const layout = createWormTablePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    expect(edges).toHaveLength(3);

    const mesh = edgeBetween(edges, WORM_ID, WHEEL_ID)!;
    expect(mesh).toBeDefined();
    expect(mesh.kind).toBe("mesh");
    expect(edgeBetween(edges, MOTOR_ID, WORM_ID)!.kind).toBe("coupling");
    expect(edgeBetween(edges, WHEEL_ID, PLATTER_ID)!.kind).toBe("coupling");

    // A coupling is always 1:1; the mesh carries the reduction.
    expect(edgeBetween(edges, MOTOR_ID, WORM_ID)!.ratio).toBe(1);
    expect(edgeBetween(edges, WHEEL_ID, PLATTER_ID)!.ratio).toBe(1);
    // `evaluatePair` returns teeth_a / teeth_b, so which way round it reads depends on array
    // order. Derive the expectation from the edge rather than hardcoding 1/20 on one side.
    expect(mesh.a === WORM_ID ? mesh.ratio : 1 / mesh.ratio).toBeCloseTo(WORM_RATIO, 12);
    expect(WORM_RATIO).toBe(2 / 40);
  });

  it("reports zero diagnostics problems -- connected, powered, nothing overlapping", () => {
    const layout = createWormTablePreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("keeps every meshing wheel on ONE module, so the teeth are the same SIZE and could really engage", () => {
    // `evaluatePair` never compares module -- it only asks whether the centres sit
    // pitchRadius(a) + pitchRadius(b) apart. A mismatch would give a perfectly happy sim edge and
    // a rendered pair whose teeth could never engage. This is the assertion that makes the file's
    // doc comment true rather than aspirational.
    const layout = createWormTablePreset();
    const modules = new Map(layout.gears.map((g) => [g.id, g.module]));
    const meshes = buildEdges(layout.gears, layout.remoteLinks).filter((e) => e.kind === "mesh");
    expect(meshes).toHaveLength(1);
    for (const e of meshes) {
      expect(modules.get(e.a), `${e.a} <-> ${e.b}`).toBe(TABLE_MODULE);
      expect(modules.get(e.b), `${e.a} <-> ${e.b}`).toBe(TABLE_MODULE);
    }
    // The two coincident partners never tooth-mesh anything, so they are free to carry their own
    // sizes -- and the motor coupling has to, to fit beside the wheel (see the gap test below).
    expect(modules.get(MOTOR_ID)).toBe(MOTOR_MODULE);
    expect(modules.get(PLATTER_ID)).toBe(PLATTER_MODULE);
  });

  it("turns the table at exactly 1/20 of the worm, the opposite way, over hundreds of real ticks", () => {
    let layout = createWormTablePreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      const motor = byId(layout.gears, MOTOR_ID);
      const worm = byId(layout.gears, WORM_ID);
      const wheel = byId(layout.gears, WHEEL_ID);
      const platter = byId(layout.gears, PLATTER_ID);

      expect(motor.angularVelocity).toBe(MOTOR_SPEED);
      // 1:1 coincident coupling, sign +1: the worm turns with the motor.
      expect(worm.angularVelocity).toBeCloseTo(MOTOR_SPEED, 12);
      // The mesh: 1/20 and reversed.
      expect(wheel.angularVelocity).toBeCloseTo(-WORM_RATIO * worm.angularVelocity, 12);
      expect(wheel.angularVelocity).toBeCloseTo(TABLE_SPEED, 12);
      expect(Math.sign(wheel.angularVelocity)).toBe(-Math.sign(worm.angularVelocity));
      // The platter rides the wheel 1:1.
      expect(platter.angularVelocity).toBeCloseTo(wheel.angularVelocity, 12);
    }

    // Both really turned, and the table's accumulated angle tracks the worm's at the same 1/20.
    // The tolerance is one wheel tooth (2*pi/40 = 0.157): `tick` re-derives the tooth phase for
    // every mesh edge, which snaps the wheel onto the worm's tooth lattice on the first tick.
    const worm = byId(layout.gears, WORM_ID);
    const wheel = byId(layout.gears, WHEEL_ID);
    expect(worm.rotation).toBeCloseTo(MOTOR_SPEED * 10, 6); // 600 ticks at 1/60 s = 10 s
    expect(Math.abs(wheel.rotation)).toBeGreaterThan(0);
    expect(wheel.rotation).toBeLessThan(0);
    expect(Math.abs(wheel.rotation - -WORM_RATIO * worm.rotation)).toBeLessThan((2 * Math.PI) / WHEEL_TEETH);
  });
});

describe("createWormTablePreset -- the one-way worm drive", () => {
  it("marks the mesh one-way, from the worm toward the wheel", () => {
    const layout = createWormTablePreset();
    const mesh = edgeBetween(buildEdges(layout.gears, layout.remoteLinks), WORM_ID, WHEEL_ID)!;
    // `oneWay` names the side that may drive: "aToB" when the worm is the edge's `a`, "bToA"
    // when it is the `b`. Derived from the edge so array order cannot silently invert it.
    expect(mesh.oneWay).toBe(mesh.a === WORM_ID ? "aToB" : "bToA");
    // The couplings are bidirectional, so only the worm mesh restricts flow.
    expect(edgeBetween(buildEdges(layout.gears, layout.remoteLinks), MOTOR_ID, WORM_ID)!.oneWay).toBe("none");
  });

  it("BLOCKS back-drive end to end: cranking the table leaves the worm at exactly zero", () => {
    // Nothing in the repo exercised this path before. Rebuild the same four gears with the power
    // input moved to the TABLE side: the motor is demoted to a plain spur (still coincident with
    // the worm, so it keeps its coupling edge and the graph is unchanged), and the wheel becomes
    // the crank -- someone turning the table by hand. Everything else is identical.
    const BACK_DRIVE_SPEED = 1.5;
    const base = createWormTablePreset();
    const backDriven: LayoutState = {
      gears: base.gears.map((g) => {
        if (g.id === MOTOR_ID) return { ...g, type: "spur" as const, angularVelocity: 0 };
        if (g.id === WHEEL_ID) return { ...g, type: "crank" as const, angularVelocity: BACK_DRIVE_SPEED };
        return { ...g };
      }),
      remoteLinks: [],
    };

    // The graph is the same three edges, with the same one-way mesh: nothing about the geometry
    // changed, only where the power comes in.
    const edges = buildEdges(backDriven.gears, backDriven.remoteLinks);
    expect(edges).toHaveLength(3);
    const mesh = edgeBetween(edges, WORM_ID, WHEEL_ID)!;
    expect(mesh.kind).toBe("mesh");
    expect(mesh.oneWay).toBe(mesh.a === WORM_ID ? "aToB" : "bToA");

    // `propagateRotation` walks the DIRECTED adjacency, so the crank-table's only outgoing edge
    // is the coupling to the platter. The worm is not on a path power can flow along.
    const { angularVelocities } = propagateRotation(backDriven.gears, edges);
    expect(angularVelocities.get(WHEEL_ID)).toBe(BACK_DRIVE_SPEED);
    expect(angularVelocities.get(PLATTER_ID)).toBe(BACK_DRIVE_SPEED);
    expect(angularVelocities.get(WORM_ID)).toBe(0);
    expect(angularVelocities.get(MOTOR_ID)).toBe(0);

    // `classify` agrees, and says why: both are connected, neither is powered.
    const d = classify(backDriven.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
    expect(new Set(d.noPowerIds)).toEqual(new Set([MOTOR_ID, WORM_ID]));

    // And over real ticks the worm never moves at all, while the table turns freely.
    const after = run(backDriven, 300);
    expect(byId(after.gears, WORM_ID).angularVelocity).toBe(0);
    expect(byId(after.gears, WORM_ID).rotation).toBe(0);
    expect(byId(after.gears, MOTOR_ID).rotation).toBe(0);
    expect(byId(after.gears, WHEEL_ID).rotation).toBeCloseTo(BACK_DRIVE_SPEED * 5, 6); // 300/60 s
  });

  it("still drives freely the other way round, so the block is directional and not a dead edge", () => {
    const after = run(createWormTablePreset(), 300);
    expect(byId(after.gears, WORM_ID).rotation).toBeCloseTo(MOTOR_SPEED * 5, 6);
    expect(byId(after.gears, WHEEL_ID).angularVelocity).toBeCloseTo(TABLE_SPEED, 12);
  });
});

describe("createWormTablePreset -- clearances the doc comment claims", () => {
  it("keeps the coincident motor coupling small enough to clear the wheel it sits beside", () => {
    const layout = createWormTablePreset();
    const motor = byId(layout.gears, MOTOR_ID);
    const wheel = byId(layout.gears, WHEEL_ID);

    // The near miss that makes this worth asserting: the motor sits 21 from the wheel's centre
    // while their summed pitch radii are 21.5, which is INSIDE `evaluatePair`'s 5% window
    // (21.5 * 0.05 = 1.075). Only the perpendicular axes stop the parallel-family mesh check.
    expect(Math.abs(WORM_MESH_DISTANCE - (MOTOR_R + WHEEL_R))).toBeLessThanOrEqual((MOTOR_R + WHEEL_R) * 0.05);
    expect(evaluatePair(motor, wheel)).toBeNull();

    // With no edge between them, the overlap floor applies: 21 vs 0.95 * (1.5 + 20) = 20.425.
    expect(isOverlapping(motor, wheel)).toBe(false);
    expect(MOTOR_WHEEL_GAP).toBeCloseTo(0.575, 12);
    expect(MOTOR_WHEEL_GAP).toBeGreaterThan(0);

    // ...and it really is a floor: the ceiling is 21/0.95 - 20 = 2.105, so the same coupling at
    // r = 2.5 fouls the wheel and `classify` would report it. That is why MOTOR_MODULE is not
    // TABLE_MODULE -- a 6-tooth coupling on module 1 would be r = 3 and overlap outright.
    expect(WORM_MESH_DISTANCE / 0.95 - WHEEL_R).toBeCloseTo(2.105, 3);
    const tooBig: GearInstance = { ...motor, teeth: 10, module: 0.5 }; // r = 2.5
    expect(isOverlapping(tooBig, wheel)).toBe(true);
    const atModuleOne: GearInstance = { ...motor, teeth: MOTOR_TEETH, module: TABLE_MODULE }; // r = 3
    expect(isOverlapping(atModuleOne, wheel)).toBe(true);
  });

  it("derives every shaft fitting's standoff from the wheel's tip circle", () => {
    // A body of radius `rho` around the worm's shaft line reaches inward to z = WHEEL_TIP_R -
    // rho, and the wheel's tip circle reaches z = sqrt(WHEEL_TIP_R^2 - x^2); `wormLineClearX`
    // solves those for x.
    //
    // This test used to call that function on literal rho values and compare the answers with
    // literal 11, 14 and 16 -- so both sides came from the same place and it only re-checked a
    // square root. BEARING_X, MOTOR_CASE_X and HANDWHEEL_X were not even imported here, and
    // createWormTableProps() was never called. Measured: moving every fitting far inside its
    // own standoff (BEARING_X 11 -> 3, MOTOR_CASE_X 18.5 -> 6, HANDWHEEL_X -16 -> -2, which
    // buries the handwheel rim 4.97 inside the wheel's teeth) left all eighteen tests passing.
    //
    // So compare the FITTINGS against it.
    const clearance = (x: number, rho: number) => Math.abs(x) - wormLineClearX(rho);
    expect(clearance(BEARING_X, 2)).toBeGreaterThan(0); // pillow block half-depth 2
    expect(clearance(MOTOR_CASE_X, MOTOR_CASE_R)).toBeGreaterThan(0);
    expect(clearance(HANDWHEEL_X, 5.1)).toBeGreaterThan(0); // handwheel rim outer radius

    // And the derivation itself is still what it says it is.
    expect(wormLineClearX(2)).toBeCloseTo(Math.sqrt(WHEEL_TIP_R ** 2 - (WHEEL_TIP_R - 2) ** 2), 12);
  });

  it("lays each clamp bar on its own stud instead of inside the other bar", () => {
    // The two bars were WORK_SIZE[2] + 2.4 = 7.4 long -- the length for a single bar on the
    // table's midline -- but centred at +/-1.85, so they shared their entire 2.2 x 1 cross
    // section over 3.7 units of z. Both being the same grey, they rendered as one 11.1-long bar
    // across a 5-deep workpiece: twice the depth of any other parts-inside-parts defect found
    // in this repo, and nothing could report it (props are outside the physics; `classify`
    // compares gear centres).
    const bars = createWormTableProps().filter(
      (p): p is Extract<typeof p, { kind: "box" }> =>
        p.kind === "box" && p.size[0] === 2.2 && p.size[1] === 1,
    );
    expect(bars).toHaveLength(2);
    const [a, b] = bars.sort((p, q) => p.position[2] - q.position[2]);
    expect(a.position[1]).toBe(b.position[1]); // same height, so z is the only separation
    expect(a.position[2] + a.size[2] / 2).toBeLessThanOrEqual(b.position[2] - b.size[2] / 2);

    // Each still reaches in to the workpiece it holds and out over its own stud.
    const studs = createWormTableProps().filter(
      (p): p is Extract<typeof p, { kind: "cylinder" }> =>
        p.kind === "cylinder" && Math.abs(p.position[2]) > 2 && p.position[1] > 11,
    );
    expect(studs.length).toBeGreaterThanOrEqual(2);
    for (const bar of bars) {
      const near = studs.find((st) => Math.sign(st.position[2]) === Math.sign(bar.position[2]));
      expect(near, "a clamp bar with no stud under it").toBeDefined();
      expect(Math.abs(near!.position[2] - bar.position[2])).toBeLessThanOrEqual(bar.size[2] / 2);
    }
  });

  it("wears the worm through in ~29.6 s with the platter in its component, which is why the kinematics tests run wear-off", () => {
    // gearDefs: worm is 80 durability, 1.5/s base, 1.8 load multiplier. `simulation.ts` floods
    // the load multiplier across the whole component, and the platter is a `load`, so
    // 80 / (1.5 * 1.8) = 29.63 s. Asserted rather than merely claimed in the doc comment.
    let layout = createWormTablePreset();
    for (let i = 0; i < 1500; i++) {
      const r = tick(layout, 1 / 60, 1); // wear ON -- the default
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    // 25 s in: 80 - 1.5 * 1.8 * 25 = 12.5 left.
    expect(byId(layout.gears, WORM_ID).durabilityCurrent).toBeCloseTo(12.5, 6);
    expect(byId(layout.gears, WORM_ID).broken).toBe(false);

    for (let i = 0; i < 300; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    // 30 s in: past 29.63, so the worm is gone -- and a broken gear relays nothing, so the table
    // stops with it.
    expect(byId(layout.gears, WORM_ID).broken).toBe(true);
    expect(byId(layout.gears, WHEEL_ID).angularVelocity).toBe(0);
  });
});

describe("createWormTableProps", () => {
  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createWormTablePreset().gears.map((g) => g.id));
    for (const p of createWormTableProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("uses attachTo only -- there is no rack to slide along and no rope to wind", () => {
    const props = createWormTableProps();
    expect(props.filter((p) => p.slideWith)).toHaveLength(0);
    expect(props.filter((p) => p.windWith)).toHaveLength(0);
    expect(props.filter((p) => p.linkTo)).toHaveLength(0);
    expect(props.filter((p) => p.attachTo).length).toBeGreaterThan(0);
  });

  it("hangs asymmetric props on all three moving parts, so every shaft's motion is visible", () => {
    // A disc, cylinder or ring spun about its own axis is pixel-identical every frame -- a bare
    // rotary table would show nothing at all. Each moving part needs something off-axis.
    const props = createWormTableProps();
    for (const id of [WHEEL_ID, WORM_ID, MOTOR_ID]) {
      expect(props.filter((p) => p.attachTo === id).length, id).toBeGreaterThan(0);
    }
    // The table's own props are spread around it (eight T-slots, a datum mark, the clamped job),
    // not bunched at one angle, which is what makes the rotation readable.
    const layout = createWormTablePreset();
    const centre = byId(layout.gears, WHEEL_ID).position;
    const angles = new Set(
      props
        .filter((p) => p.attachTo === WHEEL_ID)
        .filter((p) => Math.hypot(p.position[0] - centre[0], p.position[2] - centre[2]) > 3)
        .map((p) => Math.atan2(p.position[2] - centre[2], p.position[0] - centre[0]).toFixed(4)),
    );
    expect(angles.size).toBeGreaterThanOrEqual(SLOT_COUNT);
  });

  it("centres each attached prop on the axis of the gear that sweeps it", () => {
    // THE TRAP: `attachTo` sweeps a prop about ITS GEAR'S centre (spinAttachedPose:
    // pos = (base - centre) rotated + centre). Anything drawn far from that centre orbits at the
    // offset instead of turning in place -- a clock hand once swept a 52-unit circle out of its
    // tower this way. Everything on the table therefore lives within the table's own radius, and
    // everything on the shaft within the handwheel's.
    const layout = createWormTablePreset();
    const props = createWormTableProps();

    const wheelCentre = byId(layout.gears, WHEEL_ID).position;
    for (const p of props.filter((x) => x.attachTo === WHEEL_ID)) {
      const offset = Math.hypot(p.position[0] - wheelCentre[0], p.position[2] - wheelCentre[2]);
      expect(offset, "table prop radius").toBeLessThanOrEqual(PLATTER_R);
    }

    // The shaft's props turn about the LINE (y = TABLE_Y, z = WORM_MESH_DISTANCE) running along X,
    // so the distance that matters is measured in the YZ plane only -- x is free along the shaft.
    for (const p of props.filter((x) => x.attachTo === WORM_ID || x.attachTo === MOTOR_ID)) {
      const offset = Math.hypot(p.position[1] - TABLE_Y, p.position[2] - WORM_MESH_DISTANCE);
      expect(offset, "shaft prop radius").toBeLessThanOrEqual(HANDWHEEL_R);
    }
  });

  it("gives the concrete, the cast iron and the machined steel their real finishes", () => {
    const props = createWormTableProps();
    const used = new Set(props.map((p) => p.texture).filter(Boolean));
    for (const kind of ["stone", "rust", "metal"]) expect(used.has(kind as never)).toBe(true);
    // Every surface here is a real material -- floor pad, casting, ground steel, brass -- so
    // every prop carries a finish rather than reading as flat colour.
    expect(props.filter((p) => !p.texture)).toHaveLength(0);
  });

  it("stands the table's props on the table, above the wheel's own plate", () => {
    const props = createWormTableProps();
    // The wheel body occupies y = 9 .. 9.4 (GEAR_THICKNESS along +axis), so nothing bolted to the
    // table may sit below its upper face.
    for (const p of props.filter((x) => x.attachTo === WHEEL_ID)) {
      expect(p.position[1], "table prop height").toBeGreaterThanOrEqual(TABLE_Y + 0.4);
    }
  });
});
