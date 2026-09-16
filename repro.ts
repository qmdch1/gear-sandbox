import { shaftBalances, driveRatios } from "./src/sim/dynamics";
import { buildEdges } from "./src/sim/graph";
import { tick } from "./src/sim/simulation";
import type { GearInstance, LayoutState } from "./src/sim/types";

function gear(o: Partial<GearInstance> = {}): GearInstance {
  return { id: "g", type: "spur", position: [0,0,0], axis: [0,1,0], teeth: 20, module: 1,
    durabilityMax: 100, durabilityCurrent: 100, broken: false, rotation: 0, angularVelocity: 0, ...o } as GearInstance;
}

function build(handleFirst: boolean): LayoutState {
  const handle = gear({ id: "handle", type: "crank", teeth: 20, position: [0,0,0] });
  const engine = gear({ id: "engine", type: "crank", teeth: 20, position: [20,0,0],
    motor: { freeSpeed: 10, stallTorque: 0.5 } });
  return { gears: handleFirst ? [handle, engine] : [engine, handle], remoteLinks: [] } as LayoutState;
}

for (const handleFirst of [true, false]) {
  let layout = build(handleFirst);
  const edges = buildEdges(layout.gears, layout.remoteLinks);
  console.log("=== handleFirst =", handleFirst);
  console.log("edges", JSON.stringify(edges));
  console.log("ratios", JSON.stringify([...driveRatios(layout.gears, edges)]));
  console.log("balances", [...shaftBalances(layout.gears, edges, []).keys()]);
  for (let i = 0; i < 600; i++) {
    const r = tick(layout, 1/60, 1, { wear: false });
    layout = { ...layout, gears: r.gears } as LayoutState;
  }
  const get = (id: string) => layout.gears.find(g => g.id === id)!.angularVelocity;
  console.log("after 10s: handle", get("handle"), "engine", get("engine"));
}
