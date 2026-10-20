// Map の React 非依存部分: タイルスタイル、マーカー DOM、GeoJSON 生成、source / layer 定義
import * as stylex from "@stylexjs/stylex";
import maplibregl, { type LngLatBoundsLike } from "maplibre-gl";
import type { FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import type { Fix } from "@/model/point.ts";
import { ROAD_KIND, type RouteModel } from "@/model/route.ts";

export const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
export const DARK_MQ = "(prefers-color-scheme: dark)";
export const TOKYO_STATION: [number, number] = [139.7671, 35.6812];

export const MARKER_COLOR = { from: "#188038", to: "#d93025", via: "#1a73e8" };

const styles = stylex.create({
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

export function markerElement(color: string, text: string, onClick: () => void): HTMLDivElement {
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

export type FC = FeatureCollection<LineString>;
export type FixFC = FeatureCollection<GeoPoint>;
export const EMPTY: FC = { type: "FeatureCollection", features: [] };
export const EMPTY_FIX: FixFC = { type: "FeatureCollection", features: [] };

/** 精度円: zoom 0 での px 半径 r0 を持たせ、layer 側で 2^zoom 倍する */
export function fixFeatures(fix: Fix | null): FixFC {
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
export function routeFeatures(route: RouteModel): FC {
  return {
    type: "FeatureCollection",
    features: route.roadClass.map((r) => ({
      type: "Feature",
      properties: { kind: r.kind },
      geometry: { type: "LineString", coordinates: route.points.slice(r.from, r.to + 1) },
    })),
  };
}

export function altFeatures(routes: RouteModel[], selected: number): FC {
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

export function bounds(route: RouteModel): LngLatBoundsLike {
  const b = new maplibregl.LngLatBounds();
  for (const p of route.points) b.extend(p);
  return b;
}

/** style.load のたびに呼ぶ: ラベル上書き + 経路・現在地 source / layer。初期化とダーク切替で同じ */
export function applyStyleExtras(map: maplibregl.Map, data: { route: FC; alt: FC; fix: FixFC }) {
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
      filter: ["==", ["get", "kind"], ROAD_KIND.WIDE],
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
      filter: ["!=", ["get", "kind"], ROAD_KIND.WIDE],
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

/** 自宅マーカーの要素。HomeIcon は Map が portal で描く */
export function homeMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = stylex.props(styles.homeMarker).className ?? "";
  el.addEventListener("click", (ev) => ev.stopPropagation());
  return el;
}
