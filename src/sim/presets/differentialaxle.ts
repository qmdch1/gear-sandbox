import type { GearInstance, GearType, LayoutState } from "../types";
import { GEAR_DEFS } from "../gearDefs";
import type { Prop } from "../../render/props";
import { wheelSpokesX } from "./wheels";

/** Builds one gear instance for a preset layout. Duplicated per preset module so each stays a
 *  self-contained, hand-verifiable spec -- the same shape `windmill.ts` uses. */
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

export const PINION_ID = "차동축_구동피니언";
export const CROWN_ID = "차동축_링기어";
export const DIFF_ID = "차동축_차동장치";

/** ONE module across the whole axle. `evaluatePair` never compares module -- it only asks
 *  whether the centres sit pitchRadius(a) + pitchRadius(b) apart -- so a mixed-module pair would
 *  give a perfectly happy simulation edge and a rendered pair whose teeth are visibly different
 *  sizes and could not engage on any real shaft. */
export const AXLE_MODULE = 1;
export const PINION_TEETH = 12;
export const CROWN_TEETH = 36;
export const DIFF_TEETH = 20;

export const PINION_R = pitchRadius(PINION_TEETH, AXLE_MODULE); // 6
export const CROWN_R = pitchRadius(CROWN_TEETH, AXLE_MODULE); // 18
export const DIFF_R = pitchRadius(DIFF_TEETH, AXLE_MODULE); // 10

/** Two meshed gears sit the sum of their pitch radii apart: 6 + 18 = 24. */
export const FINAL_DRIVE_DISTANCE = PINION_R + CROWN_R; // 24

/** The final-drive ratio, by tooth count alone: 12 / 36 = 1/3. The crown wheel -- and so the
 *  axle -- turns at a third of the propshaft's speed, reversed by the tooth mesh. */
export const FINAL_DRIVE_RATIO = PINION_TEETH / CROWN_TEETH; // 1/3
export const PROPSHAFT_SPEED = 3.0;

export const WHEEL_R = 24;
/** Half-thickness of the tyre's torus tube. A torus of centre-line radius R and tube t reaches
 *  R + t from its centre, so the axle has to clear the TYRE's outer surface, not the centre line
 *  -- forgetting the tube is exactly how a wheel ends up 2.2 units into the road. */
export const TYRE_TUBE = 2.2;
/** The axle sits one tyre radius up, so the tread rests on the ground rather than half-buried. */
export const AXLE_Y = WHEEL_R + TYRE_TUBE;
/** Half-track: how far each wheel sits from the differential, along the axle. */
export const HALF_TRACK = 26;
/** The propshaft runs forward from the crown wheel along -Z; the pinion sits exactly the
 *  final-drive distance ahead of the axle centre. */
export const AXLE_Z = 0;
export const PINION_Z = AXLE_Z - FINAL_DRIVE_DISTANCE; // -24

