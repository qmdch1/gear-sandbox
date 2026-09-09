import { describe, it, expect } from "vitest";
import { repairGear, repairAll, needsRepair, countNeedingRepair } from "../../src/sim/repair";
import { createShowroomLayout } from "../../src/sim/showroom";
import { tick } from "../../src/sim/simulation";
import type { GearInstance } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance> = {}): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("needsRepair", () => {
  it("is false at factory condition and true for any wear, including broken", () => {
    expect(needsRepair(makeGear())).toBe(false);
    expect(needsRepair(makeGear({ durabilityCurrent: 99.9 }))).toBe(true);
    expect(needsRepair(makeGear({ durabilityCurrent: 0, broken: true }))).toBe(true);
  });
});

describe("repairGear", () => {
  it("restores a worn gear to full durability without disturbing anything else", () => {
    const worn = makeGear({
      id: "worn", durabilityCurrent: 12.5, rotation: 4.2, angularVelocity: -1.5,
      position: [3, 4, 5], teeth: 33,
    });
    const fixed = repairGear(worn);
    expect(fixed.durabilityCurrent).toBe(fixed.durabilityMax);
    expect(fixed.broken).toBe(false);
    // Repair is maintenance, not a reset: where the gear is, how fast it turns and how far it
    // has already turned all survive it.
    expect(fixed.rotation).toBe(4.2);
    expect(fixed.angularVelocity).toBe(-1.5);
    expect(fixed.position).toEqual([3, 4, 5]);
    expect(fixed.teeth).toBe(33);
    expect(fixed.id).toBe("worn");
  });

  it("revives a broken gear", () => {
    const dead = makeGear({ durabilityCurrent: 0, broken: true });
    const fixed = repairGear(dead);
    expect(fixed.broken).toBe(false);
    expect(fixed.durabilityCurrent).toBe(100);
  });

  it("does not mutate its input", () => {
    const worn = makeGear({ durabilityCurrent: 5, broken: false });
    repairGear(worn);
    expect(worn.durabilityCurrent).toBe(5);
  });

  it("passes an undamaged gear through by reference, so a no-op repair allocates nothing", () => {
    const fresh = makeGear();
    expect(repairGear(fresh)).toBe(fresh);
  });
});

describe("repairAll / countNeedingRepair", () => {
  it("counts and repairs exactly the damaged gears", () => {
    const gears = [
      makeGear({ id: "a" }),
      makeGear({ id: "b", durabilityCurrent: 40 }),
      makeGear({ id: "c", durabilityCurrent: 0, broken: true }),
    ];
    expect(countNeedingRepair(gears)).toBe(2);
    const fixed = repairAll(gears);
    expect(countNeedingRepair(fixed)).toBe(0);
    for (const g of fixed) {
      expect(g.durabilityCurrent).toBe(g.durabilityMax);
      expect(g.broken).toBe(false);
    }
    expect(fixed[0]).toBe(gears[0]); // untouched gear passed through
  });
});

describe("repair against the real simulation", () => {
  it("brings a showroom that has worn itself to a standstill back to life", () => {
    // The concrete failure this feature answers: wear only ever subtracts, so the bundled
    // showroom destroys itself. Measured here, not assumed.
    let layout = createShowroomLayout();
    const total = layout.gears.length;
    for (let i = 0; i < 60 * 150; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    const brokenBefore = layout.gears.filter((g) => g.broken).length;
    const movingBefore = layout.gears.filter((g) => Math.abs(g.angularVelocity) > 1e-9).length;
    expect(brokenBefore).toBeGreaterThan(0); // it really does rot
    expect(movingBefore).toBeLessThan(total);

    layout = { gears: repairAll(layout.gears), remoteLinks: layout.remoteLinks };
    expect(layout.gears.filter((g) => g.broken)).toHaveLength(0);

    // And it runs again: one tick after the repair, the machines are turning as they did when
    // new. `rotation.ts` treats a broken gear as a dead end, so this only holds if the repair
    // actually cleared `broken` rather than just topping durability up.
    const after = tick(layout, 1 / 60, 1);
    const movingAfter = after.gears.filter((g) => Math.abs(g.angularVelocity) > 1e-9).length;
    expect(movingAfter).toBeGreaterThan(movingBefore);

    const fresh = createShowroomLayout();
    const movingFresh = tick(fresh, 1 / 60, 1).gears.filter(
      (g) => Math.abs(g.angularVelocity) > 1e-9,
    ).length;
    expect(movingAfter).toBe(movingFresh);
  });

  it("wears down again after repair -- repair restores the mechanic, it does not disable it", () => {
    let layout = createShowroomLayout();
    for (let i = 0; i < 60 * 60; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    layout = { gears: repairAll(layout.gears), remoteLinks: layout.remoteLinks };
    const full = layout.gears.filter((g) => g.durabilityCurrent === g.durabilityMax).length;
    expect(full).toBe(layout.gears.length);

    for (let i = 0; i < 60 * 30; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    expect(countNeedingRepair(layout.gears)).toBeGreaterThan(0);
  });
});
