import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";
import { wheelSpokesX } from "./wheels";
import { rollingDirection } from "../dynamics";

/** Builds one gear instance for a preset layout. Mirrors `defaultLayout.ts`'s own
 *  `seedGear` helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way `clock.ts`
 *  is. `module` defaults to 1, matching every wheel here (they're all deliberately
 *  identical, see the doc comment below), but kept as a parameter for the same reason
 *  `clock.ts` keeps it: consistency with the shared preset-module shape. */
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

// --- Car body dimensions (shared by the gears' placement and the chassis props below) ---
const WHEEL_Y = 8; // wheel-hub height above the ground plane -- roughly the wheel radius, so
//                    each vertically-standing wheel sits ON the grid instead of half-buried.
const TRACK_X = 20; // left-right wheel separation (the axle width).
const WHEELBASE_Z = 20; // front-rear wheel separation.

/** Rolling radius of a road wheel: pitchRadius(16 teeth, module 1) = 8, which is also WHEEL_Y --
 *  the wheels stand exactly one radius up, so the tread meets the ground. At this sandbox's
 *  scale (`units.ts`: one world unit is a centimetre) that is an 8 cm wheel. */
export const ROAD_WHEEL_R = 8;

/** The road wheel whose rotation carries the car. Any of the four would do -- the belt tree locks
 *  all four to one speed -- so the front-left is named once here rather than picked twice. */
export const ROAD_WHEEL_ID = "자동차_좌앞바퀴";
/** Every wheel here stands upright and turns about world X. */
export const ROAD_WHEEL_AXIS: [number, number, number] = [1, 0, 0];

/** The car's id as a `Vehicle`, so the props that make up its body can say they ride on it. */
export const CAR_VEHICLE_ID = "자동차";

/** Mass of the whole car, kg: a hefty desk-sized die-cast model, which at 20 x 26 x 15 cm is
 *  about right. This is not decoration -- `dynamics.ts` reflects it into the engine as
 *  `mass * wheelRadius^2` = 1.28e-2 kg*m^2, which is six times ONE wheel's inertia and about
 *  1.5 times that of the whole mechanism (all six gears together come to 8.3e-3). So the engine
 *  spends rather more of its effort accelerating the car than accelerating its own gears, which
 *  is the point: the car pulls away instead of snapping to speed. (An earlier version of this
 *  comment claimed six times ALL FOUR wheels; that was six times one of them.) */
export const CAR_MASS = 2;

/** Engine, as a torque-speed curve rather than a commanded speed.
 *
 *  A small geared motor: 0.08 N*m held at stall, running free at 6 rad/s (~57 rpm). POSITIVE,
 *  and that sign is not a preference -- it is the right-hand rule. Rolling without slip holds
 *  the contact point still, so the wheel centre travels at `omega x r` measured up from that
 *  contact: about +X that is +Z. The car's cabin sits back at the -Z end, so +Z is the way it
 *  faces, and a positively-turning wheel therefore drives it nose-first. The direction itself
 *  is not written down anywhere below -- `rollingDirection` derives it from the wheel's axis,
 *  because a hand-written sign that came out backwards would give a car that drove away
 *  tail-first with everything else about it perfectly correct. What comes out of the torque balance with the
 *  numbers above, and is asserted in tests rather than tuned by eye: the train's time constant
 *  J/D is about 0.37 s, so the car takes roughly a second to get going, and rolling resistance
 *  holds its steady speed to about 4.6 rad/s at the engine -- a quarter below the free speed.
 *  A machine that runs slower under load than it does unloaded is the whole reason for modelling
 *  a motor curve instead of a fixed speed. */
export const ENGINE_FREE_SPEED = 6;
export const ENGINE_STALL_TORQUE = 0.08;

/** How far the car is COMMANDED to drive before the limit switch throws the motor into reverse.
 *  Comfortably inside its 150-unit showroom cell, so a driving car never visits a neighbour. */
export const DRIVE_RANGE = 40;

/** The hard end of the car's patch of ground. Wider than DRIVE_RANGE because reversing a real
 *  machine is not instant: the motor has to brake two kilograms of car against its own momentum,
 *  and it coasts several more centimetres while doing so. Reaching this is a kerb -- travel
 *  stops, the wheels keep turning. */
export const TRAVEL_LIMIT = 52;

