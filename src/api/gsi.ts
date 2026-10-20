import type { LatLng, SavedPoint } from "@/model/point.ts";

const REVERSE = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

/** 国土地理院 逆ジオ。results.lv01Nm（町丁目）。海上などの応答 {} → null。失敗は throw */
export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${REVERSE}?lat=${p.lat}&lon=${p.lng}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { lv01Nm?: string } };
  return json.results?.lv01Nm ?? null;
}

const SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch";

/** クエリ全文を label に含む候補を先頭へ（安定ソート、API の順序 = 北から南 を各群内で維持） */
export function rankHits(q: string, hits: SavedPoint[]): SavedPoint[] {
  const has = (h: SavedPoint) => (h.label.includes(q) ? 0 : 1);
  return [...hits].sort((a, b) => has(a) - has(b));
}

/** 国土地理院 住所検索。応答は素の Feature 配列（coordinates = [lng, lat]）。全文一致を優先。件数制限なし。失敗は throw */
export async function searchAddress(q: string, signal: AbortSignal): Promise<SavedPoint[]> {
  const res = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    geometry: { coordinates: [number, number] };
    properties: { title: string };
  }[];
  const hits = json.map((f) => ({
    label: f.properties.title,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  return rankHits(q, hits);
}
