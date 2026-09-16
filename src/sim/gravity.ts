import { EARTH_GRAVITY, accelerationToUnits } from "./units";

/** A loose part in the world: something that has been let go of and is now falling, bouncing and
 *  rolling under gravity, rather than being bolted into a gear train.
 *
 *  Deliberately a SPHERE for contact purposes (`radius`), which is the honest shape for the
 *  bearing balls, nuts and blanks that get dropped onto a workshop floor, and keeps the ground
 *  contact a single exact inequality instead of an orientation-dependent hull test. Rotation is
 *  carried for the renderer to spin the mesh, but it is a rolling angle derived from the contact,
 *  not an independent rigid-body orientation -- this is a falling-and-bouncing model, not a full
 *  6-DOF solver, and claiming otherwise in the types would be a lie. */
export interface FallingBody {
  id: string;
  /** Centre of the sphere, world units. */
  position: [number, number, number];
  /** World units per second. */
  velocity: [number, number, number];
  radius: number;
  /** Kilograms. Does not affect the trajectory -- Galileo -- but does set the impact energy
   *  the renderer and the audio use to pick how hard a landing sounds and looks. */
  mass: number;
  /** Coefficient of restitution: the ratio of separation speed to approach speed at a bounce,
   *  so the rebound reaches e^2 of the drop height. 0 is a dead lump of putty, ~0.6 a rubber
   *  ball on concrete, ~0.9 a hardened steel bearing on a steel plate. Never above 1: that
   *  would create energy out of nothing, and `stepBody` clamps it. */
  restitution: number;
  /** Rolling/spin angle in radians, for the renderer. Advanced by the no-slip relation while
   *  the body is touching the ground. */
  rotation: number;
  /** True once the body has stopped bouncing and is lying on the ground. A resting body is
   *  still integrated (it can be pushed, and it still feels gravity if the ground moves out
   *  from under it), but it is exempt from the bounce path, which is what stops the endless
   *  micro-bounce every naive impulse integrator ends up in. */
  resting: boolean;
}

export interface GravityOptions {
  /** Downward acceleration in m/s^2. Defaults to Earth's 9.80665. Zero gives a floating,
   *  orbital-station sandbox; the Moon's 1.625 gives the long, floaty drop everyone recognises
   *  from the Apollo footage. */
  gravity?: number;
  /** Height of the floor, world units. The sandbox's ground plane is y = 0. */
  groundY?: number;
  /** Coulomb friction coefficient between a body and the floor. 0.4 is about right for steel
   *  on a concrete workshop floor. */
  friction?: number;
}

/** The reference resting speed: what `restSpeed` below works out for Earth gravity at 60 Hz.
 *  Kept as a named figure because it is the case worth having a number for, but it is NOT what
 *  the integrator uses -- see `restSpeed`. */
export const REST_SPEED = 16;

/** Below this approach speed (world units/s) a contact is a landing rather than a bounce.
 *
 *  Without such a floor, `e` applied to an ever-smaller speed produces an infinite sequence of
 *  ever-shorter bounces -- Zeno's paradox, which in a real integrator shows up as a part that
 *  jitters on the floor forever and never sleeps. The threshold is `g * dt`: the speed gravity
 *  alone imparts in one step, and therefore the speed below which a body cannot leave the floor
 *  for a whole step anyway, so calling it landed discards nothing anyone could see.
 *
 *  DERIVED from the actual gravity and the actual step rather than hard-coded, because a
 *  constant sized for Earth at 60 Hz is wrong everywhere else: on the Moon it is ten times too
 *  big and would kill bounces a sixth-gravity drop should still be making, and at 240 Hz it
 *  discards four times more than it needs to. At zero gravity it is zero -- correctly, since
 *  nothing is pressing the body down and no bounce is ever too small to finish. */
export function restSpeed(gravityUnits: number, dt: number): number {
  return gravityUnits * dt;
}

/** How many contacts a single step will resolve before giving up and parking the body. A step
 *  that needs more than this is a body wedged into the floor, not a body bouncing. */
const MAX_CONTACTS_PER_STEP = 4;

/** Advances one loose part by `dt` seconds under gravity, resolving any floor contact inside
 *  the step.
 *
 *  The trajectory between contacts is evaluated with the EXACT constant-acceleration solution
 *  (y = y0 + v*t + g*t^2/2, v = v0 + g*t) rather than a Euler step, so a drop from a given
 *  height falls exactly the textbook distance regardless of the frame rate, and the contact time
 *  inside a step is solved for algebraically instead of being rounded to the frame boundary.
 *  That matters here: at 981 units/s^2 a body crosses 16 units in a single 60 Hz frame, so
 *  snapping contacts to frame boundaries would visibly change where a bounce happened and would
 *  make the rebound height depend on the frame rate.
 *
 *  Returns a new body; the input is never mutated, matching how `tick` treats gears. */
