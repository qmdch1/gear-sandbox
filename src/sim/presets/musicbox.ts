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

export const BOX_MODULE = 0.5;
export const WINDER_TEETH = 8;
export const REDUCTION_TEETH = 48;
export const GOVERNOR_TEETH = 6;

export const WINDER_R = pitchRadius(WINDER_TEETH, BOX_MODULE); // 2
export const REDUCTION_R = pitchRadius(REDUCTION_TEETH, BOX_MODULE); // 12
export const GOVERNOR_R = pitchRadius(GOVERNOR_TEETH, BOX_MODULE); // 1.5

export const WIND_MESH_DISTANCE = WINDER_R + REDUCTION_R; // 14
export const GOVERNOR_MESH_DISTANCE = REDUCTION_R + GOVERNOR_R; // 13.5

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
export const BARREL_LEN = 20;
export const PIN_ROWS = 10;
export const PIN_RADIUS = 3.2;

/** 오르골 (music box) -- a wind-up key driving a pinned barrel that plucks a tuned comb, with a
 *  governor fan holding the tempo.
 *
 *  Four gears, three tooth meshes in a line:
 *
 *    오르골_태엽 (crank, 8T) --mesh-- 오르골_감속휠 (spur, 48T) --mesh-- 오르골_조속기 (spur, 6T)
 *    오르골_감속휠 --coincident--> 오르골_실린더 (pulley, the pinned barrel)
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
 *  Everything runs about world Z so the barrel lies across the case with its pins facing the
 *  comb, the way a real movement is laid out.
 *
 *  The barrel is a plain cylinder -- rotationally symmetric, so on its own it would look
 *  motionless however fast it turned. The rows of pins standing off it are what make the
 *  rotation readable, and each is `attachTo`-ed to the barrel so `SceneSync` sweeps it round. */
export function createMusicBoxPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(REDUCTION_ID, "spur", [0, BASE_Y + 12, 0], [0, 0, 1], REDUCTION_TEETH, BOX_MODULE),
    seedGear(
      WINDER_ID,
      "crank",
      [WIND_MESH_DISTANCE, BASE_Y + 12, 0],
      [0, 0, 1],
      WINDER_TEETH,
      BOX_MODULE,
      WINDER_SPEED,
    ),
    seedGear(BARREL_ID, "pulley", [0, BASE_Y + 12, 0], [0, 0, 1], 10, BOX_MODULE),
    seedGear(
      GOVERNOR_ID,
      "spur",
      [0, BASE_Y + 12 + GOVERNOR_MESH_DISTANCE, 0],
      [0, 0, 1],
      GOVERNOR_TEETH,
      BOX_MODULE,
    ),
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

  const props: Prop[] = [
    // Case: floor, two ends, a back, and a raised lid.
    { kind: "box", position: [0, BASE_Y - 2, 0], size: [40, 3, 26], color: walnut, texture: "wood", textureRepeat: [5, 3], roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [-20, BASE_Y + 8, 0], size: [2, 22, 26], color: walnut, texture: "wood", roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [20, BASE_Y + 8, 0], size: [2, 22, 26], color: walnut, texture: "wood", roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [0, BASE_Y + 8, -13], size: [40, 22, 2], color: walnut, texture: "wood", textureRepeat: [5, 3], roughness: 0.7, metalness: 0.05 },
    { kind: "box", position: [0, BASE_Y + 20, -4], size: [40, 1.5, 20], color: lidCol, texture: "wood", textureRepeat: [5, 3], rotation: [-0.5, 0, 0], roughness: 0.65, metalness: 0.06 },
    // Felt lining on the case floor.
    { kind: "box", position: [0, BASE_Y - 0.2, 4], size: [34, 0.4, 14], color: felt, texture: "fabric", textureRepeat: [6, 3], roughness: 0.95, metalness: 0.02 },
    // The barrel itself, lying across the case along Z.
    { kind: "cylinder", position: [0, BASE_Y + 12, 0], radius: PIN_RADIUS - 0.4, height: BARREL_LEN, color: brass, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.25 },
    // The tuned comb the pins pluck: a steel bar with teeth, set just under the barrel.
    { kind: "box", position: [0, BASE_Y + 7.4, 0], size: [3, 1, BARREL_LEN], color: steel, texture: "metal", metalness: 0.85, roughness: 0.2 },
  ];

  // Comb teeth, cut across the bar -- static, they are plucked rather than driven.
  for (let i = 0; i < 14; i++) {
    props.push({
      kind: "box",
      position: [1.6, BASE_Y + 7.4, -BARREL_LEN / 2 + 1 + (i * (BARREL_LEN - 2)) / 13],
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
      position: [Math.cos(a) * PIN_RADIUS, BASE_Y + 12 + Math.sin(a) * PIN_RADIUS, z],
      size: [1.1, 0.5, 0.5],
      color: brass,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.85,
      roughness: 0.2,
      attachTo: BARREL_ID,
    });
  }

  // The governor fan: two blades that whir round with the fast little escape gear.
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [
        Math.cos(a) * 2.6,
        BASE_Y + 12 + GOVERNOR_MESH_DISTANCE + Math.sin(a) * 2.6,
        0,
      ],
      size: [5, 2.6, 0.3],
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
