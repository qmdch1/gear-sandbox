import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `musicbox.ts` and `clocktower.ts` use. */
function seedGear(
  id: string,
  type: GearType,
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
  module = 1,
  angularVelocity = 0,
): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id,
    type,
    position,
    axis,
    teeth,
    module,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

const pitchRadius = (teeth: number, module: number) => (module * teeth) / 2;

// ---------------------------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------------------------

export const MOTOR_ID = "유성감속기_모터";
export const MOTOR_SPROCKET_ID = "유성감속기_모터체인기어";
export const FAN_ID = "유성감속기_냉각팬";
export const HELICAL_ID = "유성감속기_헬리컬피니언";
export const PLANETARY_ID = "유성감속기_유성기어";
export const AUX_ID = "유성감속기_보조피니언";
export const GOVERNOR_ID = "유성감속기_조속기";
export const IDLER_ID = "유성감속기_중간아이들러";
export const BULL_ID = "유성감속기_출력대치차";
export const DRUM_ID = "유성감속기_권상드럼";
export const RATCHET_ID = "유성감속기_역회전방지래칫";
export const COUNTER_ID = "유성감속기_로프계수기어";

// ---------------------------------------------------------------------------------------------
// ONE module for the whole machine
// ---------------------------------------------------------------------------------------------

/** ONE module for every meshing wheel, and it is load-bearing rather than tidy bookkeeping: two
 *  gears can only mesh if their teeth are the same SIZE, and module IS tooth size (circular pitch
 *  = pi * module; `render/gearGeometry.ts` cuts real involute teeth with addendum = 1*module and
 *  dedendum = 1.25*module). `evaluatePair` never checks module -- it only asks whether the two
 *  centres sit `pitchRadius(a) + pitchRadius(b)` apart -- so a preset that mixed modules across a
 *  mesh would get a perfectly happy simulation edge and a rendered pair whose teeth are visibly
 *  different sizes and could not engage on any real shaft. Every gear here therefore shares
 *  HOIST_MODULE, and tests/sim/presets/planetaryhoist.test.ts asserts it for every mesh edge the
 *  real `buildEdges` produces (not just for the pairs this file happens to list). */
export const HOIST_MODULE = 0.5;

export const MOTOR_TEETH = 12;
export const MOTOR_SPROCKET_TEETH = 12;
export const FAN_TEETH = 24;
export const HELICAL_TEETH = 24;
export const PLANETARY_TEETH = 72;
export const AUX_TEETH = 18;
export const GOVERNOR_TEETH = 9;
export const IDLER_TEETH = 16;
export const BULL_TEETH = 96;
/** The drum is a `pulley`: it never tooth-meshes (it only ever receives power through the
 *  coincident 1:1 coupling with the bull gear it is keyed to), so its tooth count exists purely
 *  to give it a pitch radius. It is chosen so that radius equals the rope barrel actually drawn
 *  around it -- 32 * 0.5 / 2 = 8 -- rather than leaving the simulated body a different size from
 *  the visible one, exactly as `musicbox.ts` sizes its barrel. */
export const DRUM_TEETH = 32;
export const RATCHET_TEETH = 24;
export const COUNTER_TEETH = 32;

export const MOTOR_R = pitchRadius(MOTOR_TEETH, HOIST_MODULE); // 3
export const MOTOR_SPROCKET_R = pitchRadius(MOTOR_SPROCKET_TEETH, HOIST_MODULE); // 3
export const FAN_R = pitchRadius(FAN_TEETH, HOIST_MODULE); // 6
export const HELICAL_R = pitchRadius(HELICAL_TEETH, HOIST_MODULE); // 6
export const PLANETARY_R = pitchRadius(PLANETARY_TEETH, HOIST_MODULE); // 18
export const AUX_R = pitchRadius(AUX_TEETH, HOIST_MODULE); // 4.5
export const GOVERNOR_R = pitchRadius(GOVERNOR_TEETH, HOIST_MODULE); // 2.25
export const IDLER_R = pitchRadius(IDLER_TEETH, HOIST_MODULE); // 4
export const BULL_R = pitchRadius(BULL_TEETH, HOIST_MODULE); // 24
export const DRUM_R = pitchRadius(DRUM_TEETH, HOIST_MODULE); // 8
export const RATCHET_R = pitchRadius(RATCHET_TEETH, HOIST_MODULE); // 6
export const COUNTER_R = pitchRadius(COUNTER_TEETH, HOIST_MODULE); // 8

/** A rendered tooth reaches one full module PAST the pitch circle (`gearGeometry.ts`:
 *  `addendumRadius = pitchRadius + module * ADDENDUM_FACTOR`, ADDENDUM_FACTOR = 1). Every
 *  clearance in this file is measured against these TIP radii, never the pitch radii -- using the
 *  pitch radius would silently leave half a module of interference at each rim. */
export const tipRadius = (r: number) => r + HOIST_MODULE;

/** The `planetary` type renders as a real epicyclic assembly (`gearGeometry.ts`): a sun, three
 *  planets, and a TORUS ring of tube radius `module * 1.5` centred on the ring's pitch circle. So
 *  the planetary body's true outermost reach is `pitchRadius + 1.5 * module`, half a module more
 *  than an ordinary involute tip circle -- that is the number the housing has to clear. */
export const PLANETARY_RING_OUTER_R = PLANETARY_R + HOIST_MODULE * 1.5; // 18.75
/** ...and the ring's inner face, which is what the carrier arms have to stay inside of. */
export const PLANETARY_RING_INNER_R = PLANETARY_R - HOIST_MODULE * 1.5; // 17.25

// ---------------------------------------------------------------------------------------------
// Geometry -- every centre is a sum of pitch radii, shown as arithmetic
// ---------------------------------------------------------------------------------------------

/** Height of the main shaft line: motor, helical pinion, planetary, idler and bull gear all run
 *  on it. Not a free choice -- the rope counter hangs one full mesh below the bull gear
 *  (BULL_COUNTER_DISTANCE = 32) and must clear the ground with its own tip circle, so
 *  SHAFT_Y >= 32 + tipRadius(COUNTER_R) = 40.5. 44 leaves 3.5 of daylight under it. */
export const SHAFT_Y = 44;

export const PLANETARY_POS: [number, number, number] = [0, SHAFT_Y, 0];

/** 18 + 6 = 24: the helical pinion sits one summed-pitch-radius to the LEFT of the ring. */
export const HELICAL_PLANETARY_DISTANCE = HELICAL_R + PLANETARY_R; // 24
export const HELICAL_POS: [number, number, number] = [-HELICAL_PLANETARY_DISTANCE, SHAFT_Y, 0]; // [-24, 44, 0]

/** 3 + 6 = 9: the motor pinion sits one summed-pitch-radius further left again. */
export const MOTOR_HELICAL_DISTANCE = MOTOR_R + HELICAL_R; // 9
export const MOTOR_POS: [number, number, number] = [HELICAL_POS[0] - MOTOR_HELICAL_DISTANCE, SHAFT_Y, 0]; // [-33, 44, 0]

