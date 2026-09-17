import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createPistonEnginePreset,
  createPistonEngineProps,
  BORE_PITCH,
  BORE_X,
  CRANK_ID,
  CRANK_PIN_RADIUS,
  CRANK_SPEED,
  CRANK_X,
  CRANKPIN_IDS,
  CYLINDER_PHASES,
  ENGINE_MODULE,
  ENGINE_PITCH_RADIUS,
  ENGINE_TEETH,
  FLYWHEEL_ID,
  PISTON_BDC_Y,
  PISTON_STROKE,
  PISTON_TDC_Y,
  ROD_LENGTH,
} from "../../../src/sim/presets/pistonengine";
import { evaluatePair, isOverlapping, pitchRadius } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";
import { crankSliderPose } from "../../../src/render/sceneSync";
import type { LayoutState } from "../../../src/sim/types";

/** Runs the REAL crank-slider solver for one cylinder at a given wheel rotation, exactly as
 *  `SceneSync.updateLinkedProps` would: the wheel's own centre and axis, the preset's throw
 *  radius and rod length, and the vertical slide axis every cylinder in this engine uses. */
function solveCylinder(boreX: number, rotation: number) {
  const out = {
    pin: new THREE.Vector3(),
    slider: new THREE.Vector3(),
    rodMid: new THREE.Vector3(),
    rodQuat: new THREE.Quaternion(),
  };
  crankSliderPose(
    new THREE.Vector3(boreX, 0, 0),
    new THREE.Vector3(0, 0, 1),
    rotation,
    CRANK_PIN_RADIUS,
    ROD_LENGTH,
    new THREE.Vector3(0, 1, 0),
    out,
  );
  return out;
}

/** Closed-form piston height for this linkage, derived in the preset's doc comment:
 *  s(t) = R sin t + sqrt(L^2 - R^2 cos^2 t). Used to check the solver against the algebra. */
function pistonHeight(rotation: number): number {
  return (
    CRANK_PIN_RADIUS * Math.sin(rotation) +
    Math.sqrt(ROD_LENGTH ** 2 - (CRANK_PIN_RADIUS * Math.cos(rotation)) ** 2)
  );
}

function run(ticks: number): LayoutState {
  let layout = createPistonEnginePreset();
  for (let i = 0; i < ticks; i++) {
    const r = tick(layout, 1 / 60, 1);
    layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
  }
  return layout;
}

const byId = (layout: LayoutState, id: string) => layout.gears.find((g) => g.id === id)!;

