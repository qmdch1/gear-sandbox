import { describe, it, expect } from "vitest";
import { PRESETS } from "../../src/sim/presets/index";
import { seatOnGround, lowestPoint } from "../../src/sim/ground";

/** A GUARD on a property every bundled machine should have and nothing used to check: after
 *  seating, it TOUCHES the floor.
 *
 *  `seatOnGround` has always stopped a machine sinking through the ground plane, and a test
 *  already covers that direction. The other direction went unwatched: a preset authored entirely
 *  above y = 0 simply hovered, because "nothing is below the floor" was true of it. The music box
 *  stood half a unit off the ground that way, its case resting on air, and no test in the repo
 *  could say so.
 *
 *  The same slack shows up inside machines too, and the audits kept finding it: a carousel whose
 *  deck floated 1.25 above the pad it was said to sit on, an anchor hanging 0.9 above its own
 *  deck. Those need per-preset geometry tests, which now exist. THIS test covers the one case
 *  that can be stated once for every machine at once -- the machine against the world.
 *
 *  The tolerance is a few ULPs rather than exact equality, and the reason is worth stating
 *  because "exact by construction" was the first guess and it is wrong: seating subtracts the
 *  measured lowest point, but that measurement runs a rotated prop's half-extents through
 *  sin/cos (`rotateEulerXYZ`), so the ferris wheel and the well pump land on 2.22e-16 rather
 *  than on 0. Anything larger than rounding means the measurement and the translation genuinely
 *  disagree, which is what this is watching for. */
describe("every preset sits on the ground after seating", () => {
  it("has presets to check, so a broken import cannot make this pass vacuously", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(23);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))("%s", (_id, preset) => {
    const layout = preset.build();
    const props = preset.buildProps ? preset.buildProps() : [];
    const seated = seatOnGround(layout, props);

    // ~1e-15 is the rounding floor for a machine with rotated props; 1e-9 is far below any
    // gap a person could see (one world unit is one centimetre) and far above the noise.
    expect(lowestPoint(seated.layout.gears, seated.props)).toBeCloseTo(0, 9);
  });

  it("is idempotent -- seating an already-seated machine changes nothing", () => {
    for (const preset of PRESETS) {
      const once = seatOnGround(preset.build(), preset.buildProps ? preset.buildProps() : []);
      const twice = seatOnGround(once.layout, once.props);
      expect(twice.layout.gears.map((g) => g.position)).toEqual(once.layout.gears.map((g) => g.position));
      expect(twice.props.map((p) => p.position)).toEqual(once.props.map((p) => p.position));
    }
  });
});
