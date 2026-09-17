import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `hoist.ts` uses. */
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

export const WINDER_ID = "오르골_태엽";
export const REDUCTION_ID = "오르골_감속휠";
export const BARREL_ID = "오르골_실린더";
export const GOVERNOR_ID = "오르골_조속기";

export const BOX_MODULE = 0.25;
export const WINDER_TEETH = 8;
export const REDUCTION_TEETH = 48;
export const GOVERNOR_TEETH = 6;
/** The barrel is a `pulley`: it never tooth-meshes (it only ever receives power through the
 *  coincident 1:1 coupling with the great wheel), so its tooth count exists purely to give it
 *  a pitch radius. It is chosen so that radius equals the brass barrel actually drawn around
 *  it -- 40 * 0.25 / 2 = 5 -- rather than leaving the simulated body a different size from the
 *  visible one. */
export const BARREL_TEETH = 40;

export const WINDER_R = pitchRadius(WINDER_TEETH, BOX_MODULE); // 1
export const REDUCTION_R = pitchRadius(REDUCTION_TEETH, BOX_MODULE); // 6
export const GOVERNOR_R = pitchRadius(GOVERNOR_TEETH, BOX_MODULE); // 0.75
export const BARREL_R = pitchRadius(BARREL_TEETH, BOX_MODULE); // 5

export const WIND_MESH_DISTANCE = WINDER_R + REDUCTION_R; // 7
export const GOVERNOR_MESH_DISTANCE = REDUCTION_R + GOVERNOR_R; // 6.75

/** A rendered tooth reaches one full module PAST the pitch circle (`gearGeometry.ts`:
 *  `addendumRadius = pitchRadius + module * ADDENDUM_FACTOR`, ADDENDUM_FACTOR = 1). Every
 *  clearance below is measured against these tip radii, not the pitch radii -- using the pitch
 *  radius would silently leave a 0.25 interference at each rim. */
export const REDUCTION_TIP_R = REDUCTION_R + BOX_MODULE; // 6.25
export const GOVERNOR_TIP_R = GOVERNOR_R + BOX_MODULE; // 1

/** The winding key steps DOWN into the barrel: 8 / 48, so the pinned cylinder turns at one
 *  sixth of the key. A music box needs exactly this -- the key is turned briskly by hand, but
 *  the tune must play slowly. */
export const BARREL_REDUCTION = WINDER_TEETH / REDUCTION_TEETH; // 1/6
/** ...and the governor fan steps back UP off the same wheel, 48 / 6, so it whirs eight times
 *  faster than the barrel. That is what an air-brake governor is for: it spins fast enough to
 *  meet real air resistance, which is how a real movement holds a steady tempo. This sandbox
 *  models no air resistance, so the honest claim here is only the SPEED relationship. */
export const GOVERNOR_STEP_UP = REDUCTION_TEETH / GOVERNOR_TEETH; // 8

export const WINDER_SPEED = 1.2;

const BASE_Y = 4;
/** Height of the barrel arbor -- the shared centre of the great wheel and the barrel. */
export const ARBOR_Y = BASE_Y + 8; // 12
export const BARREL_LEN = 20;
export const PIN_ROWS = 10;
export const PIN_RADIUS = 5.4;
/** Half the length of one pin box (`size[0] / 2`), so `PIN_TIP_RADIUS` is how far a pin's tip
 *  actually reaches from the arbor -- the number every clearance below is measured against. */
const PIN_HALF_LENGTH = 0.55;
export const PIN_TIP_RADIUS = PIN_RADIUS + PIN_HALF_LENGTH; // 5.95
const COMB_HALF_HEIGHT = 0.5;
/** What actually fixes the comb's height is the GREAT WHEEL, not the pins. The wheel is
 *  coincident with the barrel, so it is drawn as a disc straight across the barrel's mid-plane,
 *  and the comb runs the barrel's whole length -- so the comb has to hang below the wheel's tip
 *  circle or the wheel saws through it -- which it did, and not by the 4.4 an earlier version of
 *  this comment gave. At the old BOX_MODULE of 0.5 the wheel's tip circle reached 8.4 below the
 *  comb's top face and 7.4 below its underside: the comb was not sawn into, it was swallowed
 *  whole, its farthest corner lying 5.32 from the arbor against a tip radius of 12.5.
 *  0.25 of clearance under the tip circle leaves the pins sweeping 0.55 above the comb: close
 *  enough to read as plucking, with nothing interpenetrating. */
export const COMB_Y = ARBOR_Y - REDUCTION_TIP_R - 0.25 - COMB_HALF_HEIGHT; // 5

/** Case dimensions, kept as named constants because every clearance in this preset is checked
 *  against them (see tests/sim/presets/musicbox.test.ts). Walls are 22 tall centred on
 *  BASE_Y + 8, so their top edge is BASE_Y + 19. */
