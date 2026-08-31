import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";

/** Builds one gear instance for a preset layout. Mirrors `defaultLayout.ts`'s own
 *  `seedGear` helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way
 *  `defaultLayout.ts` and `clock.ts` are. `module` defaults to 1 like the showcase's own
 *  gears; this preset doesn't need to override it, but the parameter is kept for the
 *  same reason `clock.ts` keeps it. */
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

/** 성문 (castle drawbridge / portcullis gate) -- the simplest possible mechanism in this
 *  gallery: a winch handle (crank) that meshes a rack DIRECTLY, no separate pinion
 *  object, exactly the pattern `defaultLayout.ts`'s own rack demo already establishes
 *  ("seed-rack-crank" meshing "seed-rack" -- see that file's section 4). Turning the
 *  winch accumulates the rack's `linearPosition`, which is what drives the gate up and
 *  down.
 *
 *  Two gears, one mesh:
 *
 *    성문_손잡이 (winch handle, crank, 14T) --mesh-- 성문_도개교 (the gate, rack, 8T)
 *
 *  WHY THE AXES ARE UNUSUAL FOR THIS CODEBASE:
 *
 *  Every other rack demo in this project (see `defaultLayout.ts`'s "seed-rack") uses the
 *  house convention of `axis: [0, 1, 0]` for the pinion (rotating about world Y, i.e.
 *  spinning flat like a tabletop dial) and `axis: [0, 0, 1]` for the rack (travelling
 *  along world Z, i.e. sliding sideways along the ground plane). That reads correctly
 *  for a horizontal slider, but a castle gate has to visibly rise and fall along world
 *  Y -- sliding it sideways along Z would look like a drawer, not a portcullis.
 *
 *  So this preset deliberately swaps both axes relative to the house convention:
 *
 *  - The winch handle's rotation axis is `[1, 0, 0]` (world X), NOT the usual `[0, 1, 0]`.
 *    A gear rotating about a horizontal (X) axis stands its wheel face upright, facing
 *    the viewer -- the correct visual metaphor for a ship's-wheel-style winch someone
 *    would stand in front of and turn, rather than a flat dial spinning underfoot.
 *  - The rack's travel axis is `[0, 1, 0]` (world Y), NOT the usual `[0, 0, 1]`. Since a
 *    rack's `linearPosition` accumulates along its own `axis` (see `simulation.ts`'s
 *    `tick()`, which advances `linearPosition` by `linearVelocity * dt` with no other
 *    axis-remapping), a Y-axis rack is what makes the gate genuinely move UP and DOWN in
 *    world space as the winch turns, instead of sideways.
 *
 *  GEOMETRY DERIVATION (verified against the real `evaluatePair` in
 *  tests/sim/presets/castle.test.ts, not just derived on paper):
 *
 *    winch handle: teeth 14, module 1 -> pitchRadius (1*14)/2 = 7.  Position [0, 0, 0].
 *    gate (rack):  teeth 8,  module 1 (pitchRadius unused for the rack side of the check).
 *                  Position [7, 0, 0] -- exactly `pitchRadius` of the winch handle away
 *                  along X, so the winch handle sits squarely on the gate's vertical
 *                  travel line.
 *
 *  `evaluatePair`'s rack branch (meshing.ts) requires, for a rack `r` and pinion `p`:
 *
 *    1. Perpendicular axes: |dot(r.axis, p.axis)| < PERP_DOT_THRESHOLD (0.1).
 *       dot([0,1,0], [1,0,0]) = 0 -- exactly perpendicular, well inside tolerance.
 *
 *    2. The pinion's center must sit `pitchRadius(pinion)` away from the rack's
 *       infinite travel LINE (the line through `r.position` in direction `r.axis`), not
 *       just from `r.position` itself -- a rack can be engaged anywhere along its length.
 *       The gate's travel line is every point `[7, t, 0]` for any `t` (through [7,0,0]
 *       in direction [0,1,0]). The perpendicular distance from the winch handle's center
 *       [0,0,0] to that line is `sqrt((0-7)^2 + (0-0)^2) = 7`, exactly equal to the winch
 *       handle's own pitchRadius (7) -- zero error, well inside MESH_TOLERANCE (5%).
 *
 *    3. One-way drive: the rack branch always sets `oneWay` so the toothed pinion drives
 *       the rack and never the reverse (a rack has no rotation to drive anything back
 *       with) -- confirmed both by direct construction here and, more generally
 *       (regardless of which gear is passed as `a`/`b`), by
 *       tests/sim/meshing.test.ts's "keeps the pinion as the sole driver of the rack
 *       regardless of which argument position each is passed in".
 *
 *  LINEAR SPEED (verified via real `tick()` calls in castle.test.ts, sampled across
 *  hundreds of ticks, not just asserted nonzero): `propagateRotation` (rotation.ts) sets
 *  a driven rack's linear velocity to `driverAngularVelocity * pitchRadius(driver)`, sign
 *  depending on edge direction. With the winch handle's `angularVelocity: 0.5` and
 *  pitchRadius 7, the gate's `linearPosition` should advance at exactly
 *  `0.5 * 7 = 3.5` world units per second -- i.e. `3.5 * dt` per tick -- and MONOTONICALLY
 *  (the winch handle's speed never changes sign), which is exactly what a real winch
 *  raising a gate at constant speed should do. */
export function createCastlePreset(): LayoutState {
  const handleX = 0;
  const gateX = handleX + pitchRadius(14, 1); // 0 + 7 = 7

  const gears: GearInstance[] = [
    seedGear("성문_손잡이", "crank", [handleX, 0, 0], [1, 0, 0], 14, 1, 0.5),
    seedGear("성문_도개교", "rack", [gateX, 0, 0], [0, 1, 0], 8, 1),
  ];

  return { gears, remoteLinks: [] };
}
