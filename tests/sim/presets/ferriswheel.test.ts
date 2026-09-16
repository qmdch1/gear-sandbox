import { describe, it, expect } from "vitest";
import type { Prop } from "../../../src/render/props";
import {
  createFerrisWheelPreset,
  createFerrisWheelProps,
  gondolaAngle,
  GONDOLA_COUNT,
  HUB_X,
  HUB_Y,
  MOTOR_SPEED,
  TOTAL_REDUCTION,
  WHEEL_RADIUS,
} from "../../../src/sim/presets/ferriswheel";
import { evaluatePair, isOverlapping, pitchRadius } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import type { LayoutState } from "../../../src/sim/types";

const MOTOR = "관람차_모터";
const REDUCER = "관람차_감속치차";
const DRIVE_SPROCKET = "관람차_구동스프라켓";
const HUB = "관람차_허브스프라켓";

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Runs the REAL simulation for `ticks` frames at 1/60 s, timeScale 1. */
function run(ticks: number): LayoutState {
  let layout = createFerrisWheelPreset();
  for (let i = 0; i < ticks; i++) {
    const result = tick(layout, 1 / 60, 1);
    layout = { gears: result.gears, remoteLinks: layout.remoteLinks };
  }
  return layout;
}

/** Narrows a Prop to the box variant so `.size` is reachable on filter/find results. */
type BoxProp = Extract<Prop, { kind: "box" }>;
const isBox = (p: Prop): p is BoxProp => p.kind === "box";

