import type { LayoutState } from "../types";
import { createClockPreset } from "./clock";
import { createCarPreset } from "./car";

export { createClockPreset } from "./clock";
export { createCarPreset } from "./car";

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
    id: "car",
    label: "자동차 (벨트로 동기 구동되는 네 바퀴)",
    build: createCarPreset,
  },
];
