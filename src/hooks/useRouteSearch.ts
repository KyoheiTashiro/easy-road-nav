import { useEffect } from "react";
import { fetchRoute } from "@/api/graphhopper.ts";
import { getTrip, selectProfile, selectReqKey, tripActions, useTrip } from "@/store/trip.ts";

/** 地点集合・notoll が変わるたびに探索。飛行中は abort。ナビ中は探索しない（経路は nav store が入れる） */
export function useRouteSearch(): void {
  const reqKey = useTrip(selectReqKey);
  useEffect(() => {
    const s = getTrip();
    if (!s.from || !s.to || s.mode === "nav") return;
    const ac = new AbortController();
    fetchRoute([s.from, ...s.vias, s.to], selectProfile(s), s.vias.length === 0, ac.signal) // 経由地なしのみ代替経路
      .then((routes) => tripActions.routesLoaded(reqKey, routes))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        tripActions.routesFailed(reqKey);
      });
    return () => ac.abort();
  }, [reqKey]);
}
