import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Mirrors the other preset modules'
 *  self-contained `seedGear` helper exactly. */
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

const SAILS_Y = 26; // the sails hub sits high on the tower
const SAILS_Z = 4; // slightly in front of the tower so the sails clear it

/** A windmill. The real, verifiable mechanism is the sail hub (the crank -- here the
 *  "wind" is the input that turns it) driving, through a right-angle bevel mesh, a vertical
 *  shaft gear that would run the millstones below. The props (`createWindmillProps`) carry
 *  the recognizable shape: a tapered stone tower, a cap, and the four sails fanning off the
 *  hub.
 *
 *  Layout (front view, X = left/right, Y = up, +Z = toward viewer):
 *
 *    풍차_날개축 (crank/sail hub, high on the tower, axis +Z so the sails face the viewer)
 *      -- bevel mesh (right angle) --> 풍차_수직축 (bevel gear on the vertical mill shaft)
 *
 *  The sail hub spins about Z (sails face forward); the vertical mill shaft spins about Y.
 *  Those axes are perpendicular, which is exactly what a `bevel` mesh requires -- a real
 *  windmill uses a bevel/crown gear at the top of the tower to turn the horizontal sail
 *  drive into the vertical shaft that runs the stones, and this models that right-angle
 *  turn honestly. */
export function createWindmillPreset(): LayoutState {
  // Sail hub (bevel crank) at the cap, axis +Z. Vertical shaft bevel gear directly below-ish,
  // axis +Y, placed at the perpendicular-mesh distance (sum of pitch radii) from the hub.
  const hubR = (1 * 16) / 2; // 8
  const shaftR = (1 * 16) / 2; // 8
  const meshDist = hubR + shaftR; // 16
  const gears: GearInstance[] = [
    // The sail hub is a CRANK -- the one gear type whose speed is an external input, here
    // standing in for "the wind." A bevel gear can't be a power source (its speed is
    // derived), so making the hub a crank is what actually drives the mill. A crank meshing
    // a bevel at a right angle still forms a valid perpendicular bevel mesh in evaluatePair
    // (the bevel shaft satisfies the `bevelInvolved` branch).
    seedGear("풍차_날개축", "crank", [0, SAILS_Y, SAILS_Z], [0, 0, 1], 16, 1, 0.7),
    // Vertical mill shaft: a bevel gear meshing the hub at a right angle, sitting the mesh
    // distance below-and-behind, on axis +Y. Position it straight below the hub minus the
    // mesh distance along Y, keeping the same X and a Z on the hub's rotation plane.
    seedGear("풍차_수직축", "bevel", [0, SAILS_Y - meshDist, SAILS_Z], [0, 1, 0], 16, 1),
  ];

  return { gears, remoteLinks: [] };
}

/** The windmill's body -- purely visual props (see `render/props.ts`), no simulation. A
 *  tapered stone tower, a conical-ish cap, and four sails fanning off the hub, so the two
 *  bevel gears read as an actual windmill. */
export function createWindmillProps(): Prop[] {
  const stone = 0x8d8478; // sandstone tower
  const cap = 0x5b3a29; // dark timber cap
  const sail = 0xe8e2d0; // canvas sails
  const sailFrame = 0x6b4f2a; // sail spars

  const props: Prop[] = [
    // Tower: a big cylinder from the ground up to just under the cap. (A cylinder with
    // equal top/bottom radius; the taper is faked by a slightly narrower cap on top.)
    { kind: "cylinder", position: [0, 10, 0], radius: 7, height: 32, color: stone, texture: "stone", radialSegments: 24, roughness: 0.92, metalness: 0.03 },
    // Cap sitting on top of the tower, where the sail hub is mounted.
    { kind: "cylinder", position: [0, 27, 0], radius: 5.5, height: 6, color: cap, texture: "wood", radialSegments: 24, roughness: 0.85, metalness: 0.05 },
  ];

  // Four sails fanning off the hub, in the XY plane (facing +Z toward the viewer). Each
  // sail is a long thin box (the spar) rotated to its clock position; a real windmill's
  // sails are offset from center, so anchor each spar's inner end near the hub.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // +45° so they read as an "X", not a "+"
    const reach = 11;
    props.push({
      // Spar -- attached to the sail hub so it actually turns with the wind-driven crank.
      kind: "box",
      position: [Math.cos(a) * reach, SAILS_Y + Math.sin(a) * reach, SAILS_Z + 1.5],
      size: [22, 1.4, 0.6],
      color: sailFrame, texture: "wood",
      rotation: [0, 0, a],
      metalness: 0.1,
      roughness: 0.7,
      attachTo: "풍차_날개축",
    });
    props.push({
      // Canvas sail panel, offset to one side of the spar (like a real windmill's cloth).
      kind: "box",
      position: [Math.cos(a) * reach - Math.sin(a) * 2.5, SAILS_Y + Math.sin(a) * reach + Math.cos(a) * 2.5, SAILS_Z + 1.5],
      size: [18, 4, 0.3],
      color: sail, texture: "fabric",
      rotation: [0, 0, a],
      metalness: 0.05,
      roughness: 0.8,
      attachTo: "풍차_날개축",
    });
  }

  return props;
}
