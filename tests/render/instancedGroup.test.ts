// @vitest-environment jsdom
import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { InstancedGroup } from "../../src/render/instancedGroup";

function makeGroup(initialCapacity?: number): { scene: THREE.Scene; group: InstancedGroup } {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const group = new InstancedGroup(scene, geometry, material, "test-group", initialCapacity);
  return { scene, group };
}

describe("InstancedGroup", () => {
  it("adds itself to the scene on construction, with zero instances rendered initially", () => {
    const { scene, group } = makeGroup();
    expect(scene.children).toContain(group.mesh);
    expect(group.mesh.count).toBe(0);
    expect(group.size).toBe(0);
  });

  it("adds an instance and makes it findable by id and by slot", () => {
    const { group } = makeGroup();
    const matrix = new THREE.Matrix4().makeTranslation(3, 0, 5);
    group.add("a", matrix, new THREE.Color(0xff0000));
    expect(group.size).toBe(1);
    expect(group.has("a")).toBe(true);
    expect(group.gearIdAt(0)).toBe("a");
    const readBack = new THREE.Matrix4();
    group.mesh.getMatrixAt(0, readBack);
    expect(readBack.elements).toEqual(matrix.elements);
  });

  it("updates (rather than duplicates) an instance when add() is called again with the same id", () => {
    const { group } = makeGroup();
    group.add("a", new THREE.Matrix4().makeTranslation(0, 0, 0), new THREE.Color(0xffffff));
    group.add("a", new THREE.Matrix4().makeTranslation(9, 0, 0), new THREE.Color(0x000000));
    expect(group.size).toBe(1);
    const readBack = new THREE.Matrix4();
    group.mesh.getMatrixAt(0, readBack);
    expect(readBack.elements[12]).toBeCloseTo(9); // translation.x
  });

  it("removes an instance by swapping the LAST instance into the freed slot", () => {
    const { group } = makeGroup();
    group.add("a", new THREE.Matrix4().makeTranslation(1, 0, 0), new THREE.Color(0x111111));
    group.add("b", new THREE.Matrix4().makeTranslation(2, 0, 0), new THREE.Color(0x222222));
    group.add("c", new THREE.Matrix4().makeTranslation(3, 0, 0), new THREE.Color(0x333333));
    group.remove("a"); // "a" was index 0; "c" (the last instance) should now occupy it
    expect(group.size).toBe(2);
    expect(group.has("a")).toBe(false);
    expect(group.gearIdAt(0)).toBe("c");
    expect(group.gearIdAt(1)).toBe("b");
    const readBack = new THREE.Matrix4();
    group.mesh.getMatrixAt(0, readBack);
    expect(readBack.elements[12]).toBeCloseTo(3); // "c"'s translation.x, moved into slot 0
  });

  it("removing the LAST instance directly needs no swap and just shrinks", () => {
    const { group } = makeGroup();
    group.add("a", new THREE.Matrix4(), new THREE.Color(0x111111));
    group.add("b", new THREE.Matrix4(), new THREE.Color(0x222222));
    group.remove("b");
    expect(group.size).toBe(1);
    expect(group.gearIdAt(0)).toBe("a");
  });

  it("grows its capacity (rebuilding the InstancedMesh) once more instances are added than it started with", () => {
    const { scene, group } = makeGroup(2);
    const originalMesh = group.mesh;
    group.add("a", new THREE.Matrix4().makeTranslation(1, 0, 0), new THREE.Color(0xff0000));
    group.add("b", new THREE.Matrix4().makeTranslation(2, 0, 0), new THREE.Color(0x00ff00));
    group.add("c", new THREE.Matrix4().makeTranslation(3, 0, 0), new THREE.Color(0x0000ff)); // exceeds capacity 2
    expect(group.mesh).not.toBe(originalMesh); // rebuilt into a bigger mesh
    expect(scene.children).toContain(group.mesh);
    expect(scene.children).not.toContain(originalMesh); // old mesh swapped out, not left behind
    expect(group.size).toBe(3);

    // Every instance's data must have survived the rebuild, not just the newest one.
    for (const [id, x] of [["a", 1], ["b", 2], ["c", 3]] as const) {
      const index = [0, 1, 2].find((i) => group.gearIdAt(i) === id)!;
      const matrix = new THREE.Matrix4();
      group.mesh.getMatrixAt(index, matrix);
      expect(matrix.elements[12]).toBeCloseTo(x);
    }
  });

  it("carries instance COLORS across a capacity-growth rebuild too, not just matrices", () => {
    const { group } = makeGroup(1);
    group.add("a", new THREE.Matrix4(), new THREE.Color(0x123456));
    group.add("b", new THREE.Matrix4(), new THREE.Color(0xabcdef)); // triggers growth
    const readBack = new THREE.Color();
    const indexOfA = [0, 1].find((i) => group.gearIdAt(i) === "a")!;
    group.mesh.getColorAt(indexOfA, readBack);
    expect(readBack.getHexString()).toBe(new THREE.Color(0x123456).getHexString());
  });

  it("updates an existing instance's transform and color independently", () => {
    const { group } = makeGroup();
    group.add("a", new THREE.Matrix4(), new THREE.Color(0x000000));
    group.setTransform("a", new THREE.Matrix4().makeTranslation(5, 0, 0));
    group.setColor("a", new THREE.Color(0xffffff));
    const matrix = new THREE.Matrix4();
    group.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBeCloseTo(5);
    const color = new THREE.Color();
    group.mesh.getColorAt(0, color);
    expect(color.getHexString()).toBe("ffffff");
  });

  it("returns null for an out-of-range instance id", () => {
    const { group } = makeGroup();
    group.add("a", new THREE.Matrix4(), new THREE.Color(0x000000));
    expect(group.gearIdAt(5)).toBeNull();
  });

  it("detaches its mesh from the scene on dispose(), without touching the shared geometry/material", () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const group = new InstancedGroup(scene, geometry, material, "test-group");
    const geometryDisposeSpy = vi.fn();
    geometry.dispose = geometryDisposeSpy;
    group.dispose();
    expect(scene.children).not.toContain(group.mesh);
    expect(geometryDisposeSpy).not.toHaveBeenCalled();
  });
});
