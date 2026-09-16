import { createCarLayout, createCarProps } from "./src/sim/presets/car";
import { seatOnGround } from "./src/sim/ground";
import { tick } from "./src/sim/simulation";
import { serializeLayout, deserializeLayout } from "./src/persistence/serialize";
import type { LayoutState } from "./src/sim/types";

const EARTH = 9.81;
function drive(start: LayoutState, seconds: number) {
  let layout = start;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const r = tick(layout, dt, 1, { wear: false, gravity: EARTH });
    layout = { gears: r.gears, remoteLinks: layout.remoteLinks, vehicles: r.vehicles ?? layout.vehicles };
  }
  return layout;
}

// 1) user picks the Car preset (exactly what PresetPanel callback does)
const { layout: seated } = seatOnGround(createCarLayout(), createCarProps());
const live = { gears: seated.gears, remoteLinks: seated.remoteLinks, vehicles: seated.vehicles ?? [] };
console.log("preset vehicles:", live.vehicles.length);

const drivenLive = drive(live, 3);
console.log("LIVE  distance after 3s:", drivenLive.vehicles?.[0]?.distance);
console.log("LIVE  engine w:", drivenLive.gears[0].angularVelocity.toFixed(3), "id:", drivenLive.gears[0].id);

// 2) user clicks Save -- main.ts:328 passes exactly { gears, remoteLinks }
const json = serializeLayout({ gears: live.gears, remoteLinks: live.remoteLinks } as LayoutState);
console.log("saved JSON has 'vehicles':", Object.keys(JSON.parse(json)));

// 3) user reloads the tab -> main.ts:121 loadFromLocalStorage, vehicles stays []
const loaded = deserializeLayout(json);
const reloaded: LayoutState = { gears: loaded.gears, remoteLinks: loaded.remoteLinks, vehicles: [] };
console.log("reloaded vehicles:", reloaded.vehicles?.length);
const wheel = reloaded.gears.find((g) => (g as any).ridesOn);
console.log("reloaded wheel still marked ridesOn:", wheel?.id, (wheel as any)?.ridesOn);
console.log("reloaded engine still has motor:", !!(reloaded.gears[0] as any).motor);

const drivenReload = drive(reloaded, 3);
console.log("RELOAD distance after 3s:", drivenReload.vehicles?.[0]?.distance ?? "NO VEHICLE - car cannot move");
console.log("RELOAD engine w:", drivenReload.gears[0].angularVelocity.toFixed(3));
console.log("RELOAD wheel w:", drivenReload.gears.find((g)=>g.id===wheel?.id)?.angularVelocity.toFixed(3),
            "| LIVE wheel w:", drivenLive.gears.find((g)=>g.id===wheel?.id)?.angularVelocity.toFixed(3));
