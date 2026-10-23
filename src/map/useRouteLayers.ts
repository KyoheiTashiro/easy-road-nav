import type maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MODE, selectRoutes, useTrip } from "@/trip/trip.ts";
import {
  EMPTY,
  EMPTY_FIX,
  alternativeFeatures,
  fixFeatures,
  routeFeatures,
  setSourceData,
} from "@/map/mapLayers.ts";

/** 経路・代替・現在地の source を store に合わせる。戻り値は style.load で source を作り直すときの最新データ */
export function useRouteLayers(map: maplibregl.Map | null) {
  const mode = useTrip((state) => state.mode);
  const routes = useTrip(selectRoutes);
  const selected = useTrip((state) => state.selected);
  const fix = useTrip((state) => state.fix);
  const dataRef = useRef({ route: EMPTY, alternative: EMPTY, fix: EMPTY_FIX });

  useEffect(() => {
    const hide = mode === MODE.HOME_SETUP;
    const route = hide ? undefined : routes[selected];
    const data = {
      route: route ? routeFeatures(route) : EMPTY,
      alternative: hide ? EMPTY : alternativeFeatures(routes, selected),
    };

    dataRef.current = { ...dataRef.current, ...data };
    setSourceData(map, "route", data.route);
    setSourceData(map, "alternative", data.alternative);
  }, [map, routes, selected, mode]);

  useEffect(() => {
    const data = fixFeatures(fix);
    dataRef.current = { ...dataRef.current, fix: data };
    setSourceData(map, "fix", data);
  }, [map, fix]);

  return dataRef;
}
