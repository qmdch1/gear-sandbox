import * as THREE from "three";
import type { GearInstance, GearType, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject, colorForDurabilityRatio, sharedMetalTexture, sharedGaugeDialTexture } from "./gearMesh";
import { TYPE_HEALTHY_COLORS } from "./metalTexture";
import { cachedGeometryFor } from "./geometryCache";
import { InstancedGroup } from "./instancedGroup";
import { computeInstanceMatrix } from "./instanceTransform";

const PROBLEM_HIGHLIGHT = new THREE.Color(0xff3b30);
const PREVIEW_HIGHLIGHT = new THREE.Color(0x2ecc71);
// Instanced gears can't use `material.emissive` per-instance (a shared material has
// exactly one emissive value for every instance that uses it) -- see `isInstanced`'s
// doc comment. Blending the highlight INTO the instance color instead is a different
// rendering technique (a color shift, not an additive glow) from what a belt (still
// its own individual mesh, still using emissive unchanged) shows, but it's just as
// clearly, visibly a warning either way.
const HIGHLIGHT_BLEND = 0.5;

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

/** "belt" keeps its own bespoke, frequently-rebuilt geometry (see gearGeometry.ts's
 *  beltTangentGeometry) -- instancing requires many gears to share ONE static
 *  geometry, which a connected belt's shape structurally can't (it depends on its
 *  own two hosts' live positions/radii, and changes whenever either does). Every
 *  other type's geometry, by contrast, is a pure, cached function of just
 *  (type, teeth, module) -- see geometryCache.ts -- so those benefit from collapsing
 *  what would otherwise be one draw call per gear into one draw call per distinct
 *  shape actually in use. */
function isInstanced(type: GearType): boolean {
  return type !== "belt";
}

function buildSharedMaterial(isGauge: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: isGauge ? sharedGaugeDialTexture : sharedMetalTexture,
    vertexColors: true,
    roughness: isGauge ? 0.85 : 0.55,
    metalness: isGauge ? 0.1 : 0.6,
  });
}

export class SceneSync {
  private objects = new Map<string, GearMeshObject>(); // belts only -- see isInstanced
  private groups = new Map<string, InstancedGroup>(); // key: `${type}:${teeth}:${module}`, matching geometryCache.ts's own key
  private gearGroupKey = new Map<string, string>(); // gear id -> its group's key, for non-belt gears
  // Every gear's latest state, belt and non-belt alike -- an InstancedMesh has no
  // per-instance THREE.Object3D of its own to read a position back off of, so
  // focusOn() (and computeSyncActions' "who currently exists" diff) reads from
  // here directly instead.
  private latestGears = new Map<string, GearInstance>();
  private nonGaugeMaterial = buildSharedMaterial(false);
  private gaugeMaterial = buildSharedMaterial(true);
  private previewId: string | null = null;

  constructor(private ctx: SceneContext) {}

  private groupKeyFor(gear: GearInstance): string {
    return `${gear.type}:${gear.teeth || 1}:${gear.module || 1}`;
  }

  private groupFor(gear: GearInstance): InstancedGroup {
    const key = this.groupKeyFor(gear);
    let group = this.groups.get(key);
    if (!group) {
      const geometry = cachedGeometryFor(gear.type, gear.teeth || 1, gear.module || 1);
      const material = gear.type === "gauge" ? this.gaugeMaterial : this.nonGaugeMaterial;
      group = new InstancedGroup(this.ctx.scene, geometry, material, `instanced:${key}`);
      this.groups.set(key, group);
    }
    return group;
  }