/** 18 + 4 = 22: the layshaft idler sits one summed-pitch-radius to the RIGHT of the ring. */
export const PLANETARY_IDLER_DISTANCE = PLANETARY_R + IDLER_R; // 22
export const IDLER_POS: [number, number, number] = [PLANETARY_IDLER_DISTANCE, SHAFT_Y, 0]; // [22, 44, 0]

/** 4 + 24 = 28: the bull gear sits one summed-pitch-radius right of the idler. */
export const IDLER_BULL_DISTANCE = IDLER_R + BULL_R; // 28
export const BULL_POS: [number, number, number] = [IDLER_POS[0] + IDLER_BULL_DISTANCE, SHAFT_Y, 0]; // [50, 44, 0]

/** The rope drum is KEYED to the bull gear -- identical position and axis, which is what
 *  `evaluatePair`'s COINCIDENT_ONLY branch resolves into a 1:1 coupling. */
export const DRUM_POS: [number, number, number] = [BULL_POS[0], BULL_POS[1], BULL_POS[2]];

/** 18 + 4.5 = 22.5, straight up off the ring: the auxiliary take-off. */
export const PLANETARY_AUX_DISTANCE = PLANETARY_R + AUX_R; // 22.5
export const AUX_POS: [number, number, number] = [0, SHAFT_Y + PLANETARY_AUX_DISTANCE, 0]; // [0, 66.5, 0]

/** 4.5 + 2.25 = 6.75, up again: the little overspeed governor. */
export const AUX_GOVERNOR_DISTANCE = AUX_R + GOVERNOR_R; // 6.75
export const GOVERNOR_POS: [number, number, number] = [0, AUX_POS[1] + AUX_GOVERNOR_DISTANCE, 0]; // [0, 73.25, 0]

/** 24 + 6 = 30, out at 45 degrees above-right of the bull gear so the holding ratchet stands
 *  clear of both the drum barrel and the rope counter. Placed with real trigonometry rather than
 *  a guessed coordinate: centre = bull centre + 30 * (cos 45, sin 45). */
export const BULL_RATCHET_DISTANCE = BULL_R + RATCHET_R; // 30
export const RATCHET_ANGLE = Math.PI / 4;
export const RATCHET_POS: [number, number, number] = [
  BULL_POS[0] + Math.cos(RATCHET_ANGLE) * BULL_RATCHET_DISTANCE, // 50 + 21.2132 = 71.2132
  BULL_POS[1] + Math.sin(RATCHET_ANGLE) * BULL_RATCHET_DISTANCE, // 44 + 21.2132 = 65.2132
  0,
];

/** 24 + 8 = 32, straight DOWN off the bull gear. Below rather than above because the rope leaves
 *  the drum barrel at z = ROPE_Z (12), while every gear in this machine lives in the z = 0 plane:
 *  the counter's disc and the falling rope share an x but never a z, so they cannot foul. */
export const BULL_COUNTER_DISTANCE = BULL_R + COUNTER_R; // 32
export const COUNTER_POS: [number, number, number] = [BULL_POS[0], SHAFT_Y - BULL_COUNTER_DISTANCE, 0]; // [50, 12, 0]

/** The cooling fan hangs below the motor on a chain. A chain `RemoteLink` has NO distance or
 *  geometry rule in `evaluatePair` (unlike a tooth mesh), so this 22 is a free layout choice --
 *  picked so the fan's guard ring clears the frame's base beam and the motor above it. */
export const FAN_POS: [number, number, number] = [MOTOR_POS[0], 22, 0]; // [-33, 22, 0]

// ---------------------------------------------------------------------------------------------
// Ratios -- tooth counts only. Module sets physical size and never a ratio.
// ---------------------------------------------------------------------------------------------

export const MOTOR_TO_HELICAL = MOTOR_TEETH / HELICAL_TEETH; // 12/24 = 1/2
export const HELICAL_TO_PLANETARY = HELICAL_TEETH / PLANETARY_TEETH; // 24/72 = 1/3
export const PLANETARY_TO_IDLER = PLANETARY_TEETH / IDLER_TEETH; // 72/16 = 4.5
export const IDLER_TO_BULL = IDLER_TEETH / BULL_TEETH; // 16/96 = 1/6
export const PLANETARY_TO_AUX = PLANETARY_TEETH / AUX_TEETH; // 72/18 = 4
export const AUX_TO_GOVERNOR = AUX_TEETH / GOVERNOR_TEETH; // 18/9 = 2
export const BULL_TO_RATCHET = BULL_TEETH / RATCHET_TEETH; // 96/24 = 4
export const BULL_TO_COUNTER = BULL_TEETH / COUNTER_TEETH; // 96/32 = 3
export const CHAIN_RATIO = MOTOR_SPROCKET_TEETH / FAN_TEETH; // 12/24 = 1/2

/** Motor -> planetary, as a SPEED magnitude: (12/24) * (24/72) = 1/6. This is the planetary
 *  stage's own contribution, and it is the biggest single step-down in the machine. */
export const MOTOR_TO_PLANETARY = MOTOR_TO_HELICAL * HELICAL_TO_PLANETARY; // 1/6
/** Planetary -> drum: (72/16) * (16/96) = 3/4. A further slow-down, never a step-up. */
export const PLANETARY_TO_DRUM = PLANETARY_TO_IDLER * IDLER_TO_BULL; // 0.75
/** End to end: (1/6) * (3/4) = 1/8. The drum turns at one eighth of the motor's angular speed,
 *  in the SAME direction (four external meshes = four reversals, which cancel in pairs). */
export const MOTOR_TO_DRUM = MOTOR_TO_PLANETARY * PLANETARY_TO_DRUM; // 0.125

export const MOTOR_SPEED = 4.0;

// ---------------------------------------------------------------------------------------------
// The hoist itself
// ---------------------------------------------------------------------------------------------

/** The effective radius the rope spools at on the drum. It is the drum's own pitch radius, which
 *  is also the radius of the barrel actually drawn around it, so the rendered rope and the
 *  simulated lift agree: `windWith` moves a hook by `drum.rotation * radius`, the same
 *  angle x radius relation `rotation.ts` already uses to drive a rack from a pinion. */
export const ROPE_RADIUS = DRUM_R; // 8

/** How far the hook can rise before its top block reaches the drum. Bounded, and the bound is
 *  derived rather than guessed: the barrel's underside sits at SHAFT_Y - DRUM_R = 36, the rope
 *  ribs sweeping on it reach down to RIB_SWEEP_LOW = 35.25, and the hook block's top at rest is
 *  HOOK_BLOCK_TOP = 13.7, so anything up to 21.55 fits. 20 leaves 1.55 of daylight. */
export const HOOK_TRAVEL = 20;

/** Lift per radian of MOTOR rotation: MOTOR_TO_DRUM * ROPE_RADIUS = 0.125 * 8 = 1. That the
 *  factor lands on exactly 1 is a convenience of the chosen sizes, not a law -- it just makes the
 *  reciprocation bound below equal HOOK_TRAVEL outright. */
export const LIFT_PER_MOTOR_RADIAN = MOTOR_TO_DRUM * ROPE_RADIUS; // 1

