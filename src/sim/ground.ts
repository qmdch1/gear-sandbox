import type { GearInstance, LayoutState } from "./types";
import type { Prop } from "../render/props";

type Vec3 = [number, number, number];

/** Rotates `v` by an Euler XYZ triple, matching how `render/props.ts` hands `rotation` to
 *  THREE (`mesh.rotation.set(x, y, z)`, whose default order is XYZ). Small and local so this
 *  module stays in the sim layer with no THREE dependency -- the sim must not need a renderer
 *  to answer "how low does this machine hang?". */
function rotateEulerXYZ(v: Vec3, r: Vec3): Vec3 {
  const [rx, ry, rz] = r;
  let [x, y, z] = v;
  // X
  let s = Math.sin(rx), c = Math.cos(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  // Y
  s = Math.sin(ry); c = Math.cos(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  // Z
  s = Math.sin(rz); c = Math.cos(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/** Half-extents of a prop's geometry in its OWN local axes, before rotation.
 *
 *  Round shapes are treated as the box that encloses them, which over-estimates a little at the
 *  corners. That is the right way to be wrong here: seating a machine a hair high is invisible,
 *  while seating it a hair low is exactly the bug this module exists to prevent. */
function localHalfExtents(p: Prop): Vec3 {
  switch (p.kind) {
    case "box":
      return [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    // A cylinder and a cone are both built along local Y.
    case "cylinder":
      return [p.radius, p.height / 2, p.radius];
    case "cone":
      return [p.radius, p.height / 2, p.radius];
    case "sphere":
      return [p.radius, p.radius, p.radius];
    // A torus is built in the local XY plane: it spans (radius + tube) across X and Y, and only
    // the tube's own thickness through Z.
    case "ring":
      return [p.radius + p.tube, p.radius + p.tube, p.tube];
  }
}

/** Lowest world Y a prop reaches, with its rotation applied. */
export function propLowestY(p: Prop): number {
  const h = localHalfExtents(p);
  const r = p.rotation ?? [0, 0, 0];
  // The lowest corner of a rotated box: sum the absolute Y contribution of each rotated axis.
  const axes: Vec3[] = [
    [h[0], 0, 0],
    [0, h[1], 0],
    [0, 0, h[2]],
  ];
  let reach = 0;
  for (const a of axes) reach += Math.abs(rotateEulerXYZ(a, r as Vec3)[1]);
  return p.position[1] - reach;
}

/** Lowest world Y a gear's body reaches.
 *
 *  A gear is a disc: it extends its radius in the plane PERPENDICULAR to its axis, and almost
 *  nothing along the axis itself. So a flat gear (axis +Y, spinning like a turntable) hangs
 *  barely below its centre, while an upright one (axis +X, a wheel that rolls) hangs a full
 *  radius below. Getting this wrong in the obvious direction -- treating every gear as a sphere
 *  of its radius -- would report every clock and carousel as buried when they are not. */
export function gearLowestY(g: GearInstance): number {
  const radius = g.teeth > 0 ? (g.module * g.teeth) / 2 : g.module * 2;
  const [ax, ay, az] = g.axis;
  const length = Math.hypot(ax, ay, az) || 1;
  const uy = ay / length; // how much of the axis points along world Y
  // The disc's rim reaches `radius * sin(angle between axis and Y)` below the centre.
  const rimDrop = radius * Math.sqrt(Math.max(0, 1 - uy * uy));
  // Plus half the body's thickness along the axis, which `gearGeometry` scales with module.
  const halfThickness = g.module * Math.abs(uy);
  return g.position[1] - (rimDrop + halfThickness);
}

/** How far a machine hangs below the ground plane (y = 0), or 0 when it already sits on it. */
export function depthBelowGround(gears: GearInstance[], props: Prop[]): number {
  let lowest = Infinity;
  for (const g of gears) lowest = Math.min(lowest, gearLowestY(g));
  for (const p of props) lowest = Math.min(lowest, propLowestY(p));
  if (!Number.isFinite(lowest)) return 0;
  return Math.max(0, -lowest);
}

/** Lifts a whole machine so nothing hangs through the floor.
 *
 *  WHY THIS EXISTS. Presets are authored in their own local space, and it is very easy to place a
 *  part by its CENTRE and forget that half of it now sticks out below y = 0 -- a tower 34 tall
 *  centred at y = 6 starts 11 units underground. Sixteen of the twenty bundled presets did exactly
 *  that somewhere, worst of all the piston engine at 16 units down: the ground plane is opaque, so
 *  a machine's whole sump simply vanished into it.
 *
 *  A single uniform translation is safe for the simulation: every mesh, coupling, belt and chain
 *  depends only on the DISTANCE between gears, and translation preserves all of them, exactly as
 *  `showroom.ts` relies on for its horizontal grid offsets. `classify` sees the same edges and the
 *  same overlaps before and after.
 *
 *  This seats a machine; it does not centre or scale it. A machine already on the ground is
 *  returned untouched, so calling it is idempotent. */
export function seatOnGround(
  layout: LayoutState,
  props: Prop[],
): { layout: LayoutState; props: Prop[] } {
  const lift = depthBelowGround(layout.gears, props);
  if (lift === 0) return { layout, props };
  return {
    layout: {
      gears: layout.gears.map((g) => ({
        ...g,
        position: [g.position[0], g.position[1] + lift, g.position[2]] as Vec3,
      })),
      remoteLinks: layout.remoteLinks,
      // Lifting is a translation, so a vehicle's travel along the ground is untouched by it.
      vehicles: layout.vehicles,
    },
    props: props.map((p) => ({
      ...p,
      position: [p.position[0], p.position[1] + lift, p.position[2]] as Vec3,
    })),
  };
}
