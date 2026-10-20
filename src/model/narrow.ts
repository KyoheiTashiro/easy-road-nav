import { ROAD_KIND, type Instruction, type RouteModel } from "@/model/route.ts";

export type NarrowSegment = {
  from: number;
  to: number; // 頂点 index 範囲
  length: number; // m
  atStart: boolean; // from === 0（出発地に接する → 警告しない）
  atEnd: boolean; // to === n − 1（到着地に接する → 「目的地付近」）
};

/** 結合（間の広い道 < mergeBelow）→ 短区間無視（length < ignoreBelow）の順 */
export function narrowSegments(
  route: RouteModel,
  ignoreBelow = 30,
  mergeBelow = 50,
): NarrowSegment[] {
  const { cum } = route;
  const n = route.points.length;
  const merged: { from: number; to: number }[] = [];
  for (const seg of route.roadClass) {
    if (seg.kind === ROAD_KIND.WIDE) continue;
    const last = merged.at(-1);
    if (last && cum[seg.from]! - cum[last.to]! < mergeBelow) last.to = seg.to;
    else merged.push({ from: seg.from, to: seg.to });
  }
  return merged
    .map((s) => ({
      ...s,
      length: cum[s.to]! - cum[s.from]!,
      atStart: s.from === 0,
      atEnd: s.to === n - 1,
    }))
    .filter((s) => s.length >= ignoreBelow);
}

/** 指示の interval 内で細い道区間が始まるか（StepList の「⚠ 細い道」） */
export function entersNarrow(instr: Instruction, segs: NarrowSegment[]): boolean {
  return segs.some((s) => instr.from <= s.from && s.from < instr.to);
}
