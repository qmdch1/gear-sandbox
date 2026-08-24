// scripts/seedDemoVehicles.ts
//
// Builds three real, functioning assemblies out of this sandbox's own parts --
// a rear-wheel-drive car, a helicopter (main + tail rotor), and a tracked tank
// -- laid out far enough apart to never collide, each with its own crank so
// the "동력 비교" panel (see src/ui/powerPathPanel.ts) can show all three
// side by side. Every position below is derived from the SAME
// pitchRadius/coincidence rules `evaluatePair` itself enforces (module 0.5,
// 20 teeth -> pitch radius 5 for every mesh gear), then the whole fleet is
// re-validated against the project's own buildEdges/classify/findOverlaps
// before being saved -- "실제로 안 되면 시뮬레이션에서도 안 돼야 한다" cuts
// both ways: a hand-placed demo has to pass the same checks a live drag does.
//
// Run with: npx tsx scripts/seedDemoVehicles.ts
// (the dev API server -- `npm run dev:server`, or the combined `npm run dev`
// -- must already be running; override its address with API_URL.)

import { createGear } from "../src/sim/gearFactory";
import { buildEdges, classify, findOverlaps } from "../src/sim/graph";
import { propagateRotation } from "../src/sim/rotation";
import { computePowerPaths } from "../src/sim/powerPaths";
import type { GearInstance, GearType } from "../src/sim/types";

type Vec3 = [number, number, number];

const gears: GearInstance[] = [];

/** Creates and registers a gear at `position`, applying any field overrides
 *  (position2, axis, teeth, module, ...) on top of createGear's own defaults.
 *  A fresh id per call (createGear's own crypto.randomUUID), so calling this
 *  twice with the same args never collides. */
function place(type: GearType, position: Vec3, overrides: Partial<GearInstance> = {}): GearInstance {
  const gear = createGear(type, position);
  Object.assign(gear, overrides);
  gears.push(gear);
  return gear;
}

/** A structural rod between two points -- beam or spring (both are
 *  STRUCTURAL_ROD_TYPES in meshing.ts, differing only in rendering). */
function rod(type: "beam" | "spring" | "shaft" | "joint" | "track" | "belt", a: Vec3, b: Vec3, overrides: Partial<GearInstance> = {}): GearInstance {
  return place(type, a, { position2: b, ...overrides });
}

const PITCH_RADIUS = 5; // every mesh gear below keeps the default module 0.5 / teeth 20 -> (0.5*20)/2

