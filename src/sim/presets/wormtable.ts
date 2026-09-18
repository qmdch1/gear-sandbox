import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `musicbox.ts` uses. */
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

export const MOTOR_ID = "웜기어_회전탁자_모터";
export const WORM_ID = "웜기어_회전탁자_웜";
export const WHEEL_ID = "웜기어_회전탁자_웜휠";
export const PLATTER_ID = "웜기어_회전탁자_탁자판";

/** ONE module for the mesh, and it is not bookkeeping: two gears can only engage if their teeth
 *  are the same SIZE, and module IS tooth size. `evaluatePair` never compares module -- it only
 *  asks whether the centres sit `pitchRadius(a) + pitchRadius(b)` apart -- so a mismatched pair
 *  gets a perfectly happy simulation edge and a rendered pair whose teeth could never engage on
 *  any real shaft. The worm and the worm wheel therefore share TABLE_MODULE, and
 *  tests/sim/presets/wormtable.test.ts asserts it for every mesh edge the real `buildEdges`
 *  produces. */
export const TABLE_MODULE = 1;

/** `teeth` doubles as THREAD STARTS for a worm (see sim/types.ts), and it is the numerator of the
 *  mesh ratio: `evaluatePair` returns `ratio = worm.teeth / wheel.teeth`. Two starts on a
 *  40-tooth wheel is 20:1 in a single step. `gearGeometry.ts` also reads it -- the drawn helix
 *  pitch is `module * 1.5 / teeth`, so a two-start worm renders as a visibly denser double
 *  helix than the single-start default. */
export const WORM_STARTS = 2;
export const WHEEL_TEETH = 40;
/** The motor coupling's own module is deliberately NOT TABLE_MODULE: it never tooth-meshes with
 *  anything (its only edge is the coincident 1:1 shaft coupling into the worm), and it has to be
 *  small enough to clear the wheel it sits beside -- see MOTOR_WHEEL_GAP below. The same freedom
 *  clocktower.ts uses for its pendulum bob. */
export const MOTOR_MODULE = 0.5;
export const MOTOR_TEETH = 6;
/** The platter is a `load`: zero teeth, so it has no pitch circle at all, and its module exists
 *  only to size it. `overlapRadius` is `module * 2` for a zero-teeth object (meshing.ts), so 1.5
 *  gives the arbor boss a 3-unit footprint radius -- the number every clearance below uses. */
export const PLATTER_MODULE = 1.5;

export const WORM_R = pitchRadius(WORM_STARTS, TABLE_MODULE); // 1 * 2 / 2 = 1
export const WHEEL_R = pitchRadius(WHEEL_TEETH, TABLE_MODULE); // 1 * 40 / 2 = 20
export const MOTOR_R = pitchRadius(MOTOR_TEETH, MOTOR_MODULE); // 0.5 * 6 / 2 = 1.5

/** Centre distance of the one tooth mesh in this machine: `evaluatePair`'s perpendicular-axis
 *  branch wants exactly `pitchRadius(worm) + pitchRadius(wheel)`, within 5%. 1 + 20 = 21, and the
 *  layout below places the worm at exactly that distance, so the match is exact rather than
 *  inside the tolerance. */
export const WORM_MESH_DISTANCE = WORM_R + WHEEL_R; // 21

/** A rendered involute tooth reaches one full module PAST the pitch circle (`gearGeometry.ts`:
 *  addendum = 1 * module). Every prop clearance below is measured against this tip radius, not
 *  the pitch radius. */
export const WHEEL_TIP_R = WHEEL_R + TABLE_MODULE; // 21

/** THE ratio this machine exists for: 2 thread starts into 40 teeth. `evaluatePair` returns
 *  `worm.teeth / wheel.teeth` for the worm mesh, and `propagateRotation` drives a "mesh" edge
 *  with sign -1, so the table turns at 1/20 of the worm's speed and the OTHER way.
 *
 *  A 20:1 step-down in ONE mesh is what a worm buys you: an ordinary spur pair would need a
 *  40-tooth pinion against an 800-tooth wheel to do the same. What it does NOT buy you here is
 *  mechanical advantage you could put a number on: this table's crank carries no `motor` (the
 *  "motor" further down is a drawn housing, not a `Motor` field), so its speed is given rather
 *  than solved for, and a worm drive in it is a SPEED reduction and a one-way path. Real worm
 *  sets are often self-locking, which comes from friction AT THE MESH -- the sandbox has viscous
 *  bearing drag, rolling resistance and contact friction for loose parts, but nothing at a tooth
 *  contact, so it cannot produce self-locking. The one-way behaviour below is `evaluatePair`'s
 *  `oneWay` field, a rule, not a friction result. */
