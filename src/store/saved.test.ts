import { describe, expect, it } from "vitest";
import { HISTORY_MAX, pushHistory } from "./saved.ts";

const pt = (n: number, label = `p${n}`) => ({ lat: n, lng: n, label });

describe("pushHistory", () => {
  it("先頭に追加", () => {
    expect(pushHistory([pt(1)], pt(2))).toEqual([pt(2), pt(1)]);
  });
  it("同座標は 1 件にまとめ、最新の位置へ", () => {
    expect(pushHistory([pt(1), pt(2), pt(3)], pt(2, "renamed"))).toEqual([
      pt(2, "renamed"),
      pt(1),
      pt(3),
    ]);
  });
  it("HISTORY_MAX 件で古いものから消える", () => {
    const list = Array.from({ length: HISTORY_MAX }, (_, i) => pt(i));
    const next = pushHistory(list, pt(99));
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0]).toEqual(pt(99));
    expect(next.at(-1)).toEqual(pt(HISTORY_MAX - 2));
  });
});
