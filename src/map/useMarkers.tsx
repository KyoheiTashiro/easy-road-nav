import maplibregl from "maplibre-gl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ROLE, type Point, type PointRole } from "@/shared/point.ts";
import { useSaved } from "@/settings/saved.ts";
import { MODE, tripActions, useTrip } from "@/trip/trip.ts";
import { HomeIcon } from "@/shared/icons/index.tsx";
import { homeMarkerElement, markerElement } from "@/map/mapLayers.ts";
import { marker } from "@/shared/tokens.stylex.ts";

/** 地点マーカーと自宅マーカー。戻り値は自宅アイコンの portal */
export function useMarkers(map: maplibregl.Map | null) {
  const mode = useTrip((state) => state.mode);
  const from = useTrip((state) => state.from);
  const to = useTrip((state) => state.to);
  const vias = useTrip((state) => state.vias);
  const home = useSaved((state) => state.home); // 全モードで表示
  const [homeDiv] = useState(homeMarkerElement);

  useEffect(() => {
    if (!map || mode === MODE.HOME_SETUP) return;

    const markerDefinitions: {
      point: Point;
      color: string;
      text: string;
      role: PointRole;
      index: number;
    }[] = [];

    if (from)
      markerDefinitions.push({
        point: from,
        color: marker.from,
        text: "",
        role: ROLE.FROM,
        index: 0,
      });

    vias.forEach((via, i) =>
      markerDefinitions.push({
        point: via,
        color: marker.via,
        text: String(i + 1),
        role: ROLE.VIA,
        index: i,
      }),
    );

    if (to)
      markerDefinitions.push({
        point: to,
        color: marker.to,
        text: "",
        role: ROLE.TO,
        index: 0,
      });

    const markers = markerDefinitions.map(({ point, color, text, role, index }) =>
      new maplibregl.Marker({
        element: markerElement(color, text, () =>
          tripActions.markerPopupOpened(role, index, point),
        ),
      })
        .setLngLat(point)
        .addTo(map),
    );

    return () => {
      for (const existingMarker of markers) existingMarker.remove();
    };
  }, [map, from, to, vias, mode]);

  useEffect(() => {
    if (!map || !home) return;
    const homeMarker = new maplibregl.Marker({ element: homeDiv }).setLngLat(home).addTo(map);
    return () => {
      homeMarker.remove();
    };
  }, [map, home, homeDiv]);

  return createPortal(<HomeIcon size={18} />, homeDiv);
}