// ---------------------------------------------------------------------------
// Vehicle 1: rear-wheel-drive car, on a real 3D roll-cage frame with a
// suspension-flavored spring at each corner and a bearing-supported crank.
// ---------------------------------------------------------------------------
function buildCar(originX: number): void {
  const X = originX;
  const CHASSIS_LEN = 70; // front (0) to rear (70) along local X
  const CHASSIS_WIDTH = 32; // left (-16) to right (+16), centered on Z=0
  const ROOF_HEIGHT = 22;
  const ZL = -CHASSIS_WIDTH / 2;
  const ZR = CHASSIS_WIDTH / 2;

  const FL: Vec3 = [X + 0, 0, ZL];
  const FR: Vec3 = [X + 0, 0, ZR];
  const RL: Vec3 = [X + CHASSIS_LEN, 0, ZL];
  const RR: Vec3 = [X + CHASSIS_LEN, 0, ZR];
  const FLt: Vec3 = [FL[0], ROOF_HEIGHT, FL[2]];
  const FRt: Vec3 = [FR[0], ROOF_HEIGHT, FR[2]];
  const RLt: Vec3 = [RL[0], ROOF_HEIGHT, RL[2]];
  const RRt: Vec3 = [RR[0], ROOF_HEIGHT, RR[2]];

  // Bottom rectangle, 4 vertical posts, roof rectangle, roof X-brace -- a real
  // 3D roll-cage skeleton, not just the old flat 4-beam rectangle.
  for (const [a, b] of [[FL, FR], [FR, RR], [RR, RL], [RL, FL]] as const) rod("beam", a, b);
  for (const [a, b] of [[FL, FLt], [FR, FRt], [RL, RLt], [RR, RRt]] as const) rod("beam", a, b);
  for (const [a, b] of [[FLt, FRt], [FRt, RRt], [RRt, RLt], [RLt, FLt]] as const) rod("beam", a, b);
  rod("beam", FLt, RRt);
  rod("beam", FRt, RLt);

  // Drivetrain: crank -> bevel (90 deg) -> driveshaft -> a joint per side
  // (a real differential's two half-shafts, each via a universal joint) ->
  // rear stub axle -> rear wheel. Front wheels roll free, structurally
  // mounted straight to the chassis corner (unpowered, exactly like a real
  // RWD car).
  const crankPos: Vec3 = [X + CHASSIS_LEN + 8, 0, 0];
  const crank = place("crank", crankPos, { angularVelocity: 1 });
  place("gauge", crankPos);
  place("bearing", crankPos);

  const bevelPos: Vec3 = [crankPos[0] - PITCH_RADIUS * 2, 0, crankPos[2]];
  place("bevel", bevelPos);

  const diffPos: Vec3 = [X + 20, 0, 0];
  rod("shaft", bevelPos, diffPos); // driveshaft: position=bevel end, position2=differential junction

  const jointL = rod("joint", diffPos, [diffPos[0], 0, ZL]);
  const jointR = rod("joint", diffPos, [diffPos[0], 0, ZR]);

  // A shaft-to-accessory coupling (evaluatePair's "shaft" branch, checked
  // BEFORE the COUPLING_ONLY_TYPES branch) requires the SHAFT's own
  // direction to be parallel to the accessory's `.axis` field -- unlike a
  // coupling-only accessory sitting on a plain gear's shaft (where `.axis`
  // just needs to match that gear's own default), a wheel mounted on an
  // actual "shaft" rod must have its axis explicitly set to the direction
  // that rod runs (here, along the car's length, +/-X), not the [0,1,0]
  // every OTHER accessory defaults to.
  const AXLE_AXIS: Vec3 = [1, 0, 0];

  // Rear stub axles: .position is the WHEEL end (coupling-only accessories
  // only ever bind to a rod host's .position field, never .position2 -- see
  // meshing.ts's evaluatePair COUPLING_ONLY_TYPES branch), .position2 is the
  // inboard end that meets the differential joint.
  rod("shaft", RL, jointL.position2 as Vec3);
  place("wheel", RL, { axis: AXLE_AXIS });
  rod("shaft", RR, jointR.position2 as Vec3);
  place("wheel", RR, { axis: AXLE_AXIS });

  // Front stub axles: unpowered, just a short rod outboard of the chassis
  // corner, wheel mounted at the corner itself.
  rod("shaft", FL, [FL[0] + 10, 0, FL[2]]);
  place("wheel", FL, { axis: AXLE_AXIS });
  rod("shaft", FR, [FR[0] + 10, 0, FR[2]]);
  place("wheel", FR, { axis: AXLE_AXIS });

  // Suspension springs: chassis corner -> each stub axle's inboard end.
  rod("spring", FL, [FL[0] + 10, 0, FL[2]]);
  rod("spring", FR, [FR[0] + 10, 0, FR[2]]);
  rod("spring", RL, jointL.position2 as Vec3);
  rod("spring", RR, jointR.position2 as Vec3);

  void crank;
}

