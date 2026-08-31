import type { GearType } from "../sim/types";

/** Human-friendly Korean name for each object type -- shared by the palette (button
 *  text) and the durability panel (which type a selected gear is), so the two never
 *  drift out of sync with each other. */
export const GEAR_LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
  rack: "랙",
  planetary: "유성기어 세트",
  ratchet: "래칫 기어",
  sprocket: "스프로킷(체인용)",
  pulley: "풀리(벨트용)",
  differential: "차동장치",
};

/** A short explanatory note for object types whose simulated behaviour is a deliberate
 *  simplification a user could otherwise find confusing -- shown alongside the type name
 *  wherever a gear's details are displayed. Spec §3.6 calls this out explicitly for the
 *  differential: real ones split speed between output shafts based on load/resistance,
 *  but this sandbox only models rotation propagation, not torque or resistance (v1 spec
 *  §1's non-goals), so both output shafts always turn at the same ("locked") speed here.
 *  Spec §3.5 makes the same call for the planetary set: it's simulated as a single node
 *  (one lumped-equivalent gear, `meshing.ts`'s `evaluatePair`), not independent sun/
 *  planet/ring speeds or a carrier -- worth flagging because the geometry (a full sun +
 *  ring + 3 orbiting planets, `gearGeometry.ts`'s `planetaryGeometry`) visually promises
 *  far richer motion than the physics behind it actually delivers. `undefined` for every
 *  type with no such simplification worth calling out. */
export const GEAR_NOTES: Partial<Record<GearType, string>> = {
  differential: "이 샌드박스는 저항(토크)을 계산하지 않아 두 출력축이 항상 같은 속도로 돕니다(실제 차동장치는 노면 저항에 따라 좌우 속도가 달라짐).",
  planetary: "이 샌드박스는 선기어·유성기어·링기어를 따로 계산하지 않고 유성기어 세트 전체를 하나의 기어로 묶어 돌립니다(실제로는 캐리어가 유성기어를 공전시키며 선·링·유성이 서로 다른 속도로 맞물려 돕니다).",
};
