import { createLocomotivePreset, DRIVE_SPEED, PINION_RATIO } from "./src/sim/presets/locomotive";
import { tick } from "./src/sim/simulation";
import type { LayoutState } from "./src/sim/types";

let layout: LayoutState = createLocomotivePreset();
let peak = 0;
let peakT = 0;
for (let i = 0; i < 60 * 60; i++) {
  const r = tick(layout, 1 / 60, 1, { wear: false });
  layout = { ...layout, gears: r.gears, vehicles: r.vehicles };
  const w = Math.abs(layout.gears[0].angularVelocity);
  if (w > peak) { peak = w; peakT = i / 60; }
}
console.log("peak |w| over 60s (with reverser):", peak.toFixed(4), "at t=", peakT.toFixed(2), "s");
console.log("fraction of DRIVE_SPEED:", (peak / DRIVE_SPEED).toFixed(4));
console.log("pinion at peak would be:", (-PINION_RATIO * peak).toFixed(4), "vs doc -3.2");

// free run, no reverser / no limit -> steady state
const fresh = createLocomotivePreset();
let free: LayoutState = {
  ...fresh,
  gears: fresh.gears.map((g) => ({ ...g, reverseAt: undefined })),
  vehicles: fresh.vehicles!.map((v) => ({ ...v, limit: undefined })),
};
for (let i = 0; i < 60 * 60; i++) {
  const r = tick(free, 1 / 60, 1, { wear: false });
  free = { ...free, gears: r.gears, vehicles: r.vehicles };
}
const ss = free.gears[0].angularVelocity;
console.log("steady state (no reverser):", ss.toFixed(4), "= ", (ss / DRIVE_SPEED * 100).toFixed(1), "% of free speed");
const pin = free.gears.find((g) => g.id === "증기기관차_발전기피니언")!;
console.log("pinion steady:", pin.angularVelocity.toFixed(4));

// default 5s state as the app would show
let app: LayoutState = createLocomotivePreset();
for (let i = 0; i < 300; i++) {
  const r = tick(app, 1 / 60, 1);
  app = { ...app, gears: r.gears, vehicles: r.vehicles };
}
console.log("at t=5s with wear on:", app.gears[0].angularVelocity.toFixed(4));
