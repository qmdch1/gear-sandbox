import { stepBody, timeToFloor, type FallingBody } from "./src/sim/gravity";
import { EARTH_GRAVITY, accelerationToUnits } from "./src/sim/units";
const G = accelerationToUnits(EARTH_GRAVITY);
function body(o: Partial<FallingBody> = {}): FallingBody {
  return { id:"p", position:[0,100,0], velocity:[0,0,0], radius:2, mass:0.5,
           restitution:0.6, rotation:0, resting:false, ...o };
}
function run(b: FallingBody, seconds: number, dt: number, options = {}) {
  let c = b; const steps = Math.round(seconds/dt); let minY = Infinity;
  for (let i=0;i<steps;i++){ c = stepBody(c, dt, options); minY = Math.min(minY, c.position[1]); }
  return { body: c, minY };
}
// The test's STATED intent, done properly: dead drop from absurd height, run long enough.
for (const h of [100000, 1e6, 1e8]) {
  const t = Math.sqrt(2*(h-2)/G);
  const r = run(body({position:[0,h,0], restitution:0}), Math.ceil(t)+3, 1/60);
  console.log(`h=${h} needs ${t.toFixed(1)}s -> y=${r.body.position[1]} resting=${r.body.resting} minY=${r.minY}`);
}
// Large single-step jump: does one giant dt tunnel?
console.log("one 1/60 step at vy=-1e6 from y=100:",
  JSON.stringify(stepBody(body({position:[0,100,0], velocity:[0,-1e6,0], restitution:0}), 1/60).position));
// timeToFloor at extreme speed
console.log("timeToFloor(100, -1e6, -G, 2, 1/60) =", timeToFloor(100,-1e6,-G,2,1/60));