  sync(gears: GearInstance[], diagnostics: SimDiagnostics): void {
    const { toAdd, toRemoveIds } = computeSyncActions(new Set(this.latestGears.keys()), gears);

    for (const id of toRemoveIds) {
      const obj = this.objects.get(id);
      if (obj) {
        this.ctx.scene.remove(obj.mesh);
        obj.dispose();
        this.objects.delete(id);
      } else {
        const groupKey = this.gearGroupKey.get(id);
        const group = groupKey ? this.groups.get(groupKey) : undefined;
        if (group) {
          group.remove(id);
          if (group.size === 0) {
            group.dispose();
            this.groups.delete(groupKey!);
          }
        }
        this.gearGroupKey.delete(id);
      }
      this.latestGears.delete(id);
    }

    for (const gear of toAdd) {
      if (isInstanced(gear.type)) {
        const group = this.groupFor(gear);
        group.add(gear.id, computeInstanceMatrix(gear), colorForDurabilityRatio(1, TYPE_HEALTHY_COLORS[gear.type]));
        this.gearGroupKey.set(gear.id, this.groupKeyFor(gear));
      } else {
        const obj = new GearMeshObject(gear);
        this.objects.set(gear.id, obj);
        this.ctx.scene.add(obj.mesh);
      }
    }

    const problemIds = new Set([
      ...diagnostics.unconnectedIds,
      ...diagnostics.noPowerIds,
      ...diagnostics.overlapPairs.flat(),
    ]);

    for (const gear of gears) {
      this.latestGears.set(gear.id, gear);
      if (isInstanced(gear.type)) {
        const group = this.groups.get(this.gearGroupKey.get(gear.id)!)!;
        group.setTransform(gear.id, computeInstanceMatrix(gear));
        const ratio = gear.durabilityMax > 0 ? gear.durabilityCurrent / gear.durabilityMax : 1;
        const baseColor = colorForDurabilityRatio(gear.broken ? 0 : ratio, TYPE_HEALTHY_COLORS[gear.type]);
        const highlighted =
          this.previewId === gear.id
            ? baseColor.clone().lerp(PREVIEW_HIGHLIGHT, HIGHLIGHT_BLEND)
            : problemIds.has(gear.id)
              ? baseColor.clone().lerp(PROBLEM_HIGHLIGHT, HIGHLIGHT_BLEND)
              : baseColor;
        group.setColor(gear.id, highlighted);
      } else {
        const obj = this.objects.get(gear.id)!;
        obj.update(gear);
        const material = obj.mesh.material as THREE.MeshStandardMaterial;
        if (this.previewId === gear.id) {
          material.emissive = PREVIEW_HIGHLIGHT.clone();
        } else {
          material.emissive = problemIds.has(gear.id) ? PROBLEM_HIGHLIGHT.clone() : new THREE.Color(0x000000);
        }
      }
    }
  }

  focusOn(id: string): void {
    const gear = this.latestGears.get(id);
    if (!gear) return;
    // A rod (shaft/beam/belt) rendered at its MIDPOINT, not `gear.position` itself
    // (see instanceTransform.ts / gearMesh.ts) -- match that exactly, so focusing
    // on one centers the camera on where it's actually drawn, same as before
    // instancing (when this read straight off the mesh's own `.position`).
    const target: [number, number, number] = gear.position2
      ? [
          (gear.position[0] + gear.position2[0]) / 2,
          (gear.position[1] + gear.position2[1]) / 2,
          (gear.position[2] + gear.position2[2]) / 2,
        ]
      : gear.position;
    this.ctx.controls.target.set(...target);
    this.ctx.controls.update();
  }

  /** Tints the given gear's mesh green as a "would connect here" preview while dragging,
   *  clearing any previous preview. Pass null to clear. Applied on the next sync(). */
  setPreviewHighlight(id: string | null): void {
    this.previewId = id;
  }

  /** Resolves a raycaster hit back to the gear id it represents. A single
   *  InstancedMesh's own `.name` can't hold one specific gear's id (it stands in
   *  for MANY gears at once) -- when the hit carries an `instanceId` (i.e. it
   *  landed on an InstancedMesh), this looks up which gear currently occupies
   *  that slot in whichever group owns the hit object. Falls back to the
   *  object's own `.name` for a plain, non-instanced hit (a belt), exactly as
   *  dragControls.ts's raycasting relied on before instancing existed. */
  resolveHitId(object: THREE.Object3D, instanceId: number | undefined): string | null {
    if (instanceId !== undefined) {
      for (const group of this.groups.values()) {
        if (group.mesh === object) return group.gearIdAt(instanceId);
      }
      return null;
    }
    return object.name || null;
  }
}
