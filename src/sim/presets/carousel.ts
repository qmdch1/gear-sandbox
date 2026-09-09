import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module (rather than
 *  shared) so each stays a self-contained, hand-verifiable spec of its own mechanism -- the
 *  same shape `windmill.ts` and `hoist.ts` use. */
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

export const MOTOR_ID = "회전목마_모터";
export const RING_ID = "회전목마_큰기어";

export const MOTOR_TEETH = 10;
export const RING_TEETH = 60;
export const CAROUSEL_MODULE = 1;
export const MOTOR_R = pitchRadius(MOTOR_TEETH, CAROUSEL_MODULE); // 5
export const RING_R = pitchRadius(RING_TEETH, CAROUSEL_MODULE); // 30
export const MESH_DISTANCE = RING_R + MOTOR_R; // 35

/** Teeth-based reduction from the motor to the ring gear: 10 / 60, i.e. the platform turns at
 *  one sixth of the motor's speed. `evaluatePair` reports a mesh ratio of `teeth_a / teeth_b`
 *  and `propagateRotation` drives a mesh with sign -1, so the ring runs at -1/6 of the motor. */
export const REDUCTION = MOTOR_TEETH / RING_TEETH; // 1/6
export const MOTOR_SPEED = 1.2;

const DECK_Y = 3; // platform deck height
const RIDE_R = 20; // radius the horses ride at
const RIM_R = RIDE_R + 8; // 28 -- shared rim radius of the deck edge and the canopy base
const CANOPY_Y = 27; // canopy centre height
const CANOPY_H = 9;
/** Three's `ConeGeometry` centres the cone on its own origin, so the base circle -- the
 *  canopy's outer rim, the thing a valance scallop hangs off -- sits half a height BELOW
 *  the prop's position, at y = 22.5. Placing scallops by eye above that leaves them
 *  floating outside the roof (the cone has already tapered in to r = 23.3 by y = 24). */
const CANOPY_RIM_Y = CANOPY_Y - CANOPY_H / 2; // 22.5
const SCALLOP_H = 2;

/** 회전목마 (carousel / merry-go-round) -- a slow ride turned by a small fast motor through a
 *  single big reduction gear, which is exactly how a fairground carousel is driven: one motor
 *  at the rim of the large ring gear that carries the deck.
 *
 *  Two gears, one mesh:
 *
 *    회전목마_모터 (crank, 10T) --mesh-- 회전목마_큰기어 (spur, 60T)
 *
 *  Both turn about world Y, so their discs lie flat and the deck spins like a turntable --
 *  the correct orientation here, unlike the upright wheels of `car.ts` or `bicycle.ts`.
 *
 *  Geometry: pitchRadius = module * teeth / 2, and two meshed gears sit exactly the sum of
 *  their pitch radii apart. 30 + 5 = 35, so with the ring on the deck axis at [0, 3, 0] the
 *  motor sits at [35, 3, 0]. That is also clear of `classify`'s overlap floor, which trips
 *  below (30 + 5) * 0.95 = 33.25.
 *
 *  Speed: the motor's 1.2 rad/s becomes 1.2 * -(10/60) = -0.2 rad/s at the ring -- a sixfold
 *  reduction, reversed by the tooth mesh. Verified numerically over hundreds of real ticks in
 *  tests/sim/presets/carousel.test.ts rather than only derived here.
 *
 *  The deck disc and the canopy cone are both rotationally symmetric about the ride's own
 *  axis, so on their own they would show no motion at all no matter how fast they turned.
 *  The six horses, their poles and the six canopy scallops are what make the rotation
 *  visible: each sits off-axis (r = 20 and r = 28) and is `attachTo`-ed to the ring gear, so
 *  `SceneSync` sweeps it bodily round the ride each frame. Their facing comes from
 *  `horseFacing`, which is pinned tangential in the test -- see the note there on why the
 *  obvious `-a` splays them radially instead. */
export function createCarouselPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(RING_ID, "spur", [0, DECK_Y, 0], [0, 1, 0], RING_TEETH, CAROUSEL_MODULE),
    seedGear(MOTOR_ID, "crank", [MESH_DISTANCE, DECK_Y, 0], [0, 1, 0], MOTOR_TEETH, CAROUSEL_MODULE, MOTOR_SPEED),
  ];
  return { gears, remoteLinks: [] };
}

export const HORSE_COUNT = 6;

/** Angle of horse `i` around the ride, evenly spaced. Exported so the test can check the
 *  horses really are distributed rather than piled at one clock position. */