/** The engine rotation that corresponds to DRIVE_RANGE of travel.
 *
 *  The driveshaft (r4) belts down to the wheels (r8), so wheelRotation = engineRotation / 2, and
 *  a wheel of radius 8 rolls 8 units per radian: distance = engineRotation * 4. Derived from the
 *  ratio rather than measured off a run, so changing the belt or the wheel size cannot silently
 *  leave the car turning round in the wrong place. */
export const ENGINE_STROKE: [number, number] = [0, DRIVE_RANGE / (ROAD_WHEEL_R / 2)];

/** A recognizable 4-wheel CAR: four wheels standing vertically at the corners of a
 *  rectangular wheelbase, wrapped in a decorative chassis frame + body (see
 *  `createCarProps`), all four wheels belt-synchronized off one engine crank.
 *
 *  The gears carry the real, verifiable mechanism (one engine, four wheels locked to the
 *  same speed); the props (`createCarProps`) carry the recognizable shape (axle rods,
 *  side rails, a body shell) so it reads as an actual vehicle rather than four discs
 *  floating in space. The two are deliberately separate: props are static decoration that
 *  never mesh, rotate, persist, or affect the simulation -- see `render/props.ts`.
 *
 *  Layout (top-down, X = left/right axle direction, -Z = "forward"), wheels raised to
 *  WHEEL_Y so they stand on the ground:
 *
 *    자동차_좌앞바퀴 (0,8,0) ------ 자동차_우앞바퀴 (20,8,0)      <- front axle
 *         |
 *    자동차_좌뒷바퀴 (0,8,-20) ---- 자동차_우뒷바퀴 (20,8,-20)    <- rear axle
 *
 *  Every wheel uses `axis: [1, 0, 0]` -- rotating about world X so the wheel disc stands
 *  UPRIGHT and rolls forward/back, exactly how a real wheel sits, instead of the old
 *  `[0, 1, 0]` that spun them flat like turntables. The physics is unchanged by this
 *  reorientation: belt links carry rotation regardless of axis, and the engine stays
 *  coincident with the front-left wheel (same position AND axis) so its shaft coupling
 *  still forms.
 *
 *  자동차_엔진 (the crank) sits EXACTLY coincident with 자동차_좌앞바퀴 -- same position
 *  [0,8,0], same axis [1,0,0]. `pulley` is one of `evaluatePair`'s `COINCIDENT_ONLY`
 *  types (meshing.ts): a pulley has no direct tooth-mesh rule of its own and only ever
 *  receives rotation by sharing a shaft with whatever drives it, exactly like a
 *  chain/belt wheel is bolted straight onto a power shaft in reality. This is the same
 *  coincident-shaft pattern `defaultLayout.ts`'s own pulley+belt demo cluster already
 *  uses (crank coincident with one pulley, a `RemoteLink` carrying power on to a
 *  second) -- reused here across four wheels instead of two.
 *
 *  All four wheels share IDENTICAL teeth/module (16 / 1 -> pitchRadius 8), so every
 *  belt ratio between them (`pitchRadius(a) / pitchRadius(b)` in `graph.ts`'s
 *  `buildEdges`, for `kind: "belt"` remote links) is exactly 8/8 = 1. Combined with the
 *  coincident 1:1 crank<->front-left coupling, and the fact that `propagateRotation`
 *  (rotation.ts) uses `sign = +1` for EVERY `coupling`, `chain`, AND `belt` edge --
 *  never the `-1` an ordinary tooth mesh gets -- all four wheels end up turning at
 *  EXACTLY the engine's angular velocity, same magnitude AND same sign. That's the
 *  honest, verifiable claim of this preset: not a real car's differential-driven wheels
 *  (which don't literally share one rigid speed), but "one engine, four wheels, locked
 *  together" -- a legitimate simplified toy-car/gear-clock-style mechanism, verified
 *  numerically (not just derived on paper) in tests/sim/presets/car.test.ts.
 *
 *  Topology is a spanning TREE across the four wheels, not a loop -- three belts, not
 *  four:
 *
 *    자동차_좌앞바퀴 -- (belt) -- 자동차_우앞바퀴   (front axle)
 *    자동차_좌앞바퀴 -- (belt) -- 자동차_좌뒷바퀴   (left side)
 *    자동차_좌뒷바퀴 -- (belt) -- 자동차_우뒷바퀴   (rear axle)
 *
 *  Three belts already connect all four wheels into one component (a tree needs only
 *  N-1 edges to span N nodes); a fourth belt closing the rectangle into a loop would be
 *  redundant -- it wouldn't change any wheel's resulting speed (every wheel is already
 *  forced to the same 1:1 ratio via the tree that exists), so it's left out rather than
 *  added "for symmetry."
 *
 *  Remote links (`kind: "belt"`) have no distance/geometry constraint in `evaluatePair`
 *  at all -- they're declared directly in `LayoutState.remoteLinks` and turned into
 *  edges unconditionally by `buildEdges`, regardless of how far apart the two gears
 *  actually sit (unlike a tooth `"mesh"` edge, which DOES require the two pitch circles
 *  to be the right distance apart). That's what makes the rectangular 20-unit wheelbase
 *  above possible without contorting the wheels' positions to satisfy a mesh-distance
 *  formula that doesn't apply to belts anyway.
 *
 *  `angularVelocity: -1.0` on the engine is an arbitrary but deliberately non-trivial
 *  (non-1, non-zero, negative) speed -- chosen the same way `clock.ts`'s minute drive
 *  picks `-0.6`, so a direction/ratio test can't pass by some sign-convention accident
 *  that would only show up at a "nice" speed like 1 or -1. */
