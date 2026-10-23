import { describe, expect, it } from "vitest";
import narrowFixture from "@/route/__fixtures__/narrow.json";
import viaFixture from "@/route/__fixtures__/via.json";
import { destination, haversine } from "@/shared/geo.ts";
import { narrowSegments, type NarrowSegment } from "@/route/narrow.ts";
import {
  initNavigation,
  offsetOrigin,
  remainingTime,
  startText,
  step,
  type NavigationEvent,
  type NavigationState,
} from "@/navigation/progress.ts";
import type { Fix } from "@/shared/point.ts";
import {
  fromGraphHopperPath,
  segmentBearing,
  type GraphHopperPath,
  type RouteModel,
} from "@/route/route.ts";

const pathOf = (fixture: unknown, i: number) => (fixture as { paths: GraphHopperPath[] }).paths[i]!;
const narrowRoute = fromGraphHopperPath(pathOf(narrowFixture, 0));
const narrowSegmentList = narrowSegments(narrowRoute);
const viaRoute = fromGraphHopperPath(pathOf(viaFixture, 0));

/** 累積距離 s の経路上の点から fix を作る。lateral > 0 で進行方向右へ横ずれ */
function fixAt(route: RouteModel, s: number, lateral = 0, accuracy = 10): Fix {
  const { cumulativeDistances, points } = route;
  let i = 0;
  while (i + 2 < points.length && cumulativeDistances[i + 1]! <= s) i++;

  const length = cumulativeDistances[i + 1]! - cumulativeDistances[i]!;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, (s - cumulativeDistances[i]!) / length));
  const [lng0, lat0] = points[i]!;
  const [lng1, lat1] = points[i + 1]!;
  let point = { lat: lat0 + (lat1 - lat0) * t, lng: lng0 + (lng1 - lng0) * t };

  if (lateral !== 0) point = destination(point, segmentBearing(route, i) + 90, lateral);
  return { ...point, accuracy, timestamp: s };
}

/** 直線経路。gaps[i] = 線分 i の長さ m、instructionDefinitions = [sign, from, to] */
function make(gaps: number[], instructionDefinitions: [number, number, number][]): RouteModel {
  const cumulativeDistances = [0];
  for (const gap of gaps) cumulativeDistances.push(cumulativeDistances.at(-1)! + gap);
  // 緯度 35 で経度 1 度 ≈ 91.3 km。nearest は線分内の比で s を出すので厳密でなくてよい
  const points = cumulativeDistances.map(
    (distance) => [139 + distance / 91_300, 35] as [number, number],
  );

  return {
    points,
    cumulativeDistances,
    roadClass: [{ from: 0, to: cumulativeDistances.length - 1, kind: "wide" }],
    toll: [],
    instructions: instructionDefinitions.map(([sign, from, to]) => ({
      text: "",
      sign,
      streetName: "",
      from,
      to,
      time: (cumulativeDistances[to]! - cumulativeDistances[from]!) * 100, // 10 m/s
    })),
    viaIndices: instructionDefinitions
      .filter((definition) => definition[0] === 5)
      .map((definition) => definition[1]),
    distance: cumulativeDistances.at(-1)!,
    time: 0,
  };
}

/** fix 列を順に流し、各 fix の events を返す */
function run(
  route: RouteModel,
  narrow: NarrowSegment[],
  fixes: Fix[],
  initialState = initNavigation(16),
) {
  let state = initialState;
  const all: NavigationEvent[][] = [];

  for (const fix of fixes) {
    const result = step(route, narrow, state, fix);
    state = result.state;
    all.push(result.events);
  }

  return { state, all };
}

const speaks = (events: NavigationEvent[]) =>
  events.filter((event) => event.type === "speak").map((event) => event.text);
const types = (events: NavigationEvent[]) => events.map((event) => event.type);

// 頂点 0 — 1000 — 2000 — 3000 — 3100 — 4000。右折 @1000、左折 @2000、右折 @3000、左折 @3100（間隔 100）
const basic = make(
  [1000, 1000, 1000, 100, 900],
  [
    [0, 0, 1],
    [2, 1, 2],
    [-2, 2, 3],
    [2, 3, 4],
    [-2, 4, 5],
    [4, 5, 5],
  ],
);

