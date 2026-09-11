import type { GearInstance } from "../sim/types";
import { machineTone, type MachineTone } from "./machineTone";

type Ctor = typeof AudioContext;

/** Everything is synthesised at runtime -- there are no audio files in this repo, exactly as
 *  there are no image files: `render/textures.ts` draws its materials procedurally and this draws
 *  its sounds the same way. A running machine is a low sawtooth whirr through a lowpass filter,
 *  with a band of filtered noise over it for the tooth clatter; a UI action is a short enveloped
 *  blip. Nothing to download, nothing to licence, and the machine's pitch can follow its actual
 *  speed instead of looping a fixed recording.
 *
 *  Browsers refuse to start audio without a user gesture, so nothing is created until `resume()`
 *  is called from a real click. Before that -- and anywhere `AudioContext` does not exist at all,
 *  such as the jsdom test environment -- every method is a no-op and the app runs silently rather
 *  than throwing. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private whirr: OscillatorNode | null = null;
  private whirrGain: GainNode | null = null;
  private whirrFilter: BiquadFilterNode | null = null;
  private clatter: AudioBufferSourceNode | null = null;
  private clatterGain: GainNode | null = null;
  private clatterFilter: BiquadFilterNode | null = null;
  private muted = true;
  private started = false;

  /** True once audio is actually running and unmuted. */
  get audible(): boolean {
    return this.started && !this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Whether this environment can play audio at all. */
  static get supported(): boolean {
    return typeof window !== "undefined" && AudioEngine.contextCtor() !== null;
  }

  private static contextCtor(): Ctor | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  }

  /** Starts (or resumes) audio. MUST be called from a user gesture -- browsers block it
   *  otherwise, and a blocked context stays suspended forever without telling you. */
  async resume(): Promise<void> {
    const Ctx = AudioEngine.contextCtor();
    if (!Ctx) return;
    try {
      if (!this.ctx) {
        this.ctx = new Ctx();
        this.build();
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.started = true;
    } catch {
      // A refused or unavailable audio device must never take the app down with it.
      this.ctx = null;
      this.started = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  /** Points the whirr and the clatter at the layout's current state. Safe to call every frame:
   *  it only nudges two AudioParams, and it uses `setTargetAtTime` so a sudden speed change
   *  glides instead of clicking. */
  update(gears: GearInstance[]): void {
    if (!this.ctx || !this.started) return;
    const tone: MachineTone = machineTone(gears);
    const t = this.ctx.currentTime;
    this.whirr?.frequency.setTargetAtTime(tone.frequency, t, 0.08);
    this.whirrGain?.gain.setTargetAtTime(tone.gain, t, 0.12);
    // The filter opens as the machine speeds up, so a fast train sounds bright and busy and a
    // slow one sounds muffled -- the same cue a real machine gives.
    this.whirrFilter?.frequency.setTargetAtTime(400 + tone.frequency * 6, t, 0.12);
    this.clatterGain?.gain.setTargetAtTime(tone.gain * 0.35, t, 0.12);
    this.clatterFilter?.frequency.setTargetAtTime(600 + tone.clickRate * 30, t, 0.12);
  }

  /** A short blip for a UI action. `kind` picks the character: a bright "place", a duller
   *  "remove", a soft "select". */
  blip(kind: "place" | "remove" | "select"): void {
    if (!this.ctx || !this.started || this.muted) return;
    const base = kind === "place" ? 660 : kind === "remove" ? 220 : 440;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = kind === "remove" ? "square" : "triangle";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(kind === "remove" ? base * 0.6 : base * 1.5, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** The thud of a dropped part landing. `speed` is its approach speed in world units per
   *  second, straight out of the physics: loudness and brightness both follow it, so a part
   *  dropped from three metres lands hard and its third bounce is a tick. Above the reference
   *  speed the level stops climbing, because a part dropped from the ceiling should not be
   *  louder than the rest of the app put together. */
  impact(speed: number): void {
    if (!this.ctx || !this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const strength = Math.min(1, speed / 400); // 400 units/s ~ an 80 cm drop on Earth
    if (strength < 0.05) return;
    // A short burst of noise through a lowpass: the same synthesis as the tooth clatter, but
    // enveloped as a single hit rather than looped.
    const frames = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 7919;
    for (let i = 0; i < frames; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      // Decaying envelope baked into the buffer, so the hit needs no extra automation.
      data[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / frames) ** 3;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    // A harder landing rings brighter; a soft one is a dull knock.
    filter.frequency.value = 300 + strength * 2200;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.35 * strength;
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(t);
  }

  /** Builds the permanent voices once. The whirr and the clatter run forever and are shaped
   *  purely by gain, which is far cheaper than starting and stopping nodes as machines come and
   *  go -- and avoids the click that stopping a live oscillator produces. */
  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    this.whirr = ctx.createOscillator();
    this.whirr.type = "sawtooth";
    this.whirrFilter = ctx.createBiquadFilter();
    this.whirrFilter.type = "lowpass";
    this.whirrFilter.Q.value = 3;
    this.whirrGain = ctx.createGain();
    this.whirrGain.gain.value = 0;
    this.whirr.connect(this.whirrFilter).connect(this.whirrGain).connect(this.master);
    this.whirr.start();

    // Two seconds of white noise on a loop, bandpassed -- the tooth clatter over the whirr.
    const frames = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic noise (a small LCG) rather than Math.random, so the texture is identical
    // every run and a listener never hears the app "sound different today".
    let seed = 22222;
    for (let i = 0; i < frames; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.clatter = ctx.createBufferSource();
    this.clatter.buffer = buffer;
    this.clatter.loop = true;
    this.clatterFilter = ctx.createBiquadFilter();
    this.clatterFilter.type = "bandpass";
    this.clatterFilter.Q.value = 1.2;
    this.clatterGain = ctx.createGain();
    this.clatterGain.gain.value = 0;
    this.clatter.connect(this.clatterFilter).connect(this.clatterGain).connect(this.master);
    this.clatter.start();
  }
}
