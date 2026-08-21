import * as THREE from "three";
import type { GearInstance } from "../sim/types";

/** Computes the same position/orientation/scale transform GearMeshObject's
 *  update() applies to a gear (outside its belt-tangent-geometry special case,
 *  see gearMesh.ts) -- kept as an independent, parallel implementation rather
 *  than a refactor of gearMesh.ts, so introducing instancing can't accidentally
 *  destabilize that already-tested, already live-verified per-mesh rendering
 *  path (mirrors this codebase's established practice of keeping duplicated-
 *  but-separate logic unrisked, e.g. meshing.ts's idealConnectionDistance).
 *
 *  A rod (shaft/beam -- belt is never instanced, see sceneSync.ts) spans its
 *  two endpoints, stretched via a non-uniform Z scale; every other type sits
 *  at its own position, oriented along its own axis. Both cases apply the same
 *  `rotateZ(gear.rotation)`-equivalent spin on top, exactly as gearMesh.ts
 *  does via `quaternion.setFromUnitVectors(...)` followed by `.rotateZ(...)`
 *  (three.js's rotateZ POST-multiplies the current quaternion by a Z-axis
 *  rotation, i.e. `quaternion = alignQuaternion * rotationAboutZ` -- the exact
 *  composition order reproduced below). */
export function computeInstanceMatrix(gear: GearInstance): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const rotationAboutZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), gear.rotation);

  if (gear.position2) {
    const start = new THREE.Vector3(...gear.position);
    const end = new THREE.Vector3(...gear.position2);
    const position = start.clone().add(end).multiplyScalar(0.5);
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length <= 1e-6) return matrix.identity().setPosition(position);
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
    orientation.multiply(rotationAboutZ);
    return matrix.compose(position, orientation, new THREE.Vector3(1, 1, length));
  }

  const position = new THREE.Vector3(...gear.position);
  const axis = new THREE.Vector3(...gear.axis).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  orientation.multiply(rotationAboutZ);
  return matrix.compose(position, orientation, new THREE.Vector3(1, 1, 1));
}