/** The motor RECIPROCATES: it hoists to the headroom limit, then runs back down, forever -- a
 *  limit switch reversing a hoist motor. `reverseAt` flips the crank's commanded velocity once
 *  its accumulated rotation reaches a bound, and because a crank's stored velocity is what seeds
 *  `propagateRotation` every tick, that reverses the entire train behind it. Bounds are
 *  [0, HOOK_TRAVEL / LIFT_PER_MOTOR_RADIAN], which sweeps the hook over exactly [0, HOOK_TRAVEL]. */
export const MOTOR_REVERSE_AT: [number, number] = [0, HOOK_TRAVEL / LIFT_PER_MOTOR_RADIAN]; // [0, 20]

// ---------------------------------------------------------------------------------------------
// Body geometry the clearance tests pin
// ---------------------------------------------------------------------------------------------

/** All twelve gears run in the z = 0 plane about world Z, so every gear body occupies
 *  z in [0, 0.4] (`gearGeometry.ts`'s GEAR_THICKNESS) -- except the planetary, whose torus ring
 *  straddles z in [-0.75, 0.75]. Every prop that has to pass across the machine's face is placed
 *  against this number. */
export const GEAR_PLANE_FRONT = 0.4;
export const PLANETARY_RING_HALF_DEPTH = HOIST_MODULE * 1.5; // 0.75

/** The gearbox housing: two bolted end flanges, one behind the planetary and one in front of it.
 *  They sit at +/-HOUSING_FLANGE_Z so they never touch the gear plane at all -- which is what
 *  lets the bolt circle run unbroken past the three pinions that mesh the ring from outside. */
export const HOUSING_FLANGE_Z = 3.2;
export const HOUSING_FLANGE_R = 19.6;
export const HOUSING_FLANGE_TUBE = 0.8;
/** Every shaft in this machine is carried on a stub running back from its gear to the frame
 *  girder, occupying z in [-SHAFT_STUB_LENGTH, 0] at SHAFT_STUB_R about its own centre. The back
 *  housing flange crosses that same z band, so the flange's outer edge has to stay inside the
 *  nearest stub -- the idler's, at PLANETARY_IDLER_DISTANCE = 22 from the ring's centre. */
export const SHAFT_STUB_R = 0.9;
export const SHAFT_STUB_LENGTH = 6;

export const BOLT_COUNT = 18;
export const BOLT_R = 0.5;
/** Bolt heads start at 5 degrees and step 20 degrees, so no bolt lands within 15 degrees of the
 *  0 / 90 / 180 degree directions where the idler, the auxiliary pinion and the helical pinion
 *  come in to mesh the ring. They are on the flange faces (z = +/-HOUSING_FLANGE_Z) and never
 *  cross the gear plane, so this is belt-and-braces -- but it also keeps the BACK bolt heads
 *  clear of those three shaft stubs, which do cross it. */
export function boltAngle(i: number): number {
  return (5 * Math.PI) / 180 + (i * 20 * Math.PI) / 180;
}

/** Four through-rods clamping the two flanges together. These DO cross the gear plane, at
 *  HOUSING_FLANGE_R, so their angles are chosen 45 degrees away from all three mesh directions;
 *  the test measures the real distance from each rod to each mating pinion's tip circle. */
export const TIE_ROD_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
export const TIE_ROD_R = 0.5;

/** The three planet centres, in the planetary body's own frame: `gearGeometry.ts` orbits them at
 *  `module * (sunTeeth + planetTeeth) / 2` with sunTeeth = round(72/3) = 24 and
 *  planetTeeth = round((72 - 24)/2) = 24, i.e. 0.5 * 48 / 2 = 12. The carrier arms reach exactly
 *  that far, so each arm ends on a planet pin instead of somewhere arbitrary. */
export const PLANET_ORBIT_R = (HOIST_MODULE * (24 + 24)) / 2; // 12
export const CARRIER_ARM_COUNT = 3;
export const CARRIER_ARM_HALF_WIDTH = 0.75;
export function carrierArmAngle(i: number): number {
  return (i / CARRIER_ARM_COUNT) * Math.PI * 2;
}

/** The rope barrel drawn over the drum pulley, running along +Z out of the bull gear's face --
 *  which is exactly where a real hoist puts its barrel relative to its final gear. */
export const DRUM_BARREL_Z0 = 1;
export const DRUM_BARREL_LEN = 22;
export const DRUM_BARREL_Z = DRUM_BARREL_Z0 + DRUM_BARREL_LEN / 2; // 12
/** The rope leaves the barrel at its mid-length, so it falls in the z = 12 plane -- 12 clear of
 *  every gear in the machine. */
export const ROPE_Z = DRUM_BARREL_Z; // 12

export const ROPE_RIB_COUNT = 20;
export const ROPE_RIB_R = 8.4;
const ROPE_RIB_HALF_HEIGHT = 0.35;
/** How low the spiral rope ribs sweep as the barrel turns -- the real floor the rising hook has
 *  to stop under, half a unit lower than the barrel's own underside. */
export const RIB_SWEEP_LOW = SHAFT_Y - (ROPE_RIB_R + ROPE_RIB_HALF_HEIGHT); // 35.25
export function ropeRibAngle(i: number): number {
  return i * 0.85;
}
export function ropeRibZ(i: number): number {
  return 2.5 + i;
}

/** Hook assembly at rest, bottom to top: crate, tarp, hook, shackle, block. */
export const CRATE_Y = 2.8;
export const CRATE_SIZE = 5.6;
export const HOOK_BLOCK_Y = 12.2;
export const HOOK_BLOCK_SIZE = 3.0;
export const HOOK_BLOCK_TOP = HOOK_BLOCK_Y + HOOK_BLOCK_SIZE / 2; // 13.7

export const FRAME_GIRDER_Z = -8;
export const BASE_Y = 1.5;

// ---------------------------------------------------------------------------------------------

