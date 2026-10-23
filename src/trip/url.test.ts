import { describe, expect, it } from "vitest";
import { buildQuery, parseQuery } from "@/trip/url.ts";

describe("parseQuery", () => {
  it("全部なしは空", () => {
    expect(parseQuery("")).toEqual({ from: null, to: null, vias: [], notoll: true });
    expect(parseQuery("?")).toEqual({ from: null, to: null, vias: [], notoll: true });
  });

  it("from / to / via / notoll", () => {
    expect(parseQuery("?from=35.1,139.2&to=35.3,139.4&via=35.5,139.6|35.7,139.8&notoll=0")).toEqual(
      {
        from: { lat: 35.1, lng: 139.2 },
        to: { lat: 35.3, lng: 139.4 },
        vias: [
          { lat: 35.5, lng: 139.6 },
          { lat: 35.7, lng: 139.8 },
        ],
        notoll: false,
      },
    );
  });

  it("URL エンコード済みも読める", () => {
    expect(parseQuery("?via=35.5%2C139.6%7C35.7%2C139.8").vias).toHaveLength(2);
  });

  it("不正な地点は個別に無視", () => {
    const query = parseQuery("?from=abc&to=35.3,139.4&via=1,2,3|91,0|35.5,139.6|0,181|x,y|35.7,");

    expect(query.from).toBeNull();
    expect(query.to).toEqual({ lat: 35.3, lng: 139.4 });
    expect(query.vias).toEqual([{ lat: 35.5, lng: 139.6 }]);
  });

  it("notoll は 0 のみ偽（既定は避ける、旧 notoll=1 も真）", () => {
    expect(parseQuery("?notoll=0").notoll).toBe(false);
    expect(parseQuery("?notoll=1").notoll).toBe(true);
    expect(parseQuery("?notoll=true").notoll).toBe(true);
  });

  it("via 6 件目以降は切り捨て", () => {
    const via = Array.from({ length: 7 }, (_, i) => `35,${139 + i}`).join("|");
    const query = parseQuery(`?via=${via}`);

    expect(query.vias).toHaveLength(5);
    expect(query.vias[4]).toEqual({ lat: 35, lng: 143 });
  });
});

describe("buildQuery", () => {
  it("全部なしは空文字", () => {
    expect(buildQuery({ from: null, to: null, vias: [], notoll: true })).toBe("");
  });

  it("toFixed(5)、notoll true は省略", () => {
    expect(
      buildQuery({
        from: { lat: 35.123456, lng: 139.1 },
        to: null,
        vias: [{ lat: 35.5, lng: 139.6 }],
        notoll: true,
      }),
    ).toBe("?from=35.12346,139.10000&via=35.50000,139.60000");
  });

  it("往復で一致", () => {
    const query = {
      from: { lat: 35.12345, lng: 139.12345 },
      to: { lat: 35.3, lng: 139.4 },
      vias: [
        { lat: 35.5, lng: 139.6 },
        { lat: 35.7, lng: 139.8 },
      ],
      notoll: false,
    };

    expect(parseQuery(buildQuery(query))).toEqual(query);
  });
});
