import { describe, it, expect } from "vitest";
import * as C from "../../../src/sim/presets/capstan";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { buildDirectedAdjacency } from "../../../src/sim/adjacency";
import { tick } from "../../../src/sim/simulation";
import { depthBelowGround } from "../../../src/sim/ground";

const preset = () => C.createCapstanPreset();
const byId = (id: string) => preset().gears.find((g) => g.id === id)!;

describe("createCapstanPreset", () => {
  it("builds the bars, the ratchet wheel they drive, and the drum keyed to it", () => {
    const layout = preset();
    expect(layout.gears.map((g) => g.id)).toEqual([C.BAR_ID, C.RATCHET_ID, C.DRUM_ID]);
    expect(byId(C.BAR_ID).type).toBe("crank");
    expect(byId(C.RATCHET_ID).type).toBe("ratchet");
    expect(byId(C.DRUM_ID).type).toBe("pulley");
    // Worked by walking round it, so everything turns about world Y.
    for (const g of layout.gears) expect(g.axis).toEqual([0, 1, 0]);
  });

  it("meshes the bars to the ratchet at the summed pitch radii, on PARALLEL axes", () => {
    // The ratchet branch needs PARALLEL axes, unlike the bevel and worm branches beside it.
    const bars = byId(C.BAR_ID);
    const ratchet = byId(C.RATCHET_ID);
    const d = Math.hypot(
      bars.position[0] - ratchet.position[0],
      bars.position[1] - ratchet.position[1],
      bars.position[2] - ratchet.position[2],
    );
    expect(d).toBeCloseTo(C.MESH_DISTANCE, 9);

    const edge = evaluatePair(bars, ratchet);
    expect(edge).not.toBeNull();
    expect(edge!.kind).toBe("mesh");
    expect(edge!.ratio).toBeCloseTo(C.REDUCTION, 12);
  });

  it("makes the mesh ONE-WAY: the bars drive the ratchet, never the other way", () => {
    const edge = evaluatePair(byId(C.BAR_ID), byId(C.RATCHET_ID))!;
    expect(edge.oneWay).toBe("aToB"); // a = the bars, the non-ratchet side
  });

  it("leaves NO path in the directed graph from the drum back to the bars", () => {
    // The claim that matters, and reading the oneWay flag is not enough to establish it:
    // `adjacency.ts` is what actually drops the reverse direction, so walk the real adjacency.
    const layout = preset();
    const adjacency = buildDirectedAdjacency(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    const reached = new Set<string>([C.DRUM_ID]);
    const queue = [C.DRUM_ID];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of adjacency.get(cur) ?? []) {
        const next = e.a === cur ? e.b : e.a;
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    expect(reached.has(C.RATCHET_ID)).toBe(true); // the drum shares a shaft with the ratchet
    expect(reached.has(C.BAR_ID), "the anchor must never spin the bars back").toBe(false);
  });

  it("keeps every meshing wheel on ONE module", () => {
    const layout = preset();
    const map = new Map(layout.gears.map((g) => [g.id, g]));
    for (const e of buildEdges(layout.gears, layout.remoteLinks).filter((x) => x.kind === "mesh")) {
      expect(map.get(e.a)!.module).toBe(C.CAPSTAN_MODULE);
      expect(map.get(e.b)!.module).toBe(C.CAPSTAN_MODULE);
    }
  });

  it("reports zero diagnostics problems", () => {
    const layout = preset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("halves and reverses the bars at the drum, across hundreds of ticks", () => {
    let layout = preset();
    for (let i = 0; i < 400; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const bars = layout.gears.find((g) => g.id === C.BAR_ID)!;
      const ratchet = layout.gears.find((g) => g.id === C.RATCHET_ID)!;
      const drum = layout.gears.find((g) => g.id === C.DRUM_ID)!;
      expect(Math.abs(bars.angularVelocity)).toBeCloseTo(Math.abs(C.BAR_SPEED), 12);
      expect(ratchet.angularVelocity).toBeCloseTo(-C.REDUCTION * bars.angularVelocity, 12);
      expect(drum.angularVelocity).toBe(ratchet.angularVelocity); // keyed to the same shaft
    }
  });

  it("hauls the anchor over exactly [0, CHAIN_TRAVEL] and pays it back out, forever", () => {
    // The stroke is derived, not guessed: lift = -REDUCTION * ROPE_RADIUS * barRotation.
    expect(byId(C.BAR_ID).reverseAt).toEqual(C.BAR_STROKE);

    let layout = preset();
    const liftAt = (rot: number) => Math.min(Math.max(rot * C.ROPE_RADIUS, 0), C.CHAIN_TRAVEL);
    let min = Infinity;
    let max = -Infinity;
    let up = false;
    let down = false;
    let previous = 0;
    for (let i = 0; i < 60 * 120; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const lift = liftAt(layout.gears.find((g) => g.id === C.DRUM_ID)!.rotation);
      if (lift > previous) up = true;
      if (lift < previous) down = true;
      previous = lift;
      min = Math.min(min, lift);
      max = Math.max(max, lift);
    }
    expect(up).toBe(true);
    expect(down).toBe(true);
    expect(max).toBeCloseTo(C.CHAIN_TRAVEL, 6);
    expect(min).toBeCloseTo(0, 6);
  });
});

describe("createCapstanProps", () => {
  it("stands on the ground, anchor and all", () => {
    expect(depthBelowGround(preset().gears, C.createCapstanProps())).toBeCloseTo(0, 6);
  });

  it("puts asymmetric parts on all three turning bodies, so the heave is visible", () => {
    // The drum barrel and the ratchet wheel are both rotationally symmetric about their own axis
    // and would show nothing at all; the whelps, pawl teeth and bars are the motion.
    const props = C.createCapstanProps();
    for (const id of [C.DRUM_ID, C.RATCHET_ID, C.BAR_ID]) {
      expect(props.filter((p) => p.attachTo === id).length, id).toBeGreaterThanOrEqual(4);
    }
  });

  it("hoists the whole anchor on the drum's chain", () => {
    const hoisted = C.createCapstanProps().filter((p) => p.windWith);
    expect(hoisted.length).toBeGreaterThanOrEqual(5); // shank, crown, two flukes, stock
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(C.DRUM_ID);
      expect(p.windWith!.travel).toEqual([0, C.CHAIN_TRAVEL]);
      // The RADIUS is the quantity `sceneSync` actually multiplies the drum's rotation by --
      // `clamp(gear.rotation * p.radius, lo, hi)` -- and no assertion in this file read it.
      // Halving it left every test green while the anchor rose half as far as the suite's own
      // names promise, because the only "lift" anyone measured was one the test recomputed
      // for itself from ROPE_RADIUS.
      expect(p.windWith!.radius).toBe(C.ROPE_RADIUS);
    }

    // And the three have to agree: at the end of the bar's stroke the drum has turned far
    // enough that rotation x radius is exactly the travel, with no clamping left to do. If the
    // stroke, the radius and the travel drift apart, the anchor either stops short of the
    // hawse pipe or sits pinned at its stop for part of every cycle.
    let layout = preset();
    let furthest = 0;
    for (let i = 0; i < 60 * 120; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      furthest = Math.max(furthest, layout.gears.find((g) => g.id === C.DRUM_ID)!.rotation);
    }
    expect(furthest * C.ROPE_RADIUS).toBeCloseTo(C.CHAIN_TRAVEL, 6);
  });

  it("swings the bars clear over the drum instead of through it", () => {
    // A bar is 22 long, centred at r = 11, so its tip reaches 22 units from the capstan's
    // axis -- past the drum, which stands DRUM_X = 18 away with a radius of 9. Drawn at the
    // gear's own height the bars ran through the drum barrel, the ratchet disc and the whelps
    // four times a revolution. `classify` never objects: it compares gear CENTRES, a clear 18
    // apart, and the sandbox models no contact between machine parts at all. So the check has
    // to be made here, in y: the bars ride above everything their sweep passes over.
    const props = C.createCapstanProps();
    const bars = props.filter((p) => p.attachTo === C.BAR_ID && p.kind === "box");
    expect(bars.length).toBe(C.BAR_COUNT);

    const barBottom = Math.min(...bars.map((b) => b.position[1] - (b as { size: number[] }).size[1] / 2));
    // Everything that stands within reach of a bar tip, measured from the capstan axis.
    const inSweep = props.filter((p) => {
      if (bars.includes(p)) return false;
      const r = Math.hypot(p.position[0], p.position[2]);
      return r < 22 + 9; // generous: anything the 22-unit tip could plausibly foul
    });
    const tallest = Math.max(
      ...inSweep.map((p) => {
        const h = "size" in p ? (p.size as number[])[1] : "height" in p ? (p.height as number) : 0;
        return p.position[1] + h / 2;
      }),
    );
    expect(barBottom).toBeGreaterThan(tallest);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const ids = new Set(preset().gears.map((g) => g.id));
    for (const p of C.createCapstanProps()) {
      for (const t of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (t) expect(ids.has(t), String(t)).toBe(true);
      }
    }
  });

  it("gives the deck timber and the ironwork their real finishes", () => {
    const used = new Set(C.createCapstanProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["wood", "metal", "rust"]) expect(used.has(kind as never)).toBe(true);
  });
});