describe("createPistonEnginePreset", () => {
  it("builds 6 gears -- 1 hand crank, 1 flywheel, 4 crankpin wheels -- with unique 피스톤엔진_ ids", () => {
    const layout = createPistonEnginePreset();
    expect(layout.gears).toHaveLength(6);
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "피스톤엔진_크랭크축",
      "피스톤엔진_플라이휠",
      "피스톤엔진_1번크랭크핀",
      "피스톤엔진_2번크랭크핀",
      "피스톤엔진_3번크랭크핀",
      "피스톤엔진_4번크랭크핀",
    ]);
    for (const id of ids) expect(id.startsWith("피스톤엔진_")).toBe(true);
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(1);
  });

  it("places every wheel at its derived position, on axis +Z, as an identical 16-tooth wheel", () => {
    const layout = createPistonEnginePreset();

    // Bore positions come straight out of the pitch: 14 * (i - 1.5).
    expect(BORE_X).toEqual([-21, -7, 7, 21]);
    expect(BORE_PITCH).toBe(14);
    expect(ENGINE_PITCH_RADIUS).toBe(6); // 0.75 * 16 / 2

    for (const g of layout.gears) {
      expect(g.axis).toEqual([0, 0, 1]); // whole mechanism works in the XY plane, facing the viewer
      expect(g.teeth).toBe(ENGINE_TEETH);
      expect(g.module).toBe(ENGINE_MODULE);
      expect(pitchRadius(g)).toBe(ENGINE_PITCH_RADIUS);
      expect(g.position[1]).toBe(0); // one straight crank line
      expect(g.position[2]).toBe(0);
    }

    const crank = byId(layout, CRANK_ID);
    expect(crank.type).toBe("crank");
    expect(crank.position).toEqual([CRANK_X, 0, 0]);
    expect(CRANK_X).toBe(-40);
    expect(crank.angularVelocity).toBe(CRANK_SPEED);
    // A continuously running engine, so no reciprocation bound -- the pistons are bounded by
    // the linkage itself (asserted below), not by reversing the crank.
    expect(crank.reverseAt).toBeUndefined();

    const flywheel = byId(layout, FLYWHEEL_ID);
    expect(flywheel.type).toBe("sprocket");
    expect(flywheel.position).toEqual([CRANK_X, 0, 0]); // coincident with the crank, by design

    CRANKPIN_IDS.forEach((id, i) => {
      const pin = byId(layout, id);
      expect(pin.type).toBe("sprocket");
      expect(pin.position).toEqual([BORE_X[i], 0, 0]);
      // Flat-plane crank: 1 and 4 up, 2 and 3 down.
      expect(pin.rotation).toBe(CYLINDER_PHASES[i]);
    });
    expect(CYLINDER_PHASES).toEqual([0, Math.PI, Math.PI, 0]);
  });

  it("forms exactly the intended edges through the real evaluatePair -- one coupling, four chains, nothing accidental", () => {
    const layout = createPistonEnginePreset();
    const crank = byId(layout, CRANK_ID);
    const flywheel = byId(layout, FLYWHEEL_ID);

    // The only direct (geometric) edge in the whole layout: the flywheel bolted to the
    // crank nose, coincident position + parallel axis => 1:1 coupling.
    const coupling = evaluatePair(crank, flywheel);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);

    // Nothing else touches directly: the crank line is spaced 14 apart, which is outside
    // the 12 +/- 5% (11.4 .. 12.6) window a real tooth mesh would need, so no pair of
    // wheels is accidentally meshed and none of them overlaps either.
    for (let i = 0; i < layout.gears.length; i++) {
      for (let j = i + 1; j < layout.gears.length; j++) {
        const a = layout.gears[i];
        const b = layout.gears[j];
        const isCouplingPair =
          (a.id === CRANK_ID && b.id === FLYWHEEL_ID) || (a.id === FLYWHEEL_ID && b.id === CRANK_ID);
        if (!isCouplingPair) expect(evaluatePair(a, b)).toBeNull();
        expect(isOverlapping(a, b)).toBe(false);
      }
    }

    // Neighbouring wheels really are 14 apart, i.e. 2.6 clear of the 11.4 overlap threshold.
    for (let i = 0; i < CRANKPIN_IDS.length - 1; i++) {
      const gap = BORE_X[i + 1] - BORE_X[i];
      expect(gap).toBe(BORE_PITCH);
      expect(gap).toBeGreaterThan(2 * ENGINE_PITCH_RADIUS * 0.95);
    }

    // Four chain links down the crankcase, every one of them 16:16 = ratio 1.
    expect(layout.remoteLinks).toHaveLength(4);
    expect(layout.remoteLinks.every((l) => l.kind === "chain")).toBe(true);
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    expect(edges).toHaveLength(5);
    const chainEdges = edges.filter((e) => e.kind === "chain");
    expect(chainEdges).toHaveLength(4);
    for (const e of chainEdges) expect(e.ratio).toBe(1);
  });

  it("reports zero diagnostics problems -- everything connected, everything powered, nothing overlapping", () => {
    const layout = createPistonEnginePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("turns every crankpin wheel at EXACTLY the hand crank's speed, same direction, for hundreds of ticks", () => {
    let layout = createPistonEnginePreset();
    for (let i = 0; i < 700; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      // Coupling and chain edges both use sign +1 in propagateRotation, and every ratio in
      // this layout is exactly 1, so the whole crank line is locked to the input speed --
      // the kinematics of one solid crankshaft, which is the claim this preset makes.
      for (const g of layout.gears) {
        expect(g.angularVelocity).toBe(CRANK_SPEED);
        expect(Math.sign(g.angularVelocity)).toBe(Math.sign(CRANK_SPEED));
        expect(g.broken).toBe(false);
      }
    }
    for (const g of layout.gears) expect(Math.abs(g.rotation)).toBeGreaterThan(0);

    // 700 ticks at 1/60 s and 1.2 rad/s => 14 rad, a bit over two full revolutions.
    const crank = byId(layout, CRANK_ID);
    expect(crank.rotation).toBeCloseTo((700 / 60) * CRANK_SPEED, 6);
    expect(crank.rotation / (Math.PI * 2)).toBeGreaterThan(2);
  });

  it("holds the flat-plane crank timing exactly: 1 and 4 together, 2 and 3 half a revolution behind", () => {
    let layout = createPistonEnginePreset();
    for (let i = 0; i < 700; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      const rotations = CRANKPIN_IDS.map((id) => byId(layout, id).rotation);
      // No edge here is a tooth "mesh", so simulation.ts never applies a phase correction:
      // every wheel is just phase + speed * t, and the seeded offsets survive untouched.
      expect(rotations[0]).toBe(rotations[3]); // cylinders 1 and 4 share a throw
      expect(rotations[1]).toBe(rotations[2]); // cylinders 2 and 3 share the opposite throw
      expect(Math.abs(rotations[1] - rotations[0] - Math.PI)).toBeLessThan(1e-9);
    }
  });

  it("reciprocates every piston over a stroke of exactly 8, bounded inside its own bore, via the real crankSliderPose", () => {
    // The linkage can only close if the rod is longer than the throw -- otherwise
    // crankSliderPose's discriminant clamps at 0 and the piston sticks.
    expect(ROD_LENGTH).toBeGreaterThan(CRANK_PIN_RADIUS);
    expect(PISTON_BDC_Y).toBe(9); // 13 - 4
    expect(PISTON_TDC_Y).toBe(17); // 13 + 4
    expect(PISTON_STROKE).toBe(8); // 2 * throw radius

    let layout = createPistonEnginePreset();
    const lo = BORE_X.map(() => Infinity);
    const hi = BORE_X.map(() => -Infinity);
    let sawUp = false;
    let sawDown = false;
    let previous = solveCylinder(BORE_X[0], byId(layout, CRANKPIN_IDS[0]).rotation).slider.y;

    for (let t = 0; t < 700; t++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      for (let i = 0; i < BORE_X.length; i++) {
        const rotation = byId(layout, CRANKPIN_IDS[i]).rotation;
        const { pin, slider } = solveCylinder(BORE_X[i], rotation);

        // Rigid members: the pin stays on its throw circle, the rod keeps its length.
        expect(pin.distanceTo(new THREE.Vector3(BORE_X[i], 0, 0))).toBeCloseTo(CRANK_PIN_RADIUS, 9);
        expect(pin.distanceTo(slider)).toBeCloseTo(ROD_LENGTH, 9);

        // The piston never leaves its own bore centreline...
        expect(slider.x).toBeCloseTo(BORE_X[i], 9);
        expect(slider.z).toBeCloseTo(0, 9);
        // ...and never leaves its bore, in either direction, no matter how long it runs.
        expect(slider.y).toBeGreaterThanOrEqual(PISTON_BDC_Y - 1e-9);
        expect(slider.y).toBeLessThanOrEqual(PISTON_TDC_Y + 1e-9);
        // The solver agrees with the closed form derived in the preset's doc comment.
        expect(slider.y).toBeCloseTo(pistonHeight(rotation), 9);

        lo[i] = Math.min(lo[i], slider.y);
        hi[i] = Math.max(hi[i], slider.y);
      }

      const y0 = solveCylinder(BORE_X[0], byId(layout, CRANKPIN_IDS[0]).rotation).slider.y;
      if (y0 > previous) sawUp = true;
      if (y0 < previous) sawDown = true;
      previous = y0;
    }

    // Over two-plus revolutions each piston actually sweeps its whole stroke (sampling is
    // discrete, so the dead centres are approached to within ~2e-4, not hit exactly).
    expect(sawUp).toBe(true);
    expect(sawDown).toBe(true);
    for (let i = 0; i < BORE_X.length; i++) {
      expect(lo[i]).toBeCloseTo(PISTON_BDC_Y, 3);
      expect(hi[i]).toBeCloseTo(PISTON_TDC_Y, 3);
      expect(hi[i] - lo[i]).toBeCloseTo(PISTON_STROKE, 3);
    }
  });

  it("runs cylinders 1/4 against 2/3: when the outer pair is at top dead centre the inner pair is at bottom", () => {
    let layout = createPistonEnginePreset();
    let bestGap = -Infinity;
    let atOuterTop: { outer: number; inner: number } = { outer: 0, inner: 0 };

    for (let t = 0; t < 700; t++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const ys = CRANKPIN_IDS.map((id, i) => solveCylinder(BORE_X[i], byId(layout, id).rotation).slider.y);

      // Same-throw cylinders move identically; opposite-throw cylinders differ by exactly
      // 2 R sin(t), the algebraic consequence of the pi phase offset. (Their WHEEL rotations
      // are bit-identical -- asserted exactly in the timing test above -- but the solver runs
      // each cylinder at its own bore x, so the resulting heights can land a single ULP
      // apart; hence toBeCloseTo rather than Object.is here.)
      expect(ys[0]).toBeCloseTo(ys[3], 9);
      expect(ys[1]).toBeCloseTo(ys[2], 9);
      const rotation = byId(layout, CRANKPIN_IDS[0]).rotation;
      expect(ys[0] - ys[1]).toBeCloseTo(2 * CRANK_PIN_RADIUS * Math.sin(rotation), 9);

      if (ys[0] - ys[1] > bestGap) {
        bestGap = ys[0] - ys[1];
        atOuterTop = { outer: ys[0], inner: ys[1] };
      }
    }

    // At the sampled instant the outer pair is highest, it is at TDC and the inner pair is
    // at BDC -- a full stroke apart.
    expect(atOuterTop.outer).toBeCloseTo(PISTON_TDC_Y, 3);
    expect(atOuterTop.inner).toBeCloseTo(PISTON_BDC_Y, 3);
    expect(atOuterTop.outer - atOuterTop.inner).toBeCloseTo(PISTON_STROKE, 3);
  });
});

