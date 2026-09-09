import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `clock.ts` uses. */
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

export const DRIVE_ID = "시계탑_구동륜";
export const MINUTE_ID = "시계탑_분침휠";
export const IDLER_ID = "시계탑_아이들러";
export const HOUR_ID = "시계탑_시침휠";

/** ONE module for the whole going train, and it is not decorative bookkeeping: two gears can
 *  only mesh if their teeth are the same SIZE, and module IS tooth size (circular pitch =
 *  pi * module; `render/gearGeometry.ts` draws real involute teeth with addendum = 1*module,
 *  dedendum = 1.25*module). `evaluatePair` never checks it -- it only asks whether the centres
 *  sit pitchRadius(a) + pitchRadius(b) apart -- so a preset that mixes modules across a mesh
 *  gets a perfectly happy sim edge and a rendered pair whose teeth are visibly different sizes
 *  and could not engage on any real shaft. Every meshing wheel here therefore shares
 *  TOWER_MODULE, and tests/sim/presets/clocktower.test.ts asserts it for every mesh edge the
 *  real `buildEdges` produces. */
export const TOWER_MODULE = 0.5;
export const DRIVE_TEETH = 16;
export const MINUTE_TEETH = 8;
export const IDLER_TEETH = 8;
export const HOUR_TEETH = 32;

export const DRIVE_R = pitchRadius(DRIVE_TEETH, TOWER_MODULE); // 4
export const MINUTE_R = pitchRadius(MINUTE_TEETH, TOWER_MODULE); // 2
export const IDLER_R = pitchRadius(IDLER_TEETH, TOWER_MODULE); // 2
export const HOUR_R = pitchRadius(HOUR_TEETH, TOWER_MODULE); // 8

export const DRIVE_MESH_DISTANCE = DRIVE_R + MINUTE_R; // 6
export const MINUTE_IDLER_DISTANCE = MINUTE_R + IDLER_R; // 4
export const IDLER_HOUR_DISTANCE = IDLER_R + HOUR_R; // 10

/** End-to-end minute:hour ratio, by tooth count alone (module only sets physical size, never
 *  gear ratio -- `evaluatePair`'s mesh ratio is always teeth_a / teeth_b):
 *
 *    minute -> idler = 8/8,  idler -> hour = 8/32
 *    combined        = (8/8) * (8/32) = 8/32 = 1/4
 *
 *  The idler's own count cancels out of the end-to-end ratio entirely, so the hour wheel's
 *  speed depends only on the minute wheel's 8 teeth and the hour wheel's own 32. */
export const MINUTE_TO_HOUR = MINUTE_TEETH / HOUR_TEETH; // 8/32 = 1/4

export const DRIVE_SPEED = 0.2;

const TOWER_HALF = 14; // half-width (and half-depth) of the stone tower
export const DIAL_Y = 62; // height of the main dial's centre -- and of the minute wheel
export const DIAL_Z = TOWER_HALF; // the dial face sits on the tower's front wall
export const DIAL_R = 20;

/** Centre height of the small HOUR sub-dial. It is not a free choice: `Prop.attachTo` sweeps a
 *  prop about ITS GEAR'S centre (see `sceneSync.spinAttachedPose`: `pos = (base - centre)
 *  rotated + centre`), so a hand only sweeps about the dial it is drawn on when that dial's
 *  centre and the gear's centre share the same x and y. This is therefore pinned to the hour
 *  wheel's own height, and the test asserts the two are equal. */
export const SUBDIAL_Y = DIAL_Y - (MINUTE_IDLER_DISTANCE + IDLER_HOUR_DISTANCE); // 48
export const SUBDIAL_R = 4.5;

