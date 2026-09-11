import { describe, it, expect } from "vitest";
import { stepBody, timeToFloor, REST_SPEED, type FallingBody } from "../../src/sim/gravity";
import { EARTH_GRAVITY, GRAVITY_PRESETS, accelerationToUnits, UNITS_PER_METRE } from "../../src/sim/units";

const G = accelerationToUnits(EARTH_GRAVITY); // world units/s^2

function body(overrides: Partial<FallingBody> = {}): FallingBody {
  return {
    id: "part",
    position: [0, 100, 0],
    velocity: [0, 0, 0],
    radius: 2,
    mass: 0.5,
    restitution: 0.6,
    rotation: 0,
    resting: false,
    ...overrides,
  };
}

/** Runs the body for `seconds`, returning it plus the highest and lowest centre height seen. */
function run(b: FallingBody, seconds: number, dt: number, options = {}) {
  let current = b;
  let apexAfterFirstContact = -Infinity;
  let touched = false;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const before = current;
    current = stepBody(current, dt, options);
    if (!touched && (current.resting || current.velocity[1] > before.velocity[1])) touched = true;
    if (touched) apexAfterFirstContact = Math.max(apexAfterFirstContact, current.position[1]);
  }
  return { body: current, apexAfterFirstContact };
}

describe("free fall", () => {
  it("falls the textbook distance, h = g t^2 / 2", () => {
    // The single claim that makes this a gravity simulation rather than a downward drift: a
    // dropped part's position after t seconds must be the closed-form answer, not merely
    // 'decreasing'.
    for (const t of [0.1, 0.25, 0.5]) {
      const { body: fallen } = run(body({ position: [0, 1000, 0] }), t, 1 / 600);
      expect(fallen.position[1]).toBeCloseTo(1000 - 0.5 * G * t * t, 4);
      expect(fallen.velocity[1]).toBeCloseTo(-G * t, 4);
    }
  });

  it("gives the same trajectory at any frame rate", () => {
    // Contacts are solved algebraically inside the step rather than snapped to frame
    // boundaries, so a slow machine and a fast one must see the same physics. At 981 units/s^2
    // a body crosses 16 units per 60 Hz frame -- a frame-quantised integrator would bounce in
    // visibly different places.
    const at30 = run(body({ position: [0, 400, 0], velocity: [30, 0, 0] }), 1.5, 1 / 30).body;
    const at240 = run(body({ position: [0, 400, 0], velocity: [30, 0, 0] }), 1.5, 1 / 240).body;
    expect(at30.position[0]).toBeCloseTo(at240.position[0], 0);
    expect(at30.position[1]).toBeCloseTo(at240.position[1], 0);
  });

  it("is independent of mass -- Galileo's result", () => {
    const light = run(body({ mass: 0.01 }), 0.3, 1 / 240).body;
    const heavy = run(body({ mass: 1000 }), 0.3, 1 / 240).body;
    expect(light.position[1]).toBeCloseTo(heavy.position[1], 9);
  });

  it("takes sqrt(2h/g) to reach the floor", () => {
    const h = 1 * UNITS_PER_METRE; // a one-metre drop
    const expected = Math.sqrt((2 * h) / G);
    expect(expected).toBeCloseTo(0.4515, 3); // ~0.45 s, the familiar figure for a 1 m drop
    expect(timeToFloor(h, 0, -G, 0, 10)).toBeCloseTo(expected, 9);
    expect(timeToFloor(h, 0, -G, 0, expected * 0.9)).toBeNull(); // not within a short step
  });
});