export const WORM_RATIO = WORM_STARTS / WHEEL_TEETH; // 2 / 40 = 1/20 = 0.05

export const MOTOR_SPEED = 6;
/** Motor -> worm is a 1:1 coincident coupling (sign +1), worm -> wheel is the mesh (sign -1,
 *  ratio 1/20): 6 * 1 * -(1/20) = -0.3 rad/s, i.e. one table revolution every 2*pi/0.3 = 20.9 s
 *  while the worm itself turns just under once a second. Verified over real `tick` calls in
 *  tests/sim/presets/wormtable.test.ts. */
export const TABLE_SPEED = -WORM_RATIO * MOTOR_SPEED; // -0.3

/** Height of the worm-wheel plate, and so of the whole worm shaft line: high enough to leave the
 *  cast bed (top at BED_TOP) and the table column underneath it. */
export const TABLE_Y = 9;
export const WHEEL_POS: [number, number, number] = [0, TABLE_Y, 0];
/** The worm sits one mesh distance from the table's axis along +Z, at the SAME height. That
 *  direction is not free: the wheel turns about Y and the worm about X, so their common
 *  perpendicular -- the only line along which a worm can sit tangent to the wheel's pitch circle
 *  and drive its rim -- is Z. `evaluatePair` would accept any offset direction of the right
 *  length, which is exactly why the direction has to be reasoned about here instead. */
export const WORM_POS: [number, number, number] = [0, TABLE_Y, WORM_MESH_DISTANCE];

/** How much room the coincident motor coupling has beside the wheel, and why it is small.
 *
 *  `isOverlapping` flags a pair with no edge when their centres sit closer than
 *  `0.95 * (overlapRadius(a) + overlapRadius(b))`. The motor gear is coincident with the WORM, so
 *  it necessarily sits WORM_MESH_DISTANCE from the wheel's centre -- and it forms no edge with
 *  the wheel (their axes are perpendicular, which kills the parallel-family mesh check). So it
 *  must satisfy 21 >= 0.95 * (MOTOR_R + 20), i.e. MOTOR_R <= 21/0.95 - 20 = 2.105.
 *
 *  MOTOR_R = 1.5 leaves 21 - 0.95 * 21.5 = 0.575 of margin. That is not a decorative choice: at
 *  MOTOR_R = 2.5 the pair overlaps and `classify` reports it, because a 2.5-radius disc keyed to
 *  the worm's mid-span really would foul the wheel it is driving. A real machine bolts its motor to
 *  the far END of the worm shaft, but a worm can only take drive through a COINCIDENT shaft
 *  coupling in this model (meshing.ts step 3: its only other rule is the one-way mesh OUT toward
 *  the wheel), so the simulated coupling has to share the worm's centre. The motor you actually
 *  see is a prop out at MOTOR_CASE_X, with its fan `attachTo`-ed to this gear so the visible body
 *  and the simulated one turn together. */
export const MOTOR_WHEEL_GAP = WORM_MESH_DISTANCE - 0.95 * (MOTOR_R + WHEEL_R); // 0.575

// ---------------------------------------------------------------------------------------------
// Prop geometry. Everything below is measured from three fixed surfaces: the floor pad (top at
// PAD_TOP), the cast bed (top at BED_TOP) and the wheel's own plate (top at WHEEL_FACE_TOP).
// ---------------------------------------------------------------------------------------------

export const PAD_TOP = 0.4;
export const BED_TOP = 3.4;
/** An extruded gear body is GEAR_THICKNESS = 0.4 deep along its axis, drawn from the gear's
 *  position outward in +axis, so the wheel's plate occupies y = 9 .. 9.4 and the table sits on
 *  its upper face. */
export const WHEEL_FACE_TOP = TABLE_Y + 0.4; // 9.4
export const PLATTER_H = 1.6;
/** Table platter radius. Deliberately INSIDE the wheel's 21 tip circle, so the toothed rim shows
 *  all the way round the table instead of being buried under it -- this is a gear sandbox, and
 *  the wheel is the thing worth seeing. */
