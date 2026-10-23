import * as stylex from "@stylexjs/stylex";
import maplibregl from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MAX_VIAS, type LatLng } from "@/model/point.ts";
import { MODE, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { PointPopup } from "@/ui/map/PointPopup.tsx";

/** 地図タップの地点ポップアップとマーカーの「削除」ポップアップ。戻り値は中身の portal */
export function useMapPopup(map: maplibregl.Map | null) {
  const mode = useTrip((state) => state.mode);
  const vias = useTrip((state) => state.vias);
  const popup = useTrip((state) => state.popup);
  const sheetExpanded = useTrip((state) => state.sheetExpanded);
  const [popupDiv] = useState(() => document.createElement("div"));
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const onMapClick = useEffectEvent((point: LatLng) => {
    if (mode === MODE.NAVIGATION) return;
    // 展開中は地図を見たい操作とみなし、ポップアップを開かず収納だけ
    if (mode === MODE.EDIT && sheetExpanded) {
      tripActions.setSheet(false);
      return;
    }
    tripActions.popupOpened(point);
  });
  useEffect(() => {
    if (!map) return;
    const onClick = (event: maplibregl.MapMouseEvent) =>
      onMapClick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  useEffect(() => {
    const target = popup?.point;
    if (!map || !target) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }
    let mapPopup = popupRef.current;
    if (!mapPopup) {
      mapPopup = new maplibregl.Popup({ closeOnClick: false, offset: 14, maxWidth: "none" });
      mapPopup.setDOMContent(popupDiv);
      mapPopup.on("close", () => {
        // × ボタン。自前の remove() でも発火するが state は既に null なので無害
        tripActions.popupClosed();
      });
      popupRef.current = mapPopup;
    }
    mapPopup.setLngLat(target);
    if (!mapPopup.isOpen()) mapPopup.addTo(map); // addTo は開いていると remove() → close 発火 → 閉じてしまう
  }, [map, popup, popupDiv]);

  let popupContent: ReactNode = null;
  if (popup?.kind === "point") {
    popupContent = (
      <PointPopup
        mode={mode === MODE.HOME ? MODE.HOME : MODE.EDIT}
        label={popup.label}
        canAddVia={vias.length < MAX_VIAS}
        onAction={tripActions.popupActionTaken}
        onHome={tripActions.popupHomeTaken}
      />
    );
  } else if (popup?.kind === "marker") {
    popupContent = (
      <button {...stylex.props(button.base, button.danger)} onClick={tripActions.markerDeleteTaken}>
        削除
      </button>
    );
  }
  return createPortal(popupContent, popupDiv);
}
