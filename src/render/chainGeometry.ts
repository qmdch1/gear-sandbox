import * as THREE from "three";

/** A thin tube-shaped ribbon spanning two world points -- stands in for a chain or belt
 *  segment between two remote-linked sprockets/pulleys. Rebuilt on every SceneSync.sync()
 *  call (Task 14) since both endpoints can move independently of any single GearInstance's
 *  own transform, unlike a normal gear mesh's geometry (which is rebuilt only when the
 *  gear's teeth/module change). */
export function buildLinkRibbon(
  pointA: [number, number, number],
  pointB: [number, number, number],
  width: number,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...pointA);
  const b = new THREE.Vector3(...pointB);
  const curve = new THREE.LineCurve3(a, b);
  return new THREE.TubeGeometry(curve, 1, width, 6, false);
}
