// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getProceduralTexture, clearTextureCache } from "../../src/render/textures";
import { buildPropMesh } from "../../src/render/props";
import * as THREE from "three";

const KINDS = ["wood", "stone", "brick", "metal", "fabric", "tile", "rust"] as const;

describe("procedural textures", () => {
  it("degrades to null (never throws) wherever no canvas backend exists, and caches that answer", () => {
    clearTextureCache();
    for (const kind of KINDS) {
      const t = getProceduralTexture(kind);
      // jsdom has no 2d canvas backend, so this is null here; on a real browser it is a
      // texture. Either way it must not throw, and repeat calls must agree.
      expect(t === null || t instanceof THREE.CanvasTexture).toBe(true);
      expect(getProceduralTexture(kind)).toBe(t); // cached, not redrawn
    }
  });

  it("still builds a valid, correctly coloured mesh for a textured prop when the texture is unavailable", () => {
    const mesh = buildPropMesh({
      kind: "box",
      position: [1, 2, 3],
      size: [2, 2, 2],
      color: 0x8a6a3a,
      texture: "wood",
    });
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x8a6a3a);
  });

  it("builds the newly added sphere and cone prop kinds, and marks every prop as shadow-casting", () => {
    const sphere = buildPropMesh({ kind: "sphere", position: [0, 0, 0], radius: 3, color: 0xffffff });
    const cone = buildPropMesh({ kind: "cone", position: [0, 0, 0], radius: 2, height: 5, color: 0xffffff });
    expect(sphere.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(cone.geometry).toBeInstanceOf(THREE.ConeGeometry);
    for (const m of [sphere, cone]) {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(true);
    }
  });
});
