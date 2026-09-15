import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";
import { rollingDirection } from "../dynamics";
import { wheelSpokesX } from "./wheels";

/** Builds one gear instance for a preset layout. Mirrors `windmill.ts`/`hoist.ts`/`car.ts`'s
 *  own `seedGear` helper exactly -- duplicated here rather than imported so each preset
 *  module stays a fully self-contained, hand-verifiable spec of its own mechanism. */
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

// --- Locomotive dimensions. Every one of these is load-bearing: the gear positions, the
// --- crank-slider linkage and the body props are all derived from them arithmetically. ---

/** Left-hand wheel plane sits at x = 0, right-hand wheel plane at x = TRACK_X. */
export const TRACK_X = 24;

/** Driving-wheel tooth count and module -> pitchRadius = (module * teeth) / 2 = (1 * 20) / 2 = 10. */
export const DRIVER_TEETH = 20;
export const DRIVER_MODULE = 1;
export const DRIVER_R = (DRIVER_MODULE * DRIVER_TEETH) / 2; // 10

/** Hub height above the ground plane. Set equal to DRIVER_R so each upright wheel disc sits
 *  exactly ON y = 0 instead of half-buried, the same rule `car.ts`'s WHEEL_Y follows. */
export const WHEEL_Y = DRIVER_R; // 10

/** Axle-to-axle spacing along Z. `isOverlapping` (meshing.ts) flags a non-connecting pair
 *  whenever their centres are closer than (overlapRadius(a) + overlapRadius(b)) * (1 - 0.05)
 *  = (10 + 10) * 0.95 = 19, and two driving wheels never form a direct `evaluatePair` edge
 *  (a `sprocket` is COINCIDENT_ONLY and these are not coincident), so 19 is a hard floor.
 *  22 clears it by 3 units. */
export const DRIVER_SPACING = 22;

/** Z of the three driving axles, front (+Z, the direction the locomotive faces) to rear. */
export const DRIVER_Z: readonly [number, number, number] = [0, -DRIVER_SPACING, -2 * DRIVER_SPACING]; // 0, -22, -44

/** Generator pinion: 5 teeth, module 1 -> pitchRadius = (1 * 5) / 2 = 2.5. */
export const PINION_TEETH = 5;
export const PINION_MODULE = 1;
export const PINION_R = (PINION_MODULE * PINION_TEETH) / 2; // 2.5

/** Exact tooth-mesh centre distance between the main driver and the generator pinion:
 *  pitchRadius(driver) + pitchRadius(pinion) = 10 + 2.5 = 12.5. */
export const PINION_MESH_DISTANCE = DRIVER_R + PINION_R; // 12.5

/** Offset from the main driver's centre to the pinion's centre, chosen as the 3-4-5 right
 *  triangle scaled by 2.5: (dy, dz) = (7.5, 10), |offset| = sqrt(7.5^2 + 10^2)
 *  = sqrt(56.25 + 100) = sqrt(156.25) = 12.5 EXACTLY -- i.e. exactly the mesh distance, with
 *  no floating-point slop to eat into `evaluatePair`'s 5% tolerance. */
export const PINION_OFFSET_Y = 7.5;
export const PINION_OFFSET_Z = 10;

/** Crank-pin throw: how far the driving-rod pin sits from the driving-wheel centre. Half the
 *  wheel radius, so the pin stays well inside the rim. Piston stroke is 2 * this = 10. */
export const CRANK_PIN_R = 5;

/** Driving-rod (main rod) length, pin to piston. MUST exceed CRANK_PIN_R or the crank-slider
 *  linkage cannot close (`crankSliderPose`'s discriminant would go negative and get clamped,
 *  collapsing the rod); 22 > 5 with room to spare, and it is what places the piston's stroke
 *  clear of the driving wheel -- see PISTON_MIN_Z below. */
export const MAIN_ROD_L = 22;

/** Where the piston actually travels. `crankSliderPose` (render/sceneSync.ts) solves the
 *  slider offset along `slideAxis` from the crank centre as
 *
 *      s = (w . a) + sqrt((w . a)^2 - |w|^2 + L^2)
 *
 *  For a wheel whose axis is world X, `planeBasis` picks u = (0,1,0) and v = (0,0,1), so the
 *  pin is at centre + (0, R cos t, R sin t) and, with slideAxis a = (0,0,1),
 *
 *      w . a = R sin t,  |w|^2 = R^2
 *   => s = R sin t + sqrt(L^2 - R^2 cos^2 t)
 *
 *  which is smallest at t = -90 deg (s = L - R = 17) and largest at t = +90 deg (s = L + R = 27).
 *  So the piston sweeps a 10-unit stroke between z = 17 and z = 27 measured from its driving
 *  wheel's centre -- 7 units clear of that wheel's own rim at z = 10. */
