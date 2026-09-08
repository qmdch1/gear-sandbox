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

// ---------------------------------------------------------------------------------------
// Dimensions. Every position below is DERIVED from these, never eyeballed.
// ---------------------------------------------------------------------------------------

/** Tooth size shared by every gear on the crank line, so all five are interchangeable
 *  16-tooth wheels and every chain ratio below is exactly 1. */
export const ENGINE_MODULE = 0.75;
export const ENGINE_TEETH = 16;
/** pitchRadius = module * teeth / 2 = 0.75 * 16 / 2 = 6. */
export const ENGINE_PITCH_RADIUS = (ENGINE_MODULE * ENGINE_TEETH) / 2; // 6

/** Centre-to-centre spacing of neighbouring crank-line wheels (the engine's bore pitch).
 *
 *  This is the one hard geometric constraint in the layout. Two 6-radius wheels that are
 *  NOT a legal pair count as overlapping (meshing.ts `isOverlapping`) once they get closer
 *  than `(6 + 6) * (1 - MESH_TOLERANCE) = 12 * 0.95 = 11.4`, and they must ALSO stay far
 *  enough apart that `evaluatePair` never mistakes them for a tooth mesh (which would want
 *  exactly 12 +/- 5%, i.e. 11.4 .. 12.6). 14 clears both windows with room to spare, and is
 *  wide enough for a 3.9-radius piston plus a block wall between neighbouring bores. */
export const BORE_PITCH = 14;

/** The four bore centrelines, symmetric about x = 0: BORE_PITCH * (i - 1.5) for i = 0..3
 *  => -21, -7, +7, +21. Each cylinder's piston slides along the vertical line through its
 *  own crankpin wheel, so the bore x IS that wheel's x -- see `createPistonEngineProps`. */
export const BORE_X: readonly number[] = [0, 1, 2, 3].map((i) => BORE_PITCH * (i - 1.5));

/** The crankshaft's drive end, where the hand crank and the flywheel live. Set back
 *  40 units from the block centre so the 9.5-radius flywheel disc (reaching x = -30.5)
 *  clears both the first crankpin wheel (centred -21, pitch radius 6, so its disc reaches
 *  x = -27) and the block's end wall (x = -28 .. -26). A chain link has no distance
 *  constraint at all in `graph.ts`, so this longer 19-unit reach is a free layout choice --
 *  exactly like a real engine's front timing chain being longer than the journal pitch. */
export const CRANK_X = -40;

/** Throw radius of every crankpin: the offset of the pin from its wheel's centre.
 *  4 < ENGINE_PITCH_RADIUS (6), so the pin stays inside the disc it rides on. */
export const CRANK_PIN_RADIUS = 4;

/** Connecting-rod length, pin centre to piston centre. MUST exceed CRANK_PIN_RADIUS or
 *  the linkage cannot close (see `crankSliderPose`'s discriminant); 13 > 4. */
export const ROD_LENGTH = 13;

/** Stroke = 2 * throw radius = 8: the piston centre sweeps between
 *  ROD_LENGTH - CRANK_PIN_RADIUS = 9 (bottom dead centre) and
 *  ROD_LENGTH + CRANK_PIN_RADIUS = 17 (top dead centre), measured up from the crank line.
 *  These come straight out of the crank-slider solution -- see the doc comment below. */
export const PISTON_BDC_Y = ROD_LENGTH - CRANK_PIN_RADIUS; // 9
export const PISTON_TDC_Y = ROD_LENGTH + CRANK_PIN_RADIUS; // 17
export const PISTON_STROKE = PISTON_TDC_Y - PISTON_BDC_Y; // 8

/** Commanded crankshaft speed, rad/s. An arbitrary, easy-to-eyeball input -- the numbers
 *  this preset exists to demonstrate are the ones DERIVED from it (every crankpin turning
 *  at exactly this speed, and the resulting piston stroke), not the input itself. */
export const CRANK_SPEED = 1.2;

