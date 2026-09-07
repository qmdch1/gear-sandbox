import * as THREE from "three";

/** A decorative, NON-SIMULATED scene prop. Props exist purely to give a preset a
 *  recognizable physical body -- a car's chassis frame, a clock's bezel and tick marks,
 *  a hoist's mast -- around the gears that actually move. They are never part of
 *  `LayoutState` (they aren't gears, they don't mesh, they don't rotate, they aren't
 *  persisted or diagnosed); a preset supplies them alongside its layout, and `SceneSync`
 *  renders them as static meshes that are cleared and replaced whenever a new layout is
 *  loaded.
 *
 *  Deliberately a small, declarative set of primitives (box beam, cylinder/rod, ring,
 *  flat panel) rather than arbitrary geometry -- enough to sketch the silhouette of a
 *  real object out of simple parts, while staying trivially serializable and testable. */
export type Prop =
  | {
      kind: "box";
      position: [number, number, number];
      size: [number, number, number];
      color: number;
      /** Euler XYZ radians. */
      rotation?: [number, number, number];
      metalness?: number;
      roughness?: number;
      opacity?: number;
    }
  | {
      kind: "cylinder";
      position: [number, number, number];
      radius: number;
      height: number;
      color: number;
      rotation?: [number, number, number];
      radialSegments?: number;
      metalness?: number;
      roughness?: number;
      opacity?: number;
    }
  | {
      kind: "ring";
      position: [number, number, number];
      /** Center-line radius of the torus. */
      radius: number;
      /** Thickness of the ring's tube. */
      tube: number;
      color: number;
      rotation?: [number, number, number];
      metalness?: number;
      roughness?: number;
      opacity?: number;
    };

function applyCommon(
  mesh: THREE.Mesh,
  prop: Prop,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  mesh.position.set(prop.position[0], prop.position[1], prop.position[2]);
  if (prop.rotation) mesh.rotation.set(prop.rotation[0], prop.rotation[1], prop.rotation[2]);
  material.metalness = prop.metalness ?? 0.35;
  material.roughness = prop.roughness ?? 0.6;
  if (prop.opacity !== undefined && prop.opacity < 1) {
    material.transparent = true;
    material.opacity = prop.opacity;
  }
  return mesh;
}

/** Builds a single static THREE.Mesh from a `Prop` spec. Caller owns adding it to the
 *  scene and disposing its geometry/material when the prop set is replaced. */
export function buildPropMesh(prop: Prop): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: prop.color });
  switch (prop.kind) {
    case "box": {
      const geo = new THREE.BoxGeometry(prop.size[0], prop.size[1], prop.size[2]);
      return applyCommon(new THREE.Mesh(geo, material), prop, material);
    }
    case "cylinder": {
      const geo = new THREE.CylinderGeometry(prop.radius, prop.radius, prop.height, prop.radialSegments ?? 20);
      return applyCommon(new THREE.Mesh(geo, material), prop, material);
    }
    case "ring": {
      const geo = new THREE.TorusGeometry(prop.radius, prop.tube, 16, 48);
      return applyCommon(new THREE.Mesh(geo, material), prop, material);
    }
  }
}
