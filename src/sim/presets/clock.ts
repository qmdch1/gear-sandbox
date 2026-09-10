import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

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
 *  1 or -1.
 *
 *  KNOWN DEFECT: the idler and the hour wheel do NOT share a module (1 vs 0.2). Their pitch radii
 *  do sum to the centre distance, so `evaluatePair` returns a perfectly happy mesh edge -- but
 *  module IS tooth size, so the two wheels are RENDERED with teeth five times different and could
 *  not engage on any real shaft. `evaluatePair` never compares module, which is why nothing
 *  catches it. Module 0.2 was picked to keep a 120-tooth wheel compact enough to sit beside a
 *  12-tooth idler; the honest ways out are to claim a smaller single-stage ratio (as
 *  `clocktower.ts` does, saying plainly that its 1/4 is not a real clock's 12:1) or to reach 1/12
 *  through two stages at one module, the way a real going train does. Tracked in docs/STATUS.md
 *  rather than left for the next reader to trip over. */
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

// The hour wheel (teeth 120, module 0.2 -> pitchRadius 12) is the biggest, slowest,
// most dial-like gear, sitting at HOUR_X. The clock body wraps THAT gear as its face.
const HOUR_X = 29;
const HOUR_PITCH_RADIUS = 12;

/** The clock's decorative body -- purely visual props (see `render/props.ts`), no
 *  simulation. A brass bezel ring + backplate turn the big slow hour wheel into a
 *  recognizable clock dial, and twelve tick marks around the rim make it read as a clock
 *  face rather than just a large gear. The fast minute crank + idler upstream stay
 *  visible as the exposed "movement" feeding the dial. Everything is centered on the hour
 *  wheel and lies flat in the XZ plane (the gears spin about world Y, so their faces point
 *  up -- the dial is viewed from above/at an angle, like a skeleton-clock movement laid
 *  open on a bench). */
export function createClockProps(): Prop[] {
  const bezelR = HOUR_PITCH_RADIUS + 2.5; // 14.5 -- just outside the hour wheel's teeth
  const brass = 0xb08d3a;
  const backplate = 0x2a2622;
  const tickColor = 0xf0e6c8;

  const props: Prop[] = [
    // Backplate disc sitting just behind (below) the dial gear, so the movement reads
    // against a solid face instead of the open grid. Cylinder default axis is Y, which is
    // exactly the flat-disc orientation we want here (no rotation).
    { kind: "cylinder", position: [HOUR_X, -0.8, 0], radius: bezelR + 1, height: 0.6, color: backplate, texture: "metal", roughness: 0.85, metalness: 0.1 },
    // Brass bezel ring around the dial. A torus defaults to the XY plane; rotate 90° about
    // X to lay it flat in XZ, encircling the hour wheel.
    { kind: "ring", position: [HOUR_X, 0.4, 0], radius: bezelR, tube: 1.2, color: brass, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.7, roughness: 0.3 },
  ];

  // Twelve hour tick marks around the bezel, every 30°, pointing radially. A box's long
  // axis is X; rotating it about Y by -angle aligns that long axis with the radial
  // direction (cos a, 0, sin a) at that clock position. The 12/3/6/9 marks are drawn a
  // touch longer so the cardinal hours stand out, like a real dial.
  const tickRingR = bezelR - 1.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const cardinal = i % 3 === 0;
    props.push({
      kind: "box",
      position: [HOUR_X + Math.cos(a) * tickRingR, 0.5, Math.sin(a) * tickRingR],
      size: [cardinal ? 2.6 : 1.6, 0.5, cardinal ? 0.9 : 0.6],
      color: tickColor,
      texture: "metal",
      rotation: [0, -a, 0],
      metalness: 0.3,
      roughness: 0.6,
    });
  }

  // The clock hand: a long pointer attached to the hour wheel, sweeping around the dial as
  // that gear turns (attachTo spins it about the wheel's Y axis, around the dial centre).
  // The hour wheel turns 1/12 as fast as the minute drive, so this hand sweeps the dial
  // slowly -- the visible "clock is running" motion. A box's long axis is X, so at rest it
  // points to 3 o'clock; the sweep carries it round from there.
  const handColor = 0x1a1a1e;
  const handLen = HOUR_PITCH_RADIUS + 1.5; // reaches just inside the bezel
  props.push({
    kind: "box",
    position: [HOUR_X + handLen / 2, 1.1, 0],
    size: [handLen, 0.7, 0.9],
    color: handColor,
    texture: "metal",
    metalness: 0.4,
    roughness: 0.4,
    attachTo: "시계_시침휠",
  });
  // A counterweight tail on the opposite side, so the hand reads as a proper clock hand
  // pivoting at the centre rather than a bar stuck out one side.
  props.push({
    kind: "box",
    position: [HOUR_X - 2, 1.1, 0],
    size: [4, 0.7, 0.9],
    color: handColor,
    texture: "metal",
    metalness: 0.4,
    roughness: 0.4,
    attachTo: "시계_시침휠",
  });
  // Centre hub cap the hand pivots on (also spins, harmlessly, being round).
  props.push({
    kind: "cylinder",
    position: [HOUR_X, 1.3, 0],
    radius: 1.4,
    height: 0.8,
    color: 0xc9a227,
    texture: "metal",
    metalness: 0.7,
    roughness: 0.3,
    attachTo: "시계_시침휠",
  });

  return props;
}