/** Crank-throw phase of each cylinder, in radians, in bore order (1, 2, 3, 4).
 *
 *  A real inline-four crankshaft is a flat-plane crank: throws 1 and 4 point one way and
 *  throws 2 and 3 point the opposite way, so the outer pair is at top dead centre exactly
 *  when the inner pair is at bottom dead centre. Setting each wheel's INITIAL `rotation`
 *  reproduces that, and the offsets survive indefinitely: every edge in this layout is a
 *  `coupling` or a `chain`, and `simulation.ts` only ever applies a tooth-phase correction
 *  to `kind === "mesh"` edges. So each wheel's rotation is simply `phase + speed * t`
 *  forever, and the 180-degree relationship holds exactly (verified in the test). */
export const CYLINDER_PHASES: readonly number[] = [0, Math.PI, Math.PI, 0];

export const CRANK_ID = "피스톤엔진_크랭크축";
export const FLYWHEEL_ID = "피스톤엔진_플라이휠";
/** Crankpin wheel ids in bore order, one per cylinder. */
export const CRANKPIN_IDS: readonly string[] = [
  "피스톤엔진_1번크랭크핀",
  "피스톤엔진_2번크랭크핀",
  "피스톤엔진_3번크랭크핀",
  "피스톤엔진_4번크랭크핀",
];

/** An inline-four piston engine, cut away down one side so the running gear is visible.
 *
 *  WHAT THE MACHINE IS
 *  -------------------
 *  Front view: X runs along the block (four bores at x = -21, -7, +7, +21), Y is up, +Z is
 *  toward the viewer. Every wheel on the crank line lies flat in the XY plane with axis
 *  [0,0,1], so all four crank throws and all four pistons work in the plane facing you --
 *  the whole point of a cutaway.
 *
 *      피스톤엔진_크랭크축   (crank,    x = -40)  hand crank -- the one power INPUT
 *        `-- coincident coupling --> 피스톤엔진_플라이휠 (sprocket, x = -40)
 *              `-- chain --> 1번크랭크핀 (x = -21)
 *                    `-- chain --> 2번크랭크핀 (x = -7)
 *                          `-- chain --> 3번크랭크핀 (x = +7)
 *                                `-- chain --> 4번크랭크핀 (x = +21)
 *
 *  WHY THE CRANKSHAFT IS FIVE WHEELS AND NOT ONE
 *  ---------------------------------------------
 *  A real engine has ONE crankshaft carrying four throws spaced along its length. This
 *  sandbox has no shaft primitive, and -- this is the load-bearing detail, checked against
 *  `crankSliderPose` in `render/sceneSync.ts` before this file was written -- a `linkTo`
 *  prop is placed ENTIRELY from the gear it names: the slider is solved as
 *  `gearCentre + slideAxis * s`, so its authored position is discarded. Four pistons all
 *  naming one crank gear would therefore be drawn stacked on that single gear's centreline,
 *  not spread along a block. Each cylinder consequently needs its own wheel AT ITS OWN BORE.
 *
 *  Tying those wheels together with a chain is not a fudge, it is the honest way to say
 *  "one shaft" in this model's vocabulary: a `chain` remote link is distance-free
 *  (`graph.ts` gives it `ratio = a.teeth / b.teeth` and `rotation.ts` gives every chain edge
 *  `sign = +1`), so five identical 16-tooth wheels on one chain all turn at EXACTLY the same
 *  speed in EXACTLY the same direction -- which is precisely the kinematics of four throws
 *  on one crankshaft. The chain ribbons the renderer draws between the wheel centres read as
 *  the engine's timing chain running the length of the crankcase.
 *
 *  THE CRANK-SLIDER, DERIVED
 *  -------------------------
 *  For a wheel with axis [0,0,1], `crankSliderPose`'s `planeBasis` yields u = +X, v = +Y
 *  (seed [1,0,0] is already perpendicular to the axis; v = axis x u = +Y). So a pin at
 *  throw radius R and wheel rotation t sits at `centre + (R cos t, R sin t, 0)`. With the
 *  slide axis a = [0,1,0] and rod length L, the solver's outer root
 *
 *      s = (w . a) + sqrt((w . a)^2 - |w|^2 + L^2),   w = pin - centre
 *
 *  reduces to
 *
 *      s(t) = R sin t + sqrt(L^2 - R^2 cos^2 t)
 *
 *  and the piston sits at `(boreX, s(t), 0)` -- the bore centreline is the wheel's own
 *  centreline, which is why bore x and wheel x are the same number. With R = 4, L = 13:
 *  s is largest at t = pi/2 (s = 4 + 13 = 17, top dead centre) and smallest at t = 3pi/2
 *  (s = -4 + 13 = 9, bottom dead centre), a stroke of exactly 2R = 8.
 *
 *  BOUNDEDNESS
 *  -----------
 *  Nothing here needs `reverseAt` or `travelLimit`. Those exist for members whose travel
 *  ACCUMULATES -- a rack's `linearPosition`, a rope winding onto a drum. A crank-slider's
 *  output is a bounded periodic function of rotation (`s(t)` above never leaves [9, 17] for
 *  any t), so the crank turns forever, as an engine should, while every piston stays inside
 *  its own bore. The test samples the real solver over many revolutions and asserts that.
 *
 *  WHAT THIS PRESET DOES **NOT** CLAIM
 *  -----------------------------------
 *  This sandbox models angular velocity and rotation only. Nothing here is combustion,
 *  torque, power or "capacity": the flywheel is a spinning prop, not an energy store, and
 *  the four cylinders do not add anything up. The honest, test-verified claims are exactly
 *  two: (1) all five crank-line wheels turn at the same speed and direction as the hand
 *  crank -- ratio 1, no reversal anywhere; (2) each piston reciprocates over a stroke of
 *  exactly 8 world units, with cylinders 2 and 3 exactly half a revolution behind 1 and 4. */
