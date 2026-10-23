import * as stylex from "@stylexjs/stylex";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/ui/map/maplibre.css";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { NavigationState } from "@/model/progress.ts";
import { MAX_VIAS, ROLE, type LatLng, type Point, type PointRole } from "@/model/point.ts";
import { navigationActions, useNavigation } from "@/store/navigation.ts";
import { useSaved } from "@/store/saved.ts";
import { MODE, URL_HAD_POINTS, selectRoutes, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { layout } from "@/ui/layout.stylex.ts";
import { colors, marker } from "@/ui/tokens.stylex.ts";
import {
  DARK_MEDIA_QUERY,
  EMPTY,
  EMPTY_FIX,
  STYLE,
  TOKYO_STATION,
  alternativeFeatures,
  applyStyleExtras,
  bounds,
  fixFeatures,
  homeMarkerElement,
  markerElement,
  routeFeatures,
  setSourceData,
} from "@/ui/map/mapLayers.ts";
import { PointPopup } from "@/ui/map/PointPopup.tsx";
import { HomeIcon, LocateIcon } from "@/ui/icons/index.tsx";

/** ナビ中のカメラ pitch（navigation.md「カメラ」節。zoom は store/navigation.ts の NAVIGATION_ZOOM） */
export const NAVIGATION_PITCH = 50;

const LOCATE_ZOOM = 15;

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
  const navigation = useNavigation((state) => state.navigation);
  const from = useTrip((state) => state.from);
  const to = useTrip((state) => state.to);
  const vias = useTrip((state) => state.vias);
  const home = useSaved((state) => state.home); // 自宅マーカー。全モードで表示
  const fix = useTrip((state) => state.fix);
  const gpsError = useTrip((state) => state.gpsError);
  const routes = useTrip(selectRoutes);
  const selected = useTrip((state) => state.selected);
  const fitVersion = useTrip((state) => state.fitVersion);
  const popup = useTrip((state) => state.popup);
  const panTarget = useTrip((state) => state.panTarget);
  const sheetExpanded = useTrip((state) => state.sheetExpanded);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [popupDiv] = useState(() => document.createElement("div"));
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [homeDiv] = useState(homeMarkerElement);
  // 現在地ボタン。縮尺・出典と同じくコントロールに入れ、CSS でシート直上に置く
  const [locateDiv] = useState(() => {
    const div = document.createElement("div");
    div.className = "maplibregl-ctrl";
    return div;
  });
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);
  // 方位アイコン（押下で北上）。ナビ中は heading 追従と衝突するので外す
  const compassRef = useRef(
    new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }),
  );
  // style.load 時に最新データで source を作り直すため ref に持つ
  const dataRef = useRef({ route: EMPTY, alternative: EMPTY, fix: EMPTY_FIX });
  const easedToFix = useRef(false);

  // 一度だけ登録する map イベントから最新の mode を読む
  const onMapClick = useEffectEvent((point: LatLng) => {
    if (mode === MODE.NAVIGATION) return;
    // 展開中は地図を見たい操作とみなし、ポップアップを開かず収納だけ
    if (mode === MODE.EDIT && sheetExpanded) {
      tripActions.setSheet(false);
      return;
    }
    tripActions.popupOpened(point);
  });
  const onMapDragStart = useEffectEvent(() => {
    if (mode === MODE.NAVIGATION) navigationActions.setFollow(false);
  });
  const onMapZoomEnd = useEffectEvent((zoom: number) => {
    if (mode === MODE.NAVIGATION) navigationActions.setZoom(zoom);
  });

  useEffect(() => {
    const mediaQuery = matchMedia(DARK_MEDIA_QUERY);
    const map = new maplibregl.Map({
      container: container.current!,
      style: mediaQuery.matches ? STYLE.dark : STYLE.light,
      center: TOKYO_STATION,
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left"); // 出典と縦積み。右下だと展開した出典と重なる
    map.addControl(compassRef.current, "top-left");
    map.addControl({ onAdd: () => locateDiv, onRemove: () => locateDiv.remove() }, "bottom-right");
    map.on("style.load", () => applyStyleExtras(map, dataRef.current));
    map.on("click", (event) => onMapClick({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    map.on("dragstart", (event) => {
      const originalEvent = event.originalEvent;
      if (originalEvent && "touches" in originalEvent && originalEvent.touches.length > 1) return; // ピンチ中のパンは追従解除しない
      onMapDragStart();
    });
    map.on("zoomend", (event) => {
      // originalEvent なし = easeTo 等プログラム由来
      if (event.originalEvent) onMapZoomEnd(map.getZoom());
    });
    const onScheme = (event: MediaQueryListEvent) =>
      map.setStyle(event.matches ? STYLE.dark : STYLE.light, { diff: false });
    mediaQuery.addEventListener("change", onScheme);
    mapRef.current = map;
    if (import.meta.env.DEV) (window as { __map?: maplibregl.Map }).__map = map; // 机上確認用
    return () => {
      mediaQuery.removeEventListener("change", onScheme);
      map.remove();
      mapRef.current = null;
    };
  }, [locateDiv]);

  useEffect(() => {
    const hide = mode === MODE.HOME;
    const route = hide ? undefined : routes[selected];
    const data = {
      route: route ? routeFeatures(route) : EMPTY,
      alternative: hide ? EMPTY : alternativeFeatures(routes, selected),
    };
    dataRef.current = { ...dataRef.current, ...data };
    setSourceData(mapRef.current, "route", data.route);
    setSourceData(mapRef.current, "alternative", data.alternative);
  }, [routes, selected, mode]);

  // 初回 fix: URL に地点があれば探索後の fitBounds を優先し easeTo しない
  useEffect(() => {
    const data = fixFeatures(fix);
    dataRef.current = { ...dataRef.current, fix: data };
    const map = mapRef.current;
    setSourceData(map, "fix", data);
    if (map && fix && !easedToFix.current) {
      easedToFix.current = true;
      if (!URL_HAD_POINTS) map.easeTo({ center: fix, zoom: 15 });
    }
  }, [fix]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const existingMarker of markersRef.current) existingMarker.remove();
    markersRef.current = [];
    if (mode === MODE.HOME) return;
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
    markersRef.current = markerDefinitions.map(({ point, color, text, role, index }) =>
      new maplibregl.Marker({
        element: markerElement(color, text, () =>
          tripActions.markerPopupOpened(role, index, point),
        ),
      })
        .setLngLat(point)
        .addTo(map),
    );
  }, [from, to, vias, mode]);

  useEffect(() => {
    const map = mapRef.current;
    homeMarkerRef.current?.remove();
    homeMarkerRef.current =
      map && home ? new maplibregl.Marker({ element: homeDiv }).setLngLat(home).addTo(map) : null;
  }, [home, homeDiv]);

  useEffect(() => {
    const map = mapRef.current;
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
  }, [popup, popupDiv]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && panTarget)
      map.easeTo({ center: panTarget, zoom: Math.max(map.getZoom(), LOCATE_ZOOM) });
  }, [panTarget]);

  // 自宅設定モードに入ったら登録済みの自宅へ（home の変更ではカメラを動かさない）
  const easeToHome = useEffectEvent((map: maplibregl.Map) => {
    if (home) map.easeTo({ center: home, zoom: 15 });
  });
  // ナビ開始・終了: ジェスチャ制限とパディング（現在地を画面下 1/3 に置く）。fitVersion effect より前に置く
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === MODE.NAVIGATION) {
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
      map.dragRotate.disable();
      map.removeControl(compassRef.current);
      const containerHeight = map.getContainer().clientHeight;
      map.jumpTo({
        pitch: NAVIGATION_PITCH,
        padding: {
          top: Math.round(containerHeight / 3),
          bottom: layout.navigationBar,
          left: 0,
          right: 0,
        },
      });
    } else {
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.dragRotate.enable();
      if (!map.hasControl(compassRef.current)) map.addControl(compassRef.current, "top-left");
      map.jumpTo({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    if (mode === MODE.HOME) easeToHome(map);
  }, [mode]);

  // 追従: navigation が更新されるたび（= 受理した fix ごと・follow/zoom 変更）に easeTo。heading null なら bearing 据え置き。
  // fix は navigation と同時に更新されるので依存にしない（二重 easeTo 防止）
  const followFix = useEffectEvent((map: maplibregl.Map, navigationState: NavigationState) => {
    if (!fix) return;
    map.easeTo({
      center: fix,
      zoom: navigationState.zoom,
      bearing: navigationState.heading ?? map.getBearing(),
      duration: 600,
    });
  });
  useEffect(() => {
    const map = mapRef.current;
    if (map && mode === MODE.NAVIGATION && navigation?.follow) followFix(map, navigation);
  }, [navigation, mode]);

  // 選択経路に fitBounds。下パディングはシートの高さに追従。selected は意図的に依存にしない: 代替切替でカメラを動かさない（ui.md「探索」）
  const fitSelected = useEffectEvent(() => {
    const route = routes[selected];
    const map = mapRef.current;
    if (!route || !map || mode !== MODE.EDIT) return;
    const sheet = sheetExpanded
      ? Math.round((map.getContainer().clientHeight * layout.half) / 100)
      : layout.peek;
    map.fitBounds(bounds(route), { padding: { top: 40, left: 40, right: 40, bottom: sheet + 40 } });
  });
  useEffect(() => {
    if (fitVersion > 0) fitSelected();
  }, [fitVersion]);
  // シート開閉で見える範囲が変わるので収め直す
  useEffect(() => {
    fitSelected();
  }, [sheetExpanded]);

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

  const locate =
    (mode === MODE.EDIT && !sheetExpanded) || mode === MODE.HOME ? (
      <button
        {...stylex.props(button.base, styles.locate)}
        disabled={!fix || gpsError}
        onClick={() => {
          const map = mapRef.current;
          if (map && fix) map.easeTo({ center: fix, zoom: Math.max(map.getZoom(), LOCATE_ZOOM) });
        }}
        aria-label="現在地に戻る"
      >
        <LocateIcon />
      </button>
    ) : null;

  return (
    <>
      <div ref={container} {...stylex.props(styles.map)} data-mode={mode} />
      {createPortal(locate, locateDiv)}
      {createPortal(popupContent, popupDiv)}
      {createPortal(<HomeIcon size={18} />, homeDiv)}
    </>
  );
}
