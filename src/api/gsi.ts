import type { LatLng } from "../model/route.ts";

const REVERSE = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

/** 国土地理院 逆ジオ。results.lv01Nm（町丁目）。海上などの応答 {} → null。失敗は throw */
export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${REVERSE}?lat=${p.lat}&lon=${p.lng}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { lv01Nm?: string } };
  return json.results?.lv01Nm ?? null;
}

const SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch";

export type SearchHit = { title: string; lat: number; lng: number };

/** 国土地理院 住所検索。応答は素の Feature 配列（coordinates = [lng, lat]）。先頭 10 件。失敗は throw */
export async function searchAddress(q: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    geometry: { coordinates: [number, number] };
    properties: { title: string };
  }[];
  return json.slice(0, 10).map((f) => ({
    title: f.properties.title,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}