export const PLATTER_R = 17;
export const PLATTER_Y = WHEEL_FACE_TOP + PLATTER_H / 2; // 9.4 + 0.8 = 10.2
export const TABLE_TOP_Y = WHEEL_FACE_TOP + PLATTER_H; // 11

export const SLOT_COUNT = 8;
const SLOT_INNER_R = 3.5;
const SLOT_OUTER_R = 16;
const SLOT_LENGTH = SLOT_OUTER_R - SLOT_INNER_R; // 12.5
const SLOT_MID_R = (SLOT_INNER_R + SLOT_OUTER_R) / 2; // 9.75
/** The datum mark on the table's rim, at the same angle as slot 0. */
export const DATUM_R = 16;

/** Where the clamped workpiece stands on the table, as a radius from the table's axis. Its far
 *  corner reaches hypot(WORK_R + 3.5, 2.5) = 11.8, comfortably inside PLATTER_R, so nothing on
 *  the table sweeps off it. */
export const WORK_R = 8;
export const WORK_SIZE: [number, number, number] = [7, 5, 5];

/** Minimum |x| at which something of radius `rho` drawn around the worm's shaft line
 *  (y = TABLE_Y, z = WORM_MESH_DISTANCE) clears the wheel's tip circle.
 *
 *  The wheel's tip circle is a radius-21 circle about the table's axis, so at a given x it
 *  reaches z = sqrt(21^2 - x^2). A body of radius `rho` around the shaft line reaches inward to
 *  z = 21 - rho. Setting those equal and solving for x gives the formula below -- every shaft
 *  fitting (pillow blocks, motor case, handwheel) is placed against it rather than by eye. */
export function wormLineClearX(rho: number): number {
  return Math.sqrt(WHEEL_TIP_R ** 2 - (WORM_MESH_DISTANCE - rho) ** 2);
}

/** Pillow-block half-depth 2 -> clear beyond sqrt(441 - 361) = 8.94; placed at 11. */
export const BEARING_X = 11;
export const MOTOR_CASE_R = 4;
export const MOTOR_CASE_LEN = 9;
/** Case radius 4 -> clear beyond sqrt(441 - 289) = 12.33. The case spans x = 14 .. 23, so its
 *  inner end clears by 1.67. */
export const MOTOR_CASE_X = 18.5;
export const FAN_X = 24;
export const FAN_R = 2.5;
export const FAN_BLADES = 4;
export const HANDWHEEL_R = 4.5;
const HANDWHEEL_TUBE = 0.6;
/** Rim outer radius 4.5 + 0.6 = 5.1 -> clear beyond sqrt(441 - 15.9^2) = 13.72; placed at -16. */
export const HANDWHEEL_X = -16;
/** The graduated collar and its fixed pointer, on the shaft between the handwheel and the near
 *  pillow block. Collar outer radius 1.95 -> clear beyond sqrt(441 - 19.05^2) = 8.85. */
export const COLLAR_X = -12.5;
export const COLLAR_R = 1.6;
export const COLLAR_TICKS = 6;

