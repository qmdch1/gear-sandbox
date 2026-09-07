import type { LayoutState } from "../types";
import type { Prop } from "../../render/props";
import { createClockPreset, createClockProps } from "./clock";
import { createCarPreset, createCarProps } from "./car";
import { createCastlePreset, createCastleProps } from "./castle";
import { createHoistPreset, createHoistProps } from "./hoist";

export { createClockPreset, createClockProps } from "./clock";
export { createCarPreset, createCarProps } from "./car";
export { createCastlePreset, createCastleProps } from "./castle";
export { createHoistPreset, createHoistProps } from "./hoist";

export interface PresetEntry {
  id: string;
  label: string;
  build: () => LayoutState;
  /** Optional decorative body (car chassis, clock bezel, ...) rendered around the gears
   *  -- see `render/props.ts`. A preset with no `buildProps` simply shows its bare gear
   *  mechanism, which is fine for a purely abstract demo. */
  buildProps?: () => Prop[];
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
    buildProps: createClockProps,
  },
  {
    id: "car",
    label: "자동차 (차체 프레임 + 벨트로 동기 구동되는 네 바퀴)",
    build: createCarPreset,
    buildProps: createCarProps,
  },
  {
    id: "castle",
    label: "성문 (도개교 — 손잡이로 게이트를 올리고 내리는 랙-피니언)",
    build: createCastlePreset,
    buildProps: createCastleProps,
  },
  {
    id: "hoist",
    label: "기중기 (도르래로 크랭크 속도를 4:1로 줄이는 손 윈치)",
    build: createHoistPreset,
    buildProps: createHoistProps,
  },
];