export const PENDULUM_ID = "시계탑_진자축";
export const BOB_ID = "시계탑_진자추";
/** Half-amplitude of the pendulum's swing, in radians (~18 degrees each way). The pivot gear
 *  carries this as its `reverseAt` bound, so its accumulated rotation oscillates over
 *  [-PENDULUM_SWING, +PENDULUM_SWING] forever -- and anything `attachTo`-ed to it swings with
 *  it, about the pivot.
 *
 *  A crank-slider (`Prop.linkTo`) was the wrong tool here and looked it: it converts rotation
 *  into STRAIGHT-LINE reciprocation, so the "pendulum" slid sideways on a horizontal rail
 *  instead of swinging, and read as a rod poking out of the tower. A pendulum needs oscillating
 *  ROTATION about a fixed pivot, which is exactly what a reciprocating crank plus `attachTo`
 *  gives. */
export const PENDULUM_SWING = 0.32;
export const PENDULUM_SPEED = 0.9;
/** The pivot hangs on a bracket off the tower's front wall (z = DIAL_Z), below the dial, so the
 *  swing is actually visible instead of being sealed inside opaque masonry. Sitting 6 units
 *  clear of the wall in +z also buys the whole pendulum cluster a permanent 6-unit head start
 *  on every wheel of the going train (all of which sit at z = 0), which is what keeps it out of
 *  both the overlap floor and -- more dangerous -- the mesh WINDOW: see the clearance test. */
export const PENDULUM_PIVOT: [number, number, number] = [0, 30, 20];
export const PENDULUM_LENGTH = 14;

/** 시계탑 (tower clock) -- a stone belfry carrying a big dial, driven by a going train whose
 *  minute and hour hands hang off DIFFERENT wheels, geared 4:1 apart, with a pendulum swinging
 *  below the movement.
 *
 *  Four gears, three tooth meshes in a line, ALL on module 0.5 so the teeth really interlock:
 *
 *    시계탑_구동륜 (crank, 16T) --mesh-- 시계탑_분침휠 (spur, 8T)
 *        --mesh-- 시계탑_아이들러 (spur, 8T) --mesh-- 시계탑_시침휠 (spur, 32T)
 *
 *  WHY THE IDLER EXISTS: an ordinary external tooth mesh always reverses direction. A single
 *  mesh from the minute wheel to a reduced hour wheel would run the hands in OPPOSITE
 *  directions -- right ratio, visibly wrong clock. Real clock "motion work" solves exactly this
 *  with an idler whose only job is to add a second reversal; two reversals cancel, so both
 *  hands sweep the same way. The idler's own tooth count cancels out of the end-to-end ratio,
 *  so it is free to be whatever size the layout needs.
 *
 *  Geometry (pitch radius = module * teeth / 2; two meshed gears sit the sum of their radii
 *  apart), laid out down the tower's -Y axis behind the dial:
 *
 *    구동륜:   16T, module 0.5 -> r 4.  at y = DIAL_Y + 6   (4 + 2 = 6 above the minute wheel)
 *    분침휠:    8T, module 0.5 -> r 2.  at y = DIAL_Y = 62  (the MAIN dial's centre)
 *    아이들러:  8T, module 0.5 -> r 2.  at y = DIAL_Y - 4   (2 + 2 = 4)
 *    시침휠:   32T, module 0.5 -> r 8.  at y = DIAL_Y - 14  (2 + 8 = 10; = SUBDIAL_Y = 48)
 *
 *  RATIO: 8/32 = 1/4, so the hour wheel turns at a quarter of the minute wheel's speed, in the
 *  SAME direction thanks to the double reversal. That is a real, verified reduction -- but it is
 *  NOT the 12:1 of a real clock, and this preset does not claim otherwise: a genuine 12:1 in one
 *  step off an 8-tooth wheel would need a 96-tooth one, which at this module is r 24 -- a wheel
 *  48 across inside a tower 28 across. Real tower clocks reach 12:1 through several stages; this
 *  is one stage of such a train, sized to fit. The 1/4 figure is what
 *  tests/sim/presets/clocktower.test.ts actually verifies.
 *
 *  WHY THERE ARE TWO DIALS. Both hands are props, each `attachTo`-ed to its OWN wheel -- the
 *  minute hand to 분침휠, the hour hand to 시침휠 -- so they genuinely sweep at different rates
 *  rather than being one assembly faked onto a single gear. But `attachTo` rotates a prop about
 *  its gear's CENTRE, and two gears can never share a centre in this sandbox (coincident spur
 *  gears are flagged as overlapping, and there is no concentric-arbor primitive -- the one
 *  mechanism a real clock uses to put two hands on one dial). So a hand drawn at the main dial
 *  but attached to a wheel further down the tower does not sweep the dial at all: it orbits its
 *  own wheel at whatever the offset happens to be. That is exactly the bug this layout used to
 *  ship -- an hour hand drawn at y = 62 on a wheel at y = 10 swept a 52-unit circle centred 52
 *  units below the dial, diving 42 units UNDER the ground plane on every revolution.
 *  The honest fix, and what a regulator clock really does, is to give the slow hand its own
 *  small sub-dial concentric with its own wheel: SUBDIAL_Y is pinned to the hour wheel's height,
 *  and the sub-dial sits inside the main face at the 6 o'clock position. Each hand is now
 *  centred on the wheel that drives it.
 *
 *  The pendulum hangs on its OWN little pivot gear (시계탑_진자축), a crank whose `reverseAt`
 *  bound makes its rotation oscillate over +/-PENDULUM_SWING rather than turning through. The
 *  rod and bob are `attachTo`-ed to it, so they swing about that pivot the way a pendulum
 *  actually does. It is a separate, self-powered cluster -- as a real pendulum is independent
 *  of the motion work it regulates -- carried on a bracket off the tower's front wall.
 *
 *  This preset models rotation and angular velocity only, like the rest of the sandbox. Nothing
 *  here says anything about torque, driving weight or how much the train could pull; the wheel
 *  sizes are chosen for what fits the tower, not for any force claim. */