export const PISTON_MIN_Z = MAIN_ROD_L - CRANK_PIN_R; // 17
export const PISTON_MAX_Z = MAIN_ROD_L + CRANK_PIN_R; // 27
export const PISTON_STROKE = PISTON_MAX_Z - PISTON_MIN_Z; // 10

/** The cutaway cylinder barrel the piston runs inside: centred on the mid-stroke point
 *  (17 + 27) / 2 = 22, long enough (18) to swallow the whole 10-unit stroke plus the piston's
 *  own body, i.e. it spans z = 13 .. 31. Its rear end at 13 stays 3 units clear of the front
 *  driving wheel's rim at z = 10. */
export const CYLINDER_Z = (PISTON_MIN_Z + PISTON_MAX_Z) / 2; // 22
export const CYLINDER_LEN = 18; // z = 13 .. 31
export const PISTON_LEN = 3;

/** Commanded speed of the main driver, in rad/s. Deliberately not 1 (and not 0.5) so a
 *  ratio/direction test cannot pass by a sign- or unity-convention accident, the same reason
 *  `clock.ts` picks -0.6 and `car.ts` picks -1.0. Positive here means the wheel tops move
 *  toward +Z, i.e. the locomotive rolls FORWARD: for axis a = +X and offset (0, r, 0),
 *  omega x offset = (0, 0, omega * r). */
export const DRIVE_SPEED = 0.8;

/** The locomotive's id as a `Vehicle`, so its boiler, cab and rods can say they ride on it. */
export const LOCO_VEHICLE_ID = "증기기관차";

/** Mass of the whole locomotive, kg. At 24 x 66 x ~30 cm of mostly cast metal this is a heavy
 *  desk model, and the weight is the point: reflected into the drivers as `mass * r^2` it is
 *  several times their own inertia put together, so the engine leans into its start the way a
 *  locomotive does instead of leaping away. */
export const LOCO_MASS = 4;

/** Steel wheel on steel rail: rolling resistance of about 0.002, against roughly 0.015 for a
 *  tyre on tarmac. That single number is why railways move heavy things cheaply. Measured on
 *  this engine (tests/sim/presets/locomotive.test.ts): running it on tyre resistance instead
 *  costs it real speed. It is NOT true that the locomotive holds a larger fraction of its free
 *  speed than the car does -- that fraction is set mostly by the motor's own torque curve, so
 *  comparing two different machines would say more about their motors than about what they
 *  roll on, which is why the test changes only the resistance and keeps the machine fixed. */
export const RAIL_ROLLING_RESISTANCE = 0.002;

/** Stall torque of the steam drive, N*m. With the drivers' and the locomotive's own inertia
 *  this gives a time constant of roughly a second -- a visible, unhurried pull away. */
export const DRIVE_STALL_TORQUE = 0.056;

/** How far the locomotive runs before the reverser throws it back, world units, and the hard
 *  end of its length of track. Both comfortably inside its showroom cell. */
export const DRIVE_RANGE = 44;
export const TRACK_LIMIT = 60;

/** The generator pinion's speed as a multiple of the driving wheel's:
 *  `evaluatePair` returns ratio = driver.teeth / pinion.teeth = 20 / 5 = 4 for the tooth mesh,
 *  and `propagateRotation` drives a "mesh" edge with sign = -1, so the pinion turns 4x as fast
 *  as the wheel and in the OPPOSITE direction: 0.8 * -4 = -3.2 rad/s. */
export const PINION_RATIO = DRIVER_TEETH / PINION_TEETH; // 4

/** Real locomotives QUARTER their two sides: the right-hand crank pin leads (or trails) the
 *  left-hand one by 90 degrees, so the engine can never park with both sides on dead centre.
 *  Both wheel lines are chain-coupled 1:1 here, so their angular velocities are identical and
 *  the only way to express quartering is a constant 90-degree offset in accumulated `rotation`
 *  -- which survives indefinitely, because nothing in `tick()` ever rewrites a chain-linked
 *  gear's rotation (the per-tick `computeMeshPhaseOffset` correction is applied to "mesh"
 *  edges only, and every wheel-to-wheel connection here is a chain `RemoteLink`). */
export const QUARTER = Math.PI / 2;

