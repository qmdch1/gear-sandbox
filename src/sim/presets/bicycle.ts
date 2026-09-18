import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";
import { wheelSpokesX } from "./wheels";

/** Builds one gear instance for a preset layout. Mirrors the other preset modules'
 *  self-contained `seedGear` helper exactly. */
function seedGear(
  id: string,
  type: GearType,
  position: [number, number, number],
  axis: [number, number, number],
  teeth: number,
  module = 1,
  angularVelocity = 0,
): GearInstance {
  const def = GEAR_DEFS[type];
  return {
    id,
    type,
    position,
    axis,
    teeth,
    module,
    durabilityMax: def.durabilityMax,
    durabilityCurrent: def.durabilityMax,
    broken: false,
    rotation: 0,
    angularVelocity,
    linearPosition: type === "rack" ? 0 : undefined,
  };
}

// Side view: the bike travels along +Z. Wheels + pedals all roll about world X (axis
// [1,0,0]). The bottom bracket (pedals) sits low and central; the rear wheel is behind it.
const WHEEL_R = 10;
/** Half-thickness of the rubber. A `ring` prop is a TORUS, so the tyre's outer surface is at
 *  WHEEL_R + TYRE_TUBE from the hub, not WHEEL_R. */
const TYRE_TUBE = 1.1;
/** Hub height. It has to clear the RUBBER, not the rim: at HUB_Y = WHEEL_R the tyre's outer
 *  surface sat 1.1 below y = 0, and the comment still said "so the tires rest on the ground".
 *
 *  Worse, the tyres were not what touched the ground in the rendered scene either. The lowest
 *  thing in this preset was the CHAINRING (pitch radius 8.4 at a bottom bracket of y = 6, so
 *  -2.4), and `seatOnGround` lifts a machine by its lowest point -- so the bike was hoisted 2.4
 *  and both wheels ended up hanging 1.3 clear of the floor, the whole thing resting on a
 *  chainring tooth. `tests/meta/everyPresetSitsOnTheGround.test.ts` was satisfied, because the
 *  machine as a whole did touch y = 0; it just touched it with the wrong part. */
const HUB_Y = WHEEL_R + TYRE_TUBE; // 11.1
/** Bottom-bracket (pedal) height. Above the chainring's own pitch radius of 8.4, so the cranks
 *  hang below the hubs the way a bicycle's do without the chainring becoming the foot of the
 *  machine. */
const BB_Y = 9.5;
const REAR_Z = -22;
const FRONT_Z = 14;

/** A bicycle drivetrain: pedals turning a big chainring, a chain carrying that to a small
 *  rear sprocket on the rear wheel -- a real chain-drive gear ratio (a speed step-UP: the
 *  rear wheel spins faster than the pedals, exactly why a bike's chainring is bigger than
 *  its rear cog). The props (`createBicycleProps`) carry the recognizable shape: two big
 *  tires, a diamond frame, seat, and handlebars.
 *
 *  Mechanism (side view, +Z = forward):
 *
 *    자전거_페달 (crank) --coincident--> 자전거_체인링 (big sprocket)
 *        --chain--> 자전거_뒷스프로킷 (small sprocket) --coincident--> 자전거_뒷바퀴허브 (rear wheel hub)
 *
 *  The chain link's ratio is `chainring.teeth / rearCog.teeth` (graph.ts, for a `kind:
 *  "chain"` remote link), so with a 28-tooth chainring and a 14-tooth rear cog the rear
 *  wheel turns at exactly 2x the pedal speed -- the honest, verifiable claim, matching a
 *  real bike where a big front ring and small rear cog gear UP for speed. Same direction
 *  (chain/coupling edges never reverse sign).
 *
 *  The front wheel isn't driven by the chain on a real bike -- it just rolls -- but for the
 *  wheels to visibly turn together here it's given its own hub (a pulley) spun by a small
 *  hidden crank inside it, set to the same 2.0 speed the rear wheel reaches, so both wheels
 *  roll at a matching rate. That little front crank is a stand-in for "the ground rolling the
 *  front wheel," kept its own separate (fully powered) component so diagnostics stay clean. */
