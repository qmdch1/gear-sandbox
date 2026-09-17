import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `hoist.ts` uses. */
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

const pitchRadius = (teeth: number, module: number) => (module * teeth) / 2;

export const BAR_ID = "캡스턴_손잡이";
export const RATCHET_ID = "캡스턴_래칫휠";
export const DRUM_ID = "캡스턴_드럼";

/** ONE module across the whole capstan. `evaluatePair` never compares module, so a mismatch
 *  would give a happy simulation edge and teeth that could not engage on any real shaft. */
export const CAPSTAN_MODULE = 1;
export const BAR_TEETH = 12;
export const RATCHET_TEETH = 24;
export const DRUM_TEETH = 20;

export const BAR_R = pitchRadius(BAR_TEETH, CAPSTAN_MODULE); // 6
export const RATCHET_R = pitchRadius(RATCHET_TEETH, CAPSTAN_MODULE); // 12
export const DRUM_R = pitchRadius(DRUM_TEETH, CAPSTAN_MODULE); // 10

/** Two meshed gears sit the sum of their pitch radii apart: 6 + 12 = 18. */
export const MESH_DISTANCE = BAR_R + RATCHET_R; // 18

/** Teeth-based reduction from the capstan bars to the ratchet wheel: 12 / 24 = 1/2. */
export const REDUCTION = BAR_TEETH / RATCHET_TEETH; // 1/2

/** Negative on purpose. The chain is hauled IN as `windWith` reads a rising
 *  `drum.rotation * radius`, and a mesh reverses sign -- so the bars have to turn negative for
 *  the drum to turn positive. Picking the sign by hand here, rather than flipping the rope
 *  direction later, keeps the winding arithmetic in the doc comment below honest. */
export const BAR_SPEED = -0.8;

/** The chain spools at the drum's own pitch radius -- this really is rope on that drum, not a
 *  separate hidden hub. */
export const ROPE_RADIUS = DRUM_R; // 10
/** How far the anchor rises between the sea bed and the hawse pipe. */
export const CHAIN_TRAVEL = 30;

/** Radians of BAR rotation that haul the anchor over exactly [0, CHAIN_TRAVEL].
 *
 *  drumRotation = -REDUCTION * barRotation, and lift = drumRotation * ROPE_RADIUS, so
 *  lift = -REDUCTION * ROPE_RADIUS * barRotation = 5 * (-barRotation). Thirty units of lift
 *  therefore needs the bars to sweep to -6, which is why the stroke below runs [-6, 0]. */
export const BAR_STROKE: [number, number] = [-CHAIN_TRAVEL / (REDUCTION * ROPE_RADIUS), 0]; // [-6, 0]

const DECK_Y = 0;
export const DRUM_X = MESH_DISTANCE;
export const DRUM_Y = 9;
export const BAR_Y = DRUM_Y;

/** Height of the BARS themselves, as drawn. Deliberately NOT `BAR_Y`.
 *
 *  The bar gear has to sit at `BAR_Y = DRUM_Y` because that is the plane its mesh with the
 *  ratchet lives in. The timber bars do not: they are props `attachTo`-ed to a gear whose axis
 *  is vertical, and rotating about a vertical axis leaves y alone, so they may be drawn at any
 *  height and still sweep correctly.
 *
 *  They have to be, because a bar is 22 long and centred at r = 11, so its tip reaches 22 units
 *  from the capstan's axis -- past the drum, which stands only DRUM_X = 18 away with a radius
 *  of 9. Drawn at BAR_Y the bars occupied y 8.2..9.8 and swept straight through the drum barrel
 *  (y 1.5..9.5), the ratchet disc and the whelps, four times a revolution. Nothing objected:
 *  `classify` compares gear CENTRES, which are a clear 18 apart, and the sandbox models no
 *  contact between machine parts at all.
 *
 *  DRUM_Y + 3.5 puts them at y 11.7..13.3, clear above both the drum (top 9.5) and the pawls
 *  (top DRUM_Y + 1.9 = 10.9) -- which is also where a real capstan's bars are, at the head's
 *  top, well above the gear it drives. */
export const BAR_PROP_Y = DRUM_Y + 3.5;

