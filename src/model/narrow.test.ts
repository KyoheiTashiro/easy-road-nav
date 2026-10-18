import { describe, expect, it } from "vitest";
import narrowFx from "./__fixtures__/narrow.json";
import { entersNarrow, narrowSegments } from "./narrow.ts";
import { fromGhPath, type GhPath, type RouteModel } from "./route.ts";

/** 頂点間隔を指定して直線経路を作る。kinds[i] は線分 i の種別 */
function make(gaps: number[], kinds: ("wide" | "narrow" | "forbidden")[]): RouteModel {
  const cum = [0];
  for (const g of gaps) cum.push(cum.at(-1)! + g);
  const points = cum.map((c) => [139 + c / 100_000, 35] as [number, number]);
  const roadClass: RouteModel["roadClass"] = [];
  kinds.forEach((kind, i) => {
    const last = roadClass.at(-1);
    if (last && last.kind === kind) last.to = i + 1;
    else roadClass.push({ from: i, to: i + 1, kind });
  });
  return {
    points,
    cum,
    roadClass,
    toll: [],
    instructions: [],
    viaIndices: [],
    distance: cum.at(-1)!,
    time: 0,
  };
}

describe("narrowSegments", () => {
  it("細い道なしは空", () => {
    expect(narrowSegments(make([100, 100], ["wide", "wide"]))).toEqual([]);
  });

  it("隣接する narrow を 1 区間に連結", () => {
    const r = make([100, 40, 40, 100], ["wide", "narrow", "narrow", "wide"]);
    expect(narrowSegments(r)).toEqual([
      { from: 1, to: 3, length: 80, atStart: false, atEnd: false },
    ]);
  });

  it("間の広い道が 50 m 未満なら結合、以上なら分割", () => {
    const merged = make([100, 40, 49, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(merged)).toEqual([
      { from: 1, to: 4, length: 129, atStart: false, atEnd: false },
    ]);
    const split = make([100, 40, 50, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(split).map((s) => [s.from, s.to])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("結合してから短区間無視（結合で 30 m 以上になれば残る）", () => {
    // 20 m + 10 m gap + 20 m → 結合後 50 m。個別だと両方 30 m 未満で消える
    const r = make([100, 20, 10, 20, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(r)).toEqual([
      { from: 1, to: 4, length: 50, atStart: false, atEnd: false },
    ]);
  });

  it("30 m 未満は捨て、30 m ちょうどは残す", () => {
    expect(narrowSegments(make([100, 29, 100], ["wide", "narrow", "wide"]))).toEqual([]);
    expect(narrowSegments(make([100, 30, 100], ["wide", "narrow", "wide"]))).toHaveLength(1);
  });

  it("forbidden は細い道として扱う", () => {
    const r = make([100, 40, 40, 100], ["wide", "forbidden", "narrow", "wide"]);
    expect(narrowSegments(r).map((s) => [s.from, s.to])).toEqual([[1, 3]]);
  });

  it("atStart / atEnd", () => {
    const r = make([40, 100, 40], ["narrow", "wide", "narrow"]);
    const segs = narrowSegments(r);
    expect(segs).toEqual([
      { from: 0, to: 1, length: 40, atStart: true, atEnd: false },
      { from: 2, to: 3, length: 40, atStart: false, atEnd: true },
    ]);
  });

  it("全線細い道は atStart かつ atEnd", () => {
    const [s] = narrowSegments(make([100, 100], ["narrow", "narrow"]));
    expect(s).toMatchObject({ from: 0, to: 2, atStart: true, atEnd: true });
  });

  it("調整値を引数で変えられる", () => {
    const r = make([100, 40, 50, 40, 100], ["wide", "narrow", "wide", "narrow", "wide"]);
    expect(narrowSegments(r, 30, 51)).toHaveLength(1);
    expect(narrowSegments(r, 41, 50)).toHaveLength(0);
  });

  it("fixture: 先頭区間は atStart、区間が cum 順に並ぶ", () => {
    const route = fromGhPath((narrowFx as unknown as { paths: GhPath[] }).paths[0]!);
    const segs = narrowSegments(route);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs[0]).toMatchObject({ from: 0, atStart: true });
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toBeGreaterThan(segs[i - 1]!.to);
    for (const s of segs) {
      expect(s.length).toBeGreaterThanOrEqual(30);
      expect(s.length).toBeCloseTo(route.cum[s.to]! - route.cum[s.from]!, 6);
    }
  });
});

describe("entersNarrow", () => {
  const segs = [{ from: 5, to: 8, length: 100, atStart: false, atEnd: false }];
  const instr = (from: number, to: number) => ({
    text: "",
    sign: 2,
    streetName: "",
    from,
    to,
    time: 0,
  });
  it("interval 内で区間が始まれば真（from 含む、to 含まず）", () => {
    expect(entersNarrow(instr(3, 6), segs)).toBe(true);
    expect(entersNarrow(instr(5, 6), segs)).toBe(true);
    expect(entersNarrow(instr(2, 5), segs)).toBe(false);
    expect(entersNarrow(instr(6, 9), segs)).toBe(false);
  });
  it("区間なしは偽", () => {
    expect(entersNarrow(instr(0, 10), [])).toBe(false);
  });
});
