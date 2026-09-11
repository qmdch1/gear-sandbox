import { describe, it, expect } from "vitest";
import {
  machineTone,
  BASE_FREQUENCY,
  MAX_FREQUENCY,
  MAX_GAIN,
  MAX_CLICK_RATE,
  MIN_AUDIBLE_SPIN,
} from "../../src/audio/machineTone";
import { AudioEngine } from "../../src/audio/audioEngine";
import { createShowroomLayout } from "../../src/sim/showroom";
import { tick } from "../../src/sim/simulation";
import type { GearInstance } from "../../src/sim/types";

function gear(overrides: Partial<GearInstance> = {}): GearInstance {
  return {
    id: "g", type: "spur", position: [0, 0, 0], axis: [0, 1, 0],
    teeth: 20, module: 1, durabilityMax: 100, durabilityCurrent: 100,
    broken: false, rotation: 0, angularVelocity: 0, ...overrides,
  };
}

describe("machineTone", () => {
  it("is silent with no gears and with everything stopped", () => {
    expect(machineTone([]).gain).toBe(0);
    expect(machineTone([gear({ angularVelocity: 0 })]).gain).toBe(0);
    // Below the audible threshold counts as stopped, matching what the simulation calls moving.
    expect(machineTone([gear({ angularVelocity: MIN_AUDIBLE_SPIN })]).gain).toBe(0);
  });

  it("takes its pitch from the FASTEST gear, not the average", () => {
    // What an ear picks out of a running machine is its most excited part. Averaging would let a
    // big slow flywheel mute a shrieking little pinion beside it.
    const withPinion = machineTone([
      gear({ id: "slow", angularVelocity: 0.1 }),
      gear({ id: "fast", angularVelocity: 20 }),
    ]);
    const slowOnly = machineTone([gear({ id: "slow", angularVelocity: 0.1 })]);
    expect(withPinion.frequency).toBeGreaterThan(slowOnly.frequency);
    expect(withPinion.frequency).toBeCloseTo(machineTone([gear({ angularVelocity: 20 })]).frequency, 9);
  });

  it("rises with speed but never past the ceiling, however absurd the input", () => {
    // Gear speeds here are unbounded: a crank can be set to anything and a step-up train
    // multiplies it. An unmapped rise would eventually shriek.
    let previous = 0;
    for (const speed of [0.1, 1, 5, 50, 500]) {
      const f = machineTone([gear({ angularVelocity: speed })]).frequency;
      expect(f).toBeGreaterThan(previous);
      expect(f).toBeLessThanOrEqual(MAX_FREQUENCY);
      previous = f;
    }
    expect(machineTone([gear({ angularVelocity: 1e9 })]).frequency).toBeLessThanOrEqual(MAX_FREQUENCY);
    expect(machineTone([gear({ angularVelocity: 1e9 })]).clickRate).toBeLessThanOrEqual(MAX_CLICK_RATE);
  });

  it("gets louder as more of the layout actually turns", () => {
    const half = machineTone([gear({ id: "a", angularVelocity: 2 }), gear({ id: "b", angularVelocity: 0 })]);
    const all = machineTone([gear({ id: "a", angularVelocity: 2 }), gear({ id: "b", angularVelocity: 2 })]);
    expect(all.gain).toBeGreaterThan(half.gain);
    expect(all.gain).toBeCloseTo(MAX_GAIN, 9);
    expect(half.gain).toBeCloseTo(MAX_GAIN / 2, 9);
  });

  it("treats a broken gear as stopped -- it neither turns nor passes drive on", () => {
    const spinning = gear({ id: "a", angularVelocity: 3 });
    const dead = gear({ id: "b", angularVelocity: 3, broken: true });
    expect(machineTone([spinning, dead]).gain).toBeCloseTo(MAX_GAIN / 2, 9);
  });

  it("starts from the base frequency when nothing is moving", () => {
    expect(machineTone([gear()]).frequency).toBe(BASE_FREQUENCY);
  });

  it("produces a sane tone for the real running showroom", () => {
    let layout = createShowroomLayout();
    for (let i = 0; i < 120; i++) {
      const r = tick(layout, 1 / 60, 1, { wear: false });
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    const tone = machineTone(layout.gears);
    expect(tone.gain).toBeGreaterThan(0);
    expect(tone.gain).toBeLessThanOrEqual(MAX_GAIN);
    expect(tone.frequency).toBeGreaterThan(BASE_FREQUENCY);
    expect(tone.frequency).toBeLessThanOrEqual(MAX_FREQUENCY);
    expect(Number.isFinite(tone.clickRate)).toBe(true);
  });
});

describe("AudioEngine without an audio device", () => {
  it("reports itself unsupported and stays silent instead of throwing", async () => {
    // The node test environment has no window and no AudioContext. Every method must be a no-op:
    // an app that crashed where audio is unavailable would be far worse than a quiet one.
    expect(AudioEngine.supported).toBe(false);
    const engine = new AudioEngine();
    expect(engine.isMuted).toBe(true);
    expect(engine.audible).toBe(false);
    await engine.resume();
    expect(engine.audible).toBe(false);
    engine.setMuted(false);
    engine.update([gear({ angularVelocity: 5 })]);
    engine.blip("place");
    expect(engine.audible).toBe(false); // never started, so never audible
  });
});
