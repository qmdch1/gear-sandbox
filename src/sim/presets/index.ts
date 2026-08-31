import type { LayoutState } from "../types";
import { createClockPreset } from "./clock";
import { createCastlePreset } from "./castle";

export { createClockPreset } from "./clock";
export { createCastlePreset } from "./castle";

export interface PresetEntry {
  id: string;
  label: string;
  build: () => LayoutState;
}

/** The catalog of complete, themed, fully-assembled preset layouts (as opposed to
 *  `defaultLayout.ts`'s showcase, which demonstrates each mechanism TYPE in isolation).
 *  `PresetPanel` renders one button per entry generically from this list -- adding a
 *  future preset (car, castle, ...) means writing its own `src/sim/presets/<name>.ts`
 *  module (mirroring `clock.ts`'s shape) and appending one entry here; no UI code needs
 *  to change. */
export const PRESETS: PresetEntry[] = [
  {
    id: "clock",
    label: "시계 (톱니 시계 — 12:1 시분침 기어열)",
    build: createClockPreset,
  },
  {
    id: "castle",
    label: "성문 (도개교 — 손잡이로 게이트를 올리고 내리는 랙-피니언)",
    build: createCastlePreset,
  },
];
