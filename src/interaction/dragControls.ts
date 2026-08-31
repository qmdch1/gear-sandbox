import * as THREE from "three";
import type { GearInstance } from "../sim/types";
import { evaluatePair } from "../sim/meshing";
import { resolveOverlapFreePositionForGear } from "../sim/overlapResolution";
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

export interface DragControlsOptions {
  ctx: SceneContext;
  getGears: () => GearInstance[];
  onMove: (id: string, position: [number, number, number]) => void;
  /** Fired unconditionally on pointerdown with the id of the gear mesh hit, or null if none. */
  onSelect?: (gearId: string | null) => void;
  /** Fired during a drag with the nearest compatible partner's id at the candidate drop point, or null. */
  onPreview?: (partnerId: string | null) => void;
}

/** Thin pointer-event wiring: raycast onto the ground plane, drag the picked gear's
 *  position, and delegate the "is this a valid drop spot" question to
 *  `findNearestCompatiblePartner`. Verified via manual QA (Task 15) — pointer/raycaster
 *  behavior is not meaningfully unit-testable without a real WebGL context.
 *
 *  Overlap avoidance (mirroring PlacementControls' `resolveOverlapFreePosition`, see
 *  `sim/overlapResolution.ts`) is applied only at drop (`onPointerUp`), NOT on every
 *  `onPointerMove`. During the drag itself the gear tracks the raw raycast point exactly,
 *  same as before this feature existed: nudging continuously, every pointermove, would
 *  fight the user's own cursor motion the instant it crossed into another gear's overlap
 *  radius -- a moving correction chasing a moving target, likely feeling jittery/unstable,
 *  and (worse) making it hard to ever deliberately land on a legitimate coincident coupling
 *  target (e.g. a load onto its crank) since any near-miss along the way would get shoved
 *  clear before the cursor could settle exactly on it. Correcting once, only on release,
 *  lets the gear follow the cursor faithfully while dragging and only "snap clear" at the
 *  moment it's dropped -- closer to how the click-to-place flow already behaves (one
 *  evaluation at commit time, not per intermediate mouse position). */
export class DragControls {
  private raycaster = new THREE.Raycaster();
  private draggingId: string | null = null;

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
    }
    this.options.onSelect?.(hitId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.draggingId) return;
    const point = this.pointerToGroundPoint(event);
    if (!point) return;
    const position: [number, number, number] = [point.x, 0, point.z];
    this.options.onMove(this.draggingId, position);

    if (this.options.onPreview) {
      const gears = this.options.getGears();
      const dragged = gears.find((g) => g.id === this.draggingId);
      if (dragged) {
        const candidate: GearInstance = { ...dragged, position };
        const partner = findNearestCompatiblePartner(candidate, gears);
        this.options.onPreview(partner ? partner.id : null);
      } else {
        this.options.onPreview(null);
      }
    }
  };

  private onPointerUp = (): void => {
    const draggedId = this.draggingId;
    this.draggingId = null;
    this.options.ctx.controls.enabled = true;
    this.options.onPreview?.(null);

    if (!draggedId) return;
    const gears = this.options.getGears();
    const dragged = gears.find((g) => g.id === draggedId);
    if (!dragged) return;

    // Exclude the dragged gear itself from the "existing gears to check against" list --
    // same id-exclusion `findNearestCompatiblePartner` above already applies -- otherwise
    // it would trivially "overlap" its own just-dropped position (distance 0 from itself).
    const others = gears.filter((g) => g.id !== draggedId);
    const resolved = resolveOverlapFreePositionForGear(dragged, dragged.position, others);
    // `resolveOverlapFreePositionForGear` returns the exact same array reference, unchanged,
    // when the drop position needed no correction -- so this only fires an (extra) `onMove`
    // for a genuine nudge, not on every plain click/drop.
    if (resolved !== dragged.position) this.options.onMove(draggedId, resolved);
  };
}