export function createCarPreset(): LayoutState {
  const midX = TRACK_X / 2; // 10 -- car centre, under the body
  const midZ = -WHEELBASE_Z / 2; // -10
  const gears: GearInstance[] = [
    // Engine + driveshaft live at the car's CENTRE, tucked under the body shell where the
    // crank's protruding handle is hidden (axis [0,1,0] points the handle UP into the body,
    // not out past a wheel like the old front-left-coincident engine did). The small engine
    // crank turns a wheel-sized driveshaft pulley (coincident 1:1 coupling), which belts out
    // to the wheels -- so the crank handle no longer sticks out beside the front-left wheel.
    // Seeded at REST. A motorised crank's speed is an output of the torque balance, not an
    // input, so the car starts stopped and pulls away under its own torque.
    seedGear("자동차_엔진", "crank", [midX, WHEEL_Y, midZ], [0, 1, 0], 8, 1, 0),
    seedGear("자동차_구동축", "pulley", [midX, WHEEL_Y, midZ], [0, 1, 0], 8, 1), // driveshaft, small (r4) so it stays clear of the wheels' overlap radius at the car centre
    seedGear("자동차_좌앞바퀴", "pulley", [0, WHEEL_Y, 0], [1, 0, 0], 16, 1),
    seedGear("자동차_우앞바퀴", "pulley", [TRACK_X, WHEEL_Y, 0], [1, 0, 0], 16, 1),
    seedGear("자동차_좌뒷바퀴", "pulley", [0, WHEEL_Y, -WHEELBASE_Z], [1, 0, 0], 16, 1),
    seedGear("자동차_우뒷바퀴", "pulley", [TRACK_X, WHEEL_Y, -WHEELBASE_Z], [1, 0, 0], 16, 1),
  ];

  // The car DRIVES, for real: the engine is a motor with a torque curve, the car is a Vehicle
  // with mass, and `tick` integrates how far its wheels have rolled it. Nothing here displaces a
  // gear -- the parts keep the fixed geometry that makes them mesh, and the assembly as a whole
  // is carried by `Vehicle.distance`.
  gears[0].motor = { freeSpeed: ENGINE_FREE_SPEED, stallTorque: ENGINE_STALL_TORQUE };
  // Every part of the mechanism travels with the car. Without this the body drives away and
  // leaves all four wheels, the engine and the driveshaft standing at the start line, spinning
  // on the spot -- and nothing anywhere would report it, because the simulation is perfectly
  // happy either way: `ridesOn` is a drawing instruction, and the gear positions it does not
  // touch are what keep the belts and couplings valid.
  for (const gear of gears) gear.ridesOn = CAR_VEHICLE_ID;
  gears[0].reverseAt = ENGINE_STROKE; // a limit switch: drive out, brake, drive back

  return {
    gears,
    remoteLinks: [
      // Driveshaft (r4) belts to the front-left wheel (r8): a 4/8 = 1/2 step-down. The three
      // wheel-to-wheel belts (all r8, ratio 1) then carry that same speed to the other three
      // wheels -- so all FOUR wheels still turn at exactly the SAME speed as each other (half
      // the driveshaft/engine speed). The small driveshaft is what keeps the hidden centre hub
      // clear of the wheels' overlap radius; the wheels remaining locked together is the point.
      { a: "자동차_구동축", b: "자동차_좌앞바퀴", kind: "belt" }, // driveshaft -> front-left
      { a: "자동차_좌앞바퀴", b: "자동차_우앞바퀴", kind: "belt" }, // front axle
      { a: "자동차_좌앞바퀴", b: "자동차_좌뒷바퀴", kind: "belt" }, // left side
      { a: "자동차_좌뒷바퀴", b: "자동차_우뒷바퀴", kind: "belt" }, // rear axle
    ],
    vehicles: [
      {
        id: CAR_VEHICLE_ID,
        wheel: ROAD_WHEEL_ID,
        radius: ROAD_WHEEL_R,
        mass: CAR_MASS,
        direction: rollingDirection(ROAD_WHEEL_AXIS),
        distance: 0,
        limit: [-TRAVEL_LIMIT, TRAVEL_LIMIT],
      },
    ],
  };
}

