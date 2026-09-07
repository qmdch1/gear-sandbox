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

  return {
    gears,
    remoteLinks: [
      { a: "기중기_소형풀리", b: "기중기_대형풀리", kind: "belt" }, // small pulley drives the drum, 4:1 speed reduction
    ],
  };
}

/** The hoist's decorative body -- purely visual props (see `render/props.ts`), no
 *  simulation. A timber gantry stands over the drum (the big driven pulley at x=30): two
 *  uprights and a top beam, with a hanging hook line, plus a base sill tying the crank end
 *  to the drum end, so the belt-and-pulleys read as an actual hand winch/crane rather than
 *  two discs and a ribbon. */
export function createHoistProps(): Prop[] {
  const drumX = 30;
  const timber = 0x8a6a3a;
  const darkTimber = 0x6b4f2a;
  const steel = 0x9aa0a8;

  return [
    // Base sill running along the ground from the crank (x=0) to under the drum.
    { kind: "box", position: [drumX / 2, -6, 0], size: [drumX + 10, 2, 6], color: darkTimber, roughness: 0.85, metalness: 0.05 },
    // Two gantry uprights straddling the drum.
    { kind: "box", position: [drumX, 9, -4], size: [2, 34, 2], color: timber, roughness: 0.8, metalness: 0.05 },
    { kind: "box", position: [drumX, 9, 4], size: [2, 34, 2], color: timber, roughness: 0.8, metalness: 0.05 },
    // Top cross-beam bridging the uprights, over the drum.
    { kind: "box", position: [drumX, 25, 0], size: [3, 2.5, 12], color: darkTimber, roughness: 0.8, metalness: 0.05 },
    // Hanging hook line dropping from the beam (a thin vertical rod ending in a hook block).
    { kind: "cylinder", position: [drumX, 12, 0], radius: 0.35, height: 24, color: steel, metalness: 0.7, roughness: 0.35 },
    { kind: "box", position: [drumX, -1, 0], size: [2, 2, 2], color: steel, metalness: 0.7, roughness: 0.35 },
  ];
}