/** 웜기어_회전탁자 (worm-drive rotary table) -- a machine-tool table turned through a right angle
 *  by a two-start worm on a 40-tooth wheel.
 *
 *  Four gears, ONE tooth mesh and two coincident shaft couplings:
 *
 *    웜기어_회전탁자_모터 (crank, 6T)
 *        --coincident coupling (1:1)-- 웜기어_회전탁자_웜 (worm, 2 starts)
 *        --ONE-WAY mesh (2/40)-->      웜기어_회전탁자_웜휠 (helical, 40T)
 *        --coincident coupling (1:1)-- 웜기어_회전탁자_탁자판 (load, the table platter)
 *
 *  THE POINT OF THIS PRESET is the middle edge. `evaluatePair`'s perpendicular-axis branch
 *  (meshing.ts step 5) is the only place `oneWay` is set for a worm: `wormPair` decides which
 *  side may drive, and `buildDirectedAdjacency` then adds that edge to the WORM's adjacency list
 *  only. So power walks motor -> worm -> wheel -> platter and stops; turn the table by hand and
 *  the worm receives nothing at all -- it is not slowed, it simply is not on a path power can
 *  flow along. tests/sim/presets/wormtable.test.ts verifies that end to end, by rebuilding this
 *  same layout with the crank moved to the table side and checking the worm's angular velocity
 *  stays exactly 0 while the table turns.
 *
 *  GEOMETRY (pitch radius = module * teeth / 2; a worm and its wheel sit the SUM of their pitch
 *  radii apart, with perpendicular axes):
 *
 *    웜휠:   40T, module 1 -> r 20.  at (0, 9, 0),  axis (0,1,0) -- the table turns about vertical
 *    웜:      2 starts, module 1 -> r 1.  at (0, 9, 21), axis (1,0,0) -- 20 + 1 = 21 along +Z
 *    모터:    6T, module 0.5 -> r 1.5. coincident with the worm, same axis
 *    탁자판:  load, module 1.5.        coincident with the wheel, same axis
 *
 *  The +Z offset is the common perpendicular of the two axes, which is the only direction a worm
 *  can actually sit tangent to its wheel's rim. `evaluatePair` checks the LENGTH of that offset
 *  and the axis angle but not its direction, so putting the worm somewhere geometrically absurd
 *  at the same distance would still produce an edge -- the reasoning has to live here.
 *
 *  WHAT THE RENDER DOES AT THE MESH: `gearGeometry.ts` draws a worm as a helix of outer radius
 *  module * 1.3 + module * 0.35 = 1.65 about its axis, which is bigger than the 1 pitch radius
 *  the simulation meshes it on. The thread's crest therefore reaches 21 - 1.65 = 19.35 from the
 *  table's centre, inside the wheel's 21 tip circle -- the two bodies interleave at the contact
 *  point, which is what a mesh looks like. It is no deeper than an ordinary spur pair, whose tips
 *  overlap by 2 * module = 2 at the line of centres.
 *
 *  WHAT MOVES, AND WHY THAT NEEDED WORK: a bare rotary table is the worst case for this renderer
 *  -- a disc spun about its own axis is pixel-identical every frame however fast it turns. So the
 *  table carries eight radial T-slots, an orange datum mark on the rim and a clamped workpiece
 *  with its clamp bars, studs and T-nuts, all `attachTo`-ed to the wheel; the worm shaft carries a
 *  spoked handwheel with an offset knob and a graduated collar; the motor carries a four-blade
 *  cooling fan. The contrast between them IS the 20:1: in one second the knob goes round
 *  6 / (2*pi) = 0.95 of a turn while the table moves 0.3 rad, which is 0.3 / (2*pi/8) = 0.38 of
 *  the way from one T-slot to the next.
 *
 *  `attachTo` sweeps a prop about ITS GEAR's centre, so everything on the table is drawn about
 *  the table's own axis (x = z = 0) and everything on the shaft about the shaft's line
 *  (y = 9, z = 21). The test asserts both, because a prop attached to a gear it is not centred on
 *  orbits at whatever the offset happens to be instead of turning in place.
 *
 *  Nothing here has finite travel, so nothing carries `reverseAt` (crank-only) or `travelLimit`
 *  (rack-only): the motor runs one way forever and the table turns through, which is what a
 *  rotary table's feed drive does. There is no rack and no crank-slider in this machine.
 *
 *  DURABILITY, since the tests tick with wear turned off and should say why: a `load` anywhere in
 *  a component multiplies wear for EVERY gear in it (simulation.ts floods the component), and
 *  worm is the most fragile type in `gearDefs.ts` -- 80 durability at 1.5/s base and a 1.8 load
 *  multiplier, so 80 / (1.5 * 1.8) = 29.6 s to failure with the platter in its component. The app
 *  itself runs with wear off; the kinematics tests do too, and one test verifies that 29.6 s
 *  figure directly rather than leaving this paragraph unchecked. */
export function createWormTablePreset(): LayoutState {
  const gears: GearInstance[] = [
    // Order matters for one thing only: `buildEdges` names the earlier gear `a`, so the worm
    // mesh comes out as (웜 -> 웜휠) with oneWay "aToB". The test derives the expected side from
    // the edge itself rather than hardcoding that, so reordering here cannot silently invert it.
    seedGear(MOTOR_ID, "crank", WORM_POS, [1, 0, 0], MOTOR_TEETH, MOTOR_MODULE, MOTOR_SPEED),
    seedGear(WORM_ID, "worm", WORM_POS, [1, 0, 0], WORM_STARTS, TABLE_MODULE),
    // A worm wheel is cut helical (a real one is throated to wrap the worm, which this renderer
    // cannot draw); "helical" is both the closest body available and, per gearDefs, the most
    // durable of the involute types.
    seedGear(WHEEL_ID, "helical", WHEEL_POS, [0, 1, 0], WHEEL_TEETH, TABLE_MODULE),
    // The platter as the load riding the wheel's arbor: coincident, same axis, so `evaluatePair`'s
    // COINCIDENT_ONLY branch resolves a 1:1 coupling. It is the driven object at the end of the
    // train -- the thing the whole reduction exists to turn. Its rendered body is a 3-radius boss
    // buried inside the wheel's own plate; what you SEE of the platter is the prop table on top,
    // swept by `attachTo`.
    seedGear(PLATTER_ID, "load", WHEEL_POS, [0, 1, 0], 0, PLATTER_MODULE),
  ];
  return { gears, remoteLinks: [] };
}

