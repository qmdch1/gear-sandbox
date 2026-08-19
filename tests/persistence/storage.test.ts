// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from "../../src/persistence/storage";
import type { GearInstance } from "../../src/sim/types";

const sample: GearInstance[] = [{
  id: "a", type: "crank", position: [0, 0, 0], axis: [0, 1, 0],
  teeth: 20, module: 1, durabilityMax: 200, durabilityCurrent: 200,
  broken: false, rotation: 0, angularVelocity: 1,
}];

describe("localStorage persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns null when nothing has been saved yet", () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it("saves and loads a gear layout", () => {
    saveToLocalStorage(sample);
    expect(loadFromLocalStorage()).toEqual(sample);
  });
});

describe("file export/import", () => {
  it("round-trips a gear layout through a Blob/File", async () => {
    const blob = exportToFile(sample);
    const file = new File([blob], "layout.json", { type: "application/json" });
    const restored = await importFromFile(file);
    expect(restored).toEqual(sample);
  });
});
