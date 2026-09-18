import { describe, it, expect } from "vitest";
import { createBicyclePreset, createBicycleProps } from "../../../src/sim/presets/bicycle";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
import { seatOnGround, lowestPoint, propLowestY, gearLowestY } from "../../../src/sim/ground";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createBicyclePreset", () => {
  it("builds pedals+chainring (coincident), a rear cog+hub, a front hub+motor, and one drive chain", () => {
    const layout = createBicyclePreset();
    expect(layout.gears.map((g) => g.id)).toEqual([
      "자전거_페달",
      "자전거_체인링",
      "자전거_뒷스프로킷",
      "자전거_뒷바퀴허브",
      "자전거_앞바퀴모터",
      "자전거_앞바퀴허브",
    ]);
    expect(layout.remoteLinks).toEqual([
      { a: "자전거_체인링", b: "자전거_뒷스프로킷", kind: "chain" },
    ]);

    const pedal = layout.gears[0];
    const chainring = layout.gears[1];
    expect(pedal.type).toBe("crank");
    expect(chainring.type).toBe("sprocket");
    expect(chainring.position).toEqual(pedal.position); // coincident
  });

  it("spins the front wheel hub at the same 2.0 speed as the rear wheel (both wheels roll together)", () => {
    let layout = createBicyclePreset();
    for (let i = 0; i < 120; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    const front = layout.gears.find((g) => g.id === "자전거_앞바퀴허브")!;
    const rear = layout.gears.find((g) => g.id === "자전거_뒷바퀴허브")!;
    expect(front.angularVelocity).toBeCloseTo(2.0, 9);
    expect(front.angularVelocity).toBeCloseTo(rear.angularVelocity, 9); // both wheels same speed
  });

  it("forms coincident couplings (pedal<->chainring, rear cog<->hub) and no overlaps anywhere", () => {
    const layout = createBicyclePreset();
    const [pedal, chainring, rearCog, rearHub] = layout.gears;

    const pedalEdge = evaluatePair(pedal, chainring);
    expect(pedalEdge!.kind).toBe("coupling");
    const rearEdge = evaluatePair(rearCog, rearHub);
    expect(rearEdge!.kind).toBe("coupling");

    // The chainring and the rear assembly are far apart -- no accidental mesh/overlap.
    expect(isOverlapping(chainring, rearCog)).toBe(false);
    expect(isOverlapping(chainring, rearHub)).toBe(false);
  });

  it("reports zero diagnostics problems", () => {
    const layout = createBicyclePreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("gears the rear wheel UP to exactly 2x pedal speed via the 28:14 chain ratio, across many ticks", () => {
    let layout = createBicyclePreset();
    const pedalSpeed = layout.gears[0].angularVelocity; // 1.0
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const pedal = layout.gears.find((g) => g.id === "자전거_페달")!;
      const rearHub = layout.gears.find((g) => g.id === "자전거_뒷바퀴허브")!;
      expect(pedal.angularVelocity).toBe(pedalSpeed);
      // chain ratio = chainring.teeth / rearCog.teeth = 28/14 = 2 -> rear turns 2x pedal,
      // same direction (chain/coupling edges are sign +1).
      expect(rearHub.angularVelocity).toBeCloseTo(pedalSpeed * 2, 9);
      expect(Math.sign(rearHub.angularVelocity)).toBe(Math.sign(pedalSpeed));
    }
  });

  it("joins the frame tubes to the joints they are named for, and not mirrored", () => {
    // This test used to count props and look at the kind set, so its four named parts were not
    // checked at all: deleting the front tyre, the front rim, the seat and the handlebars left
    // it green -- one wheel, no seat, no bars -- because 18 of the 30 props are wheel spokes and
    // hubcaps and they alone satisfied `length > 6` and both kinds.
    //
    // What it missed is that every frame tube was drawn MIRRORED about its own midpoint. `tube`
    // rotated by -atan2(dz, dy) where +atan2 is what points a box's long axis along (dy, dz), so
    // the chainstay ran (y10,z0)->(y6,z-22) instead of (y6,z0)->(y10,z-22), the seat tube stood
    // straight up out of the bottom bracket and landed 16 behind the saddle, and the fork ended
    // 7 above the front hub. The "diamond frame" joined none of its joints.
    //
    // So pose each tube the way the renderer will and check where its ends actually land.
    const props = createBicycleProps();
    const preset = createBicyclePreset();
    const hub = (id: string) => preset.gears.find((g) => g.id === id)!.position;
    const rearHub = hub("자전거_뒷바퀴허브");
    const frontHub = hub("자전거_앞바퀴허브");
    const bb = hub("자전거_체인링");

    const tubes = props.filter(
      (p): p is Extract<typeof p, { kind: "box" }> =>
        p.kind === "box" && !p.attachTo && p.rotation !== undefined && p.size[0] === p.size[2],
    );
    expect(tubes.length).toBeGreaterThanOrEqual(6); // chainstay, seat tube, seatstay, down tube, top tube, fork

    const ends = (t: (typeof tubes)[number]) => {
      const a = t.rotation![0];
      const half = t.size[1] / 2;
      // A rotation about +X by a carries local +Y to (0, cos a, sin a).
      const dy = Math.cos(a) * half;
      const dz = Math.sin(a) * half;
      return [
        [t.position[1] + dy, t.position[2] + dz],
        [t.position[1] - dy, t.position[2] - dz],
      ] as const;
    };
    const touches = (t: (typeof tubes)[number], point: readonly number[]) =>
      ends(t).some(([y, z]) => Math.hypot(y - point[1], z - point[2]) < 1e-6);

    // Every joint the frame is described as reaching must actually have tubes ending on it.
    for (const [name, joint] of [
      ["bottom bracket", bb],
      ["rear hub", rearHub],
      ["front hub", frontHub],
    ] as const) {
      expect(tubes.filter((t) => touches(t, joint)).length, `no tube ends at the ${name}`).toBeGreaterThan(0);
    }
    // The chainstay specifically runs bottom bracket -> rear hub, both ends, not one end and a
    // mirrored guess at the other.
    const chainstay = tubes.find((t) => touches(t, bb) && touches(t, rearHub));
    expect(chainstay, "no tube joins the bottom bracket to the rear hub").toBeDefined();
    // ...and the fork runs from the head tube down to the front hub.
    const fork = tubes.find((t) => touches(t, frontHub));
    expect(fork, "no tube reaches the front hub").toBeDefined();

    // The named body parts are all present: two tyres, a seat and handlebars.
    const tyres = props.filter((p) => p.kind === "ring" && p.radius === 10);
    expect(tyres).toHaveLength(2);
    const furniture = props.filter(
      (p) => p.kind === "box" && !p.attachTo && p.size[0] !== p.size[2],
    );
    expect(furniture.length).toBeGreaterThanOrEqual(2); // the saddle and the bars
  });

  it("rides the spokes on their own wheel hubs, so the wheels visibly turn", () => {
    // A torus tyre is rotationally symmetric: spun, it looks perfectly still. The spokes are
    // what make the motion readable, and they only move because each carries `attachTo` naming
    // its own hub. The preset says so in a comment; nothing tested it, so mis-pointing a wheel's
    // spokes at the other hub -- or dropping the attachment -- left this file entirely green
    // while a wheel sat frozen.
    const gearIds = new Set(createBicyclePreset().gears.map((g) => g.id));
    const spokes = createBicycleProps().filter((p) => p.attachTo);
    expect(spokes.length).toBeGreaterThanOrEqual(16); // eight per wheel

    const perHub = new Map<string, number>();
    for (const s of spokes) {
      expect(gearIds.has(s.attachTo!)).toBe(true);
      perHub.set(s.attachTo!, (perHub.get(s.attachTo!) ?? 0) + 1);
    }
    // Both wheels are spoked, and neither borrowed the other's hub.
    expect(perHub.get("자전거_뒷바퀴허브")).toBeGreaterThan(0);
    expect(perHub.get("자전거_앞바퀴허브")).toBeGreaterThan(0);
    expect(perHub.size).toBe(2);

    // Each wheel's spokes are centred on that wheel, not floating over the other one. The two
    // wheels are separated along Z (both hubs sit at x = 0, spinning about the X axis), so Z is
    // the axis that tells them apart.
    const gears = createBicyclePreset().gears;
    const hubZ = (id: string) => gears.find((g) => g.id === id)!.position[2];
    const rearZ = hubZ("자전거_뒷바퀴허브");
    const frontZ = hubZ("자전거_앞바퀴허브");
    expect(rearZ).not.toBe(frontZ); // otherwise the comparison below says nothing
    for (const s of spokes) {
      const own = s.attachTo === "자전거_뒷바퀴허브" ? rearZ : frontZ;
      const other = s.attachTo === "자전거_뒷바퀴허브" ? frontZ : rearZ;
      expect(Math.abs(s.position[2] - own)).toBeLessThan(Math.abs(s.position[2] - other));
    }
  });

  it("stands on its TYRES, not on a chainring tooth", () => {
    // `tests/meta/everyPresetSitsOnTheGround.test.ts` asserts the machine as a whole reaches
    // y = 0, and this bike satisfied that with the wrong part: the chainring (pitch radius 8.4
    // at a bottom bracket of 6) hung to -2.4 while the tyres reached only -1.1, so `seatOnGround`
    // lifted the bike by 2.4 and both wheels ended up 1.3 clear of the floor, the whole machine
    // balanced on a chainring tooth. Reverting HUB_Y still passes the global guard, which is why
    // this has to be said here.
    //
    // The tyre is a TORUS: its rubber reaches WHEEL_R + tube from the hub, not WHEEL_R. That is
    // the half the old `HUB_Y = WHEEL_R` comment ("so the tires rest on the ground") missed.
    const layout = createBicyclePreset();
    const props = createBicycleProps();
    const seated = seatOnGround(layout, props);

    const tyres = seated.props.filter(
      (p): p is Extract<typeof p, { kind: "ring" }> => p.kind === "ring" && p.radius === 10,
    );
    expect(tyres).toHaveLength(2);
    for (const tyre of tyres) {
      expect(propLowestY(tyre)).toBeCloseTo(0, 9); // both wheels on the floor
    }
    // And nothing else dips below them -- no part of the machine is lower than the rubber.
    expect(lowestPoint(seated.layout.gears, seated.props)).toBeCloseTo(0, 9);
    for (const g of seated.layout.gears) expect(gearLowestY(g)).toBeGreaterThan(0);
  });
});
