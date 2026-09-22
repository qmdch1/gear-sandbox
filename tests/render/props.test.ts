// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildPropMesh, type Prop } from "../../src/render/props";

/** THE GAP THIS FILE FILLS.
 *
 *  `src/render/props.ts` had no test file at all, and it is the one place where a preset's
 *  authored numbers become geometry. The whole repo reasons about prop geometry -- "position is
 *  a CENTRE", "a ring is a TORUS so its material reaches radius +/- tube" -- and every clearance
 *  figure in every preset rests on this module behaving the way those sentences assume.
 *
 *  Measured before writing this. Swapping BoxGeometry's second and third arguments, giving
 *  CylinderGeometry its height as a radius, and swapping TorusGeometry's radius and tube left
 *  the entire suite green, `tsc` included. On screen that draws the locomotive's frame rail
 *  (size [1.6, 3, 100] centred at y = 15.5) as a 1.6 x 100 x 3 slab spanning y = -34.5..65.5 --
 *  a wall through the floor and over the boiler -- and the ferris wheel's rim (radius 16, tube
 *  0.55) as a solid barrel 32 deep instead of a hoop 1.1 deep, swallowing all sixteen gondolas.
 *
 *  Dropping the single line that applies `rotation` was equally invisible, and worse than it
 *  sounds: `SceneSync.setProps` snapshots each mesh's quaternion as the baseQuat every moving
 *  prop is posed from, so 140 attachTo and 11 linkTo props would spin from identity rather than
 *  from the orientation their preset authored.
 *
 *  NOT COVERED HERE, and deliberately so: the texture and opacity branches. Under jsdom
 *  `getProceduralTexture` returns null -- there is no canvas backend -- so the block that
 *  assigns `map`, `bumpMap` and `roughnessMap` cannot execute in any test in this repo. Saying
 *  so is better than writing an assertion that passes because the branch never ran. */

const common = { position: [0, 0, 0] as [number, number, number], color: 0x888888 };

/** THREE keeps the constructor arguments on `geometry.parameters`, which is what lets this
 *  compare against the numbers a preset authored rather than against vertex soup. */
const params = (mesh: THREE.Mesh) => (mesh.geometry as unknown as { parameters: Record<string, number> }).parameters;

describe("buildPropMesh -- authored numbers reach the geometry unswapped", () => {
  it("maps a box's size to width, height and depth IN THAT ORDER", () => {
    // Deliberately three different numbers: a cube cannot catch a swap, which is why the one
    // pre-existing test that built a box (a 2x2x2 cube in textures.test.ts) could not.
    const mesh = buildPropMesh({ ...common, kind: "box", size: [1.6, 3, 100] } as Prop);
    const p = params(mesh);
    expect(p.width).toBe(1.6);
    expect(p.height).toBe(3);
    expect(p.depth).toBe(100);
  });

  it("gives a cylinder equal end radii and its own height, not one for the other", () => {
    const mesh = buildPropMesh({
      ...common,
      kind: "cylinder",
      radius: 2.2,
      height: 14,
      radialSegments: 12,
    } as Prop);
    const p = params(mesh);
    expect(p.radiusTop).toBe(2.2);
    expect(p.radiusBottom).toBe(2.2);
    expect(p.height).toBe(14);
    expect(p.radialSegments).toBe(12);
  });

  it("builds a ring as a TORUS of radius and tube, in that order", () => {
    // The distinction the whole repo leans on: a ring's material reaches radius +/- tube, so a
    // swap turns a thin hoop into a fat barrel of the same nominal size.
    const mesh = buildPropMesh({ ...common, kind: "ring", radius: 16, tube: 0.55 } as Prop);
    const p = params(mesh);
    expect(p.radius).toBe(16);
    expect(p.tube).toBe(0.55);
    expect(p.radius).toBeGreaterThan(p.tube); // a hoop, not a barrel
  });

  it("builds a cone from its base radius and height", () => {
    const mesh = buildPropMesh({ ...common, kind: "cone", radius: 5, height: 6 } as Prop);
    const p = params(mesh);
    expect(p.radius).toBe(5);
    expect(p.height).toBe(6);
  });

  it("builds a sphere from its radius", () => {
    const mesh = buildPropMesh({ ...common, kind: "sphere", radius: 3 } as Prop);
    expect(params(mesh).radius).toBe(3);
  });

  it("defaults a cylinder's and a cone's segment counts rather than leaving them undefined", () => {
    const cyl = buildPropMesh({ ...common, kind: "cylinder", radius: 1, height: 1 } as Prop);
    const cone = buildPropMesh({ ...common, kind: "cone", radius: 1, height: 1 } as Prop);
    expect(params(cyl).radialSegments).toBeGreaterThan(2);
    expect(params(cone).radialSegments).toBeGreaterThan(2);
  });
});

