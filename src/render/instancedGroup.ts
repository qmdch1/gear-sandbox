import * as THREE from "three";

/** Manages ONE THREE.InstancedMesh shared by many gear instances of the same
 *  (type, teeth, module) combination -- collapsing what would otherwise be N
 *  draw calls (one Mesh per gear) into a single draw call per distinct shape.
 *  Never disposes `geometry`/`material` itself -- both are shared BEYOND this
 *  one group (geometry via geometryCache.ts, material across every group of
 *  the same gauge/non-gauge kind), so their disposal is the CALLER's
 *  responsibility, exactly like GearMeshObject's own cached-geometry rule.
 *
 *  Grows its own instance buffers by doubling (like a dynamic array) whenever
 *  more instances are added than it currently has room for -- `THREE.
 *  InstancedMesh`'s buffers are a fixed size set at construction, so growing
 *  means building a fresh, bigger InstancedMesh and copying every existing
 *  instance's matrix/color across, then swapping it into the scene in place of
 *  the old one (this group owns that scene attach/detach, so callers never see
 *  the swap). Removes an instance by moving the LAST live instance into the
 *  freed slot ("swap and pop", O(1)) rather than shifting every following
 *  instance down by one. */
export class InstancedGroup {
  mesh: THREE.InstancedMesh;
  private capacity: number;
  private count = 0;
  private indexOf = new Map<string, number>();
  private idAt: Array<string | null> = [];

  constructor(
    private scene: THREE.Scene,
    private geometry: THREE.BufferGeometry,
    private material: THREE.Material,
    name: string,
    initialCapacity = 4,
  ) {
    this.capacity = Math.max(1, initialCapacity);
    this.mesh = this.buildMesh(this.capacity);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }

  private buildMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    return mesh;
  }

  get size(): number {
    return this.count;
  }

  has(gearId: string): boolean {
    return this.indexOf.has(gearId);
  }

  private ensureCapacity(minCapacity: number): void {
    if (minCapacity <= this.capacity) return;
    let newCapacity = this.capacity;
    while (newCapacity < minCapacity) newCapacity *= 2;

    const newMesh = this.buildMesh(newCapacity);
    newMesh.name = this.mesh.name;
    newMesh.count = this.count;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, matrix);
      newMesh.setMatrixAt(i, matrix);
      this.mesh.getColorAt(i, color);
      newMesh.setColorAt(i, color);
    }

    this.scene.remove(this.mesh);
    this.scene.add(newMesh);
    this.mesh = newMesh;
    this.capacity = newCapacity;
  }

  /** Adds a new instance, or updates the existing one if `gearId` is already
   *  present (so callers don't need to check `has()` themselves first). */
  add(gearId: string, matrix: THREE.Matrix4, color: THREE.Color): void {
    if (this.indexOf.has(gearId)) {
      this.setTransform(gearId, matrix);
      this.setColor(gearId, color);
      return;
    }
    this.ensureCapacity(this.count + 1);
    const index = this.count;
    this.mesh.setMatrixAt(index, matrix);
    this.mesh.setColorAt(index, color);
    this.idAt[index] = gearId;
    this.indexOf.set(gearId, index);
    this.count++;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setTransform(gearId: string, matrix: THREE.Matrix4): void {
    const index = this.indexOf.get(gearId);
    if (index === undefined) return;
    this.mesh.setMatrixAt(index, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setColor(gearId: string, color: THREE.Color): void {
    const index = this.indexOf.get(gearId);
    if (index === undefined) return;
    this.mesh.setColorAt(index, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Removes `gearId`'s instance by moving the LAST live instance into its
   *  slot (O(1)) instead of shifting every following instance down by one. */
  remove(gearId: string): void {
    const index = this.indexOf.get(gearId);
    if (index === undefined) return;
    const lastIndex = this.count - 1;
    if (index !== lastIndex) {
      const matrix = new THREE.Matrix4();
      this.mesh.getMatrixAt(lastIndex, matrix);
      this.mesh.setMatrixAt(index, matrix);
      const color = new THREE.Color();
      this.mesh.getColorAt(lastIndex, color);
      this.mesh.setColorAt(index, color);
      const movedId = this.idAt[lastIndex];
      this.idAt[index] = movedId;
      if (movedId) this.indexOf.set(movedId, index);
    }
    this.idAt[lastIndex] = null;
    this.indexOf.delete(gearId);
    this.count--;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** The gear id currently occupying `instanceId`, or null if out of range --
   *  used to resolve a raycaster hit's `instanceId` back to a specific gear. */
  gearIdAt(instanceId: number): string | null {
    return this.idAt[instanceId] ?? null;
  }

  /** Detaches this group's mesh from the scene -- called once it's empty (every
   *  gear it held has been removed) so an unused type/teeth/module combination
   *  doesn't keep sitting in the scene graph forever. Never disposes
   *  `geometry`/`material` (shared beyond this group). */
  dispose(): void {
    this.scene.remove(this.mesh);
  }
}
