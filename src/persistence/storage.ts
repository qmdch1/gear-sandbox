import type { LayoutState } from "../sim/types";
import { serializeLayout, deserializeLayout } from "./serialize";

const STORAGE_KEY = "gear-sandbox:layout";

export function saveToLocalStorage(layout: LayoutState): void {
  window.localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
}

export function loadFromLocalStorage(): LayoutState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return deserializeLayout(raw);
}

export function exportToFile(layout: LayoutState): Blob {
  return new Blob([serializeLayout(layout)], { type: "application/json" });
}

export async function importFromFile(file: File): Promise<LayoutState> {
  const text = await file.text();
  return deserializeLayout(text);
}