describe("step: 進捗", () => {
  it("state は毎回新オブジェクト、s は単調増加（後戻りは据え置き）", () => {
    const initialState = initNavigation(16);
    const first = step(basic, [], initialState, fixAt(basic, 500));
    expect(first.state).not.toBe(initialState);
    expect(first.state.s).toBeCloseTo(500, 0);

    const second = step(basic, [], first.state, fixAt(basic, 400));
    expect(second.state).not.toBe(first.state);
    expect(second.state.s).toBeCloseTo(500, 0);
    expect(second.state.segmentIndex).toBe(first.state.segmentIndex);
    expect(second.state.heading).toBe(first.state.heading);
    expect(types(second.events)).toContain("hud"); // 据え置きでも hud は出す
  });

  it("精度 50 m 以上は events 空、lastFix も更新しない", () => {
    const result = step(basic, [], initNavigation(16), fixAt(basic, 500, 0, 50));

    expect(result.events).toEqual([]);
    expect(result.state.lastFix).toBeNull();
    expect(result.state.s).toBe(0);
  });

  it("heading は乗っている線分の方位、lastFix は fix", () => {
    const fix = fixAt(basic, 500);
    const result = step(basic, [], initNavigation(16), fix);

    expect(result.state.heading).toBeCloseTo(segmentBearing(basic, 0), 6);
    expect(result.state.lastFix).toBe(fix);
    expect(result.state.offRouteCount).toBe(0);
  });
});

describe("step: 案内地点", () => {
  it("予告 → 直前の順、各 1 回", () => {
    const { all } = run(
      basic,
      [],
      [650, 700, 800, 900, 950, 960, 1100].map((s) => fixAt(basic, s)),
    );

    expect(all.map(speaks)).toEqual([
      [],
      ["300 メートル先、右方向です"],
      [],
      [],
      ["まもなく右方向です"],
      [],
      [],
    ]);
  });

  it("1 fix で 300 と 50 を飛び越えたら直前のみ", () => {
    const { all } = run(
      basic,
      [],
      [600, 960].map((s) => fixAt(basic, s)),
    );

    expect(all.map(speaks)).toEqual([[], ["まもなく右方向です"]]);
  });

  it("直前の案内地点との間隔が 300 m 未満なら予告なし", () => {
    // 3000 の右折（間隔 1000）は予告あり、3100 の左折（間隔 100）は直前のみ
    const { all } = run(
      basic,
      [],
      [2700, 2960, 3010, 3060].map((s) => fixAt(basic, s)),
    );

    expect(all.map(speaks)).toEqual([
      ["300 メートル先、右方向です"],
      ["まもなく右方向です"],
      [],
      ["まもなく左方向です"],
    ]);
  });

  it("sign 0 は案内地点にしない。hud は毎 fix 次の案内地点", () => {
    const result = step(basic, [], initNavigation(16), fixAt(basic, 100));
    const hud = result.events.find((event) => event.type === "hud")!;

    expect(hud.instruction?.sign).toBe(2);
    expect(hud.remaining).toBeCloseTo(900, 0);
  });

  it("次の次: 次の案内地点から 1 km 以内なら next、超えたら null", () => {
    const nearHud = step(basic, [], initNavigation(16), fixAt(basic, 100)).events.find(
      (event) => event.type === "hud",
    )!;
    expect(nearHud.next?.instruction.sign).toBe(-2);
    expect(nearHud.next?.distance).toBeCloseTo(1000, 0);

    const far = make(
      [500, 2000, 500],
      [
        [2, 1, 2],
        [-2, 2, 3],
        [4, 3, 3],
      ],
    );

    const farHud = step(far, [], initNavigation(16), fixAt(far, 100)).events.find(
      (event) => event.type === "hud",
    )!;
    expect(farHud.instruction?.sign).toBe(2);
    expect(farHud.next).toBeNull();
  });

  it("案内地点が残っていなければ instruction null", () => {
    const route = make([1000], [[0, 0, 1]]);

    const hud = step(route, [], initNavigation(16), fixAt(route, 100)).events.find(
      (event) => event.type === "hud",
    )!;

    expect(hud.instruction).toBeNull();
    expect(hud.remaining).toBeCloseTo(900, 0);
  });
});

