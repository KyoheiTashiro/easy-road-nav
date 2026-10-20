import * as stylex from "@stylexjs/stylex";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavState } from "../model/progress.ts";
import type { Fix, LatLng, Point, PointRole, RouteModel, SavedPoint } from "../model/route.ts";
import { PEEK_HEIGHT } from "./BottomSheet.tsx";
import { NAVBAR_HEIGHT } from "./NavBar.tsx";
import { button } from "./button.stylex.ts";
import { PointPopup } from "./PointPopup.tsx";
import { HomeIcon } from "./icons.tsx";

/** ナビ開始時のカメラ（nav.md「カメラ」節） */
export const NAV_ZOOM = 17;
export const NAV_PITCH = 50;

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const DARK_MQ = "(prefers-color-scheme: dark)";
const TOKYO_STATION: [number, number] = [139.7671, 35.6812];

const MARKER_COLOR = { from: "#188038", to: "#d93025", via: "#1a73e8" };

const styles = stylex.create({
  map: { position: "fixed", inset: 0 },
  marker: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: "20px",
    textAlign: "center",
    cursor: "pointer",
  },
  homeMarker: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    color: "#5f6368",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
});

type MapProps = {
  mode: "edit" | "nav" | "home";
  nav: NavState | null; // follow / heading / zoom を読む
  from: Point | null;
  to: Point | null;
  vias: Point[];
  home: SavedPoint | null; // 自宅マーカー。全モードで表示
  fix: Fix | null;
  routes: RouteModel[];
  selected: number;
  fitVersion: number; // 増えたら選択経路に fitBounds
  popup: { p: LatLng; label: string | null } | null;
  canAddVia: boolean;
  onTap(p: LatLng): void;
  onPopupAction(role: "from" | "to" | "via" | "home"): void;
  onPopupClose(): void;
  onMarkerDelete(role: PointRole): void;
  onDragStart(): void; // ナビ中のドラッグ → follow false
  onZoomEnd(zoom: number): void; // ナビ中のピンチ → nav.zoom
};

function markerElement(color: string, text: string, onClick: () => void): HTMLDivElement {
  const el = document.createElement("div");
  el.className = stylex.props(styles.marker).className ?? "";
  el.style.backgroundColor = color;
  el.textContent = text;
  // マーカータップは地図 click に伝播させない（onTap が走ると地点ポップアップが開く）
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return el;
}

type FC = FeatureCollection<LineString>;
type FixFC = FeatureCollection<GeoPoint>;
const EMPTY: FC = { type: "FeatureCollection", features: [] };
const EMPTY_FIX: FixFC = { type: "FeatureCollection", features: [] };

/** 精度円: zoom 0 での px 半径 r0 を持たせ、layer 側で 2^zoom 倍する */
function fixFeatures(fix: Fix | null): FixFC {
  if (!fix) return EMPTY_FIX;
  const r0 = fix.accuracy / (156543.03 * Math.cos((fix.lat * Math.PI) / 180));
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { r0 },
        geometry: { type: "Point", coordinates: [fix.lng, fix.lat] },
      },
    ],
  };
}

/** 描画分割: roadClass の各範囲を LineString に、kind を property に */
function routeFeatures(route: RouteModel): FC {
  return {
    type: "FeatureCollection",
    features: route.roadClass.map((r) => ({
      type: "Feature",
      properties: { kind: r.kind },
      geometry: { type: "LineString", coordinates: route.points.slice(r.from, r.to + 1) },
    })),
  };
}

function altFeatures(routes: RouteModel[], selected: number): FC {
  return {
    type: "FeatureCollection",
    features: routes
      .filter((_, i) => i !== selected)
      .map((r) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: r.points },
      })),
  };
}

function bounds(route: RouteModel): LngLatBoundsLike {
  const b = new maplibregl.LngLatBounds();
  for (const p of route.points) b.extend(p);
  return b;
}

