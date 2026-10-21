import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORY_MAX, pushHistory } from "@/store/saved.ts";

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

// store はモジュール評価時に localStorage を読むので、スタブしてから import し直す
describe("iconOnly", () => {
  const load = async (stored: Record<string, string>) => {
    vi.resetModules();
    const store = { ...stored };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    const mod = await import("@/store/saved.ts");
    return { ...mod, store };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("未保存は false", async () => {
    const { getSaved } = await load({});
    expect(getSaved().iconOnly).toBe(false);
  });
  it("true だけ true。壊れた値は false", async () => {
    expect((await load({ iconOnly: "true" })).getSaved().iconOnly).toBe(true);
    expect((await load({ iconOnly: "{" })).getSaved().iconOnly).toBe(false);
    expect((await load({ iconOnly: '"yes"' })).getSaved().iconOnly).toBe(false);
  });
  it("iconOnlyToggled で保存", async () => {
    const { savedActions, getSaved, store } = await load({});
    savedActions.iconOnlyToggled(true);
    expect(getSaved().iconOnly).toBe(true);
    expect(store.iconOnly).toBe("true");
  });
});
