import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORY_MAX, pushHistory } from "@/store/saved.ts";

const point = (index: number, label = `p${index}`) => ({ lat: index, lng: index, label });

describe("pushHistory", () => {
  it("先頭に追加", () => {
    expect(pushHistory([point(1)], point(2))).toEqual([point(2), point(1)]);
  });
  it("同座標は 1 件にまとめ、最新の位置へ", () => {
    expect(pushHistory([point(1), point(2), point(3)], point(2, "renamed"))).toEqual([
      point(2, "renamed"),
      point(1),
      point(3),
    ]);
  });
  it("HISTORY_MAX 件で古いものから消える", () => {
    const list = Array.from({ length: HISTORY_MAX }, (_, i) => point(i));
    const next = pushHistory(list, point(99));
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0]).toEqual(point(99));
    expect(next.at(-1)).toEqual(point(HISTORY_MAX - 2));
  });
});

// store はモジュール評価時に localStorage を読むので、スタブしてから import し直す
describe("iconOnly", () => {
  const load = async (stored: Record<string, string>) => {
    vi.resetModules();
    const store = { ...stored };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    const savedModule = await import("@/store/saved.ts");
    return { ...savedModule, store };
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
