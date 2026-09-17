import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** A GUARD against the commonest defect this repo has had in its tests: an assertion that
 *  cannot fail.
 *
 *  A sweep of the preset suites found twenty-four of them, in files that otherwise test real
 *  things. They all share one shape: a constant is compared against the very expression it is
 *  DEFINED by, so no edit to the preset, the geometry or the simulation could ever turn the
 *  assertion red.
 *
 *      // musicbox.ts
 *      export const REDUCTION_TIP_R = REDUCTION_R + BOX_MODULE;
 *      // musicbox.test.ts -- true by construction, and it was the only content of its test
 *      expect(REDUCTION_TIP_R).toBe(REDUCTION_R + BOX_MODULE);
 *
 *  The algebraic variants are the same defect wearing a disguise, and this catches those too,
 *  because it works on WHICH NAMES appear rather than on the shape of the expression:
 *
 *      export const STROKE = BUCKET_TRAVEL / ROPE_RADIUS;
 *      expect(STROKE * ROPE_RADIUS).toBeCloseTo(BUCKET_TRAVEL, 12);   // ROPE_RADIUS cancels
 *
 *  THE RULE. An assertion is flagged when a single line mentions an exported preset constant
 *  together with every named constant in that constant's own definition. That is precisely the
 *  situation where both sides of the comparison come from the same place, which is the
 *  giveaway AGENTS.md describes.
 *
 *  IF THIS FAILS ON YOUR NEW TEST, the fix is never to placate the check -- it is to assert
 *  something that could be false. Cross a boundary:
 *    - a constant against a LITERAL (`expect(TIP_R).toBe(6.25)`) -- then a changed definition
 *      shows up as a changed number a reader can verify by eye;
 *    - a constant against MEASURED geometry (`computeSpurProfilePoints`, a prop's position) --
 *      which is what ties a clearance constant to the tooth actually drawn;
 *    - a derivation against a simulation that was actually RUN (`tick` the layout and measure
 *      where the thing ended up).
 *  The preset suites now do all three; see the music box and gearbox clearance tests for the
 *  measured-geometry pattern, and the conveyor stroke test for the simulated one.
 *
 *  Deliberately scoped to `tests/sim/presets` against `src/sim/presets`: those are the files
 *  where a preset's constants and its test sit close enough together for the mistake to be
 *  easy, and keeping the scope tight keeps the check free of false positives. */

const PRESET_SRC = join(__dirname, "..", "..", "src", "sim", "presets");
const PRESET_TESTS = join(__dirname, "..", "sim", "presets");

/** `export const NAME = <expr>;` where the expression names other constants. `pitchRadius(...)`
 *  definitions are skipped: a test asserting `WORM_R === module * starts / 2` against
 *  `pitchRadius(starts, module)` is checking `pitchRadius`'s own formula by an independent
 *  route, which is a real assertion rather than a restatement. */
function definitionsFor(preset: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let src: string;
  try {
    src = readFileSync(join(PRESET_SRC, `${preset}.ts`), "utf8");
  } catch {
    return out;
  }
  for (const m of src.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*([^;]+);/g)) {
    const [, name, expr] = m;
    if (expr.includes("pitchRadius")) continue;
    const operands = new Set([...expr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((o) => o[1]));
    if (operands.size > 0) out.set(name, operands);
  }
  return out;
}

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

describe("no assertion may restate the definition it is checking", () => {
  const files = readdirSync(PRESET_TESTS).filter((f) => f.endsWith(".test.ts"));

  it("has preset suites to check at all, so a bad path cannot make this pass vacuously", () => {
    // This guard would itself be a vacuous test if `files` were empty -- exactly the defect it
    // exists to catch.
    expect(files.length).toBeGreaterThan(20);
    expect(definitionsFor("musicbox").size).toBeGreaterThan(5);
  });

  it.each(files)("%s", (file) => {
    const preset = file.replace(".test.ts", "");
    const defs = definitionsFor(preset);
    const offenders: string[] = [];

    readFileSync(join(PRESET_TESTS, file), "utf8")
      .split("\n")
      .forEach((raw, i) => {
        // Trim the CR before stripping the comment. These files are checked out with CRLF
        // endings, and `.` does not match `\r`, so `/\/\/.*$/` never reaches the end of a line
        // that still carries one -- the comment survives and a constant named only in prose
        // reads as part of the assertion. This guard produced exactly two false positives that
        // way before the trim was added, one of them on a comment explaining a removed
        // assertion, which is about as pointed a demonstration as the bug could have managed.
        const line = raw.replace(/\r$/, "").replace(/\/\/.*$/, "");
        if (!line.includes("expect(")) return;
        // Only an EQUALITY against the whole definition is the vacuous shape. An inequality
        // against part of it is falsifiable and must not be flagged: `FAN_Z` is
        // `BARREL_LEN / 2 + 1.5`, and `expect(FAN_Z).toBeGreaterThan(BARREL_LEN / 2)` goes red
        // as soon as that offset stops being positive. A first version of this check ignored
        // the matcher and cost exactly one real assertion, which an audit agent then found by
        // setting FAN_Z to 0 and watching nothing fail.
        if (!/\.(toBe|toEqual|toStrictEqual|toBeCloseTo)\(/.test(line)) return;
        const names = new Set([...line.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]));
        if (names.size < 2) return;
        for (const [name, operands] of defs) {
          if (names.has(name) && isSubset(operands, names)) {
            offenders.push(`${file}:${i + 1}  ${name} = ${[...operands].join(", ")}\n    ${line.trim()}`);
            break;
          }
        }
      });

    expect(offenders, `assertions that restate their own definition:\n${offenders.join("\n")}`).toEqual([]);
  });
});
