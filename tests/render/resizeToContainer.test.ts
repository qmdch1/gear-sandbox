// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

/** A renderer stub that reproduces the ONE real behaviour this fix is about: THREE's
 *  `setSize(w, h, updateStyle)` writes the size it is given onto the canvas as an inline
 *  style. That is what turned "measure the canvas to size the canvas" into a feedback loop.
 *  `shadowMap` is left undefined, exactly as a context-less renderer reports it, so
 *  `createScene`'s headless guards take their degraded path. */
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    shadowMap: undefined;
    constructor(params: { canvas: HTMLCanvasElement }) {
      this.domElement = params.canvas;
    }
    setSize(width: number, height: number, updateStyle?: boolean) {
      if (updateStyle !== false) {
        this.domElement.style.width = `${width}px`;
        this.domElement.style.height = `${height}px`;
      }
    }
    render() {}
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

import { createScene, resizeToContainer } from "../../src/render/scene";

/** jsdom reports 0 for every clientWidth/clientHeight, so stub the container box the way a
 *  real layout would. The canvas deliberately gets NO stub -- the whole point is that sizing
 *  reads the container, never the canvas. */
function makeCanvasIn(width: number, height: number) {
  const box = document.createElement("div");
  const canvas = document.createElement("canvas");
  box.appendChild(canvas);
  resizeBox(box, width, height);
  document.body.appendChild(box);
  return { box, canvas };
}

function resizeBox(box: HTMLElement, width: number, height: number) {
  Object.defineProperty(box, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(box, "clientHeight", { value: height, configurable: true });
}

describe("resizeToContainer", () => {
  it("grows the viewport back after the canvas was pinned small -- the resize feedback loop", () => {
    // The real failure this guards: a first load in a tiny pane pinned the canvas at 24x12px,
    // and because every later resize re-measured the CANVAS (which setSize had just written
    // 24x12 onto), the viewport could never grow back -- the scene rendered into a 24x12
    // corner of an otherwise black page.
    const { box, canvas } = makeCanvasIn(24, 12);
    const ctx = createScene(canvas);
    expect(canvas.style.width).toBe("24px"); // pinned small, exactly as in the real failure

    resizeBox(box, 1200, 760);
    resizeToContainer(ctx);

    expect(canvas.style.width).toBe("1200px");
    expect(canvas.style.height).toBe("760px");
    expect(ctx.camera.aspect).toBeCloseTo(1200 / 760, 9);
  });

  it("keeps following the container both larger and smaller, repeatedly", () => {
    const { box, canvas } = makeCanvasIn(800, 600);
    const ctx = createScene(canvas);
    for (const [w, h] of [[1600, 900], [400, 300], [1024, 768]] as const) {
      resizeBox(box, w, h);
      resizeToContainer(ctx);
      expect(canvas.style.width).toBe(`${w}px`);
      expect(canvas.style.height).toBe(`${h}px`);
      expect(ctx.camera.aspect).toBeCloseTo(w / h, 9);
    }
  });
});
