import { describe, it, expect } from "vitest";
import {
  driveRatios,
  shaftBalances,
  stepMotors,
  motorTorque,
  momentOfInertia,
  rollingDirection,
  gearMass,
  BEARING_DAMPING,
  LOAD_DAMPING,
  GEAR_THICKNESS,
} from "../../src/sim/dynamics";
import { buildEdges } from "../../src/sim/graph";
import { propagateRotation } from "../../src/sim/rotation";
import { tick } from "../../src/sim/simulation";
import { PRESETS } from "../../src/sim/presets";
import { STEEL_DENSITY, unitsToMetres, GRAVITY_PRESETS } from "../../src/sim/units";
import type { GearInstance, LayoutState } from "../../src/sim/types";

function gear(overrides: Partial<GearInstance> = {}): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

/** A crank meshed with one spur wheel, `teeth` apart in size. Mesh distance is the sum of the
 *  pitch radii, which is what `evaluatePair` requires. */
function pair(driverTeeth: number, drivenTeeth: number, motor = { freeSpeed: 10, stallTorque: 0.5 }): LayoutState {
  const centres = (driverTeeth + drivenTeeth) / 2;
  return {
    gears: [
      gear({ id: "drive", type: "crank", teeth: driverTeeth, motor }),
      gear({ id: "driven", teeth: drivenTeeth, position: [centres, 0, 0] }),
    ],
    remoteLinks: [],
  };
}

describe("mass and inertia come from what the part is actually drawn as", () => {
  it("masses a gear as the steel disc of its own pitch radius", () => {
    const g = gear({ teeth: 20, module: 1 }); // pitch radius 10 units = 0.1 m
    const r = unitsToMetres(10);
    expect(gearMass(g)).toBeCloseTo(STEEL_DENSITY * Math.PI * r * r * unitsToMetres(GEAR_THICKNESS), 12);
    // ~0.99 kg: a 20 cm steel disc 4 mm thick. A believable lump of metal, not a free parameter.
    expect(gearMass(g)).toBeGreaterThan(0.9);
    expect(gearMass(g)).toBeLessThan(1.1);
  });

  it("uses J = m r^2 / 2, so inertia grows with the FOURTH power of size", () => {
    const small = gear({ teeth: 10 });
    const big = gear({ teeth: 20 }); // twice the radius
    expect(momentOfInertia(big) / momentOfInertia(small)).toBeCloseTo(16, 9);
  });

  it("gives a rack no rotational inertia -- it translates", () => {
    expect(momentOfInertia(gear({ type: "rack" }))).toBe(0);
    expect(gearMass(gear({ type: "rack" }))).toBeGreaterThan(0); // but it still has mass
  });

  it("still masses a zero-teeth part, which has no pitch circle but does occupy space", () => {
    expect(gearMass(gear({ type: "load", teeth: 0, module: 2 }))).toBeGreaterThan(0);
    expect(momentOfInertia(gear({ type: "load", teeth: 0, module: 2 }))).toBeGreaterThan(0);
  });
});

describe("the motor curve", () => {
  const motor = { freeSpeed: 10, stallTorque: 0.5 };

  it("makes full torque at a standstill and none at its free speed", () => {
    expect(motorTorque(motor, 0)).toBeCloseTo(0.5, 12);
    expect(motorTorque(motor, 10)).toBeCloseTo(0, 12);
    expect(motorTorque(motor, 5)).toBeCloseTo(0.25, 12); // linear between
  });

  it("pushes BACK when driven past its free speed, which is how a machine brakes downhill", () => {
    expect(motorTorque(motor, 15)).toBeLessThan(0);
  });

  it("is sign-correct in reverse without any special case", () => {
    const reverse = { freeSpeed: -10, stallTorque: 0.5 };
    expect(motorTorque(reverse, 0)).toBeCloseTo(-0.5, 12);
    expect(motorTorque(reverse, -10)).toBeCloseTo(0, 12);
  });
});

