import * as stylex from "@stylexjs/stylex";
import { formatDistance } from "@/model/format.ts";
import { signWord } from "@/model/progress.ts";
import { useNav } from "@/store/nav.ts";
import { selectRoute, useTrip } from "@/store/trip.ts";
import { DirectionIcon } from "@/ui/icons.tsx";
import { colors } from "@/ui/tokens.stylex.ts";

/** HUD 本体・次の次行の高さ（px、バナー除く）。合計を Toast.tsx のナビ時 top と揃える */
const HUD_HEIGHT = 88;
const NEXT_HEIGHT = 32;

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
  next: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: NEXT_HEIGHT,
    padding: "0 16px",
    fontSize: 14,
    backgroundColor: colors.surface,
    color: colors.fg,
    opacity: 0.85,
  },
  banner: { padding: "8px 16px", fontSize: 15, fontWeight: 600, textAlign: "center" },
  narrow: { backgroundColor: colors.narrow, color: "#fff" },
  reroute: { backgroundColor: colors.surface, color: colors.fg },
});

export function NavHud() {
  const nav = useNav((s) => s.nav);
  const hud = useNav((s) => s.hud);
  const inNarrow = useNav((s) => s.inNarrow);
  const route = useTrip(selectRoute);
  if (!nav || !route) return null;
  const instruction = hud?.instruction ?? null; // null = 案内地点が残っていない → 「目的地まで」
  const remaining = hud?.remaining ?? route.distance - nav.s; // 初回 hud event 前は経路末尾まで
  const next = hud?.next ?? null; // 次の次。null なら行は空のまま（高さ固定）
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
      <div {...stylex.props(styles.next)}>
        {next && (
          <>
            <span>その先</span>
            <DirectionIcon sign={next.instruction.sign} size={20} />
            <span>
              {formatDistance(next.distance)} {signWord(next.instruction)}
            </span>
          </>
        )}
      </div>
      {inNarrow && <div {...stylex.props(styles.banner, styles.narrow)}>細い道を走行中</div>}
      {nav.rerouting && <div {...stylex.props(styles.banner, styles.reroute)}>再探索中…</div>}
    </div>
  );
}
