import * as stylex from "@stylexjs/stylex";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike } from "maplibre-gl";
import type { FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import type { Fix } from "@/shared/point.ts";
import { ROAD_KIND, type RouteModel } from "@/route/route.ts";
import { fixedColors, shadows } from "@/shared/tokens.stylex.ts";

export const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const TOKYO_STATION: [number, number] = [139.7671, 35.6812];

// MapLibre の paint は StyleX の変数を読めないので直値で持つ。route / narrow は tokens の accent / narrow のライト値と揃える
const COLOR = { route: "#1a73e8", narrow: "#e8710a", white: "#fff", homeIcon: "#5f6368" } as const;

const styles = stylex.create({
  marker: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: fixedColors.onAccent,
    boxShadow: shadows.marker,
    color: fixedColors.onAccent,
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
    backgroundColor: COLOR.white,
    color: COLOR.homeIcon,
    boxShadow: shadows.marker,
  },
});

export function markerElement(color: string, text: string, onClick: () => void): HTMLDivElement {
  const element = document.createElement("div");
  element.className = stylex.props(styles.marker).className ?? "";
  element.style.backgroundColor = color;
  element.textContent = text;

  // マーカータップは地図 click に伝播させない（onTap が走ると地点ポップアップが開く）
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  return element;
}

type LineFeatureCollection = FeatureCollection<LineString>;
type FixFeatureCollection = FeatureCollection<GeoPoint>;
export const EMPTY: LineFeatureCollection = { type: "FeatureCollection", features: [] };
export const EMPTY_FIX: FixFeatureCollection = { type: "FeatureCollection", features: [] };

/** 精度円: zoom 0 での px 半径 baseRadius を持たせ、layer 側で 2^zoom 倍する */
export function fixFeatures(fix: Fix | null): FixFeatureCollection {
  if (!fix) return EMPTY_FIX;

  const baseRadius = fix.accuracy / (156543.03 * Math.cos((fix.lat * Math.PI) / 180));
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { baseRadius },
        geometry: { type: "Point", coordinates: [fix.lng, fix.lat] },
      },
    ],
  };
}

export function routeFeatures(route: RouteModel): LineFeatureCollection {
  return {
    type: "FeatureCollection",
    features: route.roadClass.map((range) => ({
      type: "Feature",
      properties: { kind: range.kind },
      geometry: { type: "LineString", coordinates: route.points.slice(range.from, range.to + 1) },
    })),
  };
}

export function alternativeFeatures(routes: RouteModel[], selected: number): LineFeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes
      .filter((_, i) => i !== selected)
      .map((route) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.points },
      })),
  };
}

export function setSourceData(
  map: maplibregl.Map | null,
  id: string,
  data: LineFeatureCollection | FixFeatureCollection,
): void {
  (map?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export function bounds(route: RouteModel): LngLatBoundsLike {
  const lngLatBounds = new maplibregl.LngLatBounds();
  for (const point of route.points) lngLatBounds.extend(point);
  return lngLatBounds;
}

// 運転に不要で描画コストが高い層を消す: 建物 3D（fill-extrusion）、施設アイコン（衝突判定）、歩道・小道とその名前、米国用の道路番号盾。駅（poi_transit）は目印として残す
const HIDDEN_LAYER = /^(building-3d|poi_r\d+|.*path.*|road_shield_us|highway-shield-us-interstate)$/;

/** style.load のたびに呼ぶ: 不要層の非表示 + ラベル上書き + 経路・現在地 source / layer。初期化とダーク切替で同じ */
export function applyStyleExtras(
  map: maplibregl.Map,
  data: {
    route: LineFeatureCollection;
    alternative: LineFeatureCollection;
    fix: FixFeatureCollection;
  },
) {
  const layers = map.getStyle().layers;
  for (const layer of layers) {
    if (HIDDEN_LAYER.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
    // liberty の平面建物は zoom 14 で 3D に引き継ぐ設計。3D を消したので平面を全縮尺に伸ばす（dark は元から平面のみ）
    if (layer.id === "building") map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, 24);

    const textField = layer.type === "symbol" ? layer.layout?.["text-field"] : undefined;
    // ref（道路番号）を出す層は地名ではないので触らない
    if (textField === undefined || JSON.stringify(textField).includes('"ref"')) continue;

    map.setLayoutProperty(layer.id, "text-field", [
      "coalesce",
      ["get", "name:ja"],
      ["get", "name"],
    ]);
  }

  // 経路線は地名ラベルの下に置く
  const beforeId = layers.find((layer) => layer.type === "symbol")?.id;

  map.addSource("alternative", { type: "geojson", data: data.alternative });
  map.addSource("route", { type: "geojson", data: data.route });
  map.addLayer(
    {
      id: "alternative-line",
      type: "line",
      source: "alternative",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": COLOR.route, "line-width": 4, "line-opacity": 0.35 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "route-wide",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], ROAD_KIND.WIDE],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": COLOR.route, "line-width": 6 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "route-narrow",
      type: "line",
      source: "route",
      filter: ["!=", ["get", "kind"], ROAD_KIND.WIDE],
      layout: { "line-join": "round" },
      paint: { "line-color": COLOR.narrow, "line-width": 8, "line-dasharray": [1.5, 1.2] },
    },
    beforeId,
  );

  // 現在地は最前面
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
        ["get", "baseRadius"],
        22,
        ["*", ["get", "baseRadius"], 4194304],
      ],
      "circle-color": COLOR.route,
      "circle-opacity": 0.15,
    },
  });
  map.addLayer({
    id: "fix-dot",
    type: "circle",
    source: "fix",
    paint: {
      "circle-radius": 7,
      "circle-color": COLOR.route,
      "circle-stroke-color": COLOR.white,
      "circle-stroke-width": 2,
    },
  });
}

/** 中身（アイコン）は portal で描く */
export function homeMarkerElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = stylex.props(styles.homeMarker).className ?? "";
  element.addEventListener("click", (event) => event.stopPropagation());
  return element;
}