describe("drive ratios", () => {
  it("agrees with propagateRotation on every bundled preset, gear for gear", () => {
    // The dynamics refers every part's inertia and torque back to one shaft through these
    // ratios, so if they ever disagreed with the speeds the kinematics actually produces, the
    // reflected inertia would be wrong everywhere and silently: a machine would simply feel the
    // wrong weight. Pinned here against the real presets rather than left to inspection.
    for (const preset of PRESETS) {
      const layout = preset.build();
      const edges = buildEdges(layout.gears, layout.remoteLinks);
      // Give every root a speed to compare against; a motorised preset starts at rest.
      const spun = layout.gears.map((g) =>
        g.type === "crank" ? { ...g, angularVelocity: g.angularVelocity || 1.7 } : g,
      );
      const { angularVelocities } = propagateRotation(spun, edges);
      const ratios = driveRatios(spun, edges);
      for (const g of spun) {
        const r = ratios.get(g.id);
        if (!r || r.linear) continue; // a rack's ratio refers to its pinion, not to itself
        const rootSpeed = spun.find((x) => x.id === r.root)!.angularVelocity;
        expect(angularVelocities.get(g.id)!).toBeCloseTo(r.ratio * rootSpeed, 9);
      }
    }
  });

  it("inverts through a reduction: a 10T driving a 40T turns it a quarter as fast, backwards", () => {
    const layout = pair(10, 40);
    const ratios = driveRatios(layout.gears, buildEdges(layout.gears, layout.remoteLinks));
    expect(ratios.get("driven")!.ratio).toBeCloseTo(-0.25, 9);
  });
});

describe("reflected inertia", () => {
  it("refers a driven gear's inertia back through the SQUARE of its ratio", () => {
    // The textbook result, and the reason a reduction makes a load feel light at the motor: a
    // gear turning a quarter as fast contributes a SIXTEENTH of its own inertia at the input.
    const layout = pair(10, 40);
    const balance = shaftBalances(layout.gears, buildEdges(layout.gears, layout.remoteLinks), [])
      .get("drive")!;
    const driver = layout.gears[0];
    const driven = layout.gears[1];
    const expected = momentOfInertia(driver) + momentOfInertia(driven) * 0.25 * 0.25;
    expect(balance.inertia).toBeCloseTo(expected, 12);
  });

  it("a bigger machine takes longer to come up to speed", () => {
    const spinUp = (drivenTeeth: number) => {
      let layout = pair(10, drivenTeeth);
      for (let i = 0; i < 30; i++) {
        const r = tick(layout, 1 / 60, 1, { wear: false });
        layout = { ...layout, gears: r.gears };
      }
      return Math.abs(layout.gears[0].angularVelocity);
    };
    expect(spinUp(60)).toBeLessThan(spinUp(10));
  });
});

