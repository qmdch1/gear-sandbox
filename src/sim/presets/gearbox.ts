import type { GearInstance, GearType, LayoutState, RemoteLink } from "../types";
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

// =======================================================================================
// IDS
// =======================================================================================

export const INPUT_CRANK_ID = "변속기_입력축크랭크";
export const SPLINE1_ID = "변속기_입력스플라인1";
export const SPLINE2_ID = "변속기_입력스플라인2";
export const SPLINE3_ID = "변속기_입력스플라인3";
export const DRIVE1_ID = "변속기_1단구동기어";
export const DRIVEN1_ID = "변속기_1단피동기어";
export const DRIVE2_ID = "변속기_2단구동기어";
export const DRIVEN2_ID = "변속기_2단피동기어";
export const DRIVE3_ID = "변속기_3단구동기어";
export const DRIVEN3_ID = "변속기_3단피동기어";
export const FLANGE_ID = "변속기_출력플랜지";
export const LEVER_ID = "변속기_변속레버";
export const RAIL_ID = "변속기_시프트레일";

/** The three drive gears, in the order they sit along the input shaft. Exported so the props
 *  and the tests can walk the stages without re-listing them. */
export const DRIVE_IDS: readonly string[] = [DRIVE1_ID, DRIVE2_ID, DRIVE3_ID];
export const DRIVEN_IDS: readonly string[] = [DRIVEN1_ID, DRIVEN2_ID, DRIVEN3_ID];
export const SPLINE_IDS: readonly string[] = [SPLINE1_ID, SPLINE2_ID, SPLINE3_ID];

// =======================================================================================
// TOOTH SIZE AND THE ONE CENTRE DISTANCE
// =======================================================================================

/** ONE module for every gear that tooth-meshes in this box, and in a gearbox that is not
 *  bookkeeping -- it is the whole reason the machine can exist. Two gears can only mesh if
 *  their teeth are the same SIZE, and module IS tooth size (circular pitch = pi * module;
 *  `render/gearGeometry.ts` cuts real involute teeth with addendum = 1*module and dedendum =
 *  1.25*module). `evaluatePair` never checks module -- it only asks whether two centres sit
 *  `pitchRadius(a) + pitchRadius(b)` apart -- so a mixed-module mesh yields a perfectly happy
 *  simulation edge and a rendered pair whose teeth are visibly different sizes and could not
 *  engage on any real shaft. tests/sim/presets/gearbox.test.ts asserts equal modules for EVERY
 *  mesh edge the real `buildEdges` produces, not just the ones named here. */
export const GEARBOX_MODULE = 0.5;

/** THE defining constraint of a real layshaft gearbox, and the thing this preset exists to
 *  show. Both shafts are carried in the same two end walls, so every stage shares ONE centre
 *  distance. At a fixed module that forces every pair's tooth counts to sum to the same number:
 *
 *      centreDistance = module * (N_drive + N_driven) / 2
 *
 *  Fix that sum and any (N_drive, N_driven) split you like drops onto the same two shafts --
 *  which is exactly how a gearbox gets several different ratios out of one pair of bearings.
 *  48 teeth per stage at module 0.5 gives a 12-unit centre distance. */
export const STAGE_TEETH_SUM = 48;
export const CENTER_DISTANCE = (GEARBOX_MODULE * STAGE_TEETH_SUM) / 2; // 0.5 * 48 / 2 = 12

// Stage tooth splits. Each column sums to STAGE_TEETH_SUM.
export const STAGE1_DRIVE_TEETH = 12;
export const STAGE1_DRIVEN_TEETH = 36; // 12 + 36 = 48
export const STAGE2_DRIVE_TEETH = 16;
export const STAGE2_DRIVEN_TEETH = 32; // 16 + 32 = 48
export const STAGE3_DRIVE_TEETH = 30;
export const STAGE3_DRIVEN_TEETH = 18; // 30 + 18 = 48

export const DRIVE1_R = pitchRadius(STAGE1_DRIVE_TEETH, GEARBOX_MODULE); // 3
export const DRIVEN1_R = pitchRadius(STAGE1_DRIVEN_TEETH, GEARBOX_MODULE); // 9
export const DRIVE2_R = pitchRadius(STAGE2_DRIVE_TEETH, GEARBOX_MODULE); // 4
export const DRIVEN2_R = pitchRadius(STAGE2_DRIVEN_TEETH, GEARBOX_MODULE); // 8
export const DRIVE3_R = pitchRadius(STAGE3_DRIVE_TEETH, GEARBOX_MODULE); // 7.5
export const DRIVEN3_R = pitchRadius(STAGE3_DRIVEN_TEETH, GEARBOX_MODULE); // 4.5
// 3 + 9 = 4 + 8 = 7.5 + 4.5 = 12 = CENTER_DISTANCE. Every stage meshes at the SAME gap.

/** A rendered tooth reaches one full module PAST the pitch circle (`gearGeometry.ts`:
 *  `addendumRadius = pitchRadius + module * ADDENDUM_FACTOR`, ADDENDUM_FACTOR = 1), and the
 *  root is cut 1.25 modules BELOW it (DEDENDUM_FACTOR = 1.25). Every clearance in this file is
 *  measured against one of these two, never against the bare pitch radius. */
export const DRIVEN1_TIP_R = DRIVEN1_R + GEARBOX_MODULE; // 9.5 -- the biggest wheel in the box
export const DRIVE3_TIP_R = DRIVE3_R + GEARBOX_MODULE; // 8 -- the tallest thing on the input shaft
export const DRIVE1_ROOT_R = DRIVE1_R - GEARBOX_MODULE * 1.25; // 2.375 -- the smallest hub bore region
export const DRIVEN2_ROOT_R = DRIVEN2_R - GEARBOX_MODULE * 1.25; // 7.375

