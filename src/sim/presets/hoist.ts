import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Mirrors `car.ts`'s own `seedGear`
 *  helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way `car.ts`
 *  and `clock.ts` are. */
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

/** The belt's speed reduction from the crank's small pulley to the drum: pitchRadius 4 / 16.
 *  Kept as a named constant because the reciprocating stroke below is derived from it. */
const BELT_RATIO = 0.25;

/** How far the hook can rise before it reaches the headblock under the gantry beam. */
export const HOOK_TRAVEL = 22;

/** The effective radius the rope spools at on the drum -- the drum's inner rope hub, not its
 *  full pitch radius (16), which would whip the hook to the top in five seconds. Rope-on-drum
 *  kinematics give the hook `drumRotation * ROPE_RADIUS` of lift, so at the drum's 0.25 rad/s
 *  this is 0.75 world units per second: a lift you can actually watch. */
export const ROPE_RADIUS = 3;

/** A hand-cranked hoist/winch -- a belt-and-pulley demo of REAL mechanical advantage,
 *  the opposite pedagogical point from `car.ts`. `car.ts` uses four pulleys of
 *  IDENTICAL size to show "one engine, four wheels, locked to the same speed" (a
 *  synchronization demo). This preset instead uses two pulleys of DELIBERATELY
 *  DIFFERENT size -- a small driving pulley on the hand crank, and a much larger
 *  driven pulley acting as the winch drum -- to show the classic speed-reduction
 *  tradeoff a belt/pulley pair provides: turn the small pulley fast, the large pulley
 *  (the drum a real winch's rope/cable would spool onto) turns proportionally slower.
 *
 *  In reality that speed reduction is exactly how a hand winch trades crank speed for
 *  lifting force (mechanical advantage) -- but, same stated non-goal as
 *  `differential`'s and `planetary`'s own `GEAR_NOTES`, this sandbox does not model
 *  torque or force at all, only angular velocity/rotation. So the claim this preset
 *  actually makes -- and the only claim its test suite verifies -- is a SPEED ratio:
 *  the drum turns at exactly 1/4 the crank's angular speed, same direction. It does
 *  NOT simulate lifting a load or claim to move more weight; there is no rope/load
 *  mechanic in this sandbox to make that claim honest.
 *
 *  Layout (top-down, X = crank-to-drum direction):
 *
 *    기중기_손잡이 (0,0,0)         <- hand crank, drives the small pulley
 *    기중기_소형풀리 (0,0,0)       <- small driving pulley, coincident with the crank
 *    기중기_대형풀리 (30,0,0)      <- large driven pulley == the winch drum
 *
 *  기중기_소형풀리 sits EXACTLY coincident with 기중기_손잡이 -- same position [0,0,0],
 *  same axis [0,1,0]. `pulley` is one of `evaluatePair`'s `COINCIDENT_ONLY` types
 *  (meshing.ts): it has no direct tooth-mesh rule of its own and only ever receives
 *  rotation by sharing a shaft with whatever drives it -- exactly the same
 *  crank-coincident-with-first-pulley pattern `car.ts` uses for its engine/front-left
 *  wheel. A `RemoteLink` (`kind: "belt"`) then carries power on to 기중기_대형풀리,
 *  the drum, positioned 30 units away -- belt links have no distance/geometry
 *  constraint in `evaluatePair` (unlike a tooth `"mesh"` edge), so this spacing is a
 *  free layout choice, not a physical requirement; 30 matches `car.ts`'s own
 *  crank-to-far-wheel spacing convention.
 *
 *  The two pulleys are DELIBERATELY different sizes:
 *    기중기_소형풀리: teeth 8,  module 1 -> pitchRadius (1*8)/2  = 4
 *    기중기_대형풀리: teeth 32, module 1 -> pitchRadius (1*32)/2 = 16
 *
 *  `graph.ts`'s `buildEdges` computes a belt link's ratio as
 *  `pitchRadius(a) / pitchRadius(b)` (NOT teeth-based, unlike a `"chain"` link) --
 *  confirmed directly in `graph.ts` before writing this preset. For the
 *  { a: 기중기_소형풀리, b: 기중기_대형풀리 } link that's 4/16 = 0.25: the large
 *  drum turns at exactly a quarter of the small pulley's speed. Combined with the
 *  coincident 1:1 crank<->small-pulley coupling, and the fact that
 *  `propagateRotation` (rotation.ts) uses `sign = +1` for EVERY `coupling` and
 *  `belt` edge -- never the `-1` an ordinary tooth mesh gets -- the drum ends up
 *  turning at EXACTLY 0.25x the crank's angular velocity, same sign, never reversed.
 *  That's the honest, verifiable claim of this preset: a 4:1 SPEED reduction from
 *  crank to drum, verified numerically (not just derived on paper) in
 *  tests/sim/presets/hoist.test.ts.
 *
 *  `angularVelocity: 1.0` on the crank is a simple, easy-to-eyeball input speed; the
 *  interesting number this preset exists to demonstrate is the drum's resulting
 *  0.25x, not the crank's own arbitrary input value. */
