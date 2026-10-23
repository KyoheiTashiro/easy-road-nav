import { MAX_VIAS, type LatLng } from "@/shared/point.ts";

export type Query = { from: LatLng | null; to: LatLng | null; vias: LatLng[]; notoll: boolean };

function parseLatLng(text: string | null): LatLng | null {
  if (!text) return null;

  const parts = text.split(",");
  if (parts.length !== 2 || parts.some((part) => part.trim() === "")) return null; // Number("") は 0 なので先に弾く

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/** 不正な地点はその地点だけ無視 */
export function parseQuery(search: string): Query {
  const params = new URLSearchParams(search);
  return {
    from: parseLatLng(params.get("from")),
    to: parseLatLng(params.get("to")),
    vias: (params.get("via") ?? "")
      .split("|")
      .filter(Boolean)
      .map(parseLatLng)
      .filter((point): point is LatLng => point !== null)
      .slice(0, MAX_VIAS),
    notoll: params.get("notoll") !== "0", // 既定は避ける
  };
}

function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

/** "?from=..&to=..&via=..|..&notoll=0"。地点なし・notoll true（既定）は省略。全部なしなら "" */
export function buildQuery(query: Query): string {
  const parts: string[] = [];

  if (query.from) parts.push(`from=${formatLatLng(query.from)}`);
  if (query.to) parts.push(`to=${formatLatLng(query.to)}`);
  if (query.vias.length) parts.push(`via=${query.vias.map(formatLatLng).join("|")}`);
  if (!query.notoll) parts.push("notoll=0");

  return parts.length ? `?${parts.join("&")}` : "";
}
