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
    expect(C.BAR_R + C.RATCHET_R).toBe(C.MESH_DISTANCE);
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
    expect(C.BAR_STROKE[0] * -(C.REDUCTION * C.ROPE_RADIUS)).toBeCloseTo(C.CHAIN_TRAVEL, 9);
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
    }
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
