import type { LatLng } from "@/model/point.ts";
import { withTimeout } from "@/api/timeout.ts";
import { fromGraphHopperPath, type GraphHopperPath, type RouteModel } from "@/model/route.ts";

export const PROFILE = { CAR: "car", NOTOLL: "car_notoll" } as const;
export type Profile = (typeof PROFILE)[keyof typeof PROFILE];

/** 400 の message（"Cannot find point" 等）。ネットワーク不達は fetch の TypeError のまま */
export class RouteError extends Error {}

/** points は 出発地 → 経由地 → 到着地。alternatives は vias.length === 0 のとき true。10 秒で TimeoutError */
export async function fetchRoute(
  points: LatLng[],
  profile: Profile,
  alternatives: boolean,
  signal?: AbortSignal,
): Promise<RouteModel[]> {
  // 契約は docs/design/route-model.md
  const body = {
    profile,
    points: points.map((point) => [point.lng, point.lat]),
    points_encoded: false,
    elevation: false,
    instructions: true,
    locale: "ja",
    details: ["road_class", "toll", "intersection"], // intersection は分岐検出（route-model.md）
    snap_preventions: ["tunnel", "bridge", "ferry"],
    ...(alternatives ? { algorithm: "alternative_route", "alternative_route.max_paths": 3 } : {}),
  };
  const response = await fetch("/gh/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: withTimeout(signal),
  });
  if (!response.ok) {
    const message = await response
      .json()
      .then((errorBody: { message?: string }) => errorBody.message)
      .catch(() => undefined);
    throw new RouteError(message ?? `HTTP ${response.status}`);
  }
  const json = (await response.json()) as { paths: GraphHopperPath[] };
  return json.paths.map(fromGraphHopperPath);
}
