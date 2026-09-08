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
/** Fields shared by every prop kind. `attachTo`, if set, is the id of a gear this prop
 *  should SPIN WITH: every frame `SceneSync` rotates the prop about that gear's axis,
 *  around the gear's centre, by the gear's current rotation -- so props that ought to
 *  move (windmill sails, propeller blades, wheel spokes) actually turn with the hub gear
 *  driving them, instead of hanging static while only the little hub gear spins. */
interface PropCommon {
  position: [number, number, number];
  color: number;
  /** Euler XYZ radians. */
  rotation?: [number, number, number];
  metalness?: number;
  roughness?: number;
  opacity?: number;
  attachTo?: string;
  /** If set, the id of a RACK this prop should SLIDE WITH: every frame `SceneSync` shifts
   *  the prop along that rack's axis by the rack's current `linearPosition` -- so a castle
   *  gate panel (a prop) rises and falls with the rack the winch drives, instead of the
   *  only moving thing being the little toothed rack bar itself. Mutually exclusive with
   *  `attachTo` in practice (a rack doesn't rotate; a rotating gear has no linearPosition). */
  slideWith?: string;
}

export type Prop =
  | (PropCommon & {
      kind: "box";
      size: [number, number, number];
    })
  | (PropCommon & {
      kind: "cylinder";
      radius: number;
      height: number;
      radialSegments?: number;
    })
  | (PropCommon & {
      kind: "ring";
      /** Center-line radius of the torus. */
      radius: number;
      /** Thickness of the ring's tube. */
      tube: number;
    });

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
