import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Mirrors `defaultLayout.ts`'s own
 *  `seedGear` helper exactly (same "freshly placed, caller-supplied stable id" shape) --
 *  duplicated here rather than imported so each preset module stays a fully
 *  self-contained, hand-verifiable spec of its own mechanism, the same way
 *  `defaultLayout.ts` is. */
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

/** ONE module for the whole train, and it is the point of this file's shape. Two gears can only
 *  mesh if their teeth are the same SIZE, and module IS tooth size (circular pitch = pi * module;
 *  `render/gearGeometry.ts` cuts real involute teeth with addendum = 1*module). `evaluatePair`
 *  never compares it -- it only asks whether the centres sit pitchRadius(a) + pitchRadius(b)
 *  apart -- so mixing modules across a mesh yields a perfectly happy simulation edge and a
 *  rendered pair whose teeth are visibly different sizes and could not engage on any real shaft.
 *
 *  This preset used to do exactly that: a module-1 idler against a module-0.2 hour wheel, five
 *  times finer. The radii summed correctly so nothing complained, and the pair was drawn as a
 *  120-tooth wheel whose teeth were a fifth the size of the pinion beside it. Module 0.2 had been
 *  chosen to keep a 120-tooth wheel small; the honest cost of one module is simply that a 12:1
 *  reduction in a single stage needs a big wheel, and this preset now pays it. */
export const CLOCK_MODULE = 1;
export const MINUTE_TEETH = 10;
export const IDLER_TEETH = 12;
export const HOUR_TEETH = 120;

export const MINUTE_R = pitchRadius(MINUTE_TEETH, CLOCK_MODULE); // 5
export const IDLER_R = pitchRadius(IDLER_TEETH, CLOCK_MODULE); // 6
export const HOUR_R = pitchRadius(HOUR_TEETH, CLOCK_MODULE); // 60

export const MINUTE_IDLER_DISTANCE = MINUTE_R + IDLER_R; // 11
export const IDLER_HOUR_DISTANCE = IDLER_R + HOUR_R; // 66

export const MINUTE_X = 0;
export const IDLER_X = MINUTE_X + MINUTE_IDLER_DISTANCE; // 11
export const HOUR_X = IDLER_X + IDLER_HOUR_DISTANCE; // 77

/** End-to-end minute:hour ratio, by tooth count alone (module only sets physical size, never gear
 *  ratio -- `evaluatePair`'s mesh ratio is always teeth_a / teeth_b):
 *
 *    minute -> idler = 10/12,  idler -> hour = 12/120 = 1/10
 *    combined        = (10/12) * (12/120) = 10/120 = 1/12
 *
 *  The idler's own count cancels out entirely, so the ratio depends only on the minute drive's
 *  10 teeth and the hour wheel's 120 -- which is why the idler is free to be whatever size the
 *  layout needs. */
export const MINUTE_TO_HOUR = MINUTE_TEETH / HOUR_TEETH; // 1/12

export const MINUTE_SPEED = -0.6;

/** An EXPOSED gear-train clock -- a skeleton-clock-style movement where the gears themselves ARE
 *  the display, laid open on a bench rather than hidden behind a painted face.
 *
 *  Three gears, one straight mesh line, no remote links, all on module 1:
 *
 *    시계_분침구동 (minute drive, crank, 10T) --11-- 시계_아이들러 (idler, spur, 12T)
 *        --66-- 시계_시침휠 (hour wheel, spur, 120T)
 *
 *  WHY THE IDLER EXISTS: an ordinary external tooth mesh always reverses direction. A single mesh
 *  from the minute drive straight to a 12:1-reduced hour wheel would therefore run the hour wheel
 *  BACKWARDS relative to the minute hand -- correct ratio, visibly wrong clock. Real clock "motion
 *  work" solves exactly this with an idler whose only job is to add a second reversal; two
 *  reversals cancel, so the hour wheel turns the SAME way as the minute drive, only 12x slower.
 *
 *  Geometry (pitch radius = module * teeth / 2; two meshed gears sit the sum of their radii apart):
 *
 *    분침구동: 10T,  module 1 -> r 5.   at x = 0
 *    아이들러:  12T,  module 1 -> r 6.   at x = 11  (5 + 6)
 *    시침휠:   120T, module 1 -> r 60.  at x = 77  (11 + 6 + 60)
 *
 *  The hour wheel really is 120 across. That is what a 12:1 reduction in ONE stage costs at a
 *  single module, and it is the honest price of the claim this preset makes; the alternative --
 *  a fifth-size tooth on the big wheel -- is not a real gear pair. A machine wanting both 12:1
 *  and a compact wheel needs two stages; `clocktower.ts` takes the other way out and claims a
 *  smaller single-stage ratio instead.
 *
 *  Overlap: the only non-meshing pair is the minute drive and the hour wheel, 77 apart against
 *  `classify`'s floor of 0.95 * (5 + 60) = 61.75 -- comfortably clear. (Meshing pairs are exempt
 *  from the overlap check anyway.)
 *
 *  `angularVelocity: -0.6` on the minute drive is an arbitrary but deliberately non-trivial
 *  (non-1, negative) speed -- chosen so the direction-matching test cannot pass by some
 *  sign-convention accident that would only show up at a "nice" speed like 1 or -1. */