/** 캡스턴 (ship's capstan / anchor windlass) -- bars pushed round by hand wind the anchor chain
 *  onto a drum, and a RATCHET stops the chain's weight running the whole thing back.
 *
 *  Three gears, one tooth mesh and one coincident coupling:
 *
 *    캡스턴_손잡이 (crank, 12T) --mesh (ONE-WAY)--> 캡스턴_래칫휠 (ratchet, 24T)
 *    캡스턴_래칫휠 --coincident--> 캡스턴_드럼 (pulley, 20T)
 *
 *  THE RATCHET IS THE POINT. `evaluatePair`'s ratchet branch fires whenever either side is a
 *  `ratchet` and the pair is not both parallel-family (a ratchet never is, so that is always
 *  true), needs PARALLEL axes and the usual summed-pitch-radii distance, and sets
 *  `oneWay` so that the non-ratchet side can drive and the ratchet cannot drive back. In
 *  `adjacency.ts` that one-way flag is what actually removes the reverse direction from the
 *  graph, so no drive can ever flow from the ratchet wheel back into the bars.
 *
 *  That is exactly a capstan's pawl: a sailor can always heave the bars round, and the anchor's
 *  weight can never spin them back. It is a TOPOLOGY claim, not a force one -- this sandbox has
 *  no weight to hold. What the model actually says is that the graph has no path from the drum to
 *  the bars, which tests/sim/presets/capstan.test.ts checks against the real `buildEdges` and the
 *  real directed adjacency rather than by reading the flag.
 *
 *  Geometry (pitch radius = module * teeth / 2; meshed gears sit the sum of their radii apart):
 *
 *    손잡이: 12T -> r 6.   at x = 0
 *    래칫휠: 24T -> r 12.  at x = 18  (6 + 12)
 *    드럼:   20T -> r 10.  coincident with the ratchet wheel
 *
 *  All three turn about world Y: a capstan is worked by walking round it, so its drum stands
 *  upright on the deck and its bars sweep horizontally.
 *
 *  Speeds: the bars run at -0.8 and the mesh both halves and reverses, so the drum turns at
 *  +0.4 rad/s, and the chain comes in at 0.4 * 10 = 4 units per second. The bars reverse at
 *  [-6, 0] radians, which is exactly the sweep that hauls the anchor its full 30 and pays it back
 *  out -- derived in BAR_STROKE above rather than guessed.
 *
 *  Overlap: the only non-meshing pair is the bars against the drum, 18 apart against `classify`'s
 *  floor of 0.95 * (6 + 10) = 15.2. The bars/ratchet pair meshes and is exempt. */
export function createCapstanPreset(): LayoutState {
  const drumPos: [number, number, number] = [DRUM_X, DRUM_Y, 0];
  const gears: GearInstance[] = [
    seedGear(BAR_ID, "crank", [0, BAR_Y, 0], [0, 1, 0], BAR_TEETH, CAPSTAN_MODULE, BAR_SPEED),
    seedGear(RATCHET_ID, "ratchet", drumPos, [0, 1, 0], RATCHET_TEETH, CAPSTAN_MODULE),
    seedGear(DRUM_ID, "pulley", drumPos, [0, 1, 0], DRUM_TEETH, CAPSTAN_MODULE),
  ];
  // Heave in, then pay out, forever.
  gears[0].reverseAt = BAR_STROKE;
  return { gears, remoteLinks: [] };
}

export const BAR_COUNT = 4;
/** Angle of capstan bar `i`, evenly spaced around the head. */
export function barAngle(i: number): number {
  return (i / BAR_COUNT) * Math.PI * 2;
}

export const PAWL_COUNT = 8;

/** The capstan's body: a planked deck, the drum barrel with its whelps, the bars the crew walk
 *  round, the pawl teeth, the hawse pipe, and the anchor on its chain. */
