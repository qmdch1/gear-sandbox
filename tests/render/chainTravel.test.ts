import { describe, it, expect } from "vitest";
import { chainLinkPositions, chainLinkLayout } from "../../src/render/chainGeometry";

const WIDTH = 0.15; // what sceneSync uses for a chain
const SPAN = 30;

describe("chainLinkPositions", () => {
  it("spaces links evenly and keeps them all on the run", () => {
    const at0 = chainLinkPositions(SPAN, WIDTH, 0);
    const { linkCount } = chainLinkLayout(SPAN, WIDTH);
    expect(at0).toHaveLength(linkCount);
    for (const t of at0) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
    const sorted = [...at0].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeCloseTo(1 / linkCount, 9);
    }
  });

  it("advances the links as the chain travels -- the whole point", () => {
    // Without a travel term the ribbon depended only on its endpoints, and since gears never
    // move, every frame produced identical links: sprockets spinning over a chain that sat
    // perfectly still.
    const { pitch } = chainLinkLayout(SPAN, WIDTH);
    const at0 = chainLinkPositions(SPAN, WIDTH, 0);
    const quarter = chainLinkPositions(SPAN, WIDTH, pitch * 0.25);
    expect(quarter).not.toEqual(at0);
    // A quarter-pitch of travel moves every link a quarter of a slot along.
    const { linkCount } = chainLinkLayout(SPAN, WIDTH);
    expect(quarter[0] - at0[0]).toBeCloseTo(0.25 / linkCount, 9);
  });

  it("returns to the same set of positions after exactly one link pitch of travel", () => {
    // The links are interchangeable, so a full pitch of travel must be indistinguishable from
    // none -- that is what makes the crawl seamless instead of jumping at the wrap.
    const { pitch } = chainLinkLayout(SPAN, WIDTH);
    const at0 = [...chainLinkPositions(SPAN, WIDTH, 0)].sort((a, b) => a - b);
    const afterOne = [...chainLinkPositions(SPAN, WIDTH, pitch)].sort((a, b) => a - b);
    expect(afterOne).toHaveLength(at0.length);
    for (let i = 0; i < at0.length; i++) expect(afterOne[i]).toBeCloseTo(at0[i], 9);
  });

  it("keeps every link on the run at any travel, forwards or backwards", () => {
    const { pitch } = chainLinkLayout(SPAN, WIDTH);
    for (const travel of [-1000, -pitch * 3.7, -0.01, 0, 0.01, pitch * 12.3, 5000]) {
      const ts = chainLinkPositions(SPAN, WIDTH, travel);
      expect(ts.length).toBe(chainLinkLayout(SPAN, WIDTH).linkCount);
      for (const t of ts) {
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(1);
      }
    }
  });

  it("never changes how many links a run has, however far it travels", () => {
    // A varying count would make the chain visibly gain or shed plates as it ran.
    const { linkCount } = chainLinkLayout(SPAN, WIDTH);
    for (let i = 0; i < 200; i++) {
      expect(chainLinkPositions(SPAN, WIDTH, i * 0.137).length).toBe(linkCount);
    }
  });

  it("degenerates safely on a zero-length run", () => {
    for (const t of chainLinkPositions(0, WIDTH, 12.5)) expect(Number.isFinite(t)).toBe(true);
  });
});
