import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Mirrors the other preset modules'
 *  self-contained `seedGear` helper exactly -- duplicated rather than imported so each
 *  preset module stays a fully self-contained, hand-verifiable spec of its own mechanism. */
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

// ---------------------------------------------------------------------------
// Geometry constants. Everything below is derived from these arithmetically --
// no coordinate in this file is guessed.
// ---------------------------------------------------------------------------

/** The wheel turns in the XY plane and faces the viewer, so every gear in the train
 *  shares the axis +Z. */
const AXIS_Z: [number, number, number] = [0, 0, 1];

/** Centre of the big wheel, in the XY plane. Every rim / spoke / gondola prop is placed
 *  relative to this point, and the hub sprocket sits exactly here. */
export const HUB_X = 0;
export const HUB_Y = 24;

/** Radius of the wheel rim (centre-line of the rim torus). */
export const WHEEL_RADIUS = 16;

/** How many passenger gondolas hang off the rim. */
export const GONDOLA_COUNT = 8;

/** The wheel is built as a drum: two identical rims at z = +/-RIM_Z, spokes in each of
 *  those two planes, and the gondolas slung between them at z = 0. */
const RIM_Z = 3.5;

/** The DRIVE PLANE. The hub sprocket, the drive chain and the whole gearbox all live at
 *  this z, which is BEHIND the rear rim (-3.5 - 0.55 tube = -4.05) and IN FRONT of the
 *  rear A-frame (-9 - 0.65 = -8.35). That gap is exactly where a real ferris wheel runs
 *  its drive chain, and it means the chain ribbon `SceneSync` draws from the gearbox up to
 *  the hub never passes through the wheel it is turning.
 *
 *  Putting the hub sprocket off the wheel's own z-plane costs nothing kinematically:
 *  `spinAttachedPose` rotates an attached prop ABOUT THE GEAR'S AXIS around the gear's
 *  centre, and a rotation about +Z leaves every point's z untouched. So a rim prop authored
 *  at z = +3.5 keeps z = +3.5 forever while revolving correctly about (HUB_X, HUB_Y).
 *  Only the hub's x/y matter to the wheel; its z is free, and is used here to put the
 *  sprocket where a real one goes -- on the back of the hub. */
const DRIVE_Z = -6;

const GROUND_Y = -6;   // top face of the concrete pad; every leg foot lands here
const FOOT_X = 14;     // half-spread of an A-frame at the ground
const APEX_Y = 22;     // where an A-frame's two legs meet, just under the hub bearing
const LEG_Z = 9;       // the two A-frames stand at z = +/-9, clear of the rims at +/-3.5

// --- the reduction train, laid out along the ground on the -X side ---------------

const MOTOR_TEETH = 8;
const MOTOR_MODULE = 0.5;
/** pitchRadius = module * teeth / 2 = 0.5 * 8 / 2 = 2 */
const MOTOR_R = (MOTOR_MODULE * MOTOR_TEETH) / 2;

const REDUCER_TEETH = 32;
const REDUCER_MODULE = 0.5; // same module as the motor pinion -- required for a real tooth mesh
/** pitchRadius = 0.5 * 32 / 2 = 8 */
const REDUCER_R = (REDUCER_MODULE * REDUCER_TEETH) / 2;

const DRIVE_SPROCKET_TEETH = 10;
const HUB_SPROCKET_TEETH = 30;
/** Both sprockets MUST share a module: this sandbox reads pitchRadius as module*teeth/2,
 *  and for a real chain the pitch radius of a sprocket is set by the CHAIN's pitch
 *  (r ~= p*N/2pi), so two sprockets on one chain have pitch radii in the ratio of their
 *  tooth counts -- i.e. the same module here. 0.5 gives 2.5 and 7.5. */
const SPROCKET_MODULE = 0.5;
const DRIVE_SPROCKET_R = (SPROCKET_MODULE * DRIVE_SPROCKET_TEETH) / 2; // 2.5
const HUB_SPROCKET_R = (SPROCKET_MODULE * HUB_SPROCKET_TEETH) / 2;     // 7.5