// =======================================================================================
// RATIOS
// =======================================================================================

/** Each stage's ratio is a pure tooth-count ratio -- `evaluatePair` returns
 *  `a.teeth / b.teeth` for a mesh, and module never enters it (module only sets physical
 *  size). `propagateRotation` drives a mesh with sign -1, so each layshaft wheel runs
 *  BACKWARDS relative to the input shaft at exactly these fractions of its speed. */
export const STAGE1_RATIO = STAGE1_DRIVE_TEETH / STAGE1_DRIVEN_TEETH; // 12/36 = 1/3
export const STAGE2_RATIO = STAGE2_DRIVE_TEETH / STAGE2_DRIVEN_TEETH; // 16/32 = 1/2
export const STAGE3_RATIO = STAGE3_DRIVE_TEETH / STAGE3_DRIVEN_TEETH; // 30/18 = 5/3

/** Commanded input-shaft speed, rad/s. An arbitrary, easy-to-eyeball input -- what this preset
 *  demonstrates are the three speeds DERIVED from it, not the number itself. */
export const INPUT_SPEED = 1.2;

// =======================================================================================
// GEOMETRY: where the two shafts and the three stages sit
// =======================================================================================

/** Both shafts run along world X, so the three stages stand SIDE BY SIDE across the case and
 *  each pair's tooth contact is its own visible point. Every shaft gear therefore takes
 *  axis [1,0,0] and renders as a disc in the YZ plane. */
export const SHAFT_AXIS: [number, number, number] = [1, 0, 0];

export const INPUT_Y = 26;
export const LAY_Y = INPUT_Y - CENTER_DISTANCE; // 26 - 12 = 14

/** Axial (along-shaft) stage spacing. These are NOT free numbers. Two gears that are not a
 *  legal pair count as overlapping once their centres come closer than
 *  `(rA + rB) * (1 - MESH_TOLERANCE)` (`meshing.ts` `isOverlapping`), and -- worse -- two
 *  parallel-axis gears that land at `rA + rB` +/- 5% form a phantom MESH. Both windows have to
 *  be cleared for every same-shaft and cross-shaft pair, and the binding ones are the two
 *  biggest layshaft wheels:
 *
 *    36T & 32T (r 9 + 8 = 17): phantom-mesh window 16.15 .. 17.85  ->  gap 19 clears it by 1.15
 *    32T & 18T (r 8 + 4.5 = 12.5): window 11.875 .. 13.125         ->  gap 16 clears it by 2.875
 *    36T & 18T (r 9 + 4.5 = 13.5): window 12.825 .. 14.175         ->  gap 35 clears it easily
 *
 *  and on the input shaft 12T/16T (window 6.65..7.35 vs 19), 16T/30T (10.925..12.075 vs 16),
 *  12T/30T (9.975..11.025 vs 35). The stages are kept in ratio order 1-2-3 along the shaft
 *  because that is what makes the picture readable; the gaps are the smallest that keep that
 *  order legal. */
export const STAGE1_X = 0;
export const STAGE_GAP_1_2 = 19;
export const STAGE_GAP_2_3 = 16;
export const STAGE2_X = STAGE1_X + STAGE_GAP_1_2; // 19
export const STAGE3_X = STAGE2_X + STAGE_GAP_2_3; // 35

export const STAGE_X: readonly number[] = [STAGE1_X, STAGE2_X, STAGE3_X];

// =======================================================================================
// THE INPUT SHAFT: three different-sized gears that all have to turn as ONE piece
// =======================================================================================

/** Splined collars, one buried in each drive gear's hub, plus the input stub -- all four the
 *  same 10-tooth, 0.24-module sprocket so a `chain` RemoteLink between any two of them has
 *  ratio `a.teeth / b.teeth` = EXACTLY 1 (`graph.ts` `buildEdges`) and sign +1
 *  (`rotation.ts`: chain edges are +1, unlike a mesh's -1). Same speed, same direction, at any
 *  spacing, because a chain link is distance-free -- which is precisely the kinematics of one
 *  rigid shaft, and precisely the idiom `presets/pistonengine.ts` already uses to say "these
 *  five wheels are ONE crankshaft".
 *
 *  It has to be done this way. The three drive gears are 12T, 16T and 30T -- different sizes,
 *  which is the point of a gearbox -- so no chain or belt BETWEEN THEM could ever come out 1:1,
 *  and `evaluatePair`'s only other 1:1 edge, the coincident `coupling`, needs the two bodies to
 *  share a position. So each drive gear gets a collar sitting exactly on its own centre (a
 *  coincident coupling, ratio 1), and the collars carry the shaft between them. */
export const COLLAR_TEETH = 10;
export const COLLAR_MODULE = 0.24;
export const COLLAR_R = pitchRadius(COLLAR_TEETH, COLLAR_MODULE); // 1.2

/** How far a sprocket actually reaches: `gearGeometry.ts`'s `sprocketGeometry` draws a hub of
 *  `pitchRadius * 0.85` and stands square teeth of height `module * 0.9` on it. The collar has
 *  to disappear inside the SMALLEST drive gear's root circle or it would burst out through the
 *  12-tooth gear it is supposed to be keyed inside. 1.02 + 0.216 = 1.236 < 2.375. */
export const COLLAR_OUTER_R = COLLAR_R * 0.85 + COLLAR_MODULE * 0.9; // 1.236

/** The input stub, at the clutch end of the shaft. Same tooth count and module as the collars,
 *  so its chain link to the first collar is a true 1:1 -- a chain between two sprockets of
 *  different pitch would be a fiction. Set back 10 from the first drive gear: the phantom-mesh
 *  window for the 1.2-radius stub against the 3-radius 12T gear is 3.99 .. 4.41, and against
 *  the 9-radius 36T wheel one shaft over (centre distance hypot(10, 12) = 15.62) it is
 *  9.69 .. 10.71 -- both cleared with room. */
