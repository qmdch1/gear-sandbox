import * as THREE from "three";
import type { GearInstance, RemoteLink, SimDiagnostics } from "../sim/types";
import type { SceneContext } from "./scene";
import { GearMeshObject } from "./gearMesh";
import { buildLinkRibbon } from "./chainGeometry";
import { getProceduralTexture } from "./textures";
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

/** An orthonormal pair spanning the plane perpendicular to `axis`, chosen deterministically
 *  (seeded from whichever world axis `axis` is least aligned with) so a crank pin starts at a
 *  stable, reproducible clock position rather than one that flips between runs. */
function planeBasis(axis: THREE.Vector3, outU: THREE.Vector3, outV: THREE.Vector3): void {
  const a = axis.clone().normalize();
  const seed =
    Math.abs(a.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  outU.copy(seed).addScaledVector(a, -seed.dot(a)).normalize();
  outV.crossVectors(a, outU).normalize();
}

/** Solves a planar CRANK-SLIDER linkage and reports where each member sits.
 *
 *  A pin fixed `crankRadius` from the crank's centre sweeps round as the crank turns; a rigid
 *  rod of `rodLength` joins that pin to a slider that can only move along the line through the
 *  centre in direction `slideAxis`. Writing the slider as `centre + s * a` and requiring the
 *  rod to stay exactly `rodLength` long gives
 *
 *      |w - s*a| = L,  where w = pin - centre
 *   => s^2 - 2 s (w.a) + |w|^2 - L^2 = 0
 *   => s = (w.a) + sqrt((w.a)^2 - |w|^2 + L^2)
 *
 *  taking the outer root, which is the branch a real piston stays on (the slider never passes
 *  through the crank centre). The discriminant is non-negative for any pin position whenever
 *  `rodLength > crankRadius`; it is clamped at 0 anyway so a mis-specified linkage degenerates
 *  gracefully instead of producing NaN transforms that would blank the whole scene.
 *
 *  Pure and renderer-free so the geometry is unit-testable: it writes the pin position, the
 *  slider position, and the rod's midpoint and orientation (mapping the rod's local +Y onto
 *  the pin->slider direction, which is how the rod props are authored). */
export function crankSliderPose(
  centre: THREE.Vector3,
  axis: THREE.Vector3,
  angle: number,
  crankRadius: number,
  rodLength: number,
  slideAxis: THREE.Vector3,
  out: { pin: THREE.Vector3; slider: THREE.Vector3; rodMid: THREE.Vector3; rodQuat: THREE.Quaternion },
): void {
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  planeBasis(axis, u, v);

  out.pin
    .copy(centre)
    .addScaledVector(u, Math.cos(angle) * crankRadius)
    .addScaledVector(v, Math.sin(angle) * crankRadius);

  const a = slideAxis.clone().normalize();
  const w = out.pin.clone().sub(centre);
  const wa = w.dot(a);
  const disc = Math.max(0, wa * wa - w.lengthSq() + rodLength * rodLength);
  const sOffset = wa + Math.sqrt(disc);
  out.slider.copy(centre).addScaledVector(a, sOffset);

  out.rodMid.copy(out.pin).add(out.slider).multiplyScalar(0.5);
  const along = out.slider.clone().sub(out.pin);
  if (along.lengthSq() > 1e-12) {
    out.rodQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
  } else {
    out.rodQuat.identity();
  }
}

/** How many rib repeats a belt's surface texture gets along its whole run. Fixed rather than
 *  proportional to length so every belt in a scene shows ribs at a consistent visual density. */
const BELT_RIB_REPEAT = 24;

/** Straight-line distance between two world positions. */
function distanceBetween(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
  // Props that slide with a rack's linear travel (see Prop.slideWith). Each keeps the id of
  // the rack it follows plus its rest position (at rack linearPosition 0).
  private slidingProps: Array<{
    mesh: THREE.Mesh;
    gearId: string;
    basePos: THREE.Vector3;
  }> = [];
  // Props hoisted by a rope spooling onto a rotating drum (see Prop.windWith).
  private windingProps: Array<{
    mesh: THREE.Mesh;
    gearId: string;
    basePos: THREE.Vector3;
    dir: THREE.Vector3;
    radius: number;
    travel: [number, number];
    /** True when this prop ALSO declares `attachTo`, so the winding offset must be added on top
     *  of the spun pose rather than replacing it -- see `updateWindingProps`. */
    alsoAttached: boolean;
  }> = [];
  // Props that are members of a crank-slider linkage (see Prop.linkTo).
  private linkedProps: Array<{
    mesh: THREE.Mesh;
    gearId: string;
    baseQuat: THREE.Quaternion;
    crankRadius: number;
    rodLength: number;
    slideAxis: THREE.Vector3;
    role: "rod" | "slider" | "pin";
  }> = [];
  private previewId: string | null = null;

  constructor(private ctx: SceneContext) {}

  /** Replaces the current set of decorative (non-simulated) props -- a preset's physical
   *  body (car chassis, clock bezel, etc.) -- with a new one. Props never mesh or take part
   *  in the simulation, but they are not all static: one that declares `attachTo`,
   *  `slideWith` or `windWith` is recorded here and then re-posed every frame by `sync()`
   *  from the gear it follows (spinning sails and wheel spokes, a sliding gate, a hoisted
   *  hook). Passing `[]` (the default) clears all props, which is what every non-preset
   *  layout load does -- a plain saved/imported layout has no body, just gears. */
  setProps(props: Prop[] = []): void {
    for (const mesh of this.propMeshes) {
      this.ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.propMeshes = [];
    this.attachedProps = [];
    this.slidingProps = [];
    this.windingProps = [];
    this.linkedProps = [];
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
      if (prop.slideWith) {
        this.slidingProps.push({ mesh, gearId: prop.slideWith, basePos: mesh.position.clone() });
      }
      if (prop.linkTo) {
        this.linkedProps.push({
          mesh,
          gearId: prop.linkTo.gear,
          baseQuat: mesh.quaternion.clone(),
          crankRadius: prop.linkTo.crankRadius,
          rodLength: prop.linkTo.rodLength,
          slideAxis: new THREE.Vector3(...prop.linkTo.slideAxis),
          role: prop.linkTo.role,
        });
      }
      if (prop.windWith) {
        this.windingProps.push({
          mesh,
          gearId: prop.windWith.gear,
          basePos: mesh.position.clone(),
          dir: new THREE.Vector3(...prop.windWith.direction).normalize(),
          radius: prop.windWith.radius,
          travel: prop.windWith.travel,
          alsoAttached: prop.attachTo !== undefined,
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

  /** Slides each sliding prop (see Prop.slideWith) along its rack's axis by the rack's
   *  current `linearPosition`, from the prop's rest position -- so e.g. a castle gate panel
   *  rises and falls with the rack the winch drives. Called every frame from `sync()`. */
  private updateSlidingProps(byId: Map<string, GearInstance>): void {
    if (this.slidingProps.length === 0) return;
    const axis = new THREE.Vector3();
    for (const p of this.slidingProps) {
      const gear = byId.get(p.gearId);
      if (!gear) continue;
      axis.set(gear.axis[0], gear.axis[1], gear.axis[2]).normalize();
      p.mesh.position.copy(p.basePos).addScaledVector(axis, gear.linearPosition ?? 0);
    }
  }

  /** Re-poses every crank-slider linkage member (see Prop.linkTo) from its crank's current
   *  rotation: the pin rides the crank throw, the slider reciprocates along its axis, and the
   *  rod swings to span the two. Called every frame from `sync()`. */
  private updateLinkedProps(byId: Map<string, GearInstance>): void {
    if (this.linkedProps.length === 0) return;
    const centre = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const out = {
      pin: new THREE.Vector3(),
      slider: new THREE.Vector3(),
      rodMid: new THREE.Vector3(),
      rodQuat: new THREE.Quaternion(),
    };
    for (const p of this.linkedProps) {
      const gear = byId.get(p.gearId);
      if (!gear) continue;
      centre.set(gear.position[0], gear.position[1], gear.position[2]);
      axis.set(gear.axis[0], gear.axis[1], gear.axis[2]);
      crankSliderPose(centre, axis, gear.rotation, p.crankRadius, p.rodLength, p.slideAxis, out);
      if (p.role === "rod") {
        p.mesh.position.copy(out.rodMid);
        p.mesh.quaternion.copy(out.rodQuat);
      } else if (p.role === "slider") {
        p.mesh.position.copy(out.slider);
        p.mesh.quaternion.copy(p.baseQuat);
      } else {
        p.mesh.position.copy(out.pin);
        p.mesh.quaternion.copy(p.baseQuat);
      }
    }
  }

  /** Hoists each winding prop (see Prop.windWith) along its direction by the drum's
   *  `rotation * radius` -- rope-on-drum kinematics -- clamped to the prop's travel range so
   *  the hook parks at its stop instead of climbing out of the scene. Called every frame
   *  from `sync()`. */
  private updateWindingProps(byId: Map<string, GearInstance>): void {
    if (this.windingProps.length === 0) return;
    for (const p of this.windingProps) {
      const gear = byId.get(p.gearId);
      if (!gear) continue;
      const [lo, hi] = p.travel;
      const lift = Math.min(Math.max(gear.rotation * p.radius, lo), hi);
      // COMPOSE with `attachTo` rather than overwriting it. `sync()` runs the attached-prop
      // pass first, so for a prop that declares both, the mesh already holds its SPUN position
      // -- and rewriting from `basePos` here threw that away. A tower crane's hook is exactly
      // that case: it hangs from a trolley that orbits with the jib AND rides the hoist rope,
      // so the jib would swing round the mast while the hook stayed behind in mid-air.
      // Starting from the already-spun position instead adds the lift on top of the swing.
      if (!p.alsoAttached) p.mesh.position.copy(p.basePos);
      p.mesh.position.addScaledVector(p.dir, lift);
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
    this.updateAttachedProps(byId); // spin windmill sails, propeller blades, wheel spokes, etc.
    this.updateSlidingProps(byId); // slide a castle gate panel with its rack's linear travel
    this.updateWindingProps(byId); // hoist the crane's hook on its drum's rope
    this.updateLinkedProps(byId); // swing pistons/connecting rods on their cranks
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
      // How far the belt/chain has RUN, in world units: the driving wheel's accumulated
      // rotation times its pitch radius -- the rim speed it drags the run at, and the same
      // angle x radius relation `rotation.ts` uses to drive a rack from a pinion. Without this
      // the ribbon's geometry depends only on its two endpoints, and gears never move, so every
      // frame drew byte-identical links: the sprockets spun while the chain sat perfectly still.
      const travel = a.rotation * pitchRadius(a);
      const geometry = buildLinkRibbon(a.position, b.position, width, link.kind, travel);
      const existing = this.linkMeshes.get(key);
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geometry;
      } else {
        const material = new THREE.MeshStandardMaterial({
          color: link.kind === "chain" ? 0x888888 : 0x333333,
          metalness: link.kind === "chain" ? 0.75 : 0.15,
          roughness: link.kind === "chain" ? 0.35 : 0.85,
        });
        if (link.kind === "belt") {
          // A belt is a smooth tube, so travelling links are not an option -- there is nothing
          // discrete to move. Instead it gets a ribbed surface that SCROLLS: the tube's UV runs
          // along its length, so advancing the map offset carries the ribs along the run and the
          // belt reads as driven rather than painted between two pulleys.
          const ribs = getProceduralTexture("fabric");
          if (ribs) {
            const map = ribs.clone();
            map.needsUpdate = true;
            map.repeat.set(1, BELT_RIB_REPEAT);
            material.map = map;
            material.bumpMap = map;
            material.bumpScale = 0.25;
          }
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.linkMeshes.set(key, mesh);
        this.ctx.scene.add(mesh);
      }
      if (link.kind === "belt") {
        const material = this.linkMeshes.get(key)!.material as THREE.MeshStandardMaterial;
        if (material.map) {
          const span = Math.max(1e-6, distanceBetween(a.position, b.position));
          // One full texture repeat spans `span / BELT_RIB_REPEAT` world units, so dividing the
          // travel by that converts world units of belt movement into texture repeats.
          material.map.offset.y = -(travel * BELT_RIB_REPEAT) / span;
        }
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