export function stepBody(
  body: FallingBody,
  dt: number,
  options: GravityOptions = {},
): FallingBody {
  const g = accelerationToUnits(options.gravity ?? EARTH_GRAVITY);
  const groundY = options.groundY ?? 0;
  const friction = options.friction ?? 0.4;
  // Restitution above 1 would return more energy than the impact carried in, so a single
  // bounce would climb higher than the drop and the part would launch itself out of the world.
  const e = Math.min(Math.max(body.restitution, 0), 1);
  const floor = groundY + body.radius; // centre height at which the sphere touches

  let [x, y, z] = body.position;
  let [vx, vy, vz] = body.velocity;
  let rotation = body.rotation;
  let resting = body.resting;
  let remaining = dt;

  for (let contact = 0; contact <= MAX_CONTACTS_PER_STEP && remaining > 0; contact++) {
    // A body already lying on the floor slides and rolls; it does not re-enter the fall path
    // until something lifts it off. Gravity still holds it down, so vertical motion is simply
    // zero rather than an accumulating downward velocity pressing it through the floor.
    if (resting && vy <= 0) {
      y = floor;
      vy = 0;
      ({ vx, vz, rotation } = slide(vx, vz, rotation, g, friction, body.radius, remaining));
      x += vx * remaining;
      z += vz * remaining;
      remaining = 0;
      break;
    }
    resting = false;

    const t = timeToFloor(y, vy, -g, floor, remaining);
    if (t === null) {
      // No contact this step: pure ballistic flight, evaluated exactly.
      x += vx * remaining;
      z += vz * remaining;
      y += vy * remaining - 0.5 * g * remaining * remaining;
      vy -= g * remaining;
      remaining = 0;
      break;
    }

    // Fly exactly up to the moment of contact.
    x += vx * t;
    z += vz * t;
    y = floor;
    vy -= g * t;
    remaining -= t;

    const approach = -vy; // positive: how fast it is coming down onto the floor
    // Sliding contact converts some horizontal motion to spin and heat. The normal impulse over
    // a bounce is m*(1+e)*approach, so the tangential impulse Coulomb friction can supply is
    // mu times that -- mass cancels, leaving a speed change.
    const tangentialLoss = friction * (1 + e) * approach;
    ({ vx, vz } = brakeHorizontal(vx, vz, tangentialLoss));

    if (approach < restSpeed(g, dt)) {
      // Landed. Park it rather than starting an infinite sequence of shrinking bounces.
      vy = 0;
      resting = true;
      continue;
    }
    vy = e * approach;
  }

  // Running out of contacts inside one step means the body is being pinched into the floor
  // rather than bouncing off it -- a huge dt, a restitution of exactly 1 arriving almost
  // horizontally. The loop condition alone would leave `remaining` unspent AND the body still
  // falling, so the next step starts from a state that re-triggers the same thrash forever and
  // the part buzzes on the floor. Park it: the doc above promises exactly that, and a body this
  // confused has no visible motion left to lose.
  if (remaining > 0) {
    y = Math.max(y, floor);
    vy = 0;
    resting = true;
  }

  // While in contact, a rolling body turns by its travel over its radius -- the same no-slip
  // relation the driven racks and winding drums in this sandbox already use.
  if (resting) rotation += (Math.hypot(vx, vz) * dt) / Math.max(body.radius, 1e-6);

  return { ...body, position: [x, y, z], velocity: [vx, vy, vz], rotation, resting };
}

/** Smallest time in (0, limit] at which a body at `y` moving at `vy` under acceleration `a`
 *  reaches `floor`, or null if it does not within the window. Solves the quadratic directly
 *  instead of substepping, so the answer does not depend on the frame rate. */
export function timeToFloor(
  y: number,
  vy: number,
  a: number,
  floor: number,
  limit: number,
): number | null {
  const c = y - floor;
  if (c <= 0 && vy <= 0) return 0; // already at or under the floor and still descending
  // 0.5*a*t^2 + vy*t + c = 0
  if (Math.abs(a) < 1e-12) {
    if (vy >= 0) return null;
    const t = -c / vy;
    return t > 0 && t <= limit ? t : null;
  }
  const disc = vy * vy - 2 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  // Both roots of a falling body; take the earliest one that lies inside the step.
  const candidates = [(-vy - root) / a, (-vy + root) / a].filter((t) => t > 0 && t <= limit);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/** Horizontal speed after removing up to `loss` of it. Friction can stop a body but never
 *  reverse it, which is what the clamp at zero enforces. */
function brakeHorizontal(vx: number, vz: number, loss: number): { vx: number; vz: number } {
  const speed = Math.hypot(vx, vz);
  if (speed <= 1e-9) return { vx: 0, vz: 0 };
  const scale = Math.max(0, speed - loss) / speed;
  return { vx: vx * scale, vz: vz * scale };
}

/** One step of a body rolling along the floor: Coulomb friction decelerates it at mu*g and it
 *  turns by its own travel over its radius. */
function slide(
  vx: number,
  vz: number,
  rotation: number,
  g: number,
  friction: number,
  radius: number,
  dt: number,
): { vx: number; vz: number; rotation: number } {
  const braked = brakeHorizontal(vx, vz, friction * g * dt);
  return { ...braked, rotation };
}
