import * as stylex from "@stylexjs/stylex";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/map/maplibre.css";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { MODE, useTrip } from "@/trip/trip.ts";
import { button } from "@/shared/button.stylex.ts";
import { colors } from "@/shared/tokens.stylex.ts";
import { DARK_MEDIA_QUERY, STYLE, TOKYO_STATION, applyStyleExtras } from "@/map/mapLayers.ts";
import { LOCATE_ZOOM, useCamera } from "@/map/useCamera.ts";
import { useMapPopup } from "@/map/useMapPopup.tsx";
import { useMarkers } from "@/map/useMarkers.tsx";
import { useRouteLayers } from "@/map/useRouteLayers.ts";
import { LocateIcon } from "@/shared/icons/index.tsx";

const styles = stylex.create({
  map: { position: "fixed", inset: 0 },
  locate: {
    width: 40,
    height: 40,
    paddingBlock: 0, // base の paddingBlock / paddingInline を上書き（shorthand は longhand に負ける）
    paddingInline: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    backgroundColor: colors.background,
    color: colors.accent,
  },
});

export function Map() {
  const mode = useTrip((state) => state.mode);
  const fix = useTrip((state) => state.fix);
  const gpsError = useTrip((state) => state.gpsError);
  const sheetExpanded = useTrip((state) => state.sheetExpanded);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  // 現在地ボタン。縮尺・出典と同じくコントロールに入れ、CSS でシート直上に置く
  const [locateDiv] = useState(() => {
    const div = document.createElement("div");
    div.className = "maplibregl-ctrl";
    return div;
  });

  const layerData = useRouteLayers(map);
  const homeIcon = useMarkers(map);
  const popupContent = useMapPopup(map);
  useCamera(map);

  // 地図は div のマウントで作る。各フックは map を state で受け、生成後に揃って同期する
  const mount = useCallback(
    (container: HTMLDivElement) => {
      const mediaQuery = matchMedia(DARK_MEDIA_QUERY);
      const map = new maplibregl.Map({
        container,
        style: mediaQuery.matches ? STYLE.dark : STYLE.light,
        center: TOKYO_STATION,
        zoom: 10,
        attributionControl: false,
      });

      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      map.addControl(new maplibregl.ScaleControl(), "bottom-left"); // 出典と縦積み。右下だと展開した出典と重なる
      map.addControl(
        { onAdd: () => locateDiv, onRemove: () => locateDiv.remove() },
        "bottom-right",
      );

      map.on("style.load", () => applyStyleExtras(map, layerData.current));
      const onScheme = (event: MediaQueryListEvent) =>
        map.setStyle(event.matches ? STYLE.dark : STYLE.light, { diff: false });
      mediaQuery.addEventListener("change", onScheme);

      setMap(map);
      if (import.meta.env.DEV) (window as { __map?: maplibregl.Map }).__map = map; // 机上確認用

      return () => {
        mediaQuery.removeEventListener("change", onScheme);
        map.remove();
        setMap(null);
      };
    },
    [locateDiv, layerData],
  );

  const locate =
    (mode === MODE.EDIT && !sheetExpanded) || mode === MODE.HOME_SETUP ? (
      <button
        {...stylex.props(button.base, styles.locate)}
        disabled={!fix || gpsError}
        onClick={() => {
          if (map && fix) map.easeTo({ center: fix, zoom: Math.max(map.getZoom(), LOCATE_ZOOM) });
        }}
        aria-label="現在地に戻る"
      >
        <LocateIcon />
      </button>
    ) : null;

  return (
    <>
      <div ref={mount} {...stylex.props(styles.map)} data-mode={mode} />
      {createPortal(locate, locateDiv)}
      {popupContent}
      {homeIcon}
    </>
  );
}
