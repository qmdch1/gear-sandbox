import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

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
const HUB_Y = WHEEL_R; // wheel hubs sit one radius up so the tires rest on the ground
const BB_Y = 6; // bottom-bracket (pedal) height
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
 *  (chain/coupling edges never reverse sign). The front wheel is decorative only (a real
 *  bike's front wheel isn't driven), so it lives entirely in the props. */
export function createBicyclePreset(): LayoutState {
  const gears: GearInstance[] = [
    // Pedals (the rider's input) at the bottom bracket, rolling about X.
    seedGear("자전거_페달", "crank", [0, BB_Y, 0], [1, 0, 0], 10, 0.7, 1.0),
    // Big chainring coincident with the pedals -> 1:1 shaft coupling.
    seedGear("자전거_체인링", "sprocket", [0, BB_Y, 0], [1, 0, 0], 28, 0.6),
    // Small rear cog at the rear hub -> chain step-up.
    seedGear("자전거_뒷스프로킷", "sprocket", [0, HUB_Y, REAR_Z], [1, 0, 0], 14, 0.6),
    // Rear wheel hub coincident with the rear cog -> the wheel spins with it.
    seedGear("자전거_뒷바퀴허브", "pulley", [0, HUB_Y, REAR_Z], [1, 0, 0], 8, 1),
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
      // A box's long axis is Y; rotate about X by -angle so it points along the (dy,dz) vector.
      rotation: [-angle, 0, 0],
      metalness: 0.4,
      roughness: 0.5,
    };
  }

  return [
    // Tires (torus) + rims, front and rear.
    { kind: "ring", position: rearHub, radius: WHEEL_R, tube: 1.1, color: tire, rotation: [0, Math.PI / 2, 0], roughness: 0.8, metalness: 0.05 },
    { kind: "ring", position: rearHub, radius: WHEEL_R - 1.2, tube: 0.35, color: rim, rotation: [0, Math.PI / 2, 0], metalness: 0.6, roughness: 0.35 },
    { kind: "ring", position: frontHub, radius: WHEEL_R, tube: 1.1, color: tire, rotation: [0, Math.PI / 2, 0], roughness: 0.8, metalness: 0.05 },
    { kind: "ring", position: frontHub, radius: WHEEL_R - 1.2, tube: 0.35, color: rim, rotation: [0, Math.PI / 2, 0], metalness: 0.6, roughness: 0.35 },
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
    { kind: "box", position: [0, seatTop[1] + 1, seatTop[2] - 1], size: [2, 0.8, 5], color: seatCol, roughness: 0.6, metalness: 0.1 },
    { kind: "box", position: [0, headTop[1] + 1, headTop[2]], size: [7, 0.8, 1], color: seatCol, roughness: 0.6, metalness: 0.1 },
  ];
}
