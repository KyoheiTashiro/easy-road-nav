// ナビ純ロジック。処理順は docs/design/navigation.md、境界条件は progress.test.ts
import { formatSpokenDistance } from "@/shared/format.ts";
import { bearing, destination, haversine } from "@/shared/geo.ts";
import type { NarrowSegment } from "@/route/narrow.ts";
import type { Fix, LatLng } from "@/shared/point.ts";
import {
  nearest,
  segmentBearing,
  SIGN,
  timeWithin,
  type Instruction,
  type RouteModel,
} from "@/route/route.ts";

// 調整値（docs/CONTEXT.md「調整値」）
const OFF_ROUTE = 50; // 経路外れ距離 m
const REROUTE_COUNT = 3; // リルート連続回数
const REROUTE_OFFSET = 30; // リルート前方オフセット m
const ACCURACY_MAX = 50; // 進捗採用精度 m
const ARRIVE = 30; // 到着判定 m
const ANNOUNCE_FAR = 300; // 案内トリガー距離（予告）m
const ANNOUNCE_NEAR = 50; // 案内トリガー距離（直前）m
const NARROW_WARN = 300; // 細い道警告距離 m
const MIN_MOVE = 5; // 方位算出最小移動 m
const NEXT_NEXT_MAX = 1000; // 次の次表示上限 m
const SEARCH_AHEAD = 1000; // 進捗探索範囲 m

export type NavigationState = {
  s: number;
  segmentIndex: number;
  heading: number | null;
  lastFix: Fix | null;
  announced: Set<string>;
  passedVia: number;
  offRouteCount: number;
  rerouting: boolean;
  follow: boolean;
  zoom: number;
};

export type NavigationEvent =
  | { type: "speak"; text: string }
  | {
      type: "hud";
      instruction: Instruction | null;
      remaining: number;
      next: NextNext | null; // 次の次。次の案内地点から 次の次表示上限 以内のときだけ
    }
  | { type: "narrow"; segment: NarrowSegment | null }
  | { type: "viaPassed"; index: number }
  | { type: "arrived" }
  | { type: "reroute" };

/** 次の次の案内地点。distance = 次の案内地点からの距離 m */
export type NextNext = { instruction: Instruction; distance: number };

export function initNavigation(zoom: number, follow = true): NavigationState {
  return {
    s: 0,
    segmentIndex: 0,
    heading: null,
    lastFix: null,
    announced: new Set(),
    passedVia: 0,
    offRouteCount: 0,
    rerouting: false,
    follow,
    zoom,
  };
}

/** sign → 発話の語（navigation.md テンプレ） */
export function signWord(instruction: Instruction): string {
  switch (instruction.sign) {
    case SIGN.U_TURN_LEFT:
    case SIGN.U_TURN_RIGHT:
    case SIGN.U_TURN_UNKNOWN:
      return "U ターン";
    case SIGN.KEEP_LEFT:
      return "左寄り";
    case SIGN.KEEP_RIGHT:
      return "右寄り";
    case SIGN.SHARP_LEFT:
    case SIGN.LEFT:
      return "左方向";
    case SIGN.SLIGHT_LEFT:
      return "斜め左";
    case SIGN.SLIGHT_RIGHT:
      return "斜め右";
    case SIGN.RIGHT:
    case SIGN.SHARP_RIGHT:
      return "右方向";
    case SIGN.ROUNDABOUT:
      return `ラウンドアバウト ${instruction.exitNumber ?? 1} 番目の出口`;
    case SIGN.VIA_REACHED:
      return "経由地";
    case SIGN.FINISH:
      return "目的地";
    default:
      return "直進";
  }
}

const isGuidePoint = (instruction: Instruction) => instruction.sign !== SIGN.CONTINUE; // 案内地点（CONTINUE = 直進の区間境界）
type StepResult = { state: NavigationState; events: NavigationEvent[] };

function nextInstruction(route: RouteModel, s: number): number {
  return route.instructions.findIndex(
    (instruction) => isGuidePoint(instruction) && route.cumulativeDistances[instruction.from]! > s,
  );
}

export function step(
  route: RouteModel,
  narrow: NarrowSegment[],
  state: NavigationState,
  fix: Fix,
): StepResult {
  if (fix.accuracy >= ACCURACY_MAX) return { state: { ...state }, events: [] };
  const near = nearestAhead(route, state.s, fix);
  if (near.distanceToRoute > OFF_ROUTE) return offRoute(state, fix);

  const events: NavigationEvent[] = [];
  const next = advance(route, state, fix, near);
  passVias(route, next, events);

  if (route.cumulativeDistances.at(-1)! - next.s < ARRIVE) {
    events.push({ type: "speak", text: "目的地に到着しました" }, { type: "arrived" });
    return { state: next, events };
  }

  guide(route, next, events);
  warnNarrow(route, narrow, next, events);

  return { state: next, events };
}

/** 現在の s の近くを優先して最近傍を探す（往復経路で帰り側に吸着しない）。近くで外れたら全体（トンネル等で fix が飛んだ） */
function nearestAhead(route: RouteModel, s: number, fix: Fix): ReturnType<typeof nearest> {
  const local = nearest(route, fix, { from: s - OFF_ROUTE, to: s + SEARCH_AHEAD });
  return local.distanceToRoute <= OFF_ROUTE ? local : nearest(route, fix);
}

/** 経路外れ。移動中の fix だけ数える（停車中は出発前・途中停車でリルートが連発するため） */
function offRoute(state: NavigationState, fix: Fix): StepResult {
  const next = { ...state };

  if (!state.lastFix) next.lastFix = fix;
  else if (haversine(state.lastFix, fix) >= MIN_MOVE) {
    next.offRouteCount = state.offRouteCount + 1;
    next.heading = bearing(state.lastFix, fix);
    next.lastFix = fix;
  }

  const events: NavigationEvent[] = [];
  if (next.offRouteCount >= REROUTE_COUNT && !state.rerouting) {
    next.rerouting = true;
    events.push({ type: "reroute" });
  }

  return { state: next, events };
}