export function createHoistPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear("기중기_손잡이", "crank", [0, 0, 0], [0, 1, 0], 16, 1, 1.0),
    seedGear("기중기_소형풀리", "pulley", [0, 0, 0], [0, 1, 0], 8, 1),
    seedGear("기중기_대형풀리", "pulley", [30, 0, 0], [0, 1, 0], 32, 1),
  ];

  // The hook RECIPROCATES: the winch lifts the load to the headblock, then lowers it back to
  // the sill, over and over. The lift is `drumRotation * ROPE_RADIUS`, and the drum turns at
  // 0.25x the crank (the 4:1 belt reduction above), so the hook travels
  // `crankRotation * 0.25 * ROPE_RADIUS` -- reversing the crank at 0 and
  // HOOK_TRAVEL / (0.25 * ROPE_RADIUS) radians sweeps the hook over exactly [0, HOOK_TRAVEL].
  gears[0].reverseAt = [0, HOOK_TRAVEL / (BELT_RATIO * ROPE_RADIUS)];

  return {
    gears,
    remoteLinks: [
      { a: "기중기_소형풀리", b: "기중기_대형풀리", kind: "belt" }, // small pulley drives the drum, 4:1 speed reduction
    ],
  };
}

/** The hoist's body -- visual props (see `render/props.ts`), no simulation. A timber gantry
 *  stands clear of the drum, and the hook block and its crate RIDE UP the guide cable as the
 *  drum turns (`windWith`), so the winch visibly lifts something instead of the drum spinning
 *  under a hook that never moves.
 *
 *  The gantry deliberately sits at x=55, well past the drum's far edge (the drum is centred at
 *  x=30 with pitch radius 16, so its disc reaches x=46). An earlier layout straddled the drum
 *  with uprights at z=+/-4, which put both posts *through* the drum's own disc; standing the
 *  gantry beyond the drum instead keeps the hook's drop line clear of it, and matches how a
 *  real winch runs its rope from a drum at the base up over the mast head. A slack rope line
 *  from the drum's rim up to the beam shows that path. */
export function createHoistProps(): Prop[] {
  const drumX = 30;
  const drumR = 16;
  const gantryX = 55;
  const timber = 0x8a6a3a;
  const darkTimber = 0x6b4f2a;
  const steel = 0x9aa0a8;
  const rope = 0x6e6a5f;
  const crate = 0x9c6b3f;

  const beamY = 25;
  const props: Prop[] = [
    // Base sill running along the ground from the crank (x=0) out under the gantry.
    { kind: "box", position: [gantryX / 2, -6, 0], size: [gantryX + 12, 2, 6], color: darkTimber, texture: "wood", roughness: 0.85, metalness: 0.05 },
    // Two gantry uprights, clear of the drum.
    { kind: "box", position: [gantryX, 9, -5], size: [2, 34, 2], color: timber, texture: "wood", roughness: 0.8, metalness: 0.05 },
    { kind: "box", position: [gantryX, 9, 5], size: [2, 34, 2], color: timber, texture: "wood", roughness: 0.8, metalness: 0.05 },
    // Top cross-beam bridging the uprights.
    { kind: "box", position: [gantryX, beamY, 0], size: [3, 2.5, 14], color: darkTimber, texture: "wood", roughness: 0.8, metalness: 0.05 },
    // The guide cable the hook rides, hanging the full travel from the beam down to the sill.
    { kind: "cylinder", position: [gantryX, 11, 0], radius: 0.35, height: 26, color: steel, texture: "metal", metalness: 0.7, roughness: 0.35 },
  ];

  // The rope running from the drum's rim up to the beam head -- a static line showing where
  // the hook's lift comes from. A cylinder's long axis is Y, so rotating about Z by
  // -atan2(dx, dy) points it along the (dx, dy) run.
  const ropeFrom: [number, number] = [drumX + drumR - 2, 0];
  const ropeTo: [number, number] = [gantryX, beamY - 1.5];
  const dx = ropeTo[0] - ropeFrom[0];
  const dy = ropeTo[1] - ropeFrom[1];
  props.push({
    kind: "cylinder",
    position: [(ropeFrom[0] + ropeTo[0]) / 2, (ropeFrom[1] + ropeTo[1]) / 2, 0],
    radius: 0.3,
    height: Math.hypot(dx, dy),
    color: rope, texture: "fabric",
    rotation: [0, 0, -Math.atan2(dx, dy)],
    roughness: 0.8,
    metalness: 0.1,
  });

  // Radial bars across the drum's face, attached to it, so the drum's rotation is visible --
  // a bare pulley disc is rotationally symmetric and shows no motion on its own. The drum lies
  // flat (axis Y), so the bars lie in the XZ plane and sweep about Y.
  const barLen = drumR - 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [drumX + Math.cos(a) * (barLen / 2), 1.2, Math.sin(a) * (barLen / 2)],
      size: [barLen, 0.6, 1.1],
      color: steel, texture: "metal",
      rotation: [0, -a, 0],
      metalness: 0.6,
      roughness: 0.4,
      attachTo: "기중기_대형풀리",
    });
  }

  // The hook block and the crate slung under it, both hoisted by the drum's rope.
  const lift = {
    gear: "기중기_대형풀리",
    radius: ROPE_RADIUS,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, HOOK_TRAVEL] as [number, number],
  };
  props.push({ kind: "box", position: [gantryX, -1, 0], size: [2, 2, 2], color: steel, texture: "metal", metalness: 0.7, roughness: 0.35, windWith: lift });
  props.push({ kind: "box", position: [gantryX, -3.5, 0], size: [4, 3, 4], color: crate, texture: "wood", roughness: 0.8, metalness: 0.05, windWith: lift });

  return props;
}