/** 유성감속기 (planetary reduction hoist) -- a fast electric motor geared down through a planetary
 *  reduction unit onto a slow rope drum, with a hook that lifts a crate and lowers it again,
 *  forever.
 *
 *  TWELVE gears: EIGHT real tooth meshes, TWO coincident shaft couplings and ONE chain link, all
 *  on ONE module (0.5), all about world Z in the z = 0 plane so the whole train reads as one
 *  gearbox seen face-on.
 *
 *    유성감속기_모터 (crank, 12T)
 *        --mesh-- 유성감속기_헬리컬피니언 (helical, 24T)
 *        --mesh-- 유성감속기_유성기어 (planetary, 72T)   <- the reduction unit
 *        --mesh-- 유성감속기_중간아이들러 (spur, 16T)
 *        --mesh-- 유성감속기_출력대치차 (spur, 96T)
 *        --coincident coupling (1:1)-- 유성감속기_권상드럼 (pulley) -> the rope drum
 *
 *    유성감속기_유성기어  --mesh-- 유성감속기_보조피니언 (spur, 18T)
 *                                  --mesh-- 유성감속기_조속기 (spur, 9T)      <- overspeed governor
 *    유성감속기_출력대치차 --mesh-- 유성감속기_역회전방지래칫 (ratchet, 24T)   <- holding pawl wheel
 *    유성감속기_출력대치차 --mesh-- 유성감속기_로프계수기어 (spur, 32T)        <- rope counter
 *    유성감속기_모터      --coincident coupling-- 유성감속기_모터체인기어 (sprocket, 12T)
 *                                  --chain-- 유성감속기_냉각팬 (sprocket, 24T) <- cooling fan
 *
 *  WHAT THE PLANETARY ACTUALLY DOES HERE, HONESTLY. `evaluatePair` puts "planetary" in its
 *  PARALLEL_FAMILY: it meshes anything spur/helical/crank/planetary whose axis is parallel and
 *  whose centre sits at the summed pitch radii, and the sandbox simulates it as ONE rigid body of
 *  72 teeth, not as an independently-turning sun/carrier/ring set. That has a consequence worth
 *  stating out loud rather than papering over: because power goes IN through one external mesh
 *  and OUT through another on the same body, the planetary's own 72 cancels from the end-to-end
 *  ratio -- (12/24)(24/72)(72/16)(16/96) = 12/96 -- exactly the way `clocktower.ts`'s idler
 *  cancels from its motion work. What the planetary genuinely contributes is the biggest single
 *  step-down in the machine: the motor turns it at 1/6 speed (MOTOR_TO_PLANETARY), and it turns
 *  the drum at a further 3/4 (PLANETARY_TO_DRUM). Nothing anywhere in the drum path speeds up.
 *
 *  Signs, since `propagateRotation` drives a mesh with sign -1 and a coupling/chain with +1, and
 *  the motor runs at +4.0 rad/s:
 *
 *    모터            = +4.0
 *    헬리컬피니언     = -(12/24) * 4.0        = -2.0
 *    유성기어         = -(24/72) * -2.0       = +0.666..   (= 4.0 / 6)
 *    중간아이들러      = -(72/16) * 0.666..   = -3.0
 *    출력대치차        = -(16/96) * -3.0      = +0.5
 *    권상드럼          = +0.5                              (1:1 coupling, same direction)
 *    보조피니언        = -(72/18) * 0.666..   = -2.666..
 *    조속기            = -(18/9) * -2.666..   = +5.333..   (the fastest thing in the machine)
 *    역회전방지래칫     = -(96/24) * 0.5      = -2.0
 *    로프계수기어       = -(96/32) * 0.5      = -1.5
 *    모터체인기어       = +4.0                              (1:1 coupling)
 *    냉각팬            = +(12/24) * 4.0       = +2.0        (chain: sign +1, ratio by teeth)
 *
 *  So the drum turns at ONE EIGHTH of the motor -- and because the rope spools at ROPE_RADIUS 8,
 *  the hook rises exactly one world unit per radian the motor turns. That is the whole point of
 *  the machine: the motor visibly buzzes, the hook visibly crawls. Every one of those numbers is
 *  checked numerically over hundreds of real ticks in tests/sim/presets/planetaryhoist.test.ts,
 *  not merely derived here.
 *
 *  THE RATCHET is a genuine one-way member, not decoration: `evaluatePair`'s ratchet branch marks
 *  the bull-gear/ratchet edge `oneWay: "aToB"` (the bull gear is `a`, since it comes first in the
 *  gears array), so the bull gear drives the pawl wheel and the pawl wheel can never drive back.
 *  That is what a holding pawl is for on a real hoist. Note it does not HOLD anything here -- the
 *  motor reverses and the whole train, ratchet included, runs happily backwards; `oneWay` governs
 *  which way power may be relayed through the graph, not which way a shaft may physically turn.
 *
 *  WHAT THIS PRESET DOES NOT CLAIM. Nothing here says what mass the hook could raise. A real
 *  planetary reducer trades speed for torque, and since `dynamics.ts` arrived that trade IS in
 *  the model -- `shaftBalances` reflects torque back through a ratio as SUM n_i*T_i. Two things
 *  still stop this preset making a lifting claim. Its motor is a drawn housing rather than a
 *  `Motor` field, so the input speed is given rather than solved for; and weight never loads a
 *  train anywhere in this sandbox, because a `load` gear is a viscous damper, not a mass on a
 *  rope. So the only claim made -- and the only claim the test file verifies -- is the SPEED
 *  relationship between the shafts and the resulting rope travel. */
