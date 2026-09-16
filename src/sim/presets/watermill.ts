import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Mirrors the other preset modules'
 *  self-contained `seedGear` helper exactly (same "freshly placed, caller-supplied stable
 *  id" shape) -- duplicated here rather than imported so each preset module stays a fully
 *  hand-verifiable spec of its own mechanism, the same way `windmill.ts` and `hoist.ts` are. */
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

// ---------------------------------------------------------------------------------------
// Every dimension below is derived, not guessed. The three numbers that fix the whole
// machine are the two tooth counts and the shared module; everything else follows.
// ---------------------------------------------------------------------------------------

/** Tooth size shared by both toothed members, so `pitchRadius = module * teeth / 2`
 *  reduces to `teeth / 2` throughout. */
export const MILL_MODULE = 1;

/** The paddle wheel's tooth count. pitchRadius = 1 * 36 / 2 = 18 -- a big, slow,
 *  overshot-sized wheel (36 world units across the pitch circle, 38 across the tooth tips,
 *  since `gearGeometry.ts` uses addendum = 1 x module). */
export const WHEEL_TEETH = 36;

/** The wallower's tooth count -- the small right-angle gear at the foot of the upright
 *  shaft. pitchRadius = 1 * 12 / 2 = 6. */
export const WALLOWER_TEETH = 12;

/** pitchRadius(수차) = MILL_MODULE * WHEEL_TEETH / 2 = 1 * 36 / 2 = 18. */
export const WHEEL_PITCH_RADIUS = (MILL_MODULE * WHEEL_TEETH) / 2;

/** pitchRadius(수직축) = MILL_MODULE * WALLOWER_TEETH / 2 = 1 * 12 / 2 = 6. */
export const WALLOWER_PITCH_RADIUS = (MILL_MODULE * WALLOWER_TEETH) / 2;

/** The ONLY centre distance at which `evaluatePair` will hand back a mesh edge for this
 *  pair: pitchRadius(a) + pitchRadius(b) = 18 + 6 = 24 (meshing.ts allows +/-5%, but this
 *  layout hits it exactly, so there is no tolerance being leaned on). */
export const MESH_DISTANCE = WHEEL_PITCH_RADIUS + WALLOWER_PITCH_RADIUS;

/** teeth(수차) / teeth(수직축) = 36 / 12 = 3. `buildEdges` stores this as the mesh edge's
 *  `ratio` (a = the wheel, since it comes first in the `gears` array), and
 *  `propagateRotation` applies `sign = -1` to every tooth mesh, so the upright shaft turns
 *  at exactly -3x the wheel's angular velocity: three times as fast, the other way round. */
export const STEP_UP_RATIO = WHEEL_TEETH / WALLOWER_TEETH;

/** The wheel's commanded input speed, rad/s. 0.5 rad/s is about 4.8 rpm -- a real overshot
 *  wheel's pace -- and is exactly representable in binary floating point, so
 *  `0.5 * 3 === 1.5` holds to the last bit and the ratio test can assert equality rather
 *  than a tolerance. */
export const WHEEL_SPEED = 0.5;

/** World Y of the ground the mill stands on (the scene's own ground plane sits at y = 0,
 *  so the whole machine is authored standing on it rather than floating or buried). */
const GROUND_Y = 0;

/** The wheel's axle height. The wheel's tooth tips reach WHEEL_PITCH_RADIUS + MILL_MODULE
 *  = 19 below the axle, so an axle at y = 20 leaves the rim 1 unit clear of the ground and
 *  just dipping into the tail race water, which is where an overshot wheel's rim runs. */
const AXLE_Y = 20;

/** X of the upright shaft: the wheel is centred on x = 0, and the wallower must sit exactly
 *  MESH_DISTANCE = 24 away. Placing it on the wheel's own horizontal (same y, same z) makes
 *  the centre-to-centre vector purely +X, so the distance is 24 by inspection AND the two
 *  pitch circles touch at exactly one point, (18, 20, 0) -- the wheel's 3-o'clock rim
 *  position. A vertical or z-offset placement would satisfy `evaluatePair` just as well but
 *  would leave the two gears visibly not touching, so this one is chosen deliberately. */
const SHAFT_X = MESH_DISTANCE;

export const WHEEL_ID = "물레방아_수차";
export const SHAFT_ID = "물레방아_수직축";
export const STONE_ID = "물레방아_맷돌";

/** How many paddle boards ring the wheel. A bare disc is rotationally symmetric and shows
 *  no motion at all, so the wheel's whole readability comes from these sweeping past. */
const PADDLE_COUNT = 16;

/** A water mill. The verifiable mechanism is a paddle water wheel (the crank -- here the
 *  falling water from the flume is the input that turns it) driving, through a RIGHT-ANGLE
 *  mesh, the upright shaft that carries the millstones.
 *
 *  Layout (front view, X = left/right, Y = up, +Z = toward the viewer):
 *
 *      물레방아_수차   crank, [0, 20, 0], axis [0,0,1]  -- the paddle wheel, disc in the XY
 *                      plane so its paddles sweep across the viewer's field of view
 *          |
 *          |  tooth mesh at the two pitch circles' single point of contact, (18, 20, 0)
 *          v
 *      물레방아_수직축 bevel, [24, 20, 0], axis [0,1,0] -- the wallower at the foot of the
 *                      upright shaft, spinning about the vertical
 *          |
 *          |  coincident shaft coupling, 1:1
 *          v
 *      물레방아_맷돌   load,  [24, 20, 0], axis [0,1,0] -- the millstones the shaft carries
 *
 *  GEOMETRY, derived rather than guessed:
 *
 *    pitchRadius(수차)   = module * teeth / 2 = 1 * 36 / 2 = 18
 *    pitchRadius(수직축) = module * teeth / 2 = 1 * 12 / 2 = 6
 *    required centre distance = 18 + 6 = 24
 *    actual centre distance   = |[24,20,0] - [0,20,0]| = 24        -> exact, 0% error
 *    axis dot = [0,0,1] . [0,1,0] = 0                              -> perpendicular
 *
 *  `evaluatePair`'s bevel branch (meshing.ts step 5) wants |axisDot| <= 0.1 and the centre
 *  distance within 5% of the pitch sum; both hold with room to spare, so this is a genuine
 *  tooth mesh, not a coincidence of tolerance. A crank driving a bevel at a right angle is
 *  the same construction `windmill.ts` uses: `crank` is the only type whose speed is an
 *  external INPUT, and a `bevel` on the far side is what makes the pair satisfy the
 *  perpendicular-mesh rule.
 *
 *  물레방아_맷돌 is a `load` sitting EXACTLY on the wallower ([24,20,0], axis [0,1,0], zero
 *  separation). `load` is one of `evaluatePair`'s COINCIDENT_ONLY types: it has no tooth-mesh
 *  rule of its own and receives rotation only by sharing a shaft, which is exactly what the
 *  millstones do -- they are the mill's load, hung on the upright shaft. That coupling edge
 *  carries `sign = +1` and `ratio = 1`, so the stones turn at the wallower's speed exactly.
 *
 *  SPEED CLAIM (the only claim this preset makes, and the one the test verifies numerically):
 *
 *    omega(수직축) = -STEP_UP_RATIO * omega(수차) = -3 * 0.5 = -1.5 rad/s
 *    omega(맷돌)   = omega(수직축)               =      -1.5 rad/s
 *
 *  A water mill is a step-UP drive: the wheel is huge and slow, the stones need to run fast,
 *  and 36:12 buys exactly 3x. The sandbox models torque and inertia, but this mill does not
 *  use them: its wheel carries no `motor`, so its speed is given rather than solved for, and
 *  there is no water pushing it, no grinding resistance and no meal. Nothing in this file claims
 *  otherwise. The sign flip is not decorative either: a tooth
 *  mesh reverses, so the stones run opposite-handed to the wheel.
 *
 *  Nothing here needs `reverseAt` or `travelLimit`: a water wheel genuinely does run one way
 *  forever, and every moving member is rotational, so nothing accumulates linear travel that
 *  could sail out of the scene.
 *
 *  NON-OVERLAP, also arithmetic:
 *
 *    수차 <-> 수직축 : `evaluatePair` returns a mesh edge, and `isOverlapping` returns false
 *                     for any pair that already has a valid edge.
 *    수직축 <-> 맷돌 : likewise, via the coupling edge.
 *    수차 <-> 맷돌   : no edge (the load is 24 away, far past the 0.05 coupling tolerance),
 *                     so the distance rule applies: overlapRadius(수차) = 18,
 *                     overlapRadius(맷돌) = module * 2 = 2 (a zero-teeth load has no pitch
 *                     circle, so `overlapRadius` falls back to its rendered cylinder), sum
 *                     20, and 24 >= 20 * 0.95 = 19. Clear. */
export function createWatermillPreset(): LayoutState {
  const gears: GearInstance[] = [
    // The paddle wheel. A CRANK, because a crank is the one gear type whose angular
    // velocity is an external input -- here standing in for the head of water the flume
    // pours onto the buckets. Axis +Z puts its disc in the XY plane, so the paddles sweep
    // sideways across the view instead of edge-on.
    seedGear(WHEEL_ID, "crank", [0, AXLE_Y, 0], [0, 0, 1], WHEEL_TEETH, MILL_MODULE, WHEEL_SPEED),
    // The wallower: the small gear at the foot of the upright shaft, axis +Y. Placed on the
    // wheel's own horizontal at x = MESH_DISTANCE = 24 so the pitch circles touch at
    // (18, 20, 0) exactly.
    seedGear(SHAFT_ID, "bevel", [SHAFT_X, AXLE_Y, 0], [0, 1, 0], WALLOWER_TEETH, MILL_MODULE),
    // The millstones, as the load riding the upright shaft: coincident with the wallower,
    // same axis, so `evaluatePair`'s COINCIDENT_ONLY branch resolves it as a 1:1 coupling.
    seedGear(STONE_ID, "load", [SHAFT_X, AXLE_Y, 0], [0, 1, 0], 0, MILL_MODULE),
  ];

  return { gears, remoteLinks: [] };
}

/** The mill's body -- purely visual props (see `render/props.ts`), no simulation.
 *
 *  Three things actually MOVE, all via `attachTo`, which re-poses a prop every frame by
 *  rotating it about its gear's axis, around that gear's centre, by the gear's accumulated
 *  rotation:
 *
 *    - the wooden wheel: 16 paddle boards, 16 bucket soles, 8 spokes, its rims, hub and axle
 *      all follow 물레방아_수차, so the wheel reads as turning rather than sitting there;
 *    - the runner millstone, its eight furrow ribs and the iron rynd across its eye follow
 *      물레방아_맷돌 (a stone disc on its own is rotationally symmetric -- the ribs are what
 *      make the spin visible);
 *    - the upright shaft and its keyed collar follow 물레방아_맷돌 too. A useful property of
 *      `attachTo` here: it spins a prop about the gear's AXIS LINE, so anything placed
 *      anywhere along x = 24, z = 0 spins truly in place, whatever its height. That is what
 *      lets the stones sit well above the wallower and still turn correctly with it.
 *
 *  The bedstone, the mill house, the flume and the sluice gate are deliberately static --
 *  a real bedstone does not turn, and neither does a building.
 *
 *  The house is authored open on its +Z side (back wall, both end walls, corner posts and
 *  roof, but no near wall) so the wallower and the stones stay visible; a closed box would
 *  hide the very mechanism the preset exists to show.
 *
 *  Every prop carries a `texture`: wood for the wheel, flume and framing, stone for the
 *  masonry, house and millstones, tile for the roof slates, metal and rust for the ironwork,
 *  fabric for the meal sacks. The water surfaces borrow the "metal" pattern -- it is fine
 *  horizontal streaking, which on a blue-green colour reads as ripples running downstream. */
export function createWatermillProps(): Prop[] {
  const oak = 0x9a7548;         // fresh sawn timber: wheel, flume, framing
  const darkTimber = 0x5f4327;  // weathered timber: rims, beams, ridge
  const stoneWall = 0x8f8577;   // the mill house's masonry
  const darkStone = 0x6f675c;   // kerbs, piers, footings
  const millGrey = 0xb0aca3;    // the millstones themselves
  const iron = 0x70757c;        // straps, rynd, gate hardware
  const rustIron = 0x8a6047;    // hoops and bands that have seen weather
  const slate = 0x5a5f66;       // roof
  const water = 0x5f95b4;       // flume, jet and tail race
  const sackCloth = 0xc8bb98;   // meal sacks

  const props: Prop[] = [];

  // ---------------------------------------------------------------------------------
  // 1. Ground and tail race. The slab spans the whole machine, x from -36 to 54.
  // ---------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [9, GROUND_Y - 1, 0],
    size: [90, 2, 30], // top face lands exactly on GROUND_Y = 0
    color: darkStone, texture: "stone", textureRepeat: [12, 4],
    roughness: 0.95, metalness: 0.02,
  });
  // Tail race kerbs, one either side of the wheel's plane. The wheel's timber is 5.2 wide
  // in Z (z from -2.6 to 2.6), so kerbs at z = +/-5.6 stand well clear of it.
  for (const z of [-5.6, 5.6]) {
    props.push({
      kind: "box",
      position: [4, GROUND_Y + 0.9, z],
      size: [34, 1.8, 1.6],
      color: darkStone, texture: "stone", textureRepeat: [8, 1],
      roughness: 0.92, metalness: 0.03,
    });
  }
  // The tail water between them. Its surface sits at y = 1.4; the wheel's tooth tips reach
  // y = AXLE_Y - (18 + 1) = 1, so the rim dips 0.4 into the race -- which is exactly how
  // far an overshot wheel's rim runs in its own tail water.
  props.push({
    kind: "box",
    position: [4, GROUND_Y + 0.7, 0],
    size: [34, 1.4, 9.6],
    color: water, texture: "metal", textureRepeat: [10, 1],
    roughness: 0.18, metalness: 0.25, opacity: 0.72,
  });

  // ---------------------------------------------------------------------------------
  // 2. The axle bearing piers. The axle runs along Z (the wheel's axis), so the piers
  //    stand either side of the wheel in Z, at z = +/-7.2 -- clear of both the wheel's
  //    timber (|z| <= 2.6) and the kerbs (|z| <= 6.4).
  // ---------------------------------------------------------------------------------
  for (const z of [-7.2, 7.2]) {
    props.push({
      kind: "box",
      position: [0, GROUND_Y + 9, z],
      size: [4.5, 18, 3.6], // ground (0) up to y = 18
      color: stoneWall, texture: "stone", textureRepeat: [2, 5],
      roughness: 0.93, metalness: 0.03,
    });
    props.push({
      kind: "box",
      position: [0, AXLE_Y - 1, z],
      size: [3.6, 2, 3.6], // the bearing block, y 18 -> 20, capping the pier at axle height
      color: darkTimber, texture: "wood",
      roughness: 0.8, metalness: 0.06,
    });
  }

  // ---------------------------------------------------------------------------------
  // 3. The paddle wheel itself. EVERYTHING in this block is attachTo WHEEL_ID.
  //    Radii used: hub 2.4, inner shroud 12.6, rim 17.4 (just inside the pitch circle
  //    at 18, so the timber never pokes through the rendered tooth tips at 19).
  // ---------------------------------------------------------------------------------
  const RIM_R = 17.4;
  const SHROUD_R = 12.6;
  const WHEEL_HALF_WIDTH = 2.6;

  // Axle: a CylinderGeometry's long axis is local Y, so rotating +90 deg about X lays it
  // along world Z -- the wheel's own axis.
  props.push({
    kind: "cylinder",
    position: [0, AXLE_Y, 0], radius: 1.2, height: 16,
    rotation: [Math.PI / 2, 0, 0],
    color: darkTimber, texture: "wood", textureRepeat: [2, 4],
    roughness: 0.78, metalness: 0.06,
    attachTo: WHEEL_ID,
  });
  // Hub boss, same trick.
  props.push({
    kind: "cylinder",
    position: [0, AXLE_Y, 0], radius: 2.4, height: 6.4,
    rotation: [Math.PI / 2, 0, 0],
    color: oak, texture: "wood", textureRepeat: [3, 2],
    roughness: 0.8, metalness: 0.05,
    attachTo: WHEEL_ID,
  });
  // Two iron hoops shrunk onto the hub. A TorusGeometry lies in its local XY plane with its
  // hole along local Z, which is already the wheel's axis -- no rotation needed.
  for (const z of [-3.0, 3.0]) {
    props.push({
      kind: "ring",
      position: [0, AXLE_Y, z], radius: 2.7, tube: 0.35,
      color: rustIron, texture: "rust", textureRepeat: [6, 1],
      roughness: 0.72, metalness: 0.45,
      attachTo: WHEEL_ID,
    });
  }
  // Outer rims and inner shrouds, one pair each side of the wheel's width.
  for (const z of [-2.3, 2.3]) {
    props.push({
      kind: "ring",
      position: [0, AXLE_Y, z], radius: RIM_R, tube: 0.7,
      color: darkTimber, texture: "wood", textureRepeat: [16, 1],
      roughness: 0.82, metalness: 0.05,
      attachTo: WHEEL_ID,
    });
    props.push({
      kind: "ring",
      position: [0, AXLE_Y, z], radius: SHROUD_R, tube: 0.5,
      color: oak, texture: "wood", textureRepeat: [12, 1],
      roughness: 0.82, metalness: 0.05,
      attachTo: WHEEL_ID,
    });
  }
  // Eight spokes, hub to rim, lying in the wheel's XY plane. A box's long side is its local
  // X, and `rotation: [0, 0, a]` maps local X onto (cos a, sin a, 0) -- so a spoke of length
  // RIM_R centred at radius RIM_R / 2 spans the hub-to-rim run exactly. (Same authoring
  // convention as windmill.ts's sail spars.)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [Math.cos(a) * (RIM_R / 2), AXLE_Y + Math.sin(a) * (RIM_R / 2), 0],
      size: [RIM_R, 1.0, 1.0],
      rotation: [0, 0, a],
      color: oak, texture: "wood", textureRepeat: [6, 1],
      roughness: 0.8, metalness: 0.05,
      attachTo: WHEEL_ID,
    });
  }
  // The paddles/buckets: the whole reason the wheel's rotation is legible. Each bay gets a
  // radial face board plus a tangential sole board, so the pair reads as a bucket that
  // scoops, carries and spills the flume's water as it comes round.
  for (let i = 0; i < PADDLE_COUNT; i++) {
    const a = (i / PADDLE_COUNT) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Face board: local X (5.4) radial, spanning radius 12.3 -> 17.7, i.e. shroud to rim;
    // local Y (0.7) is the board's thickness, tangential; local Z (5.2) is the wheel's width.
    props.push({
      kind: "box",
      position: [cos * 15.0, AXLE_Y + sin * 15.0, 0],
      size: [5.4, 0.7, WHEEL_HALF_WIDTH * 2],
      rotation: [0, 0, a],
      color: oak, texture: "wood", textureRepeat: [2, 2],
      roughness: 0.85, metalness: 0.04,
      attachTo: WHEEL_ID,
    });
    // Sole board, closing the bottom of the bucket: same rotation, but now the long side is
    // local Y (3.6), which `rotation: [0,0,a]` maps onto (-sin a, cos a, 0) -- tangential.
    // Its centre is pushed 1.8 round the rim from the face board so the two form an L.
    props.push({
      kind: "box",
      position: [cos * 12.7 - sin * 1.8, AXLE_Y + sin * 12.7 + cos * 1.8, 0],
      size: [0.8, 3.6, WHEEL_HALF_WIDTH * 2],
      rotation: [0, 0, a],
      color: darkTimber, texture: "wood", textureRepeat: [1, 2],
      roughness: 0.85, metalness: 0.04,
      attachTo: WHEEL_ID,
    });
  }

  // ---------------------------------------------------------------------------------
  // 4. Flume / launder and sluice gate (static). The wheel's tooth tips reach
  //    AXLE_Y + 19 = 39, so the trough's underside is set at 39.7 to pass just over the
  //    crown and spill onto the buckets coming up the far side.
  // ---------------------------------------------------------------------------------
  const TROUGH_Y = 40.1; // box centre; with a 0.8 thickness the floor spans 39.7 -> 40.5
  props.push({
    kind: "box",
    position: [-18.5, TROUGH_Y, 0],
    size: [27, 0.8, 6], // x from -32 to -5
    color: oak, texture: "wood", textureRepeat: [10, 2],
    roughness: 0.84, metalness: 0.04,
  });
  for (const z of [-2.9, 2.9]) {
    props.push({
      kind: "box",
      position: [-18.5, TROUGH_Y + 1.3, z],
      size: [27, 2.4, 0.6],
      color: oak, texture: "wood", textureRepeat: [10, 1],
      roughness: 0.84, metalness: 0.04,
    });
  }
  // The head of water running down the launder.
  props.push({
    kind: "box",
    position: [-18.5, TROUGH_Y + 0.8, 0],
    size: [26, 0.7, 4.6],
    color: water, texture: "metal", textureRepeat: [12, 1],
    roughness: 0.16, metalness: 0.3, opacity: 0.75,
  });
  // The jet leaving the lip at x = -5 and falling onto the crown of the wheel.
  props.push({
    kind: "box",
    position: [-4.0, 39.6, 0],
    size: [2.4, 3.4, 4.4],
    rotation: [0, 0, -0.35],
    color: water, texture: "metal", textureRepeat: [2, 3],
    roughness: 0.16, metalness: 0.3, opacity: 0.7,
  });
  // Masonry abutment carrying the launder. It occupies x from -30 to -20, which is clear of
  // the wheel entirely (the wheel's tooth tips never pass x = -19).
  props.push({
    kind: "box",
    position: [-25, GROUND_Y + 18, 0],
    size: [10, 36, 8], // ground up to y = 36
    color: stoneWall, texture: "stone", textureRepeat: [3, 9],
    roughness: 0.94, metalness: 0.02,
  });
  // Short posts from the abutment's top (36) up to the trough's underside (39.7).
  for (const x of [-29, -21]) {
    props.push({
      kind: "box",
      position: [x, 37.85, 0],
      size: [1.4, 3.7, 4.0],
      color: darkTimber, texture: "wood",
      roughness: 0.8, metalness: 0.05,
    });
  }
  // Raking braces carrying the cantilevered end of the launder: from the abutment's top
  // corner (-20, 36.5) out to the trough at (-11, 39.6). dx = 9, dy = 3.1, so the brace is
  // hypot(9, 3.1) = 9.52 long and lies at atan2(3.1, 9) = 0.332 rad above horizontal.
  for (const z of [-2.2, 2.2]) {
    props.push({
      kind: "box",
      position: [-15.5, 38.05, z],
      size: [9.52, 0.9, 1.2],
      rotation: [0, 0, 0.332],
      color: darkTimber, texture: "wood", textureRepeat: [4, 1],
      roughness: 0.82, metalness: 0.05,
    });
  }
  // The sluice gate at the head of the launder -- the board that shuts the water off.
  props.push({
    kind: "box",
    position: [-31, 42.2, 0],
    size: [0.7, 4.6, 5.4], // y from 39.9 to 44.5, i.e. standing in the trough's mouth
    color: darkTimber, texture: "wood", textureRepeat: [1, 3],
    roughness: 0.8, metalness: 0.06,
  });
  for (const z of [-2.9, 2.9]) {
    props.push({
      kind: "box",
      position: [-31, 42.2, z],
      size: [1.4, 4.6, 0.5], // the iron guides the gate board slides in
      color: iron, texture: "metal",
      roughness: 0.42, metalness: 0.62,
    });
  }

  // ---------------------------------------------------------------------------------
  // 5. The mill house (static). x from 20 to 50, z from -12 to 12, walls 30 tall.
  //    The left (wheel-side) wall is built in two pieces with an opening between
  //    y = 13 and y = 24, because the wallower's disc occupies x 18 -> 30 at y = 20 --
  //    a solid wall there would run straight through the gearing. A real mill has
  //    exactly this opening where the wheel race enters the building.
  // ---------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [20.6, GROUND_Y + 6.5, 0],
    size: [1.2, 13, 24], // ground -> 13
    color: stoneWall, texture: "stone", textureRepeat: [4, 3],
    roughness: 0.94, metalness: 0.02,
  });
  props.push({
    kind: "box",
    position: [20.6, 27, 0],
    size: [1.2, 6, 24], // 24 -> 30
    color: stoneWall, texture: "stone", textureRepeat: [4, 2],
    roughness: 0.94, metalness: 0.02,
  });
  props.push({
    kind: "box",
    position: [35, 15, -11.4],
    size: [29, 30, 1.2], // back wall
    color: stoneWall, texture: "stone", textureRepeat: [6, 6],
    roughness: 0.94, metalness: 0.02,
  });
  props.push({
    kind: "box",
    position: [49.4, 15, 0],
    size: [1.2, 30, 24], // far end wall
    color: stoneWall, texture: "stone", textureRepeat: [4, 6],
    roughness: 0.94, metalness: 0.02,
  });
  // Corner posts and head beam standing in for the open near side.
  for (const x of [21, 49]) {
    props.push({
      kind: "box",
      position: [x, 15, 11.4],
      size: [1.6, 30, 1.6],
      color: darkTimber, texture: "wood", textureRepeat: [1, 8],
      roughness: 0.8, metalness: 0.05,
    });
  }
  props.push({
    kind: "box",
    position: [35, 29.2, 11.4],
    size: [30, 1.6, 1.6],
    color: darkTimber, texture: "wood", textureRepeat: [8, 1],
    roughness: 0.8, metalness: 0.05,
  });
  // The stone floor the millstones stand on: top face at y = 18, i.e. 1.5 below the
  // wallower, so the gearing sits proud of it the way a real wallower does.
  props.push({
    kind: "box",
    position: [35, 17.4, 0],
    size: [28, 1.2, 22],
    color: darkStone, texture: "tile", textureRepeat: [6, 5],
    roughness: 0.88, metalness: 0.05,
  });
  // Gabled roof. Eaves at y = 30 on z = +/-12, ridge at y = 35 on z = 0: rise 5 over run 12,
  // so the pitch is atan(5 / 12) = 0.39479 rad and each slope is hypot(12, 5) = 13 long
  // (authored 13.4 so the panels overhang the eaves slightly). Rotating a panel about X by
  // +theta drops its +Z edge, which is what the +Z slope needs; the -Z slope takes -theta.
  const ROOF_PITCH = Math.atan2(5, 12);
  for (const sign of [-1, 1]) {
    props.push({
      kind: "box",
      position: [35, 32.5, sign * 6],
      size: [30, 0.8, 13.4],
      rotation: [sign * ROOF_PITCH, 0, 0],
      color: slate, texture: "tile", textureRepeat: [10, 5],
      roughness: 0.7, metalness: 0.12,
    });
  }
  props.push({
    kind: "box",
    position: [35, 35.2, 0],
    size: [30, 0.9, 1.8],
    color: darkTimber, texture: "wood", textureRepeat: [10, 1],
    roughness: 0.8, metalness: 0.05,
  });

  // ---------------------------------------------------------------------------------
  // 6. Upright shaft, millstones and hopper. The shaft's line is x = 24, z = 0 -- the
  //    wallower's own axis -- so every prop on it that carries `attachTo: STONE_ID`
  //    spins truly in place, at whatever height it sits.
  // ---------------------------------------------------------------------------------
  // Footstep bearing under the shaft: two stone piers and the bridge tree they carry.
  for (const z of [-3.6, 3.6]) {
    props.push({
      kind: "box",
      position: [SHAFT_X, GROUND_Y + 4.5, z],
      size: [2.4, 9, 2.4],
      color: darkStone, texture: "stone", textureRepeat: [1, 3],
      roughness: 0.93, metalness: 0.03,
    });
  }
  props.push({
    kind: "box",
    position: [SHAFT_X, 9.7, 0],
    size: [4.5, 1.4, 10],
    color: darkTimber, texture: "wood", textureRepeat: [1, 4],
    roughness: 0.8, metalness: 0.05,
  });
  // The shaft: y from 10 (the bridge tree) up to 31 (the ceiling brace).
  props.push({
    kind: "cylinder",
    position: [SHAFT_X, 20.5, 0], radius: 1.0, height: 21,
    color: oak, texture: "wood", textureRepeat: [3, 8],
    roughness: 0.8, metalness: 0.05,
    attachTo: STONE_ID,
  });
  // Iron band and its protruding key, high on the shaft. A plain cylinder is symmetric about
  // its own axis and would look motionless however fast it spins; the key breaks that.
  props.push({
    kind: "ring",
    position: [SHAFT_X, 29.5, 0], radius: 1.3, tube: 0.25,
    rotation: [Math.PI / 2, 0, 0], // torus hole lies along local Z; +90 deg about X aims it up +Y
    color: rustIron, texture: "rust", textureRepeat: [6, 1],
    roughness: 0.7, metalness: 0.5,
    attachTo: STONE_ID,
  });
  props.push({
    kind: "box",
    position: [SHAFT_X + 1.2, 29.5, 0],
    size: [2.4, 0.6, 0.6],
    color: iron, texture: "metal",
    roughness: 0.42, metalness: 0.62,
    attachTo: STONE_ID,
  });
  // Ceiling brace the shaft's top runs in, spanning the house front to back.
  props.push({
    kind: "box",
    position: [SHAFT_X, 31.4, 0],
    size: [3, 1.2, 22],
    color: darkTimber, texture: "wood", textureRepeat: [1, 8],
    roughness: 0.8, metalness: 0.05,
  });

  // The stones. Radius 4.5 is bounded from above by the wheel: the stones' near edge sits at
  // x = SHAFT_X - 4.5 = 19.5, and the wheel's tooth tips never pass x = 19, so the two never
  // foul each other. (That is the same 4:1 stone-to-wheel proportion a real mill has.)
  const STONE_R = 4.5;
  // Bedstone: STATIC. A real bedstone is fixed; only the runner above it turns.
  props.push({
    kind: "cylinder",
    position: [SHAFT_X, 21.6, 0], radius: STONE_R, height: 1.8, radialSegments: 32,
    color: millGrey, texture: "stone", textureRepeat: [3, 1],
    roughness: 0.95, metalness: 0.02,
  });
  // Runner stone: turns with the shaft.
  props.push({
    kind: "cylinder",
    position: [SHAFT_X, 23.6, 0], radius: STONE_R, height: 2.0, radialSegments: 32,
    color: millGrey, texture: "stone", textureRepeat: [3, 1],
    roughness: 0.95, metalness: 0.02,
    attachTo: STONE_ID,
  });
  // Eight furrow ribs dressed into the runner's top face. Without these the runner is a
  // featureless disc turning about its own centre and shows no motion whatsoever. These lie
  // in the XZ plane, so the placement convention is the mirror of the wheel's: position at
  // (cos a, ., sin a) with `rotation: [0, -a, 0]`, since a rotation of -a about +Y maps a
  // box's local X onto (cos a, 0, sin a).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [SHAFT_X + Math.cos(a) * 2.6, 24.75, Math.sin(a) * 2.6],
      size: [3.6, 0.3, 0.55],
      rotation: [0, -a, 0],
      color: darkStone, texture: "stone", textureRepeat: [2, 1],
      roughness: 0.92, metalness: 0.04,
      attachTo: STONE_ID,
    });
  }
  // The iron rynd bridging the runner's eye -- two crossed bars, also turning.
  props.push({
    kind: "box",
    position: [SHAFT_X, 25.1, 0], size: [8.6, 0.5, 0.9],
    color: iron, texture: "metal", textureRepeat: [4, 1],
    roughness: 0.4, metalness: 0.66,
    attachTo: STONE_ID,
  });
  props.push({
    kind: "box",
    position: [SHAFT_X, 25.1, 0], size: [8.6, 0.5, 0.9],
    rotation: [0, Math.PI / 2, 0],
    color: iron, texture: "metal", textureRepeat: [4, 1],
    roughness: 0.4, metalness: 0.66,
    attachTo: STONE_ID,
  });
  // Grain hopper above the eye (static). A ConeGeometry's apex points +Y, so a half turn
  // about X stands it on its point, over the stone's eye.
  props.push({
    kind: "cone",
    position: [SHAFT_X, 28.6, 0], radius: 3.2, height: 4.4, radialSegments: 4,
    rotation: [Math.PI, 0, 0],
    color: oak, texture: "wood", textureRepeat: [2, 2],
    roughness: 0.82, metalness: 0.04,
  });
  // Its frame: two legs standing on the stone floor at z = +/-5.6, outside the stones'
  // 4.5 radius, plus the cross beam they carry.
  for (const z of [-5.6, 5.6]) {
    props.push({
      kind: "box",
      position: [SHAFT_X, 23.6, z],
      size: [0.6, 11.2, 0.6], // floor top (18) up to 29.2
      color: darkTimber, texture: "wood", textureRepeat: [1, 6],
      roughness: 0.8, metalness: 0.05,
    });
  }
  props.push({
    kind: "box",
    position: [SHAFT_X, 29.4, 0],
    size: [1.6, 0.6, 12],
    color: darkTimber, texture: "wood", textureRepeat: [1, 5],
    roughness: 0.8, metalness: 0.05,
  });
  // The shoe that feeds grain from the hopper into the eye.
  props.push({
    kind: "box",
    position: [SHAFT_X, 25.9, 1.4],
    size: [1.4, 1.6, 2.6],
    rotation: [0.4, 0, 0],
    color: oak, texture: "wood",
    roughness: 0.82, metalness: 0.04,
  });

  // ---------------------------------------------------------------------------------
  // 7. Meal bin and sacks on the stone floor (static dressing, but the fabric and timber
  //    are what make the floor read as a working one).
  // ---------------------------------------------------------------------------------
  props.push({
    kind: "box",
    position: [33, 19.9, 5],
    size: [5, 3.8, 5], // sitting on the floor's top face at y = 18
    color: oak, texture: "wood", textureRepeat: [2, 2],
    roughness: 0.84, metalness: 0.04,
  });
  for (const x of [40, 44.5]) {
    props.push({
      kind: "box",
      position: [x, 19.6, -4],
      size: [3, 3.2, 3],
      color: sackCloth, texture: "fabric", textureRepeat: [2, 2],
      roughness: 0.92, metalness: 0.02,
    });
  }

  return props;
}
