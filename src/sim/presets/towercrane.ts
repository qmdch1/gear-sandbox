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

export const SLEW_Y = 46; // top of the mast, where the jib pivots
const MAST_HALF = 3; // half-width of the lattice mast
export const JIB_REACH = 40; // how far the jib extends from the mast
const COUNTER_REACH = 24; // how far the counter-jib extends the other way
export const HOOK_X = 26; // where the trolley (and so the hook) hangs along the jib

const TROLLEY_H = 1.6;
/** Underside of the trolley -- the headblock the hoist rope drops from, and so the ceiling
 *  the hook block can rise to. Exported because `HOOK_TRAVEL` is measured against it. */
export const TROLLEY_UNDERSIDE = SLEW_Y + TROLLEY_H - TROLLEY_H / 2; // 46.8

const HOOK_HALF = 1.2;      // half-height of the hook block
const CRATE_HEIGHT = 3.5;   // the slung crate's height
const CRATE_DROP = 3.2;     // how far the crate's centre hangs below the hook block's centre
/** Where the hook block's CENTRE sits with the rope fully paid out. Derived, not guessed:
 *  the crate slung `CRATE_DROP` below it must come to rest ON the ground plane (y = 0, an
 *  opaque plane -- see render/scene.ts), not buried in it, so the hook centre has to clear
 *  the drop plus half the crate. At the previous hand-picked 2 the crate spanned
 *  y = -2.95 .. 0.55, i.e. it started 84% underground and only surfaced once hoisted. */
export const HOOK_REST_Y = CRATE_DROP + CRATE_HEIGHT / 2; // 4.95

/** How far the hook climbs. Bounded by the trolley it hangs from, so "lifts to the jib" is
 *  literally true: the hook block's top at full travel is
 *  HOOK_REST_Y + HOOK_TRAVEL + HOOK_HALF = 46.15, which noses up just under
 *  TROLLEY_UNDERSIDE = 46.8 rather than stopping a third of the mast short of it. */
export const HOOK_TRAVEL = 40;
/** The winding stroke that carries the hook over exactly [0, HOOK_TRAVEL]. 40 / 2.5 = 16. */
export const HOIST_STROKE = HOOK_TRAVEL / ROPE_RADIUS;

/** 타워크레인 (tower crane) -- a mast, a jib that slews on a big ring gear, and a hoist drum
 *  that raises and lowers the hook.
 *
 *  Four gears in TWO independent, separately powered clusters:
 *
 *    타워크레인_선회모터 (crank, 8T) --mesh-- 타워크레인_선회기어 (spur, 40T)        [slewing]
 *    타워크레인_권상모터 (crank, 10T) --coincident--> 타워크레인_권상드럼 (pulley, 8T) [hoisting]
 *
 *  (The hoist pair's tooth counts do NOT set its ratio -- a coincident coupling is always 1:1
 *  whatever the teeth say. They only size the two bodies, and so decide how far the cluster
 *  has to sit from the big slew ring to clear the overlap floor; see the geometry note below.)
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
 *  speed) and the hook rides `windWith` on the rope. That motor carries a `reverseAt` stroke of
 *  [0, 16] rad, which at ROPE_RADIUS = 2.5 is exactly HOOK_TRAVEL = 40 world units of hook, so
 *  the hook lifts from the ground right up under the trolley and lowers back, forever, instead
 *  of winding on until it climbs out through the top of the world. A bare drum is a lathed,
 *  rotationally symmetric body and would show no motion at all spinning about its own axis, so
 *  four bars are `attachTo`-ed across its face; those, plus both cranks' offset handles, are
 *  what make the hoist cluster visibly turn.
 *
 *  The hook and its crate declare BOTH `attachTo` (the slew ring) and `windWith` (the drum), so
 *  they swing round with the jib AND ride up and down the rope -- which is what a real crane's
 *  hook does. `SceneSync` composes the two: the attached pass spins the prop about the mast
 *  first, then the winding pass adds the lift on top of that spun position rather than
 *  overwriting it. Before that composition existed, the jib orbited the mast while the hook
 *  hung behind in mid-air.
 *
 *  The hook's motion is pure kinematics -- where the hook goes, never what it could lift. That
 *  limit survives the arrival of `dynamics.ts`: torque, inertia and mass are modelled, but
 *  WEIGHT never loads a train. A `load` gear is a viscous damper, not a mass on a rope, so a
 *  crane here cannot feel what is on its hook and no lifting claim would be honest.
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
    { kind: "box", position: [HOOK_X, SLEW_Y + TROLLEY_H, 0], size: [3, TROLLEY_H, 3], color: dark, texture: "metal", metalness: 0.55, roughness: 0.4, attachTo: SLEW_RING_ID },
    // The hoist rope: a taut guide line the hook climbs, spanning the hook's rest height up
    // to the trolley's underside -- so it reaches the headblock it hangs from at one end and
    // the hook at the other, with no floating gap at either.
    { kind: "cylinder", position: [HOOK_X, (HOOK_REST_Y + TROLLEY_UNDERSIDE) / 2, 0], radius: 0.22, height: TROLLEY_UNDERSIDE - HOOK_REST_Y, color: steel, texture: "metal", metalness: 0.7, roughness: 0.35, attachTo: SLEW_RING_ID },
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

  // The hook block and the crate slung under it, both hoisted on the drum's rope. At rest
  // the crate sits exactly on the ground plane (y = 0) -- see HOOK_REST_Y's derivation.
  props.push(
    { kind: "box", position: [HOOK_X, HOOK_REST_Y, 0], size: [HOOK_HALF * 2, HOOK_HALF * 2, HOOK_HALF * 2], color: dark, texture: "metal", metalness: 0.7, roughness: 0.35, attachTo: SLEW_RING_ID, windWith: lift },
    { kind: "box", position: [HOOK_X, HOOK_REST_Y - CRATE_DROP, 0], size: [5, CRATE_HEIGHT, 5], color: crateCol, texture: "wood", roughness: 0.8, metalness: 0.05, attachTo: SLEW_RING_ID, windWith: lift },
  );

  return props;
}