export const INPUT_CRANK_X = -10;

// =======================================================================================
// THE SELECTOR: rail, fork and hand lever
// =======================================================================================

/** The rack and the pinion that drives it share a module for the same reason every meshing pair
 *  in the box does -- it is a real tooth mesh (`evaluatePair`'s rack branch), and mismatched
 *  tooth sizes would render as teeth that cannot engage. It happens to equal GEARBOX_MODULE;
 *  it is a separate constant because it is a separate mesh. */
export const SHIFT_MODULE = 0.5;
export const LEVER_TEETH = 16;
export const LEVER_R = pitchRadius(LEVER_TEETH, SHIFT_MODULE); // 4
export const RAIL_TEETH = 26;

/** The selector rail runs along X at the layshaft's own height, stood off the open front of the
 *  case in +Z -- a side-change selector housing, bolted to the case flank, exactly like a real
 *  side-shift box. 16 in Z keeps the rail (overlap radius = its pitch radius, 6.5) clear of the
 *  biggest wheel in the box: the 36T wheel's overlap floor against it is (6.5 + 9) * 0.95 =
 *  14.725, and the rail sits hypot(6, 0, 16) = 17.09 from it. */
export const RAIL_Z = 16;
export const RAIL_Y = LAY_Y; // 14 -- level with the shaft the fork works on
export const RAIL_X = -6;

/** `evaluatePair`'s rack rule: the pinion's centre must sit `pitchRadius(pinion)` from the
 *  rack's infinite travel line. The line here is {(t, RAIL_Y, RAIL_Z)}, so putting the lever
 *  pinion exactly LEVER_R above the rail, at the same Z, satisfies it exactly -- and puts the
 *  pinion on the side the rack's teeth actually face (`rackGeometry` builds its teeth toward
 *  local +Y, and the axis-aligning quaternion for [1,0,0] is a pure Y-rotation, so they end up
 *  pointing at world +Y). */
export const LEVER_X = 24;
export const LEVER_Y = RAIL_Y + LEVER_R; // 18

/** Half-swing of the hand lever, radians, carried as its `reverseAt` bound so it rocks instead
 *  of spinning through -- a gear lever being pushed one way and pulled back. */
export const SHIFT_SWING = 1.0;
export const LEVER_SPEED = 0.6;

/** How far the fork actually travels, and it is DERIVED, not chosen: `rotation.ts` drives a
 *  rack at `crankSpeed * pitchRadius(pinion)`, i.e. the rail advances `LEVER_R` per radian of
 *  lever. So a +/-1 rad swing is a +/-4 unit stroke. Carrying it as the rack's `travelLimit`
 *  as well as the lever's `reverseAt` means the two agree exactly -- the rail arrives at its
 *  stop on the same tick the lever turns round, with no dead time parked against a clamp. */
export const SHIFT_TRAVEL = LEVER_R * SHIFT_SWING; // 4

/** Where the fork sits at rail position 0: in the clear bay between stage 1 and stage 2. The
 *  gears are razor-thin discs in X (`gearGeometry.ts` extrudes GEAR_THICKNESS = 0.4), so the
 *  fork only has to miss their planes: 12 - 4 = 8 clears the stage-1 discs at x = 0..0.4, and
 *  12 + 4 = 16 stops 3 short of the stage-2 discs at x = 19. */
export const FORK_X = 12;
export const FORK_MIN_X = FORK_X - SHIFT_TRAVEL; // 8
export const FORK_MAX_X = FORK_X + SHIFT_TRAVEL; // 16

/** Half-pitch offset `rackGeometry` builds the bar with (its profile starts at -pitch/2), and
 *  the bar's full length. Used to check the rail is long enough that the pinion never runs off
 *  the end of it at either end of the stroke. */
export const RAIL_PITCH = Math.PI * SHIFT_MODULE; // 1.5708
export const RAIL_BAR_LENGTH = RAIL_TEETH * RAIL_PITCH; // 40.84
export const RAIL_BAR_START = RAIL_X - RAIL_PITCH / 2; // -6.785
export const RAIL_BAR_END = RAIL_BAR_START + RAIL_BAR_LENGTH; // 34.06

// =======================================================================================
// THE OUTPUT
// =======================================================================================

/** The output flange rides the 2단 wheel: a `load` on the same centre and axis, which
 *  `evaluatePair`'s coincident branch resolves as a 1:1 coupling. `gearGeometry.ts` draws a
 *  load as a `module * 2` radius hub, so module 1.5 gives a 3-radius boss -- safely inside the
 *  32-tooth wheel's 7.375 root circle, i.e. it really is a hub INSIDE that gear rather than a
 *  disc hanging out past its teeth. */
export const FLANGE_MODULE = 1.5;
export const FLANGE_HUB_R = FLANGE_MODULE * 2; // 3
/** Where the flange's bolt circle is actually drawn, out past the case's output wall. Props
 *  attached to a gear are swept about THAT GEAR'S centre and axis, so a flange drawn on the
 *  layshaft's own centre line (y = LAY_Y, z = 0) but further along X still turns correctly:
 *  rotation about [1,0,0] leaves x alone. */
export const FLANGE_X = 43;
export const FLANGE_BOLT_R = 3;

// =======================================================================================
// THE CASE
// =======================================================================================

export const CASE_X_MIN = -14;
export const CASE_X_MAX = 40;
export const CASE_Z_HALF = 12;
export const SUMP_TOP_Y = 2.5;
export const CASE_TOP_Y = 37;
export const CASE_WALL = 1.5;
export const CASE_CENTER_X = (CASE_X_MIN + CASE_X_MAX) / 2; // 13
export const CASE_LENGTH = CASE_X_MAX - CASE_X_MIN; // 54

