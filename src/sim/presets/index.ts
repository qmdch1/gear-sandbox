import type { LayoutState } from "../types";
import type { Prop } from "../../render/props";
import { createClockPreset, createClockProps } from "./clock";
import { createCarPreset, createCarProps } from "./car";
import { createCastlePreset, createCastleProps } from "./castle";
import { createHoistPreset, createHoistProps } from "./hoist";
import { createAirplanePreset, createAirplaneProps } from "./airplane";
import { createWindmillPreset, createWindmillProps } from "./windmill";
import { createBicyclePreset, createBicycleProps } from "./bicycle";

export { createClockPreset, createClockProps } from "./clock";
export { createCarPreset, createCarProps } from "./car";
export { createCastlePreset, createCastleProps } from "./castle";
export { createHoistPreset, createHoistProps } from "./hoist";
export { createAirplanePreset, createAirplaneProps } from "./airplane";
export { createWindmillPreset, createWindmillProps } from "./windmill";
export { createBicyclePreset, createBicycleProps } from "./bicycle";

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
  {
    id: "airplane",
    label: "비행기 (엔진이 앞머리 프로펠러를 돌리는 동체 + 날개)",
    build: createAirplanePreset,
    buildProps: createAirplaneProps,
  },
  {
    id: "windmill",
    label: "풍차 (날개축이 베벨기어로 수직 방아축을 돌리는 석탑)",
    build: createWindmillPreset,
    buildProps: createWindmillProps,
  },
  {
    id: "bicycle",
    label: "자전거 (페달→체인→뒷바퀴 2배 증속 드라이브트레인)",
    build: createBicyclePreset,
    buildProps: createBicycleProps,
  },
];
