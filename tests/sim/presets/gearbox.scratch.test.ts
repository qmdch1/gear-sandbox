import { describe, it } from "vitest";
import * as fs from "node:fs";
import { createGearboxPreset, createGearboxProps } from "../../../src/sim/presets/gearbox";
import { buildEdges, classify } from "../../../src/sim/graph";
import { tick } from "../../../src/sim/simulation";

const lines: string[] = [];
const console = { log: (...a: unknown[]) => lines.push(a.join(" ")) };

describe("scratch", () => {
  it("dumps", () => {
    const layout = createGearboxPreset();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    // eslint-disable-next-line no-console
    console.log("EDGES", edges.length);
    for (const e of edges) console.log(`  ${e.kind.padEnd(9)} ${e.a} -> ${e.b}  ratio=${e.ratio} oneWay=${e.oneWay}`);
    const d = classify(layout.gears, edges);
    console.log("unconnected", d.unconnectedIds);
    console.log("noPower", d.noPowerIds);
    console.log("overlap", d.overlapPairs);

    let l = layout;
    let minL = 0;
    let maxL = 0;
    for (let i = 0; i < 1200; i++) {
      const r = tick(l, 1 / 60, 1);
      l = { gears: r.gears, remoteLinks: l.remoteLinks };
      const rail = l.gears.find((g) => g.id === "변속기_시프트레일")!;
      minL = Math.min(minL, rail.linearPosition ?? 0);
      maxL = Math.max(maxL, rail.linearPosition ?? 0);
    }
    for (const g of l.gears) {
      console.log(`  ${g.id.padEnd(22)} w=${g.angularVelocity.toFixed(4)} rot=${g.rotation.toFixed(3)} lin=${(g.linearPosition ?? 0).toFixed(3)} broken=${g.broken} dur=${g.durabilityCurrent.toFixed(1)}`);
    }
    console.log("rail travel", minL, maxL);
    console.log("props", createGearboxProps().length);
    const gearIds = new Set(layout.gears.map((g) => g.id));
    for (const p of createGearboxProps()) {
      for (const t of [p.attachTo, p.slideWith, p.windWith?.gear, p.linkTo?.gear]) {
        if (t && !gearIds.has(t)) console.log("BAD TARGET", t);
      }
    }
    console.log("textures", [...new Set(createGearboxProps().map((p) => p.texture).filter(Boolean))].join(","));
    fs.writeFileSync("scratch-dump.txt", lines.join("\n"));
  });
});