/** 변속기 (multi-speed gearbox), cut away on its front face so the whole gear train is visible.
 *
 *  WHAT THE MACHINE IS
 *  -------------------
 *  Two parallel shafts running left to right along world X, carried in the same two end walls:
 *  the INPUT shaft at y = 26 and the LAYSHAFT at y = 14, so their centres are CENTER_DISTANCE
 *  = 12 apart. Three gear pairs straddle that one gap, side by side along the shafts:
 *
 *    x = 0    1단:  12T (r 3)   -- mesh --  36T (r 9)     3 + 9   = 12
 *    x = 19   2단:  16T (r 4)   -- mesh --  32T (r 8)     4 + 8   = 12
 *    x = 35   3단:  30T (r 7.5) -- mesh --  18T (r 4.5)   7.5+4.5 = 12
 *
 *  Every pair is a genuine tooth mesh at exactly the summed pitch radii, on one shared module,
 *  and all three land on the same 12-unit gap because their tooth counts all sum to 48. That
 *  identity -- `module * (N_drive + N_driven) / 2 = one centre distance` -- is the entire trick
 *  that lets a gearbox hang several ratios off a single pair of bearings, and it is what this
 *  preset is built to show.
 *
 *  THE THREE RATIOS
 *  ----------------
 *  A mesh in this sandbox turns its partner backwards (`rotation.ts` gives every mesh edge
 *  sign -1) at `driveTeeth / drivenTeeth`. With the input shaft commanded at +1.2 rad/s:
 *
 *    1단  12/36 = 1/3   ->  36T wheel at -0.4 rad/s   (reduction, the slow, heavy-pulling gear)
 *    2단  16/32 = 1/2   ->  32T wheel at -0.6 rad/s   (reduction)
 *    3단  30/18 = 5/3   ->  18T wheel at -2.0 rad/s   (step-up: a real box's overdrive top)
 *
 *  Three separately verified, visibly different speeds, all running at once off one input --
 *  which is exactly what a CONSTANT-MESH box does. Every pair stays engaged all the time; the
 *  layshaft wheels each spin free on the shaft at their own ratio, and the driver picks one by
 *  sliding a dog collar into it. Nothing here is a claim about torque, pulling power or load
 *  capacity: this sandbox models angular velocity and rotation ONLY. "Reduction" below means
 *  the output turns slower than the input, and nothing more.
 *
 *  HOW ONE SHAFT IS SPELLED
 *  ------------------------
 *  The three drive gears are different sizes, so nothing that scales with size can tie them
 *  together at 1:1 -- a chain between them would come out 12/16, a belt 3/4. What IS exactly
 *  1:1 at any distance is a chain between two sprockets of the SAME tooth count, so each drive
 *  gear carries a 10-tooth splined collar on its own centre (a coincident `coupling`, ratio 1,
 *  buried inside the gear's hub -- COLLAR_OUTER_R 1.236 < the 12T gear's 2.375 root circle),
 *  and those collars are chained to one another and to the input stub. Same speed, same
 *  direction, three gears, one shaft. `presets/pistonengine.ts` spells a crankshaft the same
 *  way and for the same reason.
 *
 *  THE SELECTOR
 *  ------------
 *  A hand lever (16T pinion) rocking +/-1 rad drives a rack -- the shift rail -- along the
 *  layshaft in a side-mounted selector housing. The rail advances LEVER_R = 4 units per radian
 *  of lever, so the stroke is exactly +/-4, and that same number is the rail's `travelLimit`:
 *  the fork parks at its stops instead of sailing out of the case. The fork rides the rail
 *  between the 1단 and 2단 dog collars and its slipper ring genuinely does NOT rotate -- a real
 *  fork sits in the collar's groove and stays still while the collar turns inside it.
 *
 *  WHAT MOVES, AND WHY YOU CAN SEE IT
 *  ----------------------------------
 *  A gear disc spun about its own axis shows nothing. Every wheel here therefore carries three
 *  radial webs and a bright timing mark, `attachTo`-ed to that wheel, so each of the six gears
 *  visibly turns at its own speed; the two layshaft dog collars carry four axial dog teeth
 *  each, turning with their free wheel; the input and output flanges carry bolt lugs and a
 *  driver key; and the fork assembly slides bodily along X with the rail. */
