import { describe, expect, it } from "vitest";
import narrowFixture from "@/model/__fixtures__/narrow.json";
import tollFixture from "@/model/__fixtures__/toll.json";
import viaFixture from "@/model/__fixtures__/via.json";
import { haversine } from "@/model/geo.ts";
import {
  forkSign,
  fromGraphHopperPath,
  nearest,
  segmentBearing,
  tollDistance,
  turnCount,
  type GraphHopperPath,
} from "@/model/route.ts";

// JSON 推論型（number[][]）はタプルと互換がないので unknown 経由で変換
const pathOf = (fixture: unknown, i: number) => (fixture as { paths: GraphHopperPath[] }).paths[i]!;
const narrowPath = pathOf(narrowFixture, 0);
const narrow = fromGraphHopperPath(narrowPath);
const via = fromGraphHopperPath(pathOf(viaFixture, 0));
const toll = fromGraphHopperPath(pathOf(tollFixture, 2));

describe("fromGraphHopperPath", () => {
  it("cumulativeDistances は単調増加、先頭 0、末尾 ≈ distance", () => {
    for (const route of [narrow, via, toll]) {
      expect(route.cumulativeDistances[0]).toBe(0);
      expect(route.cumulativeDistances.length).toBe(route.points.length);
      for (let i = 1; i < route.cumulativeDistances.length; i++)
        expect(route.cumulativeDistances[i]).toBeGreaterThanOrEqual(
          route.cumulativeDistances[i - 1]!,
        );
      expect(route.cumulativeDistances.at(-1)).toBeCloseTo(route.distance, -1); // 10 m 以内
    }
  });
  it("roadClass.kind の対応", () => {
    const kinds = new Map(
      narrowPath.details.road_class.map(([from, , roadClassName]) => [from, roadClassName]),
    );
    for (const roadClass of narrow.roadClass) {
      const roadClassName = kinds.get(roadClass.from)!;
      const expected = ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(
        roadClassName,
      )
        ? "wide"
        : "narrow";
      expect(roadClass.kind).toBe(expected);
    }
    expect(narrow.roadClass[0]).toEqual({ from: 0, to: 2, kind: "narrow" }); // service
    expect(narrow.roadClass[2]).toEqual({ from: 4, to: 23, kind: "wide" }); // tertiary
  });
  it("track は forbidden", () => {
    const trackPath = {
      ...narrowPath,
      details: { road_class: [[0, 83, "track"]] as [number, number, string][], toll: [] },
    };
    expect(fromGraphHopperPath(trackPath).roadClass[0]?.kind).toBe("forbidden");
  });
  it("roadClass が経路全体を隙間なく覆う", () => {
    for (const route of [narrow, via, toll]) {
      expect(route.roadClass[0]?.from).toBe(0);
      expect(route.roadClass.at(-1)?.to).toBe(route.points.length - 1);
      for (let i = 1; i < route.roadClass.length; i++)
        expect(route.roadClass[i]?.from).toBe(route.roadClass[i - 1]?.to);
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
  it("経路上の頂点で距離 0、s = cumulativeDistances[i]", () => {
    for (const i of [0, 10, 40, narrow.points.length - 1]) {
      const [lng, lat] = narrow.points[i]!;
      const result = nearest(narrow, { lat, lng });
      expect(result.distanceToRoute).toBeCloseTo(0, 3);
      expect(result.s).toBeCloseTo(narrow.cumulativeDistances[i]!, 3);
    }
  });
  it("線分中点で s が中間、segmentIndex が一致", () => {
    const i = 20;
    const [lng0, lat0] = narrow.points[i]!;
    const [lng1, lat1] = narrow.points[i + 1]!;
    const result = nearest(narrow, { lat: (lat0 + lat1) / 2, lng: (lng0 + lng1) / 2 });
    expect(result.segmentIndex).toBe(i);
    expect(result.s).toBeCloseTo(
      (narrow.cumulativeDistances[i]! + narrow.cumulativeDistances[i + 1]!) / 2,
      1,
    );
  });
  it("経路外の点は距離 > 0", () => {
    const [lng, lat] = narrow.points[30]!;
    const point = { lat: lat + 0.002, lng }; // 北へ約 222 m
    const result = nearest(narrow, point);
    expect(result.distanceToRoute).toBeGreaterThan(100);
  });
});

describe("segmentBearing", () => {
  it("頂点間の方位", () => {
    const [lng0, lat0] = narrow.points[0]!;
    const [lng1, lat1] = narrow.points[1]!;
    const bearing = segmentBearing(narrow, 0);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
    expect(lat1).toBeGreaterThan(lat0); // 北東向き
    expect(lng1).toBeGreaterThan(lng0);
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(90);
  });
});

describe("turnCount", () => {
  it("直進・経由地・目的地・寄りを除いた案内地点の数", () => {
    const expected = via.instructions.filter(
      (instruction) =>
        instruction.sign !== 0 &&
        instruction.sign !== 4 &&
        instruction.sign !== 5 &&
        Math.abs(instruction.sign) !== 7,
    ).length;
    expect(expected).toBeGreaterThan(0);
    expect(via.instructions.some((instruction) => instruction.sign === 5)).toBe(true);
    expect(turnCount(via)).toBe(expected);
  });
});

describe("tollDistance", () => {
  it("有料なしは 0", () => {
    expect(tollDistance(narrow)).toBe(0);
    expect(tollDistance(via)).toBe(0);
  });
  it("toll all の範囲の合計", () => {
    const expected = toll.toll
      .filter((range) => range.value === "all")
      .reduce(
        (total, range) =>
          total + toll.cumulativeDistances[range.to]! - toll.cumulativeDistances[range.from]!,
        0,
      );
    expect(toll.toll.some((range) => range.value === "all")).toBe(true);
    expect(tollDistance(toll)).toBeCloseTo(expected, 6);
    expect(tollDistance(toll)).toBeGreaterThan(1000);
    // 範囲内の頂点間 haversine の和と一致
    const first = toll.toll.find((range) => range.value === "all")!;
    let sum = 0;
    for (let i = first.from; i < first.to; i++) {
      const [lng0, lat0] = toll.points[i]!;
      const [lng1, lat1] = toll.points[i + 1]!;
      sum += haversine({ lat: lat0, lng: lng0 }, { lat: lat1, lng: lng1 });
    }
    expect(toll.cumulativeDistances[first.to]! - toll.cumulativeDistances[first.from]!).toBeCloseTo(
      sum,
      6,
    );
  });
});

describe("forkSign", () => {
  // bearings 昇順。in は後方（進行方向 + 180）
  it("進行方向の近くに別の進入可能な道 → 他方が右なら左寄り、左なら右寄り", () => {
    expect(forkSign({ bearings: [0, 30, 180], entries: [true, true, false], in: 2, out: 0 })).toBe(
      -7,
    );
    expect(forkSign({ bearings: [0, 30, 180], entries: [true, true, false], in: 2, out: 1 })).toBe(
      7,
    );
  });
  it("直角の脇道・進入不可・in は無視", () => {
    expect(
      forkSign({ bearings: [0, 90, 180, 270], entries: [true, true, false, true], in: 2, out: 0 }),
    ).toBe(0);
    expect(forkSign({ bearings: [0, 20, 180], entries: [true, false, false], in: 2, out: 0 })).toBe(
      0,
    );
    expect(forkSign({ bearings: [0, 180], entries: [true, false], in: 1, out: 0 })).toBe(0);
  });
  it("北をまたぐ方位差", () => {
    expect(
      forkSign({ bearings: [10, 170, 350], entries: [true, false, true], in: 1, out: 2 }),
    ).toBe(-7); // 350 → 10 は右
  });
});

describe("fromGraphHopperPath 分岐合成", () => {
  const fork = { bearings: [0, 30, 180], entries: [true, true, false], in: 2, out: 0 };
  const path = {
    ...narrowPath,
    details: {
      ...narrowPath.details,
      intersection: [[10, 11, fork]] as [number, number, typeof fork][],
    },
  };
  it("指示の途中なら分割し時間を距離比で配分、末尾側が左寄り", () => {
    const route = fromGraphHopperPath(path);
    const original = narrowPath.instructions.find(
      (instruction) => instruction.interval[0] <= 10 && 10 < instruction.interval[1],
    )!;
    const splitIndex = route.instructions.findIndex((instruction) => instruction.from === 10);
    expect(route.instructions[splitIndex - 1]).toMatchObject({
      from: original.interval[0],
      to: 10,
      sign: original.sign,
    });
    expect(route.instructions[splitIndex]).toMatchObject({
      from: 10,
      to: original.interval[1],
      sign: -7,
      text: "左寄り",
    });
    expect(
      route.instructions[splitIndex - 1]!.time + route.instructions[splitIndex]!.time,
    ).toBeCloseTo(original.time, 6);
    expect(route.instructions.length).toBe(narrow.instructions.length + 1);
    for (let i = 1; i < route.instructions.length; i++)
      expect(route.instructions[i]!.from).toBe(route.instructions[i - 1]!.to);
  });
  it("既に案内地点なら何もしない、出発地は無視", () => {
    const turn = narrowPath.instructions.find(
      (instruction) => instruction.sign !== 0 && instruction.sign !== 4,
    )!;
    const route = fromGraphHopperPath({
      ...path,
      details: {
        ...path.details,
        intersection: [
          [0, 1, fork],
          [turn.interval[0], turn.interval[0] + 1, fork],
        ],
      },
    });
    expect(route.instructions).toEqual(narrow.instructions);
  });
});