/** 차동축 (rear differential axle) -- a cutaway of the back axle of a car: a propshaft turning a
 *  small bevel pinion, which drives a big bevel crown wheel through a RIGHT ANGLE, carrying the
 *  differential and the two road wheels with it.
 *
 *  This preset exists to exercise `bevel` and `differential`, the two gear types no other preset
 *  in the repo used. Three gears, one right-angle mesh and one coincident coupling:
 *
 *    차동축_구동피니언 (crank, 12T, axis +Z) --mesh (right angle)--> 차동축_링기어 (bevel, 36T, axis +X)
 *    차동축_링기어                            --coincident--> 차동축_차동장치 (differential, 20T, axis +X)
 *
 *  THE CRANK IS THE PINION, and that is deliberate rather than a shortcut. A separate bevel
 *  pinion sitting coincident with the propshaft crank looked right and was actively harmful:
 *  neither `crank` nor `bevel` is a COINCIDENT_ONLY type, so `evaluatePair` has no coupling rule
 *  for that pair, and the bevel branch it does reach demands PERPENDICULAR axes -- which two
 *  gears on one shaft are not. The pair therefore formed no edge at all and `classify` reported
 *  them as an overlap. Meanwhile the crank was already meshing the crown wheel directly (the
 *  bevel branch fires whenever EITHER side is a bevel), so the extra gear was doing nothing but
 *  breaking the diagnostics.
 *
 *  WHY THE MESH IS PERPENDICULAR: `evaluatePair`'s bevel/differential branch requires
 *  |dot(axisA, axisB)| <= 0.1 -- the two axes must genuinely cross at a right angle -- plus the
 *  usual centre distance of pitchRadius(a) + pitchRadius(b) within 5%. The pinion runs along the
 *  car (+Z) and the crown wheel across it (+X), dot = 0 exactly, 24 apart against 6 + 18 = 24
 *  exactly. Turning the drive through 90 degrees is the whole job of a final drive, and it is the
 *  one thing a parallel-axis mesh cannot do.
 *
 *  WHY THE DIFFERENTIAL IS COINCIDENT: `differential` is one of `evaluatePair`'s COINCIDENT_ONLY
 *  types, so sharing the crown wheel's position and axis resolves it as a 1:1 coupling -- exactly
 *  how a real differential carrier is bolted to the crown wheel and turns with it. (It is the
 *  exception inside that set: a differential that is NOT coincident falls through to the
 *  perpendicular bevel check and can mesh after all. This preset relies on the coupling.)
 *
 *  A TRAP WORTH RECORDING: a `load` bolted to the differential to represent the road looks
 *  natural and does nothing at all. `evaluatePair` returns null for any pair where BOTH sides are
 *  `load` or `differential`, so the load would sit there with no edge and `classify` would report
 *  it as unconnected. The axle therefore ends at the differential.
 *
 *  WHAT THIS DOES NOT CLAIM. A real differential's defining trick is letting the two wheels turn
 *  at DIFFERENT speeds through a corner while splitting drive between them. That is a torque
 *  relationship, and although `dynamics.ts` now does model torque, it solves ONE torque balance
 *  per rigid train -- `rotation.ts` gives a connected component a single degree of freedom, so
 *  there is no second DOF for a differential to divide drive between. So both wheels are driven
 *  from the one differential and turn together, and the
 *  honest, verified claim of this preset is only the right-angle final drive: the axle runs at
 *  exactly 1/3 of the propshaft, reversed. tests/sim/presets/differentialaxle.test.ts checks that
 *  over hundreds of real ticks.
 *
 *  Overlap: the only non-meshing pair is the pinion against the differential, 24 apart against
 *  `classify`'s floor of 0.95 * (6 + 10) = 15.2. The pinion/crown pair meshes, and meshing pairs
 *  are exempt from the overlap check.
 *
 *  Ground: the axle sits at WHEEL_R + TYRE_TUBE = 26.2, which is the tyre's OUTER radius -- a
 *  torus reaches radius + tube from its centre, and measuring to the centre line instead left the
 *  tread 2.2 into the road. That height also clears the banjo casing drawn around the crown wheel
 *  (radius 21, underside at y = 5.2); wheels smaller than the casing would have buried it, which
 *  is the mistake the first draft made. */
export function createDifferentialAxlePreset(): LayoutState {
  const pinionPos: [number, number, number] = [0, AXLE_Y, PINION_Z];
  const crownPos: [number, number, number] = [0, AXLE_Y, AXLE_Z];

  const gears: GearInstance[] = [
    seedGear(PINION_ID, "crank", pinionPos, [0, 0, 1], PINION_TEETH, AXLE_MODULE, PROPSHAFT_SPEED),
    seedGear(CROWN_ID, "bevel", crownPos, [1, 0, 0], CROWN_TEETH, AXLE_MODULE),
    seedGear(DIFF_ID, "differential", crownPos, [1, 0, 0], DIFF_TEETH, AXLE_MODULE),
  ];

  return { gears, remoteLinks: [] };
}

/** The axle's body: the banjo casing, the two half-shaft tubes, hubs and spoked road wheels, the
 *  propshaft with its universal joint, and a differential cover. */
