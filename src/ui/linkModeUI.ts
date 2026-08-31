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
 *  on a same-gear click that cancels the pending pick, on toggling the mode off while a
 *  pick was pending, or on an explicit external `reset()` call. */
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

  /** Cancels any pending first-pick without touching whether the mode itself is armed
   *  (`active`) -- e.g. when the caller's underlying layout is swapped out from under a
   *  pending pick, the specific gear id that was picked may no longer exist, but the user's
   *  own choice to have the mode armed is a separate concern and shouldn't be silently
   *  undone for them. Deliberately *not* the same as the button's toggle-off handler above,
   *  which clears the pick as a side effect of also flipping `active` off -- this only ever
   *  touches the pick. Fires `onPickChange(null)`, matching the toggle-off/complete-link
   *  precedent that any pick clear notifies the caller, but only when a pick was actually
   *  pending, so calling this when idle is a safe no-op with no spurious callback fire. */
  reset(): void {
    if (this.firstPick === null) return;
    this.firstPick = null;
    this.onPickChange(null);
  }
}
