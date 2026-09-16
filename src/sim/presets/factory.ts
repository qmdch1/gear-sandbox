import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";
import { wheelSpokesX } from "./wheels";

/** Builds one gear instance for a preset layout. Mirrors the other preset modules'
 *  self-contained `seedGear` helper exactly (same "freshly placed, caller-supplied stable
 *  id" shape) -- duplicated here rather than imported so each preset module stays a fully
 *  hand-verifiable spec of its own mechanism, the way `windmill.ts` and `hoist.ts` are. */
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

/** Height of the overhead line shaft's centre line. */
export const SHAFT_Y = 32;
/** Height of every work station's spindle centre line. */
export const STATION_Y = 16;
/** X of the engine's crankshaft (the single power source), at the left end of the shop. */
export const ENGINE_X = -52;
/** Y of the engine's crankshaft. */
export const ENGINE_Y = 18;
/** X of the three work stations, and of the three line-shaft pulleys directly above them. */
export const STATION_X = [-24, 0, 24] as const;

/** Crank-pin throw of the engine's crank-slider linkage, in world units. Half the piston
 *  stroke (see `PISTON_ROD_LENGTH`). Must stay smaller than the rod, or the linkage cannot
 *  close -- `createFactoryProps` relies on that and the test asserts it. */
export const PISTON_CRANK_RADIUS = 5;
/** Connecting-rod length of the engine's crank-slider linkage, in world units. */
export const PISTON_ROD_LENGTH = 12;

