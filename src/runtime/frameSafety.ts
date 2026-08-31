// Defense-in-depth wrapper for the per-frame render loop (see main.ts's `animate()`).
//
// `tick`/`sceneSync.sync`/`diagnosticsPanel.render` are meant to never throw under valid
// `GearInstance` data -- both the client (`isValidGear`) and the server (`isValidGearsArray`)
// validate layouts deeply before they ever reach this loop. This module exists purely for
// whatever DOES slip through anyway (a corrupted localStorage entry, a malformed imported
// file, a future regression): a single uncaught throw inside `requestAnimationFrame`'s
// callback used to permanently and silently freeze the whole app, because nothing ever
// scheduled the next frame again.
//
// `createFrameRunner` is a small stateful wrapper, not a bare function, because it needs to
// track *consecutive* failures across many calls (one per animation frame) without leaking
// that counter into module-level (and therefore test-polluting) state.

export interface FrameErrorInfo {
  /** The value thrown/rejected by the wrapped frame function. */
  error: unknown;
  /** How many frames in a row have now failed, including this one. Resets to 0 on any success. */
  consecutiveCount: number;
  /** Total number of frames run through this runner so far (successes and failures). */
  frame: number;
}

export interface FrameRunnerOptions {
  /** Called every time the wrapped frame function throws, before the give-up threshold is hit. */
  onError: (info: FrameErrorInfo) => void;
  /**
   * Called exactly once, the moment consecutive failures reach `maxConsecutiveErrors` -- right
   * before the runner gives up and starts refusing to run further frames. Distinct from
   * `onError` so callers can show a different ("we stopped retrying") message.
   */
  onGiveUp: (info: FrameErrorInfo) => void;
  /**
   * How many consecutive frame failures to tolerate before giving up entirely. Retrying forever
   * is the right default (a transient failure should self-heal next frame), but if the *same*
   * error recurs every single frame indefinitely that's a silent infinite-error-spam risk, not a
   * recovery -- so past this many consecutive failures the runner stops calling `fn` at all.
   * Defaults to 60 (about one second of failures at 60fps): long enough that a one-off hiccup
   * never trips it, short enough that a truly wedged loop stops spamming the console quickly.
   */
  maxConsecutiveErrors?: number;
}

export interface FrameRunner {
  /**
   * Runs `fn` once, catching any synchronous throw. Returns `true` if the caller should keep
   * scheduling frames (success, or a failure that hasn't hit the give-up threshold yet), or
   * `false` once the runner has given up -- the caller should stop calling `requestAnimationFrame`
   * again at that point.
   */
  runFrame(fn: () => void): boolean;
  /** Number of consecutive failures so far (0 right after any success). */
  readonly consecutiveErrors: number;
  /** True once `maxConsecutiveErrors` has been reached and the runner has given up for good. */
  readonly gaveUp: boolean;
}

const DEFAULT_MAX_CONSECUTIVE_ERRORS = 60;

export function createFrameRunner(options: FrameRunnerOptions): FrameRunner {
  const maxConsecutiveErrors = options.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
  let consecutiveErrors = 0;
  let frame = 0;
  let gaveUp = false;

  return {
    get consecutiveErrors() {
      return consecutiveErrors;
    },
    get gaveUp() {
      return gaveUp;
    },
    runFrame(fn: () => void): boolean {
      if (gaveUp) return false;
      frame += 1;
      try {
        fn();
        consecutiveErrors = 0;
        return true;
      } catch (error) {
        consecutiveErrors += 1;
        const info: FrameErrorInfo = { error, consecutiveCount: consecutiveErrors, frame };
        if (consecutiveErrors >= maxConsecutiveErrors) {
          gaveUp = true;
          options.onGiveUp(info);
          return false;
        }
        options.onError(info);
        return true;
      }
    },
  };
}
