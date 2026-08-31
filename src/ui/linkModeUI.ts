import type { GearType } from "../sim/types";

/** Click-click connection gesture for chain/belt remote links. While `active`, the first
 *  matching-type gear clicked is remembered; the second click (a different gear of the
 *  same type) fires `onLink`. Any click on a non-matching type or while inactive is not
 *  consumed (the caller's normal selection/drag handling proceeds instead).
 *
 *  `onPickChange` fires whenever `firstPick` changes, so the caller can drive a visual
 *  "picked" indicator (e.g. `SceneSync.setPreviewHighlight`) for feedback that the first
 *  click actually registered: with the newly-picked id when a first gear is picked, and
 *  with `null` whenever the pick is cleared -- on completing the link (alongside `onLink`),
 *  on a same-gear click that cancels the pending pick, or on toggling the mode off while a
 *  pick was pending. */
export class LinkModeUI {
  private active = false;
  private firstPick: string | null = null;

  constructor(
    private button: HTMLButtonElement,
    private linkableType: GearType,
    private getGearType: (id: string) => GearType | undefined,
    private onLink: (a: string, b: string) => void,
    private onPickChange: (id: string | null) => void = () => {},
  ) {
    this.button.addEventListener("click", () => {
      this.active = !this.active;
      const hadPick = this.firstPick !== null;
      this.firstPick = null;
      this.button.setAttribute("aria-pressed", String(this.active));
      if (hadPick) this.onPickChange(null);
    });
  }

  /** Call on every gear selection (DragControls.onSelect). Returns true if this click
   *  was consumed as part of a link gesture. */
  handleSelect(id: string | null): boolean {
    if (!this.active || !id) return false;
    if (this.getGearType(id) !== this.linkableType) return false;
    if (!this.firstPick) {
      this.firstPick = id;
      this.onPickChange(id);
      return true;
    }
    if (this.firstPick !== id) this.onLink(this.firstPick, id);
    this.firstPick = null;
    this.onPickChange(null);
    return true;
  }
}
