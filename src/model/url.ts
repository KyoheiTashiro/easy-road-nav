import { MAX_VIAS, type LatLng } from "@/model/point.ts";

export type Query = { from: LatLng | null; to: LatLng | null; vias: LatLng[]; notoll: boolean };

function parseLatLng(s: string | null): LatLng | null {
  if (!s) return null;
  const parts = s.split(",");
  if (parts.length !== 2 || parts.some((x) => x.trim() === "")) return null; // Number("") は 0 なので先に弾く
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
      .filter((p): p is LatLng => p !== null)
      .slice(0, MAX_VIAS),
    notoll: params.get("notoll") !== "0", // 既定は避ける
  };
}

function fmt(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/** "?from=..&to=..&via=..|..&notoll=0"。地点なし・notoll true（既定）は省略。全部なしなら "" */
export function buildQuery(q: Query): string {
  const parts: string[] = [];
  if (q.from) parts.push(`from=${fmt(q.from)}`);
  if (q.to) parts.push(`to=${fmt(q.to)}`);
  if (q.vias.length) parts.push(`via=${q.vias.map(fmt).join("|")}`);
  if (!q.notoll) parts.push("notoll=0");
  return parts.length ? `?${parts.join("&")}` : "";
}