export function createGearboxPreset(): LayoutState {
  const gears: GearInstance[] = [
    // --- input shaft: stub, then three collar+gear pairs, all about [1,0,0] at y = 26 ---
    seedGear(
      INPUT_CRANK_ID,
      "crank",
      [INPUT_CRANK_X, INPUT_Y, 0],
      SHAFT_AXIS,
      COLLAR_TEETH,
      COLLAR_MODULE,
      INPUT_SPEED,
    ),
    seedGear(SPLINE1_ID, "sprocket", [STAGE1_X, INPUT_Y, 0], SHAFT_AXIS, COLLAR_TEETH, COLLAR_MODULE),
    seedGear(DRIVE1_ID, "spur", [STAGE1_X, INPUT_Y, 0], SHAFT_AXIS, STAGE1_DRIVE_TEETH, GEARBOX_MODULE),
    // ...and its partner one CENTER_DISTANCE below, on the layshaft: 3 + 9 = 12.
    seedGear(DRIVEN1_ID, "spur", [STAGE1_X, LAY_Y, 0], SHAFT_AXIS, STAGE1_DRIVEN_TEETH, GEARBOX_MODULE),

    seedGear(SPLINE2_ID, "sprocket", [STAGE2_X, INPUT_Y, 0], SHAFT_AXIS, COLLAR_TEETH, COLLAR_MODULE),
    seedGear(DRIVE2_ID, "spur", [STAGE2_X, INPUT_Y, 0], SHAFT_AXIS, STAGE2_DRIVE_TEETH, GEARBOX_MODULE),
    // 4 + 8 = 12.
    seedGear(DRIVEN2_ID, "spur", [STAGE2_X, LAY_Y, 0], SHAFT_AXIS, STAGE2_DRIVEN_TEETH, GEARBOX_MODULE),

    seedGear(SPLINE3_ID, "sprocket", [STAGE3_X, INPUT_Y, 0], SHAFT_AXIS, COLLAR_TEETH, COLLAR_MODULE),
    seedGear(DRIVE3_ID, "spur", [STAGE3_X, INPUT_Y, 0], SHAFT_AXIS, STAGE3_DRIVE_TEETH, GEARBOX_MODULE),
    // 7.5 + 4.5 = 12.
    seedGear(DRIVEN3_ID, "spur", [STAGE3_X, LAY_Y, 0], SHAFT_AXIS, STAGE3_DRIVEN_TEETH, GEARBOX_MODULE),

    // The output flange, keyed onto the 2단 wheel -- the gear the dog collar is shown engaged
    // in. Coincident with it and on the same axis, so `evaluatePair` resolves a 1:1 coupling.
    seedGear(FLANGE_ID, "load", [STAGE2_X, LAY_Y, 0], SHAFT_AXIS, 0, FLANGE_MODULE),

    // --- the selector, a self-powered cluster of its own, in the side housing at z = 16 ---
    seedGear(LEVER_ID, "crank", [LEVER_X, LEVER_Y, RAIL_Z], [0, 0, 1], LEVER_TEETH, SHIFT_MODULE, LEVER_SPEED),
    seedGear(RAIL_ID, "rack", [RAIL_X, RAIL_Y, RAIL_Z], SHAFT_AXIS, RAIL_TEETH, SHIFT_MODULE),
  ];

  // The lever rocks instead of turning through, so the fork shuttles between the two collars.
  gears[11].reverseAt = [-SHIFT_SWING, SHIFT_SWING];
  // ...and the rail is physically stopped at the same points the lever turns round at.
  gears[12].travelLimit = [-SHIFT_TRAVEL, SHIFT_TRAVEL];

  // The input shaft, spelled as three 1:1 chain links between four identical 10-tooth bodies.
  const remoteLinks: RemoteLink[] = [
    { a: INPUT_CRANK_ID, b: SPLINE1_ID, kind: "chain" },
    { a: SPLINE1_ID, b: SPLINE2_ID, kind: "chain" },
    { a: SPLINE2_ID, b: SPLINE3_ID, kind: "chain" },
  ];

  return { gears, remoteLinks };
}

/** Angle of web `i` on a gear face. Three webs at 120 degrees: enough to break the disc's
 *  rotational symmetry (which is the only reason a spinning gear reads as spinning at all),
 *  few enough to leave the tooth contact visible between them. */
export function webAngle(i: number): number {
  return (i / 3) * Math.PI * 2;
}

/** Angle of dog tooth `i` on a layshaft collar -- four square teeth, the classic dog ring. */
export function dogToothAngle(i: number): number {
  return (i / 4) * Math.PI * 2;
}

/** The gearbox's body: a cast-iron case open at the front, its sump and top cover, bearing
 *  bosses at both walls, both shafts, webs and timing marks on all six gears, the dog collars
 *  the fork works between, the sliding fork itself, the input and output flanges, and the bench
 *  the whole thing is stood on. */
