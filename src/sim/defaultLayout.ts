import type { GearInstance, GearType, LayoutState, RemoteLink } from "./types";
import { GEAR_DEFS } from "./gearDefs";

/** Builds one gear instance for the default showcase layout. Durability/broken/rotation
 *  fields follow the same "freshly placed" convention as `gearFactory.createGear` --
 *  the difference here is a caller-supplied, stable `id` (so the layout is reproducible
 *  and testable) and explicit `teeth`/`axis`/`angularVelocity`, since a showcase gear
 *  train needs specific tooth counts and axis directions to actually mesh, not the
 *  palette's one-size-fits-all defaults.
 *
 *  `wearRatio` (0-1, default 1) starts the gear partway through its durability instead
 *  of fully healthy -- every gear in this sandbox starts at 100% otherwise, so a
 *  first-time visitor would never see the green-to-yellow-to-red wear gradient
 *  (`colorForDurabilityRatio`) at all without first waiting for real wear to accumulate.
 *  A couple of gears seeded partway through show it off immediately. */
function seedGear(
  id: string,
  type: GearType,
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
  angularVelocity = 0,
  wearRatio = 1,
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
    durabilityCurrent: def.durabilityMax * wearRatio,
    broken: false,
    rotation: 0,
    angularVelocity,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

const pitchRadius = (teeth: number, module = 1) => (module * teeth) / 2;

/** The layout a first-time visitor sees instead of an empty canvas: independent,
 *  fully-powered gear trains that each demonstrate a different mechanism this sandbox
 *  supports, laid out so every mesh/coupling distance is exact and no two unrelated
 *  gears sit close enough to misread as a collision (verified by `buildEdges`+`classify`
 *  reporting zero unconnected/no-power gears and exactly one -- expected, see (2) below
 *  -- overlap pair; see the accompanying test).
 *
 *  1. Main drivetrain: crank -> spur -> helical -> bevel (90-degree turn) -> a small
 *     idler spur coincident with a worm (shaft coupling) -> worm wheel (large one-way
 *     reduction) -> a load, so durability visibly depletes faster on this branch.
 *  2. Differential demo: its own crank -> input bevel -> differential -> two output
 *     shafts, both spinning at the same speed -- the "locked" output behaviour
 *     (spec §3.6) is only visible with two outputs to compare against each other.
 *     The two outputs necessarily sit close enough to each other to also trip the
 *     overlap diagnostic (both are legitimately coincident-coupled to the same
 *     differential hub, which `isOverlapping` has no way to tell apart from two
 *     gears crowding each other) -- the one expected exception noted above.
 *  3. A standalone planetary set, powered by its own small crank, off to one side.
 *  4. Rack & pinion: its own small crank turning a pinion that drives a rack along a
 *     straight line.
 *  5. Sprocket + chain: a crank coincident-coupled onto one sprocket, chain-linked
 *     (spec §3.3) to a second sprocket far away, which drives a load.
 *  6. Pulley + belt: the same idea as (5) with pulleys and a belt link (spec §3.4).
 *  7. Ratchet: a crank driving a ratchet -- the ratchet turns with it but (unlike a
 *     normal gear pair) could never back-drive the crank.
 *
 *  A few gears (the worm, the worm wheel, the ratchet) start partway worn instead of at
 *  100%, so the green-to-yellow-to-red durability gradient is visible immediately
 *  instead of only after real wear accumulates. */
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

  const rackPinionX = 60;
  const rackY = pitchRadius(14); // perpendicular offset from the pinion's line = pinion's own pitch radius

  const sprocketX = 100;
  const sprocketChainSpan = 30;

  const pulleyX = -100;
  const pulleyBeltSpan = 30;

  const ratchetZ = 60;
  const ratchetX = pitchRadius(16) + pitchRadius(10);

  const gears: GearInstance[] = [
    // 1. Main drivetrain
    seedGear("seed-crank", "crank", [0, 0, 0], [0, 1, 0], 20, 1),
    seedGear("seed-spur", "spur", [spurX, 0, 0], [0, 1, 0], 10),
    seedGear("seed-helical", "helical", [helicalX, 0, 0], [0, 1, 0], 16),
    seedGear("seed-bevel", "bevel", [helicalX, 0, bevelZ], [1, 0, 0], 16),
    seedGear("seed-idler", "spur", [helicalX, 0, connZ], [0, 0, 1], 3),
    seedGear("seed-worm", "worm", [helicalX, 0, connZ], [0, 0, 1], 2, 0, 0.25), // pre-worn (red) -- the load branch's heaviest-loaded gear
    seedGear("seed-wheel", "spur", [helicalX, 0, wheelZ], [0, 1, 0], 20, 0, 0.6), // pre-worn (yellow)
    seedGear("seed-load", "load", [helicalX, 0.02, wheelZ], [0, 1, 0], 0),

    // 2. Differential demo
    seedGear("seed-diff-crank", "crank", [diffCrankX, 0, 0], [0, 1, 0], 16, 1),
    seedGear("seed-diff-input", "bevel", [diffInputX, 0, 0], [1, 0, 0], 14),
    seedGear("seed-differential", "differential", [diffInputX, 0, differentialZ], [0, 1, 0], 20),
    seedGear("seed-diff-output-a", "spur", [diffInputX, 0.02, differentialZ], [0, 1, 0], 12),
    seedGear("seed-diff-output-b", "spur", [diffInputX, -0.02, differentialZ], [0, 1, 0], 12),

    // 3. Standalone planetary set
    seedGear("seed-planetary", "planetary", [0, 0, planetaryZ], [0, 1, 0], 40),
    seedGear("seed-planetary-crank", "crank", [planCrankX, 0, planetaryZ], [0, 1, 0], 10, 1),
    seedGear("seed-planetary-load", "load", [0, 0.02, planetaryZ], [0, 1, 0], 0),

    // 4. Rack & pinion
    seedGear("seed-rack-crank", "crank", [rackPinionX, 0, 0], [0, 1, 0], 14, 1),
    seedGear("seed-rack", "rack", [rackPinionX, rackY, 0], [0, 0, 1], 8),

    // 5. Sprocket + chain
    seedGear("seed-sprocket-crank", "crank", [sprocketX, 0, 0], [0, 1, 0], 16, 1),
    seedGear("seed-sprocket-a", "sprocket", [sprocketX, 0, 0], [0, 1, 0], 16),
    seedGear("seed-sprocket-b", "sprocket", [sprocketX + sprocketChainSpan, 0, 0], [0, 1, 0], 10),
    seedGear("seed-sprocket-load", "load", [sprocketX + sprocketChainSpan, 0.02, 0], [0, 1, 0], 0),

    // 6. Pulley + belt
    seedGear("seed-pulley-crank", "crank", [pulleyX, 0, 0], [0, 1, 0], 20, 1),
    seedGear("seed-pulley-a", "pulley", [pulleyX, 0, 0], [0, 1, 0], 20),
    seedGear("seed-pulley-b", "pulley", [pulleyX - pulleyBeltSpan, 0, 0], [0, 1, 0], 12),

    // 7. Ratchet
    seedGear("seed-ratchet-crank", "crank", [0, 0, ratchetZ], [0, 1, 0], 16, 1),
    seedGear("seed-ratchet", "ratchet", [ratchetX, 0, ratchetZ], [0, 1, 0], 10, 0, 0.4), // pre-worn (yellow-red)
  ];

  const remoteLinks: RemoteLink[] = [
    { a: "seed-sprocket-a", b: "seed-sprocket-b", kind: "chain" },
    { a: "seed-pulley-a", b: "seed-pulley-b", kind: "belt" },
  ];

  return { gears, remoteLinks };
}
