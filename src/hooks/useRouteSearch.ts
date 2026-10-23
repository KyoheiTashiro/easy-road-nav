import { useEffect } from "react";
import { fetchRoute } from "@/api/graphhopper.ts";
import { isAbortError } from "@/api/timeout.ts";
import {
  MODE,
  getTrip,
  selectProfile,
  selectPointsKey,
  tripActions,
  useTrip,
} from "@/store/trip.ts";

/** ナビ中は探索しない（経路は navigation store が入れる） */
export function useRouteSearch(): void {
  const pointsKey = useTrip(selectPointsKey);
  const notoll = useTrip((state) => state.notoll);
  useEffect(() => {
    const trip = getTrip();
    if (!trip.from || !trip.to || trip.mode === MODE.NAVIGATION) return;
    const abortController = new AbortController();
    fetchRoute(
      [trip.from, ...trip.vias, trip.to],
      selectProfile(trip),
      trip.vias.length === 0,
      abortController.signal,
    ) // 経由地なしのみ代替経路
      .then((routes) => tripActions.routesLoaded(pointsKey, notoll, routes))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        tripActions.routesFailed(pointsKey, notoll);
      });
    return () => abortController.abort();
  }, [pointsKey, notoll]);
}
