import { useEffect } from "react";
import { fetchRoute } from "@/api/graphhopper.ts";
import {
  MODE,
  getTrip,
  selectProfile,
  selectRequestKey,
  tripActions,
  useTrip,
} from "@/store/trip.ts";

/** ナビ中は探索しない（経路は navigation store が入れる） */
export function useRouteSearch(): void {
  const requestKey = useTrip(selectRequestKey);
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
      .then((routes) => tripActions.routesLoaded(requestKey, routes))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        tripActions.routesFailed(requestKey);
      });
    return () => abortController.abort();
  }, [requestKey]);
}