export function createPistonEnginePreset(): LayoutState {
  const gears: GearInstance[] = [
    // The one power input. A `crank` is the only gear type whose speed is commanded rather
    // than derived; here it stands for the starting handle on the nose of the crankshaft.
    seedGear(CRANK_ID, "crank", [CRANK_X, 0, 0], [0, 0, 1], ENGINE_TEETH, ENGINE_MODULE, CRANK_SPEED),
    // The flywheel, bolted to the same shaft nose: coincident position + parallel axis makes
    // this a 1:1 `coupling` in `evaluatePair` (`sprocket` is one of its COINCIDENT_ONLY
    // types, which can ONLY take power this way before a chain carries it on) -- the same
    // crank-coincident-with-sprocket pattern `bicycle.ts` uses for its pedals and chainring.
    seedGear(FLYWHEEL_ID, "sprocket", [CRANK_X, 0, 0], [0, 0, 1], ENGINE_TEETH, ENGINE_MODULE),
    // The four crankpin wheels, one per bore, evenly spaced along the crank line at y = 0.
    ...CRANKPIN_IDS.map((id, i) =>
      seedGear(id, "sprocket", [BORE_X[i], 0, 0], [0, 0, 1], ENGINE_TEETH, ENGINE_MODULE),
    ),
  ];

  // Flat-plane crank timing. Seeding `rotation` (rather than leaving every wheel at 0) is
  // what puts cylinders 2 and 3 half a turn behind 1 and 4; see CYLINDER_PHASES on why the
  // offsets are preserved exactly for the whole run.
  for (let i = 0; i < CRANKPIN_IDS.length; i++) {
    gears[2 + i].rotation = CYLINDER_PHASES[i];
  }

  return {
    gears,
    // One chain down the crankcase: flywheel -> pin 1 -> pin 2 -> pin 3 -> pin 4. Each link
    // is 16:16, so `buildEdges` gives every one of them ratio exactly 1.
    remoteLinks: [
      { a: FLYWHEEL_ID, b: CRANKPIN_IDS[0], kind: "chain" },
      { a: CRANKPIN_IDS[0], b: CRANKPIN_IDS[1], kind: "chain" },
      { a: CRANKPIN_IDS[1], b: CRANKPIN_IDS[2], kind: "chain" },
      { a: CRANKPIN_IDS[2], b: CRANKPIN_IDS[3], kind: "chain" },
    ],
  };
}

/** Rest pose of one cylinder's linkage at its own crank phase -- the same arithmetic the
 *  doc comment derives, evaluated once per cylinder so the authored prop positions are the
 *  real solution at t = phase rather than a guess. (`SceneSync` overwrites the position of
 *  every `linkTo` prop each frame anyway; authoring the true rest pose just means the very
 *  first drawn frame, before any tick, is already correct.) */