export function createPlanetaryHoistPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(MOTOR_ID, "crank", MOTOR_POS, [0, 0, 1], MOTOR_TEETH, HOIST_MODULE, MOTOR_SPEED),
    // Keyed onto the motor's own shaft: identical position and axis, which is the only way a
    // `sprocket` can ever receive power (meshing.ts's COINCIDENT_ONLY set gives it no tooth-mesh
    // rule of its own), and the prerequisite for the chain link below to carry drive anywhere.
    seedGear(MOTOR_SPROCKET_ID, "sprocket", MOTOR_POS, [0, 0, 1], MOTOR_SPROCKET_TEETH, HOIST_MODULE),
    seedGear(FAN_ID, "sprocket", FAN_POS, [0, 0, 1], FAN_TEETH, HOIST_MODULE),
    seedGear(HELICAL_ID, "helical", HELICAL_POS, [0, 0, 1], HELICAL_TEETH, HOIST_MODULE),
    seedGear(PLANETARY_ID, "planetary", PLANETARY_POS, [0, 0, 1], PLANETARY_TEETH, HOIST_MODULE),
    seedGear(AUX_ID, "spur", AUX_POS, [0, 0, 1], AUX_TEETH, HOIST_MODULE),
    seedGear(GOVERNOR_ID, "spur", GOVERNOR_POS, [0, 0, 1], GOVERNOR_TEETH, HOIST_MODULE),
    seedGear(IDLER_ID, "spur", IDLER_POS, [0, 0, 1], IDLER_TEETH, HOIST_MODULE),
    // The bull gear MUST precede the ratchet in this array: `buildEdges` assigns a mesh edge's
    // `a`/`b` by array index, and `evaluatePair`'s ratchet branch derives `oneWay` from which
    // side is the ratchet. With the bull gear as `a` the edge is "aToB" -- power flows out of the
    // bull gear into the pawl wheel. Reversed, the pawl wheel would be the only route in and the
    // ratchet would sit dead, which `classify` would (correctly) report as noPower.
    seedGear(BULL_ID, "spur", BULL_POS, [0, 0, 1], BULL_TEETH, HOIST_MODULE),
    seedGear(DRUM_ID, "pulley", DRUM_POS, [0, 0, 1], DRUM_TEETH, HOIST_MODULE),
    seedGear(RATCHET_ID, "ratchet", RATCHET_POS, [0, 0, 1], RATCHET_TEETH, HOIST_MODULE),
    seedGear(COUNTER_ID, "spur", COUNTER_POS, [0, 0, 1], COUNTER_TEETH, HOIST_MODULE),
  ];

  gears[0].reverseAt = MOTOR_REVERSE_AT;

  return {
    gears,
    remoteLinks: [
      // Chain, not belt: `buildEdges` takes a chain's ratio from TOOTH counts (12/24) and a
      // belt's from pitch radii. Both would give 1/2 at this module, but a chain is what a
      // sprocket pair actually is.
      { a: MOTOR_SPROCKET_ID, b: FAN_ID, kind: "chain" },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The body
// ---------------------------------------------------------------------------------------------

const STEEL = 0x9aa3ad;
const DARK_STEEL = 0x5b6169;
const IRON = 0x74675a;
const BRASS = 0xc9a227;
const TIMBER = 0x8a6a3a;
const DARK_TIMBER = 0x6b4f2a;
const CONCRETE = 0x9d9a92;
const BRICK_RED = 0x8d4a3a;
const TARP_GREEN = 0x41584a;
const TILE_GREY = 0xb6b0a3;
const ROPE_COL = 0x6e6a5f;
const HOOK_COL = 0xb8bec6;

/** The hoist's body: a brick machine house and a tiled inspection walk, a steel frame girder
 *  carrying every shaft, the planetary gearbox housing with its bolted end flanges and tie rods,
 *  the carrier arms turning inside it, the motor and its chain-driven cooling fan, the flyball
 *  governor, the holding pawl, the rope counter's dial, and the rope drum with a hook that lifts
 *  a crate off the floor and sets it back down again.
 *
 *  Every gear body in this sandbox is a rotationally-plain disc: spun about its own axis it shows
 *  nothing at all. So each of the eleven moving shafts carries an ASYMMETRIC prop -- carrier arms,
 *  spokes, flyballs, fan blades, spiral rope ribs, a counter pointer -- `attachTo`-ed to its gear
 *  so `SceneSync` sweeps it round, and the hook hangs on `windWith` so the drum's slow turn shows
 *  up as slow travel. */
export function createPlanetaryHoistProps(): Prop[] {
  const props: Prop[] = [];

  // -------------------------------------------------------------------------------------------
  // Site: floor slab, tiled inspection walk, brick machine-house wall, plinth, bench.
  // -------------------------------------------------------------------------------------------
  props.push(
    { kind: "box", position: [15, -1, 4], size: [140, 2, 46], color: CONCRETE, texture: "stone", textureRepeat: [10, 4], roughness: 0.94, metalness: 0.03 },
    { kind: "box", position: [15, 0.35, 28], size: [140, 0.7, 12], color: TILE_GREY, texture: "tile", textureRepeat: [16, 2], roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [10, 26, -14], size: [140, 52, 3], color: BRICK_RED, texture: "brick", textureRepeat: [14, 6], roughness: 0.95, metalness: 0.02 },
    { kind: "box", position: [12, BASE_Y, FRAME_GIRDER_Z], size: [124, 3, 12], color: CONCRETE, texture: "stone", textureRepeat: [12, 1], roughness: 0.92, metalness: 0.04 },
    // A timber bench off to the motor end, with legs -- somewhere for the scene to have scale.
    { kind: "box", position: [-46, 5, 20], size: [16, 1.5, 12], color: TIMBER, texture: "wood", textureRepeat: [3, 2], roughness: 0.85, metalness: 0.04 },
    { kind: "box", position: [-52, 2.5, 16], size: [1.4, 5, 1.4], color: DARK_TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04 },
    { kind: "box", position: [-40, 2.5, 16], size: [1.4, 5, 1.4], color: DARK_TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04 },
    { kind: "box", position: [-52, 2.5, 24], size: [1.4, 5, 1.4], color: DARK_TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04 },
    { kind: "box", position: [-40, 2.5, 24], size: [1.4, 5, 1.4], color: DARK_TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04 },
  );

  // -------------------------------------------------------------------------------------------
  // Frame: one girder along the shaft line at z = FRAME_GIRDER_Z, legs down to the plinth, an
  // upright carrying the governor stack, a pedestal under the rope counter, and an outrigger out
  // to the pawl wheel. All of it sits BEHIND the gear plane, so nothing fouls a turning wheel.
  // -------------------------------------------------------------------------------------------
  props.push(
    { kind: "box", position: [8, SHAFT_Y, FRAME_GIRDER_Z], size: [116, 6, 5], color: STEEL, texture: "metal", textureRepeat: [14, 1], metalness: 0.72, roughness: 0.34 },
    // Governor upright: x = 0, so the auxiliary pinion and the governor both land on it.
    { kind: "box", position: [0, 38.5, FRAME_GIRDER_Z], size: [3.5, 77, 4], color: IRON, texture: "rust", textureRepeat: [1, 8], metalness: 0.5, roughness: 0.7 },
    { kind: "box", position: [50, 8, FRAME_GIRDER_Z], size: [4, 10, 5], color: IRON, texture: "rust", textureRepeat: [1, 2], metalness: 0.5, roughness: 0.7 },
  );
  for (const legX of [-38, 24, 62]) {
    props.push({ kind: "box", position: [legX, 20.5, FRAME_GIRDER_Z], size: [4, 41, 4], color: IRON, texture: "rust", textureRepeat: [1, 6], metalness: 0.5, roughness: 0.7 });
  }
  // Outrigger to the pawl wheel: a strut from the right-hand leg head (62, 44) up to the ratchet
  // centre (71.2132, 65.2132). A box's long axis is Y, so rotating about Z by -atan2(dx, dy)
  // points it along the (dx, dy) run.
  {
    const dx = RATCHET_POS[0] - 62;
    const dy = RATCHET_POS[1] - SHAFT_Y;
    props.push({
      kind: "box",
      position: [(62 + RATCHET_POS[0]) / 2, (SHAFT_Y + RATCHET_POS[1]) / 2, FRAME_GIRDER_Z],
      size: [3, Math.hypot(dx, dy), 4],
      color: IRON,
      texture: "rust",
      rotation: [0, 0, -Math.atan2(dx, dy)],
      metalness: 0.5,
      roughness: 0.7,
    });
  }
  // Fan bracket, out from the left leg to the fan's shaft.
  props.push({ kind: "box", position: [(-38 + FAN_POS[0]) / 2, FAN_POS[1], FRAME_GIRDER_Z], size: [Math.abs(FAN_POS[0] + 38) + 2, 3, 4], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.7 });

  // Every shaft's stub, running back from its gear to the girder.
  for (const centre of [MOTOR_POS, HELICAL_POS, PLANETARY_POS, AUX_POS, GOVERNOR_POS, IDLER_POS, BULL_POS, RATCHET_POS, COUNTER_POS, FAN_POS]) {
    props.push({
      kind: "cylinder",
      position: [centre[0], centre[1], -SHAFT_STUB_LENGTH / 2],
      radius: SHAFT_STUB_R,
      height: SHAFT_STUB_LENGTH,
      color: DARK_STEEL,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.8,
      roughness: 0.28,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The planetary gearbox housing: two bolted end flanges sandwiching the ring gear, a bolt
  // circle on each face, four tie rods clamping them, and a brass nameplate. The flanges sit at
  // z = +/-HOUSING_FLANGE_Z, clear of the gear plane, so the housing can be a closed ring even
  // though three pinions reach in through it to mesh the ring.
  // -------------------------------------------------------------------------------------------
  for (const z of [-HOUSING_FLANGE_Z, HOUSING_FLANGE_Z]) {
    props.push({
      kind: "ring",
      position: [PLANETARY_POS[0], PLANETARY_POS[1], z],
      radius: HOUSING_FLANGE_R,
      tube: HOUSING_FLANGE_TUBE,
      color: IRON,
      texture: "rust",
      textureRepeat: [10, 2],
      metalness: 0.55,
      roughness: 0.65,
    });
    for (let i = 0; i < BOLT_COUNT; i++) {
      const a = boltAngle(i);
      props.push({
        kind: "cylinder",
        position: [
          PLANETARY_POS[0] + Math.cos(a) * HOUSING_FLANGE_R,
          PLANETARY_POS[1] + Math.sin(a) * HOUSING_FLANGE_R,
          z,
        ],
        radius: BOLT_R,
        height: 2,
        radialSegments: 6,
        color: DARK_STEEL,
        texture: "metal",
        rotation: [Math.PI / 2, 0, 0],
        metalness: 0.85,
        roughness: 0.3,
      });
    }
  }
  for (const a of TIE_ROD_ANGLES) {
    props.push({
      kind: "cylinder",
      position: [
        PLANETARY_POS[0] + Math.cos(a) * HOUSING_FLANGE_R,
        PLANETARY_POS[1] + Math.sin(a) * HOUSING_FLANGE_R,
        0,
      ],
      radius: TIE_ROD_R,
      height: HOUSING_FLANGE_Z * 2 + 1.2,
      color: IRON,
      texture: "rust",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.5,
      roughness: 0.68,
    });
  }
  props.push({
    kind: "box",
    position: [0, SHAFT_Y - 15, HOUSING_FLANGE_Z + 0.6],
    size: [11, 3, 0.5],
    color: BRASS,
    texture: "metal",
    textureRepeat: [3, 1],
    metalness: 0.82,
    roughness: 0.24,
  });

  // -------------------------------------------------------------------------------------------
  // The carrier: a hub, three arms out to the planet pins, and the pins themselves -- all
  // attached to the planetary so they sweep with it. This sandbox simulates a planetary as one
  // rigid body, so the carrier turns at the same rate as the ring rather than at a separate
  // carrier speed; the arms are what make that rotation legible at all, since a ring, a sun and
  // three planets drawn concentrically are close to rotationally symmetric on their own.
  // -------------------------------------------------------------------------------------------
  props.push({
    kind: "cylinder",
    position: [PLANETARY_POS[0], PLANETARY_POS[1], 1.4],
    radius: 3.2,
    height: 1.2,
    color: DARK_STEEL,
    texture: "metal",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.78,
    roughness: 0.3,
    attachTo: PLANETARY_ID,
  });
  for (let i = 0; i < CARRIER_ARM_COUNT; i++) {
    const a = carrierArmAngle(i);
    props.push({
      kind: "box",
      position: [
        PLANETARY_POS[0] + (Math.cos(a) * PLANET_ORBIT_R) / 2,
        PLANETARY_POS[1] + (Math.sin(a) * PLANET_ORBIT_R) / 2,
        1.4,
      ],
      size: [PLANET_ORBIT_R, CARRIER_ARM_HALF_WIDTH * 2, 0.9],
      color: STEEL,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.75,
      roughness: 0.32,
      attachTo: PLANETARY_ID,
    });
    props.push({
      kind: "cylinder",
      position: [
        PLANETARY_POS[0] + Math.cos(a) * PLANET_ORBIT_R,
        PLANETARY_POS[1] + Math.sin(a) * PLANET_ORBIT_R,
        1.9,
      ],
      radius: 1,
      height: 2.2,
      color: BRASS,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.82,
      roughness: 0.26,
      attachTo: PLANETARY_ID,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The motor: a finned housing standing off the gear plane in +z (clear of the crank's own
  // handle, which reaches to z = 2.3 -- gearGeometry's crank handle sits at GEAR_THICKNESS/2 and
  // is pitchRadius * 1.4 long), a terminal box, and lugs on the crank itself.
  // -------------------------------------------------------------------------------------------
  props.push(
    { kind: "cylinder", position: [MOTOR_POS[0], MOTOR_POS[1], 13], radius: 5, height: 12, color: DARK_STEEL, texture: "metal", textureRepeat: [5, 2], rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.3 },
    { kind: "cylinder", position: [MOTOR_POS[0], MOTOR_POS[1], 19.5], radius: 5.4, height: 1.4, color: IRON, texture: "rust", rotation: [Math.PI / 2, 0, 0], metalness: 0.5, roughness: 0.68 },
    { kind: "box", position: [MOTOR_POS[0], MOTOR_POS[1] + 6.4, 13], size: [4, 3, 5], color: DARK_STEEL, texture: "metal", metalness: 0.8, roughness: 0.3 },
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [MOTOR_POS[0] + Math.cos(a) * 5.3, MOTOR_POS[1] + Math.sin(a) * 5.3, 13],
      size: [0.6, 1.6, 11],
      color: STEEL,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.75,
      roughness: 0.34,
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [MOTOR_POS[0] + Math.cos(a) * 2, MOTOR_POS[1] + Math.sin(a) * 2, -2.6],
      size: [1.6, 0.8, 0.8],
      color: BRASS,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.8,
      roughness: 0.28,
      attachTo: MOTOR_ID,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The chain drive to the cooling fan. Both sprocket BODIES are in the gear plane (they have to
  // be -- the driving one is coincident with the motor, which is how it gets power at all), but
  // the chain they carry is drawn at z = CHAIN_Z, out in front, where a strand can run past the
  // helical pinion instead of straight through it.
  // -------------------------------------------------------------------------------------------
  const CHAIN_Z = 4;
  const MOTOR_RING_R = 3.2;
  const FAN_RING_R = 6.2;
  props.push(
    { kind: "cylinder", position: [MOTOR_POS[0], MOTOR_POS[1], 2.2], radius: 1, height: 3.6, color: DARK_STEEL, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.3, attachTo: MOTOR_SPROCKET_ID },
    { kind: "ring", position: [MOTOR_POS[0], MOTOR_POS[1], CHAIN_Z], radius: MOTOR_RING_R, tube: 0.4, color: STEEL, texture: "metal", metalness: 0.78, roughness: 0.3, attachTo: MOTOR_SPROCKET_ID },
    { kind: "cylinder", position: [FAN_POS[0], FAN_POS[1], 2.2], radius: 1, height: 3.6, color: DARK_STEEL, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.3, attachTo: FAN_ID },
    { kind: "ring", position: [FAN_POS[0], FAN_POS[1], CHAIN_Z], radius: FAN_RING_R, tube: 0.4, color: STEEL, texture: "metal", metalness: 0.78, roughness: 0.3, attachTo: FAN_ID },
  );
  // Drive lugs on each chainring: a bare torus is rotationally symmetric and would show nothing.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [MOTOR_POS[0] + Math.cos(a) * (MOTOR_RING_R - 1), MOTOR_POS[1] + Math.sin(a) * (MOTOR_RING_R - 1), CHAIN_Z],
      size: [1.4, 0.6, 0.6],
      color: BRASS, texture: "metal", rotation: [0, 0, a], metalness: 0.8, roughness: 0.28,
      attachTo: MOTOR_SPROCKET_ID,
    });
    props.push({
      kind: "box",
      position: [FAN_POS[0] + Math.cos(a) * (FAN_RING_R - 1.4), FAN_POS[1] + Math.sin(a) * (FAN_RING_R - 1.4), CHAIN_Z],
      size: [2.4, 0.6, 0.6],
      color: BRASS, texture: "metal", rotation: [0, 0, a], metalness: 0.8, roughness: 0.28,
      attachTo: FAN_ID,
    });
  }
  // The two chain strands, as individual links. Drawn on the mean of the two chainring radii and
  // tilted by the small angle the differing radii imply -- decorative, like `hoist.ts`'s rope
  // line; nothing in the simulation depends on where the strand is drawn.
  {
    const strandX = (MOTOR_RING_R + FAN_RING_R) / 2; // 4.7
    const span = MOTOR_POS[1] - FAN_POS[1]; // 22
    const tilt = Math.atan2((FAN_RING_R - MOTOR_RING_R) / 2, span);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const y = FAN_POS[1] + 1 + t * (span - 2);
        const x = MOTOR_POS[0] + side * (FAN_RING_R - (FAN_RING_R - MOTOR_RING_R) * t);
        props.push({
          kind: "box",
          position: [x, y, CHAIN_Z],
          size: [0.8, 1.9, 0.8],
          color: DARK_STEEL,
          texture: "metal",
          rotation: [0, 0, side * tilt],
          metalness: 0.85,
          roughness: 0.32,
        });
      }
    }
  }
  // Fan blades and a guard ring. The blades reach FAN_BLADE_TIP from the fan's axis, which is
  // what has to stay clear of the motor housing above it.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [FAN_POS[0] + Math.cos(a) * 6.5, FAN_POS[1] + Math.sin(a) * 6.5, 6.6],
      size: [5, 2.6, 0.4],
      color: STEEL,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.7,
      roughness: 0.36,
      attachTo: FAN_ID,
    });
  }
  props.push({ kind: "ring", position: [FAN_POS[0], FAN_POS[1], 6.6], radius: 9.6, tube: 0.5, color: IRON, texture: "rust", metalness: 0.5, roughness: 0.68 });

  // -------------------------------------------------------------------------------------------
  // The helical pinion's coupling collar and keys, and spokes on the idler and the auxiliary
  // pinion -- each shaft gets something off-centre so its turn is readable.
  // -------------------------------------------------------------------------------------------
  props.push({
    kind: "cylinder",
    position: [HELICAL_POS[0], HELICAL_POS[1], 1.4],
    radius: 2.2, height: 1.4,
    color: DARK_STEEL, texture: "metal", rotation: [Math.PI / 2, 0, 0],
    metalness: 0.8, roughness: 0.3,
    attachTo: HELICAL_ID,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [HELICAL_POS[0] + Math.cos(a) * 2.6, HELICAL_POS[1] + Math.sin(a) * 2.6, 1.4],
      size: [1.6, 0.7, 0.7],
      color: BRASS, texture: "metal", rotation: [0, 0, a], metalness: 0.8, roughness: 0.28,
      attachTo: HELICAL_ID,
    });
  }
  for (const [id, centre, spokeLen] of [
    [IDLER_ID, IDLER_POS, 3.6],
    [AUX_ID, AUX_POS, 4],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      props.push({
        kind: "box",
        position: [centre[0] + (Math.cos(a) * spokeLen) / 2, centre[1] + (Math.sin(a) * spokeLen) / 2, -1],
        size: [spokeLen, 0.7, 0.7],
        color: BRASS,
        texture: "metal",
        rotation: [0, 0, a],
        metalness: 0.78,
        roughness: 0.3,
        attachTo: id,
      });
    }
  }

  // -------------------------------------------------------------------------------------------
  // The overspeed governor: a spindle, two arms and two flyballs, all attached to the fastest
  // gear in the machine. They live at z = GOVERNOR_BALL_Z, in front of the gear plane, so the
  // balls sweep past the auxiliary pinion below them rather than through it.
  // -------------------------------------------------------------------------------------------
  const GOVERNOR_BALL_Z = 3.4;
  props.push({
    kind: "cylinder",
    position: [GOVERNOR_POS[0], GOVERNOR_POS[1], 1.8],
    radius: 0.7, height: 3.2,
    color: DARK_STEEL, texture: "metal", rotation: [Math.PI / 2, 0, 0],
    metalness: 0.82, roughness: 0.26,
    attachTo: GOVERNOR_ID,
  });
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI;
    props.push({
      kind: "box",
      position: [GOVERNOR_POS[0] + Math.cos(a) * 2.6, GOVERNOR_POS[1] + Math.sin(a) * 2.6, GOVERNOR_BALL_Z],
      size: [5.2, 0.7, 0.7],
      color: STEEL, texture: "metal", rotation: [0, 0, a], metalness: 0.78, roughness: 0.3,
      attachTo: GOVERNOR_ID,
    });
    props.push({
      kind: "sphere",
      position: [GOVERNOR_POS[0] + Math.cos(a) * 5.2, GOVERNOR_POS[1] + Math.sin(a) * 5.2, GOVERNOR_BALL_Z],
      radius: 1.3,
      color: BRASS, texture: "metal", metalness: 0.85, roughness: 0.24,
      attachTo: GOVERNOR_ID,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The holding pawl standing over the ratchet wheel, on its own bracket, plus a counterweight
  // lug on the wheel itself. `ratchetGeometry` already draws one angled pawl arm on the wheel;
  // the lug adds a second off-centre mass so the wheel's turn reads from any angle.
  // -------------------------------------------------------------------------------------------
  props.push(
    { kind: "box", position: [RATCHET_POS[0], RATCHET_POS[1] + 7.3, FRAME_GIRDER_Z + 4], size: [1.6, 14, 1.6], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.7 },
    { kind: "cylinder", position: [RATCHET_POS[0], RATCHET_POS[1] + 11.3, 0.8], radius: 0.9, height: 1.8, color: DARK_STEEL, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.85, roughness: 0.3 },
    { kind: "box", position: [RATCHET_POS[0], RATCHET_POS[1] + 9.1, 0.8], size: [1.4, 4.4, 1.2], color: STEEL, texture: "metal", rotation: [0, 0, 0.35], metalness: 0.78, roughness: 0.32 },
  );
  props.push({
    kind: "box",
    position: [RATCHET_POS[0] + 3, RATCHET_POS[1], -1],
    size: [3.4, 1.1, 0.8],
    color: BRASS, texture: "metal", metalness: 0.8, roughness: 0.28,
    attachTo: RATCHET_ID,
  });

  // -------------------------------------------------------------------------------------------
  // The rope counter: an enamelled dial on the counter gear's own centre (a prop only sweeps
  // about ITS gear's centre, so the dial and the gear must share x and y), a brass bezel, eight
  // marks, and the pointer that actually turns.
  // -------------------------------------------------------------------------------------------
  props.push(
    { kind: "cylinder", position: [COUNTER_POS[0], COUNTER_POS[1], 1.4], radius: 6.4, height: 0.8, color: 0xe4dfd0, texture: "stone", textureRepeat: [2, 2], rotation: [Math.PI / 2, 0, 0], roughness: 0.8, metalness: 0.06 },
    { kind: "ring", position: [COUNTER_POS[0], COUNTER_POS[1], 1.9], radius: 6.6, tube: 0.4, color: BRASS, texture: "metal", metalness: 0.8, roughness: 0.26 },
    { kind: "cylinder", position: [COUNTER_POS[0], COUNTER_POS[1], 2.9], radius: 0.9, height: 0.8, color: BRASS, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.82, roughness: 0.24 },
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [COUNTER_POS[0] + Math.cos(a) * 5.2, COUNTER_POS[1] + Math.sin(a) * 5.2, 2.1],
      size: [1.3, 0.4, 0.3],
      color: 0x24262b, texture: "metal", rotation: [0, 0, a], metalness: 0.4, roughness: 0.5,
    });
  }
  props.push({
    kind: "box",
    position: [COUNTER_POS[0] + 2.6, COUNTER_POS[1], 2.5],
    size: [5.2, 0.7, 0.4],
    color: 0x24262b, texture: "metal", metalness: 0.5, roughness: 0.42,
    attachTo: COUNTER_ID,
  });

  // -------------------------------------------------------------------------------------------
  // The bull gear's spokes and rim, on the back face so they never foul the drum barrel that
  // comes out of the front of the same wheel.
  // -------------------------------------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [BULL_POS[0] + Math.cos(a) * 10, BULL_POS[1] + Math.sin(a) * 10, -1.2],
      size: [20, 1.8, 1],
      color: STEEL,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.72,
      roughness: 0.34,
      attachTo: BULL_ID,
    });
  }
  props.push({ kind: "ring", position: [BULL_POS[0], BULL_POS[1], -1.2], radius: 20, tube: 0.8, color: DARK_STEEL, texture: "metal", metalness: 0.75, roughness: 0.32, attachTo: BULL_ID });

  // -------------------------------------------------------------------------------------------
  // The rope drum: a barrel along +Z out of the bull gear's face, an end flange at each end, a
  // spiral of rope ribs, and a spoked end plate. The barrel is a plain cylinder turning about its
  // own axis -- on its own it would look frozen however fast it spun -- so the SPIRAL of ribs is
  // what makes the drum's slow turn visible, each one attached to the drum.
  // -------------------------------------------------------------------------------------------
  props.push({
    kind: "cylinder",
    position: [DRUM_POS[0], DRUM_POS[1], DRUM_BARREL_Z],
    radius: DRUM_R,
    height: DRUM_BARREL_LEN,
    color: STEEL,
    texture: "metal",
    textureRepeat: [8, 3],
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.76,
    roughness: 0.32,
    attachTo: DRUM_ID,
  });
  for (const z of [DRUM_BARREL_Z0 + 0.2, DRUM_BARREL_Z0 + DRUM_BARREL_LEN - 0.2]) {
    props.push({ kind: "ring", position: [DRUM_POS[0], DRUM_POS[1], z], radius: DRUM_R + 0.8, tube: 1, color: IRON, texture: "rust", metalness: 0.5, roughness: 0.66, attachTo: DRUM_ID });
  }
  for (let i = 0; i < ROPE_RIB_COUNT; i++) {
    const a = ropeRibAngle(i);
    props.push({
      kind: "box",
      position: [DRUM_POS[0] + Math.cos(a) * ROPE_RIB_R, DRUM_POS[1] + Math.sin(a) * ROPE_RIB_R, ropeRibZ(i)],
      size: [1.4, ROPE_RIB_HALF_HEIGHT * 2, 1],
      color: BRASS,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.8,
      roughness: 0.3,
      attachTo: DRUM_ID,
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [DRUM_POS[0] + Math.cos(a) * 4, DRUM_POS[1] + Math.sin(a) * 4, DRUM_BARREL_Z0 + DRUM_BARREL_LEN + 0.8],
      size: [8, 1, 0.8],
      color: DARK_STEEL, texture: "metal", rotation: [0, 0, a], metalness: 0.78, roughness: 0.3,
      attachTo: DRUM_ID,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The rope, the hook block and the crate it lifts. `windWith` is rope-on-drum kinematics: each
  // of these moves along +Y by `drum.rotation * ROPE_RADIUS`, clamped into [0, HOOK_TRAVEL] so
  // the hook parks under the barrel instead of climbing through it. The rope line itself is a
  // fixed guide cable, the same simplification `hoist.ts` makes -- there is no rope primitive in
  // this sandbox to pay out and take up.
  // -------------------------------------------------------------------------------------------
  const lift = {
    gear: DRUM_ID,
    radius: ROPE_RADIUS,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, HOOK_TRAVEL] as [number, number],
  };
  props.push({ kind: "cylinder", position: [DRUM_POS[0], (HOOK_BLOCK_TOP - 0.7 + RIB_SWEEP_LOW - 0.25) / 2, ROPE_Z], radius: 0.35, height: RIB_SWEEP_LOW - 0.25 - (HOOK_BLOCK_TOP - 0.7), color: ROPE_COL, texture: "fabric", textureRepeat: [1, 8], roughness: 0.85, metalness: 0.08 });
  props.push({ kind: "box", position: [DRUM_POS[0], HOOK_BLOCK_Y, ROPE_Z], size: [3.6, HOOK_BLOCK_SIZE, 3.6], color: HOOK_COL, texture: "metal", metalness: 0.8, roughness: 0.3, windWith: lift });
  props.push({ kind: "cylinder", position: [DRUM_POS[0], 9.8, ROPE_Z], radius: 0.5, height: 2, color: HOOK_COL, texture: "metal", metalness: 0.82, roughness: 0.28, windWith: lift });
  props.push({ kind: "cone", position: [DRUM_POS[0], 7.4, ROPE_Z], radius: 1.3, height: 2.8, color: HOOK_COL, texture: "metal", rotation: [Math.PI, 0, 0], metalness: 0.82, roughness: 0.28, windWith: lift });
  props.push({ kind: "box", position: [DRUM_POS[0], CRATE_Y, ROPE_Z], size: [CRATE_SIZE + 0.8, CRATE_SIZE, CRATE_SIZE + 0.8], color: TIMBER, texture: "wood", textureRepeat: [2, 2], roughness: 0.85, metalness: 0.04, windWith: lift });
  props.push({ kind: "box", position: [DRUM_POS[0], CRATE_Y + CRATE_SIZE / 2 + 0.2, ROPE_Z], size: [CRATE_SIZE + 1.2, 0.4, CRATE_SIZE + 1.2], color: TARP_GREEN, texture: "fabric", textureRepeat: [3, 3], roughness: 0.94, metalness: 0.02, windWith: lift });
  for (const off of [-1.6, 1.6]) {
    props.push({ kind: "box", position: [DRUM_POS[0] + off, CRATE_Y, ROPE_Z], size: [0.7, CRATE_SIZE + 0.3, CRATE_SIZE + 1], color: TARP_GREEN, texture: "fabric", textureRepeat: [1, 3], roughness: 0.94, metalness: 0.02, windWith: lift });
  }

  return props;
}