/** Angle of T-slot `i` (and, at i = 0, of the datum mark). Exported so the test can check the
 *  slots really are spread around the table rather than bunched on one side. */
export function slotAngle(i: number): number {
  return (i / SLOT_COUNT) * Math.PI * 2;
}

/** Angle of fan blade / collar tick `i` about the worm shaft. */
export function radialAngle(i: number, count: number): number {
  return (i / count) * Math.PI * 2;
}

/** The rotary table's body: a concrete pad, a cast bed and column, the T-slotted table with its
 *  clamped workpiece, the worm shaft on its pillow blocks with handwheel and graduated collar,
 *  and the drive motor with its cooling fan.
 *
 *  Conventions used throughout, both of which come from how THREE composes the Euler XYZ rotation
 *  a `Prop` carries:
 *   - about the TABLE's vertical axis: rotating a box by [0, a, 0] points its local +X along
 *     (cos a, 0, -sin a), so a prop meant to lie radially at angle `a` is placed at
 *     (R cos a, y, -R sin a). That matches `spinAttachedPose`'s own rotation about (0,1,0), so a
 *     slot drawn at angle `a` stays a slot as the table turns.
 *   - about the SHAFT's horizontal axis: rotating a box by [a, 0, 0] points its local +Y along
 *     (0, cos a, sin a), so a radial member at angle `a` is placed at
 *     (x, 9 + R cos a, 21 + R sin a). */