/** ============================================================================
 *  공장 -- a factory LINE SHAFT: one engine, one overhead shaft, three machines.
 *  ============================================================================
 *
 *  This is the 연동 (interlocking) preset: the point is NOT one clever gear pair, it is
 *  that THREE independent machines all trace their motion back to a SINGLE crank, each
 *  arriving at a different speed and a different direction. That is precisely how a real
 *  pre-electrification mill worked -- one engine, one line shaft under the roof trusses,
 *  and a flat belt dropped from the shaft to every machine on the floor.
 *
 *  Power path (X = along the shop, Y = up, +Z = toward the viewer):
 *
 *      공장_증기기관_크랭크  (crank, axis +Z, the engine)      omega = 1.0
 *        | coincident shaft coupling (1:1)
 *      공장_기관풀리        (pulley, r 12)
 *        | belt  r12 -> r6                                     x2
 *      공장_라인축_A ---- 공장_라인축_B ---- 공장_라인축_C      omega = 2.0  (all three)
 *        |                  |                  |
 *        | belt             | belt             | belt
 *        v                  v                  v
 *      1작업 (연삭기)     2작업 (컨베이어)   3작업 (선반)
 *
 *  ---------------------------------------------------------------------------
 *  Why the line shaft is three pulleys joined by `belt` links
 *  ---------------------------------------------------------------------------
 *  A real line shaft is ONE rigid steel bar with several pulleys keyed along it, so every
 *  pulley on it turns at one speed, in one direction. This sandbox has no "same shaft, but
 *  spaced apart" relation: `evaluatePair` (meshing.ts) only couples two `pulley`s when they
 *  sit at the SAME position (within 0.05 units), and a pulley has no tooth-mesh rule at all.
 *  The one distance-free relation available is a `belt` RemoteLink -- and between two
 *  pulleys of EQUAL pitch radius a belt gives ratio `pitchRadius(a)/pitchRadius(b)` = 6/6
 *  = 1 with sign +1 (`propagateRotation` never negates a belt), which is EXACTLY the
 *  relation a rigid shaft imposes: same speed, same direction. So 라인축_A/B/C are three
 *  equal 12-tooth, module-1 pulleys (pitch radius 6) chained A-B-C by belt links, and the
 *  test asserts all three carry an identical angular velocity on every tick. The visible
 *  steel bar spanning them is a prop (`attachTo` 라인축_B, so it spins with the shaft).
 *
 *  ---------------------------------------------------------------------------
 *  Every centre distance, derived (pitchRadius = module * teeth / 2)
 *  ---------------------------------------------------------------------------
 *  Coincident couplings (distance 0, the `COINCIDENT_ONLY` rule in meshing.ts -- a pulley
 *  or sprocket only ever receives power by sharing a shaft with what drives it):
 *      공장_증기기관_크랭크  @ (-52, 18, 0)  ==  공장_기관풀리        @ (-52, 18, 0)
 *      공장_1작업_풀리       @ (-24, 16, 0)  ==  공장_1작업_구동기어  @ (-24, 16, 0)
 *      공장_2작업_풀리       @ (  0, 16, 0)  ==  공장_2작업_스프로킷  @ (  0, 16, 0)
 *      공장_3작업_풀리       @ ( 24, 16, 0)  ==  공장_3작업_구동기어  @ ( 24, 16, 0)
 *
 *  Real tooth meshes (centre distance MUST equal the sum of the pitch radii, 5% tolerance):
 *      1작업_구동기어 (16 teeth, module 1 -> r 8) + 1작업_숫돌기어 (8 teeth, module 1 -> r 4)
 *          => 8 + 4 = 12.  Placed (-24, 16, 0) -> (-24, 16, 12): distance 12. EXACT.
 *      3작업_구동기어 (12 teeth, module 1 -> r 6) + 3작업_주축기어 (24 teeth, module 1 -> r 12)
 *          => 6 + 12 = 18. Placed ( 24, 16, 0) -> ( 24, 16, -18): distance 18. EXACT.
 *  Both pairs are `spur`s sharing axis [1,0,0], which is what `evaluatePair`'s
 *  parallel-family branch requires (|axis dot| >= 0.98) on top of the distance match.
 *
 *  Distance-free links (belts and chains have NO geometric constraint -- `evaluatePair` is
 *  never consulted for a RemoteLink, `buildEdges` just reads the two gears' radii/teeth):
 *      belt  기관풀리 (r 12) -> 라인축_A (r 6)          ratio 12/6  = 2
 *      belt  라인축_A -> 라인축_B -> 라인축_C (r 6 each) ratio  6/6  = 1   (the shaft itself)
 *      belt  라인축_A (r 6) -> 1작업_풀리 (r 4)          ratio  6/4  = 1.5
 *      belt  라인축_B (r 6) -> 2작업_풀리 (r 8)          ratio  6/8  = 0.75
 *      belt  라인축_C (r 6) -> 3작업_풀리 (r 4)          ratio  6/4  = 1.5
 *      chain 2작업_스프로킷 (12 teeth) -> 2작업_이송스프로킷 (24 teeth)  ratio 12/24 = 0.5
 *  A chain's ratio is TEETH-based and a belt's is RADIUS-based (graph.ts's `buildEdges`) --
 *  checked in the source before writing this preset, not assumed.
 *
 *  The engine's flywheel spins about +Z (it faces the viewer) while the line shaft spins
 *  about +X, so the engine-to-shaft belt is a quarter-turn drive. That is real mill practice
 *  and, more to the point, a `belt` RemoteLink in this sandbox carries no orientation
 *  constraint whatsoever, so nothing is being fudged: the belt's only modelled effect is the
 *  radius ratio above.
 *
 *  ---------------------------------------------------------------------------
 *  The resulting speeds -- the whole point of the preset
 *  ---------------------------------------------------------------------------
 *  With the engine crank commanded at 1.0 rad/s, and remembering that a `coupling`, `belt`
 *  or `chain` edge keeps the sign while a tooth `mesh` FLIPS it (rotation.ts):
 *
 *      공장_증기기관_크랭크        +1.0    the single input
 *      공장_기관풀리               +1.0    coincident, 1:1
 *      공장_라인축_A / _B / _C     +2.0    1.0 x 2          (the shaft, one speed)
 *      공장_1작업_풀리             +3.0    2.0 x 1.5
 *      공장_1작업_구동기어         +3.0    coincident, 1:1
 *      공장_1작업_숫돌기어         -6.0    3.0 x -(16/8)    grinding wheel: fastest, reversed
 *      공장_2작업_풀리             +1.5    2.0 x 0.75
 *      공장_2작업_스프로킷         +1.5    coincident, 1:1
 *      공장_2작업_이송스프로킷     +0.75   1.5 x (12/24)    conveyor: slowest
 *      공장_3작업_풀리             +3.0    2.0 x 1.5
 *      공장_3작업_구동기어         +3.0    coincident, 1:1
 *      공장_3작업_주축기어         -1.5    3.0 x -(12/24)   lathe spindle: slow, reversed
 *
 *  Eight-to-one between the fastest driven member (-6.0) and the slowest (+0.75), every one
 *  of them fed by the SAME crank -- that is the interlocking claim, and every number above
 *  is asserted numerically in tests/sim/presets/factory.test.ts by running the real `tick()`
 *  for hundreds of ticks, not derived on paper and hoped for.
 *
 *  ---------------------------------------------------------------------------
 *  What this preset does NOT claim
 *  ---------------------------------------------------------------------------
 *  Nothing about torque, force, power or "how much a machine can cut" -- this sandbox
 *  models angular velocity and accumulated rotation ONLY. A real line shaft's whole
 *  engineering problem is dividing an engine's power among machines; the only part of that
 *  this file models, and the only part its test verifies, is the SPEED each machine ends up
 *  running at. Likewise the piston is a pure kinematic crank-slider: it says where the
 *  crosshead sits at a given crank angle, never what pushes it.
 *
 *  Nothing here needs `travelLimit` or `reverseAt`: the only member with bounded travel is
 *  the piston, and a crank-slider is bounded BY ITS OWN GEOMETRY (the slider oscillates over
 *  a stroke of 2 x PISTON_CRANK_RADIUS forever, see `crankSliderPose` in sceneSync.ts), so
 *  the engine can run one way indefinitely without anything sailing out of the scene. */
