/** Remembers which named sections of a collapsible sidebar group are open
 *  across reloads (via localStorage) -- used by the palette's categories today.
 *  Any other sidebar section that gains its own open/closed toggle later
 *  should reuse this same pair of functions rather than rolling its own
 *  persistence, so every collapsible group in the sidebar behaves the same
 *  way. */

export function loadOpenState(storageKey: string): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : null;
  } catch {
    // localStorage unavailable (private browsing, disabled storage, ...) or the
    // saved value was corrupted -- either way, just fall back to defaults
    // rather than throwing and breaking the whole UI over a remembered toggle.
    return null;
  }
}

export function saveOpenState(storageKey: string, state: Record<string, boolean>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Losing the remembered state is harmless -- just skip saving.
  }
}
