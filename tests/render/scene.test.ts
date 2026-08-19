// @vitest-environment jsdom
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
});