export function createFactoryPreset(): LayoutState {
  const gears: GearInstance[] = [
    // -- The engine: the ONE power source in the whole shop. ------------------------------
    // A `crank` is the only type whose speed is an input rather than a derived output, so
    // the mill engine must be one. Axis +Z: the flywheel faces the viewer, which is also
    // what lets the piston linkage (a prop) reciprocate in the vertical XY plane.
    // 28 teeth, module 1 -> pitch radius 14, a suitably massive flywheel.
    seedGear("공장_증기기관_크랭크", "crank", [ENGINE_X, ENGINE_Y, 0], [0, 0, 1], 28, 1, 1.0),
    // The flat-belt drive pulley keyed onto the same crankshaft: coincident position AND
    // parallel axis, which is exactly the coincident coupling `evaluatePair` grants a
    // `pulley` (its only way to receive power at all). 24 teeth, module 1 -> radius 12.
    seedGear("공장_기관풀리", "pulley", [ENGINE_X, ENGINE_Y, 0], [0, 0, 1], 24, 1),

    // -- The overhead line shaft: three EQUAL pulleys, one per station. -------------------
    // 12 teeth, module 1 -> pitch radius 6 each, so the belt links joining them give ratio
    // 6/6 = 1: the same speed and direction a single rigid shaft would. Spaced 24 apart,
    // directly above each station, 32 - 16 = 16 units above the station spindles.
    seedGear("공장_라인축_A", "pulley", [STATION_X[0], SHAFT_Y, 0], [1, 0, 0], 12, 1),
    seedGear("공장_라인축_B", "pulley", [STATION_X[1], SHAFT_Y, 0], [1, 0, 0], 12, 1),
    seedGear("공장_라인축_C", "pulley", [STATION_X[2], SHAFT_Y, 0], [1, 0, 0], 12, 1),

    // -- Station 1: 연삭기 (grinder). Belt DOWN, then a 2:1 tooth step-up. ----------------
    // Small 8-tooth pulley (r 4) so the belt from the r-6 shaft pulley steps the speed UP
    // (6/4 = 1.5): a grinder wants to run fast.
    seedGear("공장_1작업_풀리", "pulley", [STATION_X[0], STATION_Y, 0], [1, 0, 0], 8, 1),
    // Keyed on the same spindle (coincident) -- 16 teeth, module 1 -> r 8.
    seedGear("공장_1작업_구동기어", "spur", [STATION_X[0], STATION_Y, 0], [1, 0, 0], 16, 1),
    // The grinding wheel's own gear: 8 teeth, module 1 -> r 4. Centre distance must be
    // 8 + 4 = 12, so it sits 12 units toward the viewer along +Z, at the bench's front edge.
    seedGear("공장_1작업_숫돌기어", "spur", [STATION_X[0], STATION_Y, 12], [1, 0, 0], 8, 1),

    // -- Station 2: 이송 컨베이어 (conveyor). Belt DOWN, then a 2:1 chain step-DOWN. ------
    // Big 16-tooth pulley (r 8): 6/8 = 0.75, the shaft's 2.0 becomes 1.5.
    seedGear("공장_2작업_풀리", "pulley", [STATION_X[1], STATION_Y, 0], [1, 0, 0], 16, 1),
    // Chain sprocket keyed on the same spindle: 12 teeth, module 0.6 -> r 3.6.
    seedGear("공장_2작업_스프로킷", "sprocket", [STATION_X[1], STATION_Y, 0], [1, 0, 0], 12, 0.6),
    // The conveyor's head sprocket: 24 teeth, module 0.6 -> r 7.2, so the chain halves the
    // speed again (12/24). A chain link has no distance constraint, so the 18-unit run back
    // to z = -18 is a free layout choice -- it just has to clear the driving spindle's own
    // disc, and 18 > (8 + 7.2) * 0.95 = 14.44 does (that is `isOverlapping`'s threshold).
    seedGear("공장_2작업_이송스프로킷", "sprocket", [STATION_X[1], STATION_Y, -18], [1, 0, 0], 24, 0.6),

    // -- Station 3: 선반 (lathe). Belt DOWN fast, then a 2:1 tooth step-DOWN. -------------
    // Small 8-tooth pulley (r 4): 6/4 = 1.5, so 2.0 becomes 3.0 at the countershaft.
    seedGear("공장_3작업_풀리", "pulley", [STATION_X[2], STATION_Y, 0], [1, 0, 0], 8, 1),
    // Keyed on the same countershaft: 12 teeth, module 1 -> r 6.
    seedGear("공장_3작업_구동기어", "spur", [STATION_X[2], STATION_Y, 0], [1, 0, 0], 12, 1),
    // The lathe's headstock spindle gear: 24 teeth, module 1 -> r 12. Centre distance must
    // be 6 + 12 = 18, so it sits 18 units back along -Z, over the machine bed.
    seedGear("공장_3작업_주축기어", "spur", [STATION_X[2], STATION_Y, -18], [1, 0, 0], 24, 1),
  ];

  return {
    gears,
    remoteLinks: [
      // Engine to shaft: r 12 -> r 6, so the shaft runs at twice engine speed. (Mill engines
      // turned slowly; the shafting overhead ran considerably faster.)
      { a: "공장_기관풀리", b: "공장_라인축_A", kind: "belt" },
      // The line shaft's own continuity, A -> B -> C. Equal radii => ratio exactly 1, sign
      // +1: the three pulleys behave as one rigid bar. See the header note.
      { a: "공장_라인축_A", b: "공장_라인축_B", kind: "belt" },
      { a: "공장_라인축_B", b: "공장_라인축_C", kind: "belt" },
      // The three drop belts -- the interlocking itself: one shaft, three machines.
      { a: "공장_라인축_A", b: "공장_1작업_풀리", kind: "belt" },
      { a: "공장_라인축_B", b: "공장_2작업_풀리", kind: "belt" },
      { a: "공장_라인축_C", b: "공장_3작업_풀리", kind: "belt" },
      // Station 2's conveyor chain, 12 -> 24 teeth: halves the speed again.
      { a: "공장_2작업_스프로킷", b: "공장_2작업_이송스프로킷", kind: "chain" },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// Props: the shop building around the mechanism. Purely visual (see render/props.ts).
// ---------------------------------------------------------------------------------------

const BRICK = 0x9c5a44;
const FLOOR = 0x76716a;
const TIMBER = 0x8a6a3a;
const DARK_TIMBER = 0x5e4426;
const STEEL = 0x9aa0a8;
const IRON = 0x545b63;
const GRINDSTONE = 0x8f8b80;
const BRASS = 0xb08d3f;

/** Building envelope, all in world units. The shop is a single bay: brick end walls and a
 *  brick rear wall, a stone floor, and timber king-post trusses carrying the shaft hangers. */
const SHOP_X: [number, number] = [-70, 42]; // inner faces of the two end walls
const SHOP_Z: [number, number] = [-30, 22]; // rear wall -> open front
const EAVES_Y = 48; // top of the walls == underside line of the tie beams
const RIDGE_Y = 57;
const RIDGE_Z = (SHOP_Z[0] + SHOP_Z[1]) / 2; // -4
const TRUSS_X = [-60, -36, -12, 12, 36]; // five trusses across the bay
const HANGER_X = [-36, -12, 12, 36]; // shaft hangers, one under every truss but the first

/** A straight structural member spanning two points in a single x = const plane (every
 *  truss lives in such a plane). A box's long axis is its local Y, and a rotation of `phi`
 *  about X carries (0,1,0) to (0, cos phi, sin phi) -- so `phi = atan2(dz, dy)` is exactly
 *  the angle that aims the member down its own run from `from` to `to`. */
function member(
  x: number,
  from: [number, number], // [y, z]
  to: [number, number],
  thickness: number,
  color: number,
  texture: Prop["texture"],
): Prop {
  const dy = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dy, dz);
  return {
    kind: "box",
    position: [x, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
    size: [thickness, length, thickness],
    color,
    texture,
    rotation: [Math.atan2(dz, dy), 0, 0],
    roughness: 0.82,
    metalness: 0.06,
  };
}

/** Four legs under a bench/table top of the given footprint. */
function benchLegs(centre: [number, number, number], spanX: number, spanZ: number, topY: number): Prop[] {
  const legs: Prop[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push({
        kind: "box",
        position: [centre[0] + sx * (spanX / 2), topY / 2, centre[2] + sz * (spanZ / 2)],
        size: [1.2, topY, 1.2],
        color: IRON,
        texture: "metal",
        metalness: 0.55,
        roughness: 0.45,
      });
    }
  }
  return legs;
}

/** The factory's body. Every moving part is tied to a real gear id:
 *   - `attachTo` spins the line shaft's collars, each station's wheel, the grindstone, the
 *     conveyor drum, the lathe faceplate and the flywheel with the gear that drives them;
 *   - `linkTo` swings the engine's crank pin, connecting rod and crosshead as a real
 *     crank-slider, so the piston reciprocates over a 2 x PISTON_CRANK_RADIUS = 10 unit
 *     stroke while the crank turns one way forever.
 *  Radially symmetric discs (pulleys, drums, faceplates) get spokes or bars laid across
 *  them, because a bare disc turning about its own axis shows no motion at all. */
export function createFactoryProps(): Prop[] {
  const props: Prop[] = [];

  // --- Shell: floor, rear wall, end walls -----------------------------------------------
  const shopW = SHOP_X[1] - SHOP_X[0]; // 112
  const shopD = SHOP_Z[1] - SHOP_Z[0]; // 52
  const shopCX = (SHOP_X[0] + SHOP_X[1]) / 2; // -14
  const shopCZ = RIDGE_Z; // -4
  props.push(
    // Flagstone floor slab, its top surface exactly at y = 0.
    { kind: "box", position: [shopCX, -0.75, shopCZ], size: [shopW + 3, 1.5, shopD + 3], color: FLOOR, texture: "stone", textureRepeat: [10, 5], roughness: 0.95, metalness: 0.02 },
    // Rear brick wall, outside the shaft line so nothing collides with the belts.
    { kind: "box", position: [shopCX, EAVES_Y / 2, SHOP_Z[0] - 0.75], size: [shopW + 3, EAVES_Y, 1.5], color: BRICK, texture: "brick", textureRepeat: [14, 6], roughness: 0.9, metalness: 0.03 },
    // Two brick end walls (gable ends).
    { kind: "box", position: [SHOP_X[0] - 0.75, EAVES_Y / 2, shopCZ], size: [1.5, EAVES_Y, shopD], color: BRICK, texture: "brick", textureRepeat: [7, 6], roughness: 0.9, metalness: 0.03 },
    { kind: "box", position: [SHOP_X[1] + 0.75, EAVES_Y / 2, shopCZ], size: [1.5, EAVES_Y, shopD], color: BRICK, texture: "brick", textureRepeat: [7, 6], roughness: 0.9, metalness: 0.03 },
  );

  // --- Roof trusses: tie beam + two rafters + a king post, five bays ---------------------
  for (const tx of TRUSS_X) {
    props.push(
      // Tie beam across the full span at eaves level.
      { kind: "box", position: [tx, EAVES_Y, shopCZ], size: [3, 1.8, shopD], color: DARK_TIMBER, texture: "wood", textureRepeat: [1, 8], roughness: 0.85, metalness: 0.04 },
      // Rear and front rafters climbing to the ridge.
      member(tx, [EAVES_Y, SHOP_Z[0]], [RIDGE_Y, RIDGE_Z], 2.2, TIMBER, "wood"),
      member(tx, [EAVES_Y, SHOP_Z[1]], [RIDGE_Y, RIDGE_Z], 2.2, TIMBER, "wood"),
      // King post from the tie beam up to the ridge.
      { kind: "box", position: [tx, (EAVES_Y + RIDGE_Y) / 2, RIDGE_Z], size: [1.6, RIDGE_Y - EAVES_Y, 1.6], color: TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04 },
    );
  }
  // Ridge purlin tying the five trusses together.
  props.push({
    kind: "box",
    position: [(TRUSS_X[0] + TRUSS_X[TRUSS_X.length - 1]) / 2, RIDGE_Y, RIDGE_Z],
    size: [TRUSS_X[TRUSS_X.length - 1] - TRUSS_X[0], 1.4, 1.4],
    color: DARK_TIMBER, texture: "wood", roughness: 0.85, metalness: 0.04,
  });

  // --- Shaft hangers: a drop bracket + a pillow-block bearing under each truss ------------
  // The hanger runs from the underside of the tie beam (EAVES_Y - 0.9) down to the top of
  // the bearing block (SHAFT_Y + 1.7).
  const hangerTop = EAVES_Y - 0.9;
  const hangerBottom = SHAFT_Y + 1.7;
  for (const hx of HANGER_X) {
    props.push(
      { kind: "box", position: [hx, (hangerTop + hangerBottom) / 2, 0], size: [1.4, hangerTop - hangerBottom, 1.4], color: IRON, texture: "metal", metalness: 0.6, roughness: 0.4 },
      { kind: "box", position: [hx, SHAFT_Y, 0], size: [3, 3.4, 3.4], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.6 },
    );
  }

  // --- The line shaft itself -------------------------------------------------------------
  // One steel bar spanning all four hangers. It is centred ON 라인축_B's own centre and lies
  // ALONG that pulley's rotation axis, so `attachTo` spins it about its own long axis in
  // place -- which is right, but invisible on a plain cylinder, hence the collars below.
  props.push({
    kind: "cylinder",
    position: [STATION_X[1], SHAFT_Y, 0],
    radius: 1.1,
    height: 80,
    color: STEEL,
    texture: "metal",
    textureRepeat: [8, 1],
    rotation: [0, 0, Math.PI / 2], // a cylinder's long axis is Y; turn it onto X
    metalness: 0.72,
    roughness: 0.3,
    attachTo: "공장_라인축_B",
    radialSegments: 16,
  });
  // Four keyed collar bars per shaft pulley. These orbit their pulley's centre about the
  // shaft axis, so the shaft's rotation actually reads.
  const shaftPulleyIds = ["공장_라인축_A", "공장_라인축_B", "공장_라인축_C"] as const;
  shaftPulleyIds.forEach((id, i) => {
    props.push(
      ...wheelSpokesX({
        attachTo: id,
        center: [STATION_X[i], SHAFT_Y, 0],
        radius: 5,
        count: 4,
        thickness: 0.7,
        color: BRASS,
      }),
    );
  });

  // --- The engine (left end): bed, frame, cylinder, flywheel, crank-slider ---------------
  // Bed blocks either side of the flywheel, leaving the flywheel a clear pit between them.
  for (const sz of [-1, 1]) {
    props.push({ kind: "box", position: [ENGINE_X, 1.5, sz * 7], size: [22, 3, 5], color: FLOOR, texture: "stone", roughness: 0.94, metalness: 0.02 });
  }
  // Two frame columns rising past the flywheel to carry the cylinder. At z = +/-7 they clear
  // the flywheel's own disc, which lies in the z ~ 0 plane.
  const entablatureY = 37;
  for (const sz of [-1, 1]) {
    props.push({ kind: "box", position: [ENGINE_X, (3 + entablatureY - 1) / 2, sz * 7], size: [2.6, entablatureY - 1 - 3, 2.6], color: IRON, texture: "metal", metalness: 0.6, roughness: 0.45 });
  }
  props.push(
    // Entablature the cylinder is bolted to. `crankSliderPose` puts the crosshead's CENTRE at
    // most crankRadius + rodLength = 5 + 12 = 17 above the crank, i.e. y = ENGINE_Y + 17 = 35
    // (not the 18/36 this comment used to give -- 18 is not a quantity of this linkage). The
    // crosshead box is 2.6 tall, so its top face reaches 36.3 while the entablature's underside
    // is at 36: at top dead centre it passes 0.3 units into the entablature rather than sitting
    // just under it. Three millimetres at this scale, and left as drawn -- but recorded here
    // rather than described as a clearance that does not exist.
    { kind: "box", position: [ENGINE_X, entablatureY, 0], size: [14, 2, 18], color: IRON, texture: "metal", metalness: 0.6, roughness: 0.45 },
    // The steam cylinder, standing on the entablature.
    { kind: "cylinder", position: [ENGINE_X, entablatureY + 4.5, 0], radius: 4.2, height: 7, color: IRON, texture: "rust", metalness: 0.55, roughness: 0.6, radialSegments: 24 },
    // Valve chest bolted to the cylinder's side.
    { kind: "box", position: [ENGINE_X + 6, entablatureY + 4.5, 0], size: [3.2, 6, 4], color: BRASS, texture: "metal", metalness: 0.7, roughness: 0.35 },
  );
  // Flywheel: a heavy rim plus six spokes, both spinning with the crank. A rim alone is
  // rotationally symmetric and would look frozen; the spokes are what make it read as turning.
  props.push({
    kind: "ring",
    position: [ENGINE_X, ENGINE_Y, 0],
    radius: 15,
    tube: 1.3,
    color: IRON,
    texture: "rust",
    metalness: 0.5,
    roughness: 0.6,
    attachTo: "공장_증기기관_크랭크",
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // A box's long axis is local X here (size[0] is the length), and a rotation of `a` about
    // Z carries (1,0,0) to (cos a, sin a, 0) -- the flywheel's own plane. Anchor each spoke
    // at its own midpoint, half a radius out from the hub.
    props.push({
      kind: "box",
      position: [ENGINE_X + Math.cos(a) * 7.5, ENGINE_Y + Math.sin(a) * 7.5, 0],
      size: [15, 1.3, 1.1],
      color: IRON,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.55,
      roughness: 0.45,
      attachTo: "공장_증기기관_크랭크",
    });
  }
  // The crank-slider: pin on the flywheel, rigid rod, crosshead sliding straight up the
  // engine frame. `slideAxis` [0,1,0] is perpendicular to the crank's own [0,0,1] axis, as
  // the linkage requires, and PISTON_ROD_LENGTH (12) > PISTON_CRANK_RADIUS (5) so the
  // linkage always closes.
  const linkage = {
    gear: "공장_증기기관_크랭크",
    crankRadius: PISTON_CRANK_RADIUS,
    rodLength: PISTON_ROD_LENGTH,
    slideAxis: [0, 1, 0] as [number, number, number],
  };
  props.push(
    { kind: "cylinder", position: [ENGINE_X + PISTON_CRANK_RADIUS, ENGINE_Y, 0], radius: 1.5, height: 3, color: BRASS, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.75, roughness: 0.3, linkTo: { ...linkage, role: "pin" } },
    // The rod's authored length MUST equal rodLength, and its long axis MUST be local Y --
    // sceneSync re-poses it by mapping local +Y onto the pin->slider direction each frame.
    { kind: "box", position: [ENGINE_X, ENGINE_Y + PISTON_ROD_LENGTH / 2, 0], size: [1.5, PISTON_ROD_LENGTH, 1.5], color: STEEL, texture: "metal", metalness: 0.75, roughness: 0.28, linkTo: { ...linkage, role: "rod" } },
    { kind: "box", position: [ENGINE_X, ENGINE_Y + PISTON_ROD_LENGTH, 0], size: [5, 2.6, 5], color: STEEL, texture: "metal", metalness: 0.7, roughness: 0.32, linkTo: { ...linkage, role: "slider" } },
  );

  // --- Station 1: 연삭기 (grinder) --------------------------------------------------------
  const s1x = STATION_X[0];
  props.push(
    // Cast pedestal under the spindle. Its top stops at y = 8, exactly where the r-8 driving
    // gear's disc begins (STATION_Y - 8).
    { kind: "box", position: [s1x, 4, 0], size: [7, 8, 7], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.62 },
    // Timber workbench under the grinding wheel (which reaches down to y = 16 - 5 = 11).
    { kind: "box", position: [s1x, 8.7, 12], size: [18, 1.4, 12], color: TIMBER, texture: "wood", textureRepeat: [4, 3], roughness: 0.85, metalness: 0.04 },
    // The grindstone on the wheel gear's own spindle: a real stone disc, spinning with it.
    { kind: "cylinder", position: [s1x, STATION_Y, 12], radius: 5, height: 1.8, color: GRINDSTONE, texture: "stone", rotation: [0, 0, Math.PI / 2], metalness: 0.05, roughness: 0.95, radialSegments: 24, attachTo: "공장_1작업_숫돌기어" },
    // Tool rest in front of the stone.
    { kind: "box", position: [s1x, 10.5, 16.5], size: [8, 0.8, 3], color: STEEL, texture: "metal", metalness: 0.6, roughness: 0.4 },
  );
  props.push(...benchLegs([s1x, 0, 12], 15, 9, 8));
  props.push(...wheelSpokesX({ attachTo: "공장_1작업_풀리", center: [s1x, STATION_Y, 0], radius: 4, count: 4, thickness: 0.6, color: BRASS }));
  props.push(...wheelSpokesX({ attachTo: "공장_1작업_숫돌기어", center: [s1x, STATION_Y, 12], radius: 5.4, count: 5, thickness: 0.6, color: STEEL }));

  // --- Station 2: 이송 컨베이어 (conveyor) ------------------------------------------------
  const s2x = STATION_X[1];
  props.push(
    // Pedestal under the driving spindle, again topping out at y = 8 under the r-8 pulley.
    { kind: "box", position: [s2x, 4, 0], size: [7, 8, 7], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.62 },
    // Conveyor deck running back from the head sprocket toward the rear wall. Kept clear of
    // the head sprocket's disc, whose underside is at 16 - 7.2 = 8.8.
    { kind: "box", position: [s2x, 7, -19], size: [15, 1.2, 22], color: TIMBER, texture: "wood", textureRepeat: [3, 5], roughness: 0.85, metalness: 0.04 },
    // Canvas belt lying on the deck.
    { kind: "box", position: [s2x, 7.85, -19], size: [12, 0.4, 21], color: 0xd8cfba, texture: "fabric", textureRepeat: [3, 6], roughness: 0.9, metalness: 0.02 },
    // The conveyor's head drum, turning with its sprocket.
    { kind: "cylinder", position: [s2x, STATION_Y, -18], radius: 6.4, height: 11, color: STEEL, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.6, roughness: 0.42, radialSegments: 20, attachTo: "공장_2작업_이송스프로킷" },
  );
  props.push(...benchLegs([s2x, 0, -19], 12, 18, 7));
  props.push(...wheelSpokesX({ attachTo: "공장_2작업_풀리", center: [s2x, STATION_Y, 0], radius: 7.4, count: 4, thickness: 0.7, color: BRASS }));
  // Paddles across the drum's face: without them the drum is a smooth cylinder about its own
  // axis and its rotation would be invisible.
  props.push(...wheelSpokesX({ attachTo: "공장_2작업_이송스프로킷", center: [s2x, STATION_Y, -18], radius: 6.8, count: 5, thickness: 0.9, color: IRON }));

  // --- Station 3: 선반 (lathe) ------------------------------------------------------------
  const s3x = STATION_X[2];
  props.push(
    // Countershaft pedestal. The r-6 gears reach down to y = 10, so this stops there.
    { kind: "box", position: [s3x, 5, 0], size: [6, 10, 6], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.62 },
    // Cast machine bed under the headstock. The r-12 spindle gear's underside is at y = 4,
    // so a 3-high bed on the floor clears it.
    { kind: "box", position: [s3x, 1.5, -18], size: [20, 3, 17], color: IRON, texture: "rust", metalness: 0.5, roughness: 0.65 },
    // Headstock and tailstock housings flanking the spindle gear (which is a thin disc in
    // the x = 24 plane, so both housings sit clear of it).
    { kind: "box", position: [s3x - 8, 8, -18], size: [3.5, 13, 6], color: IRON, texture: "metal", metalness: 0.55, roughness: 0.5 },
    { kind: "box", position: [s3x + 8, 8, -18], size: [3.5, 13, 6], color: IRON, texture: "metal", metalness: 0.55, roughness: 0.5 },
    // Faceplate on the spindle, turning with it.
    { kind: "cylinder", position: [s3x, STATION_Y, -18], radius: 11, height: 1.6, color: STEEL, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.68, roughness: 0.34, radialSegments: 28, attachTo: "공장_3작업_주축기어" },
    // The workpiece held in the faceplate, spinning with the spindle.
    { kind: "cylinder", position: [s3x + 5, STATION_Y, -18], radius: 2.4, height: 9, color: BRASS, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.75, roughness: 0.3, radialSegments: 20, attachTo: "공장_3작업_주축기어" },
  );
  props.push(...wheelSpokesX({ attachTo: "공장_3작업_풀리", center: [s3x, STATION_Y, 0], radius: 4, count: 4, thickness: 0.6, color: BRASS }));
  // Driving dogs across the faceplate, so its rotation reads.
  props.push(...wheelSpokesX({ attachTo: "공장_3작업_주축기어", center: [s3x, STATION_Y, -18], radius: 10.5, count: 5, thickness: 0.8, color: IRON }));

  return props;
}
