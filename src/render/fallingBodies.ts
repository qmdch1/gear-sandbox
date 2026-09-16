import * as THREE from "three";
import type { FallingBody } from "../sim/gravity";
import { getProceduralTexture, type TextureKind } from "./textures";

/** The loose parts lying around and falling through the yard -- bearing balls, blanks, nuts --
 *  drawn from whatever `sim/gravity.ts` computed for them.
 *
 *  Strictly a view: it owns meshes and materials and nothing else. Every position, bounce and
 *  roll in here was solved by the simulation, exactly as a gear's rotation was; this class only
 *  copies the answer onto a mesh. Bodies are matched by id, so one can appear or be cleared away
 *  between frames without disturbing the others' meshes. */
export class FallingBodiesView {
  private meshes = new Map<string, THREE.Mesh>();

  constructor(private scene: THREE.Scene) {}

  /** Draws exactly the given bodies, creating and disposing meshes as the set changes. */
  sync(bodies: FallingBody[]): void {
    const live = new Set(bodies.map((b) => b.id));
    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this.scene.remove(mesh);
      // Geometry is this mesh's own (its radius differs per part) and must go. The MATERIAL is
      // not: `materialFor` hands out one shared instance per texture kind, so disposing it here
      // would blank every other part of that kind still in the scene -- and it would keep being
      // handed out afterwards, now pointing at freed GPU resources. Shared things are freed by
      // whoever owns the cache, not by a departing user of it.
      mesh.geometry.dispose();
      this.meshes.delete(id);
    }

    for (const body of bodies) {
      let mesh = this.meshes.get(body.id);
      if (!mesh) {
        mesh = buildBodyMesh(body);
        this.meshes.set(body.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(...body.position);
      // The body rolls about the axis perpendicular to its travel: horizontal, at right angles
      // to the direction it is going. With no travel there is nothing to roll about, so the
      // previous orientation is simply left alone rather than snapped back to zero.
      const [vx, , vz] = body.velocity;
      const speed = Math.hypot(vx, vz);
      if (speed > 1e-6) {
        mesh.setRotationFromAxisAngle(new THREE.Vector3(vz / speed, 0, -vx / speed), body.rotation);
      }
    }
  }

  /** Removes every mesh. Used when the scene is reset. */
  clear(): void {
    this.sync([]);
  }
}

/** Materials by texture, so a hundred dropped parts share seven materials rather than making a
 *  hundred of their own. Keyed by the texture they use, which is the only thing that varies. */
const materials = new Map<TextureKind, THREE.MeshStandardMaterial>();

function materialFor(kind: TextureKind): THREE.MeshStandardMaterial {
  const existing = materials.get(kind);
  if (existing) return existing;
  const texture = getProceduralTexture(kind);
  const material = new THREE.MeshStandardMaterial({
    color: kind === "rust" ? 0xa8643c : kind === "stone" ? 0x9aa0a6 : 0xb8c0c8,
    metalness: kind === "metal" ? 0.85 : 0.35,
    roughness: kind === "metal" ? 0.28 : 0.65,
    map: texture,
    bumpMap: texture,
    bumpScale: 0.35,
    roughnessMap: texture,
  });
  materials.set(kind, material);
  return material;
}

function buildBodyMesh(body: FallingBody): THREE.Mesh {
  // Two segments' worth of detail per unit of radius, within sane bounds: a 2-unit ball bearing
  // does not need the same tessellation as a 20-unit boulder, and dropping a hundred parts
  // should not cost a hundred high-poly spheres.
  const segments = Math.min(32, Math.max(10, Math.round(body.radius * 3)));
  const geometry = new THREE.SphereGeometry(body.radius, segments, Math.max(8, segments / 2));
  // The id carries the texture choice (see `dropPart`), so a part keeps the same look for its
  // whole life without the physics having to know anything about materials.
  const kind: TextureKind = body.id.includes("stone") ? "stone" : body.id.includes("rust") ? "rust" : "metal";
  const mesh = new THREE.Mesh(geometry, materialFor(kind));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
