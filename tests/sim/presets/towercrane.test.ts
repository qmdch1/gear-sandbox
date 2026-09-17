import { describe, it, expect } from "vitest";
import {
  createTowerCranePreset,
  createTowerCraneProps,
  SLEW_MOTOR_ID,
  SLEW_RING_ID,
  HOIST_MOTOR_ID,
  HOIST_DRUM_ID,
  SLEW_MOTOR_R,
  SLEW_RING_R,
  SLEW_MESH_DISTANCE,
  SLEW_REDUCTION,
  SLEW_MOTOR_SPEED,
  HOIST_MOTOR_SPEED,
  ROPE_RADIUS,
  HOOK_TRAVEL,
  HOIST_STROKE,
  HOOK_REST_Y,
  TROLLEY_UNDERSIDE,
} from "../../../src/sim/presets/towercrane";
import { evaluatePair } from "../../../src/sim/meshing";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

describe("createTowerCranePreset", () => {
  it("builds two independently powered clusters: slewing and hoisting", () => {
    const layout = createTowerCranePreset();
    expect(layout.gears.map((g) => g.id)).toEqual([SLEW_RING_ID, SLEW_MOTOR_ID, HOIST_MOTOR_ID, HOIST_DRUM_ID]);
    expect(layout.remoteLinks).toEqual([]);
    // A real crane slews and hoists on separate motors -- you can swing the jib while the
    // hook hangs still. Two cranks is the honest model of that, not an accident.
    expect(layout.gears.filter((g) => g.type === "crank")).toHaveLength(2);
    const [ring] = layout.gears;
    expect(ring.axis).toEqual([0, 1, 0]); // a crane slews in plan, about world Y
  });

  it("places the slew motor at exactly the summed pitch radii, clear of the overlap floor", () => {
    const layout = createTowerCranePreset();
    const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
    const motor = layout.gears.find((g) => g.id === SLEW_MOTOR_ID)!;
    const d = Math.hypot(
      motor.position[0] - ring.position[0],
      motor.position[1] - ring.position[1],
      motor.position[2] - ring.position[2],
    );
    expect(d).toBeCloseTo(SLEW_MESH_DISTANCE, 10);
    expect(d).toBeGreaterThan((SLEW_RING_R + SLEW_MOTOR_R) * 0.95); // 22.8
  });

  it("forms a real slew mesh and a real hoist coupling via the real evaluatePair", () => {
    const layout = createTowerCranePreset();
    const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
    const slewMotor = layout.gears.find((g) => g.id === SLEW_MOTOR_ID)!;
    const hoistMotor = layout.gears.find((g) => g.id === HOIST_MOTOR_ID)!;
    const drum = layout.gears.find((g) => g.id === HOIST_DRUM_ID)!;

    const mesh = evaluatePair(slewMotor, ring);
    expect(mesh).not.toBeNull();
    expect(mesh!.kind).toBe("mesh");
    expect(mesh!.ratio).toBeCloseTo(SLEW_REDUCTION, 12); // 8 / 40

    const coupling = evaluatePair(hoistMotor, drum);
    expect(coupling).not.toBeNull();
    expect(coupling!.kind).toBe("coupling");
    expect(coupling!.ratio).toBe(1);

    // The two clusters must NOT accidentally engage each other.
    expect(evaluatePair(ring, drum)).toBeNull();
  });

  it("reports zero diagnostics problems -- both clusters powered, nothing overlapping", () => {
    const layout = createTowerCranePreset();
    const d = classify(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]); // each cluster reaches a crank of its own
    expect(d.overlapPairs).toEqual([]);
  });

  // Pins the ACTUAL numbers the module doc claims, as literals. Every other ratio assertion
  // here compares the sim against SLEW_REDUCTION, which is itself derived from the same tooth
  // counts -- so a typo in the tooth counts would move both sides together and be caught by
  // nothing. These literals are the only thing standing between the doc's "8/40 = 1/5, so
  // 0.8 rad/s becomes -0.16 rad/s" and a silent drift away from it.
  it("matches the documented numbers literally: 24 apart, 1/5 reduction, -0.16 rad/s", () => {
    expect(SLEW_RING_R).toBe(20);
    expect(SLEW_MOTOR_R).toBe(4);
    expect(SLEW_MESH_DISTANCE).toBe(24);
    expect(SLEW_REDUCTION).toBeCloseTo(0.2, 12); // 8 / 40 = 1/5, NOT 1/8
    expect(SLEW_MOTOR_SPEED).toBe(0.8);
    expect(-SLEW_REDUCTION * SLEW_MOTOR_SPEED).toBeCloseTo(-0.16, 12);
    expect(HOIST_STROKE).toBeCloseTo(16, 12); // 40 / 2.5
  });

  it("slews the jib at exactly 1/5 the motor speed, reversed, while the hoist runs on its own", () => {
    let layout = createTowerCranePreset();
    for (let i = 0; i < 400; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const ring = layout.gears.find((g) => g.id === SLEW_RING_ID)!;
      const drum = layout.gears.find((g) => g.id === HOIST_DRUM_ID)!;
      const hoistMotor = layout.gears.find((g) => g.id === HOIST_MOTOR_ID)!;
      expect(ring.angularVelocity).toBeCloseTo(-SLEW_REDUCTION * SLEW_MOTOR_SPEED, 12); // -0.16
      // The hoist drum follows its OWN motor, not the slew ring.
      expect(drum.angularVelocity).toBe(hoistMotor.angularVelocity);
      expect(Math.abs(drum.angularVelocity)).toBe(HOIST_MOTOR_SPEED);
      expect(ring.broken).toBe(false);
    }
    expect(Math.abs(layout.gears.find((g) => g.id === SLEW_RING_ID)!.rotation)).toBeGreaterThan(0);
  });

  it("derives the hoist stroke so the hook sweeps exactly its full travel", () => {
    const hoistMotor = createTowerCranePreset().gears.find((g) => g.id === HOIST_MOTOR_ID)!;
    expect(hoistMotor.reverseAt).toEqual([0, HOIST_STROKE]);
  });

  it("raises AND lowers the hook over exactly [0, HOOK_TRAVEL], forever", () => {
    let layout = createTowerCranePreset();
    const liftAt = (rot: number) => Math.min(Math.max(rot * ROPE_RADIUS, 0), HOOK_TRAVEL);
    let min = Infinity;
    let max = -Infinity;
    let up = false;
    let down = false;
    let previous = 0;

    for (let i = 0; i < 7200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
      const lift = liftAt(layout.gears.find((g) => g.id === HOIST_DRUM_ID)!.rotation);
      if (lift > previous) up = true;
      if (lift < previous) down = true;
      previous = lift;
      min = Math.min(min, lift);
      max = Math.max(max, lift);
    }

    expect(up).toBe(true);
    expect(down).toBe(true);
    expect(max).toBeGreaterThan(HOOK_TRAVEL - 0.2);
    expect(max).toBeLessThanOrEqual(HOOK_TRAVEL + 0.01);
    expect(min).toBeGreaterThanOrEqual(-0.01);
    expect(min).toBeLessThan(0.2);
  });
});

