import type { GearType } from "../sim/types";

export interface PartInfo {
  label: string;
  /** How it physically connects to other parts. */
  description: string;
  /** Real-world "where is this actually used, and why" — the teaching point. */
  purpose: string;
  /** Inner markup for a `<svg viewBox="0 0 100 100">` — simple line-art, no external
   *  image asset (consistent with the rest of the app's procedural-only visuals). */
  icon: string;
  /** Public-folder path to a real reference photo of the part (PD/CC0 licensed —
   *  see docs/superpowers/specs/part-photos-report.md), shown alongside the icon in
   *  the part-info modal. Undefined when no suitably licensed photo was found. */
  image?: string;
}

export const PART_INFO: Record<GearType, PartInfo> = {
  spur: {
    label: "평기어",
    description: "가장 기본적인 기어입니다. 같은 방향을 보는 다른 평기어·손잡이 기어·배터리·콘센트와 나란히 붙이면 반대 방향으로 맞물려 돕니다. 헬리컬 기어는 이(치형) 각도가 달라서 맞물리지 않습니다.",
    purpose:
      "시계, 자동차 변속기, 장난감 등 회전을 전달하는 모든 기계의 기본 부품입니다. 잇수 비율을 다르게 하면 속도(RPM)와 힘(토크)을 바꿀 수 있습니다 — 작은 기어가 큰 기어를 돌리면, 큰 기어는 느리게 돌지만 힘은 세집니다.",
    icon: `<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" stroke-width="4"/>
      <g stroke="currentColor" stroke-width="6">
        <line x1="50" y1="14" x2="50" y2="24"/><line x1="50" y1="76" x2="50" y2="86"/>
        <line x1="14" y1="50" x2="24" y2="50"/><line x1="76" y1="50" x2="86" y2="50"/>
        <line x1="25" y1="25" x2="32" y2="32"/><line x1="75" y1="75" x2="68" y2="68"/>
        <line x1="75" y1="25" x2="68" y2="32"/><line x1="25" y1="75" x2="32" y2="68"/>
      </g>`,
    image: "/parts/spur.jpg",
  },
  helical: {
    label: "헬리컬 기어",
    description: "이가 비스듬히 나 있어서 맞물릴 때 여러 개가 동시에 걸립니다. 단, 이 각도가 평기어와 달라서 평기어·손잡이 기어와는 이빨로 맞물리지 않고, 다른 헬리컬 기어끼리만 맞물립니다. 동력원 기어의 축 위치에 정확히 겹치게 놓으면 이빨 없이 축 결합으로 동력을 받을 수 있습니다(웜 기어와 같은 방식).",
    purpose:
      "실제 자동차 변속기 대부분이 평기어 대신 이걸 씁니다 — 하중이 이 하나에 몰리지 않고 여러 이에 나뉘어서 더 조용하고 덜 닳습니다(이 샌드박스에서도 내구도가 더 높게 설정되어 있습니다).",
    icon: `<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" stroke-width="4"/>
      <g stroke="currentColor" stroke-width="3">
        <line x1="30" y1="70" x2="45" y2="30"/><line x1="45" y1="75" x2="60" y2="35"/><line x1="60" y1="78" x2="75" y2="38"/>
      </g>`,
    image: "/parts/helical.jpg",
  },
  crank: {
    label: "동력원 기어",
    description:
      "놓으면 자동으로 돕니다 — 이 기어트레인의 동력원입니다. 평기어처럼 다른 기어와 나란히 붙이면 그 회전이 전달됩니다. 실제로는 사람이 돌리는 손잡이, 배터리로 도는 모터, 콘센트 전원으로 도는 모터 등 여러 모습으로 나타나지만, 이 샌드박스에서는 전부 똑같이 동작하는 하나의 부품으로 다룹니다.",
    purpose:
      "사람 손이나 모터가 기계에 처음 힘을 넣어주는 지점입니다. 우물 펌프 손잡이나 자전거 페달처럼 사람이 직접 돌리기도 하고, 장난감처럼 배터리로 돌아가기도 하고, 세탁기처럼 콘센트 전원으로 돌아가기도 합니다 — 겉모습은 달라도 '에너지가 들어오는 입구'라는 역할은 같습니다.",
    icon: `<circle cx="42" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="42" cy="50" r="7" fill="none" stroke="currentColor" stroke-width="3"/>
      <line x1="60" y1="50" x2="85" y2="50" stroke="currentColor" stroke-width="5"/>
      <circle cx="88" cy="50" r="7" fill="currentColor"/>`,
    image: "/parts/crank.jpg",
  },
  bevel: {
    label: "베벨 기어",
    description: "축이 90도로 꺾이는 기어입니다. 배치하면 자동으로 옆 기어와 직각을 이루도록 방향이 맞춰집니다.",
    purpose:
      "회전 방향을 그대로 꺾어야 할 때 씁니다 — 자동차의 차동기어(엔진 회전을 바퀴 축 방향으로 꺾어줌), 손으로 돌리는 에그비터(거품기)의 손잡이-날개 연결부가 대표적인 예입니다.",
    icon: `<polygon points="20,80 80,80 60,20 40,20" fill="none" stroke="currentColor" stroke-width="5"/>
      <line x1="30" y1="80" x2="30" y2="90" stroke="currentColor" stroke-width="4"/>
      <line x1="70" y1="80" x2="70" y2="90" stroke="currentColor" stroke-width="4"/>`,
    image: "/parts/bevel.jpg",
  },
  worm: {
    label: "웜 기어",
    description:
      "나사 모양 축입니다. 크랭크 등의 축 위치에 딱 겹치게 놓으면 거기서 동력을 직접 받고, 90도 꺾인 방향의 기어를 한쪽으로만 돌립니다(반대로는 역구동 불가).",
    purpose:
      "감속비가 아주 커서 '조금만 돌려도 아주 천천히, 아주 힘차게' 만들 때 씁니다 — 기타 튜닝 페그(줄감개), 자동차 창문 손잡이, 산업용 컨베이어 감속기가 대표적입니다. 반대로 안 돌아가는 특성 덕분에 '한번 감으면 안 풀리는' 리프트·잭에도 쓰입니다.",
    icon: `<rect x="20" y="35" width="60" height="30" rx="15" fill="none" stroke="currentColor" stroke-width="5"/>
      <g stroke="currentColor" stroke-width="3">
        <line x1="24" y1="48" x2="76" y2="38"/><line x1="24" y1="58" x2="76" y2="48"/><line x1="24" y1="38" x2="60" y2="32"/>
      </g>`,
    image: "/parts/worm.jpg",
  },
  load: {
    label: "부하(플라이휠)",
    description: "이가 없는 무게추입니다. 다른 기어의 축 위치에 정확히 겹치게 놓으면 그 축에 결합되어, 결합된 기어의 마모 속도를 높입니다.",
    purpose:
      "실제 기계에서 '기어가 최종적으로 돌려야 하는 무게(부하)'를 표현합니다 — 세탁기 드럼, 선풍기 날개, 자동차 바퀴처럼 부하가 클수록 기어가 더 빨리 닳는다는 걸 눈으로 보여줍니다.",
    icon: `<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="10"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" stroke-width="4"/>`,
    image: "/parts/load.jpg",
  },
  gauge: {
    label: "회전계(게이지)",
    description: "회전 속도를 바늘로 보여주는 계기판입니다. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도만큼 바늘이 돕니다 — 마모에는 영향 없음.",
    purpose:
      "자동차 계기판의 타코미터(RPM 게이지)와 같은 역할입니다. 기어비를 바꿨을 때 정말 속도가 빨라지거나 느려지는지, 숫자 없이 바늘의 움직임만 보고 직접 확인할 수 있습니다.",
    icon: `<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="4"/>
      <line x1="50" y1="50" x2="72" y2="35" stroke="currentColor" stroke-width="4"/>
      <circle cx="50" cy="50" r="4" fill="currentColor"/>
      <g stroke="currentColor" stroke-width="3">
        <line x1="50" y1="20" x2="50" y2="26"/><line x1="80" y1="50" x2="74" y2="50"/><line x1="20" y1="50" x2="26" y2="50"/>
      </g>`,
    image: "/parts/gauge.jpg",
  },
  fan: {
    label: "팬(프로펠러)",
    description: "회전을 눈으로 확인시켜주는 팬입니다. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도로 날개가 돕니다 — 마모에는 영향 없음.",
    purpose:
      "PC 냉각팬, 선풍기, 드론 프로펠러처럼 '회전력으로 실제 바람을 만들어내는' 최종 출력 장치입니다. 이 샌드박스에서는 기어트레인 끝에 달아서 — 예를 들어 웜 기어를 거치면 크랭크를 아무리 빨리 돌려도 팬은 천천히 도는 것처럼 — 기어비가 최종 출력 속도에 미치는 영향을 눈으로 확인하는 용도로 씁니다.",
    icon: `<circle cx="50" cy="50" r="8" fill="currentColor"/>
      <g fill="none" stroke="currentColor" stroke-width="4">
        <ellipse cx="50" cy="25" rx="8" ry="18"/><ellipse cx="75" cy="50" rx="18" ry="8"/>
        <ellipse cx="50" cy="75" rx="8" ry="18"/><ellipse cx="25" cy="50" rx="18" ry="8"/>
      </g>`,
    image: "/parts/fan.jpg",
  },
  wheel: {
    label: "바퀴(수레바퀴)",
    description: "스포크와 타이어가 달린 바퀴입니다. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도로 함께 돕니다 — 마모에는 영향 없음.",
    purpose:
      "자동차·수레·자전거처럼, 기어트레인을 거쳐 나온 회전이 실제로 '땅 위를 굴러가는 움직임'으로 바뀌는 마지막 출력 장치입니다. 팬이 회전을 바람으로 보여준다면, 바퀴는 회전을 이동으로 보여준다고 생각하면 됩니다.",
    icon: `<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="7"/>
      <circle cx="50" cy="50" r="8" fill="none" stroke="currentColor" stroke-width="4"/>
      <g stroke="currentColor" stroke-width="4">
        <line x1="50" y1="20" x2="50" y2="38"/><line x1="50" y1="62" x2="50" y2="80"/>
        <line x1="20" y1="50" x2="38" y2="50"/><line x1="62" y1="50" x2="80" y2="50"/>
        <line x1="27" y1="27" x2="39" y2="39"/><line x1="61" y1="61" x2="73" y2="73"/>
        <line x1="73" y1="27" x2="61" y2="39"/><line x1="39" y1="61" x2="27" y2="73"/>
      </g>`,
  },
};
