import { describe, expect, it, vi } from "vitest";
import { fetchRoute } from "@/api/graphhopper.ts";
import { destination } from "@/model/geo.ts";
import type { Fix } from "@/model/point.ts";
import type { RouteModel } from "@/model/route.ts";
import { getNav, navActions } from "@/store/nav.ts";
import { getTrip, tripActions } from "@/store/trip.ts";

vi.mock("@/api/graphhopper.ts", () => ({ fetchRoute: vi.fn() }));
const fetchMock = vi.mocked(fetchRoute);

/** 東西 1 km の直線経路（緯度 35、経度 1 度 ≈ 91.3 km）。案内地点は末尾の到着のみ */
function straight(len = 1000): RouteModel {
  const n = 10;
  const cum = Array.from({ length: n + 1 }, (_, i) => (len * i) / n);
  const points = cum.map((c) => [139 + c / 91_300, 35] as [number, number]);
  const ins = (sign: number, from: number, to: number) => ({
    text: "",
    sign,
    streetName: "",
    from,
    to,
    time: 0,
  });
  return {
    points,
    cum,
    roadClass: [{ from: 0, to: n, kind: "wide" }],
    toll: [],
    instructions: [ins(0, 0, n), ins(4, n, n)],
    viaIndices: [],
    distance: len,
    time: 0,
  };
}

/** 経路上の累積距離 s の fix。north > 0 で北へ横ずれ（m） */
function fixAt(s: number, north = 0): Fix {
  let p = { lat: 35, lng: 139 + s / 91_300 };
  if (north) p = destination(p, 0, north);
  return { ...p, accuracy: 10, t: s };
}

/** useGeolocation と同じ順で両 store へ */
function gps(fix: Fix) {
  tripActions.fixUpdated(fix);
  navActions.onFix(fix);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("navActions", () => {
  it("開始 → 経路外れ 3 回でリルート → 到着で終了", async () => {
    fetchMock.mockResolvedValue([straight()]);
    tripActions.pointSet("to", { lat: 35, lng: 139 + 1000 / 91_300 }, "B");
    gps(fixAt(0));

    await navActions.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTrip().mode).toBe("nav");
    expect(getTrip().from?.label).toBe("現在地");
    expect(getNav().nav?.s).toBe(0);

    gps(fixAt(100));
    expect(getNav().nav?.s).toBeCloseTo(100, 0);
    expect(getNav().hud?.remaining).toBeCloseTo(900, 0);

    // 100 m 北に外れたまま 3 fix 移動 → リルート要求 1 回
    for (const s of [120, 140, 160]) gps(fixAt(s, 100));
    expect(getNav().nav?.rerouting).toBe(true);
    expect(getNav().nav?.offRouteCount).toBe(3);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toHaveLength(2); // 前方オフセットした出発地 + 到着地
    expect(getNav().nav?.rerouting).toBe(false);
    expect(getNav().nav?.s).toBe(0); // 新経路で初期化

    gps(fixAt(500));
    expect(getNav().nav?.s).toBeCloseTo(500, 0);
    gps(fixAt(990)); // 残り 10 m < 到着判定 30 m
    expect(getTrip().mode).toBe("edit");
    expect(getNav().nav).toBeNull();
    expect(getNav().hud).toBeNull();
  });
});