describe("createFerrisWheelPreset", () => {
  it("builds exactly four gears with the designed ids, types, teeth, module, axes and positions", () => {
    const layout = createFerrisWheelPreset();
    expect(layout.gears).toHaveLength(4);

    const ids = layout.gears.map((g) => g.id);
    expect(ids).toEqual([MOTOR, REDUCER, DRIVE_SPROCKET, HUB]);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const id of ids) expect(id.startsWith("관람차_")).toBe(true); // globally unique prefix

    const [motor, reducer, drive, hub] = layout.gears;

    expect(motor.type).toBe("crank");
    expect(motor.teeth).toBe(8);
    expect(motor.module).toBe(0.5);
    expect(motor.axis).toEqual([0, 0, 1]);
    expect(motor.position).toEqual([-28, 3, -6]);
    expect(motor.angularVelocity).toBe(MOTOR_SPEED);
    expect(pitchRadius(motor)).toBe(2); // 0.5 * 8 / 2

    expect(reducer.type).toBe("spur");
    expect(reducer.teeth).toBe(32);
    expect(reducer.module).toBe(0.5);
    expect(reducer.axis).toEqual([0, 0, 1]);
    expect(reducer.position).toEqual([-18, 3, -6]);
    expect(pitchRadius(reducer)).toBe(8); // 0.5 * 32 / 2

    expect(drive.type).toBe("sprocket");
    expect(drive.teeth).toBe(10);
    expect(drive.module).toBe(0.5);
    expect(drive.axis).toEqual([0, 0, 1]);
    expect(drive.position).toEqual([-18, 3, -6]); // coincident with the reduction gear, by design
    expect(pitchRadius(drive)).toBe(2.5);

    expect(hub.type).toBe("sprocket");
    expect(hub.teeth).toBe(30);
    expect(hub.module).toBe(0.5);
    expect(hub.axis).toEqual([0, 0, 1]);
    expect(hub.position).toEqual([HUB_X, HUB_Y, -6]);
    expect(pitchRadius(hub)).toBe(7.5);

    // Both sprockets share a module, which is what makes a single chain physically able to
    // run over both (pitch radius scales with tooth count at a fixed chain pitch).
    expect(drive.module).toBe(hub.module);
    // The two meshing gears share a module too -- a real tooth mesh requires it.
    expect(motor.module).toBe(reducer.module);
  });

  it("places the motor pinion at EXACTLY the tooth-mesh centre distance from the reduction gear", () => {
    const layout = createFerrisWheelPreset();
    const [motor, reducer] = layout.gears;
    // pitchRadius(motor) + pitchRadius(reducer) = 2 + 8 = 10, and the centres are 10 apart.
    expect(pitchRadius(motor) + pitchRadius(reducer)).toBe(10);
    expect(distance(motor.position, reducer.position)).toBe(10);
  });

  it("forms real edges via the real evaluatePair: one tooth mesh, one coincident coupling, and nothing spurious", () => {
    const layout = createFerrisWheelPreset();
    const [motor, reducer, drive, hub] = layout.gears;

    // Motor -> reduction gear: a genuine parallel-axis tooth mesh, ratio 8/32.
    const meshEdge = evaluatePair(motor, reducer);
    expect(meshEdge).not.toBeNull();
    expect(meshEdge!.kind).toBe("mesh");
    expect(meshEdge!.ratio).toBe(8 / 32);
    expect(meshEdge!.oneWay).toBe("none");

    // Reduction gear -> drive sprocket: coincident 1:1 shaft coupling (sprocket is a
    // COINCIDENT_ONLY type, so this is the only way it can be driven).
    const couplingEdge = evaluatePair(reducer, drive);
    expect(couplingEdge).not.toBeNull();
    expect(couplingEdge!.kind).toBe("coupling");
    expect(couplingEdge!.ratio).toBe(1);

    // The hub sprocket has NO direct geometric edge to anything -- it is reached purely by
    // the chain RemoteLink, which evaluatePair knows nothing about.
    expect(evaluatePair(drive, hub)).toBeNull();
    expect(evaluatePair(reducer, hub)).toBeNull();
    expect(evaluatePair(motor, hub)).toBeNull();
    // And the motor does not accidentally couple to the sprocket sharing the reducer's shaft.
    expect(evaluatePair(motor, drive)).toBeNull();
  });

  it("declares exactly one chain RemoteLink, from the drive sprocket to the hub sprocket", () => {
    const layout = createFerrisWheelPreset();
    expect(layout.remoteLinks).toEqual([
      { a: DRIVE_SPROCKET, b: HUB, kind: "chain" },
    ]);
  });

  it("builds exactly three edges: mesh 8/32, coupling 1, chain 10/30", () => {
    const layout = createFerrisWheelPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    expect(edges).toHaveLength(3);

    const mesh = edges.find((e) => e.kind === "mesh")!;
    expect([mesh.a, mesh.b].sort()).toEqual([MOTOR, REDUCER].sort());
    expect(mesh.ratio).toBe(8 / 32);

    const coupling = edges.find((e) => e.kind === "coupling")!;
    expect([coupling.a, coupling.b].sort()).toEqual([REDUCER, DRIVE_SPROCKET].sort());
    expect(coupling.ratio).toBe(1);

    const chain = edges.find((e) => e.kind === "chain")!;
    expect(chain.a).toBe(DRIVE_SPROCKET);
    expect(chain.b).toBe(HUB);
    // graph.ts gives a chain link a TOOTH-based ratio (a.teeth / b.teeth), not the
    // radius-based ratio a belt gets.
    expect(chain.ratio).toBe(10 / 30);
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, no overlaps", () => {
    const layout = createFerrisWheelPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const diagnostics = classify(layout.gears, edges);
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("keeps every pair of gears geometrically clear (isOverlapping false for all six pairs)", () => {
    const { gears } = createFerrisWheelPreset();
    let pairsChecked = 0;
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        expect(isOverlapping(gears[i], gears[j])).toBe(false);
        pairsChecked++;
      }
    }
    expect(pairsChecked).toBe(6);
  });

  it("still reports zero diagnostics problems after hundreds of ticks of real simulation", () => {
    const layout = run(900);
    const diagnostics = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(diagnostics.unconnectedIds).toEqual([]);
    expect(diagnostics.noPowerIds).toEqual([]);
    expect(diagnostics.overlapPairs).toEqual([]);
  });

  it("turns the wheel hub at EXACTLY 1/12 the motor's angular speed, reversed, on every tick", () => {
    let layout = createFerrisWheelPreset();
    const expectedHubSpeed = -MOTOR_SPEED / TOTAL_REDUCTION; // -0.2 rad/s

    for (let i = 0; i < 900; i++) {
      const result = tick(layout, 1 / 60, 1);
      layout = { gears: result.gears, remoteLinks: layout.remoteLinks };

      const motor = layout.gears.find((g) => g.id === MOTOR)!;
      const reducer = layout.gears.find((g) => g.id === REDUCER)!;
      const drive = layout.gears.find((g) => g.id === DRIVE_SPROCKET)!;
      const hub = layout.gears.find((g) => g.id === HUB)!;

      // The crank's commanded input never changes (no reverseAt -- the wheel runs on).
      expect(motor.angularVelocity).toBe(MOTOR_SPEED);
      // Stage 1: 8/32 tooth mesh, sign -1.
      expect(reducer.angularVelocity).toBeCloseTo(-MOTOR_SPEED * (8 / 32), 12);
      // Stage 2: coincident coupling, sign +1, ratio 1 -- same shaft, same speed.
      expect(drive.angularVelocity).toBe(reducer.angularVelocity);
      // Stage 3: chain, sign +1, ratio 10/30.
      expect(hub.angularVelocity).toBeCloseTo(drive.angularVelocity * (10 / 30), 12);
      // Net: 12:1 speed reduction, opposite direction to the motor.
      expect(hub.angularVelocity).toBeCloseTo(expectedHubSpeed, 12);
      expect(Math.sign(hub.angularVelocity)).toBe(-Math.sign(motor.angularVelocity));

      for (const g of layout.gears) expect(g.broken).toBe(false);
    }

    // 900 ticks at 1/60 s = 15 s of running.
    const motor = layout.gears.find((g) => g.id === MOTOR)!;
    const hub = layout.gears.find((g) => g.id === HUB)!;
    expect(motor.rotation).toBeCloseTo(MOTOR_SPEED * 15, 6); // 36 rad
    expect(hub.rotation).toBeCloseTo(expectedHubSpeed * 15, 6); // -3 rad
    // The ratio the whole preset exists to demonstrate, measured from accumulated rotation
    // rather than from instantaneous speed.
    expect(motor.rotation / hub.rotation).toBeCloseTo(-TOTAL_REDUCTION, 6);

    // Everything actually turned -- nothing stalled at rotation 0.
    for (const g of layout.gears) expect(Math.abs(g.rotation)).toBeGreaterThan(0);
  });

  it("completes one full wheel revolution in about 31.4 seconds, and keeps turning past it", () => {
    const period = (Math.PI * 2) / (MOTOR_SPEED / TOTAL_REDUCTION);
    expect(period).toBeCloseTo(31.4159, 3);

    // 2100 ticks = 35 s, comfortably past one revolution (and far short of the ~100 s at
    // which the spur gear's 1.0/s wear against its 100 durability would break it).
    const layout = run(2100);
    const hub = layout.gears.find((g) => g.id === HUB)!;
    expect(Math.abs(hub.rotation)).toBeGreaterThan(Math.PI * 2);
    expect(Math.abs(hub.rotation)).toBeCloseTo((MOTOR_SPEED / TOTAL_REDUCTION) * 35, 6);
    for (const g of layout.gears) expect(g.broken).toBe(false);
  });

  it("bounds nothing, because nothing in this machine has limited travel", () => {
    const layout = createFerrisWheelPreset();
    // A ferris wheel turns continuously: no crank reciprocates, and there is no rack whose
    // linear travel could run away out of the scene.
    for (const g of layout.gears) {
      expect(g.reverseAt).toBeUndefined();
      expect(g.travelLimit).toBeUndefined();
      expect(g.type).not.toBe("rack");
      expect(g.linearPosition).toBeUndefined();
    }
  });
});

