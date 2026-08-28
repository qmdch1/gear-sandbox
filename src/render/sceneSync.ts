import * as THREE from "three";
import type { GearInstance, RemoteLink, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject } from "./gearMesh";
import { buildLinkRibbon } from "./chainGeometry";
import { findMeshPartner } from "../sim/meshing";

const PROBLEM_HIGHLIGHT = new THREE.Color(0xff3b30);
const PREVIEW_HIGHLIGHT = new THREE.Color(0x2ecc71);

/** Order-independent identity for a remote link, so a pair stored as {a:"x", b:"y"} and
 *  one stored as {a:"y", b:"x"} resolve to the same ribbon mesh rather than two
 *  overlapping ones. Matches how the rest of the sim treats a linked pair as unordered. */
function remoteLinkKey(link: RemoteLink): string {
  return `${[link.a, link.b].sort().join(":")}:${link.kind}`;
}

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
  private linkMeshes = new Map<string, THREE.Mesh>();
  private previewId: string | null = null;

  constructor(private ctx: SceneContext) {}

  sync(gears: GearInstance[], remoteLinks: RemoteLink[], diagnostics: SimDiagnostics): void {
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
      const facePinionPosition = gear.type === "rack" ? findMeshPartner(gear, gears)?.position : undefined;
      obj.update(gear, facePinionPosition);
      const material = obj.mesh.material as THREE.MeshStandardMaterial;
      if (this.previewId === gear.id) {
        material.emissive = PREVIEW_HIGHLIGHT.clone();
      } else {
        material.emissive = problemIds.has(gear.id) ? PROBLEM_HIGHLIGHT.clone() : new THREE.Color(0x000000);
      }
    }

    const byId = new Map(gears.map((g) => [g.id, g] as const));
    const currentLinkKeys = new Set(remoteLinks.map(remoteLinkKey));
    for (const [key, mesh] of this.linkMeshes) {
      if (!currentLinkKeys.has(key)) {
        this.ctx.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.linkMeshes.delete(key);
      }
    }
    for (const link of remoteLinks) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const key = remoteLinkKey(link);
      const width = link.kind === "chain" ? 0.15 : 0.25;
      const geometry = buildLinkRibbon(a.position, b.position, width);
      const existing = this.linkMeshes.get(key);
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geometry;
      } else {
        const material = new THREE.MeshStandardMaterial({ color: link.kind === "chain" ? 0x888888 : 0x333333 });
        const mesh = new THREE.Mesh(geometry, material);
        this.linkMeshes.set(key, mesh);
        this.ctx.scene.add(mesh);
      }
    }
  }

  focusOn(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.ctx.controls.target.copy(obj.mesh.position);
    this.ctx.controls.update();
  }

  /** Tints the given gear's mesh green as a "would connect here" preview while dragging,
   *  clearing any previous preview. Pass null to clear. Applied on the next sync(). */
  setPreviewHighlight(id: string | null): void {
    this.previewId = id;
  }
}
