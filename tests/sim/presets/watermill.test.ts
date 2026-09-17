import { describe, it, expect } from "vitest";
import {
  createWatermillPreset,
  createWatermillProps,
  WHEEL_ID,
  SHAFT_ID,
  STONE_ID,
  WHEEL_TEETH,
  WALLOWER_TEETH,
  WHEEL_PITCH_RADIUS,
  WALLOWER_PITCH_RADIUS,
  MESH_DISTANCE,
  STEP_UP_RATIO,
  WHEEL_SPEED,
} from "../../../src/sim/presets/watermill";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createWatermillPreset", () => {
  it("builds the paddle wheel, the wallower it meshes, and the millstone riding the shaft", () => {
    const layout = createWatermillPreset();
    expect(layout.gears.map((g) => g.id)).toEqual([WHEEL_ID, SHAFT_ID, STONE_ID]);
    expect(layout.remoteLinks).toEqual([]); // everything is direct mesh/coupling, no belts

    const [wheel, wallower, stone] = layout.gears;
    expect(wheel.type).toBe("crank"); // the head of water is the external input
    expect(wheel.teeth).toBe(WHEEL_TEETH);
    expect(wheel.angularVelocity).toBe(WHEEL_SPEED);
    expect(wallower.type).toBe("bevel"); // horizontal wheel -> vertical shaft
    expect(wallower.teeth).toBe(WALLOWER_TEETH);
    expect(stone.type).toBe("load");
    // The millstone rides the shaft: same position AND axis, so it couples 1:1.
    expect(stone.position).toEqual(wallower.position);
    expect(stone.axis).toEqual(wallower.axis);
  });

  it("places the wallower at exactly the summed pitch radii, on perpendicular axes", () => {
    const layout = createWatermillPreset();
    const [wheel, wallower] = layout.gears;
    const dx = wallower.position[0] - wheel.position[0];
    const dy = wallower.position[1] - wheel.position[1];
    const dz = wallower.position[2] - wheel.position[2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(MESH_DISTANCE, 10);
    // A bevel pair turns the drive through a right angle -- the axes really are perpendicular.
    const dot = wheel.axis[0] * wallower.axis[0] + wheel.axis[1] * wallower.axis[1] + wheel.axis[2] * wallower.axis[2];
    expect(dot).toBe(0);
  });

  it("forms a real bevel mesh and a real coincident coupling via the real evaluatePair", () => {
    const [wheel, wallower, stone] = createWatermillPreset().gears;

    const mesh = evaluatePair(wheel, wallower);
    expect(mesh).not.toBeNull();
    expect(mesh!.kind).toBe("mesh");
    expect(mesh!.ratio).toBeCloseTo(STEP_UP_RATIO, 10); // 36 / 12 = 3

    const coupling = evaluatePair(wallower, stone);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);
  });

  it("reports zero diagnostics problems -- fully connected, fully powered, nothing overlapping", () => {
    const layout = createWatermillPreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("steps the shaft up to exactly 3x the wheel, reversed by the mesh, and carries the stone with it", () => {
    let layout = createWatermillPreset();
    for (let i = 0; i < 600; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };

      const wheel = layout.gears.find((g) => g.id === WHEEL_ID)!;
      const shaft = layout.gears.find((g) => g.id === SHAFT_ID)!;
      const stone = layout.gears.find((g) => g.id === STONE_ID)!;

      // The wheel's commanded speed never drifts; the shaft is stepped up and reversed by
      // the tooth mesh; the millstone shares the shaft exactly.
      expect(wheel.angularVelocity).toBe(WHEEL_SPEED);
      expect(shaft.angularVelocity).toBeCloseTo(-STEP_UP_RATIO * WHEEL_SPEED, 12); // -1.5
      expect(stone.angularVelocity).toBe(shaft.angularVelocity);
      expect(Math.abs(shaft.angularVelocity)).toBeCloseTo(STEP_UP_RATIO * Math.abs(wheel.angularVelocity), 12);
      expect(wheel.broken).toBe(false);
    }
    // 10 simulated seconds in, everything has genuinely turned.
    for (const id of [WHEEL_ID, SHAFT_ID, STONE_ID]) {
      expect(Math.abs(layout.gears.find((g) => g.id === id)!.rotation)).toBeGreaterThan(0);
    }
  });
});

describe("createWatermillProps", () => {
  it("hangs paddles on the wheel and dressing on the millstone, so both visibly turn", () => {
    const props = createWatermillProps();
    const onWheel = props.filter((p) => p.attachTo === WHEEL_ID);
    const onStone = props.filter((p) => p.attachTo === STONE_ID);
    // A bare disc is rotationally symmetric and shows no motion; the paddles are what make
    // the wheel's rotation readable, and likewise the stone's dressing.
    expect(onWheel.length).toBeGreaterThanOrEqual(8);
    expect(onStone.length).toBeGreaterThanOrEqual(4);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createWatermillPreset().gears.map((g) => g.id));
    for (const p of createWatermillProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the timber, masonry and ironwork their real surface finishes", () => {
    const used = new Set(createWatermillProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["wood", "stone", "metal"]) expect(used.has(kind as never)).toBe(true);
  });
});
