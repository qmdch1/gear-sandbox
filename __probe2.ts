import { createCarPreset } from "./src/sim/presets/car";
import { buildEdges } from "./src/sim/graph";
import { shaftBalances } from "./src/sim/dynamics";
import { tick } from "./src/sim/simulation";
import type { LayoutState } from "./src/sim/types";

function run(seconds: number, massOverride?: number, dropGearInertia = false) {
  let layout: LayoutState = createCarPreset();
  if (massOverride !== undefined) layout = { ...layout, vehicles: layout.vehicles!.map(v => ({ ...v, mass: massOverride })) };
  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const r = tick(layout, 1 / 60, 1, { wear: false });
    layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
    const t = (i + 1) / 60;
    if (Math.abs(t - Math.round(t * 4) / 4) < 1e-9) samples.push([t, layout.vehicles![0].distance, layout.gears[0].angularVelocity]);
  }
  return { layout, samples };
}

function tau(mass: number) {
  const l = createCarPreset();
  const v = l.vehicles!.map(x => ({ ...x, mass }));
  const b = shaftBalances(l.gears, buildEdges(l.gears, l.remoteLinks ?? []), v)!.get("자동차_엔진")!;
  return { J: b.inertia, D: b.damping, tau: b.inertia / b.damping };
}

const base = tau(2), dbl = tau(4);
console.log(`tau @ CAR_MASS=2 : J=${base.J.toExponential(4)} tau=${base.tau.toFixed(4)}s`);
console.log(`tau @ CAR_MASS=4 : J=${dbl.J.toExponential(4)} tau=${dbl.tau.toFixed(4)}s`);
console.log(`ACTUAL tau scaling when mass doubles = ${(dbl.tau/base.tau).toFixed(4)}x`);
console.log(`PREDICTED from "6x the four wheels together / nearly all its effort" ~= ${( (6/7*2 + 1/7) ).toFixed(3)}x  (i.e. ~2x)`);

const a = run(3), b = run(3, 4);
console.log("\n t(s)   dist(mass=2)   dist(mass=4)   engine w (m=2)");
for (let i = 0; i < a.samples.length; i++) {
  if (a.samples[i][0] % 0.5 !== 0) continue;
  console.log(` ${a.samples[i][0].toFixed(2)}   ${a.samples[i][1].toFixed(3).padStart(9)}   ${b.samples[i][1].toFixed(3).padStart(9)}   ${a.samples[i][2].toFixed(4)}`);
}
// What "nearly all its effort" would mean if literally true: drop the drivetrain's own inertia.
const Jveh = 3.2e-3, D = base.D;
console.log(`\nIf the wheels+shafts really were negligible ("nearly all"): J=${Jveh.toExponential(4)} tau=${(Jveh/D).toFixed(4)}s vs the real ${base.tau.toFixed(4)}s  -> ${(100*(1-(Jveh/D)/base.tau)).toFixed(1)}% error`);
