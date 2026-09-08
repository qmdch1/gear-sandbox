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

/** The nine finished machines, on a 3x3 yard.
 *
 *  The grid pitch (170 across X, 150 along Z) was chosen against each preset's REAL measured
 *  extent, not by eye. The two widest cases set it: the factory line shaft spans 114 units of
 *  X, and the locomotive 103 units of Z. Every machine is also kept inside the 500x500 ground
 *  plane (+/-250), which is why the grid is centred on the origin instead of growing out from
 *  a corner -- the far column would otherwise hang off the edge of the world.
 *
 *  Placement matters for more than looks: `classify()` flags any two gears that sit inside
 *  each other's overlap radius, and it does not care that they belong to different machines.
 *  The spacing below leaves at least ~50 units of clear air between neighbouring machines'
 *  gear clusters, and tests/sim/showroom.test.ts asserts the combined layout really does
 *  report zero overlap pairs rather than trusting that.
 *
 *  The bench-style demos (clock, castle gate, hoist) stay out of the yard and remain
 *  available from the preset panel: they read as mechanisms on a workbench rather than
 *  vehicles and buildings standing in a field. */
const SHOWROOM: Array<{ layout: LayoutState; props: Prop[]; offset: Vec3 }> = [
  // Centre column.
  { layout: createCarPreset(), props: createCarProps(), offset: [0, 0, 0] },
  { layout: createAirplanePreset(), props: createAirplaneProps(), offset: [0, 0, 150] },
  { layout: createWindmillPreset(), props: createWindmillProps(), offset: [0, 0, -150] },
  // Left column.
  { layout: createBicyclePreset(), props: createBicycleProps(), offset: [-170, 0, 0] },
  { layout: createFerrisWheelPreset(), props: createFerrisWheelProps(), offset: [-170, 0, 150] },
  { layout: createLocomotivePreset(), props: createLocomotiveProps(), offset: [-170, 0, -150] },
  // Right column.
  { layout: createWatermillPreset(), props: createWatermillProps(), offset: [170, 0, 0] },
  { layout: createPistonEnginePreset(), props: createPistonEngineProps(), offset: [170, 0, 150] },
  { layout: createFactoryPreset(), props: createFactoryProps(), offset: [170, 0, -150] },
];

/** The default first-visit scene: nine finished machines arranged in a yard, replacing the
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