/** 進捗（単調増加）を反映した新 state。入力 state は変異させない */
function advance(
  route: RouteModel,
  state: NavigationState,
  fix: Fix,
  near: ReturnType<typeof nearest>,
): NavigationState {
  const advanced = near.s >= state.s;
  const segmentIndex = advanced ? near.segmentIndex : state.segmentIndex;

  return {
    ...state,
    s: advanced ? near.s : state.s,
    segmentIndex,
    heading: segmentBearing(route, segmentIndex),
    lastFix: fix,
    offRouteCount: 0,
    announced: new Set(state.announced),
  };
}

/** 経由地通過（1 fix で複数越えたら全部 viaPassed、発話は 1 回） */
function passVias(route: RouteModel, state: NavigationState, events: NavigationEvent[]): void {
  const before = state.passedVia;

  while (
    state.passedVia < route.viaIndices.length &&
    state.s >= route.cumulativeDistances[route.viaIndices[state.passedVia]!]!
  ) {
    events.push({ type: "viaPassed", index: state.passedVia });
    state.passedVia++;
  }

  if (state.passedVia > before) events.push({ type: "speak", text: "経由地を通過しました" });
}

function guide(route: RouteModel, state: NavigationState, events: NavigationEvent[]): void {
  const { cumulativeDistances, instructions } = route;
  const { s, announced } = state;
  const index = nextInstruction(route, s);

  if (index < 0) {
    events.push({
      type: "hud",
      instruction: null,
      remaining: cumulativeDistances.at(-1)! - s,
      next: null,
    });
    return;
  }

  const instruction = instructions[index]!;
  const remaining = cumulativeDistances[instruction.from]! - s;
  const nearKey = `instruction:${index}:near`;
  const farKey = `instruction:${index}:far`;

  if (remaining <= ANNOUNCE_NEAR && !announced.has(nearKey)) {
    announced.add(nearKey).add(farKey);
    events.push({ type: "speak", text: `まもなく${signWord(instruction)}です` });
  } else if (remaining <= ANNOUNCE_FAR && !announced.has(farKey)) {
    announced.add(farKey);

    // 前の案内地点が予告距離より近ければ予告は省く（直前案内と連続する）
    const previous = instructions.slice(0, index).findLast(isGuidePoint);
    const gap =
      cumulativeDistances[instruction.from]! - (previous ? cumulativeDistances[previous.from]! : 0);

    if (gap >= ANNOUNCE_FAR) {
      events.push({
        type: "speak",
        text: `${ANNOUNCE_FAR} メートル先、${signWord(instruction)}です`,
      });
    }
  }

  events.push({ type: "hud", instruction: instruction, remaining, next: nextNext(route, index) });
}

function nextNext(route: RouteModel, index: number): NextNext | null {
  const { cumulativeDistances, instructions } = route;
  const following = instructions.find(
    (candidate, candidateIndex) => candidateIndex > index && isGuidePoint(candidate),
  );
  if (!following) return null;

  const distance =
    cumulativeDistances[following.from]! - cumulativeDistances[instructions[index]!.from]!;
  return distance <= NEXT_NEXT_MAX ? { instruction: following, distance } : null;
}

function warnNarrow(
  route: RouteModel,
  narrow: NarrowSegment[],
  state: NavigationState,
  events: NavigationEvent[],
): void {
  const { cumulativeDistances } = route;
  const { s, announced } = state;
  let current: NarrowSegment | null = null;

  narrow.forEach((segment, j) => {
    const ahead = cumulativeDistances[segment.from]! - s;
    const key = `narrow:${j}`;

    if (ahead > 0 && ahead <= NARROW_WARN && !segment.atStart && !announced.has(key)) {
      announced.add(key);
      events.push({
        type: "speak",
        text: segment.atEnd ? "この先細い道、目的地付近です" : "この先、細い道です",
      });
    }

    if (cumulativeDistances[segment.from]! <= s && s < cumulativeDistances[segment.to]!)
      current = segment;
  });

  events.push({ type: "narrow", segment: current });
}

/** 残り時間 ms。現在位置が乗る指示の残り比例分 + 以降の指示の time 合計 */
export function remainingTime(route: RouteModel, s: number): number {
  const { cumulativeDistances, instructions } = route;
  const index = instructions.findIndex(
    (instruction) =>
      cumulativeDistances[instruction.from]! <= s && s < cumulativeDistances[instruction.to]!,
  );
  if (index < 0) return 0;

  const instruction = instructions[index]!;
  let time = instruction.time - timeWithin(cumulativeDistances, instruction, s);
  for (let i = index + 1; i < instructions.length; i++) time += instructions[i]!.time;
  return time;
}

/** 「この先 1.2 キロ、右方向です」 */
export function startText(route: RouteModel, s: number): string {
  const index = nextInstruction(route, s);
  if (index < 0) return "この先、目的地です";

  const instruction = route.instructions[index]!;
  const remaining = route.cumulativeDistances[instruction.from]! - s;
  if (remaining <= ANNOUNCE_NEAR) return ""; // 同じ step の直前案内「まもなく〜です」が続く
  return `この先 ${formatSpokenDistance(remaining)}、${signWord(instruction)}です`;
}

export function offsetOrigin(fix: Fix, heading: number | null): LatLng {
  const point = { lat: fix.lat, lng: fix.lng };
  return heading == null ? point : destination(point, heading, REROUTE_OFFSET);
}