describe("bouncing", () => {
  it("rebounds to e^2 of the drop height", () => {
    // The defining property of the coefficient of restitution: it is a ratio of SPEEDS, and
    // height goes as speed squared, so a ball dropped from h returns to e^2 * h.
    const h = 300;
    for (const e of [0.5, 0.8]) {
      const { apexAfterFirstContact } = run(
        body({ position: [0, h, 0], radius: 0, restitution: e }),
        3,
        1 / 600,
      );
      expect(apexAfterFirstContact).toBeGreaterThan(0);
      expect(apexAfterFirstContact / h).toBeCloseTo(e * e, 2);
    }
  });

  it("never gains energy, however long it runs", () => {
    // The failure mode of a naive impulse integrator is a part that gradually climbs. Total
    // mechanical energy must be non-increasing across every single step.
    let current = body({ position: [0, 250, 0], velocity: [40, 120, -25], restitution: 0.95 });
    const energy = (b: FallingBody) =>
      0.5 * (b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2) + G * b.position[1];
    let previous = energy(current);
    for (let i = 0; i < 2000; i++) {
      current = stepBody(current, 1 / 120);
      const now = energy(current);
      expect(now).toBeLessThanOrEqual(previous + 1e-6);
      previous = now;
    }
  });

  it("a dead-drop part (e = 0) lands and stays put", () => {
    const { body: landed } = run(body({ position: [0, 500, 0], restitution: 0 }), 2, 1 / 120);
    expect(landed.resting).toBe(true);
    expect(landed.position[1]).toBeCloseTo(2, 9); // resting on its own radius
    expect(landed.velocity[1]).toBe(0);
  });

  it("comes to rest instead of bouncing forever", () => {
    // Zeno's paradox in integrator form: e applied to an ever-smaller speed gives infinitely
    // many ever-shorter bounces, which shows up as a part jittering on the floor for good.
    const { body: settled } = run(body({ position: [0, 400, 0], restitution: 0.9 }), 20, 1 / 120);
    expect(settled.resting).toBe(true);
    expect(Math.abs(settled.velocity[1])).toBe(0);
    expect(settled.position[1]).toBeCloseTo(2, 9);
  });

  it("does not sink through the floor even when dropped from absurd height", () => {
    const { body: landed } = run(body({ position: [0, 100000, 0] }), 6, 1 / 60);
    expect(landed.position[1]).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it("honours a raised floor", () => {
    const { body: landed } = run(body({ position: [0, 300, 0], restitution: 0 }), 2, 1 / 120, {
      groundY: 50,
    });
    expect(landed.position[1]).toBeCloseTo(52, 9);
  });
});

describe("the gravity setting", () => {
  it("falls slower on the Moon and faster on Jupiter", () => {
    const after = (gravity: number) =>
      run(body({ position: [0, 5000, 0] }), 0.5, 1 / 240, { gravity }).body.position[1];
    expect(after(GRAVITY_PRESETS.moon)).toBeGreaterThan(after(GRAVITY_PRESETS.earth));
    expect(after(GRAVITY_PRESETS.earth)).toBeGreaterThan(after(GRAVITY_PRESETS.jupiter));
    // The Moon is 1/6 g, so in the same time it falls about a sixth as far.
    const moonDrop = 5000 - after(GRAVITY_PRESETS.moon);
    const earthDrop = 5000 - after(GRAVITY_PRESETS.earth);
    expect(moonDrop / earthDrop).toBeCloseTo(GRAVITY_PRESETS.moon / EARTH_GRAVITY, 6);
  });

  it("with gravity switched off, a part drifts in a straight line forever", () => {
    const { body: drifting } = run(
      body({ position: [0, 200, 0], velocity: [10, 0, 5] }),
      10,
      1 / 60,
      { gravity: GRAVITY_PRESETS.zero },
    );
    expect(drifting.position[1]).toBeCloseTo(200, 9);
    expect(drifting.position[0]).toBeCloseTo(100, 6);
    expect(drifting.position[2]).toBeCloseTo(50, 6);
  });
});

describe("friction on the floor", () => {
  it("a part sliding along the ground is brought to a stop, and never reversed", () => {
    let current = body({ position: [0, 2, 0], velocity: [200, 0, 0], resting: true, restitution: 0 });
    for (let i = 0; i < 600; i++) current = stepBody(current, 1 / 60);
    expect(current.velocity[0]).toBe(0);
    expect(current.position[0]).toBeGreaterThan(0); // it travelled forward before stopping
  });

  it("rolls as it travels: angle = distance / radius, the no-slip relation", () => {
    let current = body({ position: [0, 2, 0], velocity: [100, 0, 0], resting: true, restitution: 0 });
    const startX = current.position[0];
    for (let i = 0; i < 30; i++) current = stepBody(current, 1 / 60, { friction: 0 });
    const travelled = current.position[0] - startX;
    expect(current.rotation).toBeCloseTo(travelled / current.radius, 6);
  });

  it("a frictionless part keeps sliding", () => {
    let current = body({ position: [0, 2, 0], velocity: [200, 0, 0], resting: true, restitution: 0 });
    for (let i = 0; i < 600; i++) current = stepBody(current, 1 / 60, { friction: 0 });
    expect(current.velocity[0]).toBeCloseTo(200, 9);
  });
});

describe("REST_SPEED", () => {
  it("is the speed gravity imparts in about one frame, so nothing visible is discarded", () => {
    expect(REST_SPEED).toBeCloseTo(G / 60, -1);
  });
});
