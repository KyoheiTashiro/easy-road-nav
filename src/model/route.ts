import { bearing, haversine, projectToSegment } from "@/model/geo.ts";
import type { LatLng } from "@/model/point.ts";

export const ROAD_KIND = { WIDE: "wide", NARROW: "narrow", FORBIDDEN: "forbidden" } as const;
export type RoadKind = (typeof ROAD_KIND)[keyof typeof ROAD_KIND];
export const TOLL = { NO: "no", ALL: "all", HGV: "hgv" } as const;
export type TollValue = (typeof TOLL)[keyof typeof TOLL];

export type RouteModel = {
  points: [number, number][]; // [lng, lat]
  cumulativeDistances: number[]; // cumulativeDistances[i] = points[0]..points[i] の累積距離 m
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
export type GraphHopperPath = {
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
    intersection?: [number, number, GraphHopperIntersection][];
  };
};
/** details=intersection の 1 要素。頂点 from にある交差点の全接続エッジ。bearings は昇順、in/out はその index */
export type GraphHopperIntersection = {
  bearings: number[];
  entries: boolean[]; // 進入可能か（in エッジと一方通行の逆走は false）
  in?: number; // 先頭ノードには無い
  out: number;
};

/** 分岐判定角（deg、CONTEXT.md）。進む道と別の進入可能な道の方位差がこれ以下なら分岐として「右寄り/左寄り」を合成 */
export const FORK_ANGLE = 45;

const WIDE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

function roadKind(roadClass: string): RoadKind {
  if (WIDE.has(roadClass)) return ROAD_KIND.WIDE;
  if (roadClass === "track") return ROAD_KIND.FORBIDDEN;
  return ROAD_KIND.NARROW;
}

function toLatLng([lng, lat]: [number, number]): LatLng {
  return { lat, lng };
}

export function fromGraphHopperPath(path: GraphHopperPath): RouteModel {
  const points = path.points.coordinates;
  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeDistances.push(
      cumulativeDistances[i - 1]! + haversine(toLatLng(points[i - 1]!), toLatLng(points[i]!)),
    );
  }
  const instructions = path.instructions.map((instruction) => ({
    text: instruction.text,
    sign: instruction.sign,
    streetName: instruction.street_name,
    from: instruction.interval[0],
    to: instruction.interval[1],
    time: instruction.time,
    exitNumber: instruction.exit_number,
  }));
  // intersection の詳細は [from, to, 交差点]。交差点は頂点 from にある
  for (const [vertexIndex, _to, intersection] of path.details.intersection ?? [])
    addFork(instructions, cumulativeDistances, vertexIndex, forkSign(intersection));
  return {
    points,
    cumulativeDistances,
    roadClass: path.details.road_class.map(([from, to, roadClass]) => ({
      from,
      to,
      kind: roadKind(roadClass),
    })),
    toll: path.details.toll.map(([from, to, value]) => ({ from, to, value: value as TollValue })),
    instructions,
    viaIndices: instructions
      .filter((instruction) => instruction.sign === 5)
      .map((instruction) => instruction.from),
    distance: path.distance,
    time: path.time,
  };
}

/** -180 < 差 <= 180。正 = b は a の右（時計回り） */
function angleDifference(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** 分岐なら 7（右寄り）/ -7（左寄り）、それ以外 0。GraphHopper が keep を出さない同格の分岐（高架下 vs 側道等）を補う */
export function forkSign(intersection: GraphHopperIntersection): number {
  const out = intersection.bearings[intersection.out]!;
  let sign = 0;
  let best = FORK_ANGLE; // 採用済みの最小方位差。初期値 = 分岐とみなす上限
  intersection.bearings.forEach((otherBearing, i) => {
    if (i === intersection.out || i === intersection.in || !intersection.entries[i]) return;
    const difference = angleDifference(out, otherBearing);
    if (Math.abs(difference) <= best) {
      best = Math.abs(difference);
      sign = difference > 0 ? -7 : 7; // 他方が右にある → 自分は左寄り
    }
  });
  return sign;
}

/** 頂点 vertexIndex に sign ±7 の指示を入れる。既に案内地点（sign != 0）なら何もしない。sign 0 の指示が vertexIndex から始まるなら書き換え、途中なら分割 */
function addFork(
  instructions: Instruction[],
  cumulativeDistances: number[],
  vertexIndex: number,
  sign: number,
): void {
  if (sign === 0 || vertexIndex === 0) return; // 出発地は案内しない
  const text = sign > 0 ? "右寄り" : "左寄り";
  const index = instructions.findIndex(
    (instruction) => instruction.from <= vertexIndex && vertexIndex < instruction.to,
  );
  const instruction = instructions[index];
  if (!instruction) return;
  if (instruction.from === vertexIndex) {
    if (instruction.sign === 0) Object.assign(instruction, { sign, text });
    return;
  }
  const time = timeWithin(cumulativeDistances, instruction, cumulativeDistances[vertexIndex]!);
  const tail = { ...instruction, sign, text, from: vertexIndex, time: instruction.time - time };
  delete tail.exitNumber;
  instructions.splice(index, 1, { ...instruction, to: vertexIndex, time }, tail);
}

/** 指示 instruction の始点から累積距離 s までの所要時間 ms（距離に比例配分） */
export function timeWithin(
  cumulativeDistances: number[],
  instruction: Instruction,
  s: number,
): number {
  const length = cumulativeDistances[instruction.to]! - cumulativeDistances[instruction.from]!;
  return length > 0
    ? (instruction.time * (s - cumulativeDistances[instruction.from]!)) / length
    : 0;
}

function vertex(route: RouteModel, i: number): LatLng {
  return toLatLng(route.points[i]!);
}

/** 全線分に射影し distance 最小を採用。s = cumulativeDistances[i] + t × (cumulativeDistances[i+1] − cumulativeDistances[i]) */
export function nearest(
  route: RouteModel,
  point: LatLng,
): { s: number; distanceToRoute: number; segmentIndex: number } {
  // ponytail: 全線分 O(n) 走査。遅ければ前回 index の近傍窓に限定
  let best = { s: 0, distanceToRoute: Infinity, segmentIndex: 0 };
  for (let i = 0; i + 1 < route.points.length; i++) {
    const { t, distance } = projectToSegment(point, vertex(route, i), vertex(route, i + 1));
    if (distance < best.distanceToRoute) {
      const segmentStart = route.cumulativeDistances[i]!;
      best = {
        s: segmentStart + t * (route.cumulativeDistances[i + 1]! - segmentStart),
        distanceToRoute: distance,
        segmentIndex: i,
      };
    }
  }
  return best;
}

export function segmentBearing(route: RouteModel, i: number): number {
  return bearing(vertex(route, i), vertex(route, i + 1));
}

/** 右左折の回数。直進（0）・経由地（5）・目的地（4）・分岐の寄り（±7）は数えない */
export function turnCount(route: RouteModel): number {
  return route.instructions.filter((instruction) =>
    [1, 2, 3, 6, 8, 98].includes(Math.abs(instruction.sign)),
  ).length;
}

export function tollDistance(route: RouteModel): number {
  return route.toll
    .filter((range) => range.value === TOLL.ALL)
    .reduce(
      (sum, range) =>
        sum + route.cumulativeDistances[range.to]! - route.cumulativeDistances[range.from]!,
      0,
    );
}
