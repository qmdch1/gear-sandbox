import type { GearInstance } from "../sim/types";

/** What the machine should sound like right now: a whirr whose pitch tracks how fast the
 *  fastest gear is turning, and whose loudness tracks how much of the layout is actually
 *  moving. Both are plain numbers -- no Web Audio here -- so the mapping is unit-testable
 *  without an audio device, the same way `spinAttachedPose` keeps the prop maths testable
 *  without a renderer. */
export interface MachineTone {
  /** Fundamental of the whirr, in Hz. */
  frequency: number;
  /** 0 when nothing is moving, rising toward 1 as more of the layout turns. */
  gain: number;
  /** Ticks per second of the tooth-click layer -- how often teeth pass the mesh point. */
  clickRate: number;
}

/** A gear this slow counts as stopped. Matches `wear.ts`'s own MIN_SPIN_TO_WEAR so "moving" means
 *  the same thing to the ears as it does to the simulation. */
export const MIN_AUDIBLE_SPIN = 0.01;

/** Hz the whirr sits at when the machinery is barely turning, and the most it can climb to.
 *  Bounded on purpose: gear speeds in this sandbox are unbounded (a crank can be set to anything,
 *  and a step-up train multiplies it), and an unbounded mapping would eventually produce a
 *  painful shriek or an inaudible sub-bass. */
export const BASE_FREQUENCY = 55;
export const MAX_FREQUENCY = 420;

/** How loud the whirr can get, before the listener's own volume setting. Deliberately modest:
 *  this plays continuously for as long as the tab is open, and anything that is pleasant for ten
 *  seconds and grating after ten minutes is the wrong level. */
export const MAX_GAIN = 0.18;

/** Teeth passing the mesh point per second, for the click layer. Capped so a fast train becomes a
 *  smooth purr rather than thousands of clicks a second. */
export const MAX_CLICK_RATE = 90;

/** Derives the tone from the live gear list.
 *
 *  Pitch follows the FASTEST gear rather than the average: what an ear picks out of a running
 *  machine is its most excited part, and averaging would make a big slow flywheel mute a shrieking
 *  little pinion beside it. Loudness follows the FRACTION of gears moving, so a half-connected
 *  layout is audibly quieter than one where everything turns -- which doubles as feedback that
 *  something is not being driven.
 *
 *  Broken gears count as stopped: they neither turn nor pass drive on, so they should not be
 *  contributing to how busy the machine sounds. */
export function machineTone(gears: GearInstance[]): MachineTone {
  if (gears.length === 0) return { frequency: BASE_FREQUENCY, gain: 0, clickRate: 0 };

  let fastest = 0;
  let moving = 0;
  let teethPerSecond = 0;
  for (const g of gears) {
    if (g.broken) continue;
    const speed = Math.abs(g.angularVelocity);
    if (speed <= MIN_AUDIBLE_SPIN) continue;
    moving++;
    if (speed > fastest) fastest = speed;
    // Revolutions per second times tooth count -- how often this gear's teeth pass a fixed point.
    teethPerSecond += (speed / (Math.PI * 2)) * Math.max(1, g.teeth);
  }

  if (moving === 0) return { frequency: BASE_FREQUENCY, gain: 0, clickRate: 0 };

  // Log-ish curve: doubling the speed should raise the pitch by a similar step whether it went
  // from 0.5 to 1 or from 8 to 16, which is how pitch is actually perceived.
  const frequency = Math.min(MAX_FREQUENCY, BASE_FREQUENCY * (1 + Math.log2(1 + fastest)));
  const gain = MAX_GAIN * (moving / gears.length);
  const clickRate = Math.min(MAX_CLICK_RATE, teethPerSecond);
  return { frequency, gain, clickRate };
}