function restPose(boreX: number, phase: number): {
  pin: [number, number, number];
  piston: [number, number, number];
  rodMid: [number, number, number];
  rodTilt: number;
} {
  const pinX = boreX + CRANK_PIN_RADIUS * Math.cos(phase);
  const pinY = CRANK_PIN_RADIUS * Math.sin(phase);
  const s = pinY + Math.sqrt(ROD_LENGTH * ROD_LENGTH - CRANK_PIN_RADIUS * CRANK_PIN_RADIUS * Math.cos(phase) ** 2);
  // A cylinder prop's long axis is local +Y; rotating about Z by -atan2(dx, dy) points it
  // along (dx, dy) -- the same convention `hoist.ts` uses for its rope run.
  const dx = boreX - pinX;
  const dy = s - pinY;
  return {
    pin: [pinX, pinY, 0],
    piston: [boreX, s, 0],
    rodMid: [(pinX + boreX) / 2, (pinY + s) / 2, 0],
    rodTilt: -Math.atan2(dx, dy),
  };
}

/** The engine's body -- purely visual props (see `render/props.ts`), no simulation.
 *
 *  Cut away on the +Z side: there is a crankcase floor, a back wall behind the crank line,
 *  five block webs standing between and outside the bores, a head deck and a rocker cover,
 *  but deliberately NO front face -- so the four pistons, rods and crank throws are visible
 *  running inside the block.
 *
 *  What actually moves (this preset is nothing without it):
 *    - four pistons, `linkTo` role "slider": each reciprocates along its own bore;
 *    - four connecting rods, role "rod": re-spanned pin -> piston every frame, so they swing;
 *    - four crankpin bosses, role "pin": each orbits its wheel's centre on the throw circle;
 *    - the flywheel's spokes, rim and bolts, `attachTo` the crank -- a bare flywheel disc is
 *      rotationally symmetric and would show no motion at all, so the spin is carried by
 *      three cross bars and six rim bolts instead.
 *
 *  Materials: `metal` on everything machined (block, head, pistons, rods, flywheel) and
 *  `rust` on the fasteners, the sump and the crank throws -- the parts of a stripped engine
 *  that are actually corroded. */
