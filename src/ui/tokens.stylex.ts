import * as stylex from "@stylexjs/stylex";

const DARK = "@media (prefers-color-scheme: dark)";

export const colors = stylex.defineVars({
  bg: { default: "#ffffff", [DARK]: "#121212" },
  fg: { default: "#1a1a1a", [DARK]: "#e8e8e8" },
  surface: { default: "#f4f4f4", [DARK]: "#1e1e1e" },
  border: { default: "#d0d0d0", [DARK]: "#3a3a3a" },
  accent: { default: "#1a73e8", [DARK]: "#8ab4f8" },
  narrow: { default: "#e8710a", [DARK]: "#f5a04a" },
  danger: { default: "#d93025", [DARK]: "#f28b82" },
});

/** 地点マーカーと地点リストで共有する役割色。ライト / ダーク共通 */
export const marker = stylex.defineConsts({ from: "#188038", to: "#d93025", via: "#1a73e8" });
