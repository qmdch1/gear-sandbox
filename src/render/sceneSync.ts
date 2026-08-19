import * as THREE from "three";
import type { GearInstance, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject } from "./gearMesh";

const PROBLEM_HIGHLIGHT = new THREE.Color(0xff3b30);

/** Pure diff: which gears need a new mesh, which stale meshes need removing. */
export function computeSyncActions(
  existingIds: Set<string>,
  gears: GearInstance[],
): { toAdd: GearInstance[]; toRemoveIds: string[] } {
  const currentIds = new Set(gears.map((g) => g.id));
  const toAdd = gears.filter((g) => !existingIds.has(g.id));
  const toRemoveIds = [...existingIds].filter((id) => !currentIds.has(id));
  return { toAdd, toRemoveIds };
}

export class SceneSync {
  private objects = new Map<string, GearMeshObject>();

  constructor(private ctx: SceneContext) {}

  sync(gears: GearInstance[], diagnostics: SimDiagnostics): void {
    const { toAdd, toRemoveIds } = computeSyncActions(new Set(this.objects.keys()), gears);

    for (const id of toRemoveIds) {
      const obj = this.objects.get(id);
      if (obj) {
        this.ctx.scene.remove(obj.mesh);
        obj.dispose();
        this.objects.delete(id);
      }
    }

    for (const gear of toAdd) {
      const obj = new GearMeshObject(gear);
      this.objects.set(gear.id, obj);
      this.ctx.scene.add(obj.mesh);
    }

    const problemIds = new Set([
      ...diagnostics.unconnectedIds,
      ...diagnostics.noPowerIds,
      ...diagnostics.overlapPairs.flat(),
    ]);

    for (const gear of gears) {
      const obj = this.objects.get(gear.id)!;
      obj.update(gear);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      material.emissive = problemIds.has(gear.id) ? PROBLEM_HIGHLIGHT.clone() : new THREE.Color(0x000000);
    }
  }

  focusOn(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.ctx.controls.target.copy(obj.mesh.position);
    this.ctx.controls.update();
  }
}
