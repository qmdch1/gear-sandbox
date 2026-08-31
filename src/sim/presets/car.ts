import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";

/** Builds one gear instance for a preset layout. Mirrors `defaultLayout.ts`'s own
 *  `seedGear` helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way `clock.ts`
 *  is. `module` defaults to 1, matching every wheel here (they're all deliberately
 *  identical, see the doc comment below), but kept as a parameter for the same reason
 *  `clock.ts` keeps it: consistency with the shared preset-module shape. */
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

/** A 4-wheel, belt-synchronized drivetrain -- an honest gear/belt-only demo of "one
 *  engine turns all four wheels together," NOT a literal car body/chassis (this sandbox
 *  has no non-gear decorative geometry system to draw one with). What's actually shown
 *  is four wheel-hub pulleys, arranged in a rectangular wheelbase, all visibly turning
 *  in lockstep off a single crank -- which reads clearly as "a vehicle's drivetrain"
 *  without pretending to model a differential, a transmission, or anything else this
 *  preset doesn't actually contain.
 *
 *  Layout (top-down, X = left/right axle direction, -Z = "forward"):
 *
 *    자동차_좌앞바퀴 (0,0,0) ------ 자동차_우앞바퀴 (20,0,0)      <- front axle
 *         |
 *    자동차_좌뒷바퀴 (0,0,-20) ---- 자동차_우뒷바퀴 (20,0,-20)    <- rear axle
 *
 *  자동차_엔진 (the crank) sits EXACTLY coincident with 자동차_좌앞바퀴 -- same position
 *  [0,0,0], same axis [0,1,0]. `pulley` is one of `evaluatePair`'s `COINCIDENT_ONLY`
 *  types (meshing.ts): a pulley has no direct tooth-mesh rule of its own and only ever
 *  receives rotation by sharing a shaft with whatever drives it, exactly like a
 *  chain/belt wheel is bolted straight onto a power shaft in reality. This is the same
 *  coincident-shaft pattern `defaultLayout.ts`'s own pulley+belt demo cluster already
 *  uses (crank coincident with one pulley, a `RemoteLink` carrying power on to a
 *  second) -- reused here across four wheels instead of two.
 *
 *  All four wheels share IDENTICAL teeth/module (16 / 1 -> pitchRadius 8), so every
 *  belt ratio between them (`pitchRadius(a) / pitchRadius(b)` in `graph.ts`'s
 *  `buildEdges`, for `kind: "belt"` remote links) is exactly 8/8 = 1. Combined with the
 *  coincident 1:1 crank<->front-left coupling, and the fact that `propagateRotation`
 *  (rotation.ts) uses `sign = +1` for EVERY `coupling`, `chain`, AND `belt` edge --
 *  never the `-1` an ordinary tooth mesh gets -- all four wheels end up turning at
 *  EXACTLY the engine's angular velocity, same magnitude AND same sign. That's the
 *  honest, verifiable claim of this preset: not a real car's differential-driven wheels
 *  (which don't literally share one rigid speed), but "one engine, four wheels, locked
 *  together" -- a legitimate simplified toy-car/gear-clock-style mechanism, verified
 *  numerically (not just derived on paper) in tests/sim/presets/car.test.ts.
 *
 *  Topology is a spanning TREE across the four wheels, not a loop -- three belts, not
 *  four:
 *
 *    자동차_좌앞바퀴 -- (belt) -- 자동차_우앞바퀴   (front axle)
 *    자동차_좌앞바퀴 -- (belt) -- 자동차_좌뒷바퀴   (left side)
 *    자동차_좌뒷바퀴 -- (belt) -- 자동차_우뒷바퀴   (rear axle)
 *
 *  Three belts already connect all four wheels into one component (a tree needs only
 *  N-1 edges to span N nodes); a fourth belt closing the rectangle into a loop would be
 *  redundant -- it wouldn't change any wheel's resulting speed (every wheel is already
 *  forced to the same 1:1 ratio via the tree that exists), so it's left out rather than
 *  added "for symmetry."
 *
 *  Remote links (`kind: "belt"`) have no distance/geometry constraint in `evaluatePair`
 *  at all -- they're declared directly in `LayoutState.remoteLinks` and turned into
 *  edges unconditionally by `buildEdges`, regardless of how far apart the two gears
 *  actually sit (unlike a tooth `"mesh"` edge, which DOES require the two pitch circles
 *  to be the right distance apart). That's what makes the rectangular 20-unit wheelbase
 *  above possible without contorting the wheels' positions to satisfy a mesh-distance
 *  formula that doesn't apply to belts anyway.
 *
 *  `angularVelocity: -1.0` on the engine is an arbitrary but deliberately non-trivial
 *  (non-1, non-zero, negative) speed -- chosen the same way `clock.ts`'s minute drive
 *  picks `-0.6`, so a direction/ratio test can't pass by some sign-convention accident
 *  that would only show up at a "nice" speed like 1 or -1. */
export function createCarPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear("자동차_엔진", "crank", [0, 0, 0], [0, 1, 0], 16, 1, -1.0),
    seedGear("자동차_좌앞바퀴", "pulley", [0, 0, 0], [0, 1, 0], 16, 1),
    seedGear("자동차_우앞바퀴", "pulley", [20, 0, 0], [0, 1, 0], 16, 1),
    seedGear("자동차_좌뒷바퀴", "pulley", [0, 0, -20], [0, 1, 0], 16, 1),
    seedGear("자동차_우뒷바퀴", "pulley", [20, 0, -20], [0, 1, 0], 16, 1),
  ];

  return {
    gears,
    remoteLinks: [
      { a: "자동차_좌앞바퀴", b: "자동차_우앞바퀴", kind: "belt" }, // front axle
      { a: "자동차_좌앞바퀴", b: "자동차_좌뒷바퀴", kind: "belt" }, // left side
      { a: "자동차_좌뒷바퀴", b: "자동차_우뒷바퀴", kind: "belt" }, // rear axle
    ],
  };
}
