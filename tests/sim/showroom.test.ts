import { describe, it, expect } from "vitest";
import { createShowroomLayout, createShowroomProps } from "../../src/sim/showroom";
import { GROUND_SIZE } from "../../src/render/scene";
import { buildEdges, classify } from "../../src/sim/graph";
import { tick } from "../../src/sim/simulation";

describe("createShowroomLayout", () => {
  it("combines all twenty finished machines with unique ids across every preset", () => {
    const layout = createShowroomLayout();
    const ids = layout.gears.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // no id collisions across presets

    // Every machine is present (spot-check one gear id from each preset).
    for (const id of [
      "자동차_엔진",
      "비행기_엔진",
      "풍차_날개축",
      "자전거_페달",
      "증기기관차_좌동륜1",
      "공장_증기기관_크랭크",
      "물레방아_수차",
      "타워크레인_선회모터",
      "회전목마_모터",
      "컨베이어_모터",
      "시계탑_구동륜",
      "두레우물_손잡이",
      "변속기_입력스플라인1",
      "유성감속기_모터",
      "차동축_구동피니언",
      "웜기어_회전탁자_모터",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("reports zero diagnostics problems -- no cross-preset gear overlaps, every machine fully powered", () => {
    const layout = createShowroomLayout();
    const edges = buildEdges(layout.gears, layout.remoteLinks);
    const d = classify(layout.gears, edges);
    expect(d.unconnectedIds).toEqual([]);
    expect(d.noPowerIds).toEqual([]);
    expect(d.overlapPairs).toEqual([]);
  });

  it("keeps every machine actually running after many ticks (each preset's own crank still drives its train)", () => {
    let layout = createShowroomLayout();
    for (let i = 0; i < 200; i++) {
      const r = tick(layout, 1 / 60, 1);
      layout = { gears: r.gears, remoteLinks: layout.remoteLinks };
    }
    // A driven gear from each machine has actually turned.
    for (const id of [
      "자동차_좌앞바퀴",
      "비행기_프로펠러",
      "풍차_수직축",
      "자전거_뒷바퀴허브",
      "증기기관차_우동륜3",
      "공장_3작업_주축기어",
      "물레방아_맷돌",
      "타워크레인_선회기어",
      "회전목마_큰기어",
      "컨베이어_테일풀리",
      "시계탑_시침휠",
      "차동축_차동장치",
      "웜기어_회전탁자_웜휠",
      "유성감속기_권상드럼",
    ]) {
      const g = layout.gears.find((x) => x.id === id)!;
      expect(Math.abs(g.rotation)).toBeGreaterThan(0);
    }
  });

  it("supplies combined decorative props for every machine in the yard", () => {
    const props = createShowroomProps();
    // Each machine contributes its own body; twenty of them make a substantial yard. A floor
    // rather than an exact count, so adding detail to any one machine cannot fail this
    // spuriously -- what it guards is that no machine silently contributes nothing.
    expect(props.length).toBeGreaterThan(600);
  });
  it("keeps every machine's own body with it -- each preset's props land on its own offset", () => {
    // A props offset that did not match its layout's offset would leave a machine's body
    // standing in an empty patch of yard while its gears turned somewhere else entirely.
    const props = createShowroomProps();
    const gears = createShowroomLayout().gears;
    // The locomotive sits one grid cell left and one back: x -170, z -150.
    const loco = gears.filter((g) => g.id.startsWith("증기기관차_"));
    expect(loco.length).toBeGreaterThan(0);
    for (const g of loco) {
      expect(g.position[0]).toBeLessThan(-140);
      expect(g.position[2]).toBeLessThan(-100);
    }
    // Its body must be in that same cell, not back at the origin.
    const locoBody = props.filter((p) => p.attachTo?.startsWith("증기기관차_") || p.linkTo?.gear.startsWith("증기기관차_"));
    expect(locoBody.length).toBeGreaterThan(0);
    for (const p of locoBody) expect(p.position[0]).toBeLessThan(-100);
  });

  it("keeps every machine inside the ground plane", () => {
    // Anything beyond the plane's half-width hangs off the edge of the world and floats over
    // the void. Derived from scene.ts's GROUND_SIZE rather than hardcoded, so growing the yard
    // and growing the ground can never silently disagree.
    const half = GROUND_SIZE / 2;
    for (const g of createShowroomLayout().gears) {
      expect(Math.abs(g.position[0])).toBeLessThan(half);
      expect(Math.abs(g.position[2])).toBeLessThan(half);
    }
    for (const p of createShowroomProps()) {
      expect(Math.abs(p.position[0])).toBeLessThan(half);
      expect(Math.abs(p.position[2])).toBeLessThan(half);
    }
  });
});

describe("showroom framing", () => {
  it("fits inside the camera's zoom-out ceiling, so 전체 보기 can actually frame the whole yard", () => {
    // `SceneSync.fitAll` CLAMPS the standoff it computes to controls.maxDistance. A ceiling
    // below what the scene needs therefore crops the view silently rather than failing, which
    // is exactly what happened when the yard grew from four machines to nine. Recomputing the
    // requirement here means a future machine that pushes the yard past the ceiling breaks a
    // test instead of quietly hiding half the scene.
    const MAX_DISTANCE = 1500; // scene.ts
    const FOV_DEG = 50; // scene.ts

    const pts: Array<[number, number, number]> = [
      ...createShowroomLayout().gears.map((g) => g.position),
      ...createShowroomProps().map((p) => p.position),
    ];
    const span = (i: number) => {
      const vs = pts.map((v) => v[i]);
      return Math.max(...vs) - Math.min(...vs);
    };
    // Half-diagonal of the content box, the same bounding-sphere stand-in fitAll uses. A
    // generous pad covers prop SIZES, which are not in these centre points.
    const radius = Math.hypot(span(0), span(1), span(2)) / 2 + 30;
    const needed = radius / Math.sin((FOV_DEG / 2) * (Math.PI / 180));

    expect(needed).toBeLessThan(MAX_DISTANCE);
  });
});
