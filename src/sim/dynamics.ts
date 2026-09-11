import type { GearInstance, MeshEdge, Vehicle } from "./types";
import { pitchRadius } from "./meshing";
import { buildDirectedAdjacency } from "./adjacency";
import { EARTH_GRAVITY, STEEL_DENSITY, unitsToMetres } from "./units";

/** Rigid-body dynamics for a gear train: what makes a machine here SPEED UP, LOAD DOWN and COAST
 *  rather than teleport to a commanded speed.
 *
 *  `rotation.ts` solves the KINEMATICS -- given one input speed, the fixed tooth and belt ratios
 *  fix every other gear's speed exactly. That constraint is real mechanics and stays untouched.
 *  What it cannot say is what the input speed itself should be, and a rigid train has exactly one
 *  degree of freedom, so that is the single unknown this module integrates:
 *
 *      J_eff * dw/dt = T_eff
 *
 *  with everything referred to the driving shaft in the standard way. If gear i turns at
 *  w_i = n_i * w (n_i being the accumulated signed gear ratio out to it), then equating kinetic
 *  energy and power gives the two textbook reflection rules this module is built on:
 *
 *      J_eff = SUM  J_i * n_i^2        (reflected inertia -- a gear behind a 10:1 reduction feels
 *                                       a hundredth as heavy at the input shaft)
 *      T_eff = SUM  n_i * T_i          (reflected torque)
 *
 *  Consequences that fall straight out, none of them special-cased anywhere below: a heavy train
 *  takes time to come up to speed; hanging a load on it makes the whole machine run slower, not
 *  just the loaded branch; a gearbox trades speed for torque; and a car's own mass is felt by its
 *  engine, because a wheel rolling without slip carries the whole vehicle (`m * r^2` of reflected
 *  inertia).
 *
 *  Masses are derived from what each part is actually drawn as -- a steel disc of its own pitch
 *  radius -- rather than being free parameters, so a bigger gear really is heavier and no number
 *  here is a tuning knob pretending to be physics. */

/** Axial thickness of a gear, world units. Matches `render/gearGeometry.ts`'s GEAR_THICKNESS,
 *  which is what the user actually sees: the mass used here is the mass of the drawn object. */
export const GEAR_THICKNESS = 0.4;

/** Viscous damping in a gear's bearings, N*m per rad/s. Small -- a supported shaft is meant to
 *  turn freely -- but nonzero, which is what lets an unpowered train coast to a stop instead of
 *  spinning forever. */
export const BEARING_DAMPING = 5e-4;

/** Viscous damping of a `load` object, N*m per rad/s. A load is the thing a machine exists to
 *  drive, so it resists far harder than a bearing: forty times, here, which is enough that
 *  hanging one on a train visibly slows it without stalling a healthy motor. */
export const LOAD_DAMPING = 2e-2;

/** Rolling resistance of a wheel on the ground, dimensionless. 0.015 is the usual figure for a
 *  pneumatic tyre on tarmac; it is the fraction of the supported weight that appears as drag. */
export const DEFAULT_ROLLING_RESISTANCE = 0.015;

/** A motor's torque-speed curve, the part of a powered machine that is NOT the gearing.
 *
 *  Modelled as the straight line every DC motor, governed engine and speed-controlled drive
 *  approximates: full `stallTorque` when held still, zero torque at `freeSpeed`, linear between.
 *  That single line is what makes the simulation behave like a machine -- torque appears exactly
 *  where it is needed, the speed sags under load, and it recovers when the load is removed --
 *  without any explicit "if overloaded" rule anywhere. */
export interface Motor {
  /** Speed the shaft settles at with nothing attached, rad/s. Signed: its sign is the direction
   *  the machine runs. */
  freeSpeed: number;
  /** Torque produced while held at a standstill, N*m. Sets both how hard the machine pulls and
   *  how quickly it gets up to speed. */
  stallTorque: number;
}