export function createDifferentialAxleProps(): Prop[] {
  const casing = 0x4a4f57;
  const steel = 0x9aa1a9;
  const tyre = 0x23262b;
  const rim = 0xb9c0c8;
  const cover = 0x7a3f2a;

  const props: Prop[] = [
    // Banjo casing around the crown wheel and differential.
    { kind: "sphere", position: [0, AXLE_Y, AXLE_Z], radius: CROWN_R + 3, color: casing, texture: "metal", metalness: 0.6, roughness: 0.45 },
    // Pressed-steel differential cover on the back face.
    { kind: "cylinder", position: [0, AXLE_Y, AXLE_Z + CROWN_R + 2], radius: CROWN_R - 2, height: 2, color: cover, texture: "rust", rotation: [Math.PI / 2, 0, 0], metalness: 0.5, roughness: 0.6 },
    // Half-shaft tubes running out to each hub.
    { kind: "cylinder", position: [-HALF_TRACK / 2, AXLE_Y, AXLE_Z], radius: 3, height: HALF_TRACK, color: casing, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.6, roughness: 0.45 },
    { kind: "cylinder", position: [HALF_TRACK / 2, AXLE_Y, AXLE_Z], radius: 3, height: HALF_TRACK, color: casing, texture: "metal", rotation: [0, 0, Math.PI / 2], metalness: 0.6, roughness: 0.45 },
    // Propshaft forward from the pinion, with a universal-joint yoke at its front end.
    { kind: "cylinder", position: [0, AXLE_Y, PINION_Z - 14], radius: 1.6, height: 28, color: steel, texture: "metal", rotation: [Math.PI / 2, 0, 0], metalness: 0.75, roughness: 0.3 },
    { kind: "box", position: [0, AXLE_Y, PINION_Z - 28], size: [5, 5, 3], color: steel, texture: "metal", metalness: 0.7, roughness: 0.35 },
  ];

  // Road wheels. Both are driven from the one differential and turn together -- see the doc
  // comment: this sandbox has no torque to split, so the differential's real trick is out of
  // scope and is not claimed.
  for (const side of [-1, 1] as const) {
    const hub: [number, number, number] = [side * HALF_TRACK, AXLE_Y, AXLE_Z];
    props.push(
      // Tyre and rim. A torus defaults to the XY plane; rotate 90 degrees about Y to stand it in
      // YZ, so the wheel rolls about the axle's own +X.
      { kind: "ring", position: hub, radius: WHEEL_R, tube: TYRE_TUBE, color: tyre, rotation: [0, Math.PI / 2, 0], roughness: 0.85, metalness: 0.05 },
      { kind: "ring", position: hub, radius: WHEEL_R - 2.6, tube: 0.7, color: rim, texture: "metal", rotation: [0, Math.PI / 2, 0], metalness: 0.6, roughness: 0.35 },
      // Brake drum behind the wheel.
      { kind: "cylinder", position: [side * (HALF_TRACK - 2), AXLE_Y, AXLE_Z], radius: WHEEL_R - 5, height: 3, color: casing, texture: "rust", rotation: [0, 0, Math.PI / 2], metalness: 0.5, roughness: 0.6 },
      // Spokes, attached to the differential so the wheel visibly turns. A bare torus is
      // rotationally symmetric about its own axis and would show no motion however fast it spun.
      ...wheelSpokesX({
        attachTo: DIFF_ID,
        center: hub,
        radius: WHEEL_R - 2,
        count: 8,
        thickness: 0.7,
        color: rim,
      }),
    );
  }

  // Ring-gear bolt heads around the crown wheel's rim, attached so the final drive's own rotation
  // reads even with the casing around it.
  const BOLTS = 10;
  for (let i = 0; i < BOLTS; i++) {
    const a = (i / BOLTS) * Math.PI * 2;
    props.push({
      kind: "box",
      position: [0.5, AXLE_Y + Math.cos(a) * (CROWN_R - 2), AXLE_Z + Math.sin(a) * (CROWN_R - 2)],
      size: [1.6, 1.4, 1.4],
      color: steel,
      texture: "metal",
      rotation: [a, 0, 0],
      metalness: 0.7,
      roughness: 0.35,
      attachTo: CROWN_ID,
    });
  }

  return props;
}
