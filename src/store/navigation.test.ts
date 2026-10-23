import { describe, expect, it, vi } from "vitest";
import { fetchRoute } from "@/api/graphhopper.ts";
import { destination } from "@/model/geo.ts";
import type { Fix } from "@/model/point.ts";
import type { RouteModel } from "@/model/route.ts";
import { getNavigation, navigationActions } from "@/store/navigation.ts";
import { getTrip, tripActions } from "@/store/trip.ts";

vi.mock("@/api/graphhopper.ts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRoute: vi.fn(),
}));
const fetchMock = vi.mocked(fetchRoute);

/** 東西 1 km の直線経路（緯度 35、経度 1 度 ≈ 91.3 km）。案内地点は末尾の到着のみ */
function straight(length = 1000): RouteModel {
  const segmentCount = 10;
  const cumulativeDistances = Array.from(
    { length: segmentCount + 1 },
    (_, i) => (length * i) / segmentCount,
  );
  const points = cumulativeDistances.map(
    (distance) => [139 + distance / 91_300, 35] as [number, number],
  );
  const instruction = (sign: number, from: number, to: number) => ({
    text: "",
    sign,
    streetName: "",
    from,
    to,
    time: 0,
  });
  return {
    points,
    cumulativeDistances,
    roadClass: [{ from: 0, to: segmentCount, kind: "wide" }],
    toll: [],
    instructions: [instruction(0, 0, segmentCount), instruction(4, segmentCount, segmentCount)],
    viaIndices: [],
    distance: length,
    time: 0,
  };
}

/** 経路上の累積距離 s の fix。north > 0 で北へ横ずれ（m） */
function fixAt(s: number, north = 0): Fix {
  let point = { lat: 35, lng: 139 + s / 91_300 };
  if (north) point = destination(point, 0, north);
  return { ...point, accuracy: 10, timestamp: s };
}

/** useGeolocation と同じ順で両 store へ */
function gps(fix: Fix) {
  tripActions.fixUpdated(fix);
  navigationActions.onFix(fix);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("navigationActions", () => {
  it("開始 → 経路外れ 3 回でリルート → 到着で終了", async () => {
    fetchMock.mockResolvedValue([straight()]);
    tripActions.pointSet("to", { lat: 35, lng: 139 + 1000 / 91_300 }, "B");
    gps(fixAt(0));

    await navigationActions.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTrip().mode).toBe("navigation");
    expect(getTrip().from?.label).toBe("現在地");
    expect(getNavigation().navigation?.s).toBe(0);

    gps(fixAt(100));
    expect(getNavigation().navigation?.s).toBeCloseTo(100, 0);
    expect(getNavigation().hud?.remaining).toBeCloseTo(900, 0);

    // 100 m 北に外れたまま 3 fix 移動 → リルート要求 1 回
    for (const s of [120, 140, 160]) gps(fixAt(s, 100));
    expect(getNavigation().navigation?.rerouting).toBe(true);
    expect(getNavigation().navigation?.offRouteCount).toBe(3);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toHaveLength(2); // 前方オフセットした出発地 + 到着地
    expect(getNavigation().navigation?.rerouting).toBe(false);
    expect(getNavigation().navigation?.s).toBe(0); // 新経路で初期化

    gps(fixAt(500));
    expect(getNavigation().navigation?.s).toBeCloseTo(500, 0);
    gps(fixAt(990)); // 残り 10 m < 到着判定 30 m
    expect(getTrip().mode).toBe("edit");
    expect(getNavigation().navigation).toBeNull();
    expect(getNavigation().hud).toBeNull();
  });

  it("リルートの fetch が打ち切られたら rerouting を戻し旧経路で継続", async () => {
    fetchMock.mockResolvedValue([straight()]);
    tripActions.pointSet("to", { lat: 35, lng: 139 + 1000 / 91_300 }, "B");
    gps(fixAt(0));
    await navigationActions.start();

    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    for (const s of [120, 140, 160]) gps(fixAt(s, 100));
    expect(getNavigation().navigation?.rerouting).toBe(true);
    await flush();
    expect(getNavigation().navigation?.rerouting).toBe(false);
    expect(getNavigation().navigation?.offRouteCount).toBe(0);
    expect(getTrip().mode).toBe("navigation");
    navigationActions.end(true);
  });

  it("開始の応答待ちに地点が変わったら開始しない", async () => {
    let resolve!: (routes: RouteModel[]) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    tripActions.pointSet("to", { lat: 35, lng: 139 + 1000 / 91_300 }, "B");
    gps(fixAt(0));
    const starting = navigationActions.start();

    tripActions.pointSet("to", { lat: 35, lng: 139 + 2000 / 91_300 }, "C");
    resolve([straight()]);
    await starting;
    expect(getTrip().mode).toBe("edit");
    expect(getNavigation().navigation).toBeNull();
    expect(getNavigation().starting).toBe(false);
  });

  it("リルートをまたいで経由地を通過しても trip.passedVia が積み上がる", async () => {
    fetchMock.mockResolvedValueOnce([{ ...straight(), viaIndices: [3, 7] }]);
    tripActions.pointSet("to", { lat: 35, lng: 139 + 1000 / 91_300 }, "B");
    tripActions.viaAdded({ lat: 35, lng: 139 + 300 / 91_300, label: "V1" });
    tripActions.viaAdded({ lat: 35, lng: 139 + 700 / 91_300, label: "V2" });
    gps(fixAt(0));
    await navigationActions.start();

    gps(fixAt(350));
    expect(getTrip().passedVia).toBe(1);

    fetchMock.mockResolvedValueOnce([{ ...straight(), viaIndices: [5] }]);
    for (const s of [370, 390, 410]) gps(fixAt(s, 100));
    await flush();
    expect(fetchMock.mock.lastCall![0]).toHaveLength(3); // 出発地 + 未通過の V2 + 到着地
    expect(getTrip().passedVia).toBe(1);

    gps(fixAt(600));
    expect(getTrip().passedVia).toBe(2);
    navigationActions.end(true);
    expect(getTrip().passedVia).toBe(2); // 編集モードの「通過済」表示
  });
});
