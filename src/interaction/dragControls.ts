import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { evaluatePair, idealConnectionDistance, meshPhaseAlignment } from "../sim/meshing";
import { buildEdges, connectedComponentIds } from "../sim/graph";
import type { SceneContext } from "../render/scene";

/** Among candidate gears, the closest one that would form a valid mesh/coupling with `dragged`. */
export function findNearestCompatiblePartner(
  dragged: GearInstance,
  others: GearInstance[],
): GearInstance | null {
  let best: GearInstance | null = null;
  let bestDistance = Infinity;
  for (const candidate of others) {
    if (candidate.id === dragged.id) continue;
    if (!evaluatePair(dragged, candidate)) continue;
    const dx = dragged.position[0] - candidate.position[0];
    const dz = dragged.position[2] - candidate.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

const SNAP_SLACK = 6; // units of drop-point slack tolerated around the ideal meshing ring

/** How far from `gear`'s own center (or, for a rod, its own centerline) a click
 *  should still count as "on this part" for `pickGearByFootprint` -- generous
 *  on purpose, covering the part's actual rendered silhouette (including empty
 *  space like a shaft-bore hole) with a bit of margin, rather than trying to
 *  match its precise geometry exactly. */
function footprintRadius(gear: GearInstance): number {
  const m = gear.module || 1;
  const toothRadius = gear.teeth > 0 ? (m * gear.teeth) / 2 : 0;
  return Math.max(toothRadius + m * 1.5, m * 4);
}

function distanceToSegmentXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  const t = abLenSq > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq)) : 0;
  const closestX = ax + abx * t;
  const closestZ = az + abz * t;
  return Math.hypot(px - closestX, pz - closestZ);
}

/** Fallback picking for when the precise mesh raycast finds nothing under the
 *  pointer, even though the click visually landed within a part's own outline
 *  -- most commonly, clicking a gear's shaft-bore hole (genuinely empty space
 *  in its geometry) or an accessory's annulus hole (load/gauge). Without this,
 *  such a click falls through to OrbitControls, which grabs the CAMERA instead
 *  of the part the user meant to drag -- confusing since nothing looks
 *  "empty" about where they clicked. Finds the gear whose own footprint (a
 *  simple circle around its center, or a capsule around its centerline for a
 *  two-endpoint rod) is closest to `(x, z)` and within `footprintRadius`. */
export function pickGearByFootprint(x: number, z: number, gears: GearInstance[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const gear of gears) {
    const distance = gear.position2
      ? distanceToSegmentXZ(x, z, gear.position[0], gear.position[2], gear.position2[0], gear.position2[2])
      : Math.hypot(x - gear.position[0], z - gear.position[2]);
    if (distance <= footprintRadius(gear) && distance < bestDistance) {
      bestDistance = distance;
      best = gear.id;
    }
  }
  return best;
}

export interface SnapTarget {
  position: [number, number, number];
  partnerId: string;
  /** The dragged gear's rotation should be set to this so its tooth sits centered in
   *  the partner's gap, rather than the two tooth profiles clashing (or meshing at
   *  some arbitrary, off-center point). Undefined when phase-alignment doesn't apply
   *  (see `meshPhaseAlignment`). */
  rotation?: number;
}

/** Hand-positioning a gear at the exact center distance a mesh/coupling requires is
 *  impractical (default gears need ~20 units, to the tenth of a unit, along the right
 *  axis) -- and even at the right distance, the exact angle around the partner matters
 *  too, or the mesh "works" (no clash) but lands off-center in the gap rather than
 *  tooth-middle-to-gap-middle. Finds the nearest gear `dragged` COULD connect to (by
 *  type/axis, regardless of its current distance) and, if the raw drop point is within
 *  `SNAP_SLACK` of the ideal ring around that partner, returns the position (angle
 *  corrected to the nearest tooth-pitch detent where phase-alignment applies) and
 *  rotation `dragged` should snap to so the two actually, properly mesh. */
