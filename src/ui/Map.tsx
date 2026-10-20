import * as stylex from "@stylexjs/stylex";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavState } from "@/model/progress.ts";
import { MAX_VIAS, type LatLng, type Point, type PointRole } from "@/model/point.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { useSaved } from "@/store/saved.ts";
import { URL_HAD_POINTS, selectRoutes, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { layout } from "@/ui/layout.stylex.ts";
import {
  DARK_MQ,
  EMPTY,
  EMPTY_FIX,
  MARKER_COLOR,
  STYLE,
  TOKYO_STATION,
  altFeatures,
  applyStyleExtras,
  bounds,
  fixFeatures,
  homeMarkerElement,
  markerElement,
  routeFeatures,
} from "@/ui/mapLayers.ts";
import { PointPopup } from "@/ui/PointPopup.tsx";
import { HomeIcon } from "@/ui/icons.tsx";

/** ナビ中のカメラ pitch（nav.md「カメラ」節。zoom は store/nav.ts の NAV_ZOOM） */
export const NAV_PITCH = 50;

const styles = stylex.create({ map: { position: "fixed", inset: 0 } });

export function Map() {
  const mode = useTrip((s) => s.mode);
  const nav = useNav((s) => s.nav); // follow / heading / zoom を読む
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const vias = useTrip((s) => s.vias);
  const home = useSaved((s) => s.home); // 自宅マーカー。全モードで表示
  const fix = useTrip((s) => s.fix);
  const routes = useTrip(selectRoutes);
  const selected = useTrip((s) => s.selected);
  const fitVersion = useTrip((s) => s.fitVersion); // 増えたら選択経路に fitBounds
  const popup = useTrip((s) => s.popup);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // マーカータップで開く「削除」ポップアップ（地点ポップアップとは排他）
  const [markerPopup, setMarkerPopup] = useState<{ p: LatLng; role: PointRole } | null>(null);
  const [popupDiv] = useState(() => document.createElement("div"));
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // 自宅マーカー: HomeIcon を portal で描く要素を Marker に渡す
  const [homeDiv] = useState(homeMarkerElement);
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);
  // 方位アイコン（押下で北上）。ナビ中は heading 追従と衝突するので外す
  const compassRef = useRef(
    new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }),
  );
  // style.load 時に最新データで source を作り直すため ref に持つ
  const dataRef = useRef({ route: EMPTY, alt: EMPTY, fix: EMPTY_FIX });
  const easedToFix = useRef(false);

  // 一度だけ登録する map イベントから最新の mode を読む
  const onMapClick = useEffectEvent((p: LatLng) => {
    if (mode === "nav") return;
    setMarkerPopup(null);
    tripActions.popupOpened(p);
  });
  const onMapDragStart = useEffectEvent(() => {
    if (mode === "nav") navActions.setFollow(false);
  });
  const onMapZoomEnd = useEffectEvent((zoom: number) => {
    if (mode === "nav") navActions.setZoom(zoom);
  });

  useEffect(() => {
    const mq = matchMedia(DARK_MQ);
    const map = new maplibregl.Map({
      container: container.current!,
      style: mq.matches ? STYLE.dark : STYLE.light,
      center: TOKYO_STATION,
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left"); // 出典と縦積み。右下だと展開した出典と重なる
    map.addControl(compassRef.current, "top-right");
    map.on("style.load", () => applyStyleExtras(map, dataRef.current));
    map.on("click", (e) => onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.on("dragstart", (e) => {
      const oe = e.originalEvent;
      if (oe && "touches" in oe && oe.touches.length > 1) return; // ピンチ中のパンは追従解除しない
      onMapDragStart();
    });
    map.on("zoomend", (e) => {
      // originalEvent なし = easeTo 等プログラム由来
      if (e.originalEvent) onMapZoomEnd(map.getZoom());
    });
    const onScheme = (e: MediaQueryListEvent) =>
      map.setStyle(e.matches ? STYLE.dark : STYLE.light, { diff: false });
    mq.addEventListener("change", onScheme);
    mapRef.current = map;
    if (import.meta.env.DEV) (window as { __map?: maplibregl.Map }).__map = map; // 机上確認用
    return () => {
      mq.removeEventListener("change", onScheme);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const route = routes[selected];
    const data = {
      route: route ? routeFeatures(route) : EMPTY,
      alt: altFeatures(routes, selected),
    };
    dataRef.current = { ...dataRef.current, ...data };
    const map = mapRef.current;
    (map?.getSource("route") as GeoJSONSource | undefined)?.setData(data.route);
    (map?.getSource("alt") as GeoJSONSource | undefined)?.setData(data.alt);
  }, [routes, selected]);

  // 現在地。初回 fix で URL に地点が無ければ easeTo（あれば探索後の fitBounds が優先）
  useEffect(() => {
    const data = fixFeatures(fix);
    dataRef.current = { ...dataRef.current, fix: data };
    const map = mapRef.current;
    (map?.getSource("fix") as GeoJSONSource | undefined)?.setData(data);
    if (map && fix && !easedToFix.current) {
      easedToFix.current = true;
      if (!URL_HAD_POINTS) map.easeTo({ center: fix, zoom: 15 });
    }
  }, [fix]);

  // 地点マーカー: 変化のたびに作り直す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markersRef.current) m.remove();
    const specs: { p: Point; color: string; text: string; role: PointRole }[] = [];
    if (from) specs.push({ p: from, color: MARKER_COLOR.from, text: "", role: "from" });
    vias.forEach((p, i) =>
      specs.push({ p, color: MARKER_COLOR.via, text: String(i + 1), role: { via: i } }),
    );
    if (to) specs.push({ p: to, color: MARKER_COLOR.to, text: "", role: "to" });
    markersRef.current = specs.map(({ p, color, text, role }) =>
      new maplibregl.Marker({
        element: markerElement(color, text, () => {
          tripActions.popupClosed();
          setMarkerPopup({ p, role });
        }),
      })
        .setLngLat(p)
        .addTo(map),
    );
  }, [from, to, vias]);

  useEffect(() => {
    const map = mapRef.current;
    homeMarkerRef.current?.remove();
    homeMarkerRef.current =
      map && home ? new maplibregl.Marker({ element: homeDiv }).setLngLat(home).addTo(map) : null;
  }, [home, homeDiv]);

  // ポップアップ 1 個。地点ポップアップ優先、どちらも無ければ remove
  useEffect(() => {
    const map = mapRef.current;
    const target = popup?.p ?? markerPopup?.p;
    if (!map || !target) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }
    let pp = popupRef.current;
    if (!pp) {
      pp = new maplibregl.Popup({ closeOnClick: false, offset: 14, maxWidth: "none" });
      pp.setDOMContent(popupDiv);
      pp.on("close", () => {
        // × ボタン。自前の remove() でも発火するが state は既に null なので無害
        tripActions.popupClosed();
        setMarkerPopup(null);
      });
      popupRef.current = pp;
    }
    pp.setLngLat(target);
    if (!pp.isOpen()) pp.addTo(map); // addTo は開いていると remove() → close 発火 → 閉じてしまう
  }, [popup, markerPopup, popupDiv]);

  // 自宅設定モードに入ったら登録済みの自宅へ（home の変更ではカメラを動かさない）
  const easeToHome = useEffectEvent((map: maplibregl.Map) => {
    if (home) map.easeTo({ center: home, zoom: 15 });
  });
  // ナビ開始・終了: ジェスチャ制限とパディング（現在地を画面下 1/3 に置く）。fitVersion effect より前に置く
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "nav") {
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
      map.dragRotate.disable();
      map.removeControl(compassRef.current);
      const h = map.getContainer().clientHeight;
      map.jumpTo({
        pitch: NAV_PITCH,
        padding: { top: Math.round(h / 3), bottom: layout.navbar, left: 0, right: 0 },
      });
    } else {
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.dragRotate.enable();
      if (!map.hasControl(compassRef.current)) map.addControl(compassRef.current, "top-right");
      map.jumpTo({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    if (mode === "home") easeToHome(map);
  }, [mode]);

  // 追従: nav が更新されるたび（= 受理した fix ごと・follow/zoom 変更）に easeTo。heading null なら bearing 据え置き。
  // fix は nav と同時に更新されるので依存にしない（二重 easeTo 防止）
  const followFix = useEffectEvent((map: maplibregl.Map, n: NavState) => {
    if (!fix) return;
    map.easeTo({
      center: fix,
      zoom: n.zoom,
      bearing: n.heading ?? map.getBearing(),
      duration: 600,
    });
  });
  useEffect(() => {
    const map = mapRef.current;
    if (map && mode === "nav" && nav?.follow) followFix(map, nav);
  }, [nav, mode]);

  // 選択経路に fitBounds。selected は意図的に依存にしない: 代替切替でカメラを動かさない（ui.md「探索」）
  const fitSelected = useEffectEvent(() => {
    const route = routes[selected];
    if (route) {
      mapRef.current?.fitBounds(bounds(route), {
        padding: { top: 40, left: 40, right: 40, bottom: layout.peek + 40 },
      });
    }
  });
  useEffect(() => {
    if (fitVersion > 0) fitSelected();
  }, [fitVersion]);

  const popupContent = popup ? (
    <PointPopup
      mode={mode === "home" ? "home" : "edit"}
      label={popup.label}
      canAddVia={vias.length < MAX_VIAS}
      onAction={tripActions.popupActionTaken}
    />
  ) : markerPopup ? (
    <button
      {...stylex.props(button.base, button.danger)}
      onClick={() => {
        const { role } = markerPopup;
        setMarkerPopup(null);
        tripActions.pointDeleted(role);
      }}
    >
      削除
    </button>
  ) : null;

  return (
    <>
      <div ref={container} {...stylex.props(styles.map)} />
      {createPortal(popupContent, popupDiv)}
      {createPortal(<HomeIcon size={18} />, homeDiv)}
    </>
  );
}