/** Torque a motor makes at its present speed: T = k * (freeSpeed - w), with the slope k fixed by
 *  the two endpoints of the curve. Signed correctly in both directions of rotation without any
 *  sign handling, because the formula is written in terms of the speed ERROR. */
export function motorTorque(motor: Motor, speed: number): number {
  if (motor.freeSpeed === 0) return 0;
  const k = motor.stallTorque / Math.abs(motor.freeSpeed);
  return k * (motor.freeSpeed - speed);
}

/** Mass of a gear in kilograms, as the steel disc it is drawn as: m = rho * pi * r^2 * t.
 *
 *  A zero-teeth part (`load`, and anything else with no pitch circle) is drawn as a `module * 2`
 *  cylinder by `gearGeometry.ts`, so it is massed at that radius -- the same substitution
 *  `overlapRadius` already makes for the same reason. A rack is not a disc at all; it is massed
 *  as a bar `10 * module` long with a `module` by thickness cross-section, which is roughly the
 *  toothed strip that gets drawn. */
export function gearMass(g: GearInstance): number {
  const t = unitsToMetres(GEAR_THICKNESS);
  if (g.type === "rack") {
    const length = unitsToMetres(10 * g.module);
    const height = unitsToMetres(g.module);
    return STEEL_DENSITY * length * height * t;
  }
  const r = unitsToMetres(pitchRadius(g) || g.module * 2);
  return STEEL_DENSITY * Math.PI * r * r * t;
}

/** Moment of inertia of a gear about its own axis, kg*m^2: the uniform disc's J = m*r^2/2.
 *
 *  A rack has no rotational inertia -- it translates. Its mass still matters, and it enters the
 *  train through `reflectedInertia` below as m*r_driver^2, where r_driver is the pitch radius of
 *  the pinion pushing it; this function returns 0 for it rather than inventing a J it does not
 *  have. */
export function momentOfInertia(g: GearInstance): number {
  if (g.type === "rack") return 0;
  const r = unitsToMetres(pitchRadius(g) || g.module * 2);
  return 0.5 * gearMass(g) * r * r;
}

/** How every gear's speed relates to the one driving shaft it hangs off: `w_i = ratio_i * w_root`.
 *
 *  The same outward walk `propagateRotation` makes, carrying the accumulated signed ratio instead
 *  of an actual speed -- which is what lets the dynamics be written before any speed is known, at
 *  the moment a machine is still standing still. Root choice mirrors `propagateRotation` exactly
 *  (unbroken cranks, in array order, first one to reach a component owns it) so the two can never
 *  disagree about which shaft a gear is referred to; `tests/sim/dynamics.test.ts` pins that
 *  agreement against every bundled preset rather than leaving it to inspection.
 *
 *  A rack is recorded with the ratio of the PINION driving it, together with `linear: true`: its
 *  travel is `w_pinion * r_pinion`, so that is the number its mass has to be reflected through. */
export interface DriveRatio {
  root: string;
  ratio: number;
  /** True for a rack, whose `ratio` refers to its driving pinion rather than to itself. */
  linear: boolean;
  /** Pitch radius of the driving pinion, world units; only meaningful when `linear`. */
  driverRadius: number;
}

export function driveRatios(gears: GearInstance[], edges: MeshEdge[]): Map<string, DriveRatio> {
  const byId = new Map(gears.map((g) => [g.id, g] as const));
  const adjacency = buildDirectedAdjacency(gears, edges);
  const ratios = new Map<string, DriveRatio>();
  const visited = new Set<string>();

  for (const crank of gears.filter((g) => g.type === "crank" && !g.broken)) {
    if (visited.has(crank.id)) continue;
    visited.add(crank.id);
    ratios.set(crank.id, { root: crank.id, ratio: 1, linear: false, driverRadius: 0 });
    const queue = [crank.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curRatio = ratios.get(cur)!.ratio;
      for (const edge of adjacency.get(cur) ?? []) {
        const isForward = edge.a === cur;
        const otherId = isForward ? edge.b : edge.a;
        if (visited.has(otherId)) continue;
        const other = byId.get(otherId)!;
        if (other.broken) continue;
        const sign = edge.kind === "coupling" || edge.kind === "chain" || edge.kind === "belt" ? 1 : -1;
        const ratio = isForward ? edge.ratio : 1 / edge.ratio;
        if (other.type === "rack") {
          ratios.set(otherId, {
            root: crank.id,
            ratio: curRatio * (isForward ? 1 : -1),
            linear: true,
            driverRadius: pitchRadius(byId.get(cur)!),
          });
        } else {
          ratios.set(otherId, {
            root: crank.id,
            ratio: curRatio * sign * ratio,
            linear: false,
            driverRadius: 0,
          });
        }
        visited.add(otherId);
        queue.push(otherId);
      }
    }
  }
  return ratios;
}