export function createClockTowerPreset(): LayoutState {
  const driveY = DIAL_Y + DRIVE_MESH_DISTANCE; // 68
  const idlerY = DIAL_Y - MINUTE_IDLER_DISTANCE; // 58
  const hourY = idlerY - IDLER_HOUR_DISTANCE; // 48 -- equals SUBDIAL_Y

  const gears: GearInstance[] = [
    seedGear(DRIVE_ID, "crank", [0, driveY, 0], [0, 0, 1], DRIVE_TEETH, TOWER_MODULE, DRIVE_SPEED),
    seedGear(MINUTE_ID, "spur", [0, DIAL_Y, 0], [0, 0, 1], MINUTE_TEETH, TOWER_MODULE),
    seedGear(IDLER_ID, "spur", [0, idlerY, 0], [0, 0, 1], IDLER_TEETH, TOWER_MODULE),
    seedGear(HOUR_ID, "spur", [0, hourY, 0], [0, 0, 1], HOUR_TEETH, TOWER_MODULE),
    seedGear(PENDULUM_ID, "crank", PENDULUM_PIVOT, [0, 0, 1], 8, TOWER_MODULE, PENDULUM_SPEED),
    // The bob, as the load riding the pivot: coincident with it, same axis, so
    // `evaluatePair`'s COINCIDENT_ONLY branch resolves a 1:1 coupling. It also keeps the pivot
    // from being a lone crank with no edges at all, which `classify` would (correctly) flag as
    // unconnected -- a gear driving nothing but props still has to be part of the graph.
    seedGear(BOB_ID, "load", PENDULUM_PIVOT, [0, 0, 1], 0, 1),
  ];
  // The pivot rocks back and forth instead of turning through -- that is what makes the rod
  // hung from it read as a swinging pendulum rather than a spinning arm.
  gears[4].reverseAt = [-PENDULUM_SWING, PENDULUM_SWING];
  return { gears, remoteLinks: [] };
}

/** The clock tower's body: a stone shaft, a belfry and roof, the dial with its bezel and hour
 *  marks, the hour sub-dial, the two hands on their own wheels, and the swinging pendulum. */