describe("buildPropMesh -- pose and material", () => {
  it("places the mesh at the authored position, which is its CENTRE", () => {
    const mesh = buildPropMesh({
      kind: "box",
      position: [10, -4, 7],
      size: [2, 2, 2],
      color: 0x111111,
    } as Prop);
    expect(mesh.position.toArray()).toEqual([10, -4, 7]);
  });

  it("applies the authored rotation as Euler XYZ", () => {
    // 158 rotation triples are authored across the presets. Without this line the bicycle's
    // tyres (rotation [0, PI/2, 0]) lie flat like plates instead of standing in the wheel
    // plane, and the clock's bezel ([PI/2, 0, 0]) faces the ceiling.
    const mesh = buildPropMesh({
      ...common,
      kind: "box",
      size: [1, 1, 1],
      rotation: [0.25, Math.PI / 2, -1.5],
    } as Prop);
    expect(mesh.rotation.x).toBeCloseTo(0.25, 12);
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2, 12);
    expect(mesh.rotation.z).toBeCloseTo(-1.5, 12);
    expect(mesh.rotation.order).toBe("XYZ");
    // And the quaternion really turned -- this is what SceneSync snapshots as baseQuat.
    expect(mesh.quaternion.equals(new THREE.Quaternion())).toBe(false);
  });

  it("leaves a prop with no rotation at identity", () => {
    const mesh = buildPropMesh({ ...common, kind: "box", size: [1, 1, 1] } as Prop);
    expect(mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });

  it("carries colour, metalness and roughness onto the material, with defaults", () => {
    const plain = buildPropMesh({ ...common, kind: "box", size: [1, 1, 1] } as Prop);
    const plainMat = plain.material as THREE.MeshStandardMaterial;
    expect(plainMat.color.getHex()).toBe(0x888888);
    expect(plainMat.metalness).toBeCloseTo(0.35, 9);
    expect(plainMat.roughness).toBeCloseTo(0.6, 9);

    const shiny = buildPropMesh({
      ...common,
      kind: "box",
      size: [1, 1, 1],
      metalness: 0.9,
      roughness: 0.1,
    } as Prop);
    const shinyMat = shiny.material as THREE.MeshStandardMaterial;
    expect(shinyMat.metalness).toBeCloseTo(0.9, 9);
    expect(shinyMat.roughness).toBeCloseTo(0.1, 9);
  });

  it("turns on transparency only for an opacity below 1", () => {
    // Five props rely on this: the locomotive's cylinder barrel at 0.35, the watermill's
    // glazing, the gearbox housing at 0.75 -- all of them there to REVEAL the mechanism inside,
    // which an opaque box hides completely.
    const glass = buildPropMesh({ ...common, kind: "box", size: [1, 1, 1], opacity: 0.35 } as Prop);
    const glassMat = glass.material as THREE.MeshStandardMaterial;
    expect(glassMat.transparent).toBe(true);
    expect(glassMat.opacity).toBeCloseTo(0.35, 9);

    const solid = buildPropMesh({ ...common, kind: "box", size: [1, 1, 1], opacity: 1 } as Prop);
    expect((solid.material as THREE.MeshStandardMaterial).transparent).toBe(false);
  });
});
