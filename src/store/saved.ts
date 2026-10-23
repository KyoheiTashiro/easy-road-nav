import { create } from "zustand";
import type { SavedPoint } from "@/model/point.ts";
import { HISTORY_MAX } from "@/model/tuning.ts";

const HOME_KEY = "home";
const HISTORY_KEY = "history";
const ICON_ONLY_KEY = "iconOnly";

function valid(value: unknown): value is SavedPoint {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng, label } = value as Record<string, unknown>;
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
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても動作は続ける
  }
}

function loadHome(): SavedPoint | null {
  const value = read(HOME_KEY);
  return valid(value) ? { lat: value.lat, lng: value.lng, label: value.label } : null;
}

function loadHistory(): SavedPoint[] {
  const value = read(HISTORY_KEY);
  return Array.isArray(value) ? value.filter(valid).slice(0, HISTORY_MAX) : [];
}

export function pushHistory(list: SavedPoint[], point: SavedPoint): SavedPoint[] {
  return [
    point,
    ...list.filter((saved) => saved.lat !== point.lat || saved.lng !== point.lng),
  ].slice(0, HISTORY_MAX);
}

type SavedState = { home: SavedPoint | null; history: SavedPoint[]; iconOnly: boolean };

// 自宅・検索履歴・アイコンのみ表示。localStorage が正で store はその写し（URL には入れない）
const useStore = create<SavedState>(() => ({
  home: loadHome(),
  history: loadHistory(),
  iconOnly: read(ICON_ONLY_KEY) === true,
}));

export function useSaved<T>(selector: (state: SavedState) => T): T {
  return useStore(selector);
}

export const getSaved = useStore.getState;

export const savedActions = {
  homeSaved(point: SavedPoint): void {
    write(HOME_KEY, point);
    useStore.setState({ home: point });
  },
  historyPushed(point: SavedPoint): void {
    const history = pushHistory(useStore.getState().history, point);
    write(HISTORY_KEY, history);
    useStore.setState({ history });
  },
  iconOnlyToggled(iconOnly: boolean): void {
    write(ICON_ONLY_KEY, iconOnly);
    useStore.setState({ iconOnly });
  },
};