export function createGearboxProps(): Prop[] {
  const iron = 0x4a4a52; // cast case
  const darkIron = 0x3a3a42;
  const steel = 0xb8bec6; // machined shafts, gears, fork
  const brightSteel = 0xd6dce4;
  const bronze = 0xa9762f; // bushings, timing marks
  const oil = 0x2f2718;
  const timber = 0x7a5533;
  const masonry = 0x8a4b3a;
  const concrete = 0x9a9a92;
  const canvas = 0x5f6b52;

  const props: Prop[] = [];

  // -------------------------------------------------------------------------------------
  // The bench the box is set up on: a concrete floor pad, a brick plinth, a timber top, a
  // tiled drip tray and a canvas rag. Nothing here moves; it is what gives the case a place
  // to stand instead of floating.
  // -------------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, -6.2, 2],
    size: [68, 2, 36],
    color: concrete,
    texture: "stone",
    textureRepeat: [8, 5],
    roughness: 0.95,
    metalness: 0.02,
  });
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, -3.2, 2],
    size: [60, 4, 30],
    color: masonry,
    texture: "brick",
    textureRepeat: [10, 2],
    roughness: 0.93,
    metalness: 0.03,
  });
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, -0.6, 2],
    size: [64, 1.2, 32],
    color: timber,
    texture: "wood",
    textureRepeat: [9, 4],
    roughness: 0.8,
    metalness: 0.04,
  });
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, 0.15, 21],
    size: [40, 0.5, 8],
    color: 0x8d9299,
    texture: "tile",
    textureRepeat: [8, 2],
    roughness: 0.6,
    metalness: 0.15,
  });
  props.push({
    kind: "box",
    position: [CASE_X_MAX + 4, 0.3, 20],
    size: [9, 0.5, 6],
    color: canvas,
    texture: "fabric",
    textureRepeat: [3, 2],
    rotation: [0, 0.3, 0],
    roughness: 0.98,
    metalness: 0.01,
  });

  // -------------------------------------------------------------------------------------
  // The case. FRONT WALL DELIBERATELY OMITTED -- this is a cutaway, and the open +Z face is
  // how the three meshes are meant to be seen.
  // -------------------------------------------------------------------------------------
  const caseMidY = (SUMP_TOP_Y + CASE_TOP_Y) / 2; // 19.75
  const caseWallHeight = CASE_TOP_Y - SUMP_TOP_Y; // 34.5

  // Sump floor.
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, SUMP_TOP_Y / 2, 0],
    size: [CASE_LENGTH, SUMP_TOP_Y, CASE_Z_HALF * 2],
    color: iron,
    texture: "rust",
    textureRepeat: [8, 3],
    roughness: 0.85,
    metalness: 0.4,
  });
  // A shallow pool of oil in the bottom of it.
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, SUMP_TOP_Y + 0.25, 0],
    size: [CASE_LENGTH - 4, 0.5, CASE_Z_HALF * 2 - 3],
    color: oil,
    texture: "metal",
    textureRepeat: [6, 3],
    roughness: 0.25,
    metalness: 0.55,
    opacity: 0.75,
  });
  // Back wall.
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, caseMidY, -CASE_Z_HALF - CASE_WALL / 2],
    size: [CASE_LENGTH, caseWallHeight, CASE_WALL],
    color: iron,
    texture: "rust",
    textureRepeat: [8, 5],
    roughness: 0.85,
    metalness: 0.4,
  });
  // The two end walls the shafts are actually carried in.
  for (const wallX of [CASE_X_MIN - CASE_WALL / 2, CASE_X_MAX + CASE_WALL / 2]) {
    props.push({
      kind: "box",
      position: [wallX, caseMidY, 0],
      size: [CASE_WALL, caseWallHeight, CASE_Z_HALF * 2],
      color: iron,
      texture: "rust",
      textureRepeat: [4, 5],
      roughness: 0.85,
      metalness: 0.4,
    });
  }
  // Top cover, and the gasket under it.
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, CASE_TOP_Y + 0.75, 0],
    size: [CASE_LENGTH + 3, 1.5, CASE_Z_HALF * 2 + 3],
    color: darkIron,
    texture: "rust",
    textureRepeat: [8, 4],
    roughness: 0.82,
    metalness: 0.45,
  });
  props.push({
    kind: "box",
    position: [CASE_CENTER_X, CASE_TOP_Y - 0.2, 0],
    size: [CASE_LENGTH, 0.4, CASE_Z_HALF * 2],
    color: canvas,
    texture: "fabric",
    textureRepeat: [10, 3],
    roughness: 0.97,
    metalness: 0.02,
  });
  // Cooling ribs down the back wall.
  for (let i = 0; i < 7; i++) {
    props.push({
      kind: "box",
      position: [CASE_X_MIN + 4 + i * 8, caseMidY, -CASE_Z_HALF - CASE_WALL - 0.5],
      size: [1.2, caseWallHeight - 4, 1],
      color: darkIron,
      texture: "rust",
      textureRepeat: [1, 4],
      roughness: 0.88,
      metalness: 0.4,
    });
  }
  // Breather, dipstick and drain plug -- the small hardware that says "this thing holds oil".
  props.push({
    kind: "cylinder",
    position: [CASE_X_MIN + 8, CASE_TOP_Y + 2.6, -6],
    radius: 1.1,
    height: 2.2,
    color: bronze,
    texture: "metal",
    metalness: 0.75,
    roughness: 0.3,
  });
  props.push({
    kind: "cylinder",
    position: [CASE_X_MAX - 6, CASE_TOP_Y + 3.2, 5],
    radius: 0.35,
    height: 4,
    color: brightSteel,
    texture: "metal",
    metalness: 0.85,
    roughness: 0.2,
  });
  props.push({
    kind: "cylinder",
    position: [CASE_CENTER_X, 0.4, 0],
    radius: 1,
    height: 1.4,
    color: bronze,
    texture: "metal",
    metalness: 0.8,
    roughness: 0.28,
  });
  // Nameplate on the back wall.
  props.push({
    kind: "box",
    position: [CASE_X_MIN + 12, CASE_TOP_Y - 5, -CASE_Z_HALF - CASE_WALL - 0.3],
    size: [10, 4, 0.4],
    color: bronze,
    texture: "metal",
    textureRepeat: [3, 1],
    metalness: 0.8,
    roughness: 0.25,
  });

  // -------------------------------------------------------------------------------------
  // Bearing bosses: a raised cast boss and a bronze bush at every point a shaft passes
  // through an end wall. A cylinder is authored about local Y, so [0, 0, PI/2] lays it down
  // along world X, which is the direction both shafts run.
  // -------------------------------------------------------------------------------------
  const alongX: [number, number, number] = [0, 0, Math.PI / 2];
  for (const shaftY of [INPUT_Y, LAY_Y]) {
    for (const wallX of [CASE_X_MIN - CASE_WALL / 2, CASE_X_MAX + CASE_WALL / 2]) {
      props.push({
        kind: "cylinder",
        position: [wallX, shaftY, 0],
        radius: 3.2,
        height: 3.4,
        color: iron,
        texture: "rust",
        textureRepeat: [3, 1],
        rotation: alongX,
        roughness: 0.85,
        metalness: 0.42,
      });
      props.push({
        kind: "cylinder",
        position: [wallX, shaftY, 0],
        radius: 1.9,
        height: 3.8,
        color: bronze,
        texture: "metal",
        textureRepeat: [3, 1],
        rotation: alongX,
        roughness: 0.3,
        metalness: 0.8,
      });
      // Four cap bolts round each boss.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        props.push({
          kind: "cylinder",
          position: [wallX + (wallX < 0 ? -1.9 : 1.9), shaftY + Math.cos(a) * 2.6, Math.sin(a) * 2.6],
          radius: 0.35,
          height: 0.8,
          color: darkIron,
          texture: "metal",
          rotation: alongX,
          roughness: 0.45,
          metalness: 0.7,
        });
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // The two shafts themselves.
  // -------------------------------------------------------------------------------------
  props.push({
    kind: "cylinder",
    position: [(INPUT_CRANK_X - 6 + CASE_X_MAX + 2) / 2, INPUT_Y, 0],
    radius: 1,
    height: CASE_X_MAX + 2 - (INPUT_CRANK_X - 6),
    color: steel,
    texture: "metal",
    textureRepeat: [10, 1],
    rotation: alongX,
    roughness: 0.25,
    metalness: 0.85,
  });
  props.push({
    kind: "cylinder",
    position: [(STAGE1_X - 6 + FLANGE_X + 1) / 2, LAY_Y, 0],
    radius: 1,
    height: FLANGE_X + 1 - (STAGE1_X - 6),
    color: steel,
    texture: "metal",
    textureRepeat: [10, 1],
    rotation: alongX,
    roughness: 0.25,
    metalness: 0.85,
  });

  // -------------------------------------------------------------------------------------
  // Gear webs and timing marks. THIS is what makes the box readable: six discs all turning
  // at once, at four different speeds, and a bare disc spun about its own axis shows nothing
  // at all. A web at angle `a` in the YZ plane points along (0, cos a, sin a), which is what
  // a box authored along local +Y and rotated [a, 0, 0] about world X ends up pointing along.
  // -------------------------------------------------------------------------------------
  const wheels: Array<{ id: string; x: number; y: number; r: number }> = [
    { id: DRIVE1_ID, x: STAGE1_X, y: INPUT_Y, r: DRIVE1_R },
    { id: DRIVEN1_ID, x: STAGE1_X, y: LAY_Y, r: DRIVEN1_R },
    { id: DRIVE2_ID, x: STAGE2_X, y: INPUT_Y, r: DRIVE2_R },
    { id: DRIVEN2_ID, x: STAGE2_X, y: LAY_Y, r: DRIVEN2_R },
    { id: DRIVE3_ID, x: STAGE3_X, y: INPUT_Y, r: DRIVE3_R },
    { id: DRIVEN3_ID, x: STAGE3_X, y: LAY_Y, r: DRIVEN3_R },
  ];
  for (const wheel of wheels) {
    const webLength = wheel.r * 0.9;
    for (let i = 0; i < 3; i++) {
      const a = webAngle(i);
      props.push({
        kind: "box",
        position: [
          wheel.x + 0.5,
          wheel.y + Math.cos(a) * (webLength / 2),
          Math.sin(a) * (webLength / 2),
        ],
        size: [0.6, webLength, wheel.r * 0.28],
        color: steel,
        texture: "metal",
        textureRepeat: [1, 2],
        rotation: [a, 0, 0],
        roughness: 0.3,
        metalness: 0.8,
        attachTo: wheel.id,
      });
    }
    // One bright bronze timing mark, off the web angles, so the direction of turn is
    // unmistakable even on a three-web wheel.
    const markAngle = 0.6;
    props.push({
      kind: "box",
      position: [
        wheel.x + 0.6,
        wheel.y + Math.cos(markAngle) * wheel.r * 0.72,
        Math.sin(markAngle) * wheel.r * 0.72,
      ],
      size: [0.7, wheel.r * 0.3, 0.55],
      color: bronze,
      texture: "metal",
      rotation: [markAngle, 0, 0],
      roughness: 0.28,
      metalness: 0.85,
      attachTo: wheel.id,
    });
    // A hub boss at the centre of each wheel, so the gear looks keyed to its shaft.
    props.push({
      kind: "cylinder",
      position: [wheel.x + 0.2, wheel.y, 0],
      radius: 1.5,
      height: 1.6,
      color: darkIron,
      texture: "metal",
      textureRepeat: [2, 1],
      rotation: alongX,
      roughness: 0.4,
      metalness: 0.7,
    });
  }

  // -------------------------------------------------------------------------------------
  // The dog collars on the layshaft, one beside each of the two wheels the fork works
  // between. Each ring of teeth is attached to ITS OWN wheel, so the two rings turn at the
  // two different stage speeds (-0.4 and -0.6 rad/s) while the fork slides between them --
  // which is the clearest statement this preset can make that those wheels really are
  // running free at their own ratios.
  // -------------------------------------------------------------------------------------
  const dogCollars: Array<{ id: string; x: number }> = [
    { id: DRIVEN1_ID, x: STAGE1_X + 1.6 },
    { id: DRIVEN2_ID, x: STAGE2_X - 1.6 },
  ];
  for (const collar of dogCollars) {
    for (let i = 0; i < 4; i++) {
      const a = dogToothAngle(i);
      props.push({
        kind: "box",
        position: [collar.x, LAY_Y + Math.cos(a) * 2.4, Math.sin(a) * 2.4],
        size: [1.6, 0.9, 0.9],
        color: brightSteel,
        texture: "metal",
        rotation: [a, 0, 0],
        roughness: 0.28,
        metalness: 0.85,
        attachTo: collar.id,
      });
    }
  }

  // -------------------------------------------------------------------------------------
  // The side-mounted selector housing: two brackets carrying the shift rail out at z = 16,
  // clear of the open front of the case.
  // -------------------------------------------------------------------------------------
  for (const bracketX of [-4, 32]) {
    props.push({
      kind: "box",
      position: [bracketX, (0.5 + RAIL_Y - 2) / 2, RAIL_Z],
      size: [2.4, RAIL_Y - 2.5, 2.4],
      color: iron,
      texture: "rust",
      textureRepeat: [1, 3],
      roughness: 0.86,
      metalness: 0.4,
    });
    props.push({
      kind: "box",
      position: [bracketX, RAIL_Y - 1.4, RAIL_Z],
      size: [4, 1.4, 4],
      color: darkIron,
      texture: "rust",
      roughness: 0.86,
      metalness: 0.42,
    });
  }

  // -------------------------------------------------------------------------------------
  // The shift fork. Every piece of it declares `slideWith: RAIL_ID`, so `SceneSync` shifts
  // it bodily along the rail's own axis by the rail's `linearPosition` -- bounded to +/-4 by
  // the rack's `travelLimit`, so it shuttles between the two dog collars instead of running
  // out through the end wall. The slipper ring encircles the layshaft without touching it and
  // does not turn, which is what a real fork does.
  // -------------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [FORK_X, RAIL_Y, RAIL_Z],
    size: [3, 3, 3],
    color: steel,
    texture: "metal",
    textureRepeat: [2, 2],
    roughness: 0.35,
    metalness: 0.78,
    slideWith: RAIL_ID,
  });
  props.push({
    kind: "box",
    position: [FORK_X, LAY_Y, (RAIL_Z + 3) / 2],
    size: [1.4, 1.8, RAIL_Z - 3],
    color: steel,
    texture: "metal",
    textureRepeat: [1, 3],
    roughness: 0.35,
    metalness: 0.78,
    slideWith: RAIL_ID,
  });
  // The slipper ring itself. A torus is authored in the XY plane about local Z, so [0, PI/2, 0]
  // stands it up around a shaft running along world X.
  props.push({
    kind: "ring",
    position: [FORK_X, LAY_Y, 0],
    radius: 2.9,
    tube: 0.45,
    color: brightSteel,
    texture: "metal",
    rotation: [0, Math.PI / 2, 0],
    roughness: 0.3,
    metalness: 0.85,
    slideWith: RAIL_ID,
  });
  for (const side of [1, -1]) {
    props.push({
      kind: "box",
      position: [FORK_X, LAY_Y + side * 2.9, 0],
      size: [1.1, 1.2, 1.6],
      color: steel,
      texture: "metal",
      roughness: 0.32,
      metalness: 0.8,
      slideWith: RAIL_ID,
    });
  }

  // -------------------------------------------------------------------------------------
  // The hand lever: an arm and a knob on the rocking pinion, so the input that moves the fork
  // is visible as well as the fork itself. The pinion turns about [0,0,1], so its props swing
  // in the XY plane about (LEVER_X, LEVER_Y).
  // -------------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [LEVER_X, LEVER_Y + 5, RAIL_Z],
    size: [1.1, 10, 1.1],
    color: steel,
    texture: "metal",
    textureRepeat: [1, 4],
    roughness: 0.32,
    metalness: 0.82,
    attachTo: LEVER_ID,
  });
  props.push({
    kind: "sphere",
    position: [LEVER_X, LEVER_Y + 10.4, RAIL_Z],
    radius: 1.5,
    color: 0x1f1a16,
    texture: "wood",
    textureRepeat: [2, 2],
    roughness: 0.7,
    metalness: 0.06,
    attachTo: LEVER_ID,
  });

  // -------------------------------------------------------------------------------------
  // Input coupling flange, on the crank stub outside the input wall. Attached props sweep
  // about their gear's centre and axis, so a flange drawn further along X than the stub still
  // turns correctly -- rotation about [1,0,0] leaves x alone.
  // -------------------------------------------------------------------------------------
  const inputFlangeX = CASE_X_MIN - 4;
  props.push({
    kind: "cylinder",
    position: [inputFlangeX, INPUT_Y, 0],
    radius: 3.4,
    height: 1.3,
    color: steel,
    texture: "metal",
    textureRepeat: [3, 1],
    rotation: alongX,
    roughness: 0.3,
    metalness: 0.85,
    attachTo: INPUT_CRANK_ID,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    props.push({
      kind: "cylinder",
      position: [inputFlangeX - 1, INPUT_Y + Math.cos(a) * 2.4, Math.sin(a) * 2.4],
      radius: 0.5,
      height: 1.6,
      color: bronze,
      texture: "metal",
      rotation: alongX,
      roughness: 0.3,
      metalness: 0.8,
      attachTo: INPUT_CRANK_ID,
    });
  }
  props.push({
    kind: "box",
    position: [inputFlangeX - 2.2, INPUT_Y + 2, 0],
    size: [2.4, 4, 0.9],
    color: brightSteel,
    texture: "metal",
    roughness: 0.28,
    metalness: 0.86,
    attachTo: INPUT_CRANK_ID,
  });

  // -------------------------------------------------------------------------------------
  // Output flange, on the layshaft past the output wall, turning with whichever wheel the dog
  // collar is engaged in -- here the 2단 wheel, so it runs at -0.6 rad/s. A plain disc on its
  // own axis would look dead, so the bolt lugs and the driver key are what actually show it.
  // -------------------------------------------------------------------------------------
  props.push({
    kind: "cylinder",
    position: [FLANGE_X, LAY_Y, 0],
    radius: 4.2,
    height: 1.4,
    color: steel,
    texture: "metal",
    textureRepeat: [3, 1],
    rotation: alongX,
    roughness: 0.3,
    metalness: 0.85,
    attachTo: FLANGE_ID,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    props.push({
      kind: "cylinder",
      position: [FLANGE_X + 1.2, LAY_Y + Math.cos(a) * FLANGE_BOLT_R, Math.sin(a) * FLANGE_BOLT_R],
      radius: 0.55,
      height: 1.8,
      color: bronze,
      texture: "metal",
      rotation: alongX,
      roughness: 0.3,
      metalness: 0.8,
      attachTo: FLANGE_ID,
    });
  }
  props.push({
    kind: "box",
    position: [FLANGE_X + 2, LAY_Y + 2.3, 0],
    size: [2.6, 4.6, 1],
    color: brightSteel,
    texture: "metal",
    roughness: 0.28,
    metalness: 0.86,
    attachTo: FLANGE_ID,
  });

  return props;
}
