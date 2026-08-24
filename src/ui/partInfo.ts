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
  shaft: {
    label: "동력전달축(커플링 로드)",
    description: "다른 두 기어를 멀리서 이어주는 막대입니다. 양쪽 끝을 각각 다른 기어의 축 위치에 겹치게 놓으면 두 기어가 하나처럼 같은 속도·같은 방향으로 돕니다. 이 축 자체는 이가 없어서 어느 기어와도 직접 맞물리지는 않습니다.",
    purpose:
      "실제 자동차의 프로펠러 샤프트(추진축)처럼, 서로 떨어져 있는 두 부품 사이에 회전을 그대로 전달할 때 씁니다. 기어는 서로 가까이 붙어 있어야만 맞물릴 수 있지만, 이 축을 쓰면 멀리 떨어진 기어끼리도 연결할 수 있어서 자동차 뼈대처럼 여러 부품을 넓게 펼쳐서 조립할 수 있습니다.",
    icon: `<circle cx="22" cy="22" r="10" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="78" cy="78" r="10" fill="none" stroke="currentColor" stroke-width="5"/>
      <line x1="29" y1="29" x2="71" y2="71" stroke="currentColor" stroke-width="7"/>`,
  },
  beam: {
    label: "구조용 빔",
    description: "회전 없이 두 부품을 강체로 고정하는 뼈대 부재입니다. 양쪽 끝을 각각 다른 부품(다른 빔도 가능)의 위치에 겹치게 놓으면 그 지점에서 단단히 고정됩니다 — 동력전달축과 달리 회전을 전혀 전달하지 않고, 빔끼리는 끝을 맞대어 계속 이어붙일 수 있습니다.",
    purpose:
      "자동차 섀시(뼈대)나 기계 프레임처럼, 회전할 필요 없이 그냥 단단히 모양을 잡아주기만 하면 되는 구조물을 만들 때 씁니다. 여러 개를 이어 붙이면 사각형 뼈대, 삼각형 트러스처럼 원하는 형태의 골격을 조립할 수 있습니다.",
    icon: `<rect x="15" y="42" width="70" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="5"/>
      <line x1="15" y1="42" x2="15" y2="58" stroke="currentColor" stroke-width="3"/>
      <line x1="85" y1="42" x2="85" y2="58" stroke="currentColor" stroke-width="3"/>`,
  },
  belt: {
    label: "벨트/체인 구동",
    description: "떨어져 있는 두 기어(풀리·스프로킷)를 이어서 같은 방향으로 함께 돌게 만드는 부품입니다. 양쪽 끝을 각각 이빨이 있는 기어의 축 위치에 겹치게 놓으면 연결됩니다 — 기어 맞물림과 달리 회전 방향이 반대로 뒤집히지 않고, 두 기어의 잇수 비율만큼 속도가 달라집니다.",
    purpose:
      "자전거 체인, 자동차 엔진의 타이밍 벨트처럼, 서로 떨어져 있는 두 축을 같은 방향으로 돌려야 할 때 씁니다. 기어를 직접 맞물리면 방향이 반대로 바뀌지만, 벨트나 체인을 쓰면 두 축이 같은 방향으로 돌면서도 멀리 떨어뜨려 배치할 수 있습니다.",
    icon: `<circle cx="26" cy="50" r="20" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="74" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="6"/>
      <line x1="26" y1="30" x2="74" y2="38" stroke="currentColor" stroke-width="5"/>
      <line x1="26" y1="70" x2="74" y2="62" stroke="currentColor" stroke-width="5"/>`,
  },
  joint: {
    label: "유니버설 조인트",
    description: "양쪽 끝에 작은 구슬 모양 관절이 달린 축입니다. 양쪽 끝을 각각 다른 부품의 축 위치에 겹치게 놓으면 회전을 그대로 전달합니다 — 동력전달축과 달리 두 축의 방향이 서로 어긋나 있어도(일직선이 아니어도) 연결되고 회전이 전달됩니다.",
    purpose:
      "실제 자동차의 등속 조인트(CV 조인트)처럼, 서로 각도가 다른 두 축 사이에도 회전을 전달해야 할 때 씁니다. 동력전달축은 두 축이 일직선일 때만 연결되지만, 이 조인트를 쓰면 바퀴가 위아래로 움직이거나 차체가 기울어도 계속 동력이 전달되는 실제 서스펜션 구조를 흉내낼 수 있습니다.",
    icon: `<circle cx="22" cy="30" r="11" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="78" cy="70" r="11" fill="none" stroke="currentColor" stroke-width="5"/>
      <line x1="30" y1="38" x2="70" y2="62" stroke="currentColor" stroke-width="6"/>`,
  },
  bearing: {
    label: "베어링",
    description: "축을 부드럽게 받쳐주는 작은 고리입니다. 다른 기어의 축 위치에 정확히 겹치게 놓으면 그 축에 결합되어 함께 돌지만, 부하(플라이휠)와 달리 가볍고 마모에 영향을 주지 않습니다.",
    purpose:
      "자동차 바퀴 축, 선풍기 모터 축처럼 실제 기계 대부분의 회전축 끝에는 마찰을 줄여주는 베어링이 들어갑니다. 이 샌드박스에서는 뼈대(빔) 위에 축을 가볍게 지지하는 용도로 씁니다 — 무거운 부하 없이 그냥 '여기서 축이 매끄럽게 돈다'는 지점을 표시할 때 적합합니다.",
    icon: `<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="5"/>
      <g fill="currentColor">
        <circle cx="50" cy="24" r="4"/><circle cx="72" cy="37" r="4"/><circle cx="72" cy="63" r="4"/>
        <circle cx="50" cy="76" r="4"/><circle cx="28" cy="63" r="4"/><circle cx="28" cy="37" r="4"/>
      </g>`,
  },
  spring: {
    label: "스프링",
    description: "코일처럼 감긴 유연한 막대입니다. 구조용 빔과 똑같이 양쪽 끝을 다른 부품의 위치에 겹치게 놓으면 그 지점에서 고정되고, 빔·다른 스프링과도 끝을 맞대어 이어붙일 수 있습니다 — 다만 빔처럼 완전히 뻣뻣한 대신, 실제로는 눌리고 늘어나는 부품이라는 뜻으로 표시만 다르게 합니다.",
    purpose:
      "자동차 서스펜션(현가장치)처럼, 뼈대의 특정 부분에 '여기는 완전히 뻣뻣하지 않고 어느 정도 힘을 흡수한다'는 걸 표현할 때 씁니다. 빔으로만 뼈대를 짜면 지나치게 딱딱한 구조가 되지만, 바퀴 쪽 연결에 스프링을 섞으면 실제 자동차 뼈대에 더 가까운 모습이 됩니다.",
    icon: `<path d="M20 20 Q35 20 35 32 Q35 44 50 44 Q65 44 65 56 Q65 68 80 68" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <circle cx="20" cy="20" r="6" fill="currentColor"/><circle cx="80" cy="68" r="6" fill="currentColor"/>`,
  },
  rotor: {
    label: "회전날개(로터)",
    description: "길고 얇은 날개 두 개가 달린 회전 장치입니다. 다른 기어의 축 위치에 겹치게 놓으면 결합되어 그 속도로 돌아갑니다 — 팬(프로펠러)과 같은 방식이지만 날개가 훨씬 길어서 헬리콥터의 주 로터·테일 로터처럼 보입니다.",
    purpose:
      "헬리콥터의 메인 로터(위에서 큰 원을 그리며 도는 날개)나 테일 로터(꼬리에서 옆으로 도는 작은 날개)를 표현할 때 씁니다. 팬은 '회전으로 바람을 만든다'는 걸 보여주는 범용 출력 장치지만, 로터는 그중에서도 특히 헬리콥터를 만들 때 쓰도록 길고 가느다란 모양으로 되어 있습니다.",
    icon: `<circle cx="50" cy="50" r="7" fill="currentColor"/>
      <rect x="8" y="46" width="84" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
      <rect x="46" y="8" width="8" height="84" rx="4" fill="none" stroke="currentColor" stroke-width="4" transform="rotate(35 50 50)"/>`,
  },
  track: {
    label: "무한궤도(탱크 트랙)",
    description: "떨어져 있는 두 바퀴(스프로킷)를 감아 도는 두꺼운 돌기 벨트입니다. 벨트/체인 구동과 똑같은 방식으로 양쪽 끝을 이빨이 있는 기어의 축 위치에 겹치게 놓으면 연결됩니다 — 회전 방향이 그대로 유지되고, 두 바퀴의 잇수 비율만큼 속도가 달라집니다.",
    purpose:
      "탱크나 굴착기처럼 바퀴 대신 무한궤도로 움직이는 차량을 표현할 때 씁니다. 벨트/체인과 물리적인 동작 방식은 완전히 같지만, 두꺼운 돌기(그루서)가 있는 모양이라 '땅을 밟고 나가는 궤도'처럼 보이도록 만들어졌습니다.",
    icon: `<circle cx="26" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="74" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="6"/>
      <path d="M26 30 L74 30 M26 70 L74 70" stroke="currentColor" stroke-width="8"/>
      <g stroke="currentColor" stroke-width="4">
        <line x1="34" y1="26" x2="34" y2="34"/><line x1="50" y1="26" x2="50" y2="34"/><line x1="66" y1="26" x2="66" y2="34"/>
        <line x1="34" y1="66" x2="34" y2="74"/><line x1="50" y1="66" x2="50" y2="74"/><line x1="66" y1="66" x2="66" y2="74"/>
      </g>`,
  },
};