export function findSnapTarget(
  dragged: GearInstance,
  rawPosition: [number, number, number],
  others: GearInstance[],
): SnapTarget | null {
  let best: SnapTarget | null = null;
  let bestSlack = Infinity;
  for (const candidate of others) {
    if (candidate.id === dragged.id) continue;
    const idealDistance = idealConnectionDistance({ ...dragged, position: rawPosition }, candidate);
    if (idealDistance === null) continue;

    const dx = rawPosition[0] - candidate.position[0];
    const dz = rawPosition[2] - candidate.position[2];
    const rawDistance = Math.hypot(dx, dz);
    const slack = Math.abs(rawDistance - idealDistance);
    // A coincident target (a shaft coupling, like a load/gauge/helical/worm
    // dropped onto a power source) is a single POINT to hit exactly, unlike a
    // meshing ring which spans a whole circle around the partner -- "drop it
    // near the partner's center" is a much smaller, easier-to-miss target than
    // "drop it near the partner's edge." Scaling the tolerated slack up to the
    // partner's own visible radius means dropping ANYWHERE on top of the host
    // gear's disc counts as "close enough," matching how it actually looks on
    // screen, instead of only a small, invisible hot-zone at its dead center.
    const effectiveSlack = idealDistance === 0 ? Math.max(SNAP_SLACK, (candidate.module * candidate.teeth) / 2) : SNAP_SLACK;
    if (slack > effectiveSlack || slack >= bestSlack) continue;

    let position: [number, number, number];
    let rotation: number | undefined;
    if (idealDistance === 0 || rawDistance < 1e-6) {
      position = [candidate.position[0], rawPosition[1], candidate.position[2]];
    } else {
      const rawWorldAngleTowardPartner = Math.atan2(-dz, -dx); // dragged -> partner
      const alignment = meshPhaseAlignment(dragged, rawWorldAngleTowardPartner, candidate);
      const angleTowardPartner = alignment ? alignment.worldAngleTowardPartner : rawWorldAngleTowardPartner;
      const angleFromPartner = angleTowardPartner + Math.PI; // partner -> dragged, for placement
      position = [
        candidate.position[0] + idealDistance * Math.cos(angleFromPartner),
        rawPosition[1],
        candidate.position[2] + idealDistance * Math.sin(angleFromPartner),
      ];
      rotation = alignment?.rotation;
    }

    bestSlack = slack;
    best = rotation === undefined ? { position, partnerId: candidate.id } : { position, partnerId: candidate.id, rotation };
  }
  return best;
}

/** For a "shaft" (a rigid rod with two ends, each independently couplable -- see
 *  meshing.ts): whether `rawPosition` is a good drop point for ONE end of it, given
 *  the OTHER end is fixed wherever `fixedOtherEnd` currently is. Mirrors
 *  `findSnapTarget`'s coincident-coupling case (`idealDistance === 0`) but for a
 *  gear whose relevant "position" for the coupling check is whichever end is being
 *  dragged, not always `shaft.position` -- callers pass in whichever end that is. */
function findShaftEndpointSnap(
  shaft: GearInstance,
  otherEndKey: "position" | "position2",
  rawPosition: [number, number, number],
  others: GearInstance[],
): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestSlack = Infinity;
  for (const candidate of others) {
    if (candidate.id === shaft.id) continue;
    const probe = { ...shaft, [otherEndKey === "position" ? "position2" : "position"]: rawPosition };
    if (idealConnectionDistance(probe, candidate) !== 0) continue; // only coincident-style targets matter for an endpoint
    const dx = rawPosition[0] - candidate.position[0];
    const dz = rawPosition[2] - candidate.position[2];
    const slack = Math.hypot(dx, dz);
    // Same reasoning as findSnapTarget's coincident case: dropping anywhere on
    // top of the host gear's own visible disc should count as "close enough."
    const effectiveSlack = Math.max(SNAP_SLACK, (candidate.module * candidate.teeth) / 2);
    if (slack > effectiveSlack || slack >= bestSlack) continue;
    bestSlack = slack;
    best = [candidate.position[0], rawPosition[1], candidate.position[2]];
  }
  return best;
}

