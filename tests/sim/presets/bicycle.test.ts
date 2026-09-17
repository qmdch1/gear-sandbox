import { describe, it, expect } from "vitest";
import { createBicyclePreset, createBicycleProps } from "../../../src/sim/presets/bicycle";
import { evaluatePair, isOverlapping } from "../../../src/sim/meshing";
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

  it("supplies a decorative body (two tires, frame tubes, seat, handlebars)", () => {
    const props = createBicycleProps();
    expect(props.length).toBeGreaterThan(6);
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds.has("ring")).toBe(true); // tires
    expect(kinds.has("box")).toBe(true); // frame/seat/bars
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
});
