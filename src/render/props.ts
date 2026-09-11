import * as THREE from "three";
import { getProceduralTexture, type TextureKind } from "./textures";

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
  /** If set, this prop hangs from a ROPE spooling onto a rotating drum: every frame
   *  `SceneSync` moves it along `direction` by `drum.rotation * radius` -- the exact
   *  kinematics of a rope winding onto a drum of that radius (the same angle x radius
   *  relation `rotation.ts` already uses to drive a rack from a pinion). Purely kinematic,
   *  like everything else in this sandbox: it says where the hook goes, never how much it
   *  could lift. `travel` bounds it, so the hook stops at the headblock instead of climbing
   *  through the gantry forever. */
  /** Id of the `Vehicle` this prop is part of: a car's chassis, shell and cabin. Drawn
   *  displaced by how far that vehicle has driven, on top of whatever `attachTo`/`windWith`
   *  pose the prop already has -- a wheel's spokes both spin AND travel. */
  ridesOn?: string;
  windWith?: {
    gear: string; // the winch drum
    radius: number; // effective radius the rope spools at, in world units
    direction: [number, number, number]; // world direction travelled per positive rotation
    travel: [number, number]; // [min, max] world units of travel, clamped
  };
  /** Procedural surface finish (see `render/textures.ts`). The pattern is greyscale and is
   *  multiplied against `color`, so "wood" on a pale colour reads as pine and on a dark one
   *  as walnut; the same pattern doubles as a bump map so the grain catches the key light.
   *  Omit for a plain flat-coloured surface. */
  texture?: TextureKind;
  /** How many times the texture tiles across this prop, [u, v]. Bigger numbers = finer
   *  grain. Defaults to [2, 2]. */
  textureRepeat?: [number, number];
  /** If set, this prop is part of a CRANK-SLIDER LINKAGE driven by `gear`: a pin fixed at
   *  `crankRadius` from the gear's centre sweeps round with it, a rigid rod of `rodLength`
   *  connects that pin to a slider, and the slider is constrained to the line through the
   *  gear's centre along `slideAxis`. This is the mechanism behind a piston engine, a
   *  locomotive's driving rods and a pumpjack -- rotation converted into reciprocating
   *  straight-line motion, the one linkage this sandbox could not previously express.
   *
   *  `role` says which member THIS prop is: the `rod` is re-posed to span pin -> slider each
   *  frame (its authored length should equal `rodLength`, and its long axis must be local Y),
   *  the `slider` slides along the axis, and a `pin` simply rides the crank pin (a crank
   *  throw, a wrist boss). `rodLength` must exceed `crankRadius` or the linkage cannot
   *  close; `slideAxis` must not be parallel to the gear's own axis. */
  linkTo?: {
    gear: string;
    crankRadius: number;
    rodLength: number;
    slideAxis: [number, number, number];
    role: "rod" | "slider" | "pin";
  };
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
    })
  | (PropCommon & {
      kind: "sphere";
      radius: number;
    })
  | (PropCommon & {
      kind: "cone";
      radius: number;
      height: number;
      radialSegments?: number;
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
  if (prop.texture) {
    // Shared, cached texture -- null wherever there is no canvas backend (jsdom, headless),
    // in which case the prop just stays flat-coloured. The clone gives this material its own
    // repeat setting without disturbing other props using the same cached pattern.
    const base = getProceduralTexture(prop.texture);
    if (base) {
      const [u, v] = prop.textureRepeat ?? [2, 2];
      const map = base.clone();
      map.needsUpdate = true;
      map.repeat.set(u, v);
      material.map = map;
      material.bumpMap = map;
      material.bumpScale = 0.35;
      // The same pattern also drives ROUGHNESS, which is what stops a textured surface reading
      // as a flat decal. A single roughness number makes every part of a brick wall reflect
      // identically -- mortar exactly as glossy as brick face, knots as glossy as clear grain.
      // Feeding the greyscale in here makes the pattern's light areas (brick face, clear timber,
      // polished metal) shinier than its dark ones (mortar, knots, pitting), so the material
      // varies across itself the way a real one does. `roughness` still sets the overall level;
      // the map modulates around it.
      material.roughnessMap = map;
      material.needsUpdate = true;
    }
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
    case "sphere": {
      const geo = new THREE.SphereGeometry(prop.radius, 32, 20);
      return applyCommon(new THREE.Mesh(geo, material), prop, material);
    }
    case "cone": {
      const geo = new THREE.ConeGeometry(prop.radius, prop.height, prop.radialSegments ?? 24);
      return applyCommon(new THREE.Mesh(geo, material), prop, material);
    }
  }
}