// ---------------------------------------------------------------------------
// Vehicle 2: helicopter -- a triangulated skid/mast frame, a main rotor
// coupled directly onto the engine (both spin about the same vertical axis,
// no gearbox needed -- exactly like a real single-main-rotor helicopter),
// and a tail rotor driven off a 90-degree bevel gearbox down a tail-boom
// driveshaft (exactly how a real helicopter's tail rotor is actually driven).
// ---------------------------------------------------------------------------
function buildHelicopter(originX: number): void {
  const X = originX;
  const SKID_LEN = 40;
  const SKID_HALF_WIDTH = 8;
  const MAST_TOP: Vec3 = [X + 10, 20, 0];
  const TAIL_END_X = X + 55;

  // Cross-members attach exactly at the skids' own endpoints (X and
  // X+SKID_LEN) -- a beam only registers a structural edge at an ACTUAL
  // endpoint coincidence, never at a point merely lying along its length, so
  // "front"/"rear" here has to mean the skid rod's own ends, not an
  // arbitrary offset in between.
  const skidFrontL: Vec3 = [X, 0, -SKID_HALF_WIDTH];
  const skidFrontR: Vec3 = [X, 0, SKID_HALF_WIDTH];
  const skidRearL: Vec3 = [X + SKID_LEN, 0, -SKID_HALF_WIDTH];
  const skidRearR: Vec3 = [X + SKID_LEN, 0, SKID_HALF_WIDTH];

  rod("beam", skidFrontL, skidRearL); // left skid
  rod("beam", skidFrontR, skidRearR); // right skid
  rod("beam", skidFrontL, skidFrontR); // front cross-member
  rod("beam", skidRearL, skidRearR); // rear cross-member

  // Triangulated mast -- both legs meet at one shared top point, a real
  // structural node (not just two beams floating near each other).
  rod("beam", skidFrontL, MAST_TOP);
  rod("beam", skidFrontR, MAST_TOP);
  rod("beam", MAST_TOP, [MAST_TOP[0] + 10, MAST_TOP[1], 0]); // short boom toward the cabin/rotor mount

  const rotorMast: Vec3 = [MAST_TOP[0] + 10, MAST_TOP[1], 0];
  const crank = place("crank", rotorMast, { angularVelocity: 1 }); // the engine
  place("gauge", rotorMast);
  place("rotor", rotorMast, { axis: [0, 1, 0] }); // main rotor -- direct coupling, same vertical axis as the engine

  // Tail-rotor gearbox: a bevel gear meshed with the SAME crank (perpendicular
  // axis, standard mesh distance) -- one engine driving two outputs at once.
  const tailBevelPos: Vec3 = [rotorMast[0] - PITCH_RADIUS * 2, rotorMast[1], rotorMast[2]];
  place("bevel", tailBevelPos);

  rod("beam", MAST_TOP, [TAIL_END_X, MAST_TOP[1], 0]); // tail boom, structural

  // Tail-rotor driveshaft: .position is the ROTOR end (again, the rod-host
  // rule -- rotor only binds to the shaft's own .position field), .position2
  // is the bevel end.
  rod("shaft", [TAIL_END_X, MAST_TOP[1], 0], tailBevelPos);
  place("bearing", tailBevelPos, { axis: [1, 0, 0] }); // support bearing right at the gearbox input
  place("rotor", [TAIL_END_X, MAST_TOP[1], 0], { axis: [1, 0, 0] }); // tail rotor spins about the boom's own axis

  void crank;
}

// ---------------------------------------------------------------------------
// Vehicle 3: tracked tank -- a boxy hull frame, a turret (traverse crank +
// gun-mass "load" + support bearing, all coupled at one point on the hull
// roof) and a real left/right tank-track drivetrain: crank -> bevel -> a
// driveshaft -> a joint-driven front sprocket per side -> a track (the new
// lugged BELT_LIKE_TYPES part) looping back to an idle rear sprocket.
// ---------------------------------------------------------------------------
function buildTank(originX: number): void {
  const X = originX;
  const HULL_LEN = 50;
  const HULL_WIDTH = 24; // left (-12) to right (+12), centered on Z=0
  const HULL_HEIGHT = 10;
  const ZL = -HULL_WIDTH / 2;
  const ZR = HULL_WIDTH / 2;

  const b0: Vec3 = [X + 0, 0, ZL];
  const b1: Vec3 = [X + 0, 0, ZR];
  const b2: Vec3 = [X + HULL_LEN, 0, ZR];
  const b3: Vec3 = [X + HULL_LEN, 0, ZL];
  const t0: Vec3 = [b0[0], HULL_HEIGHT, b0[2]];
  const t1: Vec3 = [b1[0], HULL_HEIGHT, b1[2]];
  const t2: Vec3 = [b2[0], HULL_HEIGHT, b2[2]];
  const t3: Vec3 = [b3[0], HULL_HEIGHT, b3[2]];

  for (const [a, b] of [[b0, b1], [b1, b2], [b2, b3], [b3, b0]] as const) rod("beam", a, b);
  for (const [a, b] of [[b0, t0], [b1, t1], [b2, t2], [b3, t3]] as const) rod("beam", a, b);
  for (const [a, b] of [[t0, t1], [t1, t2], [t2, t3], [t3, t0]] as const) rod("beam", a, b);

  // Turret: traverse motor (crank) + gun mass (load) + support bearing, all
  // coupled at the same hull-roof point -- the load turns with the crank
  // exactly like the "output = whatever's coupled to the crank's own shaft"
  // pattern used everywhere else, just standing in for a rotating turret.
  const turretPos: Vec3 = [X + HULL_LEN / 2, HULL_HEIGHT, 0];
  place("crank", turretPos, { angularVelocity: 0.4 }); // slow traverse, not a full-speed drivetrain part
  place("load", turretPos);
  place("bearing", turretPos);
  rod("beam", t0, turretPos); // turret ring, welded to the hull roof

  // Drivetrain: crank -> bevel -> driveshaft -> a joint per side (the
  // differential) -> front sprocket -> track -> rear (idle) sprocket.
  const mainCrankPos: Vec3 = [X + HULL_LEN + 8, 0, 0];
  place("crank", mainCrankPos, { angularVelocity: 1 });
  place("gauge", mainCrankPos);

  const bevelPos: Vec3 = [mainCrankPos[0] - PITCH_RADIUS * 2, 0, mainCrankPos[2]];
  place("bevel", bevelPos);

  const diffPos: Vec3 = [X + 15, 0, 0];
  rod("shaft", bevelPos, diffPos);
  rod("beam", b0, diffPos); // engine-mount bracket, welds the whole drivetrain to the hull

  const jointL = rod("joint", diffPos, [diffPos[0], 0, ZL]);
  const jointR = rod("joint", diffPos, [diffPos[0], 0, ZR]);

  const frontSprocketL = place("spur", jointL.position2 as Vec3);
  const frontSprocketR = place("spur", jointR.position2 as Vec3);
  const rearSprocketL = place("spur", [X + HULL_LEN - 5, 0, ZL]);
  const rearSprocketR = place("spur", [X + HULL_LEN - 5, 0, ZR]);

  rod("track", frontSprocketL.position, rearSprocketL.position);
  rod("track", frontSprocketR.position, rearSprocketR.position);
}

