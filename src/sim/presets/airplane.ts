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

const NOSE_Z = 18; // the propeller sits at the front of the fuselage
const PROP_Y = 6; // propeller/engine hub height above the ground

/** A propeller airplane. The real, verifiable mechanism is an engine crank turning a
 *  coincident propeller hub (a 1:1 shaft coupling -- the prop spins exactly with the
 *  engine), and the props (`createAirplaneProps`) carry the recognizable shape: a
 *  fuselage, wings, a tail, and the propeller blades fanning off the spinning hub.
 *
 *  Layout (side view, +Z = forward/nose, Y = up):
 *
 *    비행기_엔진 (crank, at the nose, axis +Z so it spins facing forward)
 *      -- belt --> 비행기_프로펠러 (small pulley, the propeller hub, also at the nose)
 *
 *  Engine and propeller hub are both mounted at the nose on axis [0,0,1] (pointing
 *  forward), so the propeller disc faces the direction of travel, exactly like a real
 *  nose-mounted prop. The engine is a crank (the one type whose speed is an input); the
 *  propeller hub is a `pulley` coincident with it, so a 1:1 shaft coupling forms and the
 *  belt is not even needed for power -- but we keep the hub as a separate spinnable gear so
 *  the propeller-blade props can be centered on a real rotating hub. */
export function createAirplanePreset(): LayoutState {
  const gears: GearInstance[] = [
    // Engine crank at the nose, axis +Z (spinning about the forward direction).
    seedGear("비행기_엔진", "crank", [0, PROP_Y, NOSE_Z], [0, 0, 1], 10, 1, 1.4),
    // Propeller hub coincident with the engine -> 1:1 shaft coupling, spins with it.
    seedGear("비행기_프로펠러", "pulley", [0, PROP_Y, NOSE_Z], [0, 0, 1], 10, 1),
  ];

  return { gears, remoteLinks: [] };
}

/** The airplane's body -- purely visual props (see `render/props.ts`), no simulation. A
 *  cylindrical fuselage, two wings, a horizontal + vertical tail, and four propeller
 *  blades fanning off the spinning hub at the nose, so the two nose gears read as an actual
 *  aircraft. */
export function createAirplaneProps(): Prop[] {
  const body = 0xced3d8; // aluminium fuselage
  const wing = 0x9aa3ad; // slightly darker wings
  const accent = 0xc0392b; // red tail fin / blade tips

  const props: Prop[] = [
    // Fuselage: a long cylinder lying along Z (rotate 90° about X to lay the default-Y
    // cylinder down along Z). Runs from the nose (z=NOSE_Z) back past the tail.
    { kind: "cylinder", position: [0, PROP_Y, -2], radius: 3, height: 38, color: body, rotation: [Math.PI / 2, 0, 0], metalness: 0.5, roughness: 0.45 },
    // Main wings: a wide, thin box spanning left-right (X), mid-fuselage.
    { kind: "box", position: [0, PROP_Y, 2], size: [40, 1, 8], color: wing, metalness: 0.4, roughness: 0.5 },
    // Horizontal tailplane at the rear.
    { kind: "box", position: [0, PROP_Y, -18], size: [16, 0.8, 5], color: wing, metalness: 0.4, roughness: 0.5 },
    // Vertical tail fin at the rear (a thin box standing up in the XZ... i.e. spanning Y and Z).
    { kind: "box", position: [0, PROP_Y + 4, -19], size: [0.8, 8, 6], color: accent, metalness: 0.4, roughness: 0.5 },
  ];

  // Four propeller blades fanning off the hub at the nose, in the XY plane (the prop disc
  // faces +Z). Each blade is a long thin box rotated about Z to its clock position.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [Math.cos(a) * 4.5, PROP_Y + Math.sin(a) * 4.5, NOSE_Z + 1],
      size: [9, 1.2, 0.4],
      color: accent,
      rotation: [0, 0, a],
      metalness: 0.5,
      roughness: 0.4,
      attachTo: "비행기_프로펠러", // blades spin with the propeller hub gear
    });
  }

  return props;
}
