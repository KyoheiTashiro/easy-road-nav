import * as stylex from "@stylexjs/stylex";
import { formatDistance } from "@/model/format.ts";
import { signWord } from "@/model/progress.ts";
import { SIGN } from "@/model/route.ts";
import { useNavigation } from "@/store/navigation.ts";
import { selectRoute, useTrip } from "@/store/trip.ts";
import { DirectionIcon, NarrowIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors, shadows, fixedColors } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  hud: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: "env(safe-area-inset-top)",
    zIndex: 5,
    boxShadow: shadows.float,
  },
  main: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    height: `${layout.hud}px`,
    paddingBlock: 0,
    paddingInline: 16,
    backgroundColor: colors.background,
    color: colors.foreground,
  },
  icon: { flexShrink: 0, color: colors.accent, display: "flex" },
  column: { minWidth: 0, display: "flex", flexDirection: "column" },
  distance: { fontSize: 32, fontWeight: 700, lineHeight: "36px" },
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
    height: `${layout.next}px`,
    paddingBlock: 0,
    paddingInline: 16,
    fontSize: 18,
    backgroundColor: colors.background,
    color: colors.foreground,
    opacity: 0.85,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBlock: 8,
    paddingInline: 16,
    fontSize: 15,
    fontWeight: 600,
  },
  narrow: { backgroundColor: colors.narrow, color: fixedColors.onAccent },
  reroute: { backgroundColor: colors.surface, color: colors.foreground },
});

export function NavigationHud() {
  const navigation = useNavigation((state) => state.navigation);
  const hud = useNavigation((state) => state.hud);
  const inNarrow = useNavigation((state) => state.inNarrow);
  const route = useTrip(selectRoute);
  if (!navigation || !route) return null;

  const instruction = hud?.instruction ?? null; // null = 案内地点が残っていない → 「目的地まで」
  const remaining = hud?.remaining ?? route.distance - navigation.s; // 初回 hud event 前は経路末尾まで
  const next = hud?.next ?? null; // 次の次。null なら行は空のまま（高さ固定）
  const name = instruction ? instruction.streetName : "目的地まで";

  return (
    <div {...stylex.props(styles.hud)}>
      <div {...stylex.props(styles.main)}>
        <span {...stylex.props(styles.icon)}>
          <DirectionIcon sign={instruction?.sign ?? SIGN.FINISH} size={56} />
        </span>
        <div {...stylex.props(styles.column)}>
          <span {...stylex.props(styles.distance)}>{formatDistance(remaining)}</span>
          {name && <span {...stylex.props(styles.name)}>{name}</span>}
        </div>
      </div>
      <div {...stylex.props(styles.next)}>
        {next && (
          <>
            <span>その先</span>
            <DirectionIcon sign={next.instruction.sign} size={24} />
            <span>
              {formatDistance(next.distance)} {signWord(next.instruction)}
            </span>
          </>
        )}
      </div>
      {inNarrow && (
        <div {...stylex.props(styles.banner, styles.narrow)}>
          <NarrowIcon size={20} />
          細い道を走行中
        </div>
      )}
      {navigation.rerouting && (
        <div {...stylex.props(styles.banner, styles.reroute)}>再探索中…</div>
      )}
    </div>
  );
}