/** The car's decorative body -- purely visual props (see `render/props.ts`), no
 *  simulation. Two axle rods threading the wheel pairs, two side rails linking front to
 *  rear, and a two-tier body shell (lower body + cabin) sitting on top, so the four
 *  belt-driven wheels read as an actual car rather than four discs in a rectangle. All
 *  dimensions are derived from the same WHEEL_Y / TRACK_X / WHEELBASE_Z the gears use, so
 *  the frame lands exactly on the wheels. */
export function createCarProps(): Prop[] {
  const midX = TRACK_X / 2; // 10
  const midZ = -WHEELBASE_Z / 2; // -10
  const frame = 0x3a3f47; // dark gunmetal chassis
  const rod = 0x8b929c; // steel axle rod
  const body = 0xc0392b; // car-red body shell
  const cabin = 0x9a2f24; // slightly darker cabin
  const spoke = 0xe8ecf0; // bright spokes, so the wheels' spin is actually visible

  // The four wheels are pulley gears -- they already spin, but a pulley disc is near
  // rotationally symmetric, so the spin doesn't read. Bright spokes attached to each wheel
  // gear make it obvious the wheels are turning. Wheel pitch radius = (1*16)/2 = 8.
  const wheels: Array<{ id: string; center: [number, number, number] }> = [
    { id: "자동차_좌앞바퀴", center: [0, WHEEL_Y, 0] },
    { id: "자동차_우앞바퀴", center: [TRACK_X, WHEEL_Y, 0] },
    { id: "자동차_좌뒷바퀴", center: [0, WHEEL_Y, -WHEELBASE_Z] },
    { id: "자동차_우뒷바퀴", center: [TRACK_X, WHEEL_Y, -WHEELBASE_Z] },
  ];
  const spokes = wheels.flatMap((w) =>
    wheelSpokesX({ attachTo: w.id, center: w.center, radius: 8, count: 6, thickness: 0.6, color: spoke }),
  );

  return [
    ...spokes.map((p) => ({ ...p, ridesOn: CAR_VEHICLE_ID })),
    // Axle rods running left<->right through each wheel pair (cylinders default to the Y
    // axis, so rotate 90° about Z to lay them along X).
    { kind: "cylinder", position: [midX, WHEEL_Y, 0], radius: 0.7, height: TRACK_X + 2, color: rod, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.35, ridesOn: CAR_VEHICLE_ID },
    { kind: "cylinder", position: [midX, WHEEL_Y, -WHEELBASE_Z], radius: 0.7, height: TRACK_X + 2, color: rod, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.35, ridesOn: CAR_VEHICLE_ID },
    // Side rails running front<->rear, linking the axle ends into a chassis rectangle.
    { kind: "box", position: [0, WHEEL_Y, midZ], size: [1.3, 1.3, WHEELBASE_Z + 3], color: frame, texture: "metal", ridesOn: CAR_VEHICLE_ID },
    { kind: "box", position: [TRACK_X, WHEEL_Y, midZ], size: [1.3, 1.3, WHEELBASE_Z + 3], color: frame, texture: "metal", ridesOn: CAR_VEHICLE_ID },
    // Lower body shell sitting above the axles.
    { kind: "box", position: [midX, WHEEL_Y + 5, midZ], size: [TRACK_X - 3, 5, WHEELBASE_Z + 6], color: body, texture: "metal", metalness: 0.55, roughness: 0.35, ridesOn: CAR_VEHICLE_ID },
    // Cabin / greenhouse, set back toward the rear and narrower.
    { kind: "box", position: [midX, WHEEL_Y + 9.5, midZ - 3], size: [TRACK_X - 7, 4.5, WHEELBASE_Z - 4], color: cabin, texture: "metal", metalness: 0.55, roughness: 0.35, ridesOn: CAR_VEHICLE_ID },
  ];
}