/** Shaft height of the gearbox. Chosen so the big reduction gear (pitchRadius 8) clears
 *  the pad: 3 - 8 = -5, one unit above GROUND_Y = -6. */
const GEARBOX_Y = 3;
/** The reduction gear / drive sprocket shaft. */
const REDUCER_X = -18;
/** The motor pinion sits EXACTLY one pitch distance away along -X:
 *      MOTOR_R + REDUCER_R = 2 + 8 = 10
 *      REDUCER_X - 10 = -18 - 10 = -28
 *  so the centre distance is 10.000, dead on the tooth mesh `evaluatePair` requires
 *  (|10 - (2+8)| = 0, well inside the 5% MESH_TOLERANCE). */
const MOTOR_X = REDUCER_X - (MOTOR_R + REDUCER_R);

/** Speed reduction from the motor pinion to the wheel hub:
 *
 *    stage 1, tooth mesh:  w(reducer) = -(8/32) * w(motor)   = -0.25 * w(motor)
 *    stage 2, shaft:       w(driveSprocket) = w(reducer)                 (1:1 coupling)
 *    stage 3, chain:       w(hub) = +(10/30) * w(driveSprocket) = (1/3) * w(driveSprocket)
 *
 *  so w(hub) = (1/3) * (-1/4) * w(motor) = -w(motor)/12. */
export const TOTAL_REDUCTION = 12;

/** The motor's commanded speed. 2.4 rad/s divided by the 12:1 reduction leaves the wheel
 *  at 0.2 rad/s, i.e. 2*pi/0.2 = 31.4 seconds for one full turn of the wheel -- a ferris
 *  wheel's actual, watchable pace rather than a blur. */
export const MOTOR_SPEED = 2.4;

/** Angle of gondola/spoke `i` around the wheel. Index 0 is put at the BOTTOM (-pi/2) so a
 *  gondola always sits level with the boarding platform when the layout is first loaded. */
export function gondolaAngle(i: number): number {
  return -Math.PI / 2 + (i / GONDOLA_COUNT) * Math.PI * 2;
}

/** A ferris wheel: a motor pinion drives a big reduction gear, that gear's shaft carries a
 *  small chain sprocket, and a drive chain carries the motion up to a large sprocket on the
 *  back of the wheel hub. The rim, the spokes and all eight gondolas are props `attachTo`-ed
 *  to that hub sprocket, so the whole wheel turns as one body.
 *
 *  Mechanism (front view, X = left/right, Y = up, +Z = toward the viewer; the entire train
 *  shares the axis +Z, so the wheel faces the viewer):
 *
 *    관람차_모터 (crank, 8t m0.5, r=2)  at [-28, 3, -6]
 *        --tooth mesh, centre distance 2 + 8 = 10-->
 *    관람차_감속치차 (spur, 32t m0.5, r=8) at [-18, 3, -6]
 *        --coincident 1:1 shaft coupling-->
 *    관람차_구동스프라켓 (sprocket, 10t m0.5, r=2.5) at [-18, 3, -6]
 *        --drive chain, ratio 10/30-->
 *    관람차_허브스프라켓 (sprocket, 30t m0.5, r=7.5) at [0, 24, -6]  <- THE WHEEL HUB
 *
 *  Why each connection is the connection it is (all confirmed against `meshing.ts`):
 *
 *  * MOTOR -> REDUCER is a genuine tooth mesh. `crank` and `spur` are both in
 *    `PARALLEL_FAMILY`, their axes are identical (|dot| = 1 >= 0.98), and their centre
 *    distance is exactly pitchRadius(a) + pitchRadius(b) = 2 + 8 = 10. `buildEdges` gives
 *    it `ratio = 8/32 = 0.25`, and `propagateRotation` applies sign -1 to a `mesh` edge, so
 *    the reduction gear turns at -0.25x the motor -- a 4:1 speed reduction, reversed.
 *
 *  * REDUCER -> DRIVE SPROCKET is a coincident shaft coupling. `sprocket` is one of
 *    `evaluatePair`'s `COINCIDENT_ONLY` types: a real chainring is bolted onto a power
 *    shaft, not meshed tooth-to-tooth with the gear beside it, so sharing a position and an
 *    axis is the ONLY way it can be driven. Both sit at [-18, 3, -6] on axis +Z, giving a
 *    `coupling` edge with `ratio: 1` and sign +1 -- same speed, same direction. (A
 *    coincident pair that forms a valid edge is never reported as an overlap; `isOverlapping`
 *    returns false the moment `evaluatePair` finds an edge.)
 *
 *  * DRIVE SPROCKET -> HUB SPROCKET is a `RemoteLink` of `kind: "chain"`. `graph.ts` gives a
 *    chain link `ratio = a.teeth / b.teeth` (tooth-based, unlike a belt's radius-based
 *    ratio) = 10/30 = 1/3, again with sign +1. Chain links are distance-free, which is what
 *    lets the gearbox sit on the ground 27.7 units from the hub without any geometric
 *    constraint:  |[-18,3] - [0,24]| = sqrt(18^2 + 21^2) = sqrt(765) = 27.66.
 *
 *  The honest, verifiable claim of this preset is therefore a SPEED ratio and nothing else:
 *  the wheel hub turns at exactly 1/12 the motor's angular speed, in the opposite direction.
 *  This preset's crank carries no `motor`, so its speed is an input rather than an outcome --
 *  an ideal velocity source, the honest reading of which is "a hand cranking at a chosen rate".
 *  And what a gondola may CARRY stays unclaimable even now that the sandbox models torque: a
 *  rider's weight would have to hang off the hub, and nothing in the model lets weight load a
 *  train (a `load` gear is a viscous damper, not a mass on a rope). Every
 *  number in this comment is checked numerically in tests/sim/presets/ferriswheel.test.ts.
 *
 *  No `reverseAt` and no `travelLimit` anywhere: unlike the hoist's hook or the castle's
 *  portcullis, a ferris wheel has NO limited travel to bound. It is a body in continuous
 *  rotation; letting `rotation` accumulate forever is the physically correct behaviour, and
 *  nothing in the layout translates that rotation into unbounded linear travel (there is no
 *  rack, and no prop uses `windWith`). */