describe("step: 経由地・到着", () => {
  it("経由地通過（fixture via）", () => {
    const viaDistance = viaRoute.cumulativeDistances[viaRoute.viaIndices[0]!]!;

    const { state, all } = run(
      viaRoute,
      [],
      [viaDistance - 100, viaDistance - 20, viaDistance + 10, viaDistance + 50].map((s) =>
        fixAt(viaRoute, s),
      ),
    );

    // 経由地の 78 m 手前に左折あり（間隔 < 300 → 経由地の予告はなし）
    expect(all.map(speaks)).toEqual([
      ["まもなく左方向です"],
      ["まもなく経由地です"],
      ["経由地を通過しました"],
      [],
    ]);
    expect(all[2]!.find((event) => event.type === "viaPassed")).toEqual({
      type: "viaPassed",
      index: 0,
    });
    expect(state.passedVia).toBe(1);
  });

  it("1 fix で複数経由地を越えたら viaPassed は全部、発話は 1 回", () => {
    const route = make(
      [100, 100, 500],
      [
        [0, 0, 1],
        [5, 1, 1],
        [5, 2, 2],
        [4, 3, 3],
      ],
    );

    const events = step(route, [], initNavigation(16), fixAt(route, 250)).events;

    expect(
      events.filter((event) => event.type === "viaPassed").map((event) => event.index),
    ).toEqual([0, 1]);
    expect(speaks(events)).toEqual(["経由地を通過しました"]);
  });

  it("到着: 残り 30 m 未満で arrived、以降の手順なし（fixture narrow）", () => {
    const end = narrowRoute.distance;

    const events = step(
      narrowRoute,
      narrowSegmentList,
      initNavigation(16),
      fixAt(narrowRoute, end - 20),
    ).events;

    expect(events).toEqual([{ type: "speak", text: "目的地に到着しました" }, { type: "arrived" }]);
  });
});

describe("step: 細い道（fixture narrow）", () => {
  // narrowSegmentList: [0,4] atStart、[78,83] atEnd（開始 ≈ 5903 m）
  const warnAt = narrowRoute.cumulativeDistances[narrowSegmentList[1]!.from]!;

  it("先頭区間は警告しない、走行中バナーは出す", () => {
    expect(narrowSegmentList[0]!.atStart).toBe(true);

    const events = step(
      narrowRoute,
      narrowSegmentList,
      initNavigation(16),
      fixAt(narrowRoute, 10),
    ).events;

    expect(speaks(events).filter((text) => text.includes("細い道"))).toEqual([]);
    expect(events.find((event) => event.type === "narrow")).toEqual({
      type: "narrow",
      segment: narrowSegmentList[0],
    });
  });

  it("末尾区間は「目的地付近」文言、1 回だけ。区間外は narrow null", () => {
    const { all } = run(
      narrowRoute,
      narrowSegmentList,
      [warnAt - 400, warnAt - 250, warnAt - 100].map((s) => fixAt(narrowRoute, s)),
    );

    expect(all.map(speaks)).toEqual([
      [],
      ["この先細い道、目的地付近です"],
      [], // 次の案内地点 U ターン @5903 は直前の右折 @5613 と 290 m → 予告なし
    ]);
    expect(all[0]!.find((event) => event.type === "narrow")).toEqual({
      type: "narrow",
      segment: null,
    });
  });

  it("通常区間の文言、発話順は 案内 → 細い道", () => {
    // 0—1000 広い道、1000—1100 細い道、右折 @1000
    const route = make(
      [1000, 100, 1000],
      [
        [0, 0, 1],
        [2, 1, 2],
        [4, 3, 3],
      ],
    );
    route.roadClass = [
      { from: 0, to: 1, kind: "wide" },
      { from: 1, to: 2, kind: "narrow" },
      { from: 2, to: 3, kind: "wide" },
    ];

    const segments = narrowSegments(route);
    expect(segments).toHaveLength(1);

    const events = step(route, segments, initNavigation(16), fixAt(route, 750)).events;
    expect(speaks(events)).toEqual(["300 メートル先、右方向です", "この先、細い道です"]);

    const inside = step(route, segments, initNavigation(16), fixAt(route, 1050)).events;
    expect(inside.find((event) => event.type === "narrow")).toEqual({
      type: "narrow",
      segment: segments[0],
    });
  });
});

