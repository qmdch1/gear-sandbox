// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor() {
      this.domElement = document.createElement("canvas");
    }
    setSize() {}
    render() {}
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

import { createScene, GROUND_SIZE } from "../../src/render/scene";

const makeCanvas = () => document.createElement("canvas");

describe("createScene", () => {
  it("adds lighting and a ground plane to the scene", () => {
    const canvas = document.createElement("canvas");
    const { scene, groundPlane, camera, controls } = createScene(canvas);
    expect(scene.children).toContain(groundPlane);
    expect(scene.children.some((c) => c.type === "AmbientLight")).toBe(true);
    expect(scene.children.some((c) => c.type === "DirectionalLight")).toBe(true);
    expect(camera.position.length()).toBeGreaterThan(0);
    expect(controls.maxDistance).toBeGreaterThan(controls.minDistance);
  });

  it("lights the scene from two directional angles (key + fill), not just one flat source", () => {
    // A single directional light leaves the far side of every gear pitch-black; a second,
    // dimmer light from roughly the opposite side keeps teeth/faces readable all around.
    const canvas = document.createElement("canvas");
    const { scene } = createScene(canvas);
    const directionals = scene.children.filter(
      (c): c is THREE.DirectionalLight => c.type === "DirectionalLight",
    );
    expect(directionals.length).toBeGreaterThanOrEqual(2);
    const positions = directionals.map((d) => d.position.clone().normalize());
    // The two lights should not be pointing in (near) the same direction.
    expect(positions[0].dot(positions[1])).toBeLessThan(0.9);
    // The dominant (key) light should be brighter than every other directional light.
    const intensities = directionals.map((d) => d.intensity).sort((a, b) => b - a);
    expect(intensities[0]).toBeGreaterThan(intensities[1]);
  });

  it("uses MeshStandardMaterial for the ground plane so it responds to scene lighting", () => {
    const canvas = document.createElement("canvas");
    const { groundPlane } = createScene(canvas);
    expect(groundPlane.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it("can actually SEE the whole yard from as far back as the controls allow", () => {
    const { camera, controls } = createScene(makeCanvas());
    // These two constants have to agree, and nothing warns when they do not: `fitAll` really
    // does stand the camera off at `maxDistance` to frame the yard, and with a nearer far
    // plane everything at that range falls behind the clip plane and the view simply empties.
    // The far plane must clear the orbit ceiling PLUS the yard's own radius behind the target.
    expect(camera.far).toBeGreaterThan(controls.maxDistance + GROUND_SIZE);
    expect(camera.near).toBeLessThan(1);
  });

  it("casts shadows over the whole ground, not just the middle of it", () => {
    const { scene } = createScene(makeCanvas());
    const key = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight && c.castShadow,
    )!;
    // A machine outside the shadow camera's frustum stops casting with no error at all, which
    // is exactly how most of the yard's outer columns ended up quietly shadowless when the
    // yard grew past the frustum that had been sized for the original small cluster.
    const cam = key.shadow.camera;
    expect(cam.right - cam.left).toBeGreaterThanOrEqual(GROUND_SIZE);
    expect(cam.top - cam.bottom).toBeGreaterThanOrEqual(GROUND_SIZE);
    // ...and deep enough to reach the far corner of that ground from where the light stands.
    expect(cam.far).toBeGreaterThan(key.position.length() + GROUND_SIZE * 0.71);
  });
});
