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
 *  `undefined` for every type with no such simplification worth calling out. */
export const GEAR_NOTES: Partial<Record<GearType, string>> = {
  differential: "이 샌드박스는 저항(토크)을 계산하지 않아 두 출력축이 항상 같은 속도로 돕니다(실제 차동장치는 노면 저항에 따라 좌우 속도가 달라짐).",
};