export function createBicyclePreset(): LayoutState {
  const REAR_WHEEL_SPEED = 1.0 * (28 / 14); // pedal 1.0 stepped up 2x through the chain = 2.0
  const gears: GearInstance[] = [
    // Pedals (the rider's input) at the bottom bracket, rolling about X.
    seedGear("자전거_페달", "crank", [0, BB_Y, 0], [1, 0, 0], 10, 0.7, 1.0),
    // Big chainring coincident with the pedals -> 1:1 shaft coupling.
    seedGear("자전거_체인링", "sprocket", [0, BB_Y, 0], [1, 0, 0], 28, 0.6),
    // Small rear cog at the rear hub -> chain step-up.
    seedGear("자전거_뒷스프로킷", "sprocket", [0, HUB_Y, REAR_Z], [1, 0, 0], 14, 0.6),
    // Rear wheel hub coincident with the rear cog -> the wheel spins with it.
    seedGear("자전거_뒷바퀴허브", "pulley", [0, HUB_Y, REAR_Z], [1, 0, 0], 8, 1),
    // Front wheel: a tiny hidden crank driving a coincident hub, spun at the rear wheel's
    // speed so both wheels roll together. Small teeth so the crank's handle stays inside the
    // tire rather than poking out.
    seedGear("자전거_앞바퀴모터", "crank", [0, HUB_Y, FRONT_Z], [1, 0, 0], 6, 0.5, REAR_WHEEL_SPEED),
    seedGear("자전거_앞바퀴허브", "pulley", [0, HUB_Y, FRONT_Z], [1, 0, 0], 8, 1),
  ];

  return {
    gears,
    remoteLinks: [
      { a: "자전거_체인링", b: "자전거_뒷스프로킷", kind: "chain" }, // the drive chain, 28:14 = 2x step-up
    ],
  };
}

/** The bicycle's body -- purely visual props (see `render/props.ts`), no simulation. Two
 *  big tire rings (front + rear), a diamond frame of tubes, a seat, and handlebars, so the
 *  drivetrain gears read as an actual bicycle. Wheels roll about X, so each tire ring lies
 *  in the YZ plane (rotate a default-XY torus 90° about Y). */
