import * as THREE from "three";
import type { GearInstance, RemoteLink, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject } from "./gearMesh";
import { buildLinkRibbon } from "./chainGeometry";
import { findMeshPartner, pitchRadius } from "../sim/meshing";
import { buildPropMesh, type Prop } from "./props";

const PROBLEM_HIGHLIGHT = new THREE.Color(0xff3b30);
const PREVIEW_HIGHLIGHT = new THREE.Color(0x2ecc71);

/** Pose (position + orientation) a prop should take when spun with its gear: rotate it
 *  about the gear's `axis`, around the gear's `center`, by `angle` radians, starting from
 *  the prop's rest pose (`basePos`/`baseQuat` -- where it sits at gear rotation 0). Pure
 *  and side-effect free (writes into the caller's `outPos`/`outQuat`) so it's unit-testable
 *  without a renderer. This is the math behind Prop.attachTo (windmill sails / propeller
 *  blades turning with their hub gear). */
export function spinAttachedPose(
  basePos: THREE.Vector3,
  baseQuat: THREE.Quaternion,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  angle: number,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion,
): void {
  const spin = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
  outPos.copy(basePos).sub(center).applyQuaternion(spin).add(center);
  outQuat.copy(spin).multiply(baseQuat);
}

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
  private propMeshes: THREE.Mesh[] = [];
  // Props that spin with a gear (see Prop.attachTo). Each keeps the id of the gear it
  // follows plus its rest pose (position/orientation at gear rotation 0), so `sync()` can
  // re-derive its transform every frame from the gear's current rotation.
  private attachedProps: Array<{
    mesh: THREE.Mesh;
    gearId: string;
    basePos: THREE.Vector3;
    baseQuat: THREE.Quaternion;
  }> = [];
  private previewId: string | null = null;

  constructor(private ctx: SceneContext) {}

  /** Replaces the current set of decorative (non-simulated) props -- a preset's physical
   *  body (car chassis, clock bezel, etc.) -- with a new one. Props are static: they are
   *  added to the scene once here and never touched by the per-frame `sync()` loop, since
   *  they don't move, mesh, or rotate. Passing `[]` (the default) clears all props, which
   *  is what every non-preset layout load does -- a plain saved/imported layout has no
   *  body, just gears. */
  setProps(props: Prop[] = []): void {
    for (const mesh of this.propMeshes) {
      this.ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.propMeshes = [];
    this.attachedProps = [];
    for (const prop of props) {
      const mesh = buildPropMesh(prop);
      this.propMeshes.push(mesh);
      this.ctx.scene.add(mesh);
      if (prop.attachTo) {
        // Record the prop's rest pose (as built, at gear rotation 0) so `sync()` can spin
        // it around its gear each frame from that baseline.
        this.attachedProps.push({
          mesh,
          gearId: prop.attachTo,
          basePos: mesh.position.clone(),
          baseQuat: mesh.quaternion.clone(),
        });
      }
    }
  }

  /** Spins each attached prop (see Prop.attachTo) to follow its gear's current rotation:
   *  rotate the prop about the gear's axis, around the gear's centre, by the gear's
   *  accumulated `rotation`, from the prop's rest pose. This is what makes windmill sails
   *  and propeller blades -- which are props, not gears -- actually turn with the hub gear
   *  driving them. Called every frame from `sync()`. */
  private updateAttachedProps(byId: Map<string, GearInstance>): void {
    if (this.attachedProps.length === 0) return;
    const axis = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (const p of this.attachedProps) {
      const gear = byId.get(p.gearId);
      if (!gear) continue;
      axis.set(gear.axis[0], gear.axis[1], gear.axis[2]);
      center.set(gear.position[0], gear.position[1], gear.position[2]);
      spinAttachedPose(p.basePos, p.baseQuat, center, axis, gear.rotation, p.mesh.position, p.mesh.quaternion);
    }
  }

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
      let obj = this.objects.get(gear.id)!;
      if (obj.needsRebuild(gear)) {
        // Same-id gear, but its type/teeth/module no longer match the geometry this
        // GearMeshObject was built with (e.g. a re-imported layout that reused an id with
        // a hand-edited type/tooth count) -- `update()` alone would leave the mesh showing
        // its stale original shape forever, since it never touches `mesh.geometry`. Dispose
        // and rebuild exactly like the toAdd/toRemove pair above does for a genuinely new id.
        this.ctx.scene.remove(obj.mesh);
        obj.dispose();
        obj = new GearMeshObject(gear);
        this.objects.set(gear.id, obj);
        this.ctx.scene.add(obj.mesh);
      }
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
    this.updateAttachedProps(byId); // spin windmill sails, propeller blades, etc. with their gears
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
      const geometry = buildLinkRibbon(a.position, b.position, width, link.kind);
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

  /** "전체 보기" (fit all): re-centers `OrbitControls.target` on the centroid of every placed
   *  gear and backs the camera off along its current viewing direction until the whole layout's
   *  bounding box is reasonably in frame, clamped to the controls' own minDistance/maxDistance
   *  (see scene.ts) so this never fights the configured zoom range.
   *
   *  Unlike `focusOn` -- which only re-aims at a fixed camera position, since a single gear
   *  never needs reframing -- an empty-vs-sprawling layout does need the camera to actually
   *  move, so this goes one step further than focusOn's technique: it repositions the camera,
   *  not just the target.
   *
   *  No-op on an empty layout: there is nothing to bound, and snapping the camera to some
   *  arbitrary default would be more surprising than just leaving the current view alone
   *  (e.g. mid-pan while the last gear was just deleted).
   *
   *  Bounds each gear by its actual visual footprint, not just its bare position point --
   *  expanding the box by position alone badly undersizes the frame for a layout with only
   *  a couple of large, closely-spaced gears (confirmed by screenshot: the 성문/castle
   *  preset's two gears sit only 7 units apart, but the winch handle's own pitch radius is
   *  also 7, so a position-only box computed a tiny radius and the resulting camera ended
   *  up INSIDE the gear's own geometry). `module * 2` covers `load`'s teeth-0 case, where
   *  `pitchRadius` alone is always exactly 0 (same reasoning `meshing.ts`'s own
   *  `overlapRadius` helper uses for the same field), and a small floor keeps a
   *  pathologically tiny gear from collapsing its own contribution to the box. */
  fitAll(gears: GearInstance[]): void {
    if (gears.length === 0) return;

    const box = new THREE.Box3();
    const centroid = new THREE.Vector3();
    for (const gear of gears) {
      const p = new THREE.Vector3(...gear.position);
      const r = Math.max(pitchRadius(gear), gear.module * 2, 0.5);
      box.expandByPoint(p.clone().addScalar(r));
      box.expandByPoint(p.clone().addScalar(-r));
      centroid.add(p);
    }
    centroid.divideScalar(gears.length);

    // Also frame any decorative props (a car's chassis, a castle's towers, ...). A preset's
    // body can extend far beyond its gears -- the castle gears span only ~7 units but its
    // towers rise 30+ -- so framing gears alone would leave the body cropped or shove the
    // camera inside it. Expand the box (not the centroid: the camera should still aim at the
    // mechanism, just back off far enough to show the whole body around it) by each prop
    // mesh's world-space bounding box.
    for (const mesh of this.propMeshes) {
      mesh.updateMatrixWorld(true);
      const propBox = new THREE.Box3().setFromObject(mesh);
      box.union(propBox);
    }

    // Half-diagonal of the bounding box, used as a stand-in bounding-sphere radius -- simple,
    // and plenty good enough for "does the whole layout fit in frame", not a tight fit.
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const fovRad = THREE.MathUtils.degToRad(this.ctx.camera.fov);
    const rawDistance = radius / Math.sin(fovRad / 2);
    const distance = THREE.MathUtils.clamp(rawDistance, this.ctx.controls.minDistance, this.ctx.controls.maxDistance);

    // Keep the current viewing angle -- just move along it -- rather than picking a new one,
    // so "전체 보기" doesn't also spin the view around unexpectedly. Guard the degenerate case
    // where the camera sits exactly on the old target (offset would normalize to NaN).
    const offset = this.ctx.camera.position.clone().sub(this.ctx.controls.target);
    if (offset.lengthSq() < 1e-6) offset.set(1, 1, 1);
    offset.normalize().multiplyScalar(distance);

    this.ctx.controls.target.copy(centroid);
    this.ctx.camera.position.copy(centroid).add(offset);
    this.ctx.controls.update();
  }

  /** Tints the given gear's mesh green as a "would connect here" preview while dragging,
   *  clearing any previous preview. Pass null to clear. Applied on the next sync(). */
  setPreviewHighlight(id: string | null): void {
    this.previewId = id;
  }
}