describe("a motorised machine behaves like a machine", () => {
  it("starts from rest and accelerates, instead of snapping to speed", () => {
    let layout = pair(20, 20);
    expect(layout.gears[0].angularVelocity).toBe(0);
    const speeds: number[] = [];
    for (let i = 0; i < 60; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears };
      speeds.push(layout.gears[0].angularVelocity);
    }
    expect(speeds[0]).toBeGreaterThan(0);
    expect(speeds[0]).toBeLessThan(1); // not there yet after one frame
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    expect(speeds.at(-1)!).toBeGreaterThan(9); // most of the way to the 10 rad/s free speed
  });

  it("settles just short of its free speed, held back by its own bearings", () => {
    let layout = pair(20, 20);
    for (let i = 0; i < 2000; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears };
    }
    const settled = layout.gears[0].angularVelocity;
    expect(settled).toBeLessThan(10);
    expect(settled).toBeGreaterThan(9.8);
    // At the steady state the motor's pull exactly balances the drag: T(w) = D * w.
    const balance = shaftBalances(layout.gears, buildEdges(layout.gears, layout.remoteLinks), [])
      .get("drive")!;
    expect(balance.acceleration).toBeCloseTo(0, 4);
  });

  it("runs SLOWER with a load hung on it, and recovers when the load is taken off", () => {
    // The point of modelling a torque curve at all: speed is not a setting, it is what is left
    // after the machine has fought everything attached to it.
    const settle = (withLoad: boolean) => {
      const layout = pair(20, 20);
      if (withLoad) {
        // A load couples to a shaft rather than tooth-meshing -- coincident with the driven gear.
        layout.gears.push(gear({ id: "brake", type: "load", teeth: 0, module: 2, position: [20, 0, 0] }));
      }
      let current = layout;
      for (let i = 0; i < 3000; i++) {
        const r = tick(current, 1 / 60, 1, { wear: false });
        current = { ...current, gears: r.gears };
      }
      return current.gears[0].angularVelocity;
    };
    expect(LOAD_DAMPING).toBeGreaterThan(BEARING_DAMPING);
    expect(settle(true)).toBeLessThan(settle(false));
  });

  it("does not blow up at an absurd time step, where an explicit integrator would", () => {
    // The train's time constant J/D here is a small fraction of a second; an explicit Euler step
    // of a whole second would overshoot, reverse, and diverge. The implicit form cannot.
    let layout = pair(20, 20);
    for (let i = 0; i < 50; i++) {
      const speeds = stepMotors(layout.gears, buildEdges(layout.gears, layout.remoteLinks), [], 1);
      layout = {
        ...layout,
        gears: layout.gears.map((g) =>
          speeds.has(g.id) ? { ...g, angularVelocity: speeds.get(g.id)! } : g,
        ),
      };
      expect(Number.isFinite(layout.gears[0].angularVelocity)).toBe(true);
      expect(Math.abs(layout.gears[0].angularVelocity)).toBeLessThanOrEqual(10);
    }
    expect(layout.gears[0].angularVelocity).toBeGreaterThan(9.8);
  });

  it("leaves a crank WITHOUT a motor exactly as it was -- an ideal hand-turned handle", () => {
    const layout = pair(20, 20, undefined as never);
    delete (layout.gears[0] as Partial<GearInstance>).motor;
    layout.gears[0].angularVelocity = -2.5;
    let current = layout;
    for (let i = 0; i < 100; i++) {
      const r = tick(current, 1 / 60, 1, { wear: false });
      current = { ...current, gears: r.gears };
      expect(current.gears[0].angularVelocity).toBe(-2.5);
    }
  });
});

describe("rollingDirection", () => {
  it("is the right-hand rule, not a convention someone picked", () => {
    // No-slip holds the contact point still, so the centre travels at omega x r measured up
    // from the contact. A wheel about +X therefore carries its vehicle toward +Z. Getting this
    // backwards gives a vehicle that drives away tail-first and looks otherwise perfect, which
    // is exactly why no preset writes the direction down by hand.
    expect(rollingDirection([1, 0, 0])).toEqual([0, 0, 1]);
    expect(rollingDirection([-1, 0, 0])).toEqual([0, 0, -1]);
    expect(rollingDirection([0, 0, 1])).toEqual([-1, 0, 0]);
    expect(rollingDirection([2, 0, 0])).toEqual([0, 0, 1]); // unnormalised axis is fine
  });

  it("returns nothing for a wheel lying flat, which rolls nowhere", () => {
    expect(rollingDirection([0, 1, 0])).toEqual([0, 0, 0]);
  });

  it("sends the car the way its body faces", () => {
    // The cabin sits at the -Z end of the car, so +Z is the nose.
    const car = PRESETS.find((p) => p.id === "car")!.build();
    expect(car.vehicles![0].direction).toEqual([0, 0, 1]);
    let layout = car;
    for (let i = 0; i < 90; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
    }
    expect(layout.vehicles![0].distance).toBeGreaterThan(0); // nose-first, not tail-first
  });
});

describe("gravity reaches the gear train", () => {
  it("the same car runs faster on the Moon, because rolling resistance is a fraction of WEIGHT", () => {
    const car = PRESETS.find((p) => p.id === "car")!;
    const settle = (gravity: number) => {
      let layout = car.build();
      for (let i = 0; i < 120; i++) {
        const r = tick(layout, 1 / 60, 1, { wear: false, gravity });
        layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
      }
      return Math.abs(layout.gears[0].angularVelocity);
    };
    expect(settle(GRAVITY_PRESETS.moon)).toBeGreaterThan(settle(GRAVITY_PRESETS.earth));
    expect(settle(GRAVITY_PRESETS.earth)).toBeGreaterThan(settle(GRAVITY_PRESETS.jupiter));
  });
});
