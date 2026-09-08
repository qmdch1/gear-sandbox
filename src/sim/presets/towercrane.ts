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

export const SLEW_MOTOR_ID = "타워크레인_선회모터";
export const SLEW_RING_ID = "타워크레인_선회기어";
export const HOIST_MOTOR_ID = "타워크레인_권상모터";
export const HOIST_DRUM_ID = "타워크레인_권상드럼";

export const CRANE_MODULE = 1;
export const SLEW_MOTOR_TEETH = 8;
export const SLEW_RING_TEETH = 40;
export const SLEW_MOTOR_R = pitchRadius(SLEW_MOTOR_TEETH, CRANE_MODULE); // 4
export const SLEW_RING_R = pitchRadius(SLEW_RING_TEETH, CRANE_MODULE); // 20
export const SLEW_MESH_DISTANCE = SLEW_RING_R + SLEW_MOTOR_R; // 24

/** Teeth-based reduction from the slew motor to the slew ring: 8 / 40. A tower crane's jib
 *  swings far slower than its motor, which is what a big slew ring buys. */
export const SLEW_REDUCTION = SLEW_MOTOR_TEETH / SLEW_RING_TEETH; // 1/5
export const SLEW_MOTOR_SPEED = 0.8;

export const HOIST_MOTOR_SPEED = 1.4;
/** Effective radius the hoist rope spools at. Rope-on-drum kinematics: the hook moves
 *  `drumRotation * ROPE_RADIUS`. */
export const ROPE_RADIUS = 2.5;
/** How far the hook can travel between the ground and the jib. */
export const HOOK_TRAVEL = 30;
/** The winding stroke that carries the hook over exactly [0, HOOK_TRAVEL]. */
export const HOIST_STROKE = HOOK_TRAVEL / ROPE_RADIUS;

export const SLEW_Y = 46; // top of the mast, where the jib pivots
const MAST_HALF = 3; // half-width of the lattice mast
export const JIB_REACH = 40; // how far the jib extends from the mast
const COUNTER_REACH = 24; // how far the counter-jib extends the other way
export const HOOK_X = 26; // where the trolley (and so the hook) hangs along the jib
const HOOK_REST_Y = 2;

/** 타워크레인 (tower crane) -- a mast, a jib that slews on a big ring gear, and a hoist drum
 *  that raises and lowers the hook.
 *
 *  Four gears in TWO independent, separately powered clusters:
 *
 *    타워크레인_선회모터 (crank, 8T) --mesh-- 타워크레인_선회기어 (spur, 40T)   [slewing]
 *    타워크레인_권상모터 (crank) --coincident--> 타워크레인_권상드럼 (pulley)   [hoisting]
 *
 *  Two clusters, and so two cranks, is the honest model: on a real tower crane slewing and
 *  hoisting are driven by separate motors that run independently -- you can swing the jib while
 *  the hook hangs still, or hoist without swinging. `classify` is happy with this: each cluster
 *  reaches a crank of its own, so nothing is unpowered, and the two sit far enough apart that
 *  no gear pair trips the overlap check.
 *
 *  Slewing: the jib turns about world Y (a crane slews in plan), stepped down 8/40 = 1/5 and
 *  reversed by the tooth mesh, so 0.8 rad/s at the motor becomes -0.16 rad/s at the ring. The
 *  ENTIRE upper works -- jib, counter-jib, counterweight, cab, tie bars and the hoist rope --
 *  is `attachTo`-ed to the slew ring, so it all swings together as one assembly rather than the
 *  ring turning inside a jib that stays put.
 *
 *  Hoisting: the drum is keyed coincident to its own motor (1:1 -- a coupling never changes
 *  speed) and the hook rides `windWith` on the rope. That motor carries a `reverseAt` stroke so
 *  the hook lifts to the jib and lowers back, forever, instead of winding on until it climbs
 *  out through the top of the world.
 *
 *  As everywhere in this sandbox, the hook's motion is pure kinematics -- where the hook goes,
 *  never what load it could lift; there is no force model here to make such a claim honest.
 *
 *  Geometry: 20 + 4 = 24, so the slew motor sits 24 units from the mast centre, which also
 *  clears `classify`'s overlap floor of (20 + 4) * 0.95 = 22.8.
 *
 *  The slew ring's size drives the hoist cluster's placement, which is easy to get wrong: the
 *  overlap check compares centre distance against the SUM of two gears' radii, so a big ring
 *  swallows anything parked near the mast head. Against the 10-tooth hoist motor the floor is
 *  (20 + 5) * 0.95 = 23.75, so the hoist sits out at x = -24 and 10 units above the slew plane
 *  -- sqrt(24^2 + 10^2) = 26.0 away, comfortably clear -- which is also where a real crane puts
 *  its hoist winch: back on the counter-jib, behind the mast. */
export function createTowerCranePreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(SLEW_RING_ID, "spur", [0, SLEW_Y, 0], [0, 1, 0], SLEW_RING_TEETH, CRANE_MODULE),
    seedGear(
      SLEW_MOTOR_ID,
      "crank",
      [SLEW_MESH_DISTANCE, SLEW_Y, 0],
      [0, 1, 0],
      SLEW_MOTOR_TEETH,
      CRANE_MODULE,
      SLEW_MOTOR_SPEED,
    ),
    seedGear(HOIST_MOTOR_ID, "crank", [-COUNTER_REACH, SLEW_Y + 10, 0], [0, 0, 1], 10, CRANE_MODULE, HOIST_MOTOR_SPEED),
    seedGear(HOIST_DRUM_ID, "pulley", [-COUNTER_REACH, SLEW_Y + 10, 0], [0, 0, 1], 8, CRANE_MODULE),
  ];
  // The hoist winds up to the jib and back down, over and over.
  gears[2].reverseAt = [0, HOIST_STROKE];
  return { gears, remoteLinks: [] };
}