export const CASE_WIDTH = 32;
export const CASE_DEPTH = 26;
export const CASE_WALL_TOP = BASE_Y + 19; // 23

export const GOVERNOR_Y = ARBOR_Y + GOVERNOR_MESH_DISTANCE; // 18.75
/** The governor gear has to mesh the great wheel at the barrel's mid-plane (z = 0), but its FAN
 *  cannot whir there: a blade long enough to be worth watching would sweep straight through the
 *  brass barrel and the raised lid. So the fan rides the far end of the governor arbor, 1.5
 *  beyond the barrel's end, in the open front of the case where nothing else stands. */
export const FAN_Z = BARREL_LEN / 2 + 1.5; // 11.5
const FAN_OFFSET = 1.8;
const FAN_BLADE: [number, number, number] = [3.6, 1.8, 0.3];
/** How far the outermost corner of a fan blade is from the governor's axis -- the radius of the
 *  circle the fan actually sweeps, which is what has to stay inside the case. */
export const FAN_SWEEP_R = Math.hypot(FAN_OFFSET + FAN_BLADE[0] / 2, FAN_BLADE[1] / 2); // 3.711

/** 오르골 (music box) -- a wind-up key driving a pinned barrel that plucks a tuned comb, with a
 *  governor fan holding the tempo.
 *
 *  Four gears: TWO tooth meshes in a line, plus one coincident shaft coupling.
 *
 *    오르골_태엽 (crank, 8T) --mesh-- 오르골_감속휠 (spur, 48T) --mesh-- 오르골_조속기 (spur, 6T)
 *    오르골_감속휠 --coincident coupling (1:1)--> 오르골_실린더 (pulley, the pinned barrel)
 *
 *  The big 48-tooth wheel is the hub of the movement: the key steps down into it (8/48), the
 *  barrel is keyed straight onto it (a coincident 1:1 coupling, exactly how a music-box barrel
 *  sits on its great-wheel arbor), and the governor steps back up off it (48/6). One wheel,
 *  two ratios in opposite directions -- the classic music-box train.
 *
 *  Because `propagateRotation` drives a mesh with sign -1, and the key runs at +1.2 rad/s:
 *    감속휠 (and so 실린더) = -(8/48) * 1.2 = -0.2 rad/s
 *    조속기                = -(48/6) * -0.2 = +1.6 rad/s
 *  So the governor whirs at eight times the barrel's speed, in the opposite direction to it and
 *  the same direction as the key. All of it is verified numerically over hundreds of real ticks
 *  in tests/sim/presets/musicbox.test.ts rather than only derived here.
 *
 *  The sandbox does model torque and inertia now, but this movement does not use them: its
 *  crank carries no `motor`, so it turns at a speed that is given rather than solved for. So
 *  nothing here says what torque a mainspring would deliver, how long a real movement would run
 *  before unwinding, or how hard the pins would strike -- only how fast each part turns relative
 *  to the others.
 *
 *  Everything runs about world Z so the barrel lies across the case with its pins facing the
 *  comb, the way a real movement is laid out.
 *
 *  PROPORTIONS (why `BOX_MODULE` is 0.25): the great wheel is coincident with the barrel, so it
 *  is drawn as a disc at the barrel's mid-plane. Anything the pins are supposed to reach -- the
 *  comb, first of all -- therefore has to sit OUTSIDE that disc, which caps the wheel's pitch
 *  radius at roughly the pins' own reach. At module 0.5 the 48-tooth wheel had a 12 radius: it
 *  cut straight through the comb it was meant to drive, stood 5 above the case walls, and
 *  speared the raised lid, while the governor and its fan orbited outside the case entirely.
 *  At 0.25 the wheel is a 6-radius flange just proud of the pinned barrel, and the whole
 *  movement sits inside its case. Module changes no ratio: every mesh ratio here is a tooth
 *  count ratio.
 *
 *  The barrel is a plain cylinder -- rotationally symmetric, so on its own it would look
 *  motionless however fast it turned. The rows of pins standing off it are what make the
 *  rotation readable, and each is `attachTo`-ed to the barrel so `SceneSync` sweeps it round. */
export function createMusicBoxPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(REDUCTION_ID, "spur", [0, ARBOR_Y, 0], [0, 0, 1], REDUCTION_TEETH, BOX_MODULE),
    seedGear(
      WINDER_ID,
      "crank",
      [WIND_MESH_DISTANCE, ARBOR_Y, 0],
      [0, 0, 1],
      WINDER_TEETH,
      BOX_MODULE,
      WINDER_SPEED,
    ),
    seedGear(BARREL_ID, "pulley", [0, ARBOR_Y, 0], [0, 0, 1], BARREL_TEETH, BOX_MODULE),
    seedGear(GOVERNOR_ID, "spur", [0, GOVERNOR_Y, 0], [0, 0, 1], GOVERNOR_TEETH, BOX_MODULE),
  ];
  return { gears, remoteLinks: [] };
}