export function createCapstanProps(): Prop[] {
  const timber = 0x8a6a3a;
  const iron = 0x4a4f57;
  const steel = 0x9aa1a9;
  const rust = 0x7a4a2a;

  const lift = {
    gear: DRUM_ID,
    radius: ROPE_RADIUS,
    direction: [0, 1, 0] as [number, number, number],
    travel: [0, CHAIN_TRAVEL] as [number, number],
  };

  const props: Prop[] = [
    // Deck the whole thing stands on.
    { kind: "box", position: [DRUM_X / 2, DECK_Y + 1, 0], size: [70, 2, 44], color: timber, texture: "wood", textureRepeat: [8, 5], roughness: 0.8, metalness: 0.05 },
    // Drum barrel, standing upright on the deck under the ratchet wheel.
    { kind: "cylinder", position: [DRUM_X, DRUM_Y / 2 + 1, 0], radius: DRUM_R - 1, height: DRUM_Y - 1, color: iron, texture: "metal", metalness: 0.6, roughness: 0.45 },
    // Hawse pipe the chain runs down through, off the drum's side.
    { kind: "cylinder", position: [DRUM_X + DRUM_R + 6, DECK_Y + 3, 0], radius: 3, height: 4, color: rust, texture: "rust", metalness: 0.4, roughness: 0.75 },
  ];

  // Whelps: the vertical ribs up the barrel that stop the chain slipping. A bare barrel is
  // rotationally symmetric about its own axis and would show no motion however fast it turned --
  // these are what make the capstan visibly heave.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [DRUM_X + Math.cos(a) * (DRUM_R - 1), DRUM_Y / 2 + 1, Math.sin(a) * (DRUM_R - 1)],
      size: [1.4, DRUM_Y - 2, 1.4],
      color: iron,
      texture: "metal",
      rotation: [0, -a, 0],
      metalness: 0.6,
      roughness: 0.45,
      attachTo: DRUM_ID,
    });
  }

  // Pawl teeth around the ratchet wheel's rim -- the asymmetric detail that says "this only
  // turns one way", and that makes the wheel's own rotation readable.
  for (let i = 0; i < PAWL_COUNT; i++) {
    const a = (i / PAWL_COUNT) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [DRUM_X + Math.cos(a) * (RATCHET_R - 1), DRUM_Y + 1.4, Math.sin(a) * (RATCHET_R - 1)],
      size: [3.2, 1, 1.1],
      color: steel,
      texture: "metal",
      rotation: [0, -a - 0.4, 0], // canted, the way a real pawl tooth is
      metalness: 0.7,
      roughness: 0.35,
      attachTo: RATCHET_ID,
    });
  }

  // The bars the crew push, radiating from the capstan head.
  for (let i = 0; i < BAR_COUNT; i++) {
    const a = barAngle(i);
    props.push({
      kind: "box",
      position: [Math.cos(a) * 11, BAR_PROP_Y, Math.sin(a) * 11],
      size: [22, 1.6, 1.6],
      color: timber,
      texture: "wood",
      rotation: [0, -a, 0],
      metalness: 0.05,
      roughness: 0.8,
      attachTo: BAR_ID,
    });
  }

  // The chain and the anchor it hauls. The chain is a taut guide line spanning the travel; the
  // anchor climbs it.
  const hawseX = DRUM_X + DRUM_R + 6;
  // The flukes are canted, so they reach lower than their box centres suggest: at the obvious
  // rest height the lower fluke corner dips 0.0999 below the sea bed while the crown sits
  // exactly on it. Lifting the whole anchor by that clearance -- and by nothing more -- is what
  // keeps it ON the ground at full pay-out.
  //
  // It used to be 3, which is thirty times the clearance and turns the fix inside out: the
  // anchor then hung 2.9 above the sea bed and 0.9 above the top face of its own deck, resting
  // on nothing at all. (The comment's "3 units into the sea bed" belonged to the chain guide
  // cylinder five lines below, which really was that far under.)
  const A = 0.1;
  props.push(
    // The chain spans exactly the anchor's travel, starting at its rest height. Sized from
    // CHAIN_TRAVEL + 6 and centred at CHAIN_TRAVEL / 2 it reached 3 units below the sea bed --
    // the guide line, not the anchor, was the thing under the floor.
    { kind: "cylinder", position: [hawseX, A + CHAIN_TRAVEL / 2, 0], radius: 0.4, height: CHAIN_TRAVEL, color: steel, texture: "metal", metalness: 0.7, roughness: 0.4 },
    // Anchor: a shank with a crown and two flukes, hoisted on the drum's chain.
    { kind: "cylinder", position: [hawseX, 4 + A, 0], radius: 0.7, height: 8, color: rust, texture: "rust", metalness: 0.5, roughness: 0.7, windWith: lift },
    { kind: "box", position: [hawseX, 0.6 + A, 0], size: [9, 1.2, 1.2], color: rust, texture: "rust", metalness: 0.5, roughness: 0.7, windWith: lift },
    { kind: "box", position: [hawseX - 4, 1.6 + A, 0], size: [1.6, 3, 1.2], color: rust, texture: "rust", rotation: [0, 0, 0.5], metalness: 0.5, roughness: 0.7, windWith: lift },
    { kind: "box", position: [hawseX + 4, 1.6 + A, 0], size: [1.6, 3, 1.2], color: rust, texture: "rust", rotation: [0, 0, -0.5], metalness: 0.5, roughness: 0.7, windWith: lift },
    // Stock across the top of the shank.
    { kind: "box", position: [hawseX, 7.6 + A, 0], size: [1.2, 1.2, 7], color: rust, texture: "rust", metalness: 0.5, roughness: 0.7, windWith: lift },
  );

  return props;
}