/** A STEAM LOCOMOTIVE -- this project's crank-slider (`Prop.linkTo`) showcase.
 *
 *  What is actually simulated, and what is only drawn, are kept strictly apart, the same way
 *  every other preset here does it. The GEARS carry the mechanism; the PROPS carry the body.
 *
 *  --- The mechanism -------------------------------------------------------------------
 *
 *  Side elevation (X = left/right across the track, Y = up, +Z = the way the engine faces):
 *
 *      generator pinion (0, 17.5, 10)   <- 5-tooth spur, tooth-meshed on the main driver's rim
 *              \
 *               \  exact pitch distance 12.5
 *                \
 *    (0,10,0) 좌동륜1 ---- (0,10,-22) 좌동륜2 ---- (0,10,-44) 좌동륜3     left wheel line
 *        |  chain                chain                    (coupling rods)
 *        | chain (driving axle)
 *   (24,10,0) 우동륜1 ---- (24,10,-22) 우동륜2 -- (24,10,-44) 우동륜3     right wheel line
 *
 *      and, hung off 좌동륜1 and 우동륜1 as a CRANK-SLIDER linkage (props, not gears):
 *
 *        crank pin (on the wheel, radius 5) --- driving rod (length 22) --- piston
 *                                                                          |
 *                                                       sliding along +Z inside the cylinder
 *
 *  증기기관차_좌동륜1 is the one `crank` -- the single independent speed input in this model,
 *  standing in for the steam that a real engine admits to the cylinders. Everything else is
 *  derived:
 *
 *   * The five wheel-to-wheel connections are `chain` `RemoteLink`s. `buildEdges` (graph.ts)
 *     gives a chain link the TEETH-based ratio a.teeth / b.teeth; all six wheels carry 20
 *     teeth at module 1, so every one of those ratios is exactly 20 / 20 = 1, and
 *     `propagateRotation` (rotation.ts) uses sign = +1 for chain edges rather than the -1 an
 *     ordinary tooth mesh gets. Net result: all six driving wheels turn at EXACTLY the same
 *     signed speed, which is precisely what a rigid driving axle (left<->right) and a coupling
 *     rod (front<->back) do. A chain link is used because it is the only distance-free,
 *     1:1, same-direction transmission this sandbox offers -- `evaluatePair` would demand the
 *     wheels physically touch at their pitch circles for a tooth mesh, and real driving wheels
 *     obviously do not touch each other.
 *   * Topology is a spanning TREE, not a loop: five links span six wheels (N-1 edges for N
 *     nodes). Closing the rectangle with a sixth link would not change a single wheel's speed
 *     -- every wheel is already pinned to ratio 1 through the tree -- so it is left out rather
 *     than added for symmetry, matching `car.ts`'s reasoning for its own belt tree.
 *   * 증기기관차_발전기피니언 is a genuine TOOTH MESH, the one place in this preset where real
 *     geometry is load-bearing. Both it and the crank are in `evaluatePair`'s PARALLEL_FAMILY
 *     and share axis [1,0,0], and their centres are exactly pitchRadius(driver) +
 *     pitchRadius(pinion) = 10 + 2.5 = 12.5 apart (the 3-4-5 triangle scaled by 2.5: offset
 *     (0, +7.5, +10), |offset| = sqrt(56.25 + 100) = 12.5). It therefore turns at ratio
 *     20 / 5 = 4 with sign -1: -3.2 rad/s against the wheels' +0.8. This is the axle-driven
 *     generator that a real locomotive carries on its running board; the sandbox draws every
 *     gear as a toothed disc, so the driving wheel presents a real 20-tooth rim for the pinion
 *     to run on.
 *
 *  Nothing here accumulates unbounded travel, so nothing needs `reverseAt` or `travelLimit`:
 *  the wheels are meant to turn forever (like `windmill.ts`'s sails and `car.ts`'s wheels), and
 *  the piston is bounded by the linkage itself -- `crankSliderPose` maps a full turn onto the
 *  closed interval [L - R, L + R] = [17, 27] and can never leave it. There is no rack and no
 *  rope in this machine.
 *
 *  --- What this model does NOT claim ---------------------------------------------------
 *
 *  This sandbox integrates angular velocity and rotation, and nothing else. It has no notion
 *  of steam pressure, force, torque, tractive effort or haulage. The claims made here and
 *  verified in tests/sim/presets/locomotive.test.ts are purely kinematic: all six wheels turn
 *  at exactly the crank's +0.8 rad/s, the generator pinion turns at exactly -3.2 rad/s, the two
 *  sides stay exactly 90 degrees apart, and the piston sweeps exactly the 10-unit interval
 *  [17, 27] ahead of its wheel.
 *
 *  Two deliberate simplifications, stated plainly so nobody reads more into the picture than is
 *  there. First, the sandbox drives the linkage FROM the wheel: `crankSliderPose` takes the
 *  wheel's rotation and solves for where the piston must be, which is the kinematic inverse of
 *  a real engine, where steam pushes the piston and the rod turns the wheel. The closed
 *  loop is the same either way and the positions are identical; only the causal direction is
 *  reversed. Second, `crankSliderPose` confines the pin, rod and piston to the plane through
 *  the wheel's own centre, so this linkage is coplanar with its driving wheel rather than
 *  offset outboard of it as on a real engine. That is a property of the shared solver, not a
 *  placement mistake here. */
