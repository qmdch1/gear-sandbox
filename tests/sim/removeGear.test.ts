import { describe, it, expect } from "vitest";
import { removeGear } from "../../src/sim/removeGear";
import type { GearInstance, RemoteLink } from "../../src/sim/types";

function makeGear(overrides: Partial<GearInstance>): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("removeGear", () => {
  it("drops the gear with the given id, keeping the rest", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" }), makeGear({ id: "c" })];
    const { gears: result } = removeGear("b", gears, []);
    expect(result.map((g) => g.id)).toEqual(["a", "c"]);
  });

  it("drops a remote link that references the deleted gear as either endpoint", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" }), makeGear({ id: "c" })];
    const remoteLinks: RemoteLink[] = [
      { a: "a", b: "b", kind: "chain" },
      { a: "c", b: "a", kind: "belt" },
      { a: "b", b: "c", kind: "chain" },
    ];
    const { remoteLinks: result } = removeGear("a", gears, remoteLinks);
    expect(result).toEqual([{ a: "b", b: "c", kind: "chain" }]);
  });

  it("leaves links untouched when the deleted gear isn't referenced by any", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" }), makeGear({ id: "c" })];
    const remoteLinks: RemoteLink[] = [{ a: "b", b: "c", kind: "belt" }];
    const { gears: resultGears, remoteLinks: resultLinks } = removeGear("a", gears, remoteLinks);
    expect(resultGears.map((g) => g.id)).toEqual(["b", "c"]);
    expect(resultLinks).toEqual(remoteLinks);
  });

  it("is a safe no-op on gears/links when the id doesn't match anything", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" })];
    const remoteLinks: RemoteLink[] = [{ a: "a", b: "b", kind: "chain" }];
    const { gears: resultGears, remoteLinks: resultLinks } = removeGear("nonexistent", gears, remoteLinks);
    expect(resultGears).toEqual(gears);
    expect(resultLinks).toEqual(remoteLinks);
  });

  it("does not mutate the input arrays", () => {
    const gears = [makeGear({ id: "a" }), makeGear({ id: "b" })];
    const remoteLinks: RemoteLink[] = [{ a: "a", b: "b", kind: "chain" }];
    removeGear("a", gears, remoteLinks);
    expect(gears).toHaveLength(2);
    expect(remoteLinks).toHaveLength(1);
  });
});