describe("createFerrisWheelProps", () => {
  const props = createFerrisWheelProps();
  const layout = createFerrisWheelPreset();
  const gearIds = new Set(layout.gears.map((g) => g.id));

  it("names only real gear ids in every motion binding", () => {
    const attached = props.filter((p) => p.attachTo);
    expect(attached.length).toBeGreaterThan(20);
    for (const p of attached) expect(gearIds.has(p.attachTo!)).toBe(true);

    // This machine drives its body entirely through `attachTo` -- there is no rack to slide
    // with, no drum to wind on, and no crank-slider linkage.
    expect(props.filter((p) => p.slideWith)).toHaveLength(0);
    expect(props.filter((p) => p.windWith)).toHaveLength(0);
    expect(props.filter((p) => p.linkTo)).toHaveLength(0);
  });

  it("gives every prop a surface texture and sensible metalness/roughness", () => {
    expect(props.length).toBeGreaterThan(40);
    for (const p of props) {
      expect(p.texture).toBeDefined();
      expect(p.metalness).toBeGreaterThanOrEqual(0);
      expect(p.metalness).toBeLessThanOrEqual(1);
      expect(p.roughness).toBeGreaterThan(0);
      expect(p.roughness).toBeLessThanOrEqual(1);
    }
    const kinds = new Set(props.map((p) => p.texture));
    expect(kinds.has("metal")).toBe(true);  // frame, spokes, axle
    expect(kinds.has("fabric")).toBe(true); // gondola canopies
    expect(kinds.has("wood")).toBe(true);   // boarding platform, gondola bodies
    expect(kinds.has("stone")).toBe(true);  // concrete pad
    expect(kinds.has("rust")).toBe(true);   // motor housing
  });

  it("hangs GONDOLA_COUNT gondolas on the rim, all attached to the hub sprocket", () => {
    // Each gondola contributes a canvas canopy; count those to count gondolas.
    const canopies = props.filter((p) => p.texture === "fabric");
    expect(canopies).toHaveLength(GONDOLA_COUNT);
    for (const c of canopies) expect(c.attachTo).toBe(HUB);

    // Every gondola's pivot lies exactly on the rim circle, and its four parts hang at
    // exactly the designed offsets below it: pivot shaft at 0, hanger at -1.3, car body at
    // -3.4, canopy at -2.0 (the canopy caps the body, whose roof line is -3.4 + 1.1 = -2.3).
    for (let i = 0; i < GONDOLA_COUNT; i++) {
      const a = gondolaAngle(i);
      const px = HUB_X + Math.cos(a) * WHEEL_RADIUS;
      const py = HUB_Y + Math.sin(a) * WHEEL_RADIUS;
      // (Not `expect(hypot(px - HUB_X, py - HUB_Y)).toBeCloseTo(WHEEL_RADIUS)`, which this test
      // used to open with: px and py are computed two lines above AS hub + cos/sin * radius, so
      // that reduced to hypot(cos(a)*R, sin(a)*R) == R -- true for every angle and every radius,
      // and reading nothing at all from createFerrisWheelProps. The rim claim is only worth
      // making about a prop the preset actually placed, which is what the lookup below does.)

      for (const drop of [0, 1.3, 3.4, 2.0]) {
        const part = props.find(
          (p) =>
            p.attachTo === HUB &&
            Math.abs(p.position[0] - px) < 1e-9 &&
            Math.abs(p.position[1] - (py - drop)) < 1e-9 &&
            p.position[2] === 0,
        );
        expect(part, `gondola ${i} part at drop ${drop}`).toBeDefined();
        // The pivot shaft (drop 0) is the part that must sit ON the rim circle. Measured from
        // the prop's own position, so moving a gondola off the rim fails here.
        if (drop === 0) {
          expect(
            Math.hypot(part!.position[0] - HUB_X, part!.position[1] - HUB_Y),
          ).toBeCloseTo(WHEEL_RADIUS, 9);
        }
      }
    }

    // Gondola bodies are timber.
    const bodies = props.filter((p) => p.kind === "box" && p.texture === "wood" && p.attachTo === HUB);
    expect(bodies).toHaveLength(GONDOLA_COUNT);
  });

  it("spans hub to rim with metal spokes in both rim planes, so the rotation actually reads", () => {
    const spokes = props.filter(
      (p) => p.kind === "box" && p.attachTo === HUB && p.size[0] === WHEEL_RADIUS,
    );
    expect(spokes).toHaveLength(GONDOLA_COUNT * 2); // one set per rim plane
    for (const s of spokes) {
      expect(s.texture).toBe("metal");
      // A spoke's midpoint sits at half the wheel radius from the wheel centre, which is
      // exactly what a hub -> rim bar of length WHEEL_RADIUS requires.
      const r = Math.hypot(s.position[0] - HUB_X, s.position[1] - HUB_Y);
      expect(r).toBeCloseTo(WHEEL_RADIUS / 2, 10);
      expect(Math.abs(s.position[2])).toBeCloseTo(3.5, 10);
    }
    // Two rims plus two inner tension rings, all on the hub.
    const rings = props.filter((p) => p.kind === "ring");
    expect(rings).toHaveLength(4);
    for (const r of rings) expect(r.attachTo).toBe(HUB);
  });

  it("actually MOVES every attached prop when the hub turns (none sits on the rotation axis)", () => {
    // After 900 ticks the hub has turned -3 rad. spinAttachedPose rotates an attached prop
    // about the hub's axis (+Z) around the hub's centre, so a prop at radius r from the
    // wheel's centre line is displaced by |2 r sin(theta/2)| -- reproduced here in plain
    // arithmetic rather than trusting the renderer.
    const turned = run(900);
    const hub = turned.gears.find((g) => g.id === HUB)!;
    const theta = hub.rotation;
    expect(Math.abs(theta)).toBeCloseTo(3, 6);

    const hubAttached = props.filter((p) => p.attachTo === HUB);
    expect(hubAttached.length).toBeGreaterThan(20);
    let maxDisplacement = 0;
    for (const p of hubAttached) {
      const r = Math.hypot(p.position[0] - HUB_X, p.position[1] - HUB_Y);
      const displacement = Math.abs(2 * r * Math.sin(theta / 2));
      // A ring is rotationally symmetric about the hub, so its own centre never moves --
      // every OTHER attached prop must.
      if (p.kind !== "ring") {
        expect(r).toBeGreaterThan(0.5);
        expect(displacement).toBeGreaterThan(0.5);
      }
      maxDisplacement = Math.max(maxDisplacement, displacement);
    }
    // The outermost props (rim lamps at radius 16.9) sweep a long way.
    expect(maxDisplacement).toBeGreaterThan(20);

    // The gearbox bars turn too, about their own gear.
    const gearBars = props.filter((p) => p.attachTo === REDUCER);
    expect(gearBars).toHaveLength(3);
    const reducer = turned.gears.find((g) => g.id === REDUCER)!;
    expect(Math.abs(reducer.rotation)).toBeGreaterThan(1);
  });

  it("stands the structure on the ground and puts a timber boarding platform in front of the wheel", () => {
    // A-frame legs: four long metal struts, none attached to a gear (the frame is static).
    const legs = props.filter(
      (p): p is BoxProp => isBox(p) && !p.attachTo && p.size[1] > 30 && p.texture === "metal",
    );
    expect(legs).toHaveLength(4);
    for (const leg of legs) {
      // sqrt(14^2 + 28^2) = sqrt(980)
      expect(leg.size[1]).toBeCloseTo(Math.sqrt(980), 10);
      expect(Math.abs(leg.position[2])).toBe(9);
    }

    // The boarding deck: a wide timber slab standing clear of the gondolas' z footprint
    // (they are only 2.5 deep either side of z = 0) and clear of the A-frame legs in x.
    const deck = props.find(
      (p): p is BoxProp => isBox(p) && p.texture === "wood" && !p.attachTo && p.size[0] === 16 && p.size[2] === 8,
    )!;
    expect(deck).toBeDefined();
    expect(deck.position[2] - deck.size[2] / 2).toBeGreaterThanOrEqual(2.5); // near edge at z = 3
    // Leg x at the deck's top face (y = 3.2) is 14 * (22 - 3.2) / 28 = 9.4; the deck's
    // half-width of 8 clears it.
    expect(deck.size[0] / 2).toBeLessThan((14 * (22 - 3.2)) / 28);

    // Everything rests on one concrete pad.
    const pad = props.find((p) => p.texture === "stone")!;
    expect(pad).toBeDefined();
    expect(pad.kind).toBe("box");
  });

  it("occupies the bounding extent reported to the showroom: 52 wide (X) x 28 deep (Z) x 48 tall (Y)", () => {
    // Every rotation used in this preset is about a single axis, so a plain Euler-XYZ
    // matrix reproduces it exactly regardless of THREE's composition order. The AABB of a
    // rotated box is then the standard halfExtent_i = sum_j |R[i][j]| * halfSize_j.
    function rotationMatrix(r: [number, number, number]): number[][] {
      const [x, y, z] = r;
      const cx = Math.cos(x), sx = Math.sin(x);
      const cy = Math.cos(y), sy = Math.sin(y);
      const cz = Math.cos(z), sz = Math.sin(z);
      const rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
      const ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
      const rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
      const mul = (a: number[][], b: number[][]) =>
        a.map((row, i) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
      return mul(mul(rx, ry), rz);
    }

    /** The prop's local half-size box, before rotation, matching what `buildPropMesh`
     *  actually constructs in `render/props.ts`. */
    function localHalfSize(p: (typeof props)[number]): [number, number, number] {
      switch (p.kind) {
        case "box": return [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
        // A THREE cylinder/cone's long axis is local Y; radius spans X and Z.
        case "cylinder": return [p.radius, p.height / 2, p.radius];
        case "cone": return [p.radius, p.height / 2, p.radius];
        // A THREE torus lies in the local XY plane; only the tube reaches along Z.
        case "ring": return [p.radius + p.tube, p.radius + p.tube, p.tube];
        case "sphere": return [p.radius, p.radius, p.radius];
      }
    }

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const p of props) {
      const h = localHalfSize(p);
      const R = rotationMatrix(p.rotation ?? [0, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const half = Math.abs(R[i][0]) * h[0] + Math.abs(R[i][1]) * h[1] + Math.abs(R[i][2]) * h[2];
        min[i] = Math.min(min[i], p.position[i] - half);
        max[i] = Math.max(max[i], p.position[i] + half);
      }
    }
    // The gears themselves too: a gear disc reaches its pitch radius in the plane
    // perpendicular to its axis (all four here share the axis +Z).
    for (const g of layout.gears) {
      const r = pitchRadius(g);
      min[0] = Math.min(min[0], g.position[0] - r);
      max[0] = Math.max(max[0], g.position[0] + r);
      min[1] = Math.min(min[1], g.position[1] - r);
      max[1] = Math.max(max[1], g.position[1] + r);
      min[2] = Math.min(min[2], g.position[2]);
      max[2] = Math.max(max[2], g.position[2]);
    }

    // The concrete pad sets the X and Z footprint; the rim's outer edge sets the height.
    expect(min[0]).toBeCloseTo(-32, 6);
    expect(max[0]).toBeCloseTo(20, 6);
    expect(max[0] - min[0]).toBeCloseTo(52, 6);

    expect(min[1]).toBeCloseTo(-7.4, 6);
    expect(max[1]).toBeCloseTo(HUB_Y + WHEEL_RADIUS + 0.55, 6); // rim centre-line + tube = 40.55
    expect(max[1] - min[1]).toBeCloseTo(47.95, 6);

    expect(min[2]).toBeCloseTo(-12.5, 6);
    expect(max[2]).toBeCloseTo(15.5, 6);
    expect(max[2] - min[2]).toBeCloseTo(28, 6);
  });
});