export interface DynamicsOptions {
  /** Downward acceleration, m/s^2 -- the same setting the falling parts use. It reaches the gear
   *  train through rolling resistance, which is a fraction of a vehicle's WEIGHT: a car on the
   *  Moon rolls further for the same push. */
  gravity?: number;
}

/** One component's torque balance, referred to its root shaft. Exposed for tests and for the
 *  diagnostics panel, which shows what the machine is actually fighting. */
export interface ShaftBalance {
  root: string;
  /** Reflected inertia at the root shaft, kg*m^2. */
  inertia: number;
  /** Reflected torque that does NOT depend on speed, N*m: the motor's stall-end pull plus any
   *  Coulomb-style drag. Split out from the damping because a first-order system integrates
   *  stably only when the speed-dependent half is treated implicitly. */
  torque: number;
  /** Reflected viscous damping at the root shaft, N*m per rad/s: bearings, loads, and the motor
   *  curve's own droop, all of which pull harder the faster the shaft turns. */
  damping: number;
  /** Angular acceleration at the shaft's PRESENT speed, rad/s^2. */
  acceleration: number;
}

/** Works out, for every motor-driven shaft, the torque balance it is currently under.
 *
 *  Only components containing a crank with a `motor` are solved dynamically. A crank WITHOUT a
 *  motor is left exactly as it was: an ideal velocity source, the honest model of a hand turning
 *  a handle at whatever rate the person chooses, and the behaviour every preset and test had
 *  before this module existed. Both idealisations are legitimate; which one a machine uses is
 *  declared by the preset rather than assumed here. */
