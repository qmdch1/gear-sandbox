import type { Prop } from "../../render/props";

/** Radial spoke props for a wheel that rolls about world X (axis [1,0,0]) -- i.e. every
 *  wheel in this project (car + bicycle). A plain pulley disc or a torus tire is
 *  rotationally symmetric about its own axis, so spinning it shows no visible motion; a
 *  few contrasting spokes attached (via `attachTo`) to the wheel's hub gear make the spin
 *  actually readable. Each spoke is a thin box radiating in the wheel's YZ plane, rotated
 *  about X to its clock position, and `attachTo`-ed to the hub gear so `SceneSync` spins it
 *  with the wheel every frame.
 *
 *  `center` is the wheel hub's position (preset-local; the showroom translation shifts spokes
 *  and hub together, so their relative offset -- all that `attachTo` cares about -- is
 *  preserved). */
export function wheelSpokesX(opts: {
  attachTo: string;
  center: [number, number, number];
  radius: number;
  count?: number;
  thickness?: number;
  color: number;
}): Prop[] {
  const { attachTo, center, radius, color } = opts;
  const count = opts.count ?? 6;
  const thickness = opts.thickness ?? 0.5;
  const props: Prop[] = [];
  for (let i = 0; i < count; i++) {
    // Only need half the spokes to span the full diameter (a spoke is a bar through the
    // centre), but authoring each as a centre->rim bar at `count` evenly spaced angles reads
    // fine and keeps the hub visually filled.
    const a = (i / count) * Math.PI * 2;
    const dY = Math.cos(a);
    const dZ = Math.sin(a);
    props.push({
      kind: "box",
      // Midpoint of a centre->rim spoke sits at half the radius along its direction.
      position: [center[0], center[1] + dY * (radius / 2), center[2] + dZ * (radius / 2)],
      // Long axis is the box's local Y; rotating about X by `a` points local Y along (0,dY,dZ).
      size: [thickness, radius, thickness],
      color,
      texture: "metal",
      rotation: [a, 0, 0],
      attachTo,
      metalness: 0.55,
      roughness: 0.4,
    });
  }
  // A small hub cap so the spokes visibly converge on a centre, also attached so it spins too.
  props.push({
    kind: "cylinder",
    position: [center[0], center[1], center[2]],
    radius: Math.max(thickness * 1.6, radius * 0.14),
    height: thickness * 1.4,
    color,
    texture: "metal",
    rotation: [0, 0, Math.PI / 2], // lay the default-Y cylinder along X (the wheel axis)
    attachTo,
    metalness: 0.6,
    roughness: 0.35,
  });
  return props;
}