/** Angle of pin row `i` around the barrel. Exported so the test can check the pins really are
 *  distributed around it rather than lined up in one stripe. */
export function pinRowAngle(i: number): number {
  return (i / PIN_ROWS) * Math.PI * 2;
}

/** The music box's body: a walnut case with a lid, the brass barrel and its pins, the tuned
 *  steel comb, and the governor fan. */
export function createMusicBoxProps(): Prop[] {
  const walnut = 0x5a3a22;
  const lidCol = 0x6b4629;
  const brass = 0xc9a227;
  const steel = 0xb8bec6;
  const felt = 0x7c2d2d;

  const halfW = CASE_WIDTH / 2; // 16
  const halfD = CASE_DEPTH / 2; // 13

  const props: Prop[] = [
    // Case: floor, two ends, a back, and a raised lid.
    { kind: "box", position: [0, BASE_Y - 2, 0], size: [CASE_WIDTH, 3, CASE_DEPTH], color: walnut, texture: "wood", textureRepeat: [5, 3], roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [-halfW, BASE_Y + 8, 0], size: [2, 22, CASE_DEPTH], color: walnut, texture: "wood", roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [halfW, BASE_Y + 8, 0], size: [2, 22, CASE_DEPTH], color: walnut, texture: "wood", roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [0, BASE_Y + 8, -halfD], size: [CASE_WIDTH, 22, 2], color: walnut, texture: "wood", textureRepeat: [5, 3], roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [0, BASE_Y + 20, -4], size: [CASE_WIDTH, 1.5, 20], color: lidCol, texture: "wood", textureRepeat: [5, 3], rotation: [-0.5, 0, 0], roughness: 0.65, metalness: 0.06 },
    // Felt lining on the case floor.
    { kind: "box", position: [0, BASE_Y - 0.2, 4], size: [CASE_WIDTH - 6, 0.4, 14], color: felt, texture: "fabric", textureRepeat: [6, 3], roughness: 0.95, metalness: 0.02 },
    // The barrel itself, lying across the case along Z.
    { kind: "cylinder", position: [0, ARBOR_Y, 0], radius: BARREL_R, height: BARREL_LEN, color: brass, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.25 },
    // The tuned comb the pins pluck: a steel bar with teeth, set just under the barrel.
    { kind: "box", position: [0, COMB_Y, 0], size: [3, COMB_HALF_HEIGHT * 2, BARREL_LEN], color: steel, texture: "metal", metalness: 0.85, roughness: 0.2 },
    // The governor arbor: a slim shaft carrying the fan out past the end of the barrel, so the
    // little escape gear at z = 0 and the fan at z = FAN_Z visibly belong to each other.
    { kind: "cylinder", position: [0, GOVERNOR_Y, FAN_Z / 2], radius: 0.25, height: FAN_Z, color: steel, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.85, roughness: 0.2 },
  ];

  // Comb teeth, cut across the bar -- static, they are plucked rather than driven.
  for (let i = 0; i < 14; i++) {
    props.push({
      kind: "box",
      position: [1.6, COMB_Y, -BARREL_LEN / 2 + 1 + (i * (BARREL_LEN - 2)) / 13],
      size: [3.4, 0.5, 0.7],
      color: steel,
      texture: "metal",
      metalness: 0.85,
      roughness: 0.2,
    });
  }

  // Rows of pins standing off the barrel, each row at its own clock angle and its own place
  // along the barrel -- this is what makes the barrel's rotation visible.
  for (let i = 0; i < PIN_ROWS; i++) {
    const a = pinRowAngle(i);
    const z = -BARREL_LEN / 2 + 1.5 + (i * (BARREL_LEN - 3)) / (PIN_ROWS - 1);
    props.push({
      kind: "box",
      position: [Math.cos(a) * PIN_RADIUS, ARBOR_Y + Math.sin(a) * PIN_RADIUS, z],
      size: [PIN_HALF_LENGTH * 2, 0.5, 0.5],
      color: brass,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.85,
      roughness: 0.2,
      attachTo: BARREL_ID,
    });
  }

  // The governor fan: two blades that whir round with the fast little escape gear, out at the
  // end of its arbor where there is clear air for them.
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [Math.cos(a) * FAN_OFFSET, GOVERNOR_Y + Math.sin(a) * FAN_OFFSET, FAN_Z],
      size: FAN_BLADE,
      color: steel,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.8,
      roughness: 0.25,
      attachTo: GOVERNOR_ID,
    });
  }

  return props;
}
