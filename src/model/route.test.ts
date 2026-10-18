import { describe, expect, it } from "vitest";
import narrowFx from "./__fixtures__/narrow.json";
import tollFx from "./__fixtures__/toll.json";
import viaFx from "./__fixtures__/via.json";
import { haversine } from "./geo.ts";
import { fromGhPath, nearest, segmentBearing, tollDistance, type GhPath } from "./route.ts";

// JSON 推論型（number[][]）はタプルと互換がないので unknown 経由で変換
const gh = (fx: unknown, i: number) => (fx as { paths: GhPath[] }).paths[i]!;
const narrowPath = gh(narrowFx, 0);
const narrow = fromGhPath(narrowPath);
const via = fromGhPath(gh(viaFx, 0));
const toll = fromGhPath(gh(tollFx, 2));

describe("fromGhPath", () => {
  it("cum は単調増加、先頭 0、末尾 ≈ distance", () => {
    for (const r of [narrow, via, toll]) {
      expect(r.cum[0]).toBe(0);
      expect(r.cum.length).toBe(r.points.length);
      for (let i = 1; i < r.cum.length; i++) expect(r.cum[i]).toBeGreaterThanOrEqual(r.cum[i - 1]!);
      expect(r.cum.at(-1)).toBeCloseTo(r.distance, -1); // 10 m 以内
    }
  });
  it("roadClass.kind の対応", () => {
    const kinds = new Map(narrowPath.details.road_class.map(([f, , c]) => [f, c]));
    for (const rc of narrow.roadClass) {
      const cls = kinds.get(rc.from)!;
      const expected = ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(cls)
        ? "wide"
        : "narrow";
      expect(rc.kind).toBe(expected);
    }
    expect(narrow.roadClass[0]).toEqual({ from: 0, to: 2, kind: "narrow" }); // service
    expect(narrow.roadClass[2]).toEqual({ from: 4, to: 23, kind: "wide" }); // tertiary
  });
  it("track は forbidden", () => {
    const p = {
      ...narrowPath,
      details: { road_class: [[0, 83, "track"]] as [number, number, string][], toll: [] },
    };
    expect(fromGhPath(p).roadClass[0]?.kind).toBe("forbidden");
  });
  it("roadClass が経路全体を隙間なく覆う", () => {
    for (const r of [narrow, via, toll]) {
      expect(r.roadClass[0]?.from).toBe(0);
      expect(r.roadClass.at(-1)?.to).toBe(r.points.length - 1);
      for (let i = 1; i < r.roadClass.length; i++)
        expect(r.roadClass[i]?.from).toBe(r.roadClass[i - 1]?.to);
    }
  });
  it("viaIndices は sign 5 の from", () => {
    expect(via.viaIndices).toEqual([88]);
    expect(narrow.viaIndices).toEqual([]);
  });
  it("instructions の変換", () => {
    expect(narrow.instructions[1]).toEqual({
      text: "左に曲がる",
      sign: -3,
      streetName: "",
      from: 2,
      to: 4,
      time: 7775,
    });
  });
});

describe("nearest", () => {
  it("経路上の頂点で距離 0、s = cum[i]", () => {
    for (const i of [0, 10, 40, narrow.points.length - 1]) {
      const [lng, lat] = narrow.points[i]!;
      const r = nearest(narrow, { lat, lng });
      expect(r.distanceToRoute).toBeCloseTo(0, 3);
      expect(r.s).toBeCloseTo(narrow.cum[i]!, 3);
    }
  });
  it("線分中点で s が中間、segmentIndex が一致", () => {
    const i = 20;
    const [lng0, lat0] = narrow.points[i]!;
    const [lng1, lat1] = narrow.points[i + 1]!;
    const r = nearest(narrow, { lat: (lat0 + lat1) / 2, lng: (lng0 + lng1) / 2 });
    expect(r.segmentIndex).toBe(i);
    expect(r.s).toBeCloseTo((narrow.cum[i]! + narrow.cum[i + 1]!) / 2, 1);
  });
  it("経路外の点は距離 > 0", () => {
    const [lng, lat] = narrow.points[30]!;
    const p = { lat: lat + 0.002, lng }; // 北へ約 222 m
    const r = nearest(narrow, p);
    expect(r.distanceToRoute).toBeGreaterThan(100);
  });
});

describe("segmentBearing", () => {
  it("頂点間の方位", () => {
    const [lng0, lat0] = narrow.points[0]!;
    const [lng1, lat1] = narrow.points[1]!;
    const b = segmentBearing(narrow, 0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(lat1).toBeGreaterThan(lat0); // 北東向き
    expect(lng1).toBeGreaterThan(lng0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(90);
  });
});

describe("tollDistance", () => {
  it("有料なしは 0", () => {
    expect(tollDistance(narrow)).toBe(0);
    expect(tollDistance(via)).toBe(0);
  });
  it("toll all の範囲の合計", () => {
    const expected = toll.toll
      .filter((t) => t.value === "all")
      .reduce((s, t) => s + toll.cum[t.to]! - toll.cum[t.from]!, 0);
    expect(toll.toll.some((t) => t.value === "all")).toBe(true);
    expect(tollDistance(toll)).toBeCloseTo(expected, 6);
    expect(tollDistance(toll)).toBeGreaterThan(1000);
    // 範囲内の頂点間 haversine の和と一致
    const first = toll.toll.find((t) => t.value === "all")!;
    let sum = 0;
    for (let i = first.from; i < first.to; i++) {
      const [lng0, lat0] = toll.points[i]!;
      const [lng1, lat1] = toll.points[i + 1]!;
      sum += haversine({ lat: lat0, lng: lng0 }, { lat: lat1, lng: lng1 });
    }
    expect(toll.cum[first.to]! - toll.cum[first.from]!).toBeCloseTo(sum, 6);
  });
});