describe("createTowerCraneProps", () => {
  it("swings the WHOLE upper works with the slew ring, not just part of it", () => {
    const slewing = createTowerCraneProps().filter((p) => p.attachTo === SLEW_RING_ID);
    // Jib, counter-jib, counterweight, cab, A-frame, two tie bars, trolley and the rope.
    expect(slewing.length).toBeGreaterThanOrEqual(9);
    // The mast and base must NOT swing -- they are the fixed part of a tower crane.
    const fixed = createTowerCraneProps().filter((p) => !p.attachTo && !p.windWith);
    expect(fixed.length).toBeGreaterThanOrEqual(5);
  });

  it("hoists the hook and its crate on the drum's rope, bounded by the jib", () => {
    const hoisted = createTowerCraneProps().filter((p) => p.windWith);
    expect(hoisted.length).toBe(2);
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(HOIST_DRUM_ID);
      expect(p.windWith!.radius).toBe(ROPE_RADIUS);
      expect(p.windWith!.travel).toEqual([0, HOOK_TRAVEL]);
    }
  });

  it("puts bars on the hoist drum so its rotation is visible", () => {
    expect(createTowerCraneProps().filter((p) => p.attachTo === HOIST_DRUM_ID).length).toBeGreaterThanOrEqual(4);
    // A pulley renders as a lathed, rotationally symmetric body -- spun about its own axis it
    // shows NO motion whatever its speed. The bars must therefore be OFF the drum's own axis,
    // or they are just as dead as the bare drum they were added to rescue.
    const drum = createTowerCranePreset().gears.find((g) => g.id === HOIST_DRUM_ID)!;
    for (const bar of createTowerCraneProps().filter((p) => p.attachTo === HOIST_DRUM_ID)) {
      const offAxis = Math.hypot(bar.position[0] - drum.position[0], bar.position[1] - drum.position[1]);
      expect(offAxis).toBeGreaterThan(0.5); // drum axis is [0,0,1], so X/Y offset is what orbits
    }
  });

  it("rests the hook block and its crate ON the ground plane, never buried under it", () => {
    // scene.ts draws an opaque ground plane at y = 0. A prop whose rest pose dips below it is
    // invisible until hoisted -- which is exactly what a hand-picked HOOK_REST_Y of 2 did: the
    // crate spanned y = -2.95 .. 0.55 and started 84% underground.
    const hoisted = createTowerCraneProps().filter((p) => p.windWith);
    expect(hoisted.length).toBe(2);
    for (const p of hoisted) {
      const half = p.kind === "box" ? p.size[1] / 2 : 0;
      expect(p.position[1] - half).toBeGreaterThanOrEqual(0);
    }
    // ...and the lowest of them actually TOUCHES the ground, rather than dangling in mid-air.
    const lowest = Math.min(...hoisted.map((p) => p.position[1] - (p.kind === "box" ? p.size[1] / 2 : 0)));
    expect(lowest).toBeCloseTo(0, 10);
    expect(HOOK_REST_Y).toBeGreaterThan(0);
  });

  it("lifts the hook right up under the trolley -- 'to the jib' is literally true", () => {
    // The doc claims the hook lifts to the jib. Check that against the trolley's underside,
    // the headblock the rope drops from: at full travel the hook must reach it and must not
    // punch through it. (At HOOK_TRAVEL = 30 the hook topped out at y = 33.2, a full 13.6
    // units short of the 46.8 trolley -- the claim was simply false.)
    const hoisted = createTowerCraneProps().filter((p) => p.windWith);
    const topAtFullLift = Math.max(
      ...hoisted.map((p) => p.position[1] + (p.kind === "box" ? p.size[1] / 2 : 0) + HOOK_TRAVEL),
    );
    expect(topAtFullLift).toBeLessThanOrEqual(TROLLEY_UNDERSIDE);
    expect(topAtFullLift).toBeGreaterThan(TROLLEY_UNDERSIDE - 2);
  });

  it("points every moving prop at a gear that actually exists", () => {
    const gearIds = new Set(createTowerCranePreset().gears.map((g) => g.id));
    for (const p of createTowerCraneProps()) {
      for (const target of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (target) expect(gearIds.has(target)).toBe(true);
      }
    }
  });

  it("gives the steelwork, concrete and timber their real finishes", () => {
    const used = new Set(createTowerCraneProps().map((p) => p.texture).filter(Boolean));
    for (const kind of ["metal", "stone", "wood"]) expect(used.has(kind as never)).toBe(true);
  });
});

