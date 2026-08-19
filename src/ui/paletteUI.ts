import type { GearType } from "../sim/types";

const LABELS: Record<GearType, string> = {
  spur: "평기어",
  helical: "헬리컬 기어",
  crank: "손잡이 기어",
  bevel: "베벨 기어",
  worm: "웜 기어",
  load: "부하(플라이휠)",
  gauge: "회전계(게이지)",
  fan: "팬(프로펠러)",
};

// Shown as a native tooltip on hover — bevel/worm/helical connect differently from a
// plain spur gear, and that's exactly what users asked "how do I even use these" about.
const USAGE_HINTS: Record<GearType, string> = {
  spur: "가장 기본적인 기어. 같은 방향(기본은 위쪽)을 보는 다른 평기어·헬리컬·손잡이 기어와 나란히 붙여서 맞물립니다.",
  helical: "평기어와 연결 방식은 완전히 같습니다 — 이는 비스듬히 나 있어서 여러 개가 동시에 걸리는 만큼 내구도가 더 높습니다.",
  crank: "이 기어를 놓으면 자동으로 돕니다 — 동력의 시작점. 평기어처럼 다른 기어와 나란히 붙이면 그 회전이 전달됩니다.",
  bevel: "축이 90도로 꺾이는 기어. 평기어와는 옆으로 나란히가 아니라 'ㄴ'자로 방향을 꺾어서 붙여야 맞물립니다 — 배치하면 자동으로 그 방향을 잡아줍니다.",
  worm: "나사 모양 축. 크랭크나 다른 기어의 축에 딱 겹치게 놓으면(같은 위치) 그 축에서 직접 동력을 받고, 거기서 90도 꺾인 방향의 기어를 한쪽으로만 돌립니다(역구동 불가) — 감속비가 매우 큽니다.",
  load: "이 없는 플라이휠. 다른 기어의 축 위치에 정확히 겹치게 놓으면 그 축에 결합되어, 결합된 기어의 마모 속도를 높입니다.",
  gauge: "회전 속도를 바늘로 보여주는 계기판. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도만큼 바늘이 돕니다 — 마모에는 영향 없음.",
  fan: "회전을 눈으로 확인시켜주는 팬. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도로 날개가 돕니다 — 마모에는 영향 없음.",
};

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    for (const type of Object.keys(LABELS) as GearType[]) {
      const button = document.createElement("button");
      button.textContent = LABELS[type];
      button.title = USAGE_HINTS[type];
      button.dataset.gearType = type;
      button.addEventListener("click", () => onPick(type));
      container.appendChild(button);
    }
  }
}