export function createPistonEngineProps(): Prop[] {
  const blockCol = 0x6f757e; // grey cast iron
  const headCol = 0x828993; // machined head deck
  const coverCol = 0x59606a; // rocker cover
  const sumpCol = 0x4b5057; // oil pan
  const boltCol = 0x8a5a37; // rusted fasteners
  const pistonCol = 0xc9ced6; // aluminium pistons
  const rodCol = 0xa7adb6; // steel rods
  const wheelCol = 0x5d636c; // flywheel

  // Block extents, all derived from the bores. Outer bores sit at +/-21, so an end wall
  // centred at +/-27 (2 thick => faces at +/-26 and +/-28) leaves 26 - (21 + 3.9) = 1.1 of
  // clearance to the outer pistons. Inner webs sit halfway between neighbouring bores.
  const END_WALL_X = 27;
  const WEB_X = [-END_WALL_X, -BORE_PITCH, 0, BORE_PITCH, END_WALL_X]; // -27, -14, 0, 14, 27
  const BLOCK_SPAN = END_WALL_X * 2 + 2; // 56, outer face to outer face
  const DECK_Y = 22; // top of the block: piston crown at TDC reaches 17 + 2.5 = 19.5, so 2.5 clear
  const BLOCK_Z = -1; // block centred slightly behind the crank plane, open toward +Z

  const props: Prop[] = [
    // Crankcase floor, under the crank line (wheels reach y = -6).
    {
      kind: "box", position: [0, -10, BLOCK_Z], size: [BLOCK_SPAN, 2, 13],
      color: blockCol, texture: "metal", textureRepeat: [8, 1], metalness: 0.55, roughness: 0.5,
    },
    // Back wall of the crankcase, behind the wheels -- the cutaway's remaining side.
    {
      kind: "box", position: [0, -2, -7], size: [BLOCK_SPAN, 16, 1.5],
      color: blockCol, texture: "metal", textureRepeat: [8, 2], metalness: 0.5, roughness: 0.55,
    },
    // Head deck, closing the tops of all four bores.
    {
      kind: "box", position: [0, DECK_Y, BLOCK_Z], size: [BLOCK_SPAN, 2.5, 13],
      color: headCol, texture: "metal", textureRepeat: [8, 1], metalness: 0.6, roughness: 0.42,
    },
    // Rocker cover on top of the deck.
    {
      kind: "box", position: [0, DECK_Y + 2.8, BLOCK_Z], size: [BLOCK_SPAN - 6, 3, 9],
      color: coverCol, texture: "metal", textureRepeat: [6, 1], metalness: 0.5, roughness: 0.5,
    },
    // Oil pan slung under the crankcase.
    {
      kind: "box", position: [0, -13.5, BLOCK_Z], size: [BLOCK_SPAN - 12, 5, 9],
      color: sumpCol, texture: "rust", textureRepeat: [6, 1], metalness: 0.35, roughness: 0.75,
    },
  ];

  // Block webs: the walls the bores are cut through. Each spans from just above the wheels
  // (y = 6.5) up to the deck underside (y = 20.75), i.e. height 14.25 centred at 13.6.
  for (const x of WEB_X) {
    props.push({
      kind: "box", position: [x, 13.6, BLOCK_Z], size: [2, 14.25, 12],
      color: blockCol, texture: "metal", textureRepeat: [1, 3], metalness: 0.55, roughness: 0.5,
    });
  }

  // Head bolts standing on the deck, front and back rows, one pair per web. Rust, because
  // fasteners are the first thing to go on a stripped engine.
  for (const x of WEB_X) {
    for (const z of [BLOCK_Z + 5.2, BLOCK_Z - 5.2]) {
      props.push({
        kind: "cylinder", position: [x, DECK_Y + 1.9, z], radius: 0.62, height: 1.6, radialSegments: 10,
        color: boltCol, texture: "rust", textureRepeat: [1, 1], metalness: 0.45, roughness: 0.8,
      });
    }
  }

  // Two engine mounting feet on the crankcase flanks.
  for (const x of [-END_WALL_X + 5, END_WALL_X - 5]) {
    props.push({
      kind: "box", position: [x, -11.6, BLOCK_Z], size: [8, 1.6, 15],
      color: boltCol, texture: "rust", textureRepeat: [2, 2], metalness: 0.4, roughness: 0.8,
    });
  }

  // ------------------------------------------------------------------------------------
  // Flywheel, on the crank's nose at x = -40. Everything here `attachTo`s the crank gear,
  // so SceneSync spins it about the crank's own axis around the crank's own centre; that
  // only reads as motion because of the cross bars and the rim bolts -- the disc alone is
  // symmetric about the spin axis and would look frozen.
  // ------------------------------------------------------------------------------------
  const FLYWHEEL_R = 9.5;
  const FLYWHEEL_Z = -3; // set back so the crank's own handle stays visible in front of it
  props.push({
    // Disc. A cylinder's axis is local +Y, so rotating pi/2 about X lays it along Z, facing
    // the viewer like the wheels it is bolted to.
    kind: "cylinder", position: [CRANK_X, 0, FLYWHEEL_Z], radius: FLYWHEEL_R, height: 2.4, radialSegments: 32,
    rotation: [Math.PI / 2, 0, 0],
    color: wheelCol, texture: "metal", textureRepeat: [4, 4], metalness: 0.65, roughness: 0.4,
    attachTo: CRANK_ID,
  });
  props.push({
    // Heavy rim. A torus already lies in the XY plane with its axis along +Z, which is this
    // wheel's axis, so it needs no rotation.
    kind: "ring", position: [CRANK_X, 0, FLYWHEEL_Z], radius: FLYWHEEL_R, tube: 1.2,
    color: wheelCol, texture: "metal", textureRepeat: [12, 1], metalness: 0.7, roughness: 0.35,
    attachTo: CRANK_ID,
  });
  // Three full-diameter cross bars at 0, 60 and 120 degrees => six visible spokes. A box's
  // long axis is local X, and rotating about Z by `a` points it along (cos a, sin a, 0).
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    props.push({
      kind: "box", position: [CRANK_X, 0, FLYWHEEL_Z + 1.4], size: [FLYWHEEL_R * 2 - 2, 1.7, 1.4],
      rotation: [0, 0, a],
      color: headCol, texture: "metal", textureRepeat: [4, 1], metalness: 0.6, roughness: 0.4,
      attachTo: CRANK_ID,
    });
  }
  // Six rim bolts on the throw circle of the flywheel -- they orbit the hub as it turns,
  // which is exactly what bolts on a real flywheel do.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    props.push({
      kind: "cylinder",
      position: [CRANK_X + Math.cos(a) * (FLYWHEEL_R - 2.6), Math.sin(a) * (FLYWHEEL_R - 2.6), FLYWHEEL_Z + 2],
      radius: 0.6, height: 1.4, radialSegments: 10,
      rotation: [Math.PI / 2, 0, 0],
      color: boltCol, texture: "rust", textureRepeat: [1, 1], metalness: 0.45, roughness: 0.8,
      attachTo: CRANK_ID,
    });
  }

  // ------------------------------------------------------------------------------------
  // The four cylinders. Each names ITS OWN crankpin wheel -- see the doc comment on why one
  // shared gear cannot work -- with identical throw radius, rod length and slide axis, so
  // the only thing that distinguishes them is the wheel they ride and its seeded phase.
  // ------------------------------------------------------------------------------------
  for (let i = 0; i < BORE_X.length; i++) {
    const boreX = BORE_X[i];
    const gear = CRANKPIN_IDS[i];
    const rest = restPose(boreX, CYLINDER_PHASES[i]);
    const link = {
      gear,
      crankRadius: CRANK_PIN_RADIUS,
      rodLength: ROD_LENGTH,
      slideAxis: [0, 1, 0] as [number, number, number],
    };

    // Piston. Its local +Y is already vertical, matching the slide axis, and a "slider" keeps
    // its authored orientation -- so no rotation is needed or wanted here.
    props.push({
      kind: "cylinder", position: rest.piston, radius: 3.9, height: 5, radialSegments: 24,
      color: pistonCol, texture: "metal", textureRepeat: [4, 1], metalness: 0.75, roughness: 0.3,
      linkTo: { ...link, role: "slider" },
    });
    // A piston ring around the crown, riding with the piston. A torus lies in XY; rotating
    // pi/2 about X stands it in the XZ plane, i.e. horizontally around a vertical piston.
    props.push({
      kind: "ring", position: rest.piston, radius: 3.95, tube: 0.32,
      rotation: [Math.PI / 2, 0, 0],
      color: rodCol, texture: "metal", textureRepeat: [10, 1], metalness: 0.8, roughness: 0.28,
      linkTo: { ...link, role: "slider" },
    });
    // Connecting rod. Its authored height MUST equal rodLength: SceneSync re-poses the rod to
    // span pin -> piston and maps its local +Y onto that span, but never rescales it.
    props.push({
      kind: "cylinder", position: rest.rodMid, radius: 0.9, height: ROD_LENGTH, radialSegments: 12,
      rotation: [0, 0, rest.rodTilt],
      color: rodCol, texture: "metal", textureRepeat: [2, 4], metalness: 0.7, roughness: 0.35,
      linkTo: { ...link, role: "rod" },
    });
    // The crankpin boss the rod's big end wraps -- laid along Z like the wheel it rides.
    props.push({
      kind: "cylinder", position: rest.pin, radius: 1.6, height: 3.4, radialSegments: 14,
      rotation: [Math.PI / 2, 0, 0],
      color: boltCol, texture: "rust", textureRepeat: [2, 1], metalness: 0.5, roughness: 0.7,
      linkTo: { ...link, role: "pin" },
    });
    // Spark plug sunk into the head above this bore (static -- it is part of the head).
    props.push({
      kind: "cylinder", position: [boreX, DECK_Y + 2.2, BLOCK_Z], radius: 0.75, height: 2.6, radialSegments: 12,
      color: boltCol, texture: "rust", textureRepeat: [1, 1], metalness: 0.45, roughness: 0.75,
    });
  }

  return props;
}