describe("createPistonEngineProps", () => {
  const props = createPistonEngineProps();
  const layout = createPistonEnginePreset();
  const gearIds = new Set(layout.gears.map((g) => g.id));

  it("only ever names gears that actually exist in the layout", () => {
    for (const p of props) {
      if (p.attachTo) expect(gearIds.has(p.attachTo)).toBe(true);
      if (p.slideWith) expect(gearIds.has(p.slideWith)).toBe(true);
      if (p.windWith) expect(gearIds.has(p.windWith.gear)).toBe(true);
      if (p.linkTo) expect(gearIds.has(p.linkTo.gear)).toBe(true);
    }
  });

  it("gives every prop a texture and a deliberate metalness/roughness", () => {
    expect(props.length).toBeGreaterThan(20);
    for (const p of props) {
      expect(p.texture).toBeDefined();
      expect(p.metalness).toBeGreaterThan(0);
      expect(p.roughness).toBeGreaterThan(0);
    }
    const kinds = new Set(props.map((p) => p.texture));
    expect(kinds.has("metal")).toBe(true); // machined block, head, pistons, rods, flywheel
    expect(kinds.has("rust")).toBe(true); // bolts, sump, crank throws
  });

  it("drives all four cylinders through crank-slider linkages, each on its own crankpin wheel", () => {
    const linked = props.filter((p) => p.linkTo);
    const sliders = linked.filter((p) => p.linkTo!.role === "slider");
    const rods = linked.filter((p) => p.linkTo!.role === "rod");
    const pins = linked.filter((p) => p.linkTo!.role === "pin");

    expect(rods).toHaveLength(4); // one connecting rod per cylinder
    expect(pins).toHaveLength(4); // one crankpin boss per cylinder
    expect(sliders).toHaveLength(8); // piston + its piston ring, per cylinder

    // Every cylinder rides its OWN wheel -- the whole reason the crankshaft is modelled as
    // a chain-tied line of wheels rather than one gear.
    expect(new Set(rods.map((p) => p.linkTo!.gear))).toEqual(new Set(CRANKPIN_IDS));
    for (let i = 0; i < CRANKPIN_IDS.length; i++) {
      const perCylinder = linked.filter((p) => p.linkTo!.gear === CRANKPIN_IDS[i]);
      expect(perCylinder).toHaveLength(4); // piston, ring, rod, pin
    }

    for (const p of linked) {
      // Without this the linkage cannot close and the solver clamps to a stuck piston.
      expect(p.linkTo!.rodLength).toBeGreaterThan(p.linkTo!.crankRadius);
      expect(p.linkTo!.rodLength).toBe(ROD_LENGTH);
      expect(p.linkTo!.crankRadius).toBe(CRANK_PIN_RADIUS);
      // Vertical bores, and the slide axis is not parallel to the wheels' own [0,0,1] axis.
      expect(p.linkTo!.slideAxis).toEqual([0, 1, 0]);
    }

    // A rod prop's authored length must equal rodLength: SceneSync re-orients it to span
    // pin -> piston but never rescales it.
    for (const rod of rods) {
      expect(rod.kind).toBe("cylinder");
      if (rod.kind === "cylinder") expect(rod.height).toBe(ROD_LENGTH);
    }

    // The pistons are authored on their bore centrelines, matching where the solver puts
    // them at runtime.
    const pistonXs = sliders.map((p) => p.position[0]).sort((a, b) => a - b);
    expect(pistonXs).toEqual([...BORE_X, ...BORE_X].sort((a, b) => a - b));
  });

  it("makes the flywheel's spin readable with bars, a rim and orbiting bolts on the crank", () => {
    const spinning = props.filter((p) => p.attachTo === CRANK_ID);
    // Disc + rim + 3 cross bars + 6 rim bolts.
    expect(spinning.length).toBe(11);
    // A bare disc is symmetric about its spin axis; the bars and bolts are what actually
    // show rotation.
    expect(spinning.filter((p) => p.kind === "box").length).toBe(3);
    expect(spinning.filter((p) => p.kind === "ring").length).toBe(1);
    for (const p of spinning) {
      // Everything on the flywheel is centred on the crank's own x, so it spins in place
      // instead of orbiting off somewhere (spinAttachedPose rotates about the gear centre).
      expect(Math.abs(p.position[0] - CRANK_X)).toBeLessThanOrEqual(9.5);
    }
  });

  it("builds a cutaway block: crankcase, webs between the bores, deck and cover", () => {
    const boxes = props.filter((p) => p.kind === "box" && !p.linkTo && !p.attachTo);
    expect(boxes.length).toBeGreaterThanOrEqual(10); // floor, back wall, deck, cover, sump, 5 webs, 2 feet
    // Block webs stand between and outside the bores, never through one.
    const webs = boxes.filter((p) => p.kind === "box" && p.size[1] > 12 && p.position[1] > 5);
    expect(webs).toHaveLength(5);
    for (const web of webs) {
      for (const bore of BORE_X) {
        expect(Math.abs(web.position[0] - bore)).toBeGreaterThan(4.9); // clear of a 3.9-radius piston
      }
    }

    // The deck and the cover are two of the four parts this test's NAME promises, and the two
    // that close the tops of the bores -- and nothing used to locate them. The only assertion
    // that could have noticed was `boxes.length >= 10` against the 12 the comment enumerates:
    // exactly two units of slack, which is precisely enough to delete both. Measured: deleting
    // the head deck and the rocker cover left all thirteen tests in this file green, with the
    // head bolts and spark plugs floating over open bores.
    const wide = boxes.filter((p) => p.kind === "box" && p.size[0] > 40 && p.position[1] > 15);
    expect(wide).toHaveLength(2); // the deck, and the cover on top of it

    const [deck, cover] = wide.sort((a, b) => a.position[1] - b.position[1]) as Array<
      Extract<(typeof props)[number], { kind: "box" }>
    >;
    // The cover sits on the deck, not floating above it or sunk through it.
    expect(cover.position[1] - cover.size[1] / 2).toBeCloseTo(deck.position[1] + deck.size[1] / 2, 6);
    // And the deck's UNDERSIDE -- the face a piston would strike, not its centre line --
    // stands clear of the crown at top dead centre.
    const crownAtTdc = PISTON_TDC_Y + 2.5;
    expect(deck.position[1] - deck.size[1] / 2).toBeGreaterThan(crownAtTdc);
  });

  it("stands every spark plug where it can actually be seen", () => {
    // All four were drawn inside the rocker cover: 2.2 of each plug's 2.6 units of height sat
    // inside an opaque box, another 0.35 inside the deck, leaving a 0.05 sliver between them.
    // Four plugs modelled and none of them visible. Props are not in the physics, so nothing in
    // the simulation could report it.
    const props = createPistonEngineProps();
    const plugs = props.filter((p) => p.kind === "cylinder" && p.radius === 0.75) as Array<
      Extract<(typeof props)[number], { kind: "cylinder" }>
    >;
    expect(plugs.length).toBe(BORE_X.length);

    const cover = props.filter((p) => p.kind === "box" && p.size[0] > 40 && p.position[1] > 15)
      .sort((a: any, b: any) => b.position[1] - a.position[1])[0] as Extract<
      (typeof props)[number],
      { kind: "box" }
    >;
    for (const plug of plugs) {
      const zGap = Math.abs(plug.position[2] - cover.position[2]) - cover.size[2] / 2 - plug.radius;
      const yGap = plug.position[1] - plug.height / 2 - (cover.position[1] + cover.size[1] / 2);
      // Clear of the cover in z (standing beside it) or in y (standing proud of it).
      expect(Math.max(zGap, yGap)).toBeGreaterThan(0);
    }
  });
});