export function createFerrisWheelPreset(): LayoutState {
  const gears: GearInstance[] = [
    // The drive motor. `crank` is the one type whose speed is an external INPUT rather than
    // a derived output, so the motor has to be a crank for anything downstream to turn.
    seedGear("관람차_모터", "crank", [MOTOR_X, GEARBOX_Y, DRIVE_Z], AXIS_Z, MOTOR_TEETH, MOTOR_MODULE, MOTOR_SPEED),
    // The reduction gear: 32 teeth against the motor's 8 -> a 4:1 speed reduction.
    seedGear("관람차_감속치차", "spur", [REDUCER_X, GEARBOX_Y, DRIVE_Z], AXIS_Z, REDUCER_TEETH, REDUCER_MODULE),
    // The chain sprocket on that same shaft -- coincident with the reduction gear, so it is
    // coupled to it 1:1 and can hand the motion on to the chain.
    seedGear("관람차_구동스프라켓", "sprocket", [REDUCER_X, GEARBOX_Y, DRIVE_Z], AXIS_Z, DRIVE_SPROCKET_TEETH, SPROCKET_MODULE),
    // The big sprocket on the back of the wheel hub -- 30 teeth against the drive
    // sprocket's 10, a further 3:1 reduction. THIS is the gear the whole wheel hangs off:
    // every rim, spoke and gondola prop below names this id in its `attachTo`.
    seedGear("관람차_허브스프라켓", "sprocket", [HUB_X, HUB_Y, DRIVE_Z], AXIS_Z, HUB_SPROCKET_TEETH, SPROCKET_MODULE),
  ];

  return {
    gears,
    remoteLinks: [
      // The drive chain running up the back of the wheel: 10 teeth -> 30 teeth, a 3:1
      // speed reduction, same direction.
      { a: "관람차_구동스프라켓", b: "관람차_허브스프라켓", kind: "chain" },
    ],
  };
}

