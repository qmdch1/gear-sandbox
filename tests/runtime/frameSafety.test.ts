import { describe, it, expect, vi } from "vitest";
import { createFrameRunner } from "../../src/runtime/frameSafety";

describe("createFrameRunner", () => {
  it("runs the frame function and reports success by returning true, without calling onError", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp });
    const fn = vi.fn();

    const keepGoing = runner.runFrame(fn);

    expect(keepGoing).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(runner.consecutiveErrors).toBe(0);
    expect(runner.gaveUp).toBe(false);
  });

  it("catches a throw, calls onError with the error and a consecutiveCount of 1, and still says keep going", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp });
    const boom = new Error("synthetic frame failure");

    const keepGoing = runner.runFrame(() => {
      throw boom;
    });

    expect(keepGoing).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ error: boom, consecutiveCount: 1, frame: 1 });
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(runner.consecutiveErrors).toBe(1);
    expect(runner.gaveUp).toBe(false);
  });

  it("resets the consecutive-error count back to 0 after a success following failures", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp });

    runner.runFrame(() => {
      throw new Error("one");
    });
    runner.runFrame(() => {
      throw new Error("two");
    });
    expect(runner.consecutiveErrors).toBe(2);

    runner.runFrame(() => {});
    expect(runner.consecutiveErrors).toBe(0);

    runner.runFrame(() => {
      throw new Error("three");
    });
    expect(onError).toHaveBeenLastCalledWith({ error: new Error("three"), consecutiveCount: 1, frame: 4 });
  });

  it("keeps retrying indefinitely for isolated (non-consecutive) failures rather than giving up", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp, maxConsecutiveErrors: 3 });

    for (let i = 0; i < 20; i += 1) {
      const keepGoing = runner.runFrame(() => {
        if (i % 2 === 0) throw new Error(`fail ${i}`);
      });
      expect(keepGoing).toBe(true);
    }

    expect(onGiveUp).not.toHaveBeenCalled();
    expect(runner.gaveUp).toBe(false);
  });

  it("gives up once consecutive failures reach maxConsecutiveErrors, calling onGiveUp exactly once", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp, maxConsecutiveErrors: 3 });

    const results: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(
        runner.runFrame(() => {
          throw new Error(`fail ${i}`);
        }),
      );
    }

    expect(results).toEqual([true, true, false]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledWith({ error: new Error("fail 2"), consecutiveCount: 3, frame: 3 });
    expect(runner.gaveUp).toBe(true);
  });

  it("stops invoking the frame function entirely once it has given up", () => {
    const onError = vi.fn();
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError, onGiveUp, maxConsecutiveErrors: 2 });

    runner.runFrame(() => {
      throw new Error("one");
    });
    runner.runFrame(() => {
      throw new Error("two");
    });
    expect(runner.gaveUp).toBe(true);

    const fn = vi.fn();
    const keepGoing = runner.runFrame(fn);

    expect(keepGoing).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    // onGiveUp must not fire again on subsequent calls after already giving up.
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("uses a default give-up threshold high enough that a single bad frame never triggers it", () => {
    const onGiveUp = vi.fn();
    const runner = createFrameRunner({ onError: vi.fn(), onGiveUp });

    const keepGoing = runner.runFrame(() => {
      throw new Error("one bad gear");
    });

    expect(keepGoing).toBe(true);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});
