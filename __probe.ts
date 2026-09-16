import { createCarPreset, CAR_MASS, ROAD_WHEEL_R } from "./src/sim/presets/car";
import { createLocomotivePreset, LOCO_MASS, DRIVER_R } from "./src/sim/presets/locomotive";
import { buildEdges } from "./src/sim/graph";
import { shaftBalances, driveRatios, momentOfInertia, gearMass } from "./src/sim/dynamics";
import { unitsToMetres } from "./src/sim/units";

function report(name: string, layout: any, mass: number, radiusUnits: number, wheelPred: (id: string) => boolean) {
  const edges = buildEdges(layout.gears, layout.remoteLinks ?? []);
  const ratios = driveRatios(layout.gears, edges);
  const bal = shaftBalances(layout.gears, edges, layout.vehicles ?? []);
  console.log(`\n=== ${name} ===`);
  for (const [root, b] of bal) {
    console.log(` root ${root}: J=${b.inertia.toExponential(5)} T=${b.torque} D=${b.damping} tau=J/D=${(b.inertia/b.damping).toFixed(4)}s steady=${(b.torque/b.damping).toFixed(4)} rad/s`);
  }
  let wheelsReflected = 0, wheelsOwn = 0, allGearsReflected = 0;
  for (const g of layout.gears) {
    const r = ratios.get(g.id)!;
    const J = momentOfInertia(g);
    allGearsReflected += J * r.ratio * r.ratio;
    if (wheelPred(g.id)) { wheelsReflected += J * r.ratio * r.ratio; wheelsOwn += J;
      console.log(`  ${g.id}: J=${J.toExponential(5)} n=${r.ratio} J*n^2=${(J*r.ratio*r.ratio).toExponential(5)}`);
    } else {
      console.log(`  ${g.id}: J=${J.toExponential(5)} n=${r.ratio} J*n^2=${(J*r.ratio*r.ratio).toExponential(5)}  (non-wheel)`);
    }
  }
  const rWheel = ratios.get(layout.vehicles[0].wheel)!.ratio;
  const lever = unitsToMetres(radiusUnits) * rWheel;
  const vehReflected = mass * lever * lever;
  const mr2AtWheel = mass * unitsToMetres(radiusUnits) ** 2;
  const oneWheelJ = momentOfInertia(layout.gears.find((g: any) => wheelPred(g.id))!);
  console.log(` vehicle reflected  = ${vehReflected.toExponential(5)}`);
  console.log(` wheels-only reflected (sum, n^2) = ${wheelsReflected.toExponential(5)}`);
  console.log(` ALL gears reflected = ${allGearsReflected.toExponential(5)}`);
  console.log(` RATIO vehicle / all-wheels-together (at engine shaft) = ${(vehReflected/wheelsReflected).toFixed(4)}`);
  console.log(` RATIO m*r^2 / sum(wheel J) at WHEEL shaft            = ${(mr2AtWheel/wheelsOwn).toFixed(4)}`);
  console.log(` RATIO m*r^2 / ONE wheel J                            = ${(mr2AtWheel/oneWheelJ).toFixed(4)}   <-- the "6x"`);
  console.log(` vehicle share of TOTAL reflected J = ${(100*vehReflected/(vehReflected+allGearsReflected)).toFixed(2)}%`);
}

const car = createCarPreset();
report("CAR", car, CAR_MASS, ROAD_WHEEL_R, (id) => id.includes("바퀴"));
const loco = createLocomotivePreset();
report("LOCOMOTIVE", loco, LOCO_MASS, DRIVER_R, (id) => id.includes("동륜"));
