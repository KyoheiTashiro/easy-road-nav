import type { SearchHit } from "./gsi.ts";

const SEARCH = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL = 1000; // 利用規約: 1 req/秒以下

let lastAt = 0;

/**
 * Nominatim 公式インスタンスで施設名検索（日本国内、日本語）。
 * 規約上オートコンプリート禁止 → Enter 確定時のみ呼ぶ。前回から 1 秒未満なら待ってから送る。失敗は throw
 */
export async function searchPoi(q: string, signal: AbortSignal): Promise<SearchHit[]> {
  const wait = lastAt + MIN_INTERVAL - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  signal.throwIfAborted();
  lastAt = Date.now();
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "jp",
    "accept-language": "ja",
    limit: "10",
  });
  const res = await fetch(`${SEARCH}?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    name: string;
    display_name: string;
    lat: string;
    lon: string;
  }[];
  return json.map((r) => ({
    title: r.name || r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}