export interface DragControlsOptions {
  ctx: SceneContext;
  getGears: () => GearInstance[];
  /** `rotation`, when present, is the tooth-interlocking snap rotation for the anchor
   *  gear only — group members always move by position delta alone, keeping whatever
   *  relative phase they already had with each other. */
  onMove: (id: string, position: [number, number, number], rotation?: number) => void;
  /** A shaft's SECOND end (position2) only -- fired instead of `onMove` while
   *  Ctrl-dragging a shaft's far end (see the class doc comment below). */
  onMoveSecondEnd?: (id: string, position2: [number, number, number]) => void;
  /** Fired unconditionally on pointerdown with the id of the gear mesh hit, or null if none. */
  onSelect?: (gearId: string | null) => void;
  /** Fired during a drag with the nearest compatible partner's id at the candidate drop point, or null. */
  onPreview?: (partnerId: string | null) => void;
  /** Resolves a raycaster hit's object (+ instanceId, when the hit landed on an
   *  InstancedMesh representing many gears at once -- see sceneSync.ts) back to
   *  the specific gear id it represents. A plain, non-instanced mesh (a belt)
   *  has no instanceId; implementations should fall back to the object's own
   *  `.name` in that case, matching every mesh's `.name = gear.id` convention. */
  resolveHitId: (object: THREE.Object3D, instanceId: number | undefined) => string | null;
}

/** Thin pointer-event wiring: raycast onto the ground plane, drag the picked gear's
 *  position (and, by default, its whole connected assembly along with it — hold Alt
 *  to detach and drag just the one gear), and delegate the "is this a valid drop spot"
 *  question to `findSnapTarget`. Hold Shift instead to drag that one gear's height
 *  (Y) up/down via vertical pointer movement, e.g. to line up a bevel gear with a
 *  partner at a different height -- mutually exclusive with the normal X/Z drag.
 *  Hold Ctrl while dragging a SHAFT specifically to move just its far end
 *  (position2) instead of the whole rod -- a normal drag on a shaft translates
 *  both ends together (rigid body move), same as any other gear/group.
 *  Verified via manual QA (Task 15) — pointer/raycaster behavior is not meaningfully
 *  unit-testable without a real WebGL context. */
const HEIGHT_DRAG_UNITS_PER_PIXEL = 0.12; // dragging up/down this many screen px moves 1 unit
const MIN_HEIGHT = 0; // can't drag a gear below the ground plane

export class DragControls {
  private raycaster = new THREE.Raycaster();
  private draggingId: string | null = null;
  // The connected assembly being dragged, each mapped to ITS OWN position at drag
  // start — moved together by the same delta the anchor (draggingId) gear moves by.
  private dragGroupStart: Map<string, [number, number, number]> | null = null;
  private dragAnchorStart: [number, number, number] | null = null;
  // Shift+drag instead moves just the one picked gear's height (Y), independent of
  // the ground-plane raycast used for the normal X/Z drag (a plane at a fixed Y can't
  // itself tell you a *different* Y) -- driven by vertical screen-pixel movement
  // since drag-start instead.
  private heightDrag: { id: string; startY: number; startClientY: number } | null = null;
  // Ctrl+drag on a shaft moves just its far end (position2), independent of the
  // normal whole-rod drag.
  private farEndDrag: { id: string } | null = null;

  constructor(private options: DragControlsOptions) {
    const { domElement } = options.ctx.renderer;
    domElement.addEventListener("pointerdown", this.onPointerDown);
    domElement.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  private pointerToGroundPoint(event: PointerEvent): THREE.Vector3 | null {
    const { ctx } = this.options;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, ctx.camera);
    const hit = this.raycaster.intersectObject(ctx.groundPlane)[0];
    return hit ? hit.point : null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    const { ctx } = this.options;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, ctx.camera);
    const hits = this.raycaster.intersectObjects(ctx.scene.children.filter((c) => c.name));
    const hit = hits[0];
    let hitId = hit ? this.options.resolveHitId(hit.object, hit.instanceId) : null;

    // The precise mesh raycast just missed everything -- try the more forgiving
    // footprint fallback before concluding the click landed on empty ground
    // (see pickGearByFootprint's doc comment for why this matters).
    if (!hitId) {
      const groundPoint = this.pointerToGroundPoint(event);
      if (groundPoint) hitId = pickGearByFootprint(groundPoint.x, groundPoint.z, this.options.getGears());
    }

