import { useEffect } from "react";
import { fetchRoute } from "@/route/graphhopper.ts";
import { isAbortError } from "@/shared/timeout.ts";
import {
  MODE,
  getTrip,
  selectLoading,
  selectProfile,
  selectPointsKey,
  tripActions,
  useTrip,
} from "@/trip/trip.ts";

/** ナビ中は探索しない（経路は navigation store が入れる） */
export function useRouteSearch(): void {
  const pointsKey = useTrip(selectPointsKey);
  const notoll = useTrip((state) => state.notoll);
  const navigating = useTrip((state) => state.mode === MODE.NAVIGATION);

  useEffect(() => {
    const trip = getTrip();
    if (!trip.from || !trip.to || navigating || !selectLoading(trip)) return;

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
  }, [pointsKey, notoll, navigating]);
}
