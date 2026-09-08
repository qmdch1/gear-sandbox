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

export const MOTOR_ID = "컨베이어_모터";
export const HEAD_ID = "컨베이어_헤드풀리";
export const TAIL_ID = "컨베이어_테일풀리";

export const CONVEYOR_MODULE = 1;
export const HEAD_TEETH = 8;
export const TAIL_TEETH = 8;
export const HEAD_R = pitchRadius(HEAD_TEETH, CONVEYOR_MODULE); // 4
export const TAIL_R = pitchRadius(TAIL_TEETH, CONVEYOR_MODULE); // 4

/** Belt ratio is `pitchRadius(a) / pitchRadius(b)` (graph.ts, for a `kind: "belt"` link), so
 *  equal pulleys give exactly 1: both ends of a conveyor belt must run at the same rim speed,
 *  which is precisely what equal-diameter pulleys enforce. */
export const PULLEY_RATIO = HEAD_R / TAIL_R; // 1

export const MOTOR_SPEED = 1.0;
export const BELT_Y = 10;
export const HEAD_Z = 26;
export const TAIL_Z = -26;
/** How far a parcel rides before the belt reverses and carries it back. */
export const CARRY_TRAVEL = 44;

/** Radians of pulley rotation that carry a parcel over exactly [0, CARRY_TRAVEL]. A belt on a
 *  pulley of radius r advances r * angle, the same angle x radius relation `rotation.ts` uses
 *  to drive a rack from a pinion. */
export const CARRY_STROKE = CARRY_TRAVEL / HEAD_R;

/** 컨베이어 (reversing belt conveyor) -- a motor on the head pulley, a belt to the tail pulley,
 *  and parcels riding the top run.
 *
 *  Three gears, one coincident coupling and one belt:
 *
 *    컨베이어_모터 (crank) --coincident--> 컨베이어_헤드풀리 (pulley)
 *        --belt--> 컨베이어_테일풀리 (pulley)
 *
 *  `pulley` is one of `evaluatePair`'s COINCIDENT_ONLY types (meshing.ts): it takes rotation
 *  only by sharing a shaft, which is exactly how a drive pulley is keyed onto its motor shaft.
 *  A `RemoteLink` then carries power to the tail pulley; belt links have no distance constraint
 *  in `evaluatePair`, so the 52-unit centre distance is a free layout choice.
 *
 *  Both pulleys are deliberately the SAME size, so the belt ratio is 4/4 = 1 and, since
 *  `propagateRotation` uses sign +1 for every coupling and belt edge, the tail pulley turns at
 *  exactly the head's speed and direction. That is the honest claim here: not a reduction, but
 *  the constraint a real belt imposes -- both ends run together, or the belt would have to
 *  stretch. Verified numerically over hundreds of ticks in tests/sim/presets/conveyor.test.ts.
 *
 *  The belt REVERSES: the motor carries a `reverseAt` stroke sized so parcels ride the full
 *  length of the top run and are then carried back, instead of accumulating travel forever and
 *  sliding off the end of the world. Parcels use `windWith` along -Z, which is the same
 *  rope-on-drum kinematics (radius x angle) a belt on a pulley obeys. */
export function createConveyorPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(MOTOR_ID, "crank", [0, BELT_Y, HEAD_Z], [1, 0, 0], 10, CONVEYOR_MODULE, MOTOR_SPEED),
    seedGear(HEAD_ID, "pulley", [0, BELT_Y, HEAD_Z], [1, 0, 0], HEAD_TEETH, CONVEYOR_MODULE),
    seedGear(TAIL_ID, "pulley", [0, BELT_Y, TAIL_Z], [1, 0, 0], TAIL_TEETH, CONVEYOR_MODULE),
  ];
  gears[0].reverseAt = [0, CARRY_STROKE];
  return {
    gears,
    remoteLinks: [{ a: HEAD_ID, b: TAIL_ID, kind: "belt" }],
  };
}

export const PARCEL_COUNT = 3;

/** Where parcel `i` starts along the run, evenly spread so the belt never looks empty. */
export function parcelStartZ(i: number): number {
  return HEAD_Z - 6 - (i * (CARRY_TRAVEL - 8)) / PARCEL_COUNT;
}

/** The conveyor's body: a steel frame on legs, side guards, idler rollers along the run, and
 *  parcels riding the top. */
export function createConveyorProps(): Prop[] {
  const steel = 0x8f959d;
  const dark = 0x3c4149;
  const beltCol = 0x2b2b30;
  const crateCol = 0xa9743c;

  const runLength = HEAD_Z - TAIL_Z; // 52
  const midZ = (HEAD_Z + TAIL_Z) / 2; // 0

  const ride = {
    gear: HEAD_ID,
    radius: HEAD_R,
    direction: [0, 0, -1] as [number, number, number], // parcels travel from head toward tail
    travel: [0, CARRY_TRAVEL] as [number, number],
  };

  const props: Prop[] = [
    // The belt's top run, drawn as a flat slab between the pulleys.
    { kind: "box", position: [0, BELT_Y + HEAD_R + 0.3, midZ], size: [12, 0.6, runLength], color: beltCol, texture: "fabric", textureRepeat: [3, 12], roughness: 0.9, metalness: 0.05 },
    // Side guards along both edges of the run.
    { kind: "box", position: [-6.6, BELT_Y + HEAD_R + 2, midZ], size: [0.8, 3, runLength], color: steel, texture: "metal", metalness: 0.6, roughness: 0.4 },
    { kind: "box", position: [6.6, BELT_Y + HEAD_R + 2, midZ], size: [0.8, 3, runLength], color: steel, texture: "metal", metalness: 0.6, roughness: 0.4 },
    // Frame rails under the belt.
    { kind: "box", position: [-6.6, BELT_Y - 1, midZ], size: [1.2, 1.6, runLength + 6], color: dark, texture: "metal", metalness: 0.5, roughness: 0.5 },
    { kind: "box", position: [6.6, BELT_Y - 1, midZ], size: [1.2, 1.6, runLength + 6], color: dark, texture: "metal", metalness: 0.5, roughness: 0.5 },
  ];

  // Legs at each end.
  for (const z of [HEAD_Z - 3, TAIL_Z + 3]) {
    for (const x of [-6.6, 6.6]) {
      props.push({
        kind: "box",
        position: [x, BELT_Y / 2 - 1, z],
        size: [1.2, BELT_Y, 1.2],
        color: dark,
        texture: "metal",
        metalness: 0.5,
        roughness: 0.5,
      });
    }
  }

  // Bars across each pulley's face, so the pulleys' rotation actually reads -- a bare pulley
  // disc is rotationally symmetric and shows no motion at all.
  for (const [id, z] of [[HEAD_ID, HEAD_Z], [TAIL_ID, TAIL_Z]] as const) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      props.push({
        kind: "box",
        position: [7.2, BELT_Y + Math.cos(a) * (HEAD_R / 2), z + Math.sin(a) * (HEAD_R / 2)],
        size: [0.6, HEAD_R, 0.9],
        color: steel,
        texture: "metal",
        rotation: [a, 0, 0],
        metalness: 0.65,
        roughness: 0.35,
        attachTo: id,
      });
    }
  }

  // Parcels riding the top run.
  for (let i = 0; i < PARCEL_COUNT; i++) {
    props.push({
      kind: "box",
      position: [0, BELT_Y + HEAD_R + 2.4, parcelStartZ(i)],
      size: [6, 4, 6],
      color: crateCol,
      texture: "wood",
      roughness: 0.8,
      metalness: 0.05,
      windWith: ride,
    });
  }

  return props;
}