// Laid out along X with a 30-unit (3-cell, see scene.ts's 10-unit grid) gap
// between each vehicle's own bounding box, and the whole row centered on the
// origin -- the default camera looks at (0,0,0), and the reference grid only
// extends to +/-250, so spacing them out by hundreds of units (an earlier
// version) put two of the three vehicles entirely off the visible grid.
buildCar(-130);
buildHelicopter(-22);
buildTank(63);

// ---------------------------------------------------------------------------
// Self-check against the project's own rules before saving anything -- an
// unconnected part is fine (that's normal, see diagnosticsPanel.ts), but a
// genuine geometric overlap is not.
// ---------------------------------------------------------------------------
const edges = buildEdges(gears);
const diagnostics = classify(gears, edges);
const overlaps = findOverlaps(gears);
const byId = new Map(gears.map((g) => [g.id, g] as const));
const describe = (id: string) => {
  const g = byId.get(id)!;
  return `${g.type}@[${g.position.map((n) => n.toFixed(0)).join(",")}]`;
};

console.log(`총 부품 ${gears.length}개, 엣지 ${edges.length}개`);
console.log(`연결 안 됨: ${diagnostics.unconnectedIds.length}개`, diagnostics.unconnectedIds.map(describe));
console.log(`동력 없음: ${diagnostics.noPowerIds.length}개`, diagnostics.noPowerIds.map(describe));
console.log(`겹침: ${overlaps.length}쌍`);
if (overlaps.length > 0) {
  console.log(overlaps.map(([a, b]) => [describe(a), describe(b)]));
}

// Run the SAME propagateRotation the live sim runs every tick, so the printed
// power paths reflect real spinning speeds -- not the all-zero defaults every
// non-crank gear starts at before the first tick ever runs.
const { angularVelocities } = propagateRotation(gears, edges);
const spunGears = gears.map((g) => ({ ...g, angularVelocity: angularVelocities.get(g.id) ?? g.angularVelocity }));

if (process.env.DEBUG_REGION) {
  const [lo, hi] = process.env.DEBUG_REGION.split(",").map(Number);
  console.log(`\n--- 디버그: X in [${lo},${hi}] ---`);
  const region = new Set(gears.filter((g) => g.position[0] >= lo && g.position[0] <= hi).map((g) => g.id));
  for (const e of edges) {
    if (!region.has(e.a) && !region.has(e.b)) continue;
    console.log(`  ${describe(e.a)} --${e.kind}(${e.ratio.toFixed(2)},${e.oneWay})--> ${describe(e.b)}`);
  }
  console.log("  각속도:");
  for (const id of region) {
    console.log(`    ${describe(id)}: ${(angularVelocities.get(id) ?? 0).toFixed(3)}`);
  }
}

const paths = computePowerPaths(spunGears, edges);
console.log("동력 경로:");
for (const p of paths) {
  console.log(`  ${p.sourceType}(${p.sourceId.slice(0, 6)}) -> ${p.outputType}(${p.outputId.slice(0, 6)}): 배율=${p.ratio?.toFixed(2)}, 속도=${p.outputAngularVelocity.toFixed(2)}`);
}

if (overlaps.length > 0) {
  console.error("겹침이 있어 저장을 중단합니다.");
  process.exit(1);
}

const apiUrl = process.env.API_URL ?? "http://localhost:3001/api/layout";
const res = await fetch(apiUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gears }),
});
if (!res.ok) {
  console.error(`저장 실패: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`저장 완료 (${apiUrl})`);
