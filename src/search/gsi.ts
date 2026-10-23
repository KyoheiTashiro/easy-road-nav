import { withTimeout } from "@/shared/timeout.ts";
import type { LatLng, SavedPoint } from "@/shared/point.ts";

const REVERSE = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

/** 国土地理院 逆ジオ。results.lv01Nm（町丁目）。海上などの応答 {} → null。失敗・10 秒は throw */
export async function reverseGeocode(point: LatLng, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`${REVERSE}?lat=${point.lat}&lon=${point.lng}`, {
    signal: withTimeout(signal),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = (await response.json()) as { results?: { lv01Nm?: string } };
  return json.results?.lv01Nm ?? null;
}

const SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch";

/** クエリ全文を label に含む候補を先頭へ（安定ソート、API の順序 = 北から南 を各群内で維持） */
export function rankHits(query: string, hits: SavedPoint[]): SavedPoint[] {
  const has = (hit: SavedPoint) => (hit.label.includes(query) ? 0 : 1);
  return [...hits].sort((a, b) => has(a) - has(b));
}

/** 国土地理院 住所検索。応答は素の Feature 配列（coordinates = [lng, lat]）。全文一致を優先。件数制限なし。失敗・10 秒は throw */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<SavedPoint[]> {
  const response = await fetch(`${SEARCH}?q=${encodeURIComponent(query)}`, {
    signal: withTimeout(signal),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = (await response.json()) as {
    geometry: { coordinates: [number, number] };
    properties: { title: string };
  }[];
  const hits = json.map((feature) => ({
    label: feature.properties.title,
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }));
  return rankHits(query, hits);
}