describe("step: 経路外れ", () => {
  it("連続 3 回で reroute 1 回だけ、rerouting 中は再発火しない。進捗は止まる", () => {
    const on = fixAt(basic, 500);
    const off = [510, 520, 530, 540, 550].map((s) => fixAt(basic, s, 80));

    const { state, all } = run(basic, [], [on, ...off]);

    expect(all.map(types)).toEqual([["hud", "narrow"], [], [], ["reroute"], [], []]);
    expect(state.rerouting).toBe(true);
    expect(state.offRouteCount).toBe(5);
    expect(state.s).toBeCloseTo(500, 0);
  });

  it("経路外れ中の heading は fix 方位（移動 5 m 以上のみ更新）", () => {
    const first = step(basic, [], initNavigation(16), fixAt(basic, 500, 80));
    expect(first.state.heading).toBeNull(); // lastFix なし → lastFix のみ
    expect(first.state.lastFix).not.toBeNull();

    const second = step(basic, [], first.state, fixAt(basic, 503, 80)); // 3 m
    expect(second.state.heading).toBeNull();
    expect(second.state.lastFix).toBe(first.state.lastFix);

    const third = step(basic, [], second.state, fixAt(basic, 520, 80)); // 20 m
    expect(third.state.heading).toBeCloseTo(segmentBearing(basic, 0), 0);
  });

  it("停車中（移動 5 m 未満）は外れを数えない。出発前に経路から離れていても reroute しない", () => {
    const parked = fixAt(basic, 0, 80);

    const { state, all } = run(basic, [], [parked, parked, parked, parked, parked]);
    expect(all.flat().map((event) => event.type)).not.toContain("reroute");
    expect(state.offRouteCount).toBe(0);

    const moved = step(basic, [], state, fixAt(basic, 10, 80));
    expect(moved.state.offRouteCount).toBe(1);
  });

  it("経路内に戻ると offRouteCount 0、heading は線分方位", () => {
    const { state } = run(
      basic,
      [],
      [fixAt(basic, 500, 80), fixAt(basic, 500, 80), fixAt(basic, 600)],
    );

    expect(state.offRouteCount).toBe(0);
    expect(state.s).toBeCloseTo(600, 0);
    expect(state.heading).toBeCloseTo(segmentBearing(basic, 0), 6);
  });

  it("50 m ちょうどは経路内", () => {
    const result = step(basic, [], initNavigation(16), fixAt(basic, 500, 49));

    expect(result.state.offRouteCount).toBe(0);
  });
});

describe("remainingTime / startText / offsetOrigin", () => {
  it("remainingTime: 乗っている指示の比例分 + 以降の合計", () => {
    // basic: 各指示 10 m/s → 全体 4000 m = 400 s
    expect(remainingTime(basic, 0)).toBeCloseTo(400_000, 0);
    expect(remainingTime(basic, 500)).toBeCloseTo(350_000, 0);
    expect(remainingTime(basic, 4000)).toBe(0);
  });

  it("startText", () => {
    expect(startText(basic, 0)).toBe("この先 1 キロ、右方向です");
    expect(startText(basic, 850)).toBe("この先 200 メートル、右方向です");
    expect(startText(viaRoute, 0)).toBe("この先 1.2 キロ、左方向です");
  });

  it("offsetOrigin: heading null はそのまま、あれば 30 m 前方", () => {
    const fix = fixAt(basic, 500);
    expect(offsetOrigin(fix, null)).toEqual({ lat: fix.lat, lng: fix.lng });

    const origin = offsetOrigin(fix, 90);
    expect(haversine(fix, origin)).toBeCloseTo(30, 3);
    expect(origin.lng).toBeGreaterThan(fix.lng);
  });

  it("initNavigation", () => {
    const state: NavigationState = initNavigation(17, false);

    expect(state).toMatchObject({
      s: 0,
      heading: null,
      passedVia: 0,
      rerouting: false,
      zoom: 17,
      follow: false,
    });
    expect(initNavigation(16).follow).toBe(true);
  });
});
