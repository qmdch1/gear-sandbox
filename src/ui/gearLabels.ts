import type { GearInstance } from "../sim/types";
import { PART_INFO } from "./partInfo";

/** A human-readable, numbered label per gear ("평기어 1", "평기어 2", "동력원 기어 1", ...)
 *  instead of its raw (unreadable) id -- numbered by order of appearance among
 *  gears of the SAME type in the current array, using each type's own palette
 *  label (see partInfo.ts) as the name. Recomputed fresh on every render
 *  rather than stored on the gear itself, so it stays simple (no schema or
 *  save-file change) at the cost of a number shifting if an earlier same-type
 *  gear is ever removed -- acceptable since there's no delete feature yet. */
export function computeGearLabels(gears: GearInstance[]): Map<string, string> {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const gear of gears) {
    const count = (counts.get(gear.type) ?? 0) + 1;
    counts.set(gear.type, count);
    labels.set(gear.id, `${PART_INFO[gear.type].label} ${count}`);
  }
  return labels;
}
