import { describe, expect, it } from "vitest";
import type { RouteModel } from "@/route/route.ts";
import { getTrip, selectLoading, selectPointsKey, selectRoutes, tripActions } from "@/trip/trip.ts";

function route(distance: number): RouteModel {
  return {
    points: [
      [139, 35],
      [139.01, 35],
    ],
    cumulativeDistances: [0, distance],
    roadClass: [{ from: 0, to: 1, kind: "wide" }],
    toll: [],
    instructions: [],
    viaIndices: [],
    distance,
    time: 0,
  };
}

/** useRouteSearch と同じく、いまの地点集合と有料トグルで探索結果を入れる */
function load(routes: RouteModel[]) {
  const trip = getTrip();
  tripActions.routesLoaded(selectPointsKey(trip), trip.notoll, routes);
}

describe("探索結果", () => {
  it("地点と有料トグルの変化で selectRoutes と fitVersion が切り替わる", () => {
    tripActions.pointSet("from", { lat: 35, lng: 139 }, "A");
    tripActions.pointSet("to", { lat: 35, lng: 139.01 }, "B");
    expect(selectLoading(getTrip())).toBe(true);

    const first = route(1000);
    load([first]);
    expect(selectRoutes(getTrip())).toEqual([first]);
    const fitVersion = getTrip().fitVersion;

    // 有料トグル: 旧結果は出さず、新しい結果ではカメラを動かさない
    tripActions.notollToggled(!getTrip().notoll);
    expect(selectRoutes(getTrip())).toEqual([]);
    expect(selectLoading(getTrip())).toBe(true);

    const toggled = route(1200);
    load([toggled]);
    expect(selectRoutes(getTrip())).toEqual([toggled]);
    expect(getTrip().fitVersion).toBe(fitVersion);

    // 地点集合が変わった探索だけ fitVersion を進める
    tripActions.pointSet("to", { lat: 35, lng: 139.02 }, "C");
    expect(selectRoutes(getTrip())).toEqual([]);

    load([route(2000)]);
    expect(getTrip().fitVersion).toBe(fitVersion + 1);

    // 地点が欠けたら即空
    tripActions.pointDeleted("from");
    expect(selectRoutes(getTrip())).toEqual([]);
    expect(selectLoading(getTrip())).toBe(false);
  });
});