export function shaftBalances(
  gears: GearInstance[],
  edges: MeshEdge[],
  vehicles: Vehicle[],
  options: DynamicsOptions = {},
): Map<string, ShaftBalance> {
  const g = options.gravity ?? EARTH_GRAVITY;
  const ratios = driveRatios(gears, edges);
  const byId = new Map(gears.map((gear) => [gear.id, gear] as const));

  const inertia = new Map<string, number>();
  const torque = new Map<string, number>();
  const damping = new Map<string, number>();
  for (const gear of gears) {
    if (gear.type !== "crank" || !gear.motor || gear.broken) continue;
    if (ratios.get(gear.id)?.root !== gear.id) continue; // a second motor inside a driven train
    inertia.set(gear.id, 0);
    torque.set(gear.id, 0);
    damping.set(gear.id, 0);
  }
  if (inertia.size === 0) return new Map();

  for (const gear of gears) {
    const r = ratios.get(gear.id);
    if (!r || !inertia.has(r.root) || gear.broken) continue;

    if (r.linear) {
      // A rack translates: its mass is felt at the root through the pinion that pushes it, at
      // v = w_pinion * r_pinion, so the reflected inertia is m * (r_pinion * n_pinion)^2.
      const lever = unitsToMetres(r.driverRadius) * r.ratio;
      inertia.set(r.root, inertia.get(r.root)! + gearMass(gear) * lever * lever);
      continue;
    }

    inertia.set(r.root, inertia.get(r.root)! + momentOfInertia(gear) * r.ratio * r.ratio);

    // Every speed-dependent term is split into the constant it contributes and the slope it
    // contributes, rather than being evaluated at the current speed: T_i = T0_i - c_i * w_i, and
    // w_i = n_i * w_root, so the root shaft sees + n_i * T0_i of torque and + c_i * n_i^2 of
    // damping. The motor curve is itself one of these, with T0 = k * freeSpeed and slope k.
    let constantTorque = 0;
    let slope = gear.type === "load" ? LOAD_DAMPING : BEARING_DAMPING;
    if (gear.type === "crank" && gear.motor && gear.motor.freeSpeed !== 0) {
      const k = gear.motor.stallTorque / Math.abs(gear.motor.freeSpeed);
      constantTorque += k * gear.motor.freeSpeed;
      slope += k;
    }
    torque.set(r.root, torque.get(r.root)! + constantTorque * r.ratio);
    damping.set(r.root, damping.get(r.root)! + slope * r.ratio * r.ratio);
  }

  for (const vehicle of vehicles) {
    const r = ratios.get(vehicle.wheel);
    if (!r || !inertia.has(r.root)) continue;
    const wheelRadius = unitsToMetres(vehicle.radius);
    // A wheel rolling without slip drags the whole vehicle with it: v = w * r, so the vehicle's
    // mass appears at the wheel as m * r^2, and at the root shaft as that times n^2.
    const lever = wheelRadius * r.ratio;
    inertia.set(r.root, inertia.get(r.root)! + vehicle.mass * lever * lever);
    // Rolling resistance is a force of crr * m * g opposing travel, which is a torque of
    // crr * m * g * r at the wheel. Blended to zero across a narrow band of speed rather than
    // switched on sign, so a vehicle at rest is not shoved back and forth every tick by a drag
    // force that cannot decide which way it points.
    const crr = vehicle.rollingResistance ?? DEFAULT_ROLLING_RESISTANCE;
    const wheelSpeed = (byId.get(vehicle.wheel)?.angularVelocity ?? 0);
    const direction = Math.max(-1, Math.min(1, wheelSpeed / 0.05));
    const drag = -crr * vehicle.mass * g * wheelRadius * direction;
    torque.set(r.root, torque.get(r.root)! + drag * r.ratio);
  }

  const balances = new Map<string, ShaftBalance>();
  for (const [root, J] of inertia) {
    const T = torque.get(root)!;
    const D = damping.get(root)!;
    const speed = byId.get(root)!.angularVelocity;
    balances.set(root, {
      root,
      inertia: J,
      torque: T,
      damping: D,
      acceleration: J > 0 ? (T - D * speed) / J : 0,
    });
  }
  return balances;
}

/** New speed for every motor-driven crank after `dt` seconds of the above torque balance.
 *
 *  Integrated semi-implicitly (the new speed is used for the next step's torque), which for a
 *  damped first-order system like this is unconditionally stable -- an explicit step would
 *  oscillate and then explode whenever `dt` exceeded the train's own time constant, and a big
 *  reduction makes that constant very short. */
export function stepMotors(
  gears: GearInstance[],
  edges: MeshEdge[],
  vehicles: Vehicle[],
  dt: number,
  options: DynamicsOptions = {},
): Map<string, number> {
  const balances = shaftBalances(gears, edges, vehicles, options);
  const speeds = new Map<string, number>();
  for (const gear of gears) {
    const balance = balances.get(gear.id);
    if (!balance || balance.inertia <= 0) continue;
    // w' = (T - D*w)/J, stepped with the damping term taken at the NEW speed:
    //   w_new = (w + (T/J) dt) / (1 + (D/J) dt)
    // Unconditionally stable and it can never overshoot the steady state T/D, whereas the
    // explicit form oscillates and then diverges the moment dt passes the train's own time
    // constant J/D -- which a large reduction ratio makes very short indeed.
    const a = (balance.torque / balance.inertia) * dt;
    const b = (balance.damping / balance.inertia) * dt;
    speeds.set(gear.id, (gear.angularVelocity + a) / (1 + b));
  }
  return speeds;
}
