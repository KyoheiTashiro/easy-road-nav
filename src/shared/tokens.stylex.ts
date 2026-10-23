import * as stylex from "@stylexjs/stylex";

const DARK = "@media (prefers-color-scheme: dark)";

export const colors = stylex.defineVars({
  background: { default: "#ffffff", [DARK]: "#121212" },
  foreground: { default: "#1a1a1a", [DARK]: "#e8e8e8" },
  surface: { default: "#f4f4f4", [DARK]: "#1e1e1e" },
  border: { default: "#d0d0d0", [DARK]: "#3a3a3a" },
  accent: { default: "#1a73e8", [DARK]: "#8ab4f8" },
  accentBackground: { default: "#e8f0fe", [DARK]: "#1f3a5f" },
  narrow: { default: "#e8710a", [DARK]: "#f5a04a" },
  narrowBackground: { default: "#fdf0e3", [DARK]: "#3a2a16" },
  ok: { default: "#188038", [DARK]: "#81c995" },
  danger: { default: "#d93025", [DARK]: "#f28b82" },
});

/** ライト / ダーク共通の色。onAccent = 色付き背景の上の文字、popupForeground = MapLibre ポップアップ（ダークでも白地）の文字 */
export const fixedColors = stylex.defineConsts({ onAccent: "#fff", popupForeground: "#1a1a1a" });

export const shadows = stylex.defineConsts({
  card: "0 1px 4px rgba(0,0,0,0.2)", // 地図上のカード・丸ボタン
  marker: "0 1px 4px rgba(0,0,0,0.4)", // 地図マーカー
  float: "0 2px 8px rgba(0,0,0,0.25)", // 上部パネル・候補リスト・トースト
  up: "0 -2px 8px rgba(0,0,0,0.25)", // 下部パネル（影を上に落とす）
});

/** 地点マーカーと地点リストで共有する役割色。ライト / ダーク共通 */
export const marker = stylex.defineConsts({ from: "#188038", to: "#d93025", via: "#1a73e8" });
