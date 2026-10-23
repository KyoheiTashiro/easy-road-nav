import { describe, expect, it } from "vitest";
import narrowFixture from "@/route/__fixtures__/narrow.json";
import { entersNarrow, narrowSegments } from "@/route/narrow.ts";
import { fromGraphHopperPath, type GraphHopperPath, type RouteModel } from "@/route/route.ts";

/** 頂点間隔を指定して直線経路を作る。kinds[i] は線分 i の種別 */
function make(gaps: number[], kinds: ("wide" | "narrow")[]): RouteModel {
  const cumulativeDistances = [0];
  for (const gap of gaps) cumulativeDistances.push(cumulativeDistances.at(-1)! + gap);
  const points = cumulativeDistances.map(
    (distance) => [139 + distance / 100_000, 35] as [number, number],
  );

  const roadClass: RouteModel["roadClass"] = [];
  kinds.forEach((kind, i) => {
    const last = roadClass.at(-1);
    if (last && last.kind === kind) last.to = i + 1;
    else roadClass.push({ from: i, to: i + 1, kind });
  });

  return {
    points,
    cumulativeDistances,
    roadClass,
    toll: [],
    instructions: [],
    viaIndices: [],
    distance: cumulativeDistances.at(-1)!,
    time: 0,
  };
}

describe("narrowSegments", () => {
  it("細い道なしは空", () => {
    expect(narrowSegments(make([100, 100], ["wide", "wide"]))).toEqual([]);
  });

  it("隣接する narrow を 1 区間に連結", () => {
    const route = make([100, 40, 40, 100], ["wide", "narrow", "narrow", "wide"]);

    expect(narrowSegments(route)).toEqual([
      { from: 1, to: 3, length: 80, atStart: false, atEnd: false },
    ]);
  });

  it("間の広い道が 50 m 未満なら結合、以上なら分割", () => {
    const merged = make([100, 40, 49, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(merged)).toEqual([
      { from: 1, to: 4, length: 129, atStart: false, atEnd: false },
    ]);

    const split = make([100, 40, 50, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(split).map((segment) => [segment.from, segment.to])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("結合してから短区間無視（結合で 30 m 以上になれば残る）", () => {
    // 20 m + 10 m gap + 20 m → 結合後 50 m。個別だと両方 30 m 未満で消える
    const route = make([100, 20, 10, 20, 100], ["wide", "narrow", "wide", "narrow", "wide"]);

    expect(narrowSegments(route)).toEqual([
      { from: 1, to: 4, length: 50, atStart: false, atEnd: false },
    ]);
  });

  it("30 m 未満は捨て、30 m ちょうどは残す", () => {
    expect(narrowSegments(make([100, 29, 100], ["wide", "narrow", "wide"]))).toEqual([]);
    expect(narrowSegments(make([100, 30, 100], ["wide", "narrow", "wide"]))).toHaveLength(1);
  });

  it("atStart / atEnd", () => {
    const route = make([40, 100, 40], ["narrow", "wide", "narrow"]);
    const segments = narrowSegments(route);

    expect(segments).toEqual([
      { from: 0, to: 1, length: 40, atStart: true, atEnd: false },
      { from: 2, to: 3, length: 40, atStart: false, atEnd: true },
    ]);
  });

  it("全線細い道は atStart かつ atEnd", () => {
    const [segment] = narrowSegments(make([100, 100], ["narrow", "narrow"]));

    expect(segment).toMatchObject({ from: 0, to: 2, atStart: true, atEnd: true });
  });

  it("調整値を引数で変えられる", () => {
    const route = make([100, 40, 50, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);

    expect(narrowSegments(route, 30, 51)).toHaveLength(1);
    expect(narrowSegments(route, 41, 50)).toHaveLength(0);
  });

  it("fixture: 先頭区間は atStart、区間が cumulativeDistances 順に並ぶ", () => {
    const route = fromGraphHopperPath(
      (narrowFixture as unknown as { paths: GraphHopperPath[] }).paths[0]!,
    );
    const segments = narrowSegments(route);

    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0]).toMatchObject({ from: 0, atStart: true });

    for (let i = 1; i < segments.length; i++)
      expect(segments[i]!.from).toBeGreaterThan(segments[i - 1]!.to);

    for (const segment of segments) {
      expect(segment.length).toBeGreaterThanOrEqual(30);
      expect(segment.length).toBeCloseTo(
        route.cumulativeDistances[segment.to]! - route.cumulativeDistances[segment.from]!,
        6,
      );
    }
  });
});

describe("entersNarrow", () => {
  const segments = [{ from: 5, to: 8, length: 100, atStart: false, atEnd: false }];
  const instruction = (from: number, to: number) => ({
    text: "",
    sign: 2,
    streetName: "",
    from,
    to,
    time: 0,
  });

  it("interval 内で区間が始まれば真（from 含む、to 含まず）", () => {
    expect(entersNarrow(instruction(3, 6), segments)).toBe(true);
    expect(entersNarrow(instruction(5, 6), segments)).toBe(true);
    expect(entersNarrow(instruction(2, 5), segments)).toBe(false);
    expect(entersNarrow(instruction(6, 9), segments)).toBe(false);
  });

  it("区間なしは偽", () => {
    expect(entersNarrow(instruction(0, 10), [])).toBe(false);
  });
});
