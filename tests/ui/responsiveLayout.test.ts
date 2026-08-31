import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// style.css isn't processed through any JS module graph vitest can import directly, so this
// reads the raw stylesheet source and asserts on its text -- a regression guard against
// someone accidentally deleting/narrowing the narrow-viewport rules below, not a substitute
// for actually rendering the page in a browser (see track report for that caveat).
const css = readFileSync(resolve(__dirname, "../../src/style.css"), "utf-8");

describe("responsive layout (src/style.css)", () => {
  it("keeps the desktop-style #app grid as the unconditional baseline (fixed 220px sidebar column)", () => {
    // Must appear outside of any @media block, i.e. before the first @media in the file.
    const mediaIndex = css.indexOf("@media");
    const baselineRuleIndex = css.indexOf("#app {");
    expect(baselineRuleIndex).toBeGreaterThan(-1);
    expect(baselineRuleIndex).toBeLessThan(mediaIndex === -1 ? Infinity : mediaIndex);
    expect(css.slice(baselineRuleIndex, baselineRuleIndex + 200)).toMatch(
      /grid-template-columns:\s*220px 1fr/,
    );
  });

  it("defines a max-width media query at 700px or wider that stacks #app into a single column", () => {
    const mediaMatch = css.match(/@media \(max-width:\s*(\d+)px\)\s*{([\s\S]*?)}\s*}/);
    expect(mediaMatch).not.toBeNull();

    const breakpoint = Number(mediaMatch![1]);
    // The task's viewport-starvation math only holds for phone-class widths; keep the
    // breakpoint within the 700-800px range this fix was designed around.
    expect(breakpoint).toBeGreaterThanOrEqual(700);
    expect(breakpoint).toBeLessThanOrEqual(800);

    const mediaBody = mediaMatch![2];
    // Single column: sidebar and viewport stack as rows instead of side-by-side columns.
    expect(mediaBody).toMatch(/#app\s*{[^}]*grid-template-columns:\s*1fr/);
    // Sidebar height is capped (it already has its own overflow-y: auto for scrolling
    // controls) so #viewport/#scene-canvas keeps a clear majority of the screen height.
    expect(mediaBody).toMatch(/#sidebar\s*{[^}]*max-height:\s*40vh/);
  });

  it("never removes #sidebar's own vertical scroll (overflow-y: auto), which the narrow layout relies on", () => {
    expect(css).toMatch(/#sidebar\s*{[^}]*overflow-y:\s*auto/);
  });
});
