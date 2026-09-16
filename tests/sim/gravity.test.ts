import { describe, it, expect } from "vitest";
import { stepBody, timeToFloor, restSpeed, REST_SPEED, type FallingBody } from "../../src/sim/gravity";
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

  it("does not sink through the floor at an impact speed of 140 m/s", () => {
    // The tunnelling test, and it has to actually LAND to be one. From 100000 units at
    // 981 units/s^2 the fall alone takes sqrt(2h/g) = 14.3 s and arrives at 14007 units/s --
    // 233 units per 60 Hz frame, more than a hundred times the body's own radius. The six
    // seconds this used to run left it still 82000 units up in clear air, asserting that
    // something which had never been near the floor had not gone through it; it would have
    // passed with the whole contact solver deleted.
    const fallTime = Math.sqrt((2 * 100000) / G);
    const impact = G * fallTime;
    expect(fallTime).toBeCloseTo(14.28, 1);
    expect(impact / 60).toBeGreaterThan(200); // units crossed per frame at the moment of contact

    // A dead drop so it lands ONCE: this is about the contact, not about how long a lively
    // part takes to settle (at e = 0.6 that rebound alone climbs 36000 units and the whole
    // sequence runs for the better part of a minute -- the separate rest test covers it).
    let current = body({ position: [0, 100000, 0], restitution: 0 });
    let lowest = Infinity;
    for (let i = 0; i < Math.round((fallTime + 1) * 60); i++) {
      current = stepBody(current, 1 / 60);
      lowest = Math.min(lowest, current.position[1]);
    }
    expect(current.resting).toBe(true);
    expect(current.position[1]).toBeCloseTo(2, 9); // exactly on its own radius, not inside
    expect(lowest).toBeGreaterThanOrEqual(2 - 1e-9); // and never dipped below at any frame
  });

  it("never dips below the floor at any frame of a long, lively bounce", () => {
    let current = body({ position: [0, 6000, 0], velocity: [80, 0, -40], restitution: 0.85 });
    for (let i = 0; i < 60 * 60; i++) {
      current = stepBody(current, 1 / 60);
      expect(current.position[1]).toBeGreaterThanOrEqual(2 - 1e-9);
    }
    expect(current.resting).toBe(true); // and it does eventually settle
  });

  it("clamps restitution into [0, 1], so no part can launch itself out of the world", () => {
    // e > 1 returns more energy than the impact carried in, so each bounce would climb higher
    // than the last. The clamp is the only thing between a hand-edited save and a part leaving
    // the scene for good.
    const h = 300;
    const runaway = run(body({ position: [0, h, 0], radius: 0, restitution: 4 }), 4, 1 / 600);
    expect(runaway.apexAfterFirstContact).toBeLessThanOrEqual(h + 1e-6);
    // Clamped to exactly 1 -- a perfect bounce, returning to the height it fell from.
    expect(runaway.apexAfterFirstContact).toBeCloseTo(h, 0);
    // And a negative e behaves as a dead drop, not as a body sucked downward.
    const negative = run(body({ position: [0, h, 0], restitution: -2 }), 2, 1 / 240).body;
    expect(negative.resting).toBe(true);
    expect(negative.position[1]).toBeCloseTo(2, 9);
  });

  it("a bouncing part is braked sideways by the contact, in proportion to how hard it lands", () => {
    // Coulomb friction at a bounce can take mu*(1+e) times the approach speed out of the
    // horizontal motion. Nothing asserted this, so the whole tangential branch could have been
    // deleted without a single test noticing.
    // Dropped 40 units it arrives at 280 units/s, so a mu = 0.4 floor takes
    // 0.4 * (1 + 0.8) * 280 = 202 units/s of sideways speed at the bounce -- enough to be
    // unmistakable against a 600 unit/s slide, and not enough to stop it dead, which would
    // make the comparison below say nothing.
    const sideways = (friction: number) =>
      run(body({ position: [0, 40, 0], velocity: [600, 0, 0], restitution: 0.8 }), 0.4, 1 / 600, {
        friction,
      }).body.velocity[0];
    expect(sideways(0)).toBeCloseTo(600, 6); // frictionless: it keeps every bit of it
    expect(sideways(0.4)).toBeLessThan(600); // and a real floor takes some away
    expect(sideways(0.4)).toBeGreaterThan(0); // but never reverses it
    expect(sideways(0.8)).toBeLessThan(sideways(0.4)); // a grippier floor takes more
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

describe("the resting threshold follows the gravity and the step", () => {
  it("still lets the Moon make the small bounces Earth's threshold would have killed", () => {
    // A constant sized for Earth at 60 Hz (16 units/s) is ten times too big on the Moon, where
    // gravity imparts only 1.6 units/s per frame: every late bounce of a lunar drop would have
    // been rounded away into an early landing.
    expect(restSpeed(accelerationToUnits(GRAVITY_PRESETS.earth), 1 / 60)).toBeCloseTo(REST_SPEED, 0);
    expect(restSpeed(accelerationToUnits(GRAVITY_PRESETS.moon), 1 / 60)).toBeLessThan(REST_SPEED / 5);
    // ...and it is finer at a finer step, discarding less.
    expect(restSpeed(accelerationToUnits(GRAVITY_PRESETS.earth), 1 / 240)).toBeLessThan(REST_SPEED / 3);

    const bounces = (gravity: number) => {
      let current = body({ position: [0, 400, 0], restitution: 0.7 });
      let n = 0;
      let previous = 0;
      for (let i = 0; i < 60 * 120; i++) {
        const next = stepBody(current, 1 / 60, { gravity });
        if (next.velocity[1] > previous + 1) n++;
        previous = next.velocity[1];
        current = next;
        if (current.resting) break;
      }
      return n;
    };
    expect(bounces(GRAVITY_PRESETS.moon)).toBeGreaterThan(bounces(GRAVITY_PRESETS.earth));
  });

  it("with gravity off a body never 'lands', because nothing is holding it down", () => {
    expect(restSpeed(0, 1 / 60)).toBe(0);
  });

  it("parks a body that runs out of contacts inside one step instead of leaving it thrashing", () => {
    // A single enormous step with a perfectly elastic body exhausts the contact budget. The loop
    // condition alone would drop the unspent time AND leave the body still falling, so the next
    // step reproduced the same thrash forever and the part buzzed on the floor.
    let current = body({ position: [0, 2.0001, 0], velocity: [0, -5000, 0], restitution: 1 });
    current = stepBody(current, 5);
    expect(Number.isFinite(current.position[1])).toBe(true);
    expect(current.position[1]).toBeGreaterThanOrEqual(2 - 1e-9);
  });
});