    if (hitId) {
      const gears = this.options.getGears();
      const anchor = gears.find((g) => g.id === hitId);

      // Shift+drag: adjust just this one gear's height instead of the normal X/Z
      // group drag -- mutually exclusive with it, so skip the group-drag setup below.
      if (event.shiftKey && anchor) {
        this.heightDrag = { id: hitId, startY: anchor.position[1], startClientY: event.clientY };
        ctx.controls.enabled = false;
        this.options.onSelect?.(hitId);
        return;
      }

      // Ctrl+drag on a rod (shaft or beam -- the only two types with a position2):
      // move just its far end (position2), not the whole rod.
      if (event.ctrlKey && anchor?.position2) {
        this.farEndDrag = { id: hitId };
        ctx.controls.enabled = false;
        this.options.onSelect?.(hitId);
        return;
      }

      this.draggingId = hitId;
      ctx.controls.enabled = false;

      if (anchor) {
        this.dragAnchorStart = anchor.position;
        // Alt+drag detaches: drag just this one gear, not its connected assembly.
        const groupIds = event.altKey
          ? new Set([hitId])
          : connectedComponentIds(hitId, gears, buildEdges(gears));
        this.dragGroupStart = new Map(
          gears.filter((g) => groupIds.has(g.id)).map((g) => [g.id, g.position]),
        );
      }
    }
    this.options.onSelect?.(hitId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.heightDrag) {
      const { id, startY, startClientY } = this.heightDrag;
      const gears = this.options.getGears();
      const gear = gears.find((g) => g.id === id);
      if (!gear) return;
      // Dragging UP (smaller clientY) raises the gear.
      const newY = Math.max(MIN_HEIGHT, startY + (startClientY - event.clientY) * HEIGHT_DRAG_UNITS_PER_PIXEL);
      this.options.onMove(id, [gear.position[0], newY, gear.position[2]]);
      return;
    }
    if (this.farEndDrag) {
      const { id } = this.farEndDrag;
      const gears = this.options.getGears();
      const shaft = gears.find((g) => g.id === id);
      if (!shaft || !shaft.position2) return;
      const point = this.pointerToGroundPoint(event);
      if (!point) return;
      const rawPosition2: [number, number, number] = [point.x, shaft.position2[1], point.z];
      const others = gears.filter((g) => g.id !== id);
      const snapped = findShaftEndpointSnap(shaft, "position", rawPosition2, others);
      this.options.onMoveSecondEnd?.(id, snapped ?? rawPosition2);
      return;
    }
    if (!this.draggingId || !this.dragGroupStart || !this.dragAnchorStart) return;
    const point = this.pointerToGroundPoint(event);
    if (!point) return;
    const rawPosition: [number, number, number] = [point.x, 0, point.z];

    const gears = this.options.getGears();
    const dragged = gears.find((g) => g.id === this.draggingId);
    if (!dragged) {
      this.options.onMove(this.draggingId, rawPosition);
      return;
    }

    // Snap to a valid meshing position near the drop point, rather than requiring the
    // user to hand-position gears at an exact center distance (see findSnapTarget) --
    // excluding the assembly already being dragged, so it never tries to snap onto itself.
    const others = gears.filter((g) => !this.dragGroupStart!.has(g.id));
    const snap = findSnapTarget(dragged, rawPosition, others);
    const anchorNewPosition = snap ? snap.position : rawPosition;
    const delta: [number, number, number] = [
      anchorNewPosition[0] - this.dragAnchorStart[0],
      0,
      anchorNewPosition[2] - this.dragAnchorStart[2],
    ];

    for (const [id, startPosition] of this.dragGroupStart) {
      const newPosition: [number, number, number] = [
        startPosition[0] + delta[0],
        startPosition[1],
        startPosition[2] + delta[2],
      ];
      const rotation = id === this.draggingId ? snap?.rotation : undefined;
      this.options.onMove(id, newPosition, rotation);
    }
    this.options.onPreview?.(snap ? snap.partnerId : null);
  };

  private onPointerUp = (): void => {
    this.draggingId = null;
    this.dragGroupStart = null;
    this.dragAnchorStart = null;
    this.heightDrag = null;
    this.farEndDrag = null;
    this.options.ctx.controls.enabled = true;
    this.options.onPreview?.(null);
  };
}