describe("createTowerCraneProps -- the hook swings AND hoists", () => {
  it("declares both attachTo and windWith on the hook and its crate", () => {
    // These two mechanisms used to be mutually exclusive in the renderer: the winding pass
    // rewrote the prop's position from its rest pose, throwing away the swing the attached pass
    // had just applied. The jib would orbit the mast while the hook hung behind in mid-air.
    // SceneSync now composes them, so a crane hook can finally do both -- as a real one does.
    const hoisted = createTowerCraneProps().filter((p) => p.windWith);
    expect(hoisted.length).toBe(2);
    for (const p of hoisted) {
      expect(p.windWith!.gear).toBe(HOIST_DRUM_ID);
      expect(p.attachTo, "hoisted prop must also swing with the jib").toBe(SLEW_RING_ID);
    }
  });

  it("keeps both of the gears those two mechanisms name -- they are different clusters", () => {
    // The hook follows the SLEW ring for its swing and the HOIST drum for its lift. Those are
    // deliberately separate, independently powered clusters, so both ids must really exist.
    const ids = new Set(createTowerCranePreset().gears.map((g) => g.id));
    expect(ids.has(SLEW_RING_ID)).toBe(true);
    expect(ids.has(HOIST_DRUM_ID)).toBe(true);
    for (const p of createTowerCraneProps().filter((x) => x.windWith)) {
      expect(ids.has(p.attachTo!)).toBe(true);
      expect(ids.has(p.windWith!.gear)).toBe(true);
    }
  });

  it("swings the upper works clear of the mast it stands on", () => {
    // The operator cab used to sweep straight through each of the four mast legs, four times a
    // revolution, penetrating 1.95 of its own 2.0 half-width. At slew angle 0 -- the pose that
    // renders on load -- it cleared them by 0.5 in z, so it always looked right, and nothing in
    // the simulation could say otherwise: `classify` compares GEAR CENTRES, and props carry no
    // contact model at all.
    //
    // `attachTo` turns a prop about its gear's axis, which here is vertical, so a swinging part
    // sweeps the band between its nearest and furthest distance from that axis, at its own
    // height. A fixed part inside BOTH that band and that height band is struck every turn.
    const props = createTowerCraneProps();
    const ring = createTowerCranePreset().gears.find((g) => g.id === SLEW_RING_ID)!;
    const [cx, , cz] = ring.position;

    const bounds = (p: (typeof props)[number]) => {
      const half =
        p.kind === "box"
          ? [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2]
          : p.kind === "cylinder" || p.kind === "cone"
            ? [p.radius, p.height / 2, p.radius]
            : p.kind === "sphere"
              ? [p.radius, p.radius, p.radius]
              : [p.radius + p.tube, p.radius + p.tube, p.tube];
      // Horizontal distance from the slew axis, at the near and far corners.
      const dx = Math.abs(p.position[0] - cx);
      const dz = Math.abs(p.position[2] - cz);
      const near = Math.hypot(Math.max(0, dx - half[0]), Math.max(0, dz - half[2]));
      const far = Math.hypot(dx + half[0], dz + half[2]);
      return { near, far, lo: p.position[1] - half[1], hi: p.position[1] + half[1] };
    };

    const swinging = props.filter((p) => p.attachTo === SLEW_RING_ID && !p.rotation);
    const fixed = props.filter((p) => !p.attachTo && !p.windWith && !p.rotation);
    expect(swinging.length).toBeGreaterThan(3);
    expect(fixed.length).toBeGreaterThan(3);

    for (const s of swinging) {
      const a = bounds(s);
      for (const f of fixed) {
        const b = bounds(f);
        const heightOverlap = Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
        if (heightOverlap <= 0) continue; // passes over or under it
        const radialOverlap = Math.min(a.far, b.far) - Math.max(a.near, b.near);
        expect(
          radialOverlap,
          `swinging ${s.kind} at [${s.position}] sweeps through fixed ${f.kind} at [${f.position}]`,
        ).toBeLessThanOrEqual(0);
      }
    }
  });
});
