import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { stepBody, type FallingBody } from "../../src/sim/gravity";

function body(overrides: Partial<FallingBody> = {}): FallingBody {
  return { id: "part", position: [0,100,0], velocity: [0,0,0], radius: 2, mass: 0.5, restitution: 0.6, rotation: 0, resting: false, ...overrides };
}
it("probe", () => {
  const out: string[] = [];
  for (const [h, e] of [[100000,0.6],[100000,0],[15000,0.6],[15000,0]] as [number,number][]) {
    let cur = body({position:[0,h,0], restitution: e});
    let minY = Infinity, restAt = -1, firstContact = -1;
    const dt = 1/60;
    for (let i=0;i<60*200;i++) {
      const before = cur;
      cur = stepBody(cur, dt);
      minY = Math.min(minY, cur.position[1]);
      if (firstContact < 0 && (cur.resting || cur.velocity[1] > before.velocity[1])) firstContact = (i+1)*dt;
      if (restAt < 0 && cur.resting) restAt = (i+1)*dt;
    }
    out.push(`h=${h} e=${e}: minY=${minY} firstContact=${firstContact}s restAt=${restAt}s finalY=${cur.position[1]} resting=${cur.resting}`);
  }
  writeFileSync("C:/Users/BESPIN~1/AppData/Local/Temp/probe2.txt", out.join("\n"));
});
