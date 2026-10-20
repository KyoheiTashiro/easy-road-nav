// ナビ純ロジック。処理順は docs/design/nav.md、境界条件は docs/design/modules.md。調整値は docs/CONTEXT.md
import { formatSpokenDistance } from "@/model/format.ts";
import { bearing, destination, haversine } from "@/model/geo.ts";
import type { NarrowSegment } from "@/model/narrow.ts";
import {
  nearest,
  segmentBearing,
  type Fix,
  type Instruction,
  type LatLng,
  type RouteModel,
} from "@/model/route.ts";

const ACCURACY_MAX = 50; // 進捗採用精度
const OFF_ROUTE = 50; // 経路外れ距離
const REROUTE_COUNT = 3; // リルート連続回数
const REROUTE_OFFSET = 30; // リルート前方オフセット
const ARRIVE = 30; // 到着判定
const ANNOUNCE_FAR = 300; // 案内トリガー距離（予告）
const ANNOUNCE_NEAR = 50; // 案内トリガー距離（直前）
const NARROW_WARN = 300; // 細い道警告距離
const MIN_MOVE = 5; // 方位算出最小移動
const NEXT_NEXT_MAX = 1000; // 次の次表示上限

export type NavState = {
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

export type NavEvent =
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

export function initNav(zoom: number, follow = true): NavState {
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

/** sign → 発話の語（nav.md テンプレ） */
export function signWord(ins: Instruction): string {
  switch (ins.sign) {
    case -8:
    case 8:
    case -98:
      return "U ターン";
    case -7:
      return "左寄り";
    case 7:
      return "右寄り";
    case -3:
    case -2:
      return "左方向";
    case -1:
      return "斜め左";
    case 1:
      return "斜め右";
    case 2:
    case 3:
      return "右方向";
    case 6:
      return `ラウンドアバウト ${ins.exitNumber ?? 1} 番目の出口`;
    case 5:
      return "経由地";
    case 4:
      return "目的地";
    default:
      return "直進";
  }
}

/** s より先にある最初の案内地点（sign != 0）の index。無ければ -1 */
function nextInstruction(route: RouteModel, s: number): number {
  return route.instructions.findIndex((i) => i.sign !== 0 && route.cum[i.from]! > s);
}

export function step(
  route: RouteModel,
  narrow: NarrowSegment[],
  state: NavState,
  fix: Fix,
): { state: NavState; events: NavEvent[] } {
  const events: NavEvent[] = [];
  if (fix.accuracy >= ACCURACY_MAX) return { state: { ...state }, events };

  const { cum } = route;
  const end = cum[cum.length - 1]!;
  const near = nearest(route, fix);

  // 経路外れ。移動中の fix だけ数える（停車中は出発前・途中停車でリルートが連発するため）
  if (near.distanceToRoute > OFF_ROUTE) {
    const next = { ...state };
    if (!state.lastFix) next.lastFix = fix;
    else if (haversine(state.lastFix, fix) >= MIN_MOVE) {
      next.offRouteCount = state.offRouteCount + 1;
      next.heading = bearing(state.lastFix, fix);
      next.lastFix = fix;
    }
    if (next.offRouteCount >= REROUTE_COUNT && !state.rerouting) {
      next.rerouting = true;
      events.push({ type: "reroute" });
    }
    return { state: next, events };
  }

  // 進捗（単調増加）
  const advanced = near.s >= state.s;
  const s = advanced ? near.s : state.s;
  const segmentIndex = advanced ? near.segmentIndex : state.segmentIndex;
  const next: NavState = {
    ...state,
    s,
    segmentIndex,
    heading: segmentBearing(route, segmentIndex),
    lastFix: fix,
    offRouteCount: 0,
    announced: new Set(state.announced), // 入力 state を変異させない
  };
  const { announced } = next;

  // 経由地通過（1 fix で複数越えたら全部 viaPassed、発話は 1 回）
  let viaPassed = false;
  while (next.passedVia < route.viaIndices.length && s >= cum[route.viaIndices[next.passedVia]!]!) {
    events.push({ type: "viaPassed", index: next.passedVia });
    next.passedVia++;
    viaPassed = true;
  }
  if (viaPassed) events.push({ type: "speak", text: "経由地を通過しました" });

  // 到着
  if (end - s < ARRIVE) {
    events.push({ type: "speak", text: "目的地に到着しました" }, { type: "arrived" });
    return { state: next, events };
  }

  // 次の案内地点
  const idx = nextInstruction(route, s);
  if (idx < 0) {
    events.push({ type: "hud", instruction: null, remaining: end - s, next: null });
  } else {
    const ins = route.instructions[idx]!;
    const r = cum[ins.from]! - s;
    const near50 = `instr:${idx}:${ANNOUNCE_NEAR}`;
    const far300 = `instr:${idx}:${ANNOUNCE_FAR}`;
    if (r <= ANNOUNCE_NEAR && !announced.has(near50)) {
      announced.add(near50).add(far300);
      events.push({ type: "speak", text: `まもなく${signWord(ins)}です` });
    } else if (r <= ANNOUNCE_FAR && !announced.has(far300)) {
      announced.add(far300);
      const prev = route.instructions.slice(0, idx).findLast((i) => i.sign !== 0);
      const gap = cum[ins.from]! - (prev ? cum[prev.from]! : 0);
      if (gap >= ANNOUNCE_FAR) {
        events.push({ type: "speak", text: `${ANNOUNCE_FAR} メートル先、${signWord(ins)}です` });
      }
    }
    const nn = route.instructions.find((i, k) => k > idx && i.sign !== 0);
    const nd = nn ? cum[nn.from]! - cum[ins.from]! : Infinity;
    const next = nn && nd <= NEXT_NEXT_MAX ? { instruction: nn, distance: nd } : null;
    events.push({ type: "hud", instruction: ins, remaining: r, next });
  }

  // 細い道
  let current: NarrowSegment | null = null;
  narrow.forEach((seg, j) => {
    const d = cum[seg.from]! - s;
    const key = `narrow:${j}`;
    if (d > 0 && d <= NARROW_WARN && !seg.atStart && !announced.has(key)) {
      announced.add(key);
      events.push({
        type: "speak",
        text: seg.atEnd ? "この先細い道、目的地付近です" : "この先、細い道です",
      });
    }
    if (cum[seg.from]! <= s && s < cum[seg.to]!) current = seg;
  });
  events.push({ type: "narrow", segment: current });

  return { state: next, events };
}

/** 残り時間 ms。現在位置が乗る指示の残り比例分 + 以降の指示の time 合計 */
export function remainingTime(route: RouteModel, s: number): number {
  const { cum, instructions } = route;
  const k = instructions.findIndex((i) => cum[i.from]! <= s && s < cum[i.to]!);
  if (k < 0) return 0;
  const ins = instructions[k]!;
  const len = cum[ins.to]! - cum[ins.from]!;
  let t = len > 0 ? (ins.time * (cum[ins.to]! - s)) / len : 0;
  for (let i = k + 1; i < instructions.length; i++) t += instructions[i]!.time;
  return t;
}

/** 「この先 1.2 キロ、右方向です」 */
export function startText(route: RouteModel, s: number): string {
  const idx = nextInstruction(route, s);
  if (idx < 0) return "この先、目的地です";
  const ins = route.instructions[idx]!;
  return `この先 ${formatSpokenDistance(route.cum[ins.from]! - s)}、${signWord(ins)}です`;
}

export function offsetOrigin(fix: Fix, heading: number | null): LatLng {
  const p = { lat: fix.lat, lng: fix.lng };
  return heading == null ? p : destination(p, heading, REROUTE_OFFSET);
}
