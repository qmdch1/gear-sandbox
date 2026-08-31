import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";

/** Builds one gear instance for a preset layout. Mirrors `defaultLayout.ts`'s own
 *  `seedGear` helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way
 *  `defaultLayout.ts` is. `module` defaults to 1 like the showcase's own gears, but a
 *  preset that (like this clock) deliberately mixes tooth sizes to hit an exact pitch
 *  radius needs to override it per-gear, so it's a parameter here rather than hardcoded. */
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

/** An EXPOSED gear-train clock -- a steampunk/skeleton-clock-style mechanism where the
 *  gears themselves ARE the visible display, not a hidden movement behind a painted
 *  face. There are no separate "hand" objects pointing at printed numbers: the minute
 *  crank's own protruding handle geometry (`crankGeometry`) doubles as the minute
 *  indicator, and the hour wheel is a plain large-diameter gear disc that's clearly
 *  visible turning at a fraction of the minute crank's speed -- the ratio is what reads
 *  as "clock-like," not a literal clock face replica.
 *
 *  Three gears, one straight mesh line, no remote links:
 *
 *    시계_분침구동 (minute drive, crank, 10T) --11-- 시계_아이들러 (idler, spur, 12T) --18-- 시계_시침휠 (hour wheel, spur, 120T)
 *
 *  Why the idler exists: an ordinary external gear mesh always reverses rotation
 *  direction (spec-standard behaviour also used throughout `defaultLayout.ts`'s main
 *  drivetrain). A single mesh from the minute crank straight to a 12:1-reduced hour
 *  wheel would therefore spin the hour wheel BACKWARDS relative to the minute hand --
 *  correct ratio, wrong direction, and visibly wrong for a clock. Real clock "motion
 *  work" solves exactly this with an idler gear between the minute and hour trains
 *  purely to add a second reversal; two reversals cancel, so the hour wheel ends up
 *  turning the SAME direction as the minute crank, only 12x slower. The idler's own
 *  tooth count (12) does affect the intermediate mesh's ratio arithmetic but cancels
 *  out of the end-to-end minute:hour ratio entirely -- see the ratio derivation below.
 *
 *  Tooth/module/position math (module * teeth / 2 = pitch radius; two meshed gears'
 *  pitch radii must sum to their center distance):
 *
 *    minute drive: teeth 10, module 1 -> pitchRadius 5.  Position [0, 0, 0].
 *    idler:        teeth 12, module 1 -> pitchRadius 6.  Position [11, 0, 0]
 *                  (5 + 6 = 11, matching the minute drive's mesh distance exactly).
 *    hour wheel:   teeth 120, module 0.2 -> pitchRadius (0.2*120)/2 = 12. Position [29, 0, 0]
 *                  (idler-to-hour-wheel mesh distance 6 + 12 = 18, so 11 + 18 = 29).
 *
 *  End-to-end ratio (minute crank -> idler -> hour wheel), by tooth count alone (module
 *  only sets physical size/spacing, not gear ratio -- `evaluatePair`'s mesh ratio is
 *  always teeth-a / teeth-b):
 *
 *    minute->idler ratio = 10/12, idler->hour ratio = 12/120 = 1/10
 *    combined = (10/12) * (12/120) = 10/120 = 1/12
 *
 *  i.e. the hour wheel turns exactly 1/12 as fast as the minute crank -- the real 12:1
 *  hour:minute relationship -- and, because of the double reversal above, in the SAME
 *  rotation direction. Both claims are verified numerically (not just derived on paper)
 *  in tests/sim/presets/clock.test.ts via real `evaluatePair`/`tick()` calls, sampled
 *  across hundreds of ticks.
 *
 *  `angularVelocity: -0.6` on the minute drive is an arbitrary but deliberately
 *  non-trivial (non-1, negative) speed -- chosen so the direction-matching test can't
 *  pass by some sign-convention accident that would only show up at a "nice" speed like
 *  1 or -1. */
export function createClockPreset(): LayoutState {
  const minuteX = 0;
  const idlerX = minuteX + pitchRadius(10, 1) + pitchRadius(12, 1); // 5 + 6 = 11
  const hourX = idlerX + pitchRadius(12, 1) + pitchRadius(120, 0.2); // 11 + (6 + 12) = 29

  const gears: GearInstance[] = [
    seedGear("시계_분침구동", "crank", [minuteX, 0, 0], [0, 1, 0], 10, 1, -0.6),
    seedGear("시계_아이들러", "spur", [idlerX, 0, 0], [0, 1, 0], 12, 1),
    seedGear("시계_시침휠", "spur", [hourX, 0, 0], [0, 1, 0], 120, 0.2),
  ];

  return { gears, remoteLinks: [] };
}
