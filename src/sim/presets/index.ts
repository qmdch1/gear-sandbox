import type { LayoutState } from "../types";
import type { Prop } from "../../render/props";
import { createClockPreset, createClockProps } from "./clock";
import { createCarPreset, createCarProps } from "./car";
import { createCastlePreset, createCastleProps } from "./castle";
import { createHoistPreset, createHoistProps } from "./hoist";
import { createAirplanePreset, createAirplaneProps } from "./airplane";
import { createWindmillPreset, createWindmillProps } from "./windmill";
import { createBicyclePreset, createBicycleProps } from "./bicycle";
import { createLocomotivePreset, createLocomotiveProps } from "./locomotive";
import { createPistonEnginePreset, createPistonEngineProps } from "./pistonengine";
import { createFactoryPreset, createFactoryProps } from "./factory";
import { createWatermillPreset, createWatermillProps } from "./watermill";
import { createFerrisWheelPreset, createFerrisWheelProps } from "./ferriswheel";
import { createCarouselPreset, createCarouselProps } from "./carousel";
import { createWellPumpPreset, createWellPumpProps } from "./wellpump";
import { createConveyorPreset, createConveyorProps } from "./conveyor";
import { createTowerCranePreset, createTowerCraneProps } from "./towercrane";
import { createMusicBoxPreset, createMusicBoxProps } from "./musicbox";
import { createClockTowerPreset, createClockTowerProps } from "./clocktower";
import { createGearboxPreset, createGearboxProps } from "./gearbox";
import { createPlanetaryHoistPreset, createPlanetaryHoistProps } from "./planetaryhoist";
import { createDifferentialAxlePreset, createDifferentialAxleProps } from "./differentialaxle";
import { createWormTablePreset, createWormTableProps } from "./wormtable";
import { createCapstanPreset, createCapstanProps } from "./capstan";

export { createClockPreset, createClockProps } from "./clock";
export { createCarPreset, createCarProps } from "./car";
export { createCastlePreset, createCastleProps } from "./castle";
export { createHoistPreset, createHoistProps } from "./hoist";
export { createAirplanePreset, createAirplaneProps } from "./airplane";
export { createWindmillPreset, createWindmillProps } from "./windmill";
export { createBicyclePreset, createBicycleProps } from "./bicycle";
export { createLocomotivePreset, createLocomotiveProps } from "./locomotive";
export { createPistonEnginePreset, createPistonEngineProps } from "./pistonengine";
export { createFactoryPreset, createFactoryProps } from "./factory";
export { createWatermillPreset, createWatermillProps } from "./watermill";
export { createFerrisWheelPreset, createFerrisWheelProps } from "./ferriswheel";
export { createCarouselPreset, createCarouselProps } from "./carousel";
export { createWellPumpPreset, createWellPumpProps } from "./wellpump";
export { createConveyorPreset, createConveyorProps } from "./conveyor";
export { createTowerCranePreset, createTowerCraneProps } from "./towercrane";
export { createMusicBoxPreset, createMusicBoxProps } from "./musicbox";
export { createClockTowerPreset, createClockTowerProps } from "./clocktower";
export { createGearboxPreset, createGearboxProps } from "./gearbox";
export { createPlanetaryHoistPreset, createPlanetaryHoistProps } from "./planetaryhoist";
export { createDifferentialAxlePreset, createDifferentialAxleProps } from "./differentialaxle";
export { createWormTablePreset, createWormTableProps } from "./wormtable";
export { createCapstanPreset, createCapstanProps } from "./capstan";

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
  {
    id: "locomotive",
    label: "증기기관차 (피스톤·주행봉이 동륜을 잇는 증기기관 — 크랭크-슬라이더 연동)",
    build: createLocomotivePreset,
    buildProps: createLocomotiveProps,
  },
  {
    id: "pistonengine",
    label: "피스톤엔진 (한 크랭크축에 여러 실린더가 물린 직렬 엔진 컷어웨이)",
    build: createPistonEnginePreset,
    buildProps: createPistonEngineProps,
  },
  {
    id: "factory",
    label: "공장 (증기기관 하나가 라인샤프트로 세 작업대를 함께 돌리는 연동 설비)",
    build: createFactoryPreset,
    buildProps: createFactoryProps,
  },
  {
    id: "watermill",
    label: "물레방아 (수차가 베벨기어로 수직축을 돌려 맷돌을 가는 3배 증속)",
    build: createWatermillPreset,
    buildProps: createWatermillProps,
  },
  {
    id: "ferriswheel",
    label: "관람차 (감속기어로 큰 바퀴와 곤돌라를 함께 돌리는 대회전차)",
    build: createFerrisWheelPreset,
    buildProps: createFerrisWheelProps,
  },
  {
    id: "carousel",
    label: "회전목마 (모터가 6:1 감속기어로 목마 실은 회전판을 돌리는 놀이기구)",
    build: createCarouselPreset,
    buildProps: createCarouselProps,
  },
  {
    id: "wellpump",
    label: "두레우물 (손잡이를 감았다 풀며 두레박을 올렸다 내리는 도르래 우물)",
    build: createWellPumpPreset,
    buildProps: createWellPumpProps,
  },
  {
    id: "conveyor",
    label: "컨베이어 (같은 크기 두 풀리를 벨트로 묶어 화물을 실어 나르는 이송기)",
    build: createConveyorPreset,
    buildProps: createConveyorProps,
  },
  {
    id: "towercrane",
    label: "타워크레인 (선회기어로 지브를 돌리고 권상드럼으로 후크를 올리는 2계통 크레인)",
    build: createTowerCranePreset,
    buildProps: createTowerCraneProps,
  },
  {
    id: "musicbox",
    label: "오르골 (태엽이 감속휠로 핀 실린더를 돌리고 조속기가 8배로 도는 소리상자)",
    build: createMusicBoxPreset,
    buildProps: createMusicBoxProps,
  },
  {
    id: "clocktower",
    label: "시계탑 (시침·분침이 서로 다른 휠에 달려 4:1로 도는 벽돌탑 + 흔들리는 진자)",
    build: createClockTowerPreset,
    buildProps: createClockTowerProps,
  },
  {
    id: "gearbox",
    label: "변속기 (입력축과 레이샤프트가 3단 서로 다른 감속비로 맞물리는 컷어웨이)",
    build: createGearboxPreset,
    buildProps: createGearboxProps,
  },
  {
    id: "planetaryhoist",
    label: "유성감속기 (헬리컬→유성기어 감속으로 권상드럼을 돌리는 12기어 권상기)",
    build: createPlanetaryHoistPreset,
    buildProps: createPlanetaryHoistProps,
  },
  {
    id: "differentialaxle",
    label: "차동축 (추진축이 베벨기어로 직각 전환해 링기어·차동장치를 돌리는 뒷차축 컷어웨이)",
    build: createDifferentialAxlePreset,
    buildProps: createDifferentialAxleProps,
  },
  {
    id: "wormtable",
    label: "웜기어 회전탁자 (웜이 웜휠을 20:1로 감속 — 웜은 휠을 돌리지만 휠은 웜을 못 돌린다)",
    build: createWormTablePreset,
    buildProps: createWormTableProps,
  },
  {
    id: "capstan",
    label: "캡스턴 (래칫이 역회전을 막는 양묘기 — 손잡이는 돌리지만 닻은 되감기지 않는다)",
    build: createCapstanPreset,
    buildProps: createCapstanProps,
  },
];