export function createClockTowerProps(): Prop[] {
  const stone = 0x8b8478;
  const darkStone = 0x6d675d;
  const brass = 0xc9a227;
  const face = 0xe8e2d2;
  const handCol = 0x1e1e22;
  const roofCol = 0x4f3a2c;

  const props: Prop[] = [
    // The tower shaft, then a belfry stage and a roof on top.
    { kind: "box", position: [0, 34, 0], size: [2 * TOWER_HALF, 68, 2 * TOWER_HALF], color: stone, texture: "brick", textureRepeat: [3, 8], roughness: 0.95, metalness: 0.03 },
    { kind: "box", position: [0, 74, 0], size: [2 * TOWER_HALF + 4, 12, 2 * TOWER_HALF + 4], color: darkStone, texture: "stone", textureRepeat: [4, 2], roughness: 0.92, metalness: 0.04 },
    { kind: "cone", position: [0, 88, 0], radius: TOWER_HALF + 5, height: 16, radialSegments: 4, rotation: [0, Math.PI / 4, 0], color: roofCol, texture: "tile", textureRepeat: [4, 3], roughness: 0.88, metalness: 0.04 },
    // The main dial: a pale face on the tower's front wall, inside a brass bezel.
    { kind: "cylinder", position: [0, DIAL_Y, DIAL_Z + 0.6], radius: DIAL_R, height: 1.2, color: face, texture: "stone", textureRepeat: [3, 3], rotation: [Math.PI / 2, 0, 0], roughness: 0.85, metalness: 0.05 },
    { kind: "ring", position: [0, DIAL_Y, DIAL_Z + 1.2], radius: DIAL_R + 1, tube: 1.4, color: brass, texture: "metal", metalness: 0.75, roughness: 0.28 },
  ];

  // Twelve hour marks around the dial. A box's long axis is X, so rotating about Z by the mark's
  // angle points it radially. The 6 o'clock mark (i = 9) is left out: that is where the hour
  // sub-dial sits, and a real regulator dial breaks its chapter ring for a sub-dial the same way.
  const SIX_OCLOCK = 9;
  for (let i = 0; i < 12; i++) {
    if (i === SIX_OCLOCK) continue;
    const a = (i / 12) * Math.PI * 2;
    const cardinal = i % 3 === 0;
    props.push({
      kind: "box",
      position: [Math.cos(a) * (DIAL_R - 2.5), DIAL_Y + Math.sin(a) * (DIAL_R - 2.5), DIAL_Z + 1.4],
      size: [cardinal ? 4 : 2.4, cardinal ? 1.2 : 0.8, 0.4],
      color: handCol,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.4,
      roughness: 0.5,
    });
  }

  // The hour sub-dial, concentric with the HOUR wheel (SUBDIAL_Y is pinned to that wheel's
  // height), inset into the main face at 6 o'clock. Its own little face, bezel and quarter
  // marks, stacked forward in z so each layer sits in front of the one below it.
  props.push({
    kind: "cylinder",
    position: [0, SUBDIAL_Y, DIAL_Z + 2],
    radius: SUBDIAL_R,
    height: 1,
    color: face,
    texture: "stone",
    textureRepeat: [2, 2],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.85,
    metalness: 0.05,
  });
  props.push({
    kind: "ring",
    position: [0, SUBDIAL_Y, DIAL_Z + 2.6],
    radius: SUBDIAL_R + 0.4,
    tube: 0.45,
    color: brass,
    texture: "metal",
    metalness: 0.75,
    roughness: 0.28,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [Math.cos(a) * (SUBDIAL_R - 0.9), SUBDIAL_Y + Math.sin(a) * (SUBDIAL_R - 0.9), DIAL_Z + 2.8],
      size: [1.1, 0.4, 0.3],
      color: handCol,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.4,
      roughness: 0.5,
    });
  }

  // The two hands, each on its OWN wheel so they really do sweep at different rates, and each
  // drawn at the centre of the dial belonging to that wheel. `attachTo` rotates a prop about
  // its GEAR's centre, so a hand's dial centre MUST equal its gear's x/y or the hand orbits
  // somewhere else entirely -- the hour hand is therefore sited on SUBDIAL_Y (= the hour
  // wheel's y), not on DIAL_Y. Both are authored pointing along +X (3 o'clock) and swept round
  // from there. The hour hand and its sub-dial are stacked BEHIND the minute hand in z, so the
  // long minute hand passes cleanly over the sub-dial.
  const hourLen = SUBDIAL_R - 1;
  props.push({
    kind: "box",
    position: [hourLen / 2, SUBDIAL_Y, DIAL_Z + 3.2],
    size: [hourLen, 0.8, 0.4],
    color: handCol,
    texture: "metal",
    metalness: 0.5,
    roughness: 0.4,
    attachTo: HOUR_ID,
  });
  props.push({
    kind: "cylinder",
    position: [0, SUBDIAL_Y, DIAL_Z + 3.6],
    radius: 0.8,
    height: 0.8,
    color: brass,
    texture: "metal",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.8,
    roughness: 0.25,
  });
  const minuteLen = DIAL_R - 3;
  props.push({
    kind: "box",
    position: [minuteLen / 2, DIAL_Y, DIAL_Z + 4.2],
    size: [minuteLen, 1.1, 0.5],
    color: handCol,
    texture: "metal",
    metalness: 0.5,
    roughness: 0.4,
    attachTo: MINUTE_ID,
  });
  // Centre boss the minute hand turns on.
  props.push({
    kind: "cylinder",
    position: [0, DIAL_Y, DIAL_Z + 4.8],
    radius: 1.8,
    height: 1,
    color: brass,
    texture: "metal",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.8,
    roughness: 0.25,
  });

  // The pendulum: a rod hanging from the pivot with a bob at its end, both attached to the
  // rocking pivot gear so they swing about it -- carried on a bracket off the tower's front
  // wall, so the pivot has something visible holding it up instead of floating in mid-air.
  props.push({
    kind: "box",
    position: [PENDULUM_PIVOT[0], PENDULUM_PIVOT[1], (DIAL_Z + PENDULUM_PIVOT[2]) / 2],
    size: [1.6, 1.6, PENDULUM_PIVOT[2] - DIAL_Z],
    color: darkStone,
    texture: "metal",
    metalness: 0.6,
    roughness: 0.45,
  });
  props.push({
    kind: "box",
    position: [PENDULUM_PIVOT[0], PENDULUM_PIVOT[1] - PENDULUM_LENGTH / 2, PENDULUM_PIVOT[2]],
    size: [0.9, PENDULUM_LENGTH, 0.9],
    color: brass,
    texture: "metal",
    metalness: 0.75,
    roughness: 0.3,
    attachTo: PENDULUM_ID,
  });
  props.push({
    kind: "cylinder",
    position: [PENDULUM_PIVOT[0], PENDULUM_PIVOT[1] - PENDULUM_LENGTH, PENDULUM_PIVOT[2]],
    radius: 3.4,
    height: 1.2,
    color: brass,
    texture: "metal",
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.8,
    roughness: 0.25,
    attachTo: PENDULUM_ID,
  });

  // Spokes across the hour wheel and the minute wheel, on the tower's back wall, so the
  // movement itself reads as turning even from behind the dial. Each cross is centred on its
  // own wheel's x/y, for the same reason the hands are.
  for (const [id, r, y] of [
    [MINUTE_ID, MINUTE_R, DIAL_Y],
    [HOUR_ID, HOUR_R, SUBDIAL_Y],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      props.push({
        kind: "box",
        position: [Math.cos(a) * (r / 2), y + Math.sin(a) * (r / 2), -TOWER_HALF - 1],
        size: [r, 0.7, 0.7],
        color: brass,
        texture: "metal",
        rotation: [0, 0, a],
        metalness: 0.7,
        roughness: 0.3,
        attachTo: id,
      });
    }
  }

  return props;
}
