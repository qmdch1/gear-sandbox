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
    if (slack > SNAP_SLACK || slack >= bestSlack) continue;

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

export interface DragControlsOptions {
  ctx: SceneContext;
  getGears: () => GearInstance[];
  /** `rotation`, when present, is the tooth-interlocking snap rotation for the anchor
   *  gear only — group members always move by position delta alone, keeping whatever
   *  relative phase they already had with each other. */
  onMove: (id: string, position: [number, number, number], rotation?: number) => void;
  /** Fired unconditionally on pointerdown with the id of the gear mesh hit, or null if none. */
  onSelect?: (gearId: string | null) => void;
  /** Fired during a drag with the nearest compatible partner's id at the candidate drop point, or null. */
  onPreview?: (partnerId: string | null) => void;
}

/** Thin pointer-event wiring: raycast onto the ground plane, drag the picked gear's
 *  position (and, by default, its whole connected assembly along with it — hold Alt
 *  to detach and drag just the one gear), and delegate the "is this a valid drop spot"
 *  question to `findSnapTarget`. Verified via manual QA (Task 15) — pointer/raycaster
 *  behavior is not meaningfully unit-testable without a real WebGL context. */
export class DragControls {
  private raycaster = new THREE.Raycaster();
  private draggingId: string | null = null;
  // The connected assembly being dragged, each mapped to ITS OWN position at drag
  // start — moved together by the same delta the anchor (draggingId) gear moves by.
  private dragGroupStart: Map<string, [number, number, number]> | null = null;
  private dragAnchorStart: [number, number, number] | null = null;

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
    const hitId = hits.length > 0 ? hits[0].object.name : null;
    if (hitId) {
      this.draggingId = hitId;
      ctx.controls.enabled = false;

      const gears = this.options.getGears();
      const anchor = gears.find((g) => g.id === hitId);
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
    this.options.ctx.controls.enabled = true;
    this.options.onPreview?.(null);
  };
}
