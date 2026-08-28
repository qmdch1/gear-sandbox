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

import { createScene } from "../../src/render/scene";

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
});
