import { bearing, haversine, projectToSegment } from "@/shared/geo.ts";
import type { LatLng } from "@/shared/point.ts";

const FORK_ANGLE = 45; // 調整値「分岐判定角」deg（docs/CONTEXT.md）

export const ROAD_KIND = { WIDE: "wide", NARROW: "narrow" } as const;
export type RoadKind = (typeof ROAD_KIND)[keyof typeof ROAD_KIND];

/** GraphHopper `instructions[].sign`。正が右、負が左 */
export const SIGN = {
  U_TURN_UNKNOWN: -98,
  U_TURN_LEFT: -8,
  KEEP_LEFT: -7,
  SHARP_LEFT: -3,
  LEFT: -2,
  SLIGHT_LEFT: -1,
  CONTINUE: 0,
  SLIGHT_RIGHT: 1,
  RIGHT: 2,
  SHARP_RIGHT: 3,
  FINISH: 4,
  VIA_REACHED: 5,
  ROUNDABOUT: 6,
  KEEP_RIGHT: 7,
  U_TURN_RIGHT: 8,
} as const;

export type RouteModel = {
  points: [number, number][]; // [lng, lat]
  cumulativeDistances: number[]; // cumulativeDistances[i] = points[0]..points[i] の累積距離 m
  roadClass: { from: number; to: number; kind: RoadKind }[];
  toll: { from: number; to: number; value: string }[]; // "all" = 有料
  instructions: {
    text: string;
    sign: number;
    streetName: string;
    from: number;
    to: number;
    time: number; // ms
    exitNumber?: number; // SIGN.ROUNDABOUT のみ
  }[];
  viaIndices: number[]; // SIGN.VIA_REACHED の from
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

const WIDE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

function roadKind(roadClass: string): RoadKind {
  return WIDE.has(roadClass) ? ROAD_KIND.WIDE : ROAD_KIND.NARROW;
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
    toll: path.details.toll.map(([from, to, value]) => ({ from, to, value })),
    instructions,
    viaIndices: instructions
      .filter((instruction) => instruction.sign === SIGN.VIA_REACHED)
      .map((instruction) => instruction.from),
    distance: path.distance,
    time: path.time,
  };
}

/** -180 < 差 <= 180。正 = b は a の右（時計回り） */
function angleDifference(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** 分岐なら KEEP_RIGHT / KEEP_LEFT、それ以外 CONTINUE。GraphHopper が keep を出さない同格の分岐（高架下 vs 側道等）を補う */
export function forkSign(intersection: GraphHopperIntersection): number {
  const out = intersection.bearings[intersection.out]!;
  let sign: number = SIGN.CONTINUE;
  let best = FORK_ANGLE; // 採用済みの最小方位差。初期値 = 分岐とみなす上限

  intersection.bearings.forEach((otherBearing, i) => {
    if (i === intersection.out || i === intersection.in || !intersection.entries[i]) return;
    const difference = angleDifference(out, otherBearing);
    if (Math.abs(difference) <= best) {
      best = Math.abs(difference);
      sign = difference > 0 ? SIGN.KEEP_LEFT : SIGN.KEEP_RIGHT; // 他方が右にある → 自分は左寄り
    }
  });

  return sign;
}

/** 頂点 vertexIndex に寄りの指示を入れる。既に案内地点（sign != CONTINUE）なら何もしない。CONTINUE の指示が vertexIndex から始まるなら書き換え、途中なら分割 */
function addFork(
  instructions: Instruction[],
  cumulativeDistances: number[],
  vertexIndex: number,
  sign: number,
): void {
  if (sign === SIGN.CONTINUE || vertexIndex === 0) return; // 出発地は案内しない

  const text = sign > 0 ? "右寄り" : "左寄り";
  const index = instructions.findIndex(
    (instruction) => instruction.from <= vertexIndex && vertexIndex < instruction.to,
  );
  const instruction = instructions[index];
  if (!instruction || instruction.sign === SIGN.ROUNDABOUT) return; // 周回中の出口を分岐と誤認する

  if (instruction.from === vertexIndex) {
    if (instruction.sign === SIGN.CONTINUE) Object.assign(instruction, { sign, text });
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

/** 累積距離 [range.from, range.to] に掛かる線分に射影し distance 最小を採用。s = cumulativeDistances[i] + t × (cumulativeDistances[i+1] − cumulativeDistances[i])。該当なしは distanceToRoute = Infinity */
export function nearest(
  route: RouteModel,
  point: LatLng,
  range = { from: -Infinity, to: Infinity },
): { s: number; distanceToRoute: number; segmentIndex: number } {
  // ponytail: 全線分 O(n) 走査。遅ければ二分探索で範囲の先頭へ飛ぶ
  let best = { s: 0, distanceToRoute: Infinity, segmentIndex: 0 };

  for (let i = 0; i + 1 < route.points.length; i++) {
    if (route.cumulativeDistances[i + 1]! < range.from || route.cumulativeDistances[i]! > range.to)
      continue;

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

const TURNS: Set<number> = new Set([
  SIGN.U_TURN_UNKNOWN,
  SIGN.U_TURN_LEFT,
  SIGN.SHARP_LEFT,
  SIGN.LEFT,
  SIGN.SLIGHT_LEFT,
  SIGN.SLIGHT_RIGHT,
  SIGN.RIGHT,
  SIGN.SHARP_RIGHT,
  SIGN.ROUNDABOUT,
  SIGN.U_TURN_RIGHT,
]);

/** 右左折の回数。直進・経由地・目的地・分岐の寄りは数えない */
export function turnCount(route: RouteModel): number {
  return route.instructions.filter((instruction) => TURNS.has(instruction.sign)).length;
}

export function tollDistance(route: RouteModel): number {
  return route.toll
    .filter((range) => range.value === "all")
    .reduce(
      (sum, range) =>
        sum + route.cumulativeDistances[range.to]! - route.cumulativeDistances[range.from]!,
      0,
    );
}