/** The crane's body: a lattice mast, the slewing upper works (jib, counter-jib, counterweight,
 *  cab, tie bars, trolley) and the hook on its rope. */
export function createTowerCraneProps(): Prop[] {
  const steel = 0xc0c6cd;
  const yellow = 0xd9a520;
  const dark = 0x40454d;
  const concrete = 0x8d8d86;
  const crateCol = 0x9c6b3f;

  const lift = {
    gear: HOIST_DRUM_ID,
    radius: ROPE_RADIUS,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, HOOK_TRAVEL] as [number, number],
  };

  const props: Prop[] = [
    // Concrete base pad the mast stands on.
    { kind: "box", position: [0, 1, 0], size: [16, 2, 16], color: concrete, texture: "stone", roughness: 0.95, metalness: 0.03 },
  ];

  // Four mast legs plus cross-bracing, so the tower reads as a lattice rather than a post.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      props.push({
        kind: "box",
        position: [sx * MAST_HALF, SLEW_Y / 2 + 1, sz * MAST_HALF],
        size: [1, SLEW_Y, 1],
        color: yellow,
        texture: "metal",
        metalness: 0.6,
        roughness: 0.4,
      });
    }
  }
  for (let i = 1; i <= 5; i++) {
    props.push({
      kind: "box",
      position: [0, (SLEW_Y / 6) * i, 0],
      size: [2 * MAST_HALF, 0.7, 2 * MAST_HALF],
      color: yellow,
      texture: "metal",
      metalness: 0.6,
      roughness: 0.4,
    });
  }

  // --- The slewing upper works: every piece below swings with the ring gear. ---
  props.push(
    // Jib (the long working arm) and the counter-jib behind it.
    { kind: "box", position: [JIB_REACH / 2, SLEW_Y + 3, 0], size: [JIB_REACH, 1.6, 2.4], color: yellow, texture: "metal", metalness: 0.6, roughness: 0.4, attachTo: SLEW_RING_ID },
    { kind: "box", position: [-COUNTER_REACH / 2, SLEW_Y + 3, 0], size: [COUNTER_REACH, 1.6, 2.4], color: yellow, texture: "metal", metalness: 0.6, roughness: 0.4, attachTo: SLEW_RING_ID },
    // Counterweight slab at the tail.
    { kind: "box", position: [-COUNTER_REACH, SLEW_Y + 1, 0], size: [5, 5, 5], color: concrete, texture: "stone", roughness: 0.9, metalness: 0.04, attachTo: SLEW_RING_ID },
    // Operator cab at the pivot.
    { kind: "box", position: [5, SLEW_Y - 2, 0], size: [4, 4, 4], color: dark, texture: "metal", metalness: 0.5, roughness: 0.45, attachTo: SLEW_RING_ID },
    // A-frame apex, and a tie bar out to each arm.
    { kind: "box", position: [0, SLEW_Y + 11, 0], size: [1.2, 14, 1.2], color: yellow, texture: "metal", metalness: 0.6, roughness: 0.4, attachTo: SLEW_RING_ID },
    { kind: "box", position: [JIB_REACH / 2, SLEW_Y + 11, 0], size: [Math.hypot(JIB_REACH, 14), 0.6, 0.6], color: steel, texture: "metal", rotation: [0, 0, -Math.atan2(14, JIB_REACH)], metalness: 0.7, roughness: 0.35, attachTo: SLEW_RING_ID },
    { kind: "box", position: [-COUNTER_REACH / 2, SLEW_Y + 11, 0], size: [Math.hypot(COUNTER_REACH, 14), 0.6, 0.6], color: steel, texture: "metal", rotation: [0, 0, Math.atan2(14, COUNTER_REACH)], metalness: 0.7, roughness: 0.35, attachTo: SLEW_RING_ID },
    // Trolley riding the jib, where the hoist rope drops from.
    { kind: "box", position: [HOOK_X, SLEW_Y + 1.6, 0], size: [3, 1.6, 3], color: dark, texture: "metal", metalness: 0.55, roughness: 0.4, attachTo: SLEW_RING_ID },
    // The hoist rope: a taut guide line spanning the hook's travel, which the hook climbs.
    { kind: "cylinder", position: [HOOK_X, (HOOK_REST_Y + SLEW_Y) / 2, 0], radius: 0.22, height: SLEW_Y - HOOK_REST_Y, color: steel, texture: "metal", metalness: 0.7, roughness: 0.35, attachTo: SLEW_RING_ID },
  );

  // Bars across the hoist drum's face so its rotation reads -- a bare drum is symmetric.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [-COUNTER_REACH + Math.cos(a) * (ROPE_RADIUS / 2), SLEW_Y + 10 + Math.sin(a) * (ROPE_RADIUS / 2), 1.6],
      size: [ROPE_RADIUS, 0.5, 0.5],
      color: steel,
      texture: "metal",
      rotation: [0, 0, a],
      metalness: 0.65,
      roughness: 0.35,
      attachTo: HOIST_DRUM_ID,
    });
  }

  // The hook block and the crate slung under it, both hoisted on the drum's rope.
  props.push(
    { kind: "box", position: [HOOK_X, HOOK_REST_Y, 0], size: [2.4, 2.4, 2.4], color: dark, texture: "metal", metalness: 0.7, roughness: 0.35, windWith: lift },
    { kind: "box", position: [HOOK_X, HOOK_REST_Y - 3.2, 0], size: [5, 3.5, 5], color: crateCol, texture: "wood", roughness: 0.8, metalness: 0.05, windWith: lift },
  );

  return props;
}
