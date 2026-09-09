import type { LayoutState, GearInstance } from "./types";
import type { Prop } from "../render/props";
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

/** The sixteen finished machines, on a 4x4 yard.
 *
 *  Cell pitch (130 across X, 120 along Z) was chosen against each preset's REAL measured extent
 *  rather than by eye. The widest cases set it: the factory line shaft spans 114 units of X, the
 *  watermill 80 and the piston engine 74; along Z the locomotive is 103 long and the conveyor
 *  56. Machines are also assigned to cells so that no two wide ones land side by side in the
 *  same row.
 *
 *  Placement matters for more than looks: `classify()` flags any two gears sitting inside each
 *  other's overlap radius and does not care that they belong to different machines.
 *  tests/sim/showroom.test.ts asserts the combined layout really does report zero overlap pairs,
 *  and that everything stays inside the ground plane -- neither is assumed here.
 *
 *  The yard holds machines that read as standalone objects standing in a field. The clock
 *  movement and the music box stay out and remain available from the preset panel: both are
 *  tabletop/bench pieces, and standing them in a field would read as scale nonsense next to a
 *  locomotive and a tower crane. */
const SHOWROOM: Array<{ layout: LayoutState; props: Prop[]; offset: Vec3 }> = [
  // Back row (z = -180).
  { layout: createLocomotivePreset(), props: createLocomotiveProps(), offset: [-195, 0, -180] },
  { layout: createFactoryPreset(), props: createFactoryProps(), offset: [-65, 0, -180] },
  { layout: createWatermillPreset(), props: createWatermillProps(), offset: [65, 0, -180] },
  { layout: createTowerCranePreset(), props: createTowerCraneProps(), offset: [195, 0, -180] },
  // Second row (z = -60).
  { layout: createWindmillPreset(), props: createWindmillProps(), offset: [-195, 0, -60] },
  { layout: createCarPreset(), props: createCarProps(), offset: [-65, 0, -60] },
  { layout: createPistonEnginePreset(), props: createPistonEngineProps(), offset: [65, 0, -60] },
  { layout: createClockTowerPreset(), props: createClockTowerProps(), offset: [195, 0, -60] },
  // Third row (z = 60).
  { layout: createBicyclePreset(), props: createBicycleProps(), offset: [-195, 0, 60] },
  { layout: createAirplanePreset(), props: createAirplaneProps(), offset: [-65, 0, 60] },
  { layout: createCarouselPreset(), props: createCarouselProps(), offset: [65, 0, 60] },
  { layout: createFerrisWheelPreset(), props: createFerrisWheelProps(), offset: [195, 0, 60] },
  // Front row (z = 180).
  { layout: createCastlePreset(), props: createCastleProps(), offset: [-195, 0, 180] },
  { layout: createWellPumpPreset(), props: createWellPumpProps(), offset: [-65, 0, 180] },
  { layout: createConveyorPreset(), props: createConveyorProps(), offset: [65, 0, 180] },
  { layout: createHoistPreset(), props: createHoistProps(), offset: [195, 0, 180] },
];

/** The default first-visit scene: sixteen finished machines arranged in a yard, replacing the
 *  old abstract 12-gear-type showcase. Gear ids are unique across presets (each is prefixed with its machine's
 *  Korean name), so the combined gear list and remote-link list are just concatenations. */
export function createShowroomLayout(): LayoutState {
  const gears: GearInstance[] = [];
  const remoteLinks: LayoutState["remoteLinks"] = [];
  for (const { layout, offset } of SHOWROOM) {
    const shifted = translateLayout(layout, offset);
    gears.push(...shifted.gears);
    remoteLinks.push(...shifted.remoteLinks);
  }
  return { gears, remoteLinks };
}

/** The combined decorative props for every machine in the showroom, each offset to sit on
 *  its own relocated mechanism. */
export function createShowroomProps(): Prop[] {
  const props: Prop[] = [];
  for (const { props: p, offset } of SHOWROOM) {
    props.push(...translateProps(p, offset));
  }
  return props;
}