/** style.load のたびに呼ぶ: ラベル上書き + 経路・現在地 source / layer。初期化とダーク切替で同じ */
function applyStyleExtras(map: maplibregl.Map, data: { route: FC; alt: FC; fix: FixFC }) {
  const layers = map.getStyle().layers;
  for (const l of layers) {
    const tf = l.type === "symbol" ? l.layout?.["text-field"] : undefined;
    if (tf === undefined || JSON.stringify(tf).includes('"ref"')) continue;
    map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:ja"], ["get", "name"]]);
  }
  // 経路線は地名ラベルの下に置く
  const beforeId = layers.find((l) => l.type === "symbol")?.id;
  map.addSource("alt", { type: "geojson", data: data.alt });
  map.addSource("route", { type: "geojson", data: data.route });
  map.addLayer(
    {
      id: "alt-line",
      type: "line",
      source: "alt",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1a73e8", "line-width": 4, "line-opacity": 0.35 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "route-wide",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "wide"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1a73e8", "line-width": 6 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "route-narrow",
      type: "line",
      source: "route",
      filter: ["!=", ["get", "kind"], "wide"],
      layout: { "line-join": "round" },
      paint: { "line-color": "#e8710a", "line-width": 8, "line-dasharray": [1.5, 1.2] },
    },
    beforeId,
  );
  // 現在地: 精度円 + 青ドット。最前面
  map.addSource("fix", { type: "geojson", data: data.fix });
  map.addLayer({
    id: "fix-accuracy",
    type: "circle",
    source: "fix",
    paint: {
      "circle-radius": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0,
        ["get", "r0"],
        22,
        ["*", ["get", "r0"], 4194304],
      ],
      "circle-color": "#1a73e8",
      "circle-opacity": 0.15,
    },
  });
  map.addLayer({
    id: "fix-dot",
    type: "circle",
    source: "fix",
    paint: {
      "circle-radius": 7,
      "circle-color": "#1a73e8",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
}

export function Map(props: MapProps) {
  const { mode, nav, from, to, vias, home, fix, routes, selected, fitVersion, popup } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // 一度だけ登録する map イベントから最新の callback を呼ぶため
  const cb = useRef(props);
  cb.current = props;
  // マーカータップで開く「削除」ポップアップ（地点ポップアップとは排他）
  const [markerPopup, setMarkerPopup] = useState<{ p: LatLng; role: PointRole } | null>(null);
  const [popupDiv] = useState(() => document.createElement("div"));
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // 自宅マーカー: HomeIcon を portal で描く要素を Marker に渡す
  const [homeDiv] = useState(() => {
    const el = document.createElement("div");
    el.className = stylex.props(styles.homeMarker).className ?? "";
    el.addEventListener("click", (ev) => ev.stopPropagation());
    return el;
  });
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);
  // 方位アイコン（押下で北上）。ナビ中は heading 追従と衝突するので外す
  const compassRef = useRef(
    new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }),
  );
  // style.load 時に最新データで source を作り直すため ref に持つ
  const dataRef = useRef({ route: EMPTY, alt: EMPTY, fix: EMPTY_FIX });
  const easedToFix = useRef(false);
  const routesRef = useRef(routes);
  routesRef.current = routes;

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
    map.on("click", (e) => {
      if (cb.current.mode === "nav") return;
      setMarkerPopup(null);
      cb.current.onTap({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on("dragstart", (e) => {
      const oe = e.originalEvent;
      if (oe && "touches" in oe && oe.touches.length > 1) return; // ピンチ中のパンは追従解除しない
      if (cb.current.mode === "nav") cb.current.onDragStart();
    });
    map.on("zoomend", (e) => {
      // originalEvent なし = easeTo 等プログラム由来
      if (e.originalEvent && cb.current.mode === "nav") cb.current.onZoomEnd(map.getZoom());
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

  // 現在地。初回 fix で地点なしなら easeTo（URL に地点があれば fitBounds が優先）
  useEffect(() => {
    const data = fixFeatures(fix);
    dataRef.current = { ...dataRef.current, fix: data };
    const map = mapRef.current;
    (map?.getSource("fix") as GeoJSONSource | undefined)?.setData(data);
    if (map && fix && !easedToFix.current) {
      easedToFix.current = true;
      if (!cb.current.from && !cb.current.to) map.easeTo({ center: fix, zoom: 15 });
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
          cb.current.onPopupClose();
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
        cb.current.onPopupClose();
        setMarkerPopup(null);
      });
      popupRef.current = pp;
    }
    pp.setLngLat(target);
    if (!pp.isOpen()) pp.addTo(map); // addTo は開いていると remove() → close 発火 → 閉じてしまう
  }, [popup, markerPopup, popupDiv]);

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
        padding: { top: Math.round(h / 3), bottom: NAVBAR_HEIGHT, left: 0, right: 0 },
      });
    } else {
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.dragRotate.enable();
      if (!map.hasControl(compassRef.current)) map.addControl(compassRef.current, "top-right");
      map.jumpTo({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    // 自宅設定モードに入ったら登録済みの自宅へ
    if (mode === "home" && cb.current.home) map.easeTo({ center: cb.current.home, zoom: 15 });
  }, [mode]);

  // 追従: nav が更新されるたび（= 受理した fix ごと・follow/zoom 変更）に easeTo。heading null なら bearing 据え置き
  useEffect(() => {
    const map = mapRef.current;
    const f = cb.current.fix;
    if (!map || mode !== "nav" || !nav?.follow || !f) return;
    map.easeTo({
      center: f,
      zoom: nav.zoom,
      bearing: nav.heading ?? map.getBearing(),
      duration: 600,
    });
    // fix は nav と同時に更新されるので deps に含めない（二重 easeTo 防止）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, mode]);

  useEffect(() => {
    const route = routesRef.current[selected];
    if (route) {
      mapRef.current?.fitBounds(bounds(route), {
        padding: { top: 40, left: 40, right: 40, bottom: PEEK_HEIGHT + 40 },
      });
    }
    // selected は意図的に外す: 代替切替でカメラを動かさない（ui.md「探索」）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitVersion]);

  const popupContent = popup ? (
    <PointPopup
      mode={mode === "home" ? "home" : "edit"}
      label={popup.label}
      canAddVia={props.canAddVia}
      onAction={props.onPopupAction}
    />
  ) : markerPopup ? (
    <button
      {...stylex.props(button.base, button.danger)}
      onClick={() => {
        const { role } = markerPopup;
        setMarkerPopup(null);
        cb.current.onMarkerDelete(role);
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
