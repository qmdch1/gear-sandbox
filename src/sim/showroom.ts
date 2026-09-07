import type { LayoutState, GearInstance } from "./types";
import type { Prop } from "../render/props";
import { createCarPreset, createCarProps } from "./presets/car";
import { createAirplanePreset, createAirplaneProps } from "./presets/airplane";
import { createWindmillPreset, createWindmillProps } from "./presets/windmill";
import { createBicyclePreset, createBicycleProps } from "./presets/bicycle";

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

/** The four finished-object presets, each placed at a corner of a compact 2x2 grid so none
 *  of their gears or bodies overlap. The offsets were chosen against each preset's real gear
 *  and prop extents (car body ~26 wide, airplane wings ~40, windmill tower + sails ~22,
 *  bicycle ~36 long) so the whole showroom reads as a little yard of complete machines --
 *  which is what a first-time visitor now sees instead of an abstract bench of loose gears. */
const SHOWROOM: Array<{ layout: LayoutState; props: Prop[]; offset: Vec3 }> = [
  { layout: createCarPreset(), props: createCarProps(), offset: [0, 0, 0] },
  { layout: createAirplanePreset(), props: createAirplaneProps(), offset: [0, 0, 70] },
  { layout: createWindmillPreset(), props: createWindmillProps(), offset: [70, 0, 0] },
  { layout: createBicyclePreset(), props: createBicycleProps(), offset: [70, 0, 70] },
];

/** The default first-visit scene: the four finished-object presets (car, airplane,
 *  windmill, bicycle) arranged in a yard, replacing the old abstract 12-gear-type
 *  showcase. Gear ids are unique across presets (each is prefixed with its machine's
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
