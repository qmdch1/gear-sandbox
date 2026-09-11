import type { LayoutState, GearInstance, Vehicle } from "./types";
import type { Prop } from "../render/props";
import { seatOnGround } from "./ground";
import { createCarPreset, createCarProps } from "./presets/car";
import { createAirplanePreset, createAirplaneProps } from "./presets/airplane";
import { createWindmillPreset, createWindmillProps } from "./presets/windmill";
import { createBicyclePreset, createBicycleProps } from "./presets/bicycle";
import { createLocomotivePreset, createLocomotiveProps } from "./presets/locomotive";
import { createPistonEnginePreset, createPistonEngineProps } from "./presets/pistonengine";
import { createFactoryPreset, createFactoryProps } from "./presets/factory";
import { createWatermillPreset, createWatermillProps } from "./presets/watermill";
import { createFerrisWheelPreset, createFerrisWheelProps } from "./presets/ferriswheel";
import { createCastlePreset, createCastleProps } from "./presets/castle";
import { createHoistPreset, createHoistProps } from "./presets/hoist";
import { createCarouselPreset, createCarouselProps } from "./presets/carousel";
import { createWellPumpPreset, createWellPumpProps } from "./presets/wellpump";
import { createConveyorPreset, createConveyorProps } from "./presets/conveyor";
import { createTowerCranePreset, createTowerCraneProps } from "./presets/towercrane";
import { createClockTowerPreset, createClockTowerProps } from "./presets/clocktower";
import { createGearboxPreset, createGearboxProps } from "./presets/gearbox";
import { createPlanetaryHoistPreset, createPlanetaryHoistProps } from "./presets/planetaryhoist";
import { createDifferentialAxlePreset, createDifferentialAxleProps } from "./presets/differentialaxle";
import { createWormTablePreset, createWormTableProps } from "./presets/wormtable";

type Vec3 = [number, number, number];

/** Offsets a whole preset layout by `d` -- every gear's position shifts, ids and remote
 *  links are untouched (translation preserves all inter-gear distances, so every mesh /
 *  coupling / belt / chain stays exactly as valid as it was in the preset's own local
 *  space). Used to lay several finished-object presets out side by side in one scene. */
function translateLayout(layout: LayoutState, d: Vec3): LayoutState {
  return {
    gears: layout.gears.map((g: GearInstance) => ({
      ...g,
      position: [g.position[0] + d[0], g.position[1] + d[1], g.position[2] + d[2]] as Vec3,
    })),
    remoteLinks: layout.remoteLinks,
    // A vehicle's `distance` is travel ALONG its own direction, so shifting the machine to its
    // cell leaves it exactly as valid as it was -- the same reason the remote links are passed
    // through untouched.
    vehicles: layout.vehicles,
  };
}

/** Offsets a preset's decorative props by the same `d` its gears were shifted by, so the
 *  body lands exactly on top of its (now relocated) mechanism. */
function translateProps(props: Prop[], d: Vec3): Prop[] {
  return props.map((p) => ({
    ...p,
    position: [p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2]] as Vec3,
  }));
}

/** The twenty finished machines, on a 5x4 yard.
 *
 *  Cell pitch (150 across X, 135 along Z) is derived from each preset's REAL measured extent, not
 *  eyeballed. The widest cases set it -- the planetary hoist spans 126 units of X and the factory
 *  114 -- and the deepest set the rows: the locomotive is 103 long and the differential axle 72.
 *  Machines are assigned to cells so no two of the wide ones land side by side in a row, and no
 *  two of the deep ones stack in a column.
 *
 *  Placement matters for more than looks: `classify()` flags any two gears sitting inside each
 *  other's overlap radius and does not care that they belong to different machines.
 *  tests/sim/showroom.test.ts asserts the combined layout really reports zero overlap pairs and
 *  that everything stays inside the ground plane -- neither is assumed here.
 *
 *  Two presets stay out of the yard, both deliberately: the clock movement (now 144 units wide,
 *  since a one-module 12:1 needs a 120-diameter hour wheel) and the music box. Both are bench
 *  pieces that would read as scale nonsense standing in a field beside a locomotive; both remain
 *  available from the preset panel. */
