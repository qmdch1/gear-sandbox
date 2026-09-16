import { PRESETS } from "./src/sim/presets/index";
import { gearMass, shaftBalances, GEAR_THICKNESS } from "./src/sim/dynamics";
import { STEEL_DENSITY, unitsToMetres } from "./src/sim/units";
import { computeMeshes } from "./src/sim/meshing";

function drawnMass(g: any) {
  const teeth = Math.max(4, Math.round(g.teeth) || 8);
  const length = unitsToMetres(teeth * Math.PI * g.module);
  const height = unitsToMetres(g.module * 2.25);
  return STEEL_DENSITY * length * height * unitsToMetres(GEAR_THICKNESS);
}

for (const p of PRESETS) {
  const layout = p.build();
  const racks = layout.gears.filter((g: any) => g.type === "rack");
  if (racks.length === 0) continue;
  const edges = computeMeshes(layout.gears);
  const bal = shaftBalances(layout.gears, edges, layout.vehicles ?? []);
  for (const r of racks) {
    console.log(p.id, r.id, "teeth", r.teeth, "module", r.module,
      "| current", gearMass(r).toFixed(6), "| drawn", drawnMass(r).toFixed(6),
      "| ratio", (drawnMass(r)/gearMass(r)).toFixed(2));
  }
  for (const [root, b] of bal) {
    console.log("   balance", root, JSON.stringify(b));
  }
}
