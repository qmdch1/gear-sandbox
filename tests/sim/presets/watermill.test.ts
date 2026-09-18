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
    // the wheel's rotation readable, and likewise the stone's dressing. COUNTING the attached
    // props does not check that, and this test used to do only that: the wheel carries 48, of
    // which exactly 8 -- the axle, the hub boss, two hub hoops, two rims and two shrouds -- are
    // cylinders and rings, every one a solid of revolution about the wheel's own axis. So
    // detaching all 40 ASYMMETRIC props (the 8 spokes and the 32 paddle and sole boards) still
    // left 8 and still passed, with the rendered wheel pixel-identical in every frame.
    //
    // What has to be attached is the asymmetric work. Boxes are the asymmetric ones here.
    const asymmetric = (arr: typeof props) => arr.filter((p) => p.kind === "box");
    expect(asymmetric(onWheel).length).toBeGreaterThanOrEqual(30); // 8 spokes + 32 boards
    expect(asymmetric(onStone).length).toBeGreaterThanOrEqual(4); // furrow ribs and the rynd

    // ...and they have to be off the axis, or they would turn on the spot and show nothing.
    const wheel = createWatermillPreset().gears.find((g) => g.id === WHEEL_ID)!;
    const offAxis = asymmetric(onWheel).filter(
      (p) => Math.hypot(p.position[0] - wheel.position[0], p.position[1] - wheel.position[1]) > 1,
    );
    expect(offAxis.length).toBe(asymmetric(onWheel).length);
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

  it("carries the millstones on the floor, and keeps static timber out of the turning shaft", () => {
    // Three defects lived in this corner of the mill, all of them invisible to the simulation
    // (`classify` compares gear centres; props are not in the physics):
    //   - the bedstone hung 2.7 above a floor said to carry it, held up by nothing but the
    //     rotating shaft through its own eye;
    //   - the upper wall piece ran through the runner stone and the iron rynd turning above it;
    //   - the hopper's cross beam lay on the shaft's own axis, so static timber sat inside the
    //     rotating shaft and the iron key swept through it every revolution -- the key being
    //     the one prop placed there to make that spin legible.
    const props = createWatermillProps();
    const box = (pred: (p: any) => boolean) => props.filter(pred as never);
    const yOf = (p: any) => {
      const h = p.size ? p.size[1] : (p.height ?? p.radius * 2);
      return [p.position[1] - h / 2, p.position[1] + h / 2] as const;
    };

    // The floor reaches the bedstone: no air between them.
    const floor = box((p) => p.kind === "box" && p.size?.[0] === 28 && p.position[0] === 35)[0] as any;
    const bedstone = box((p) => p.kind === "cylinder" && p.radius === 4.5 && !p.attachTo)[0] as any;
    expect(floor).toBeDefined();
    expect(bedstone).toBeDefined();
    expect(yOf(floor)[1]).toBeCloseTo(yOf(bedstone)[0], 6);

    // The upper wall starts above everything that turns on the stone shaft.
    const upperWall = box((p) => p.kind === "box" && p.position[0] === 20.6 && p.position[1] > 20)[0] as any;
    const turning = box((p) => p.attachTo === STONE_ID);
    // Only the parts that REACH the wall in x can strike it. The upright shaft turns on the
    // same gear and rises to 31, but it stands at x = 24 with a radius of 1, nowhere near the
    // wall's 20.0..21.2 -- comparing against it would demand a clearance the mill does not need.
    const wallX = [upperWall.position[0] - upperWall.size[0] / 2, upperWall.position[0] + upperWall.size[0] / 2];
    const reachesWall = turning.filter((p: any) => {
      const halfX = p.size ? p.size[0] / 2 : p.radius;
      return p.position[0] - halfX < wallX[1] && p.position[0] + halfX > wallX[0];
    });
    expect(reachesWall.length).toBeGreaterThan(0); // or the check below says nothing
    expect(yOf(upperWall)[0]).toBeGreaterThan(Math.max(...reachesWall.map((p) => yOf(p)[1])));

    // The hopper beams leave the shaft's axis clear, and ride above the key that turns on it.
    const shaft = box((p) => p.kind === "cylinder" && p.radius === 1 && p.attachTo === STONE_ID)[0] as any;
    const beams = box((p) => p.kind === "box" && p.size?.[2] === 4.8) as any[];
    expect(beams).toHaveLength(2);
    for (const beam of beams) {
      // Clear of the shaft in z...
      expect(Math.abs(beam.position[2]) - beam.size[2] / 2).toBeGreaterThan(shaft.radius);
      // ...and above everything the shaft carries below them.
      // ...and above the key, which turns on a 2.4 radius and would otherwise sweep them.
      const key = box((p) => p.kind === "box" && p.size?.[0] === 2.4 && p.attachTo === STONE_ID)[0] as any;
      expect(yOf(beam)[0]).toBeGreaterThan(yOf(key)[1]);
    }
  });
});
