import { describe, it, expect } from "vitest";
import { PRESETS } from "../../src/sim/presets";
import { GEAR_DEFS } from "../../src/sim/gearDefs";
import type { GearType } from "../../src/sim/types";

describe("gear type coverage", () => {
  it("uses every one of the twelve gear types in at least one bundled preset", () => {
    // A type no preset uses is a type nothing exercises end to end: its branch in meshing.ts is
    // only ever reached by unit tests written against it, never by a real machine. `differential`
    // and `worm` were the last two holdouts until the differential axle and the worm table.
    const used = new Map<GearType, string[]>();
    for (const preset of PRESETS) {
      for (const gear of preset.build().gears) {
        const list = used.get(gear.type) ?? [];
        if (!list.includes(preset.id)) list.push(preset.id);
        used.set(gear.type, list);
      }
    }
    const allTypes = Object.keys(GEAR_DEFS) as GearType[];
    const unused = allTypes.filter((t) => !used.has(t));
    expect(unused, `gear types no preset uses: ${unused.join(", ")}`).toEqual([]);
  });
});
