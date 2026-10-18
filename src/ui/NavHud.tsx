import * as stylex from "@stylexjs/stylex";
import { formatDistance } from "../model/format.ts";
import type { Instruction } from "../model/route.ts";
import { DirectionIcon } from "./icons.tsx";
import { colors } from "./tokens.stylex.ts";

/** HUD 本体の高さ（px、バナー除く）。Toast.tsx のナビ時 top と揃える */
const HUD_HEIGHT = 88;

const styles = stylex.create({
  hud: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: "env(safe-area-inset-top)",
    zIndex: 5,
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  },
  main: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    height: HUD_HEIGHT,
    padding: "0 16px",
    backgroundColor: colors.bg,
    color: colors.fg,
  },
  icon: { flexShrink: 0, color: colors.accent, display: "flex" },
  col: { minWidth: 0, display: "flex", flexDirection: "column" },
  dist: { fontSize: 32, fontWeight: 700, lineHeight: "36px" },
  name: {
    fontSize: 16,
    opacity: 0.8,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  banner: { padding: "8px 16px", fontSize: 15, fontWeight: 600, textAlign: "center" },
  narrow: { backgroundColor: colors.narrow, color: "#fff" },
  reroute: { backgroundColor: colors.surface, color: colors.fg },
});

type NavHudProps = {
  instruction: Instruction | null; // null = 案内地点が残っていない → 「目的地まで」
  remaining: number; // m
  inNarrow: boolean;
  rerouting: boolean;
};

export function NavHud({ instruction, remaining, inNarrow, rerouting }: NavHudProps) {
  return (
    <div {...stylex.props(styles.hud)}>
      <div {...stylex.props(styles.main)}>
        <span {...stylex.props(styles.icon)}>
          <DirectionIcon sign={instruction?.sign ?? 4} size={56} />
        </span>
        <div {...stylex.props(styles.col)}>
          <span {...stylex.props(styles.dist)}>{formatDistance(remaining)}</span>
          {instruction ? (
            instruction.streetName && (
              <span {...stylex.props(styles.name)}>{instruction.streetName}</span>
            )
          ) : (
            <span {...stylex.props(styles.name)}>目的地まで</span>
          )}
        </div>
      </div>
      {inNarrow && <div {...stylex.props(styles.banner, styles.narrow)}>細い道を走行中</div>}
      {rerouting && <div {...stylex.props(styles.banner, styles.reroute)}>再探索中…</div>}
    </div>
  );
}
