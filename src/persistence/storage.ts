import type { GearInstance } from "../sim/types";
import { serializeGears, deserializeGears } from "./serialize";

const STORAGE_KEY = "gear-sandbox:layout";

export function saveToLocalStorage(gears: GearInstance[]): void {
  window.localStorage.setItem(STORAGE_KEY, serializeGears(gears));
}

export function loadFromLocalStorage(): GearInstance[] | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  return deserializeGears(raw);
}

export function exportToFile(gears: GearInstance[]): Blob {
  return new Blob([serializeGears(gears)], { type: "application/json" });
}

export async function importFromFile(file: File): Promise<GearInstance[]> {
  const text = await file.text();
  return deserializeGears(text);
}
