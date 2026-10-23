import { ROAD_KIND, type Instruction, type RouteModel } from "@/route/route.ts";

// 調整値（docs/CONTEXT.md「調整値」）
const NARROW_IGNORE_BELOW = 30; // 短区間無視 m
const NARROW_MERGE_BELOW = 50; // 区間結合 m

export type NarrowSegment = {
  from: number;
  to: number; // 頂点 index 範囲
  length: number; // m
  atStart: boolean; // from === 0（出発地に接する → 警告しない）
  atEnd: boolean; // to === 頂点数 − 1（到着地に接する → 「目的地付近」）
};

/** 結合（間の広い道 < mergeBelow）→ 短区間無視（length < ignoreBelow）の順 */
export function narrowSegments(
  route: RouteModel,
  ignoreBelow = NARROW_IGNORE_BELOW,
  mergeBelow = NARROW_MERGE_BELOW,
): NarrowSegment[] {
  const { cumulativeDistances } = route;
  const vertexCount = route.points.length;
  const merged: { from: number; to: number }[] = [];

  for (const range of route.roadClass) {
    if (range.kind === ROAD_KIND.WIDE) continue;

    const last = merged.at(-1);
    if (last && cumulativeDistances[range.from]! - cumulativeDistances[last.to]! < mergeBelow)
      last.to = range.to;
    else merged.push({ from: range.from, to: range.to });
  }

  return merged
    .map((segment) => ({
      ...segment,
      length: cumulativeDistances[segment.to]! - cumulativeDistances[segment.from]!,
      atStart: segment.from === 0,
      atEnd: segment.to === vertexCount - 1,
    }))
    .filter((segment) => segment.length >= ignoreBelow);
}

/** 指示の interval 内で細い道区間が始まるか */
export function entersNarrow(instruction: Instruction, segments: NarrowSegment[]): boolean {
  return segments.some(
    (segment) => instruction.from <= segment.from && segment.from < instruction.to,
  );
}