export function createBicycleProps(): Prop[] {
  const tire = 0x23262b; // black tires
  const rim = 0xb9c0c8; // steel rims
  const frameCol = 0x1f7a8c; // teal frame tubes
  const seatCol = 0x2a2622; // dark seat/bars

  // KNOWN, MEASURED, NOT FIXED: the chainring is drawn through the front wheel.
  //
  // `sprocketGeometry` draws a sprocket out to pitchRadius * 0.85 + module * 0.9 = 3.84 for the
  // 28-tooth ring at module 0.6... no: 8.4 * 0.85 + 0.54 = 7.68. Its centre is 14.09 from the
  // front hub, and the tyre's own centreline circle passes within 14.09 - WHEEL_R = 4.09 of
  // that centre -- well inside the 7.68 rim. Both sit at x = 0 (a gear body is GEAR_THICKNESS
  // thick, the tyre's tube +/-1.1), so the rubber really does pass through the metal, by up to
  // about 4 units at the deepest sample. The front spokes sweep a 9-radius circle about the same
  // hub and come 2.1 inside the rim as well.
  //
  // `classify` cannot see it: the centres are 14.09 apart against an overlap floor of
  // 0.95 * (8.4 + 1.5) = 9.4, and props are outside the physics entirely.
  //
  // Left as drawn because every fix is a design decision this audit should not make alone:
  // lengthening the wheelbase (the centres would have to be 7.68 + 11.1 = 18.8 apart, so the
  // front hub moves from z = 14 to about z = 19), or shrinking both sprockets by dropping
  // BICYCLE_MODULE -- which keeps the 28:14 ratio the tests pin but changes how the drive reads.

  const rearHub: [number, number, number] = [0, HUB_Y, REAR_Z];
  const frontHub: [number, number, number] = [0, HUB_Y, FRONT_Z];
  const bb: [number, number, number] = [0, BB_Y, 0]; // bottom bracket (pedals)
  const seatTop: [number, number, number] = [0, HUB_Y + 8, REAR_Z + 6];
  const headTop: [number, number, number] = [0, HUB_Y + 7, FRONT_Z - 5];

  // A frame tube between two points, drawn as a thin box (length along the connecting
  // vector). Only the two frame planes we need (all tubes lie in the bike's XZ+Y side
  // plane, x=0), so we can orient each tube by its pitch angle about X.
  function tube(from: [number, number, number], to: [number, number, number], thickness = 0.9, color = frameCol): Prop {
    const dz = to[2] - from[2];
    const dy = to[1] - from[1];
    const len = Math.hypot(dz, dy);
    const angle = Math.atan2(dz, dy); // angle from +Y toward +Z
    return {
      kind: "box",
      position: [0, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      size: [thickness, len, thickness],
      color,
      texture: "metal",
      // A box's long axis is Y; rotate about X by +angle so it points along the (dy,dz) vector.
      // A rotation about +X by t carries local +Y to (0, cos t, sin t), so with
      // angle = atan2(dz, dy) the tube points along (dy, dz) -- and -angle points it along
      // (dy, -dz), which is the SAME tube mirrored about its own midpoint. Every frame member
      // was drawn that way: the chainstay ran (y10,z0)->(y6,z-22) where it should run
      // (y6,z0)->(y10,z-22), the seat tube stood straight up out of the bottom bracket and
      // landed 16 units behind the saddle (endpoint error 24), and the fork finished 7 above
      // the front hub instead of at it. So the "diamond frame" joined none of the joints it
      // names. `factory.ts` and `ferriswheel.ts` build the same kind of tube and both use
      // +atan2(dz, dy).
      rotation: [angle, 0, 0],
      metalness: 0.4,
      roughness: 0.5,
    };
  }

  return [
    // Tires (torus) + rims, front and rear.
    { kind: "ring", position: rearHub, radius: WHEEL_R, tube: TYRE_TUBE, color: tire, rotation: [0, Math.PI / 2, 0], roughness: 0.8, metalness: 0.05 },
    { kind: "ring", position: rearHub, radius: WHEEL_R - 1.2, tube: 0.35, color: rim, texture: "metal", rotation: [0, Math.PI / 2, 0], metalness: 0.6, roughness: 0.35 },
    { kind: "ring", position: frontHub, radius: WHEEL_R, tube: TYRE_TUBE, color: tire, rotation: [0, Math.PI / 2, 0], roughness: 0.8, metalness: 0.05 },
    { kind: "ring", position: frontHub, radius: WHEEL_R - 1.2, tube: 0.35, color: rim, texture: "metal", rotation: [0, Math.PI / 2, 0], metalness: 0.6, roughness: 0.35 },
    // Diamond frame: bottom bracket to rear hub (chainstay), BB to seat top (seat tube),
    // seat top to rear hub (seatstay), BB to head top (down tube), seat top to head top
    // (top tube), head top to front hub (fork).
    tube(bb, rearHub),
    tube(bb, seatTop),
    tube(seatTop, rearHub),
    tube(bb, headTop),
    tube(seatTop, headTop),
    tube(headTop, frontHub, 0.7),
    // Seat and handlebars.
    { kind: "box", position: [0, seatTop[1] + 1, seatTop[2] - 1], size: [2, 0.8, 5], color: seatCol, texture: "fabric", roughness: 0.6, metalness: 0.1 },
    { kind: "box", position: [0, headTop[1] + 1, headTop[2]], size: [7, 0.8, 1], color: seatCol, texture: "fabric", roughness: 0.6, metalness: 0.1 },
    // Spokes attached to each wheel hub, so the wheels visibly turn (a plain torus tire is
    // rotationally symmetric and would otherwise show no motion). Radius sits just inside the
    // rim.
    ...wheelSpokesX({ attachTo: "자전거_뒷바퀴허브", center: rearHub, radius: WHEEL_R - 1, count: 8, thickness: 0.4, color: rim }),
    ...wheelSpokesX({ attachTo: "자전거_앞바퀴허브", center: frontHub, radius: WHEEL_R - 1, count: 8, thickness: 0.4, color: rim }),
  ];
}
