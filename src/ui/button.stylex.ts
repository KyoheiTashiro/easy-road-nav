import * as stylex from "@stylexjs/stylex";
import { colors } from "@/ui/tokens.stylex.ts";

export const button = stylex.create({
  base: {
    height: 44,
    padding: "0 12px",
    fontSize: 14,
    whiteSpace: "nowrap",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.fg,
    cursor: "pointer",
    ":disabled": { opacity: 0.4, cursor: "default" },
  },
  primary: { borderWidth: 0, backgroundColor: colors.accent, color: "#fff", fontWeight: 600 },
  danger: { color: colors.danger },
  active: { color: colors.accent, borderColor: colors.accent },
  icon: { width: 36, height: 36, padding: 0, flexShrink: 0 },
  ghost: {
    height: "auto",
    width: "100%",
    display: "block",
    padding: "10px 12px",
    textAlign: "left",
    whiteSpace: "normal",
    borderWidth: 0,
    backgroundColor: "transparent",
  },
});