export function createLocomotivePreset(): LayoutState {
  const [z1, z2, z3] = DRIVER_Z; // 0, -22, -44

  const gears: GearInstance[] = [
    // The main driver: the single `crank`, i.e. the one commanded speed in the layout. It is
    // the FRONT-most axle so that the piston's stroke (17..27 ahead of this wheel's centre)
    // lands ahead of the whole wheelbase rather than on top of another wheel.
    // Seeded at REST: the drive is a motor (see below), so its speed is worked out from the
    // torque balance rather than commanded, and the locomotive has to start itself.
    seedGear("증기기관차_좌동륜1", "crank", [0, WHEEL_Y, z1], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    // The two other left-hand drivers, chain-coupled (coupling rods) to the main driver.
    // `sprocket` is one of `evaluatePair`'s COINCIDENT_ONLY types: it forms no tooth mesh of
    // its own and only ever receives power through a coupling or a chain/belt RemoteLink,
    // which is exactly the behaviour a coupled driving wheel needs -- it must NOT accidentally
    // tooth-mesh with the neighbour 22 units away.
    seedGear("증기기관차_좌동륜2", "sprocket", [0, WHEEL_Y, z2], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    seedGear("증기기관차_좌동륜3", "sprocket", [0, WHEEL_Y, z3], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    // The right-hand wheel line, TRACK_X across. 24 apart is comfortably beyond the 19-unit
    // overlap floor (10 + 10 pitch radii, less the 5% tolerance), and so is every diagonal
    // pair: sqrt(24^2 + 22^2) = 32.6.
    seedGear("증기기관차_우동륜1", "sprocket", [TRACK_X, WHEEL_Y, z1], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    seedGear("증기기관차_우동륜2", "sprocket", [TRACK_X, WHEEL_Y, z2], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    seedGear("증기기관차_우동륜3", "sprocket", [TRACK_X, WHEEL_Y, z3], [1, 0, 0], DRIVER_TEETH, DRIVER_MODULE),
    // The axle-driven generator pinion, tooth-meshed on the main driver's rim at the exact
    // pitch distance: (0, 10, 0) + (0, 7.5, 10) = (0, 17.5, 10), |offset| = 12.5 = 10 + 2.5.
    // Its distance to every OTHER gear is far outside the (10 + 2.5) * 0.95 = 11.875 overlap
    // floor -- nearest is 좌동륜2 at sqrt(7.5^2 + 32^2) = 32.9, then 우동륜1 at
    // sqrt(24^2 + 7.5^2 + 10^2) = 27.1.
    seedGear(
      "증기기관차_발전기피니언",
      "spur",
      [0, WHEEL_Y + PINION_OFFSET_Y, z1 + PINION_OFFSET_Z],
      [1, 0, 0],
      PINION_TEETH,
      PINION_MODULE,
    ),
  ];

  // Quarter the right-hand wheel line 90 degrees ahead of the left, exactly as a real engine
  // is quartered so it can always start. `seedGear` leaves every gear at rotation 0, so this
  // post-assignment is the layout's one non-default initial condition -- the same shape
  // `hoist.ts` uses to stamp `reverseAt` onto its crank after seeding.
  for (const gear of gears) {
    if (gear.id.startsWith("증기기관차_우동륜")) gear.rotation = QUARTER;
  }

  // The locomotive RUNS. Its drive is a motor with a torque curve, it is a Vehicle with real
  // mass, and `tick` integrates how far its drivers have rolled it -- the same no-slip relation
  // that drives the pistons off those same wheels. The direction is derived from the wheel's
  // axis rather than written down: about +X a positively-turning wheel travels +Z, which is
  // where this engine's cylinders and chimney are.
  gears[0].motor = { freeSpeed: DRIVE_SPEED, stallTorque: DRIVE_STALL_TORQUE };
  // The reverser: out to the end of the track, then back, forever. `DRIVE_RANGE / DRIVER_R` is
  // the wheel rotation that covers it, since a wheel of radius r rolls r per radian.
  gears[0].reverseAt = [0, DRIVE_RANGE / DRIVER_R];
  for (const gear of gears) gear.ridesOn = LOCO_VEHICLE_ID;

  return {
    gears,
    vehicles: [
      {
        id: LOCO_VEHICLE_ID,
        wheel: "증기기관차_좌동륜1",
        radius: DRIVER_R,
        mass: LOCO_MASS,
        direction: rollingDirection([1, 0, 0]),
        rollingResistance: RAIL_ROLLING_RESISTANCE,
        distance: 0,
        limit: [-TRACK_LIMIT, TRACK_LIMIT],
      },
    ],
    remoteLinks: [
      // Left-hand coupling rods: front -> middle -> rear.
      { a: "증기기관차_좌동륜1", b: "증기기관차_좌동륜2", kind: "chain" },
      { a: "증기기관차_좌동륜2", b: "증기기관차_좌동륜3", kind: "chain" },
      // The rigid front driving AXLE, tying the two wheel lines together.
      { a: "증기기관차_좌동륜1", b: "증기기관차_우동륜1", kind: "chain" },
      // Right-hand coupling rods: front -> middle -> rear.
      { a: "증기기관차_우동륜1", b: "증기기관차_우동륜2", kind: "chain" },
      { a: "증기기관차_우동륜2", b: "증기기관차_우동륜3", kind: "chain" },
    ],
  };
}

// --- Body dimensions, all derived from the mechanism's own numbers above. ---
const BOILER_Y = 29; // boiler centre-line height; radius 7 puts its underside at 22, clear of
//                      the running board at 21.6 and of the wheels' 20-unit tops.
const BOILER_R = 7;
const RUNNING_BOARD_Y = 21; // 0.4 above the driving wheels' tops (WHEEL_Y + DRIVER_R = 20)
const MID_X = TRACK_X / 2; // 12 -- the locomotive's centre line
const SMOKEBOX_Z = 30;
const CAB_Z = -50;

/** The locomotive's body -- purely decorative props (see `render/props.ts`), no simulation.
 *
 *  MOVING parts, so the machine is never a static diorama:
 *   * every driving wheel gets `wheelSpokesX` spokes plus a counterweight, all `attachTo`-ed
 *     to their wheel gear, because a bare gear disc is nearly rotationally symmetric and its
 *     spin does not read;
 *   * the generator pinion gets a cross bar and an off-centre nub so its 4x counter-rotation
 *     is unmistakable next to the slow wheels;
 *   * each of the two main drivers carries a full crank-slider set via `linkTo`: a crank pin
 *     riding the wheel (`role: "pin"`), a driving rod spanning pin to piston (`role: "rod"`,
 *     authored exactly MAIN_ROD_L long along its local Y, which is what `crankSliderPose`'s
 *     rod pose assumes), and the piston itself (`role: "slider"`) reciprocating along +Z.
 *
 *  The cylinder barrel is drawn TRANSLUCENT (opacity 0.35) on purpose: the piston and the
 *  driving rod's forward end live inside it, and an opaque casting would hide the single most
 *  interesting motion in the whole scene. It reads as a cutaway/sectioned display cylinder,
 *  which is exactly what it is. */
export function createLocomotiveProps(): Prop[] {
  // Every part of the body travels with the engine. Stamped over the whole list rather than
  // written onto each of the fifty-odd pieces, so a new lamp or handrail cannot be forgotten
  // and left hovering in mid-air while the rest of the locomotive pulls away from it.
  // `ridesOn` composes with the poses the pieces already have: a coupling rod still swings on
  // its crank pin (`linkTo`) and a spoke still turns with its wheel (`attachTo`) while both go
  // down the line.
  return buildLocomotiveBody().map((prop) => ({ ...prop, ridesOn: LOCO_VEHICLE_ID }));
}

function buildLocomotiveBody(): Prop[] {
  const IRON = 0x2b2f36; // locomotive black
  const BOILER_C = 0x25302c; // dark green-black boiler lagging
  const STEEL = 0xb4bcc6; // bright motion-work steel
  const BRASS = 0xc9a227; // brass fittings
  const CAB_WOOD = 0x7a4a24; // varnished cab timber
  const CAB_TRIM = 0x543317; // darker cab framing
  const RUSTY = 0x6b4a35; // weathered ironwork
  const SPOKE = 0xd6dbe2; // bright spokes, so the wheels' spin is readable
  const RED_TRIM = 0x8f2b23; // pilot beam / buffer beam

  const props: Prop[] = [];

  // --- Driving wheels: spokes + counterweights, all attached so they turn with their gear ---
  const drivers: Array<{ id: string; centre: [number, number, number] }> = [];
  for (const [i, z] of DRIVER_Z.entries()) {
    drivers.push({ id: `증기기관차_좌동륜${i + 1}`, centre: [0, WHEEL_Y, z] });
    drivers.push({ id: `증기기관차_우동륜${i + 1}`, centre: [TRACK_X, WHEEL_Y, z] });
  }
  for (const driver of drivers) {
    // Every driving wheel rolls about world X, which is precisely the case `wheelSpokesX`
    // exists for (it lays each spoke in the wheel's YZ plane and rotates it about X).
    props.push(
      ...wheelSpokesX({
        attachTo: driver.id,
        center: driver.centre,
        radius: DRIVER_R,
        count: 6,
        thickness: 0.7,
        color: SPOKE,
      }),
    );
    // Counterweight: a slab at radius 6 on the side OPPOSITE the crank pin's rest position
    // (the pin rests at +Y, so the weight rests at -Y). Its outermost corner sits
    // sqrt(8.5^2 + 4.5^2) = 9.6 from the hub, inside the 10-unit rim, and it sweeps round with
    // the wheel because it is attached to it.
    props.push({
      kind: "box",
      position: [driver.centre[0], WHEEL_Y - 6, driver.centre[2]],
      size: [1.6, 5, 9],
      color: RUSTY,
      texture: "rust",
      textureRepeat: [1, 2],
      metalness: 0.45,
      roughness: 0.75,
      attachTo: driver.id,
    });
  }

  // --- The two crank-slider linkages: the reason this preset exists ---
  // Rest pose of the piston, at crank angle 0: s = 0 + sqrt(L^2 - R^2) = sqrt(484 - 25)
  // = sqrt(459) ~= 21.42. Every linkage prop's transform is re-solved by `SceneSync` on the
  // very first sync, so these authored positions only matter as a sane pre-render pose.
  const restSlider = Math.sqrt(MAIN_ROD_L * MAIN_ROD_L - CRANK_PIN_R * CRANK_PIN_R);
  const cylinders: Array<{ gear: string; x: number }> = [
    { gear: "증기기관차_좌동륜1", x: 0 },
    { gear: "증기기관차_우동륜1", x: TRACK_X },
  ];
  for (const { gear, x } of cylinders) {
    const link = {
      gear,
      crankRadius: CRANK_PIN_R,
      rodLength: MAIN_ROD_L,
      slideAxis: [0, 0, 1] as [number, number, number],
    };

    // The cutaway cylinder barrel: static, centred on mid-stroke (z = 22), spanning z = 13..31.
    // A cylinder's long axis is its local Y, so a quarter turn about X lays it along Z.
    props.push({
      kind: "cylinder",
      position: [x, WHEEL_Y, CYLINDER_Z],
      radius: 3.8,
      height: CYLINDER_LEN,
      radialSegments: 24,
      color: STEEL,
      texture: "metal",
      textureRepeat: [3, 2],
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.8,
      roughness: 0.3,
      opacity: 0.35,
    });
    // Front cylinder cover, closing the bore ahead of the piston's furthest reach (27 + 1.5).
    props.push({
      kind: "cylinder",
      position: [x, WHEEL_Y, CYLINDER_Z + CYLINDER_LEN / 2],
      radius: 4.2,
      height: 1.2,
      radialSegments: 24,
      color: IRON,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.75,
      roughness: 0.35,
    });
    // Valve chest sitting on the cylinder, where the slide valve would live.
    props.push({
      kind: "box",
      position: [x, WHEEL_Y + 5, CYLINDER_Z],
      size: [7, 4, 16],
      color: IRON,
      texture: "metal",
      textureRepeat: [3, 1],
      metalness: 0.7,
      roughness: 0.4,
    });

    // The PISTON -- the slider. It rides the line through its wheel's centre along +Z, sweeping
    // z = 17..27, so its 3-unit body spans 15.5..28.5, comfortably inside the 13..31 bore.
    props.push({
      kind: "cylinder",
      position: [x, WHEEL_Y, restSlider],
      radius: 3.2,
      height: PISTON_LEN,
      radialSegments: 24,
      color: BRASS,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.85,
      roughness: 0.25,
      linkTo: { ...link, role: "slider" },
    });
    // Piston rod, also pinned to the slider point: an 8-unit stub, so it spans s +/- 4, i.e.
    // 13..31 across the whole stroke -- never poking out of either end of the bore.
    props.push({
      kind: "cylinder",
      position: [x, WHEEL_Y, restSlider],
      radius: 0.9,
      height: 8,
      radialSegments: 12,
      color: STEEL,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.85,
      roughness: 0.25,
      linkTo: { ...link, role: "slider" },
    });
    // The DRIVING ROD -- authored exactly MAIN_ROD_L long along its local Y, which is the axis
    // `crankSliderPose` maps onto the pin -> piston direction every frame.
    props.push({
      kind: "box",
      position: [x, WHEEL_Y + CRANK_PIN_R / 2, restSlider / 2],
      size: [1.2, MAIN_ROD_L, 1.8],
      color: STEEL,
      texture: "metal",
      textureRepeat: [1, 4],
      metalness: 0.8,
      roughness: 0.3,
      linkTo: { ...link, role: "rod" },
    });
    // The CRANK PIN boss, riding the wheel at radius CRANK_PIN_R. Laid along X (a quarter turn
    // about Z) so it reads as a pin sticking out of the wheel face.
    props.push({
      kind: "cylinder",
      position: [x, WHEEL_Y + CRANK_PIN_R, 0],
      radius: 1.3,
      height: 3,
      radialSegments: 16,
      color: BRASS,
      texture: "metal",
      rotation: [0, 0, Math.PI / 2],
      metalness: 0.85,
      roughness: 0.25,
      linkTo: { ...link, role: "pin" },
    });
  }

  // --- Generator pinion dressing: a cross bar plus an off-centre nub. Two crossed bars alone
  // --- would still be 90-degree symmetric, so the nub is what makes the direction of its fast
  // --- counter-rotation unambiguous. Both stay inside the pinion's 2.5 pitch radius.
  const pinionCentre: [number, number, number] = [0, WHEEL_Y + PINION_OFFSET_Y, DRIVER_Z[0] + PINION_OFFSET_Z];
  props.push({
    kind: "box",
    position: pinionCentre,
    size: [1.1, 4.4, 0.8],
    color: STEEL,
    texture: "metal",
    metalness: 0.8,
    roughness: 0.3,
    attachTo: "증기기관차_발전기피니언",
  });
  props.push({
    kind: "cylinder",
    position: [pinionCentre[0], pinionCentre[1] + 1.7, pinionCentre[2]],
    radius: 0.6,
    height: 1.4,
    radialSegments: 12,
    color: BRASS,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    metalness: 0.85,
    roughness: 0.25,
    attachTo: "증기기관차_발전기피니언",
  });
  // The generator body itself, bolted to the running board above the pinion (static).
  props.push({
    kind: "box",
    position: [0, RUNNING_BOARD_Y + 3.2, pinionCentre[2]],
    size: [3.6, 5, 4],
    color: BRASS,
    texture: "metal",
    metalness: 0.8,
    roughness: 0.3,
  });

  // --- Frame, running board and beams ---
  props.push(
    // Running board / footplate, running the length of the engine 0.4 above the wheels' tops.
    {
      kind: "box",
      position: [MID_X, RUNNING_BOARD_Y, -8],
      size: [TRACK_X + 2, 1.2, 92],
      color: IRON,
      texture: "metal",
      textureRepeat: [2, 12],
      metalness: 0.6,
      roughness: 0.45,
    },
    // Two frame rails, inboard of both wheel lines (x = 5 and x = 19) and below the boiler.
    {
      kind: "box",
      position: [5, 15.5, -8],
      size: [1.6, 3, 100],
      color: RUSTY,
      texture: "rust",
      textureRepeat: [1, 14],
      metalness: 0.4,
      roughness: 0.8,
    },
    {
      kind: "box",
      position: [TRACK_X - 5, 15.5, -8],
      size: [1.6, 3, 100],
      color: RUSTY,
      texture: "rust",
      textureRepeat: [1, 14],
      metalness: 0.4,
      roughness: 0.8,
    },
    // Front pilot beam and rear buffer beam.
    { kind: "box", position: [MID_X, 13, 39], size: [TRACK_X + 2, 3, 2], color: RED_TRIM, texture: "wood", metalness: 0.15, roughness: 0.8 },
    { kind: "box", position: [MID_X, 13, -60], size: [TRACK_X + 2, 3, 2], color: RED_TRIM, texture: "wood", metalness: 0.15, roughness: 0.8 },
  );

  // --- The COWCATCHER (pilot). A cone's apex points along its local +Y; rotating 135 degrees
  // --- about X maps that onto (0, -0.707, +0.707), i.e. forward and DOWN, which is the wedge
  // --- a real pilot presents to the rail.
  props.push({
    kind: "cone",
    position: [MID_X, 8.5, 43],
    radius: 7,
    height: 10,
    radialSegments: 16,
    color: RUSTY,
    texture: "rust",
    textureRepeat: [2, 2],
    rotation: [Math.PI * 0.75, 0, 0],
    metalness: 0.45,
    roughness: 0.8,
  });

  // --- Boiler, smokebox, stack and domes ---
  props.push(
    // Boiler barrel: 68 long about the centre line, from the cab front (-42) to the smokebox.
    {
      kind: "cylinder",
      position: [MID_X, BOILER_Y, -8],
      radius: BOILER_R,
      height: 68,
      radialSegments: 28,
      color: BOILER_C,
      texture: "metal",
      textureRepeat: [6, 3],
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.75,
      roughness: 0.35,
    },
    // Smokebox: a slightly fatter drum at the front, z = 24..36.
    {
      kind: "cylinder",
      position: [MID_X, BOILER_Y, SMOKEBOX_Z],
      radius: BOILER_R + 0.6,
      height: 12,
      radialSegments: 28,
      color: IRON,
      texture: "metal",
      textureRepeat: [6, 2],
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.7,
      roughness: 0.45,
    },
    // Smokebox front plate / door.
    {
      kind: "cylinder",
      position: [MID_X, BOILER_Y, SMOKEBOX_Z + 6.5],
      radius: BOILER_R + 0.9,
      height: 1.4,
      radialSegments: 28,
      color: IRON,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.7,
      roughness: 0.5,
    },
    // Chimney: a straight stack on the smokebox, capped by an inverted cone so it flares out
    // at the top the way a balloon stack does (rotating a cone by PI puts its wide end up).
    {
      kind: "cylinder",
      position: [MID_X, BOILER_Y + 10.5, SMOKEBOX_Z],
      radius: 2,
      height: 7,
      radialSegments: 20,
      color: IRON,
      texture: "rust",
      textureRepeat: [3, 2],
      metalness: 0.5,
      roughness: 0.7,
    },
    {
      kind: "cone",
      position: [MID_X, BOILER_Y + 15.5, SMOKEBOX_Z],
      radius: 3.2,
      height: 4,
      radialSegments: 20,
      color: IRON,
      texture: "rust",
      rotation: [Math.PI, 0, 0],
      metalness: 0.5,
      roughness: 0.7,
    },
    // Headlight on the smokebox top.
    {
      kind: "cylinder",
      position: [MID_X, BOILER_Y + 10, SMOKEBOX_Z + 6],
      radius: 1.8,
      height: 3,
      radialSegments: 16,
      color: BRASS,
      texture: "metal",
      rotation: [Math.PI / 2, 0, 0],
      metalness: 0.85,
      roughness: 0.2,
    },
    // Steam dome and sand dome, sitting on the boiler's crown at y = 36.
    { kind: "sphere", position: [MID_X, BOILER_Y + 8, 4], radius: 3, color: BRASS, texture: "metal", metalness: 0.85, roughness: 0.25 },
    { kind: "sphere", position: [MID_X, BOILER_Y + 7.6, -16], radius: 2.6, color: IRON, texture: "metal", metalness: 0.7, roughness: 0.4 },
    // Bell and whistle.
    { kind: "sphere", position: [MID_X, BOILER_Y + 9, 14], radius: 1.2, color: BRASS, texture: "metal", metalness: 0.9, roughness: 0.2 },
    { kind: "cylinder", position: [MID_X, BOILER_Y + 9.5, -4], radius: 0.7, height: 4, radialSegments: 12, color: BRASS, texture: "metal", metalness: 0.9, roughness: 0.2 },
    // Firebox, bridging boiler to cab.
    {
      kind: "box",
      position: [MID_X, 27, -40],
      size: [17, 16, 10],
      color: IRON,
      texture: "metal",
      textureRepeat: [3, 3],
      metalness: 0.65,
      roughness: 0.5,
    },
  );

  // --- Cab: timber, as a period locomotive's was ---
  props.push(
    { kind: "box", position: [MID_X, 30, CAB_Z], size: [20, 20, 16], color: CAB_WOOD, texture: "wood", textureRepeat: [3, 3], metalness: 0.05, roughness: 0.85 },
    { kind: "box", position: [MID_X, 41, CAB_Z], size: [22, 1.6, 18], color: CAB_TRIM, texture: "wood", textureRepeat: [3, 3], metalness: 0.05, roughness: 0.85 },
    // Cab side pillars, to break up the slab.
    { kind: "box", position: [1.6, 30, CAB_Z - 7.5], size: [1.4, 20, 1.4], color: CAB_TRIM, texture: "wood", metalness: 0.05, roughness: 0.85 },
    { kind: "box", position: [TRACK_X - 1.6, 30, CAB_Z - 7.5], size: [1.4, 20, 1.4], color: CAB_TRIM, texture: "wood", metalness: 0.05, roughness: 0.85 },
  );

  return props;
}
