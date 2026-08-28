import type { GearInstance, GearType, LayoutState } from "./types";
import { GEAR_DEFS } from "./gearDefs";

/** Builds one gear instance for the default showcase layout. Durability/broken/rotation
 *  fields follow the same "freshly placed" convention as `gearFactory.createGear` --
 *  the difference here is a caller-supplied, stable `id` (so the layout is reproducible
 *  and testable) and explicit `teeth`/`axis`/`angularVelocity`, since a showcase gear
 *  train needs specific tooth counts and axis directions to actually mesh, not the
 *  palette's one-size-fits-all defaults. */
function seedGear(
  id: string,
  type: GearType,
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
  angularVelocity = 0,
): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id,
    type,
    position,
    axis,
    teeth,
    module: 1,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

const pitchRadius = (teeth: number, module = 1) => (module * teeth) / 2;

/** The layout a first-time visitor sees instead of an empty canvas: three independent,
 *  fully-powered gear trains that each demonstrate a different mechanism this sandbox
 *  supports, laid out so every mesh/coupling distance is exact and no two unrelated
 *  gears sit close enough to misread as a collision (verified by `buildEdges`+`classify`
 *  reporting zero unconnected/no-power/overlap gears -- see the accompanying test).
 *
 *  1. Main drivetrain: crank -> spur -> helical -> bevel (90-degree turn) -> a small
 *     idler spur coincident with a worm (shaft coupling) -> worm wheel (large one-way
 *     reduction) -> a load, so durability visibly depletes faster on this branch.
 *  2. Differential demo: its own crank -> input bevel -> differential -> one output
 *     shaft, showing the "locked" output behaviour (spec §3.6).
 *  3. A standalone planetary set, powered by its own small crank, off to one side.
 *
 *  Rack & pinion is intentionally not included here yet -- its tooth geometry doesn't
 *  yet face the pinion correctly (a known, tracked follow-up), so a showcase default
 *  should not lead with a combination that still looks wrong. */
export function createDefaultLayout(): LayoutState {
  const spurX = pitchRadius(20) + pitchRadius(10);
  const helicalX = spurX + pitchRadius(10) + pitchRadius(16);
  const bevelZ = pitchRadius(16) + pitchRadius(16);
  const connZ = bevelZ + pitchRadius(16) + pitchRadius(3);
  const wheelZ = connZ + pitchRadius(2) + pitchRadius(20);

  const diffCrankX = -60;
  const diffInputX = diffCrankX + pitchRadius(16) + pitchRadius(14);
  const differentialZ = pitchRadius(14) + pitchRadius(20);

  const planetaryZ = -90;
  const planCrankX = pitchRadius(40) + pitchRadius(10);

  const gears: GearInstance[] = [
    // 1. Main drivetrain
    seedGear("seed-crank", "crank", [0, 0, 0], [0, 1, 0], 20, 1),
    seedGear("seed-spur", "spur", [spurX, 0, 0], [0, 1, 0], 10),
    seedGear("seed-helical", "helical", [helicalX, 0, 0], [0, 1, 0], 16),
    seedGear("seed-bevel", "bevel", [helicalX, 0, bevelZ], [1, 0, 0], 16),
    seedGear("seed-idler", "spur", [helicalX, 0, connZ], [0, 0, 1], 3),
    seedGear("seed-worm", "worm", [helicalX, 0, connZ], [0, 0, 1], 2),
    seedGear("seed-wheel", "spur", [helicalX, 0, wheelZ], [0, 1, 0], 20),
    seedGear("seed-load", "load", [helicalX, 0.02, wheelZ], [0, 1, 0], 0),

    // 2. Differential demo
    seedGear("seed-diff-crank", "crank", [diffCrankX, 0, 0], [0, 1, 0], 16, 1),
    seedGear("seed-diff-input", "bevel", [diffInputX, 0, 0], [1, 0, 0], 14),
    seedGear("seed-differential", "differential", [diffInputX, 0, differentialZ], [0, 1, 0], 20),
    seedGear("seed-diff-output", "spur", [diffInputX, 0.02, differentialZ], [0, 1, 0], 12),

    // 3. Standalone planetary set
    seedGear("seed-planetary", "planetary", [0, 0, planetaryZ], [0, 1, 0], 40),
    seedGear("seed-planetary-crank", "crank", [planCrankX, 0, planetaryZ], [0, 1, 0], 10, 1),
  ];

  return { gears, remoteLinks: [] };
}
