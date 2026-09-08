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

export const HANDLE_ID = "두레우물_손잡이";
export const DRUM_ID = "두레우물_두레박드럼";

export const HANDLE_SPEED = 0.9;
/** Effective radius the rope spools at on the windlass drum. Rope-on-drum kinematics give the
 *  bucket `drumRotation * ROPE_RADIUS` of lift (the same angle x radius relation `rotation.ts`
 *  uses to drive a rack from a pinion). */
export const ROPE_RADIUS = 2.2;
/** How far the bucket travels between the water and the windlass. */
export const BUCKET_TRAVEL = 20;

/** The winding stroke, in radians of drum rotation, that carries the bucket over exactly
 *  [0, BUCKET_TRAVEL]. The drum is coincident with (so turns at the same speed as) the handle,
 *  hence the handle reverses at the same bound. */
export const STROKE = BUCKET_TRAVEL / ROPE_RADIUS;

const WELL_R = 7; // inner radius of the stone well ring
const DRUM_Y = 22; // windlass height above the ground
const BUCKET_REST_Y = -1; // bucket down at the water

/** 두레우물 (village draw-well) -- a hand-cranked windlass over a stone well ring. Turning the
 *  handle winds the rope onto the drum and the bucket climbs; wind the other way and it goes
 *  back down. That reciprocation is the whole point of the mechanism, so the handle carries a
 *  `reverseAt` stroke rather than turning forever.
 *
 *  Two gears, one coincident coupling:
 *
 *    두레우물_손잡이 (crank) --coincident--> 두레우물_두레박드럼 (pulley, the windlass drum)
 *
 *  `pulley` is one of `evaluatePair`'s COINCIDENT_ONLY types (meshing.ts): it has no tooth-mesh
 *  rule of its own and only ever receives rotation by sharing a shaft, which is exactly how a
 *  windlass drum is keyed straight onto its handle's axle. Coupling edges carry sign +1, so the
 *  drum turns at EXACTLY the handle's speed -- 1:1, no reduction. This preset makes no ratio
 *  claim at all; it is here for the rope-and-bucket motion, not a gear train.
 *
 *  Both turn about world X so the handle stands upright beside the well, the way someone would
 *  actually crank it.
 *
 *  The bucket's rise is pure kinematics, like everything else in this sandbox: rope on a drum
 *  of radius r lifts by r * angle. It says where the bucket goes, never how heavy a bucket the
 *  well could raise -- there is no force model here to make such a claim honest.
 *
 *  Stroke: the handle reverses at 0 and BUCKET_TRAVEL / ROPE_RADIUS radians, which sweeps the
 *  bucket over exactly [0, BUCKET_TRAVEL] and back, forever. Verified numerically in
 *  tests/sim/presets/wellpump.test.ts. */
export function createWellPumpPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear(HANDLE_ID, "crank", [-WELL_R - 3, DRUM_Y, 0], [1, 0, 0], 12, 1, HANDLE_SPEED),
    seedGear(DRUM_ID, "pulley", [-WELL_R - 3, DRUM_Y, 0], [1, 0, 0], 10, 1),
  ];
  // Crank up until the bucket reaches the windlass, then wind back down -- over and over.
  gears[0].reverseAt = [0, STROKE];
  return { gears, remoteLinks: [] };
}

/** The well's body: a stone ring and threshold, two timber posts carrying the windlass, a
 *  shingled roof, the rope, and the bucket that rides it. */
export function createWellPumpProps(): Prop[] {
  const stone = 0x8a8378;
  const timber = 0x7a5a33;
  const shingle = 0x5d4230;
  const iron = 0x4a4a52;
  const bucketCol = 0x8a5f33;

  const lift = {
    gear: DRUM_ID,
    radius: ROPE_RADIUS,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, BUCKET_TRAVEL] as [number, number],
  };

  const props: Prop[] = [
    // Stone well ring, and a low apron around its foot.
    { kind: "ring", position: [0, 3, 0], radius: WELL_R, tube: 1.6, color: stone, texture: "stone", rotation: [Math.PI / 2, 0, 0], roughness: 0.95, metalness: 0.03 },
    { kind: "cylinder", position: [0, 1, 0], radius: WELL_R + 1.5, height: 2, color: stone, texture: "stone", textureRepeat: [4, 1], roughness: 0.95, metalness: 0.03 },
    // Two posts carrying the windlass across the mouth of the well.
    { kind: "box", position: [0, 13, -WELL_R], size: [1.6, 22, 1.6], color: timber, texture: "wood", roughness: 0.8, metalness: 0.04 },
    { kind: "box", position: [0, 13, WELL_R], size: [1.6, 22, 1.6], color: timber, texture: "wood", roughness: 0.8, metalness: 0.04 },
    // Ridge beam and a shingled roof over the top.
    { kind: "box", position: [0, DRUM_Y + 4, 0], size: [1.4, 1.4, 2 * WELL_R + 4], color: timber, texture: "wood", roughness: 0.8, metalness: 0.04 },
    { kind: "cone", position: [0, DRUM_Y + 7, 0], radius: WELL_R + 4, height: 6, color: shingle, texture: "tile", textureRepeat: [6, 2], radialSegments: 4, rotation: [0, Math.PI / 4, 0], roughness: 0.85, metalness: 0.04 },
    // The windlass barrel itself, lying along X on the drum's axle.
    { kind: "cylinder", position: [0, DRUM_Y, 0], radius: ROPE_RADIUS, height: 2 * WELL_R, color: timber, texture: "wood", rotation: [0, 0, Math.PI / 2], roughness: 0.75, metalness: 0.05 },
    // The rope: a static guide line spanning the bucket's whole travel, which the bucket
    // climbs. (Shortening a rope would need per-frame geometry scaling; a taut guide line
    // reads correctly and keeps the prop rigid.)
    { kind: "cylinder", position: [0, (BUCKET_REST_Y + DRUM_Y) / 2, 0], radius: 0.22, height: DRUM_Y - BUCKET_REST_Y, color: iron, texture: "metal", metalness: 0.6, roughness: 0.4 },
    // The bucket, and its iron hoop, both hoisted by the drum.
    { kind: "cylinder", position: [0, BUCKET_REST_Y, 0], radius: 2.4, height: 3.4, color: bucketCol, texture: "wood", roughness: 0.75, metalness: 0.05, windWith: lift },
    { kind: "ring", position: [0, BUCKET_REST_Y + 1.4, 0], radius: 2.5, tube: 0.25, color: iron, texture: "rust", rotation: [Math.PI / 2, 0, 0], roughness: 0.7, metalness: 0.5, windWith: lift },
  ];

  // Spokes across the windlass barrel's end, so the drum's rotation is actually visible -- a
  // bare barrel is rotationally symmetric and would look motionless however fast it spun.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [-WELL_R - 0.6, DRUM_Y + Math.cos(a) * (ROPE_RADIUS / 2), Math.sin(a) * (ROPE_RADIUS / 2)],
      size: [0.5, ROPE_RADIUS, 0.5],
      color: iron,
      texture: "metal",
      rotation: [a, 0, 0],
      metalness: 0.6,
      roughness: 0.4,
      attachTo: DRUM_ID,
    });
  }

  return props;
}
