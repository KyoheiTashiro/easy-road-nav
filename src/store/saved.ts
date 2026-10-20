import { create } from "zustand";
import type { SavedPoint } from "@/model/point.ts";

/** 検索履歴件数（docs/CONTEXT.md） */
export const HISTORY_MAX = 5;
const HOME_KEY = "home";
const HISTORY_KEY = "history";

function valid(x: unknown): x is SavedPoint {
  if (typeof x !== "object" || x === null) return false;
  const { lat, lng, label } = x as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    typeof label === "string"
  );
}

// 壊れた JSON・localStorage 不可は null / 無視（例外を投げない）
function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // 保存できなくても動作は続ける
  }
}

function loadHome(): SavedPoint | null {
  const v = read(HOME_KEY);
  return valid(v) ? { lat: v.lat, lng: v.lng, label: v.label } : null;
}

function loadHistory(): SavedPoint[] {
  const v = read(HISTORY_KEY);
  return Array.isArray(v) ? v.filter(valid).slice(0, HISTORY_MAX) : [];
}

/** 同座標を除いて先頭に追加、HISTORY_MAX 件に切る（純関数） */
export function pushHistory(list: SavedPoint[], p: SavedPoint): SavedPoint[] {
  return [p, ...list.filter((x) => x.lat !== p.lat || x.lng !== p.lng)].slice(0, HISTORY_MAX);
}

type SavedState = { home: SavedPoint | null; history: SavedPoint[] };

// 自宅・検索履歴。localStorage が正で store はその写し（URL には入れない）
const useStore = create<SavedState>(() => ({ home: loadHome(), history: loadHistory() }));

export function useSaved<T>(selector: (s: SavedState) => T): T {
  return useStore(selector);
}
export const getSaved = useStore.getState;

export const savedActions = {
  homeSaved(p: SavedPoint): void {
    write(HOME_KEY, p);
    useStore.setState({ home: p });
  },
  historyPushed(p: SavedPoint): void {
    const history = pushHistory(useStore.getState().history, p);
    write(HISTORY_KEY, history);
    useStore.setState({ history });
  },
};