export function createClockPreset(): LayoutState {
  const gears: GearInstance[] = [
    seedGear("시계_분침구동", "crank", [MINUTE_X, 0, 0], [0, 1, 0], MINUTE_TEETH, CLOCK_MODULE, MINUTE_SPEED),
    seedGear("시계_아이들러", "spur", [IDLER_X, 0, 0], [0, 1, 0], IDLER_TEETH, CLOCK_MODULE),
    seedGear("시계_시침휠", "spur", [HOUR_X, 0, 0], [0, 1, 0], HOUR_TEETH, CLOCK_MODULE),
  ];

  return { gears, remoteLinks: [] };
}

/** The dial furniture was originally drawn around a radius-12 hour wheel. Every dimension below is
 *  that original figure times `S`, so the face keeps its proportions now the wheel is five times
 *  bigger, instead of leaving hair-thin ticks scattered around a huge dial. */
const S = HOUR_R / 12;

/** The clock's decorative body -- purely visual props (see `render/props.ts`), no simulation. A
 *  brass bezel ring + backplate turn the big slow hour wheel into a recognizable clock dial, and
 *  twelve tick marks around the rim make it read as a clock face rather than just a large gear.
 *  The fast minute drive + idler upstream stay visible as the exposed "movement" feeding the dial.
 *  Everything is centred on the hour wheel and lies flat in the XZ plane (the gears spin about
 *  world Y, so their faces point up -- the dial is viewed from above, like a skeleton-clock
 *  movement laid open on a bench). */
export function createClockProps(): Prop[] {
  const bezelR = HOUR_R + 2.5 * S; // just outside the hour wheel's teeth
  const brass = 0xb08d3a;
  const backplate = 0x2a2622;
  const tickColor = 0xf0e6c8;

  const props: Prop[] = [
    // Backplate disc sitting just behind (below) the dial gear, so the movement reads against a
    // solid face instead of the open grid. A cylinder's default axis is Y, which is exactly the
    // flat-disc orientation wanted here (no rotation).
    { kind: "cylinder", position: [HOUR_X, -0.8 * S, 0], radius: bezelR + S, height: 0.6 * S, color: backplate, texture: "metal", textureRepeat: [4, 4], roughness: 0.85, metalness: 0.1 },
    // Brass bezel ring around the dial. A torus defaults to the XY plane; rotate 90° about X to
    // lay it flat in XZ, encircling the hour wheel.
    { kind: "ring", position: [HOUR_X, 0.4 * S, 0], radius: bezelR, tube: 1.2 * S, color: brass, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.7, roughness: 0.3 },
  ];

  // Twelve hour tick marks around the bezel, every 30°, pointing radially. A box's long axis is X;
  // rotating it about Y by -angle aligns that long axis with the radial direction (cos a, 0, sin a)
  // at that clock position. The 12/3/6/9 marks are drawn a touch longer so the cardinal hours
  // stand out, like a real dial.
  const tickRingR = bezelR - 1.2 * S;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const cardinal = i % 3 === 0;
    props.push({
      kind: "box",
      position: [HOUR_X + Math.cos(a) * tickRingR, 0.5 * S, Math.sin(a) * tickRingR],
      size: [(cardinal ? 2.6 : 1.6) * S, 0.5 * S, (cardinal ? 0.9 : 0.6) * S],
      color: tickColor,
      texture: "metal",
      rotation: [0, -a, 0],
      metalness: 0.3,
      roughness: 0.6,
    });
  }

  // The clock hand: a long pointer attached to the hour wheel, sweeping around the dial as that
  // gear turns. `attachTo` spins a prop about ITS GEAR'S centre, and the dial is centred on that
  // same wheel, so the hand really does turn on the face it is drawn on. The hour wheel runs at
  // 1/12 the minute drive, so this sweeps slowly -- the visible "clock is running" motion. A box's
  // long axis is X, so at rest it points to 3 o'clock and the sweep carries it round from there.
  const handColor = 0x1a1a1e;
  // Long enough to reach the hour marks, short enough to stay OUT of the brass bezel ring.
  // The ring is a torus at y = 0.4*S whose tube radius is 1.2*S, so its material begins at
  // radius bezelR - 1.2*S = HOUR_R + 1.3*S. At the old HOUR_R + 1.5*S the hand tip was 0.2*S
  // beyond that -- the tip sat inside the brass, by 0.74 units measured against the torus at
  // the hand's lowest edge -- while this comment said it reached "just inside the bezel". The
  // tick marks sit on the same radius the ring's inner surface does, so pointing AT them is
  // exactly where the hand should stop.
  const handLen = HOUR_R + 1.2 * S;
  props.push({
    kind: "box",
    position: [HOUR_X + handLen / 2, 1.1 * S, 0],
    size: [handLen, 0.7 * S, 0.9 * S],
    color: handColor,
    texture: "metal",
    metalness: 0.4,
    roughness: 0.4,
    attachTo: "시계_시침휠",
  });
  // A counterweight tail on the opposite side, so the hand reads as a proper clock hand pivoting
  // at the centre rather than a bar stuck out one side.
  props.push({
    kind: "box",
    position: [HOUR_X - 2 * S, 1.1 * S, 0],
    size: [4 * S, 0.7 * S, 0.9 * S],
    color: handColor,
    texture: "metal",
    metalness: 0.4,
    roughness: 0.4,
    attachTo: "시계_시침휠",
  });
  // Centre hub cap the hand pivots on (round, so it shows no motion itself -- the hand is what
  // reads).
  props.push({
    kind: "cylinder",
    position: [HOUR_X, 1.3 * S, 0],
    radius: 1.4 * S,
    height: 0.8 * S,
    color: 0xc9a227,
    texture: "metal",
    metalness: 0.7,
    roughness: 0.3,
    attachTo: "시계_시침휠",
  });

  return props;
}