/** The ferris wheel's body -- purely visual props (see `render/props.ts`), no simulation.
 *
 *  Everything that belongs to the WHEEL (two rims, two inner tension rings, 16 spokes,
 *  8 gondolas with their pivot shafts, hangers, bodies and canopies, plus the rim lamps) is
 *  `attachTo`-ed to 관람차_허브스프라켓, so `SceneSync` re-poses it every frame from the
 *  hub's accumulated rotation and the whole wheel visibly turns as one rigid body. A bare
 *  rim torus is rotationally symmetric and would show no motion on its own -- the spokes,
 *  the gondolas and the lamps are what make the rotation actually readable.
 *
 *  Everything that belongs to the STRUCTURE (concrete pad, two A-frames, ground beams, hub
 *  axle and bearings, boarding platform, gearbox bedplate and pedestals) is static, because
 *  on a real ferris wheel it is. */
export function createFerrisWheelProps(): Prop[] {
  const steel = 0x9aa4ae;      // galvanised frame steel
  const darkSteel = 0x6d7580;  // painted structural members
  const timber = 0xb08442;     // boarding platform decking
  const darkTimber = 0x7a5a30; // platform posts and rails
  const carBody = 0x9c6b3f;    // varnished timber gondola bodies
  const canopyA = 0xc0392b;    // fairground red canvas
  const canopyB = 0xe8dcbe;    // cream canvas
  const lamp = 0xffd76a;       // rim lamps
  const concrete = 0x8e8c86;   // the pad everything stands on
  const machine = 0x7d5f4a;    // the weathered motor housing

  const HUB = "관람차_허브스프라켓";

  /** A straight structural member lying in the XY plane, drawn as a thin box running from
   *  `from` to `to`. A box's long axis is its local Y, and rotating about Z by
   *  `-atan2(dx, dy)` maps local +Y onto the (dx, dy) run -- the same construction
   *  `hoist.ts` uses to lay its rope along a slope. */
  function strutXY(
    from: [number, number, number],
    to: [number, number, number],
    thickness: number,
    color: number,
  ): Prop {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return {
      kind: "box",
      position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, from[2]],
      size: [thickness, Math.hypot(dx, dy), thickness],
      color,
      texture: "metal",
      rotation: [0, 0, -Math.atan2(dx, dy)],
      metalness: 0.6,
      roughness: 0.4,
    };
  }

  const props: Prop[] = [];

  // --- ground ---------------------------------------------------------------------
  // One concrete pad covering the whole footprint: x in [-32, 20], z in [-12.5, 15.5].
  props.push({
    kind: "box",
    position: [-6, GROUND_Y - 0.7, 1.5],
    size: [52, 1.4, 28],
    color: concrete,
    texture: "stone",
    textureRepeat: [8, 5],
    roughness: 0.95,
    metalness: 0.02,
  });

  // --- the two A-frames -------------------------------------------------------------
  // Each frame is two legs from a foot at (+/-FOOT_X, GROUND_Y) up to the apex at
  // (0, APEX_Y). Leg run: dx = 14, dy = APEX_Y - GROUND_Y = 28, so each leg is
  // sqrt(14^2 + 28^2) = sqrt(980) = 31.305 long.
  for (const zSign of [-1, 1]) {
    const z = LEG_Z * zSign;
    for (const xSign of [-1, 1]) {
      props.push(strutXY([FOOT_X * xSign, GROUND_Y, z], [0, APEX_Y, z], 1.3, steel));
    }
    // Two horizontal braces. A leg's x at height y is FOOT_X * (APEX_Y - y) / 28, so:
    //   y =  6 -> x = 14 * 16/28 = 8    -> a brace 16 wide
    //   y = -1 -> x = 14 * 23/28 = 11.5 -> a brace 23 wide
    props.push({
      kind: "box", position: [0, 6, z], size: [16, 0.9, 0.9],
      color: darkSteel, texture: "metal", metalness: 0.6, roughness: 0.4,
    });
    props.push({
      kind: "box", position: [0, -1, z], size: [23, 0.9, 0.9],
      color: darkSteel, texture: "metal", metalness: 0.6, roughness: 0.4,
    });
  }

  // Ground beams tying each pair of feet front-to-back, running along Z at x = +/-FOOT_X.
  for (const xSign of [-1, 1]) {
    props.push({
      kind: "box",
      position: [FOOT_X * xSign, GROUND_Y + 0.8, 0],
      size: [1.8, 1.4, LEG_Z * 2 + 2],
      color: darkSteel,
      texture: "metal",
      metalness: 0.55,
      roughness: 0.45,
    });
  }

  // --- hub axle and bearings ---------------------------------------------------------
  // A cylinder's default long axis is Y; rotating +pi/2 about X lays it along Z, spanning
  // the full width between the two A-frames.
  props.push({
    kind: "cylinder",
    position: [HUB_X, HUB_Y, 0],
    radius: 0.9,
    height: LEG_Z * 2 + 2,
    color: steel,
    texture: "metal",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.75,
    roughness: 0.3,
  });
  for (const zSign of [-1, 1]) {
    props.push({
      kind: "cylinder",
      position: [HUB_X, HUB_Y, (LEG_Z - 1) * zSign],
      radius: 1.9,
      height: 2.2,
      color: darkSteel,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.7,
      roughness: 0.35,
    });
    // The A-frame apex only reaches y = APEX_Y = 22; a short king post carries the last
    // 24 - 22 = 2 units up to the axle centre.
    props.push({
      kind: "box",
      position: [HUB_X, (APEX_Y + HUB_Y) / 2, LEG_Z * zSign],
      size: [2.6, HUB_Y - APEX_Y, 2.6],
      color: steel,
      texture: "metal",
      metalness: 0.6,
      roughness: 0.4,
    });
  }

  // --- the wheel itself: everything from here on turns with the hub -------------------
  // A THREE.TorusGeometry lies in the XY plane with its axis along Z -- exactly the wheel's
  // own plane and axis -- so the rims need no rotation at all.
  for (const zSign of [-1, 1]) {
    props.push({
      kind: "ring",
      position: [HUB_X, HUB_Y, RIM_Z * zSign],
      radius: WHEEL_RADIUS,
      tube: 0.55,
      color: steel,
      texture: "metal",
      metalness: 0.65,
      roughness: 0.35,
      attachTo: HUB,
    });
    // Inner tension ring at half the rim radius, where the spokes are braced.
    props.push({
      kind: "ring",
      position: [HUB_X, HUB_Y, RIM_Z * zSign],
      radius: WHEEL_RADIUS / 2,
      tube: 0.3,
      color: darkSteel,
      texture: "metal",
      metalness: 0.6,
      roughness: 0.4,
      attachTo: HUB,
    });
  }

  // Spokes: GONDOLA_COUNT per rim plane, on the same angles as the gondolas so each spoke
  // lands on a gondola pivot. Each spoke is a bar of length WHEEL_RADIUS whose long axis is
  // local X; rotating about Z by `a` points +X along (cos a, sin a), and its midpoint sits
  // at half the radius along that direction, so the bar runs hub -> rim exactly.
  for (const zSign of [-1, 1]) {
    for (let i = 0; i < GONDOLA_COUNT; i++) {
      const a = gondolaAngle(i);
      props.push({
        kind: "box",
        position: [
          HUB_X + Math.cos(a) * (WHEEL_RADIUS / 2),
          HUB_Y + Math.sin(a) * (WHEEL_RADIUS / 2),
          RIM_Z * zSign,
        ],
        size: [WHEEL_RADIUS, 0.45, 0.45],
        color: steel,
        texture: "metal",
        rotation: [0, 0, a],
        metalness: 0.65,
        roughness: 0.35,
        attachTo: HUB,
      });
    }
  }

  // Rim lamps, offset half a step from the gondolas so they read as a separate ring of
  // lights. Small spheres on the front rim's outer face.
  for (let i = 0; i < GONDOLA_COUNT; i++) {
    const a = gondolaAngle(i) + Math.PI / GONDOLA_COUNT;
    props.push({
      kind: "sphere",
      position: [
        HUB_X + Math.cos(a) * (WHEEL_RADIUS + 0.9),
        HUB_Y + Math.sin(a) * (WHEEL_RADIUS + 0.9),
        RIM_Z + 0.4,
      ],
      radius: 0.5,
      color: lamp,
      texture: "metal",
      metalness: 0.25,
      roughness: 0.25,
      attachTo: HUB,
    });
  }

  // --- gondolas ---------------------------------------------------------------------
  // Each gondola hangs from a pivot shaft that also ties the two rims together at
  // z = +/-RIM_Z. Rest pose (before the wheel turns): the pivot sits on the rim circle at
  // radius WHEEL_RADIUS, the hanger drops 2.6 below it and the car body 3.4 below it, with
  // the canvas canopy capping the body. The whole assembly is attached to the hub, so it
  // revolves rigidly with the wheel -- this sandbox has no free pivot joint, and the spec
  // for this machine is a rigid wheel, not a gravity-levelled gondola.
  for (let i = 0; i < GONDOLA_COUNT; i++) {
    const a = gondolaAngle(i);
    const px = HUB_X + Math.cos(a) * WHEEL_RADIUS;
    const py = HUB_Y + Math.sin(a) * WHEEL_RADIUS;

    // Pivot shaft, spanning the drum between the two rims (length 2 * RIM_Z + 0.4).
    props.push({
      kind: "cylinder",
      position: [px, py, 0],
      radius: 0.3,
      height: RIM_Z * 2 + 0.4,
      color: steel,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.7,
      roughness: 0.35,
      attachTo: HUB,
    });
    // Hanger stirrup dropping from the pivot to the car's roof.
    props.push({
      kind: "box",
      position: [px, py - 1.3, 0],
      size: [0.35, 2.6, 0.35],
      color: darkSteel,
      texture: "metal",
      metalness: 0.7,
      roughness: 0.35,
      attachTo: HUB,
    });
    // Car body: 3.8 wide, 2.2 tall, 4.4 deep, centred 3.4 below the pivot (so its roof line
    // is at -3.4 + 1.1 = -2.3 and its floor at -4.5).
    props.push({
      kind: "box",
      position: [px, py - 3.4, 0],
      size: [3.8, 2.2, 4.4],
      color: carBody,
      texture: "wood",
      textureRepeat: [2, 1],
      metalness: 0.08,
      roughness: 0.75,
      attachTo: HUB,
    });
    // Canvas canopy, sitting on the roof line: centred at -2.0, 0.4 thick -> spans
    // -2.2 .. -1.8, just clear of the body's -2.3 roof.
    props.push({
      kind: "box",
      position: [px, py - 2.0, 0],
      size: [4.4, 0.4, 5.0],
      color: i % 2 === 0 ? canopyA : canopyB,
      texture: "fabric",
      textureRepeat: [3, 3],
      metalness: 0.03,
      roughness: 0.85,
      attachTo: HUB,
    });
  }

  // --- boarding platform -------------------------------------------------------------
  // A raised timber deck standing in FRONT of the wheel (z from 3 to 11). It does NOT clear
  // the gondolas in z, contrary to what this comment used to say: 2.2 is the car body's
  // half-depth alone, but the canopy is 2.5 either side and each gondola's pivot shaft is
  // RIM_Z * 2 + 0.4 = 7.4 long, i.e. 3.7 either side, which reaches into the deck's own 3..11
  // band. What actually keeps them apart is the Y separation below -- the deck top is at 3.2
  // and the lowest gondola's floor at 3.5 -- so say that rather than claiming a z clearance
  // the geometry does not have.
  // Deck top sits at y = 3.2; the lowest gondola's floor is at 24 - 16 - 4.5 = 3.5, so a
  // rider steps up 0.3 into the car.
  const DECK_Y = 2.7;      // deck slab centre; slab is 1 thick -> top 3.2, underside 2.2
  const DECK_Z = 7;        // slab centre; slab is 8 deep -> z from 3 to 11
  const DECK_HALF_X = 8;   // slab is 16 wide. An A-frame leg is at x = 9.4 at deck height
                           // (14 * (22 - 3.2)/28), so a half-width of 8 clears both legs.
  props.push({
    kind: "box",
    position: [0, DECK_Y, DECK_Z],
    size: [DECK_HALF_X * 2, 1, 8],
    color: timber,
    texture: "wood",
    textureRepeat: [6, 3],
    metalness: 0.04,
    roughness: 0.85,
  });
  // Four posts carrying the deck down to the pad: from GROUND_Y (-6) to the slab underside
  // (2.2) is 8.2 tall, centred at (-6 + 2.2)/2 = -1.9.
  for (const xSign of [-1, 1]) {
    for (const zOff of [-2.5, 2.5]) {
      props.push({
        kind: "box",
        position: [6 * xSign, (GROUND_Y + DECK_Y - 0.5) / 2, DECK_Z + zOff],
        size: [0.9, DECK_Y - 0.5 - GROUND_Y, 0.9],
        color: darkTimber,
        texture: "wood",
        metalness: 0.05,
        roughness: 0.85,
      });
    }
  }
  // Guard rail along the deck's outer edge (z = 11), with a post at each end.
  props.push({
    kind: "box",
    position: [0, 5.0, 11],
    size: [DECK_HALF_X * 2, 0.35, 0.35],
    color: darkTimber,
    texture: "wood",
    metalness: 0.05,
    roughness: 0.85,
  });
  for (const xSign of [-1, 1]) {
    props.push({
      kind: "box",
      position: [7.5 * xSign, 4.1, 11],
      size: [0.35, 2.3, 0.35],
      color: darkTimber,
      texture: "wood",
      metalness: 0.05,
      roughness: 0.85,
    });
  }
  // Boarding ramp from the deck's front edge (y 2.2, z 11) down to the pad (y -6, z 15):
  // dy = -8.2, dz = 4, length = sqrt(67.24 + 16) = 9.124. A box's long axis is local Y, and
  // rotating about X by `atan2(dz, dy)` maps local +Y onto the (dy, dz) run.
  {
    const dy = GROUND_Y - (DECK_Y - 0.5);
    const dz = 4;
    props.push({
      kind: "box",
      position: [0, (GROUND_Y + DECK_Y - 0.5) / 2, 11 + dz / 2],
      size: [9, Math.hypot(dy, dz), 0.5],
      color: timber,
      texture: "wood",
      textureRepeat: [4, 4],
      rotation: [Math.atan2(dz, dy), 0, 0],
      metalness: 0.04,
      roughness: 0.85,
    });
  }

  // --- gearbox ------------------------------------------------------------------------
  // A bedplate under the whole train (x from -32 to -14), then a pedestal behind each
  // shaft at z = -8 so nothing intersects the gear discs themselves (which occupy
  // z = -6 .. -5.6).
  props.push({
    kind: "box",
    position: [(MOTOR_X + REDUCER_X) / 2, GROUND_Y + 0.6, DRIVE_Z - 1],
    size: [18, 1.2, 6],
    color: darkSteel,
    texture: "metal",
    textureRepeat: [5, 2],
    metalness: 0.6,
    roughness: 0.45,
  });
  props.push({
    kind: "box",
    position: [REDUCER_X, -2.5, DRIVE_Z - 2],
    size: [3, 5.2, 3],
    color: darkSteel,
    texture: "metal",
    metalness: 0.6,
    roughness: 0.45,
  });
  props.push({
    kind: "box",
    position: [MOTOR_X, -1.8, DRIVE_Z - 2],
    size: [3, 6.4, 3],
    color: darkSteel,
    texture: "metal",
    metalness: 0.6,
    roughness: 0.45,
  });
  // The motor can itself, sitting behind the crank on the same shaft line.
  props.push({
    kind: "cylinder",
    position: [MOTOR_X, GEARBOX_Y, DRIVE_Z - 2],
    radius: 2.4,
    height: 3,
    color: machine,
    texture: "rust",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.5,
    roughness: 0.6,
  });
  // Three bars across the reduction gear's front face, attached to it so the gearbox
  // visibly runs too. Length 13 is inside the gear's own 16 pitch diameter, and z sits
  // 0.3 in front of the gear body's front face (which ends at DRIVE_Z + 0.4).
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    props.push({
      kind: "box",
      position: [REDUCER_X, GEARBOX_Y, DRIVE_Z + 0.7],
      size: [13, 0.5, 0.5],
      color: steel,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.65,
      roughness: 0.35,
      attachTo: "관람차_감속치차",
    });
  }

  return props;
}