export function horseAngle(i: number): number {
  return (i / HORSE_COUNT) * Math.PI * 2;
}

/** Y-rotation (radians) that turns a rider at `horseAngle(i)` to face ALONG the ride.
 *
 *  A prop's long side is its local +X, and Three's Y-rotation by `t` maps local +X onto the
 *  world direction (cos t, 0, -sin t). At ride angle `a` the outward radial direction is
 *  (cos a, 0, sin a) and the tangent -- the way a horse actually travels -- is
 *  (-sin a, 0, cos a). Solving (cos t, -sin t) = (-sin a, cos a) gives t = -a - PI/2.
 *
 *  The obvious-looking `-a` is exactly WRONG: it lands the long axis on the radial
 *  direction (dot 1.0 with radial, 0.0 with the tangent), splaying every horse outward like
 *  a spoke instead of nose-first round the ride. Exported so the test pins the tangency
 *  numerically rather than trusting this derivation. */
export function horseFacing(i: number): number {
  return -horseAngle(i) - Math.PI / 2;
}

/** The carousel's body: a stone base, a timber deck, the centre pole, a canvas canopy, and six
 *  horses on brass poles. Everything that turns is attached to the ring gear. */
export function createCarouselProps(): Prop[] {
  const timber = 0xb07d4a;
  const brass = 0xc9a227;
  const canvasRed = 0xb5432f;
  const stone = 0x7d7a72;
  const horseCol = 0xe8e0d0;

  const props: Prop[] = [
    // Static ground pad the ride sits on.
    { kind: "cylinder", position: [0, 0.5, 0], radius: RING_R + 2, height: 1, color: stone, texture: "stone", roughness: 0.95, metalness: 0.03 },
    // The turning deck.
    { kind: "cylinder", position: [0, DECK_Y, 0], radius: RIM_R, height: 1.5, color: timber, texture: "wood", textureRepeat: [6, 6], roughness: 0.75, metalness: 0.05, attachTo: RING_ID },
    // Centre pole (symmetric, so it is left static -- attaching it would show nothing).
    { kind: "cylinder", position: [0, 14, 0], radius: 1.6, height: 22, color: brass, texture: "metal", metalness: 0.75, roughness: 0.3 },
    // Canvas canopy roof.
    { kind: "cone", position: [0, CANOPY_Y, 0], radius: RIM_R, height: CANOPY_H, color: canvasRed, texture: "fabric", textureRepeat: [8, 3], roughness: 0.85, metalness: 0.03, attachTo: RING_ID },
    // Stone plinth carrying the motor. The ground pad only reaches RING_R + 2 = 32, so
    // without this the motor gear (x = 35) hangs in mid-air off the edge of the ride.
    { kind: "cylinder", position: [MESH_DISTANCE, DECK_Y / 2, 0], radius: 3, height: DECK_Y, color: stone, texture: "stone", roughness: 0.95, metalness: 0.03 },
  ];

  for (let i = 0; i < HORSE_COUNT; i++) {
    const a = horseAngle(i);
    const x = Math.cos(a) * RIDE_R;
    const z = Math.sin(a) * RIDE_R;
    // Brass pole from deck to canopy.
    props.push({
      kind: "cylinder",
      position: [x, 14, z],
      radius: 0.35,
      height: 20,
      color: brass,
      texture: "metal",
      metalness: 0.8,
      roughness: 0.25,
      attachTo: RING_ID,
    });
    // The horse itself, turned to face ALONG the ride rather than outward (see horseFacing).
    props.push({
      kind: "box",
      position: [x, 9, z],
      size: [4.5, 2.4, 1.4],
      color: horseCol,
      texture: "wood",
      rotation: [0, horseFacing(i), 0],
      roughness: 0.6,
      metalness: 0.05,
      attachTo: RING_ID,
    });
    // A scallop hanging from the canopy rim -- at the rim radius, its top edge flush with
    // the cone's base circle, lying tangentially along the rim like a real canvas valance.
    props.push({
      kind: "box",
      position: [Math.cos(a) * RIM_R, CANOPY_RIM_Y - SCALLOP_H / 2, Math.sin(a) * RIM_R],
      size: [4, SCALLOP_H, 0.5],
      color: canvasRed,
      texture: "fabric",
      rotation: [0, horseFacing(i), 0],
      roughness: 0.85,
      metalness: 0.03,
      attachTo: RING_ID,
    });
  }

  return props;
}
