import * as THREE from "three";
import type { GearType } from "../sim/types";
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
    const position: [number, number, number] = point
      ? [point.x, 0, point.z]
      : this.options.fallbackPosition(type);
    this.setActiveType(null);
    this.options.onPlace(type, position);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.cancel();
  };
}
