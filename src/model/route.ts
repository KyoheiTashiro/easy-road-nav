import { bearing, haversine, projectToSegment } from "./geo.ts";

export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; t: number }; // t = position.timestamp
export type Point = LatLng & { label: string | null }; // label null = 逆ジオ中
export type PointRole = "from" | "to" | { via: number }; // 地点の役割（マーカー削除・リスト操作）
export type SavedPoint = LatLng & { label: string }; // 自宅・検索履歴。label 確定済みのみ保存

export type RoadKind = "wide" | "narrow" | "forbidden";
export type TollValue = "no" | "all" | "hgv";

export type RouteModel = {
  points: [number, number][]; // [lng, lat]
  cum: number[]; // cum[k] = P[0]..P[k] の累積距離 m
  roadClass: { from: number; to: number; kind: RoadKind }[];
  toll: { from: number; to: number; value: TollValue }[];
  instructions: {
    text: string;
    sign: number;
    streetName: string;
    from: number;
    to: number;
    time: number; // ms
    exitNumber?: number; // sign 6
  }[];
  viaIndices: number[]; // sign == 5 の from
  distance: number; // m
  time: number; // ms
};
export type Instruction = RouteModel["instructions"][number];

/** GraphHopper paths[] 要素の必要フィールドだけ */
export type GhPath = {
  distance: number;
  time: number;
  points: { coordinates: [number, number][] };
  instructions: {
    text: string;
    sign: number;
    street_name: string;
    interval: [number, number];
    time: number;
    exit_number?: number;
  }[];
  details: { road_class: [number, number, string][]; toll: [number, number, string][] };
};

const WIDE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

function roadKind(cls: string): RoadKind {
  if (WIDE.has(cls)) return "wide";
  if (cls === "track") return "forbidden";
  return "narrow";
}

function toLatLng([lng, lat]: [number, number]): LatLng {
  return { lat, lng };
}

export function fromGhPath(path: GhPath): RouteModel {
  const points = path.points.coordinates;
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + haversine(toLatLng(points[i - 1]!), toLatLng(points[i]!)));
  }
  const instructions = path.instructions.map((ins) => ({
    text: ins.text,
    sign: ins.sign,
    streetName: ins.street_name,
    from: ins.interval[0],
    to: ins.interval[1],
    time: ins.time,
    ...(ins.exit_number == null ? {} : { exitNumber: ins.exit_number }),
  }));
  return {
    points,
    cum,
    roadClass: path.details.road_class.map(([from, to, cls]) => ({
      from,
      to,
      kind: roadKind(cls),
    })),
    toll: path.details.toll.map(([from, to, v]) => ({ from, to, value: v as TollValue })),
    instructions,
    viaIndices: instructions.filter((i) => i.sign === 5).map((i) => i.from),
    distance: path.distance,
    time: path.time,
  };
}

function vertex(route: RouteModel, i: number): LatLng {
  return toLatLng(route.points[i]!);
}

/** 全線分に射影し dist 最小を採用。s = cum[i] + t × (cum[i+1] − cum[i]) */
export function nearest(
  route: RouteModel,
  p: LatLng,
): { s: number; distanceToRoute: number; segmentIndex: number } {
  // ponytail: 全線分 O(n) 走査。遅ければ前回 index の近傍窓に限定
  let best = { s: 0, distanceToRoute: Infinity, segmentIndex: 0 };
  for (let i = 0; i + 1 < route.points.length; i++) {
    const { t, dist } = projectToSegment(p, vertex(route, i), vertex(route, i + 1));
    if (dist < best.distanceToRoute) {
      const c0 = route.cum[i]!;
      best = { s: c0 + t * (route.cum[i + 1]! - c0), distanceToRoute: dist, segmentIndex: i };
    }
  }
  return best;
}

export function segmentBearing(route: RouteModel, i: number): number {
  return bearing(vertex(route, i), vertex(route, i + 1));
}

/** toll.value == "all" の合計 m */
export function tollDistance(route: RouteModel): number {
  return route.toll
    .filter((t) => t.value === "all")
    .reduce((sum, t) => sum + route.cum[t.to]! - route.cum[t.from]!, 0);
}
