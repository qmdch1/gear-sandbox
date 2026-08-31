import * as THREE from "three";
import type { GearInstance, GearType } from "../sim/types";
import { isOverlapping, pitchRadius } from "../sim/meshing";
import { createGear } from "../sim/gearFactory";
import type { SceneContext } from "../render/scene";

export interface PlacementControlsOptions {
  ctx: SceneContext;
  /** Fired once placement commits, with the type being placed and the world position to place it at. */
  onPlace: (type: GearType, position: [number, number, number]) => void;
  /** Fired whenever the active placement type changes (armed, canceled, or committed back to null),
   *  so UI (palette button highlight, hint text) can stay in sync. */
  onModeChange?: (activeType: GearType | null) => void;
  /** Rigid grid-slot fallback used only if a commit click's raycast doesn't hit the ground plane. */
  fallbackPosition: (type: GearType) => [number, number, number];
  /** Current gear list, consulted at commit time so a raycast point landing on top of an existing
   *  gear gets nudged clear of it before `onPlace` fires (see `resolveOverlapFreePosition`). Optional
   *  only so call sites with no live gear list to hand (this file's earlier unit tests) still compile
   *  -- omitting it just makes overlap-avoidance a no-op (nothing to check the candidate against). */
  getGears?: () => GearInstance[];
}

/** How far beyond the bare pitch-radius-sum a nudge lands the new gear's center from the gear it's
 *  clearing -- comfortably past `isOverlapping`'s own boundary (which sits at 95% of that sum, see
 *  MESH_TOLERANCE in meshing.ts) regardless of how that tolerance is tuned later, plus headroom for
 *  floating-point rounding, so the nudge never lands back inside the overlap it was meant to escape. */
const NUDGE_CLEARANCE_FACTOR = 1.02;

/** Bounds the nudge-and-recheck loop below. A real layout clearing in a handful of iterations is the
 *  overwhelmingly common case; this just guarantees termination against a pathologically crowded one. */
const MAX_NUDGE_ITERATIONS = 20;

/** The existing gear (if any) that a candidate placement geometrically overlaps, nearest one first.
 *  Reuses `isOverlapping` as-is, so a legitimate coincident coupling -- e.g. a `load` placed exactly
 *  on the crank/gear it's meant to shaft-couple to -- is correctly never reported here: `isOverlapping`
 *  already treats any pair `evaluatePair` recognizes as a valid mesh/coupling as NOT an overlap. */
function findOverlappingGear(candidate: GearInstance, gears: GearInstance[]): GearInstance | null {
  let nearest: GearInstance | null = null;
  let nearestDistance = Infinity;
  for (const gear of gears) {
    if (!isOverlapping(candidate, gear)) continue;
    const dx = candidate.position[0] - gear.position[0];
    const dz = candidate.position[2] - gear.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = gear;
    }
  }
  return nearest;
}

/** If placing `type` at `position` would land directly on/inside an existing gear, nudges the
 *  position outward -- along the ground-plane (X/Z) vector from that gear's center to the candidate
 *  -- just far enough to clear it, then rechecks against the FULL gear list again (not just the gear
 *  just avoided), since clearing one overlap can land squarely inside a third gear. Deterministic:
 *  no randomness anywhere, so the same layout always resolves the same way. Bails out to the
 *  last-attempted position after `MAX_NUDGE_ITERATIONS` rather than looping forever on a
 *  pathologically crowded layout (whatever overlap remains is still caught by the existing
 *  `overlapPairs` diagnostic). A position with no overlap to begin with -- including every
 *  legitimate coincident placement, see `findOverlappingGear` -- returns unchanged on the first
 *  check, so this is a no-op for the normal case. */
function resolveOverlapFreePosition(
  type: GearType,
  position: [number, number, number],
  gears: GearInstance[],
): [number, number, number] {
  let current = position;
  for (let i = 0; i < MAX_NUDGE_ITERATIONS; i++) {
    const candidate = createGear(type, current);
    const blocker = findOverlappingGear(candidate, gears);
    if (!blocker) return current;

    const dx = current[0] - blocker.position[0];
    const dz = current[2] - blocker.position[2];
    const len = Math.hypot(dx, dz);
    // Deterministic fallback direction for the (rare) case where the candidate's ground-plane
    // point coincides exactly with the blocker's -- e.g. two gears clicked at the same spot but
    // sitting at different heights -- so there's no "away from it" direction to normalize.
    const [ux, uz] = len < 1e-6 ? [1, 0] : [dx / len, dz / len];

    const clearDistance = (pitchRadius(candidate) + pitchRadius(blocker)) * NUDGE_CLEARANCE_FACTOR;
    current = [blocker.position[0] + ux * clearDistance, current[1], blocker.position[2] + uz * clearDistance];
  }
  return current;
}

/** Click-to-place: picking a palette button arms "placement mode" for that gear type instead of
 *  dropping a gear immediately at a rigid grid slot. The next click inside the viewport commits the
 *  gear at the raycast-to-ground-plane point under the cursor -- reusing DragControls' exact NDC +
 *  ground-plane raycast approach for consistency. Picking the same type again, or pressing Escape,
 *  cancels cleanly without creating a gear. */
export class PlacementControls {
  private raycaster = new THREE.Raycaster();
  private activeType: GearType | null = null;

  constructor(private options: PlacementControlsOptions) {
    const { domElement } = options.ctx.renderer;
    domElement.addEventListener("click", this.onCanvasClick);
    window.addEventListener("keydown", this.onKeyDown);
  }

  get isActive(): boolean {
    return this.activeType !== null;
  }

  get active(): GearType | null {
    return this.activeType;
  }

  /** Wire this to each palette button's pick callback: picking the type already armed cancels
   *  (toggle-off); picking a different type switches placement to it. */
  handlePick(type: GearType): void {
    if (this.activeType === type) {
      this.cancel();
    } else {
      this.setActiveType(type);
    }
  }

  /** Cancels placement mode without creating a gear. No-op if nothing is armed. */
  cancel(): void {
    if (this.activeType === null) return;
    this.setActiveType(null);
  }

  private setActiveType(type: GearType | null): void {
    this.activeType = type;
    this.options.ctx.renderer.domElement.style.cursor = type ? "crosshair" : "";
    this.options.onModeChange?.(type);
  }

  private groundPoint(event: MouseEvent): THREE.Vector3 | null {
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

  private onCanvasClick = (event: MouseEvent): void => {
    const type = this.activeType;
    if (!type) return;
    const point = this.groundPoint(event);
    const rawPosition: [number, number, number] = point
      ? [point.x, 0, point.z]
      : this.options.fallbackPosition(type);
    const position = resolveOverlapFreePosition(type, rawPosition, this.options.getGears?.() ?? []);
    this.setActiveType(null);
    this.options.onPlace(type, position);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.cancel();
  };
}
