import { stepBody, type FallingBody } from "./src/sim/gravity";
import { EARTH_GRAVITY, accelerationToUnits } from "./src/sim/units";
const G = accelerationToUnits(EARTH_GRAVITY);

function body(o: Partial<FallingBody> = {}): FallingBody {
  return { id:"part", position:[0,100,0], velocity:[0,0,0], radius:2, mass:0.5,
           restitution:0.6, rotation:0, resting:false, ...o };
}
function run(b: FallingBody, seconds: number, dt: number, options = {}) {
  let c = b; const steps = Math.round(seconds/dt);
  let minY = Infinity;
  for (let i=0;i<steps;i++){ c = stepBody(c, dt, options); minY = Math.min(minY, c.position[1]); }
  return { body: c, minY };
}

// 1. Exactly the test as written
const asWritten = run(body({position:[0,100000,0]}), 6, 1/60);
console.log("TEST AS WRITTEN: y =", asWritten.body.position[1], "resting =", asWritten.body.resting,
            "vy =", asWritten.body.velocity[1], "minY =", asWritten.minY);
console.log("  floor is y=2. Did it ever touch? ", asWritten.minY <= 2 + 1e-6);
console.log("  time needed to fall:", Math.sqrt(2*99998/G), "s; simulated 6 s");

// 2. Long enough to actually land
const long = run(body({position:[0,100000,0]}), 20, 1/60);
console.log("RUN 20 s: y =", long.body.position[1], "resting =", long.body.resting, "minY =", long.minY);

// 3. Does the test still pass if every contact branch is gone? simulate pure ballistic
let y = 100000, vy = 0; const dt = 1/60;
for (let i=0;i<360;i++){ y += vy*dt - 0.5*G*dt*dt; vy -= G*dt; }
console.log("PURE BALLISTIC (no contact code at all): y =", y, " assertion y>=2-1e-9 passes:", y >= 2-1e-9);