export function createWormTableProps(): Prop[] {
  const concrete = 0x9a958c;
  const castIron = 0x4a5157;
  const machineGreen = 0x53625a;
  const groundSteel = 0x8d949b;
  const slotDark = 0x2b2f33;
  const brightSteel = 0xb9c2c9;
  const clampGrey = 0x6b7075;
  const brass = 0xb08d3a;
  const motorBlue = 0x2f5d8a;
  const fanBlack = 0x1f2933;
  const datumOrange = 0xd94f2b;

  const props: Prop[] = [
    // The floor pad the machine stands on, then the cast-iron bed. The bed spans the whole
    // footprint: x from -21 to 27 (handwheel knob to fan guard), z from -23 to 27 (the far side
    // of the table's tip circle to the outside of the motor case).
    {
      kind: "box",
      position: [3, PAD_TOP / 2, 2],
      size: [52, PAD_TOP, 54],
      color: concrete,
      texture: "stone",
      textureRepeat: [8, 8],
      roughness: 0.95,
      metalness: 0.02,
    },
    {
      kind: "box",
      position: [3, (PAD_TOP + BED_TOP) / 2, 2],
      size: [48, BED_TOP - PAD_TOP, 50],
      color: castIron,
      texture: "rust",
      textureRepeat: [7, 7],
      roughness: 0.9,
      metalness: 0.25,
    },
    // The column carrying the table, from the bed's top face up to the wheel's plate.
    {
      kind: "cylinder",
      position: [0, (BED_TOP + TABLE_Y) / 2, 0],
      radius: 8,
      height: TABLE_Y - BED_TOP,
      color: machineGreen,
      texture: "metal",
      textureRepeat: [4, 2],
      roughness: 0.55,
      metalness: 0.6,
    },
    // The table platter, sitting on the wheel's upper face. Rotationally symmetric on its own --
    // the slots, datum and workpiece below are what make its rotation readable -- but attached
    // all the same, because it genuinely is the thing that turns.
    {
      kind: "cylinder",
      position: [0, PLATTER_Y, 0],
      radius: PLATTER_R,
      height: PLATTER_H,
      radialSegments: 48,
      color: groundSteel,
      texture: "metal",
      textureRepeat: [6, 6],
      roughness: 0.35,
      metalness: 0.8,
      attachTo: WHEEL_ID,
    },
  ];

  // Eight radial T-slots across the table face. Drawn as dark inserts standing 0.15 proud of the
  // table's top surface: a Prop is a solid primitive, so a slot is drawn rather than cut, and
  // sinking one flush would simply hide it inside the platter.
  for (let i = 0; i < SLOT_COUNT; i++) {
    const a = slotAngle(i);
    props.push({
      kind: "box",
      position: [Math.cos(a) * SLOT_MID_R, TABLE_TOP_Y - 0.1, -Math.sin(a) * SLOT_MID_R],
      size: [SLOT_LENGTH, 0.5, 1.4],
      color: slotDark,
      texture: "metal",
      textureRepeat: [4, 1],
      rotation: [0, a, 0],
      roughness: 0.7,
      metalness: 0.5,
      attachTo: WHEEL_ID,
    });
  }

  // The datum mark on the rim, at slot 0's angle -- the single clearest read on how far the table
  // has turned, and the reason a 0.3 rad/s table is watchable at all.
  props.push({
    kind: "box",
    position: [DATUM_R, TABLE_TOP_Y + 0.05, 0],
    size: [1.6, 0.7, 1.2],
    color: datumOrange,
    texture: "metal",
    roughness: 0.5,
    metalness: 0.4,
    attachTo: WHEEL_ID,
  });

  // The workpiece: a steel block standing on the table at WORK_R, held down by two clamp bars,
  // each on a stud with a T-nut under it. All attached to the wheel, so the whole setup orbits
  // the table's axis exactly as a real clamped job does.
  //
  // The T-nuts are NOT in a slot, whatever this comment used to say. The slots lie on the eight
  // rays at k * 45 degrees, 1.4 wide; a nut at (x = WORK_R, z = +/-3.7) sits on a ray of about
  // 24.8 degrees, 3.04 from the nearest slot centreline -- more than four slot half-widths away
  // -- and its box spans y 11.0..11.7, entirely ABOVE the table's top face rather than sunk into
  // anything. Putting the studs on a slot angle would make the old sentence true; until someone
  // decides to move the whole clamped job round to 45 degrees, the honest description is that
  // the nuts sit on the table.
  props.push({
    kind: "box",
    position: [WORK_R, TABLE_TOP_Y + WORK_SIZE[1] / 2, 0],
    size: WORK_SIZE,
    color: brightSteel,
    texture: "metal",
    textureRepeat: [3, 2],
    roughness: 0.3,
    metalness: 0.85,
    attachTo: WHEEL_ID,
  });
  for (const side of [-1, 1] as const) {
    const clampZ = side * (WORK_SIZE[2] / 2 + 1.2); // just outside the block's face
    // Clamp bar: spans from the block's top edge outward over its own stud.
    //
    // It used to be WORK_SIZE[2] + 2.4 = 7.4 long -- the length for ONE bar centred on the
    // table's midline -- while being centred at clampZ / 2 = +/-1.85 instead. So the two bars
    // shared their whole 2.2 x 1 cross-section over 3.7 units of z, at the same x and the same
    // y: eight cubic units of coincident steel, and since both are clampGrey they rendered as a
    // single 11.1-long bar lying across a 5-deep workpiece. Twice the depth of any of the other
    // parts-inside-parts defects found in this repo.
    //
    // A bar belongs ON its stud, reaching in as far as the block's face and out as far past the
    // stud as it reaches in: z from WORK_SIZE[2] / 2 to clampZ + (clampZ - WORK_SIZE[2] / 2).
    props.push({
      kind: "box",
      position: [WORK_R, TABLE_TOP_Y + WORK_SIZE[1] + 0.5, clampZ],
      size: [2.2, 1, (Math.abs(clampZ) - WORK_SIZE[2] / 2) * 2],
      color: clampGrey,
      texture: "metal",
      roughness: 0.45,
      metalness: 0.7,
      attachTo: WHEEL_ID,
    });
    // Stud from the slot up through the clamp bar, and the T-nut it screws into.
    props.push({
      kind: "cylinder",
      position: [WORK_R, TABLE_TOP_Y + (WORK_SIZE[1] + 1) / 2, clampZ],
      radius: 0.35,
      height: WORK_SIZE[1] + 1,
      color: brass,
      texture: "metal",
      roughness: 0.4,
      metalness: 0.8,
      attachTo: WHEEL_ID,
    });
    props.push({
      kind: "box",
      position: [WORK_R, TABLE_TOP_Y + 0.35, clampZ],
      size: [1.4, 0.7, 1.4],
      color: brass,
      texture: "metal",
      roughness: 0.4,
      metalness: 0.8,
      attachTo: WHEEL_ID,
    });
  }

  // ---- the worm shaft line: y = TABLE_Y, z = WORM_MESH_DISTANCE, running along X ----

  // Two shaft stubs, one each side of the worm body (which `gearGeometry` draws module * 6 = 6
  // long, so x = -3 .. 3). Static: a plain cylinder spun about its own axis shows nothing, and
  // the handwheel at the end of this one is what reports the shaft's speed.
  props.push({
    kind: "cylinder",
    position: [(HANDWHEEL_X - 3) / 2, TABLE_Y, WORM_MESH_DISTANCE],
    radius: 0.6,
    height: -3 - HANDWHEEL_X, // 13
    color: brightSteel,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.3,
    metalness: 0.85,
  });
  props.push({
    kind: "cylinder",
    position: [(3 + MOTOR_CASE_X - MOTOR_CASE_LEN / 2) / 2, TABLE_Y, WORM_MESH_DISTANCE],
    radius: 0.6,
    height: MOTOR_CASE_X - MOTOR_CASE_LEN / 2 - 3, // 11
    color: brightSteel,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.3,
    metalness: 0.85,
  });

  // Pillow blocks either side of the worm, each on a stand off the bed. BEARING_X = 11 clears the
  // wheel's tip circle by 0.40 in z at the block's inner CORNER -- which is the number that
  // matters, and not the 1.1 this comment used to give. That 1.1 is 19 - sqrt(441 - 11^2),
  // i.e. the tip circle evaluated at x = BEARING_X, the block's centre line; the block is 2.5
  // wide, so its inner face is at x = 9.75 and the tip circle there reaches
  // sqrt(441 - 9.75^2) = 18.60 against the corner's z = 19. It still clears -- the figure was
  // wrong, not the placement -- but by about a third of what was claimed.
  for (const side of [-1, 1] as const) {
    props.push({
      kind: "box",
      position: [side * BEARING_X, TABLE_Y, WORM_MESH_DISTANCE],
      size: [2.5, 3, 4],
      color: machineGreen,
      texture: "metal",
      roughness: 0.5,
      metalness: 0.65,
    });
    props.push({
      kind: "box",
      position: [side * BEARING_X, (BED_TOP + TABLE_Y - 1.5) / 2, WORM_MESH_DISTANCE],
      size: [2.5, TABLE_Y - 1.5 - BED_TOP, 3],
      color: machineGreen,
      texture: "metal",
      roughness: 0.55,
      metalness: 0.6,
    });
  }

  // The handwheel on the outboard end of the worm shaft: rim, four spokes, a hub and one offset
  // knob. The rim and hub are rotationally symmetric and would read as frozen on their own; the
  // KNOB is the prop that makes the shaft's speed visible, orbiting the rim once per shaft
  // revolution. A torus is drawn in its local XY plane, so [0, PI/2, 0] stands it up across the
  // shaft.
  props.push({
    kind: "ring",
    position: [HANDWHEEL_X, TABLE_Y, WORM_MESH_DISTANCE],
    radius: HANDWHEEL_R,
    tube: HANDWHEEL_TUBE,
    color: fanBlack,
    texture: "metal",
    rotation: [0, Math.PI / 2, 0],
    roughness: 0.5,
    metalness: 0.6,
    attachTo: WORM_ID,
  });
  for (let i = 0; i < 4; i++) {
    const a = radialAngle(i, 4);
    props.push({
      kind: "box",
      position: [
        HANDWHEEL_X,
        TABLE_Y + (Math.cos(a) * HANDWHEEL_R) / 2,
        WORM_MESH_DISTANCE + (Math.sin(a) * HANDWHEEL_R) / 2,
      ],
      size: [0.6, HANDWHEEL_R, 0.6],
      color: fanBlack,
      texture: "metal",
      rotation: [a, 0, 0],
      roughness: 0.5,
      metalness: 0.6,
      attachTo: WORM_ID,
    });
  }
  props.push({
    kind: "cylinder",
    position: [HANDWHEEL_X, TABLE_Y, WORM_MESH_DISTANCE],
    radius: 1.1,
    height: 1.4,
    color: fanBlack,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.5,
    metalness: 0.6,
    attachTo: WORM_ID,
  });
  props.push({
    kind: "cylinder",
    position: [HANDWHEEL_X - 1.2, TABLE_Y + HANDWHEEL_R, WORM_MESH_DISTANCE],
    radius: 0.5,
    height: 1.8,
    color: brass,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.35,
    metalness: 0.8,
    attachTo: WORM_ID,
  });

  // The graduated collar on the shaft and its FIXED pointer on the near pillow block: six brass
  // ticks sweep past a static index, which is how a real rotary table is read. The ticks are
  // attached, the pointer is not -- that contrast is the whole readout.
  props.push({
    kind: "cylinder",
    position: [COLLAR_X, TABLE_Y, WORM_MESH_DISTANCE],
    radius: COLLAR_R,
    height: 1.2,
    color: brass,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.4,
    metalness: 0.8,
    attachTo: WORM_ID,
  });
  for (let i = 0; i < COLLAR_TICKS; i++) {
    const a = radialAngle(i, COLLAR_TICKS);
    props.push({
      kind: "box",
      position: [
        COLLAR_X,
        TABLE_Y + Math.cos(a) * (COLLAR_R + 0.15),
        WORM_MESH_DISTANCE + Math.sin(a) * (COLLAR_R + 0.15),
      ],
      size: [1, 0.5, 0.25],
      color: slotDark,
      texture: "metal",
      rotation: [a, 0, 0],
      roughness: 0.5,
      metalness: 0.5,
      attachTo: WORM_ID,
    });
  }
  props.push({
    kind: "box",
    position: [COLLAR_X, TABLE_Y + COLLAR_R + 1.1, WORM_MESH_DISTANCE],
    size: [0.4, 1.6, 0.4],
    color: datumOrange,
    texture: "metal",
    roughness: 0.5,
    metalness: 0.4,
  });

  // The motor: case, feet down to the bed, terminal box, and the cooling fan on the back end.
  // The case is static -- a motor's frame does not turn -- and the FAN is what shows the input
  // speed, attached to the motor gear itself.
  props.push({
    kind: "cylinder",
    position: [MOTOR_CASE_X, TABLE_Y, WORM_MESH_DISTANCE],
    radius: MOTOR_CASE_R,
    height: MOTOR_CASE_LEN,
    radialSegments: 28,
    color: motorBlue,
    texture: "metal",
    textureRepeat: [6, 2],
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.4,
    metalness: 0.7,
  });
  props.push({
    kind: "box",
    position: [MOTOR_CASE_X, (BED_TOP + TABLE_Y) / 2, WORM_MESH_DISTANCE],
    size: [MOTOR_CASE_LEN - 2, TABLE_Y - BED_TOP, 7],
    color: machineGreen,
    texture: "metal",
    roughness: 0.55,
    metalness: 0.6,
  });
  props.push({
    kind: "box",
    position: [MOTOR_CASE_X, TABLE_Y + MOTOR_CASE_R + 0.9, WORM_MESH_DISTANCE],
    size: [4, 1.8, 3],
    color: fanBlack,
    texture: "metal",
    roughness: 0.6,
    metalness: 0.5,
  });
  props.push({
    kind: "cylinder",
    position: [FAN_X, TABLE_Y, WORM_MESH_DISTANCE],
    radius: 1,
    height: 1.2,
    color: fanBlack,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.55,
    metalness: 0.55,
    attachTo: MOTOR_ID,
  });
  for (let i = 0; i < FAN_BLADES; i++) {
    const a = radialAngle(i, FAN_BLADES);
    props.push({
      kind: "box",
      position: [
        FAN_X,
        TABLE_Y + Math.cos(a) * (FAN_R / 2 + 0.6),
        WORM_MESH_DISTANCE + Math.sin(a) * (FAN_R / 2 + 0.6),
      ],
      size: [0.4, FAN_R, 1.1],
      color: fanBlack,
      texture: "metal",
      rotation: [a, 0, 0],
      roughness: 0.55,
      metalness: 0.55,
      attachTo: MOTOR_ID,
    });
  }
  // Fan guard: a fixed ring the blades turn inside.
  props.push({
    kind: "ring",
    position: [FAN_X + 0.9, TABLE_Y, WORM_MESH_DISTANCE],
    radius: FAN_R + 0.4,
    tube: 0.25,
    color: clampGrey,
    texture: "metal",
    rotation: [0, Math.PI / 2, 0],
    roughness: 0.6,
    metalness: 0.5,
  });

  return props;
}
