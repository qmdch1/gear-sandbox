// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { FallingBodiesView } from "../../src/render/fallingBodies";
import { makeDroppedPart, PART_KINDS, DROP_HEIGHT } from "../../src/sim/parts";
import { stepBody } from "../../src/sim/gravity";

describe("makeDroppedPart", () => {
  it("cycles the kinds deterministically, so five drops are always the same five", () => {
    const ids = [0, 1, 2, 3, 4].map((i) => makeDroppedPart(i, [0, DROP_HEIGHT, 0]).id);
    expect(ids).toEqual([
      "part-0-steel",
      "part-1-stone",
      "part-2-rust",
      "part-3-steel",
      "part-4-stone",
    ]);
  });

  it("weighs each part as the sphere it is drawn as, at its own material's density", () => {
    for (const [i, kind] of PART_KINDS.entries()) {
      const part = makeDroppedPart(i, [0, 0, 0]);
      const radiusMetres = kind.radius / 100;
      expect(part.mass).toBeCloseTo(kind.density * (4 / 3) * Math.PI * radiusMetres ** 3, 12);
    }
    // The steel ball is small but dense; the stone is bigger but lighter per unit volume. Both
    // land at the same time -- mass does not enter the trajectory -- but they hit differently.
    const [steel, stone] = [makeDroppedPart(0, [0, 0, 0]), makeDroppedPart(1, [0, 0, 0])];
    expect(steel.restitution).toBeGreaterThan(stone.restitution);
  });

  it("starts every part at rest, in the air, three metres up", () => {
    const part = makeDroppedPart(0, [10, DROP_HEIGHT, -20]);
    expect(part.position).toEqual([10, 300, -20]);
    expect(part.velocity).toEqual([0, 0, 0]);
    expect(part.resting).toBe(false);
    expect(DROP_HEIGHT / 100).toBe(3); // metres, at one world unit per centimetre
  });
});

describe("FallingBodiesView", () => {
  it("draws one mesh per part, at the position the physics put it", () => {
    const scene = new THREE.Scene();
    const view = new FallingBodiesView(scene);
    const parts = [0, 1].map((i) => makeDroppedPart(i, [i * 10, DROP_HEIGHT, 0]));
    view.sync(parts);
    expect(scene.children).toHaveLength(2);
    expect((scene.children[0] as THREE.Mesh).position.toArray()).toEqual([0, 300, 0]);

    // Let them fall, and the meshes follow -- the view holds no physics of its own.
    const fallen = parts.map((p) => stepBody(p, 0.25));
    view.sync(fallen);
    expect(scene.children).toHaveLength(2); // same meshes, not duplicates
    expect((scene.children[0] as THREE.Mesh).position.y).toBeCloseTo(fallen[0].position[1], 9);
    expect((scene.children[0] as THREE.Mesh).position.y).toBeLessThan(DROP_HEIGHT);
  });

  it("clears away a part that is no longer there, and disposes its geometry", () => {
    const scene = new THREE.Scene();
    const view = new FallingBodiesView(scene);
    view.sync([makeDroppedPart(0, [0, 100, 0]), makeDroppedPart(1, [0, 100, 0])]);
    const doomed = scene.children[1] as THREE.Mesh;
    let disposed = false;
    doomed.geometry.addEventListener("dispose", () => (disposed = true));

    view.sync([makeDroppedPart(0, [0, 100, 0])]);
    expect(scene.children).toHaveLength(1);
    expect(disposed).toBe(true);

    view.clear();
    expect(scene.children).toHaveLength(0);
  });

  it("keeps a resting part's orientation instead of snapping it flat when it stops rolling", () => {
    // A part that has stopped has no direction to roll about. Recomputing an axis from a zero
    // velocity would produce NaN, and defaulting to identity would make every part visibly
    // click back to its original orientation the instant it came to rest.
    const scene = new THREE.Scene();
    const view = new FallingBodiesView(scene);
    const rolling = { ...makeDroppedPart(0, [0, 2.5, 0]), velocity: [50, 0, 0] as [number, number, number], rotation: 1.2, resting: true };
    view.sync([rolling]);
    const orientation = (scene.children[0] as THREE.Mesh).quaternion.clone();
    expect(orientation.equals(new THREE.Quaternion())).toBe(false);

    view.sync([{ ...rolling, velocity: [0, 0, 0] }]);
    expect((scene.children[0] as THREE.Mesh).quaternion.equals(orientation)).toBe(true);
  });
});
