import { bearing, haversine, projectToSegment } from "@/model/geo.ts";
import type { LatLng } from "@/model/point.ts";

export const ROAD_KIND = { WIDE: "wide", NARROW: "narrow", FORBIDDEN: "forbidden" } as const;
export type RoadKind = (typeof ROAD_KIND)[keyof typeof ROAD_KIND];
export const TOLL = { NO: "no", ALL: "all", HGV: "hgv" } as const;
export type TollValue = (typeof TOLL)[keyof typeof TOLL];

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
  details: {
    road_class: [number, number, string][];
    toll: [number, number, string][];
    intersection?: [number, number, GhIntersection][];
  };
};
/** details=intersection の 1 要素。頂点 from にある交差点の全接続エッジ。bearings は昇順、in/out はその index */
export type GhIntersection = {
  bearings: number[];
  entries: boolean[]; // 進入可能か（in エッジと一方通行の逆走は false）
  in?: number; // 先頭ノードには無い
  out: number;
};

/** 分岐判定角（deg、CONTEXT.md）。進む道と別の進入可能な道の方位差がこれ以下なら分岐として「右寄り/左寄り」を合成 */
export const FORK_ANGLE = 45;

const WIDE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

function roadKind(cls: string): RoadKind {
  if (WIDE.has(cls)) return ROAD_KIND.WIDE;
  if (cls === "track") return ROAD_KIND.FORBIDDEN;
  return ROAD_KIND.NARROW;
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
  for (const [k, , x] of path.details.intersection ?? [])
    addFork(instructions, cum, k, forkSign(x));
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

/** -180 < d <= 180。正 = b は a の右（時計回り） */
function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** 分岐なら 7（右寄り）/ -7（左寄り）、それ以外 0。GraphHopper が keep を出さない同格の分岐（高架下 vs 側道等）を補う */
export function forkSign(x: GhIntersection): number {
  const out = x.bearings[x.out]!;
  let sign = 0;
  let best = FORK_ANGLE + 1;
  x.bearings.forEach((b, i) => {
    if (i === x.out || i === x.in || !x.entries[i]) return;
    const d = angleDiff(out, b);
    if (Math.abs(d) <= Math.min(FORK_ANGLE, best)) {
      best = Math.abs(d);
      sign = d > 0 ? -7 : 7; // 他方が右にある → 自分は左寄り
    }
  });
  return sign;
}

/** 頂点 k に sign ±7 の指示を入れる。既に案内地点（sign != 0）なら何もしない。sign 0 の指示が k から始まるなら書き換え、途中なら分割 */
function addFork(instructions: Instruction[], cum: number[], k: number, sign: number): void {
  if (sign === 0 || k === 0) return; // 出発地は案内しない
  const text = sign > 0 ? "右寄り" : "左寄り";
  const idx = instructions.findIndex((i) => i.from <= k && k < i.to);
  const ins = instructions[idx];
  if (!ins) return;
  if (ins.from === k) {
    if (ins.sign === 0) Object.assign(ins, { sign, text });
    return;
  }
  const len = cum[ins.to]! - cum[ins.from]!;
  const t = len > 0 ? (ins.time * (cum[k]! - cum[ins.from]!)) / len : 0;
  const tail = { ...ins, sign, text, from: k, time: ins.time - t };
  delete tail.exitNumber;
  instructions.splice(idx, 1, { ...ins, to: k, time: t }, tail);
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
    .filter((t) => t.value === TOLL.ALL)
    .reduce((sum, t) => sum + route.cum[t.to]! - route.cum[t.from]!, 0);
}