const SHOWROOM: Array<{ layout: LayoutState; props: Prop[]; offset: Vec3 }> = [
  // Back row (z = -202.5).
  { layout: createLocomotivePreset(), props: createLocomotiveProps(), offset: [-300, 0, -202.5] },
  { layout: createFactoryPreset(), props: createFactoryProps(), offset: [-150, 0, -202.5] },
  { layout: createWatermillPreset(), props: createWatermillProps(), offset: [0, 0, -202.5] },
  { layout: createTowerCranePreset(), props: createTowerCraneProps(), offset: [150, 0, -202.5] },
  { layout: createClockTowerPreset(), props: createClockTowerProps(), offset: [300, 0, -202.5] },
  // Second row (z = -67.5).
  { layout: createWindmillPreset(), props: createWindmillProps(), offset: [-300, 0, -67.5] },
  { layout: createCarPreset(), props: createCarProps(), offset: [-150, 0, -67.5] },
  { layout: createPistonEnginePreset(), props: createPistonEngineProps(), offset: [0, 0, -67.5] },
  { layout: createFerrisWheelPreset(), props: createFerrisWheelProps(), offset: [150, 0, -67.5] },
  { layout: createGearboxPreset(), props: createGearboxProps(), offset: [300, 0, -67.5] },
  // Third row (z = 67.5).
  { layout: createBicyclePreset(), props: createBicycleProps(), offset: [-300, 0, 67.5] },
  { layout: createAirplanePreset(), props: createAirplaneProps(), offset: [-150, 0, 67.5] },
  { layout: createCarouselPreset(), props: createCarouselProps(), offset: [0, 0, 67.5] },
  { layout: createWormTablePreset(), props: createWormTableProps(), offset: [150, 0, 67.5] },
  { layout: createPlanetaryHoistPreset(), props: createPlanetaryHoistProps(), offset: [300, 0, 67.5] },
  // Front row (z = 202.5).
  { layout: createCastlePreset(), props: createCastleProps(), offset: [-300, 0, 202.5] },
  { layout: createWellPumpPreset(), props: createWellPumpProps(), offset: [-150, 0, 202.5] },
  { layout: createConveyorPreset(), props: createConveyorProps(), offset: [0, 0, 202.5] },
  { layout: createDifferentialAxlePreset(), props: createDifferentialAxleProps(), offset: [150, 0, 202.5] },
  { layout: createHoistPreset(), props: createHoistProps(), offset: [300, 0, 202.5] },
];

/** The default first-visit scene: twenty finished machines arranged in a yard, replacing the
 *  old abstract 12-gear-type showcase. Gear ids are unique across presets (each is prefixed with its machine's
 *  Korean name), so the combined gear list and remote-link list are just concatenations. */
export function createShowroomLayout(): LayoutState {
  const gears: GearInstance[] = [];
  const remoteLinks: LayoutState["remoteLinks"] = [];
  const vehicles: Vehicle[] = [];
  for (const { layout, props, offset } of SHOWROOM) {
    // Seat each machine on the ground BEFORE shifting it to its cell. The ground plane is
    // opaque, so anything authored below y = 0 simply disappears into it -- sixteen of the
    // bundled presets did that somewhere, the piston engine by 16 units. `seatOnGround` needs
    // the machine's props as well as its gears, since the body usually hangs lower than the
    // mechanism does.
    const seated = seatOnGround(layout, props);
    const shifted = translateLayout(seated.layout, offset);
    gears.push(...shifted.gears);
    remoteLinks.push(...shifted.remoteLinks);
    vehicles.push(...(shifted.vehicles ?? []));
  }
  return { gears, remoteLinks, vehicles };
}

/** The combined decorative props for every machine in the showroom, each offset to sit on
 *  its own relocated mechanism. */
export function createShowroomProps(): Prop[] {
  const props: Prop[] = [];
  for (const { layout, props: p, offset } of SHOWROOM) {
    // Same lift as `createShowroomLayout` applies to the gears -- computed from the same pair,
    // so the body and the mechanism move together and stay aligned.
    const seated = seatOnGround(layout, p);
    props.push(...translateProps(seated.props, offset));
  }
  return props;
}
